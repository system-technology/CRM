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
  type CotizacionesAgregadas,
  PuertoCotizacionesParaReportes,
  type RangoDeReporte,
  type VentaAgregada,
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

interface FilaDeVentas {
  moneda_iso: string;
  cantidad: number;
  venta: string;
  neto?: string | null;
  margen?: string | null;
  venta_con_neto?: string | null;
  sin_neto?: number;
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
    const columnasDeMargen = incluirMargen
      ? Prisma.sql`,
          SUM(v.neto_unidades)::text AS neto,
          SUM(v.margen_unidades)::text AS margen,
          (SUM(v.venta_unidades) FILTER (WHERE v.neto_unidades IS NOT NULL))::text AS venta_con_neto,
          (COUNT(*) FILTER (WHERE v.neto_unidades IS NULL))::int AS sin_neto`
      : Prisma.empty;

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
