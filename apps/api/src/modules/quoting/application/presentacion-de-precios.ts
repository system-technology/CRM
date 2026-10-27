/**
 * Pegamento entre la base y `presentarPrecio` (`@viajapro/domain`), la ÚNICA implementación de
 * cómo se presenta un precio (ADR-0017 §9). Aquí solo se lee la política `promo_vencida` del
 * tenant y se traduce la forma de los datos: nada de este módulo compara `promoHasta` con la fecha.
 */

import type { PresentacionDePrecio } from '@viajapro/contracts';
import {
  presentarPrecio,
  type DesdeDeUnaMoneda,
  type PoliticaPromoVencida,
} from '@viajapro/domain';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';

/** Valor por defecto de la política: lo que dice la columna al migrar (ADR-0017 D3). */
export const PROMO_VENCIDA_POR_DEFECTO: PoliticaPromoVencida = 'OCULTAR';

/** La política del tenant de la transacción. RLS la filtra; el predicado la hace explícita. */
export async function leerPromoVencida(
  tx: ClienteTenant,
  tenantId: string,
): Promise<PoliticaPromoVencida> {
  const fila = await tx.politicaDePrecio.findUnique({
    where: { tenantId },
    select: { promoVencida: true },
  });
  return fila?.promoVencida ?? PROMO_VENCIDA_POR_DEFECTO;
}

/** Presenta el «desde» de una moneda (el mínimo que calculó `calcularDesde`). */
export function presentarDesde(
  d: DesdeDeUnaMoneda,
  hoy: string,
  politica: PoliticaPromoVencida,
): PresentacionDePrecio {
  return presentarPrecio(
    {
      ventaUnidades: d.precio.unidades,
      listaUnidades: d.listaUnidades,
      moneda: d.precio.moneda,
      promoHasta: d.promoHasta,
    },
    hoy,
    politica,
  );
}
