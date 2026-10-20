/**
 * Roles y membresías de la agencia, con el pool de la API y SIEMPRE bajo RLS.
 *
 * `describirInvitacion` usa el tenant de la petición (el de quien invita). `agregar` corre en el
 * flujo de aceptar, que no tiene sesión: el tenant sale de la invitación, que lo escribió el
 * servidor, y se fija con el mismo mecanismo (`conTenant`), de modo que RLS acota lo que se
 * escribe. El `tenantId` va también en cada predicado, como defensa en profundidad.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type DescripcionDeInvitacion,
  PuertoMiembros,
  type ResultadoDeAlta,
} from '../domain/puertos-de-miembros.js';

@Injectable()
export class MiembrosPrisma extends PuertoMiembros {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async describirInvitacion(rolId: string): Promise<DescripcionDeInvitacion | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const rol = await tx.rol.findFirst({
        where: { id: rolId, tenantId },
        select: { nombre: true, tenant: { select: { nombre: true } } },
      });
      return rol ? { rol: rol.nombre, agencia: rol.tenant.nombre } : null;
    });
  }

  async agregar(entrada: {
    tenantId: string;
    identidadId: string;
    rolId: string;
    correo: string;
    nombre: string;
  }): Promise<ResultadoDeAlta | 'rol_inexistente'> {
    const { tenantId, identidadId, rolId } = entrada;
    return ContextoTenant.ejecutarCon(
      {
        tenantId,
        usuarioId: null,
        identidadId,
        permisos: new Set(),
        trazaId: 'aceptar-invitacion',
      },
      () =>
        this.prisma.conTenant(async (tx) => {
          const rol = await tx.rol.findFirst({
            where: { id: rolId, tenantId },
            select: { id: true },
          });
          if (!rol) return 'rol_inexistente' as const;

          const actual = await tx.usuario.findFirst({
            where: { tenantId, identidadId },
            select: { id: true, activo: true, eliminadoEn: true, rolId: true },
          });
          if (!actual) {
            await tx.usuario.create({
              data: {
                tenantId,
                identidadId,
                rolId,
                correo: entrada.correo,
                nombre: entrada.nombre,
              },
            });
            return 'creado' as const;
          }

          const vigente = actual.activo && actual.eliminadoEn === null;
          await tx.usuario.update({
            where: { id: actual.id },
            data: { activo: true, eliminadoEn: null, rolId },
          });
          return vigente ? ('ya_era_miembro' as const) : ('reactivado' as const);
        }),
    );
  }
}
