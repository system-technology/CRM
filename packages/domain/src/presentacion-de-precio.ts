/**
 * Cómo se PRESENTA un precio (ADR-0017 §9, D3). Es la ÚNICA implementación: el listado de gestión,
 * el listado de salidas, el cotizador y la cotización compartida llaman a esta función. Un segundo
 * sitio que compare `promoHasta` con la fecha es el defecto que esto existe para impedir.
 *
 * **Política de presentación, nunca de cálculo.** La venta que se devuelve es SIEMPRE la de la
 * tarifa: vencer una promo no cambia el precio de venta en ningún caso. Lo único que decide la
 * política `promo_vencida` de la agencia es si, vencida la promo, se oculta el precio de lista o se
 * muestra tachado con la leyenda `PROMO_VENCIDA`.
 *
 * Pura: no mira el reloj. «Hoy» (`AAAA-MM-DD`) se lo da quien llama, en la zona de la agencia (R9).
 */

import { Money, type CodigoMoneda } from './money.js';

export type PoliticaPromoVencida = 'OCULTAR' | 'TACHAR';

export const ESTADOS_DE_PRESENTACION = [
  'CONSULTAR',
  'VIGENTE',
  'PROMO_VIGENTE',
  'PROMO_VENCIDA',
] as const;
export type EstadoDePresentacion = (typeof ESTADOS_DE_PRESENTACION)[number];

export interface TarifaPresentable {
  readonly ventaUnidades: bigint;
  /** Precio de lista (el que se tacha). Nulo = la tarifa no tiene promo que mostrar. */
  readonly listaUnidades: bigint | null;
  readonly moneda: string;
  /** `AAAA-MM-DD`, extremo incluido. Nulo = sin fin (vigente). */
  readonly promoHasta: string | null;
}

export interface DineroPresentado {
  readonly unidades: string;
  readonly moneda: CodigoMoneda;
}

export interface PresentacionDePrecio {
  readonly estado: EstadoDePresentacion;
  /** Siempre la venta de la tarifa. `null` solo en `CONSULTAR`. */
  readonly venta: DineroPresentado | null;
  /** El precio de lista que se pinta tachado, o `null` si no se debe mostrar. */
  readonly listaTachada: DineroPresentado | null;
  readonly leyenda: 'PROMO_VENCIDA' | null;
  /** La promo está en curso: la API pública lo envía además de la presentación sugerida. */
  readonly promoVigente: boolean;
}

function aDinero(unidades: bigint, moneda: string): DineroPresentado {
  const p = Money.desdeUnidades(unidades, moneda).aPersistencia();
  return { unidades: p.unidades.toString(), moneda: p.moneda };
}

/**
 * @param tarifa `null` = no hay precio que mostrar: se presenta «consultar», nunca un cero.
 * @param hoy `AAAA-MM-DD` en la zona de la agencia.
 */
export function presentarPrecio(
  tarifa: TarifaPresentable | null,
  hoy: string,
  politica: PoliticaPromoVencida,
): PresentacionDePrecio {
  if (tarifa === null) {
    return {
      estado: 'CONSULTAR',
      venta: null,
      listaTachada: null,
      leyenda: null,
      promoVigente: false,
    };
  }

  const venta = aDinero(tarifa.ventaUnidades, tarifa.moneda);
  // Una lista que no supera a la venta no es una promo: no hay nada que tachar.
  const lista =
    tarifa.listaUnidades !== null && tarifa.listaUnidades > tarifa.ventaUnidades
      ? aDinero(tarifa.listaUnidades, tarifa.moneda)
      : null;

  if (lista === null) {
    return { estado: 'VIGENTE', venta, listaTachada: null, leyenda: null, promoVigente: false };
  }

  const vencida = tarifa.promoHasta !== null && tarifa.promoHasta < hoy;
  if (!vencida) {
    return {
      estado: 'PROMO_VIGENTE',
      venta,
      listaTachada: lista,
      leyenda: null,
      promoVigente: true,
    };
  }

  const tachar = politica === 'TACHAR';
  return {
    estado: 'PROMO_VENCIDA',
    venta,
    listaTachada: tachar ? lista : null,
    leyenda: tachar ? 'PROMO_VENCIDA' : null,
    promoVigente: false,
  };
}
