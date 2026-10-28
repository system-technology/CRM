/**
 * Adaptador PROVISIONAL de seguimientos sobre las columnas `proxima_tarea_*` de `oportunidades`.
 *
 * Límites, todos por falta de la tabla `seguimientos` (migración que debe escribir `datos`):
 *
 *   · un seguimiento por oportunidad: el id del seguimiento ES el id de la oportunidad;
 *   · sin seguimientos sobre conversación (`SeguimientoNoSoportadoTodaviaError`);
 *   · el esquema guarda `completada` como booleano, sin instante: `completadoEn` se aproxima con
 *     `actualizado_en` de la oportunidad, que se mueve también con cualquier edición posterior;
 *   · el asesor del seguimiento es el de la oportunidad (si no tenía, se le asigna el indicado).
 *
 * Cuando exista la tabla, se escribe otro adaptador y se cambia el `useClass` del módulo.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Seguimiento } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  SeguimientoNoSoportadoTodaviaError,
  OportunidadNoEncontradaError,
} from '../domain/errors.js';
import {
  type ConsultaDeSeguimientos,
  type NuevoSeguimiento,
  PuertoSeguimientos,
} from '../application/puerto-seguimientos.js';

const PARA_EL_SEGUIMIENTO = {
  id: true,
  titulo: true,
  asesorId: true,
  asesor: { select: { nombre: true } },
  contactoId: true,
  contacto: { select: { nombre: true } },
  proximaTareaDescripcion: true,
  proximaTareaVenceEn: true,
  proximaTareaCompletada: true,
  actualizadoEn: true,
} as const;

interface Fila {
  id: string;
  titulo: string;
  asesorId: string | null;
  asesor: { nombre: string } | null;
  contactoId: string;
  contacto: { nombre: string | null } | null;
  proximaTareaDescripcion: string | null;
  proximaTareaVenceEn: Date | null;
  proximaTareaCompletada: boolean | null;
  actualizadoEn: Date;
}

function aSeguimiento(f: Fila): Seguimiento | null {
  if (f.proximaTareaDescripcion === null || f.proximaTareaVenceEn === null) return null;
  return {
    id: f.id,
    descripcion: f.proximaTareaDescripcion,
    venceEn: f.proximaTareaVenceEn.toISOString(),
    completadoEn: f.proximaTareaCompletada ? f.actualizadoEn.toISOString() : null,
    asesorId: f.asesorId,
    asesorNombre: f.asesor?.nombre ?? null,
    contactoId: f.contactoId,
    contactoNombre: f.contacto?.nombre ?? null,
    oportunidadId: f.id,
    oportunidadTitulo: f.titulo,
    conversacionId: null,
  };
}

@Injectable()
export class SeguimientosSobreOportunidad extends PuertoSeguimientos {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async crear(n: NuevoSeguimiento): Promise<Seguimiento> {
    if (n.destino.tipo === 'CONVERSACION')
      throw new SeguimientoNoSoportadoTodaviaError('CONVERSACION');
    const oportunidadId = n.destino.oportunidadId;
    const { tenantId } = ContextoTenant.obtener();

    return this.prisma.conTenant(async (tx) => {
      const o = await tx.oportunidad.findFirst({
        where: { id: oportunidadId, tenantId, eliminadoEn: null },
        select: { asesorId: true, proximaTareaDescripcion: true, proximaTareaCompletada: true },
      });
      if (!o) throw new OportunidadNoEncontradaError(oportunidadId);
      if (o.proximaTareaDescripcion !== null && o.proximaTareaCompletada === false) {
        throw new SeguimientoNoSoportadoTodaviaError('OPORTUNIDAD_CON_PENDIENTE');
      }
      const fila = await tx.oportunidad.update({
        where: { id_tenantId: { id: oportunidadId, tenantId } },
        data: {
          proximaTareaDescripcion: n.descripcion,
          proximaTareaVenceEn: n.venceEn,
          proximaTareaCompletada: false,
          // Sin dueño no habría quien lo vea en «pendientes del día»: se le asigna a quien lo pone.
          ...(o.asesorId === null && n.asesorId !== null ? { asesorId: n.asesorId } : {}),
          actualizadoPorId: n.creadoPorId,
        },
        select: PARA_EL_SEGUIMIENTO,
      });
      const s = aSeguimiento(fila);
      if (!s) throw new OportunidadNoEncontradaError(oportunidadId);
      return s;
    });
  }

  async listar(c: ConsultaDeSeguimientos): Promise<Seguimiento[]> {
    // Los seguimientos de conversación no existen todavía: filtrar por una no devuelve nada.
    if (c.conversacionId !== null) return [];
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.oportunidad.findMany({
        where: {
          tenantId,
          eliminadoEn: null,
          proximaTareaDescripcion: { not: null },
          ...(c.asesorId !== null ? { asesorId: c.asesorId } : {}),
          ...(c.oportunidadId !== null ? { id: c.oportunidadId } : {}),
          ...(c.estado === 'PENDIENTE' ? { proximaTareaCompletada: false } : {}),
          ...(c.estado === 'COMPLETADO' ? { proximaTareaCompletada: true } : {}),
          ...(c.venceDesde || c.venceAntes
            ? {
                proximaTareaVenceEn: {
                  ...(c.venceDesde ? { gte: c.venceDesde } : {}),
                  ...(c.venceAntes ? { lt: c.venceAntes } : {}),
                },
              }
            : {}),
        },
        orderBy: { proximaTareaVenceEn: 'asc' },
        take: c.limite,
        select: PARA_EL_SEGUIMIENTO,
      });
      return filas.flatMap((f) => aSeguimiento(f) ?? []);
    });
  }

  async buscar(seguimientoId: string): Promise<Seguimiento | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const f = await tx.oportunidad.findFirst({
        where: { id: seguimientoId, tenantId, eliminadoEn: null },
        select: PARA_EL_SEGUIMIENTO,
      });
      return f ? aSeguimiento(f) : null;
    });
  }

  async completar(seguimientoId: string, _cuando: Date): Promise<Seguimiento | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      await tx.oportunidad.updateMany({
        where: {
          id: seguimientoId,
          tenantId,
          eliminadoEn: null,
          proximaTareaDescripcion: { not: null },
          proximaTareaCompletada: false,
        },
        data: { proximaTareaCompletada: true },
      });
      const f = await tx.oportunidad.findFirst({
        where: { id: seguimientoId, tenantId, eliminadoEn: null },
        select: PARA_EL_SEGUIMIENTO,
      });
      return f ? aSeguimiento(f) : null;
    });
  }

  async zonaHoraria(): Promise<string> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const t = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { zonaHoraria: true },
      });
      return t?.zonaHoraria ?? 'America/Bogota';
    });
  }
}
