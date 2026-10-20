/**
 * Las invitaciones, guardadas en `verificaciones` (la tabla de Better Auth para valores de un solo
 * uso previos a la sesión) con el pool de identidad. **No hay tabla de invitaciones.**
 *
 * **Por qué cabe, y es correcto:**
 *   · `verificaciones` ya es de un solo uso, con `expira_en`, global y solo de `viajapro_identidad`:
 *     justo la superficie que necesita una invitación, que existe ANTES de que la persona tenga
 *     sesión o membresía.
 *   · El token no está en la tabla: el `identificador` es `invitacion:<sha256(token)>`. Quien la
 *     lea no puede aceptar nada.
 *   · El `valor` lleva el tenant, el rol y el correo, escritos por el servidor DESPUÉS de comprobar
 *     bajo RLS que quien invita tiene el permiso y que el rol es de su agencia. Al aceptar, el
 *     tenant sale de aquí, nunca del cliente, y la pertenencia se crea bajo RLS con ese tenant.
 *   · La tabla no es de ninguna agencia, así que ninguna puede leerla: el rol de la API no tiene
 *     ningún privilegio sobre ella.
 *
 * **Lo que NO da, y se dice:** listar o revocar las invitaciones pendientes de una agencia. Eso pide
 * una tabla por tenant (con RLS), y es de la tarea de administración de miembros, no de esta.
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { DatosDeInvitacion } from '../domain/invitacion.js';
import { PuertoInvitaciones } from '../domain/puertos-de-miembros.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

const PREFIJO = 'invitacion:';

const Valor = z.object({
  tenantId: z.string().uuid(),
  correo: z.string().email(),
  rolId: z.string().uuid(),
  invitadoPorUsuarioId: z.string().uuid().nullable(),
});

@Injectable()
export class InvitacionesPrisma extends PuertoInvitaciones {
  constructor(@Inject(PrismaIdentidadService) private readonly prisma: PrismaIdentidadService) {
    super();
  }

  async guardar(hashDelToken: string, datos: DatosDeInvitacion, expiraEn: Date): Promise<void> {
    await this.prisma.verificacion.create({
      data: {
        identificador: PREFIJO + hashDelToken,
        valor: JSON.stringify(datos),
        expiraEn,
      },
    });
  }

  async consumir(hashDelToken: string): Promise<DatosDeInvitacion | null> {
    const fila = await this.prisma.verificacion.findFirst({
      where: { identificador: PREFIJO + hashDelToken },
    });
    if (!fila) return null;

    // `deleteMany` por id devuelve cuántas filas borró: solo una de dos llamadas simultáneas
    // obtiene 1, y esa es la que consume la invitación.
    const { count } = await this.prisma.verificacion.deleteMany({ where: { id: fila.id } });
    if (count !== 1) return null;
    if (fila.expiraEn.getTime() <= Date.now()) return null;

    const valor = Valor.safeParse(JSON.parse(fila.valor));
    return valor.success ? valor.data : null;
  }
}
