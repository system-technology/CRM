/**
 * Pegamento entre las filas de la base y `calcularDesde` (`@viajapro/domain`), que es la ÚNICA
 * implementación del «desde» (ADR-0017). Aquí no se decide qué es una tarifa base ni cuál es la
 * más barata: solo se traduce la forma de la fila y se calcula «hoy» en la zona de la agencia.
 */

import type { TarifaParaDesde } from '@viajapro/domain';

/** Las columnas de `tarifas` que `calcularDesde` necesita. Se usa en los `select` de Prisma. */
export const SELECCION_PARA_DESDE = {
  ventaUnidades: true,
  monedaIso: true,
  unidad: true,
  cubrePasajeros: true,
  aditiva: true,
  tipoPasajero: true,
  edadMinima: true,
  edadMaxima: true,
  ocupaSilla: true,
} as const;

export interface FilaDeTarifaParaDesde {
  ventaUnidades: bigint;
  monedaIso: string;
  unidad: 'POR_PERSONA' | 'POR_GRUPO';
  cubrePasajeros: number;
  aditiva: boolean;
  tipoPasajero: 'ADT' | 'CHD' | 'INF' | null;
  edadMinima: number | null;
  edadMaxima: number | null;
  ocupaSilla: boolean | null;
}

export function aTarifaParaDesde(f: FilaDeTarifaParaDesde): TarifaParaDesde {
  return {
    ventaUnidades: f.ventaUnidades,
    moneda: f.monedaIso,
    unidad: f.unidad,
    cubrePasajeros: f.cubrePasajeros,
    aditiva: f.aditiva,
    tipoPasajero: f.tipoPasajero,
    edadMinima: f.edadMinima,
    edadMaxima: f.edadMaxima,
    ocupaSilla: f.ocupaSilla,
  };
}

/** `AAAA-MM-DD` del instante dado en la zona horaria de la agencia (R9). */
export function hoyEnZona(zonaHoraria: string, ahora: Date): string {
  // `en-CA` formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}
