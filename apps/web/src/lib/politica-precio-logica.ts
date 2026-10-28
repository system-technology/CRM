/**
 * Lógica pura de presentación para la Política de Precio y Formación del Precio (0c.15).
 *
 * Utiliza estrictamente la aritmética de @viajapro/domain (calcularVenta, calcularMargen, Money)
 * y los contratos de @viajapro/contracts (PoliticaDePrecio, BaseDelMargen, OrigenDeLaVenta).
 * Regla R3: Tipos de contratos oficiales.
 * Regla R8: Dinero en enteros y Money value object.
 */

import { Money, calcularVenta, calcularMargen } from '@viajapro/domain';
import type { PoliticaDePrecio } from '@viajapro/contracts';
import { formatearDinero } from './formato';

export interface EjemploPrecioResultado {
  readonly netoFormateado: string;
  readonly ventaFormateada: string;
  readonly ventaUnidades: number;
  readonly margenImporteFormateado: string;
  readonly margenPorcentajeTexto: string;
  readonly explicacionFormula: string;
  readonly diferenciaSillaFormateada: string;
  readonly diferenciaBus40Formateada: string;
}

/**
 * Formatea un valor numérico de pesos colombianos a formato visual COP ($ 1.200.000).
 */
export function formatearPesosCop(unidades: number | bigint): string {
  return formatearDinero(unidades, { moneda: 'COP' });
}

/**
 * Calcula el ejemplo vivo interactivo a partir de un neto de prueba y una política de precio.
 * Utiliza estrictamente calcularVenta y calcularMargen de @viajapro/domain (0c.15.3).
 */
export function calcularEjemploVivo(
  netoUnidades: number = 1_000_000,
  politica: Omit<PoliticaDePrecio, 'actualizadaEn'>,
): EjemploPrecioResultado {
  const neto = Money.desdeUnidades(netoUnidades, 'COP');
  const venta = calcularVenta(neto, {
    porcentaje: politica.porcentaje,
    base: politica.base,
    origenDeLaVenta: politica.origenDeLaVenta,
    redondeoVenta: politica.redondeoVenta,
  });

  const margen = calcularMargen(neto, venta, politica.base);
  const ventaUnidades = Number(venta.aPersistencia().unidades);
  const margenUnidades = margen ? Number(margen.importe.aPersistencia().unidades) : 0;
  const margenPct = margen?.porcentaje ?? politica.porcentaje;

  // Diferencia vs la otra base sobre el mismo neto de prueba
  const ventaNeto = calcularVenta(neto, { ...politica, base: 'SOBRE_EL_NETO' });
  const ventaVenta = calcularVenta(neto, { ...politica, base: 'SOBRE_LA_VENTA' });
  const difSilla = Math.abs(
    Number(ventaVenta.aPersistencia().unidades) - Number(ventaNeto.aPersistencia().unidades),
  );
  const difBus40 = difSilla * 40;

  const explicacionFormula =
    politica.base === 'SOBRE_EL_NETO'
      ? `${formatearPesosCop(netoUnidades)} + (${formatearPesosCop(netoUnidades)} × ${politica.porcentaje}%) = ${formatearPesosCop(ventaUnidades)}`
      : `${formatearPesosCop(netoUnidades)} / (1 - ${politica.porcentaje / 100}) = ${formatearPesosCop(ventaUnidades)} (${formatearPesosCop(margenUnidades)} es el ${margenPct}% de ${formatearPesosCop(ventaUnidades)})`;

  return {
    netoFormateado: formatearPesosCop(netoUnidades),
    ventaFormateada: formatearPesosCop(ventaUnidades),
    ventaUnidades,
    margenImporteFormateado: formatearPesosCop(margenUnidades),
    margenPorcentajeTexto: `${margenPct.toFixed(2)}%`,
    explicacionFormula,
    diferenciaSillaFormateada: formatearPesosCop(difSilla),
    diferenciaBus40Formateada: formatearPesosCop(difBus40),
  };
}
