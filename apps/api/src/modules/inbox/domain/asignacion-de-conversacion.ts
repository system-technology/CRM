/**
 * Quién queda como responsable de una conversación (`docs/01-producto/12-visibilidad-de-conversaciones.md` §3).
 */

/**
 * **Responder es tomar.** El primer mensaje saliente de un miembro en una conversación SIN asignar
 * se la asigna. Si ya tiene asesor, responder no la reasigna, aunque responda el dueño. Una nota,
 * marcar como leída o cambiar el estado no pasan por aquí: no asignan.
 *
 * `autorId` nulo (un envío sin usuario detrás) no puede tomar nada.
 */
export function asignacionTrasResponder(
  asignadoAActual: string | null,
  autorId: string | null,
): string | null {
  return asignadoAActual ?? autorId;
}
