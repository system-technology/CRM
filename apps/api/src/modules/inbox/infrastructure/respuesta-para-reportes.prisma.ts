/**
 * El adaptador con el que `inbox` responde a `analytics` (`PuertoRespuestaParaReportes`).
 *
 * El tiempo de primera respuesta se mide desde el PRIMER mensaje entrante del viajero hasta
 * `primera_respuesta_en`, de las conversaciones cuya primera respuesta cae en el rango. Una
 * conversación que empezó el asesor (plantilla saliente, sin entrante anterior) no tiene una
 * respuesta que medir y se excluye, en vez de contar un tiempo negativo o inventado.
 *
 * Todo se agrega en la base; no se leen mensajes a la aplicación.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  PuertoRespuestaParaReportes,
  type RangoDeReporte,
  type RespuestaAgregada,
} from '../../../shared/puertos/puertos-de-reportes.js';

interface FilaDeTiempos {
  respondidas: number;
  promedio: string | null;
  mediana: string | null;
}

const UNA_DECIMA = (n: string | null): number | null =>
  n === null ? null : Math.round(Number(n) * 10) / 10;

@Injectable()
export class RespuestaParaReportesPrisma extends PuertoRespuestaParaReportes {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async resumir(tenantId: string, rango: RangoDeReporte): Promise<RespuestaAgregada> {
    const { desde, hasta } = rango;
    return this.prisma.conTenant(async (tx) => {
      const nuevas = await tx.conversacion.count({
        where: { tenantId, eliminadoEn: null, creadoEn: { gte: desde, lt: hasta } },
      });

      const [t] = await tx.$queryRaw<FilaDeTiempos[]>`
        WITH medidas AS (
          SELECT EXTRACT(EPOCH FROM (c.primera_respuesta_en - p.primero)) / 60.0 AS minutos
            FROM conversaciones c
            CROSS JOIN LATERAL (
              SELECT MIN(m.ocurrido_en) AS primero
                FROM mensajes m
               WHERE m.tenant_id = ${tenantId}::uuid
                 AND m.conversacion_id = c.id
                 AND m.direccion = 'ENTRANTE'
            ) p
           WHERE c.tenant_id = ${tenantId}::uuid
             AND c.eliminado_en IS NULL
             AND c.primera_respuesta_en >= ${desde} AND c.primera_respuesta_en < ${hasta}
             AND p.primero IS NOT NULL
             AND p.primero <= c.primera_respuesta_en
        )
        SELECT COUNT(*)::int AS respondidas,
               AVG(minutos)::text AS promedio,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos))::text AS mediana
          FROM medidas`;

      return {
        conversacionesNuevas: nuevas,
        conversacionesRespondidas: t?.respondidas ?? 0,
        promedioMinutos: UNA_DECIMA(t?.promedio ?? null),
        medianaMinutos: UNA_DECIMA(t?.mediana ?? null),
      };
    });
  }
}
