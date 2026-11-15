/**
 * El adaptador con el que `inbox` responde a `analytics` (`PuertoRespuestaParaReportes`).
 *
 * El grupo es UNO: las conversaciones CREADAS en el rango. De ese grupo salen el denominador
 * (`nuevas`), el numerador (`respondidas`: las que tienen `primera_respuesta_en`), `sinResponder`
 * y la mediana, el promedio y el p90 del tiempo de primera respuesta. Las no respondidas cuentan
 * en el denominador, no se descartan (sin sesgo de supervivencia). El tiempo va desde el PRIMER
 * mensaje entrante del viajero hasta `primera_respuesta_en`. Una conversación que abrió el asesor
 * (plantilla saliente, sin entrante anterior a su respuesta) no tiene una respuesta que medir y
 * queda fuera del grupo entero, en vez de contar un tiempo negativo o contarse como «sin
 * responder».
 *
 * Todo se agrega en la base (tenant_id explícito además de RLS); no se leen mensajes a la app.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  PuertoRespuestaParaReportes,
  type RangoDeReporte,
  type RespuestaAgregada,
} from '../../../shared/puertos/puertos-de-reportes.js';

interface FilaDeTiempos {
  nuevas: number;
  respondidas: number;
  promedio: string | null;
  mediana: string | null;
  p90: string | null;
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
      const [t] = await tx.$queryRaw<FilaDeTiempos[]>`
        WITH grupo AS (
          SELECT c.primera_respuesta_en,
                 CASE WHEN c.primera_respuesta_en IS NULL THEN NULL
                      ELSE EXTRACT(EPOCH FROM (c.primera_respuesta_en - p.primero)) / 60.0
                 END AS minutos
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
             AND c.creado_en >= ${desde} AND c.creado_en < ${hasta}
             AND (
               c.primera_respuesta_en IS NULL
               OR (p.primero IS NOT NULL AND p.primero <= c.primera_respuesta_en)
             )
        )
        SELECT COUNT(*)::int AS nuevas,
               COUNT(primera_respuesta_en)::int AS respondidas,
               AVG(minutos)::text AS promedio,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos))::text AS mediana,
               (percentile_cont(0.9) WITHIN GROUP (ORDER BY minutos))::text AS p90
          FROM grupo`;

      const nuevas = t?.nuevas ?? 0;
      const respondidas = t?.respondidas ?? 0;
      return {
        conversacionesNuevas: nuevas,
        conversacionesRespondidas: respondidas,
        sinResponder: nuevas - respondidas,
        promedioMinutos: UNA_DECIMA(t?.promedio ?? null),
        medianaMinutos: UNA_DECIMA(t?.mediana ?? null),
        p90Minutos: UNA_DECIMA(t?.p90 ?? null),
      };
    });
  }
}
