/**
 * Reglas puras del embudo de una agencia (T-120). Sin framework ni base de datos.
 */
import { OrdenDeEtapasInvalidoError, SinEtapaInicialError } from './errors.js';

/** El embudo siempre necesita por dónde entrar: al menos una etapa que no sea ganada ni perdida. */
export function exigirEtapaViva(
  etapas: ReadonlyArray<{ esGanada: boolean; esPerdida: boolean }>,
): void {
  if (!etapas.some((e) => !e.esGanada && !e.esPerdida)) throw new SinEtapaInicialError();
}

/** El orden pedido debe ser una permutación exacta de los ids actuales. */
export function exigirPermutacion(
  actuales: ReadonlyArray<string>,
  pedidos: ReadonlyArray<string>,
): void {
  const conjunto = new Set(actuales);
  const ok =
    actuales.length === pedidos.length &&
    new Set(pedidos).size === pedidos.length &&
    pedidos.every((id) => conjunto.has(id));
  if (!ok) throw new OrdenDeEtapasInvalidoError();
}
