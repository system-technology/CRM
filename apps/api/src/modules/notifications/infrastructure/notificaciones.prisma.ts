/**
 * Las notificaciones en PostgreSQL. Siempre bajo RLS, y además con `tenant_id` y `usuario_id` en
 * cada predicado (R1): un usuario solo toca las suyas.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Notificacion } from '@viajapro/contracts';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type NotificacionesDelUsuario,
  RepositorioDeAvisos,
  RepositorioDeNotificacionesDelUsuario,
} from '../application/puertos-de-notificaciones.js';
import type { NotificacionPorCrear } from '../domain/aviso-de-plazo.js';

@Injectable()
export class RepositorioDeAvisosPrisma extends RepositorioDeAvisos {
  async crear(
    tx: ClienteTenant,
    tenantId: string,
    nuevas: readonly NotificacionPorCrear[],
  ): Promise<number> {
    if (nuevas.length === 0) return 0;
    // `skipDuplicates` = ON CONFLICT DO NOTHING sobre UNIQUE (tenant_id, outbox_id, usuario_id).
    const r = await tx.notification.createMany({
      data: nuevas.map((n) => ({
        tenantId,
        usuarioId: n.usuarioId,
        tipo: n.tipo,
        outboxId: n.outboxId,
        archivoId: n.archivoId,
        reservaId: n.reservaId,
        archivoNumero: n.archivoNumero,
        venceEn: n.venceEn,
      })),
      skipDuplicates: true,
    });
    return r.count;
  }
}

interface Fila {
  id: string;
  tipo: Notificacion['tipo'];
  archivoId: string;
  reservaId: string;
  archivoNumero: number;
  venceEn: Date;
  leidaEn: Date | null;
  creadoEn: Date;
}

const SELECCION = {
  id: true,
  tipo: true,
  archivoId: true,
  reservaId: true,
  archivoNumero: true,
  venceEn: true,
  leidaEn: true,
  creadoEn: true,
} as const;

const aContrato = (f: Fila): Notificacion => ({
  id: f.id,
  tipo: f.tipo,
  archivoId: f.archivoId,
  reservaId: f.reservaId,
  archivoNumero: f.archivoNumero,
  venceEn: f.venceEn.toISOString(),
  leidaEn: f.leidaEn ? f.leidaEn.toISOString() : null,
  creadaEn: f.creadoEn.toISOString(),
});

@Injectable()
export class RepositorioDeNotificacionesDelUsuarioPrisma extends RepositorioDeNotificacionesDelUsuario {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async listar(usuarioId: string, limite: number): Promise<NotificacionesDelUsuario> {
    const tenantId = ContextoTenant.tenantId();
    return this.prisma.conTenant(async (tx) => {
      const [filas, noLeidas] = await Promise.all([
        tx.notification.findMany({
          where: { tenantId, usuarioId },
          select: SELECCION,
          orderBy: [
            { leidaEn: { sort: 'asc', nulls: 'first' } },
            { creadoEn: 'desc' },
            { id: 'desc' },
          ],
          take: limite,
        }),
        tx.notification.count({ where: { tenantId, usuarioId, leidaEn: null } }),
      ]);
      return { datos: filas.map(aContrato), noLeidas };
    });
  }

  async marcarLeida(
    usuarioId: string,
    notificacionId: string,
    ahora: Date,
  ): Promise<Notificacion | null> {
    const tenantId = ContextoTenant.tenantId();
    return this.prisma.conTenant(async (tx) => {
      // Solo si es de este usuario y sigue sin leer; si ya estaba leída conserva su hora.
      await tx.notification.updateMany({
        where: { id: notificacionId, tenantId, usuarioId, leidaEn: null },
        data: { leidaEn: ahora },
      });
      const f = await tx.notification.findFirst({
        where: { id: notificacionId, tenantId, usuarioId },
        select: SELECCION,
      });
      return f ? aContrato(f) : null;
    });
  }
}
