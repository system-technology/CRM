/**
 * La columna `moneda_iso` es un `CHAR(3)` y llega como `string`; el contrato admite cuatro
 * monedas concretas. Este es el único sitio donde se cruza esa frontera.
 *
 * **Se valida en vez de forzar el tipo.** Un `as CodigoMoneda` compilaría igual y dejaría pasar
 * una fila con `'XXX'` hasta la pantalla, donde el formateador fallaría sin decir de dónde salió.
 * Aquí el error nombra la moneda y la tabla.
 */

import { esCodigoMoneda, type CodigoMoneda } from '@viajapro/domain';
import { MonedaDesconocidaError } from './errors.js';

export function monedaDeLaBase(iso: string): CodigoMoneda {
  if (!esCodigoMoneda(iso)) throw new MonedaDesconocidaError(iso);
  return iso;
}
