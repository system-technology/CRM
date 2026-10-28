/**
 * Adaptador Prisma de `PuertoSeguimientos` sobre la tabla `seguimientos` (T-082).
 *
 * Es el comportamiento completo que describe el doble `seguimientos-en-memoria.ts`: varios
 * seguimientos por oportunidad, y también sobre conversaciones. Sustituye al adaptador provisional
 * de T-077, que los guardaba en `oportunidades.proxima_tarea_*` (la migración copió esos).
 *
 * Todo pasa por `conTenant()` y toda lectura lleva `tenantId` explícito además de RLS (defensa en
 * profundidad, R1; lo vigila `consultas-sin-filtro.spec.ts`). Las foráneas compuestas de la tabla
 * impiden en el motor colgar un seguimiento de la oportunidad, la conversación o el asesor de otra
 * agencia, y la de tres columnas, de la oportunidad de otro contacto.
 *
 * El contacto de un seguimiento sobre conversación lo trae resuelto el caso de uso (puerto hacia
 * `inbox`): este adaptador no lee `conversaciones`, que es de otro contexto (R4). El de una
 * oportunidad sí lo lee aquí, de su propia tabla, y no se fía del que llegue.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Seguimiento } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { OportunidadNoEncontradaError } from '../domain/errors.js';
import {
  type ConsultaDeSeguimientos,
  type NuevoSeguimiento,
  PuertoSeguimientos,
} from '../application/puerto-seguimientos.js';

const PARA_EL_SEGUIMIENTO = {
  id: true,
  descripcion: true,
  venceEn: true,
  completadoEn: true,
  asesorId: true,
  asesor: { select: { nombre: true } },
  contactoId: true,
  contacto: { select: { nombre: true } },
  oportunidadId: true,
  oportunidad: { select: { titulo: true } },
  conversacionId: true,
} as const;

interface Fila {
  id: string;
  descripcion: string;
  venceEn: Date;
  completadoEn: Date | null;
  asesorId: string | null;
  asesor: { nombre: string } | null;
  contactoId: string;
  contacto: { nombre: string | null } | null;
  oportunidadId: string | null;
  oportunidad: { titulo: string } | null;
  conversacionId: string | null;
}

function aSeguimiento(f: Fila): Seguimiento {
  return {
    id: f.id,
    descripcion: f.descripcion,
    venceEn: f.venceEn.toISOString(),
    completadoEn: f.completadoEn?.toISOString() ?? null,
    asesorId: f.asesorId,
    asesorNombre: f.asesor?.nombre ?? null,
    contactoId: f.contactoId,
    contactoNombre: f.contacto?.nombre ?? null,
    oportunidadId: f.oportunidadId,
    oportunidadTitulo: f.oportunidad?.titulo ?? null,
    conversacionId: f.conversacionId,
  };
}

/**
 * Lo que se muestra: el seguimiento de una oportunidad borrada (en blando) desaparece con ella,
 * como en el adaptador provisional. Los de conversación no dependen de nada más.
 */
const VISIBLE: Prisma.SeguimientoWhereInput = {
  OR: [{ oportunidadId: null }, { oportunidad: { is: { eliminadoEn: null } } }],
};

@Injectable()
export class SeguimientosPrisma extends PuertoSeguimientos {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async crear(n: NuevoSeguimiento): Promise<Seguimiento> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      let contactoId: string;
      let oportunidadId: string | null = null;
      let conversacionId: string | null = null;

      if (n.destino.tipo === 'OPORTUNIDAD') {
        const id = n.destino.oportunidadId;
        const o = await tx.oportunidad.findFirst({
          where: { id, tenantId, eliminadoEn: null },
          select: { contactoId: true },
        });
        if (!o) throw new OportunidadNoEncontradaError(id);
        contactoId = o.contactoId;
        oportunidadId = id;
      } else {
        contactoId = n.destino.contactoId;
        conversacionId = n.destino.conversacionId;
      }

      const fila = await tx.seguimiento.create({
        data: {
          tenantId,
          descripcion: n.descripcion,
          venceEn: n.venceEn,
          asesorId: n.asesorId,
          contactoId,
          oportunidadId,
          conversacionId,
          creadoPorId: n.creadoPorId,
          actualizadoPorId: n.creadoPorId,
        },
        select: PARA_EL_SEGUIMIENTO,
      });
      return aSeguimiento(fila);
    });
  }

  async listar(c: ConsultaDeSeguimientos): Promise<Seguimiento[]> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.seguimiento.findMany({
        where: {
          tenantId,
          ...VISIBLE,
          ...(c.asesorId !== null ? { asesorId: c.asesorId } : {}),
          ...(c.oportunidadId !== null ? { oportunidadId: c.oportunidadId } : {}),
          ...(c.conversacionId !== null ? { conversacionId: c.conversacionId } : {}),
          // `completado_en IS NULL` literal: es el predicado del índice parcial de pendientes.
          ...(c.estado === 'PENDIENTE' ? { completadoEn: null } : {}),
          ...(c.estado === 'COMPLETADO' ? { completadoEn: { not: null } } : {}),
          ...(c.venceDesde || c.venceAntes
            ? {
                venceEn: {
                  ...(c.venceDesde ? { gte: c.venceDesde } : {}),
                  ...(c.venceAntes ? { lt: c.venceAntes } : {}),
                },
              }
            : {}),
        },
        // `id` desempata: es UUID v7, así que dos del mismo instante salen en orden de creación.
        orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
        take: c.limite,
        select: PARA_EL_SEGUIMIENTO,
      });
      return filas.map(aSeguimiento);
    });
  }

  async buscar(seguimientoId: string): Promise<Seguimiento | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const f = await tx.seguimiento.findFirst({
        where: { id: seguimientoId, tenantId, ...VISIBLE },
        select: PARA_EL_SEGUIMIENTO,
      });
      return f ? aSeguimiento(f) : null;
    });
  }

  async completar(seguimientoId: string, cuando: Date): Promise<Seguimiento | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      // Condicional: completar dos veces no mueve el instante del primero.
      await tx.seguimiento.updateMany({
        where: { id: seguimientoId, tenantId, completadoEn: null, ...VISIBLE },
        data: { completadoEn: cuando },
      });
      const f = await tx.seguimiento.findFirst({
        where: { id: seguimientoId, tenantId, ...VISIBLE },
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
