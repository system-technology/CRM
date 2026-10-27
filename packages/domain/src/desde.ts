/**
 * El «desde» de un producto: el precio que UN viajero adulto puede pagar de verdad (ADR-0017).
 *
 * **Se calcula, nunca se guarda**: un valor persistido envejece en cuanto alguien edita una tarifa.
 * Y es la **única implementación**: el listado de gestión, el de salidas y el cotizador llaman a
 * esta función. Un segundo cálculo en otra parte es el defecto que ya publicó «desde $292.000»
 * cuando un adulto pagaba $389.000.
 *
 * Solo cuentan las tarifas **base**: aplican a un adulto (sin tipo o `ADT`), sin condición de edad,
 * que ocupa silla (o no lo declara) y que no son aditivas. Quedan fuera el infante a 0, el menor y
 * el suplemento de sencilla: anunciarlos como «desde» sería publicidad engañosa.
 *
 * **Por moneda**: devuelve un mínimo por cada moneda, ordenado por código. Nunca un solo número
 * que mezcle COP y USD, y sin conversión. Sin tarifas base el resultado es `[]`.
 *
 * Pura: no mira el reloj. «Hoy» se lo da quien llama, ya en la zona horaria de la agencia (R9).
 */

import { Money, esCodigoMoneda, type CodigoMoneda } from './money.js';

export interface TarifaParaDesde {
  readonly ventaUnidades: bigint;
  /** `moneda_iso` tal como viene de la base; se valida contra las monedas habilitadas. */
  readonly moneda: string;
  readonly unidad: 'POR_PERSONA' | 'POR_GRUPO';
  readonly cubrePasajeros: number;
  readonly aditiva: boolean;
  readonly tipoPasajero: 'ADT' | 'CHD' | 'INF' | null;
  readonly edadMinima: number | null;
  readonly edadMaxima: number | null;
  readonly ocupaSilla: boolean | null;
  /** Para presentar el precio (`presentarPrecio`); nunca entran en el cálculo del mínimo. */
  readonly listaUnidades?: bigint | null;
  readonly promoHasta?: string | null;
}

export interface VigenciaParaDesde {
  readonly activa: boolean;
  /** `AAAA-MM-DD`, extremo incluido. */
  readonly hasta: string;
  readonly tarifas: readonly TarifaParaDesde[];
}

export interface DesdeDeUnaMoneda {
  readonly precio: Money;
  /** El mínimo sale de una tarifa de GRUPO y es su per cápita: la pantalla debe decirlo. */
  readonly esDeGrupo: boolean;
  /** Lista y fin de promo de la tarifa que dio el mínimo, para `presentarPrecio`. */
  readonly listaUnidades: bigint | null;
  readonly promoHasta: string | null;
}

export function esTarifaBase(t: TarifaParaDesde): boolean {
  return (
    !t.aditiva &&
    (t.tipoPasajero === null || t.tipoPasajero === 'ADT') &&
    t.edadMinima === null &&
    t.edadMaxima === null &&
    t.ocupaSilla !== false
  );
}

function porPersona(t: TarifaParaDesde): bigint {
  return t.unidad === 'POR_GRUPO' && t.cubrePasajeros > 1
    ? t.ventaUnidades / BigInt(t.cubrePasajeros)
    : t.ventaUnidades;
}

/**
 * @param hoy `AAAA-MM-DD` en la zona del tenant: las vigencias con `hasta < hoy` no cuentan.
 *   `null` = sin filtro de fecha (una salida ya acotada por quien llama).
 */
export function calcularDesde(
  vigencias: readonly VigenciaParaDesde[],
  hoy: string | null,
): DesdeDeUnaMoneda[] {
  const minimos = new Map<
    CodigoMoneda,
    {
      unidades: bigint;
      esDeGrupo: boolean;
      listaUnidades: bigint | null;
      promoHasta: string | null;
    }
  >();

  for (const v of vigencias) {
    if (!v.activa || (hoy !== null && v.hasta < hoy)) continue;
    for (const t of v.tarifas) {
      if (!esTarifaBase(t) || !esCodigoMoneda(t.moneda)) continue;
      const unidades = porPersona(t);
      const actual = minimos.get(t.moneda);
      if (!actual || unidades < actual.unidades) {
        minimos.set(t.moneda, {
          unidades,
          esDeGrupo: t.unidad === 'POR_GRUPO',
          // Lista y venta de una tarifa de grupo se prorratean igual, para que el tachado sea
          // comparable con el per cápita que se anuncia.
          listaUnidades:
            t.listaUnidades == null
              ? null
              : t.unidad === 'POR_GRUPO' && t.cubrePasajeros > 1
                ? t.listaUnidades / BigInt(t.cubrePasajeros)
                : t.listaUnidades,
          promoHasta: t.promoHasta ?? null,
        });
      }
    }
  }

  return [...minimos.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([moneda, m]) => ({
      precio: Money.desdeUnidades(m.unidades, moneda),
      esDeGrupo: m.esDeGrupo,
      listaUnidades: m.listaUnidades,
      promoHasta: m.promoHasta,
    }));
}
