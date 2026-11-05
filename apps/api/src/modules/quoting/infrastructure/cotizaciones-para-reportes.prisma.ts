/**
 * El adaptador con el que `quoting` responde a `analytics` (`PuertoCotizacionesParaReportes`):
 * agregados de cotizaciones calculados en la base, bajo RLS y con `tenant_id` explícito en cada
 * consulta. Una transacción corta, solo lectura.
 *
 * **El neto no sale de la base sin permiso.** Con `incluirMargen = false` las sumas de neto y
 * margen ni siquiera forman parte de la consulta: no hay valor que filtrar después.
 *
 * Las ventas salen de la versión que vio el cliente (`version_enviada`) de las cotizaciones
 * aceptadas enviadas en el rango, agrupadas por moneda: nunca se suman monedas distintas (R8).
 * Los totales llegan como texto (`::text`) para no pasar por un `number`: en COP superan el
 * entero seguro de JS.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
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
    incluirMargen: boolean,
  ): Promise<CotizacionesAgregadas> {
    const { desde, hasta } = rango;

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
           AND c.estado = 'ACEPTADA'
           AND c.enviada_en >= ${desde} AND c.enviada_en < ${hasta}
         GROUP BY v.moneda_iso
         ORDER BY v.moneda_iso`;

      return {
        creadas: conteos?.creadas ?? 0,
        enviadas: conteos?.enviadas ?? 0,
        aceptadas: conteos?.aceptadas ?? 0,
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
