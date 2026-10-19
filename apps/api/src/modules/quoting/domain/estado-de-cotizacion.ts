/**
 * El ciclo de vida de una cotización, como función pura.
 *
 *   BORRADOR ──► ENVIADA ──► ACEPTADA | RECHAZADA | VENCIDA
 *
 * Es invariante del dominio y no política de agencia (R12): por eso un `enum` y una tabla de
 * transiciones aquí, no configuración por tenant. Los tres estados finales son terminales: no
 * admiten transición ni versión nueva. Un borrador no se acepta ni vence sin haberse enviado.
 * ENVIADA admite versiones nuevas (la revisión que sigue a una negociación); la versión que vio
 * el cliente queda fijada en `versionEnviada` y no se mueve.
 */
import type { EstadoCotizacion } from '@viajapro/contracts';
import { CotizacionTerminalError, TransicionDeCotizacionInvalidaError } from './errors.js';

const SIGUIENTES: Readonly<Record<EstadoCotizacion, readonly EstadoCotizacion[]>> = {
  BORRADOR: ['ENVIADA'],
  ENVIADA: ['ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  ACEPTADA: [],
  RECHAZADA: [],
  VENCIDA: [],
};

export const esTerminal = (estado: EstadoCotizacion): boolean => SIGUIENTES[estado].length === 0;

export const puedeTransitar = (de: EstadoCotizacion, a: EstadoCotizacion): boolean =>
  SIGUIENTES[de].includes(a);

/** Devuelve el estado nuevo o lanza el error tipado. No toca nada. */
export function transitar(de: EstadoCotizacion, a: EstadoCotizacion): EstadoCotizacion {
  if (!puedeTransitar(de, a)) throw new TransicionDeCotizacionInvalidaError(de, a);
  return a;
}

/** Una cotización terminal no admite versión nueva. */
export function exigirAdmiteVersiones(estado: EstadoCotizacion): void {
  if (esTerminal(estado)) throw new CotizacionTerminalError(estado);
}
