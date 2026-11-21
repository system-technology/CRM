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
 * **Atribución del alcance propio (M9, ADR-0035 §2).** «Mía» es la conversación que respondí YO:
 * el autor del primer saliente humano (`mensajes.autor_id`; los automáticos no tienen autor, y un
 * CHECK impide que un entrante lo tenga). `primera_respuesta_en` no guarda autor, por eso hace
 * falta mirar el mensaje. A ese grupo se suman las que están SIN responder y asignadas a mí
 * (`conversaciones.asignado_a_id`, la misma columna con la que se reparte el trabajo vivo): sin
 * ellas, `sinResponder` sería siempre cero y la tasa de respuesta propia, siempre 100 %. Una
 * conversación que respondió otro no es mía aunque esté asignada a mí: el crédito es de quien
 * respondió.
 *
 * Todo se agrega en la base (tenant_id explícito además de RLS); no se leen mensajes a la app.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  AlcanceDeAgenciaEntera,
  AlcanceDeReporte,
} from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  PuertoRespuestaParaReportes,
  type RangoDeReporte,
  type RespuestaAgregada,
  type RespuestaDeUnAsesor,
} from '../../../shared/puertos/puertos-de-reportes.js';

interface FilaDeTiempos {
  nuevas: number;
  respondidas: number;
  promedio: string | null;
  mediana: string | null;
  p90: string | null;
}

interface FilaDeTiemposPorAsesor extends FilaDeTiempos {
  asesor_id: string;
}

const UNA_DECIMA = (n: string | null): number | null =>
  n === null ? null : Math.round(Number(n) * 10) / 10;

@Injectable()
export class RespuestaParaReportesPrisma extends PuertoRespuestaParaReportes {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async resumir(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
  ): Promise<RespuestaAgregada> {
    const { desde, hasta } = rango;
    // El autor de la primera respuesta solo se busca cuando hay a quién atribuir: el reporte de
    // agencia ejecuta exactamente la misma consulta de antes, sin el lateral de más.
    const autorDeLaPrimera =
      alcance.asesorId === null
        ? Prisma.empty
        : Prisma.sql`
            LEFT JOIN LATERAL (
              SELECT m.autor_id
                FROM mensajes m
               WHERE m.tenant_id = ${tenantId}::uuid
                 AND m.conversacion_id = c.id
                 AND m.direccion = 'SALIENTE'
                 AND m.autor_id IS NOT NULL
               ORDER BY m.ocurrido_en ASC
               LIMIT 1
            ) r ON true`;
    const delAsesor =
      alcance.asesorId === null
        ? Prisma.empty
        : Prisma.sql`AND (r.autor_id = ${alcance.asesorId}::uuid
                       OR (c.primera_respuesta_en IS NULL
                           AND c.asignado_a_id = ${alcance.asesorId}::uuid))`;
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
            ${autorDeLaPrimera}
           WHERE c.tenant_id = ${tenantId}::uuid
             AND c.eliminado_en IS NULL
             ${delAsesor}
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

  /**
   * T-531: lo mismo que `resumir` con filtro, para TODOS los asesores en una consulta. El grupo
   * base y su filtro de «respuesta medible» son idénticos; lo que cambia es la atribución: cada
   * conversación se cuenta para quien respondió (autor del primer saliente humano) y, si está sin
   * responder, para su asignado. `UNION` (no `UNION ALL`) para que una conversación no cuente
   * dos veces para el mismo asesor, igual que el `OR` del filtro individual. Sin autor ni
   * asignado, no es de ningún asesor y solo cuenta en el total de la agencia.
   */
  async porAsesor(
    tenantId: string,
    rango: RangoDeReporte,
    _alcance: AlcanceDeAgenciaEntera,
  ): Promise<RespuestaDeUnAsesor[]> {
    const { desde, hasta } = rango;
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.$queryRaw<FilaDeTiemposPorAsesor[]>`
        WITH grupo AS (
          SELECT c.id,
                 c.primera_respuesta_en,
                 c.asignado_a_id,
                 r.autor_id,
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
            LEFT JOIN LATERAL (
              SELECT m.autor_id
                FROM mensajes m
               WHERE m.tenant_id = ${tenantId}::uuid
                 AND m.conversacion_id = c.id
                 AND m.direccion = 'SALIENTE'
                 AND m.autor_id IS NOT NULL
               ORDER BY m.ocurrido_en ASC
               LIMIT 1
            ) r ON true
           WHERE c.tenant_id = ${tenantId}::uuid
             AND c.eliminado_en IS NULL
             AND c.creado_en >= ${desde} AND c.creado_en < ${hasta}
             AND (
               c.primera_respuesta_en IS NULL
               OR (p.primero IS NOT NULL AND p.primero <= c.primera_respuesta_en)
             )
        ),
        atribuidas AS (
          SELECT id, autor_id AS asesor_id, primera_respuesta_en, minutos
            FROM grupo WHERE autor_id IS NOT NULL
          UNION
          SELECT id, asignado_a_id AS asesor_id, primera_respuesta_en, minutos
            FROM grupo WHERE primera_respuesta_en IS NULL AND asignado_a_id IS NOT NULL
        )
        SELECT asesor_id::text AS asesor_id,
               COUNT(*)::int AS nuevas,
               COUNT(primera_respuesta_en)::int AS respondidas,
               AVG(minutos)::text AS promedio,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos))::text AS mediana,
               (percentile_cont(0.9) WITHIN GROUP (ORDER BY minutos))::text AS p90
          FROM atribuidas
         GROUP BY asesor_id`;

      return filas.map((t) => ({
        asesorId: t.asesor_id,
        conversacionesNuevas: t.nuevas,
        conversacionesRespondidas: t.respondidas,
        sinResponder: t.nuevas - t.respondidas,
        promedioMinutos: UNA_DECIMA(t.promedio),
        medianaMinutos: UNA_DECIMA(t.mediana),
        p90Minutos: UNA_DECIMA(t.p90),
      }));
    });
  }
}
