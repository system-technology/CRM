/**
 * Aviso interno entre el chat y la lista de la bandeja (T-326): cuando el chat pone o quita una
 * etiqueta, la fila de esa conversación en la lista cambia en el mismo instante, sin esperar al
 * servidor ni recargar. Dos componentes hermanos del layout, sin un estado compartido más grande:
 * la lista sigue siendo dueña de sus filas y solo escucha.
 *
 * Es del navegador de esta persona; el cambio para los demás asesores llega por el evento en vivo
 * de conversación actualizada que ya existe.
 */

import type { EtiquetaDeConversacion } from '@viajapro/contracts';

export type OyenteDeEtiquetas = (
  conversacionId: string,
  etiquetas: readonly EtiquetaDeConversacion[],
) => void;

const oyentes = new Set<OyenteDeEtiquetas>();

export function publicarEtiquetasDeConversacion(
  conversacionId: string,
  etiquetas: readonly EtiquetaDeConversacion[],
): void {
  for (const oyente of [...oyentes]) oyente(conversacionId, etiquetas);
}

/** Devuelve la función que da de baja el oyente (para el `return` de un `useEffect`). */
export function escucharEtiquetasDeConversacion(oyente: OyenteDeEtiquetas): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}
