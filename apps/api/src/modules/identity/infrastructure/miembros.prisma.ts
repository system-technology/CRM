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
import { permisoQueFalta } from '../domain/permisos-incluidos.js';
import { PuertoConversacionesDeMiembro } from '../../../shared/puertos/puertos-hacia-inbox.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type DescripcionDeInvitacion,
  PuertoMiembros,
  type ResultadoDeAlta,
  type ResultadoDeBaja,
} from '../domain/puertos-de-miembros.js';

@Injectable()
export class MiembrosPrisma extends PuertoMiembros {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoConversacionesDeMiembro)
    private readonly conversaciones: PuertoConversacionesDeMiembro,
  ) {
    super();
  }

  async describirInvitacion(rolId: string): Promise<DescripcionDeInvitacion | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const rol = await tx.rol.findFirst({
        where: { id: rolId, tenantId },
        select: { nombre: true, permisos: true, tenant: { select: { nombre: true } } },
      });
      return rol ? { rol: rol.nombre, agencia: rol.tenant.nombre, permisos: rol.permisos } : null;
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

          // Un miembro vigente NO cambia de rol por aceptar una invitación: sería la puerta para
          // que quien puede invitar se auto-asigne un rol superior. Se ignora (no se rechaza,
          // porque rechazar delataría que ya era miembro). Subir o bajar de rol es de
          // `roles.administrar`, no de una invitación.
          if (actual.activo && actual.eliminadoEn === null) return 'ya_era_miembro' as const;

          // De baja: la invitación lo readmite con el rol que le dio quien invitó (que no pudo
          // repartir más permisos de los que tenía).
          await tx.usuario.update({
            where: { id: actual.id },
            data: { activo: true, eliminadoEn: null, rolId },
          });
          return 'reactivado' as const;
        }),
    );
  }

  async darDeBaja(
    usuarioId: string,
    permisosDeQuienLaDa: ReadonlySet<string>,
  ): Promise<ResultadoDeBaja> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const u = await tx.usuario.findFirst({
        where: { id: usuarioId, tenantId },
        select: {
          id: true,
          activo: true,
          eliminadoEn: true,
          rol: { select: { clave: true, permisos: true } },
        },
      });
      if (!u) return 'no_encontrado' as const;

      const yaDeBaja = !u.activo || u.eliminadoEn !== null;
      if (!yaDeBaja) {
        // Nadie da de baja a quien tiene más permisos que él: sin esto, un rol personalizado con
        // `usuarios.administrar` apagaría al dueño.
        const falta = permisoQueFalta(u.rol.permisos, permisosDeQuienLaDa);
        if (falta !== undefined) return { faltaPermiso: falta };
        // La agencia nunca se queda sin un Dueño activo, ni siquiera por mano de otro dueño.
        if (u.rol.clave === 'DUENO') {
          const otros = await tx.usuario.count({
            where: {
              tenantId,
              id: { not: u.id },
              activo: true,
              eliminadoEn: null,
              rol: { clave: 'DUENO' },
            },
          });
          if (otros === 0) return 'ultimo_dueno' as const;
        }
      }
      if (!yaDeBaja) {
        await tx.usuario.update({
          where: { id: u.id },
          data: { activo: false, eliminadoEn: new Date() },
        });
      }
      // Aunque ya estuviera de baja: si una baja anterior quedó a medias, esto la completa.
      await this.conversaciones.soltarLasDe(tx, tenantId, u.id);

      if (!yaDeBaja) {
        // Mismo evento que cierra los sockets del usuario sin esperar a la revalidación de 60 s.
        // Es el tipo que declara `inbox`; se escribe como literal porque los módulos no se
        // importan (R4). Solo el id: el outbox no lleva datos personales.
        await tx.outbox.create({
          data: {
            tenantId,
            agregado: 'usuario',
            agregadoId: u.id,
            tipoEvento: 'identity.acceso_revocado',
            payload: { usuarioId: u.id },
          },
        });
      }
      return yaDeBaja ? ('ya_de_baja' as const) : ('baja' as const);
    });
  }
}
