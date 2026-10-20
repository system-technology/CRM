/**
 * Las sesiones, resueltas por Better Auth y revocadas por el pool de identidad.
 *
 * `obtener` NO lee la tabla a mano: delega en `auth.api.getSession`, que verifica la firma de la
 * cookie, busca la sesión por el hash del token (ver `adaptador-con-token-hasheado.ts`), comprueba
 * que no haya caducado y, si toca, la renueva. Con `cookieCache` desactivado, **cada llamada
 * lee la base**: una sesión borrada deja de valer en la petición siguiente.
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PuertoSesiones, type SesionVerificada } from '../domain/puertos.js';
import { AUTH } from './auth.provider.js';
import type { AuthDeViajaPro } from './crear-auth.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

/**
 * Lo que se espera de Better Auth. Se valida y no se confía en el tipo inferido: `tenantActivoId`
 * es un campo adicional nuestro, y si la forma cambiara en una actualización de la biblioteca
 * preferimos fallar aquí que conceder acceso por un campo que dejó de venir.
 */
const RespuestaDeSesion = z.object({
  session: z.object({
    id: z.string(),
    userId: z.string(),
    tenantActivoId: z.string().nullable().optional(),
  }),
  user: z.object({ id: z.string(), email: z.string(), name: z.string() }),
});

@Injectable()
export class SesionesBetterAuth extends PuertoSesiones {
  constructor(
    @Inject(AUTH) private readonly auth: AuthDeViajaPro,
    @Inject(PrismaIdentidadService) private readonly prisma: PrismaIdentidadService,
  ) {
    super();
  }

  async obtener(cookie: string | null): Promise<SesionVerificada | null> {
    if (!cookie) return null;

    const { headers, response } = await this.auth.api.getSession({
      headers: new Headers({ cookie }),
      returnHeaders: true,
    });
    if (!response) return null;

    const r = RespuestaDeSesion.parse(response);
    return {
      sesionId: r.session.id,
      identidad: { id: r.user.id, correo: r.user.email, nombre: r.user.name },
      tenantActivoId: r.session.tenantActivoId ?? null,
      cookies: headers.getSetCookie(),
    };
  }

  async revocar(sesionId: string): Promise<void> {
    await this.prisma.sesion.deleteMany({ where: { id: sesionId } });
  }

  async fijarTenantActivo(sesionId: string, tenantId: string): Promise<void> {
    await this.prisma.sesion.update({
      where: { id: sesionId },
      data: { tenantActivoId: tenantId },
    });
  }
}
