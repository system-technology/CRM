/**
 * `moneda_iso` es un `CHAR(3)` y llega como `string`; el contrato admite cuatro monedas. Se valida
 * en vez de forzar el tipo: un `as` dejaría pasar `'XXX'` hasta la pantalla. (Es lo mismo que hace
 * `quoting`, repetido aquí porque R4 impide importarlo.)
 */
import { esCodigoMoneda, type CodigoMoneda, InvariantError } from '@viajapro/domain';

export class MonedaDeArchivoDesconocidaError extends InvariantError {
  readonly code = 'MONEDA_DESCONOCIDA';
  constructor(readonly iso: string) {
    super(`'${iso}' no es una moneda habilitada, y viene de un archivo de viaje guardado`);
  }
}

export function monedaDeLaBase(iso: string): CodigoMoneda {
  if (!esCodigoMoneda(iso)) throw new MonedaDeArchivoDesconocidaError(iso);
  return iso;
}
