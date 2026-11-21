/**
 * El adaptador con el que `quoting` responde a `analytics` (`PuertoCotizacionesParaReportes`):
 * agregados de cotizaciones calculados en la base, bajo RLS y con `tenant_id` explícito en cada
 * consulta. Una transacción corta, solo lectura.
 *
 * **El alcance decide qué filas entran** (ADR-0035 §2): «propio» es lo que YO cotizé
 * (`cotizaciones.creado_por`), y no cambia al reasignar la oportunidad. Con alcance de agencia y
 * sin asesor pedido no se añade ningún predicado de asesor. El id del asesor viaja parametrizado
 * como cualquier otro valor.
 *
 * **El neto no sale de la base sin permiso.** Con `incluirMargen = false` las sumas de neto y
 * margen ni siquiera forman parte de la consulta: no hay valor que filtrar después.
 *
 * Las ventas salen de la versión que vio el cliente (`version_enviada`) de las cotizaciones cuyo
 * cambio a ACEPTADA (`cotizacion_cambios_estado`, T-132) cae en el rango: la fecha de la venta es
 * la de la aceptación, no la del envío. Las aceptadas sin esa fila (anteriores a T-132) se cuentan
 * aparte (`aceptadasSinFecha`, por `enviada_en`), no se suman. Agrupadas por moneda: nunca se suman monedas distintas (R8).
 * Los totales llegan como texto (`::text`) para no pasar por un `number`: en COP superan el
 * entero seguro de JS.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { AlcanceDeReporte } from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  type CotizacionesAbiertasAgregadas,
  type CotizacionesAgregadas,
  type CotizacionesDeUnAsesor,
  PuertoCotizacionesParaReportes,
  type RangoDeReporte,
  type VentaAgregada,
  type VentaDeUnDestino,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { monedaDeLaBase } from '../domain/moneda-de-la-base.js';

interface FilaDeConteos {
  creadas: number;
  enviadas: number;
  aceptadas: number;
}

interface FilaDeSinFecha {
  n: number;
}

/** Las filas por asesor (T-531): la misma forma, más quién. `asesor` es nulo si no hay autor. */
interface FilaDeConteosPorAsesor extends FilaDeConteos {
  asesor: string | null;
}

interface FilaDeSinFechaPorAsesor extends FilaDeSinFecha {
  asesor: string | null;
}

interface FilaDeAbiertas {
  borradores: number;
  enviadas: number;
  hasta_tres: number;
  de_cuatro_a_siete: number;
  mas_de_siete: number;
}

interface FilaDeVentas {
  moneda_iso: string;
  cantidad: number;
  venta: string;
  neto?: string | null;
  margen?: string | null;
  venta_con_neto?: string | null;
  sin_neto?: number;
}

interface FilaDeVentasPorAsesor extends FilaDeVentas {
  asesor: string | null;
}

interface FilaDeVentasPorDestino extends FilaDeVentas {
  destino: string;
}

@Injectable()
export class CotizacionesParaReportesPrisma extends PuertoCotizacionesParaReportes {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async resumir(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
    incluirMargen: boolean,
  ): Promise<CotizacionesAgregadas> {
    const { desde, hasta } = rango;
    // Un solo fragmento para las tres consultas: si una se olvidara del asesor, el reporte propio
    // mezclaría las cifras de otro.
    const delAsesor =
      alcance.asesorId === null
        ? Prisma.empty
        : Prisma.sql`AND c.creado_por = ${alcance.asesorId}::uuid`;

    // Solo se suma lo que se va a mostrar. Fragmentos de `Prisma.sql`: los valores siguen
    // yendo parametrizados.
    const columnasDeMargen = columnasDeMargenDe(incluirMargen);

    return this.prisma.conTenant(async (tx) => {
      const [conteos] = await tx.$queryRaw<FilaDeConteos[]>`
        SELECT
          (COUNT(*) FILTER (WHERE c.creado_en >= ${desde} AND c.creado_en < ${hasta}))::int AS creadas,
          (COUNT(*) FILTER (WHERE c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}))::int AS enviadas,
          (COUNT(*) FILTER (WHERE c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}
                              AND c.estado = 'ACEPTADA'))::int AS aceptadas
          FROM cotizaciones c
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.eliminado_en IS NULL
           ${delAsesor}
           AND ((c.creado_en >= ${desde} AND c.creado_en < ${hasta})
             OR (c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}))`;

      const ventas = await tx.$queryRaw<FilaDeVentas[]>`
        SELECT v.moneda_iso,
               COUNT(*)::int AS cantidad,
               SUM(v.venta_unidades)::text AS venta
               ${columnasDeMargen}
          FROM cotizaciones c
          JOIN versiones_cotizacion v
            ON v.tenant_id = c.tenant_id AND v.cotizacion_id = c.id AND v.numero = c.version_enviada
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.eliminado_en IS NULL
           ${delAsesor}
           AND c.estado = 'ACEPTADA'
           AND EXISTS (
                 SELECT 1 FROM cotizacion_cambios_estado h
                  WHERE h.tenant_id = ${tenantId}::uuid
                    AND h.cotizacion_id = c.id
                    AND h.estado_hasta = 'ACEPTADA'
                    AND h.ocurrido_en >= ${desde} AND h.ocurrido_en < ${hasta})
         GROUP BY v.moneda_iso
         ORDER BY v.moneda_iso`;

      const [sinFecha] = await tx.$queryRaw<FilaDeSinFecha[]>`
        SELECT COUNT(*)::int AS n
          FROM cotizaciones c
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.eliminado_en IS NULL
           ${delAsesor}
           AND c.estado = 'ACEPTADA'
           AND c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}
           AND NOT EXISTS (
                 SELECT 1 FROM cotizacion_cambios_estado h
                  WHERE h.tenant_id = ${tenantId}::uuid
                    AND h.cotizacion_id = c.id
                    AND h.estado_hasta = 'ACEPTADA')`;

      return {
        creadas: conteos?.creadas ?? 0,
        enviadas: conteos?.enviadas ?? 0,
        aceptadas: conteos?.aceptadas ?? 0,
        aceptadasSinFecha: sinFecha?.n ?? 0,
        ventasPorMoneda: ventas.map((f) => aVenta(f, incluirMargen)),
      };
    });
  }

  /**
   * `resumir` partido por asesor (T-531): las MISMAS tres consultas, con `GROUP BY c.creado_por`.
   * Una consulta por cifra, no una por asesor. La atribución es la de ADR-0035 §2 (lo que cada uno
   * COTIZÓ), y el predicado de asesor del alcance sigue aplicándose: con un `asesorId` de filtro
   * solo sale esa fila. `creado_por` nulo —cotización sin autor— sale como `asesorId: null`.
   *
   * Las sumas de neto y margen entran en la consulta SOLO con `incluirMargen`, igual que arriba.
   */
  async resumirPorAsesor(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
    incluirMargen: boolean,
  ): Promise<CotizacionesDeUnAsesor[]> {
    const { desde, hasta } = rango;
    const delAsesor =
      alcance.asesorId === null
        ? Prisma.empty
        : Prisma.sql`AND c.creado_por = ${alcance.asesorId}::uuid`;
    const columnasDeMargen = columnasDeMargenDe(incluirMargen);

    return this.prisma.conTenant(async (tx) => {
      const conteos = await tx.$queryRaw<FilaDeConteosPorAsesor[]>`
        SELECT
          c.creado_por::text AS asesor,
          (COUNT(*) FILTER (WHERE c.creado_en >= ${desde} AND c.creado_en < ${hasta}))::int AS creadas,
          (COUNT(*) FILTER (WHERE c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}))::int AS enviadas,
          (COUNT(*) FILTER (WHERE c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}
                              AND c.estado = 'ACEPTADA'))::int AS aceptadas
          FROM cotizaciones c
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.eliminado_en IS NULL
           ${delAsesor}
           AND ((c.creado_en >= ${desde} AND c.creado_en < ${hasta})
             OR (c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}))
         GROUP BY c.creado_por`;

      const ventas = await tx.$queryRaw<FilaDeVentasPorAsesor[]>`
        SELECT c.creado_por::text AS asesor,
               v.moneda_iso,
               COUNT(*)::int AS cantidad,
               SUM(v.venta_unidades)::text AS venta
               ${columnasDeMargen}
          FROM cotizaciones c
          JOIN versiones_cotizacion v
            ON v.tenant_id = c.tenant_id AND v.cotizacion_id = c.id AND v.numero = c.version_enviada
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.eliminado_en IS NULL
           ${delAsesor}
           AND c.estado = 'ACEPTADA'
           AND EXISTS (
                 SELECT 1 FROM cotizacion_cambios_estado h
                  WHERE h.tenant_id = ${tenantId}::uuid
                    AND h.cotizacion_id = c.id
                    AND h.estado_hasta = 'ACEPTADA'
                    AND h.ocurrido_en >= ${desde} AND h.ocurrido_en < ${hasta})
         GROUP BY c.creado_por, v.moneda_iso
         ORDER BY v.moneda_iso`;

      const sinFecha = await tx.$queryRaw<FilaDeSinFechaPorAsesor[]>`
        SELECT c.creado_por::text AS asesor, COUNT(*)::int AS n
          FROM cotizaciones c
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.eliminado_en IS NULL
           ${delAsesor}
           AND c.estado = 'ACEPTADA'
           AND c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}
           AND NOT EXISTS (
                 SELECT 1 FROM cotizacion_cambios_estado h
                  WHERE h.tenant_id = ${tenantId}::uuid
                    AND h.cotizacion_id = c.id
                    AND h.estado_hasta = 'ACEPTADA')
         GROUP BY c.creado_por`;

      // Una venta puede ser de un asesor que no aparece en `conteos` (la cotizó antes del rango y
      // la aceptaron dentro): por eso se unen las tres fuentes, y no se parte de una sola.
      const porAsesor = new Map<string | null, CotizacionesDeUnAsesor>();
      const de = (asesorId: string | null): CotizacionesDeUnAsesor => {
        let fila = porAsesor.get(asesorId);
        if (!fila) {
          fila = {
            asesorId,
            creadas: 0,
            enviadas: 0,
            aceptadas: 0,
            aceptadasSinFecha: 0,
            ventasPorMoneda: [],
          };
          porAsesor.set(asesorId, fila);
        }
        return fila;
      };
      for (const c of conteos) {
        const fila = de(c.asesor);
        fila.creadas = c.creadas;
        fila.enviadas = c.enviadas;
        fila.aceptadas = c.aceptadas;
      }
      for (const f of sinFecha) de(f.asesor).aceptadasSinFecha = f.n;
      for (const v of ventas) de(v.asesor).ventasPorMoneda.push(aVenta(v, incluirMargen));
      return [...porAsesor.values()];
    });
  }

  /**
   * Las ventas del rango por destino y moneda (T-532): la consulta de ventas de `resumir`, agrupada
   * por `versiones_cotizacion.destino` además de la moneda. La misma venta (la versión que vio el
   * cliente, por el instante de la ACEPTACIÓN), el mismo predicado de alcance y el mismo permiso de
   * margen: sin `incluirMargen`, neto y margen no entran en la consulta. Las monedas no se suman
   * (R8): un destino vendido en dos monedas son dos filas.
   */
  async ventasPorDestino(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
    incluirMargen: boolean,
  ): Promise<VentaDeUnDestino[]> {
    const { desde, hasta } = rango;
    const delAsesor =
      alcance.asesorId === null
        ? Prisma.empty
        : Prisma.sql`AND c.creado_por = ${alcance.asesorId}::uuid`;
    const columnasDeMargen = columnasDeMargenDe(incluirMargen);

    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.$queryRaw<FilaDeVentasPorDestino[]>`
        SELECT v.destino,
               v.moneda_iso,
               COUNT(*)::int AS cantidad,
               SUM(v.venta_unidades)::text AS venta
               ${columnasDeMargen}
          FROM cotizaciones c
          JOIN versiones_cotizacion v
            ON v.tenant_id = c.tenant_id AND v.cotizacion_id = c.id AND v.numero = c.version_enviada
         WHERE c.tenant_id = ${tenantId}::uuid
           AND c.eliminado_en IS NULL
           ${delAsesor}
           AND c.estado = 'ACEPTADA'
           AND EXISTS (
                 SELECT 1 FROM cotizacion_cambios_estado h
                  WHERE h.tenant_id = ${tenantId}::uuid
                    AND h.cotizacion_id = c.id
                    AND h.estado_hasta = 'ACEPTADA'
                    AND h.ocurrido_en >= ${desde} AND h.ocurrido_en < ${hasta})
         GROUP BY v.destino, v.moneda_iso
         ORDER BY v.destino, v.moneda_iso`;
      return filas.map((f) => ({ destino: f.destino, ...aVenta(f, incluirMargen) }));
    });
  }

  /**
   * Cotizaciones vivas HOY (T-528): borradores y enviadas sin eliminar. No mira el rango —no es
   * una cifra del periodo— y reparte las ENVIADAS por días COMPLETOS de espera desde `enviada_en`,
   * con los mismos cortes que ya pintaba la web (≤3, 4–7, >7).
   *
   * El mismo predicado de asesor que `resumir`: «propio» es lo que YO cotizé (`creado_por`,
   * ADR-0035 §2). `ahora` llega como parámetro y no como `now()`: la prueba fija el instante.
   *
   * Una ENVIADA sin `enviada_en` (la columna es nullable aunque el flujo no lo produzca) suma en
   * `enviadas` y en ningún tramo: inventarle una antigüedad sería peor que no repartirla.
   */
  async abiertas(
    tenantId: string,
    alcance: AlcanceDeReporte,
    ahora: Date,
  ): Promise<CotizacionesAbiertasAgregadas> {
    const delAsesor =
      alcance.asesorId === null
        ? Prisma.empty
        : Prisma.sql`AND c.creado_por = ${alcance.asesorId}::uuid`;

    return this.prisma.conTenant(async (tx) => {
      const [fila] = await tx.$queryRaw<FilaDeAbiertas[]>`
        WITH abiertas AS (
          SELECT c.estado,
                 FLOOR(EXTRACT(EPOCH FROM (${ahora}::timestamptz - c.enviada_en)) / 86400) AS dias
            FROM cotizaciones c
           WHERE c.tenant_id = ${tenantId}::uuid
             AND c.eliminado_en IS NULL
             ${delAsesor}
             AND c.estado IN ('BORRADOR', 'ENVIADA'))
        SELECT
          (COUNT(*) FILTER (WHERE estado = 'BORRADOR'))::int AS borradores,
          (COUNT(*) FILTER (WHERE estado = 'ENVIADA'))::int AS enviadas,
          (COUNT(*) FILTER (WHERE estado = 'ENVIADA' AND dias <= 3))::int AS hasta_tres,
          (COUNT(*) FILTER (WHERE estado = 'ENVIADA' AND dias > 3 AND dias <= 7))::int
            AS de_cuatro_a_siete,
          (COUNT(*) FILTER (WHERE estado = 'ENVIADA' AND dias > 7))::int AS mas_de_siete
          FROM abiertas`;

      return {
        borradores: fila?.borradores ?? 0,
        enviadas: fila?.enviadas ?? 0,
        hastaTresDias: fila?.hasta_tres ?? 0,
        deCuatroASiete: fila?.de_cuatro_a_siete ?? 0,
        masDeSiete: fila?.mas_de_siete ?? 0,
      };
    });
  }
}

/**
 * Las columnas de neto y margen, o NADA. Un solo sitio para las tres consultas de ventas
 * (`resumir`, `resumirPorAsesor`, `ventasPorDestino`): la compuerta de `cotizacion.ver_neto_y_margen`
 * no puede olvidarse en una de ellas. Solo se suma lo que se va a mostrar; los valores siguen
 * yendo parametrizados.
 */
function columnasDeMargenDe(incluirMargen: boolean): Prisma.Sql {
  return incluirMargen
    ? Prisma.sql`,
          SUM(v.neto_unidades)::text AS neto,
          SUM(v.margen_unidades)::text AS margen,
          (SUM(v.venta_unidades) FILTER (WHERE v.neto_unidades IS NOT NULL))::text AS venta_con_neto,
          (COUNT(*) FILTER (WHERE v.neto_unidades IS NULL))::int AS sin_neto`
    : Prisma.empty;
}

function aVenta(f: FilaDeVentas, incluirMargen: boolean): VentaAgregada {
  const venta: VentaAgregada = {
    moneda: monedaDeLaBase(f.moneda_iso),
    cotizacionesAceptadas: f.cantidad,
    ventaUnidades: BigInt(f.venta),
  };
  if (incluirMargen) {
    venta.margen = {
      netoUnidades: f.neto == null ? null : BigInt(f.neto),
      margenUnidades: f.margen == null ? null : BigInt(f.margen),
      ventaConNetoUnidades: f.venta_con_neto == null ? 0n : BigInt(f.venta_con_neto),
      cotizacionesSinNeto: f.sin_neto ?? 0,
    };
  }
  return venta;
}
