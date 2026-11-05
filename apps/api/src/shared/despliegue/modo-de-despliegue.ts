/**
 * El modo de despliegue, ADR-0019 §1.
 *
 *   unico     un proceso con la API, Socket.IO, el webhook y el trabajo asíncrono, sin Redis.
 *             Lo arranca `main-unico.ts`.
 *   escalado  API y trabajador en procesos aparte, con BullMQ y Redis (`main.ts` y `worker.ts`).
 *
 * **Sin respaldo silencioso.** `leerModoDeDespliegue` es el que usa el arranque nuevo: si falta
 * la variable o trae otra cosa, el proceso no arranca. `esModoUnico` lo usan las fábricas de los
 * módulos, que también se componen en `main.ts` y `worker.ts` (donde la variable aún puede no
 * existir): ahí un valor inválido sigue abortando, y la ausencia solo significa «lo de siempre».
 */

export type ModoDeDespliegue = 'unico' | 'escalado';

type Entorno = Record<string, string | undefined>;

export class ModoDeDespliegueInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ModoDeDespliegueInvalidoError';
  }
}

const VALIDOS: readonly ModoDeDespliegue[] = ['unico', 'escalado'];

/** Estricta: la variable es obligatoria y solo admite `unico` o `escalado`. */
export function leerModoDeDespliegue(entorno: Entorno = process.env): ModoDeDespliegue {
  const crudo = entorno['MODO_DESPLIEGUE'];
  if (crudo === undefined || crudo === '') {
    throw new ModoDeDespliegueInvalidoError(
      "Falta MODO_DESPLIEGUE: debe ser 'unico' o 'escalado'. No hay valor por omisión.",
    );
  }
  const modo = VALIDOS.find((v) => v === crudo);
  if (!modo) {
    throw new ModoDeDespliegueInvalidoError(
      `MODO_DESPLIEGUE='${crudo}' no es válido: debe ser 'unico' o 'escalado'.`,
    );
  }
  return modo;
}

/** `true` solo con `MODO_DESPLIEGUE=unico`. Un valor presente pero inválido lanza. */
export function esModoUnico(entorno: Entorno = process.env): boolean {
  const crudo = entorno['MODO_DESPLIEGUE'];
  if (crudo === undefined || crudo === '') return false;
  return leerModoDeDespliegue(entorno) === 'unico';
}
