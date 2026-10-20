/**
 * Lo que la API lee de una conversación para decidir a quién se le emite un evento, con el pool de
 * la API y bajo RLS con el tenant del EVENTO (mismo mecanismo que `LecturaDeMensajesPrisma`).
 *
 * **Sin filtro de visibilidad a propósito:** aquí se calcula la audiencia, que es la regla aplicada
 * a cada miembro (`quienesVen`). Estos métodos no devuelven nada a una persona.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ConversacionResumen } from '@viajapro/contracts';
import {
  type MiembroParaAudiencia,
  PERMISO_VER_TODAS,
} from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoLecturaDeConversaciones } from '../application/puertos-de-eventos.js';
import { aResumen, PARA_EL_RESUMEN } from './mapeo.js';

@Injectable()
export class LecturaDeConversacionesPrisma extends PuertoLecturaDeConversaciones {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  private enTenant<T>(tenantId: string, fn: (tx: ClienteTenant) => Promise<T>): Promise<T> {
    return ContextoTenant.ejecutarCon(
      { tenantId, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 'tiempo-real' },
      () => this.prisma.conTenant(fn),
    );
  }

  async asignacionDe(
    tenantId: string,
    conversacionId: string,
  ): Promise<{ asignadoAId: string | null } | null> {
    return this.enTenant(tenantId, (tx) =>
      tx.conversacion.findFirst({
        where: { id: conversacionId, tenantId, eliminadoEn: null },
        select: { asignadoAId: true },
      }),
    );
  }

  async resumenPorId(
    tenantId: string,
    conversacionId: string,
  ): Promise<ConversacionResumen | null> {
    const fila = await this.enTenant(tenantId, (tx) =>
      tx.conversacion.findFirst({
        where: { id: conversacionId, tenantId, eliminadoEn: null },
        select: PARA_EL_RESUMEN,
      }),
    );
    return fila ? aResumen(fila, new Date()) : null;
  }

  async miembrosActivos(tenantId: string): Promise<MiembroParaAudiencia[]> {
    const filas = await this.enTenant(tenantId, (tx) =>
      tx.usuario.findMany({
        where: { tenantId, activo: true, eliminadoEn: null },
        select: { id: true, rol: { select: { permisos: true } } },
      }),
    );
    return filas.map((f) => ({
      usuarioId: f.id,
      verTodas: f.rol.permisos.includes(PERMISO_VER_TODAS),
    }));
  }
}
