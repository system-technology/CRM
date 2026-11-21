/**
 * `moneda_iso` es un `CHAR(3)` y llega como `string`; se valida en vez de forzar el tipo (un `as`
 * dejaría pasar `'XXX'` hasta la pantalla). R4 impide importar el helper de `booking`.
 */
import { type CodigoMoneda, esCodigoMoneda, InvariantError } from '@viajapro/domain';

export class MonedaGuardadaDesconocidaError extends InvariantError {
  readonly code = 'MONEDA_DESCONOCIDA';
  constructor(readonly iso: string) {
    super(`'${iso}' no es una moneda habilitada, y viene de un dato guardado`);
  }
}

export function monedaDeLaBase(iso: string): CodigoMoneda {
  if (!esCodigoMoneda(iso)) throw new MonedaGuardadaDesconocidaError(iso);
  return iso;
}
