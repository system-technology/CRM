/**
 * El adaptador con el que `crm` responde a `analytics` (`PuertoOportunidadesParaReportes`): cuántas
 * oportunidades CREADAS en el rango hay en cada etapa de la agencia. Las etapas salen de
 * `etapas_pipeline` (R12: no hay enum), así que una agencia con seis etapas recibe seis entradas,
 * también las que están en cero.
 *
 * **El alcance decide qué oportunidades se cuentan** (ADR-0035 §2): «propio» es lo asignado a mí
 * AHORA (`oportunidades.asesor_id`), que es la misma columna con la que se reparte el trabajo
 * vivo. Las etapas no se filtran: el embudo de un asesor tiene las mismas columnas que el de la
 * agencia, unas en cero.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  AlcanceDeAgenciaEntera,
  AlcanceDeReporte,
} from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  type EtapaConOportunidades,
  type OportunidadesDeUnAsesor,
  PuertoOportunidadesParaReportes,
  type RangoDeReporte,
} from '../../../shared/puertos/puertos-de-reportes.js';

@Injectable()
export class OportunidadesParaReportesPrisma extends PuertoOportunidadesParaReportes {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async porEtapa(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
  ): Promise<EtapaConOportunidades[]> {
    return this.prisma.conTenant(async (tx) => {
      const [etapas, conteos] = await Promise.all([
        tx.etapaPipeline.findMany({
          where: { tenantId },
          orderBy: { orden: 'asc' },
          select: { id: true, nombre: true, orden: true, esGanada: true, esPerdida: true },
        }),
        tx.oportunidad.groupBy({
          by: ['etapaId'],
          where: {
            tenantId,
            eliminadoEn: null,
            creadoEn: { gte: rango.desde, lt: rango.hasta },
            ...(alcance.asesorId === null ? {} : { asesorId: alcance.asesorId }),
          },
          _count: { _all: true },
        }),
      ]);
      const porEtapa = new Map(conteos.map((c) => [c.etapaId, c._count._all]));
      return etapas.map((e) => ({
        etapaId: e.id,
        nombre: e.nombre,
        orden: e.orden,
        esGanada: e.esGanada,
        esPerdida: e.esPerdida,
        cantidad: porEtapa.get(e.id) ?? 0,
      }));
    });
  }

  /**
   * T-531: las mismas oportunidades que `porEtapa` (creadas en el rango, no eliminadas), repartidas
   * por `asesor_id` con UNA agrupación por (asesor, etapa) y clasificadas por las banderas de la
   * etapa (R12: no hay enum). Las oportunidades sin asesor no entran en ninguna fila.
   */
  async porAsesor(
    tenantId: string,
    rango: RangoDeReporte,
    _alcance: AlcanceDeAgenciaEntera,
  ): Promise<OportunidadesDeUnAsesor[]> {
    return this.prisma.conTenant(async (tx) => {
      const [etapas, conteos] = await Promise.all([
        tx.etapaPipeline.findMany({
          where: { tenantId },
          select: { id: true, esGanada: true, esPerdida: true },
        }),
        tx.oportunidad.groupBy({
          by: ['asesorId', 'etapaId'],
          where: {
            tenantId,
            eliminadoEn: null,
            asesorId: { not: null },
            creadoEn: { gte: rango.desde, lt: rango.hasta },
          },
          _count: { _all: true },
        }),
      ]);
      const banderas = new Map(etapas.map((e) => [e.id, e]));
      const porAsesor = new Map<string, OportunidadesDeUnAsesor>();
      for (const c of conteos) {
        if (c.asesorId === null) continue;
        const fila = porAsesor.get(c.asesorId) ?? {
          asesorId: c.asesorId,
          creadas: 0,
          ganadas: 0,
          perdidas: 0,
        };
        const etapa = banderas.get(c.etapaId);
        fila.creadas += c._count._all;
        if (etapa?.esGanada) fila.ganadas += c._count._all;
        if (etapa?.esPerdida) fila.perdidas += c._count._all;
        porAsesor.set(c.asesorId, fila);
      }
      return [...porAsesor.values()];
    });
  }
}
