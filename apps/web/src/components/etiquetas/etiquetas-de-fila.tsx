import React from 'react';
import type { EtiquetaDeConversacion } from '@viajapro/contracts';
import { recortarParaFila } from '../../lib/etiquetas-logica';
import { ChipDeEtiqueta } from './chip-de-etiqueta';

/**
 * La tercera línea de una fila de la bandeja (HU-inbox-1 §4.1): como mucho 2 chips y «+N», en una
 * sola línea y sin desplazamiento lateral. Sin etiquetas no pinta nada (la fila no reserva la línea).
 * Los chips NO son botones aquí: tocar la fila abre el chat.
 */
export function EtiquetasDeFila({ etiquetas }: { etiquetas: readonly EtiquetaDeConversacion[] }) {
  if (etiquetas.length === 0) return null;
  const { visibles, ocultas } = recortarParaFila(etiquetas, 2);
  return (
    <div
      data-testid="etiquetas-de-fila"
      className="mt-1.5 flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden"
    >
      <span className="sr-only">Etiquetas: </span>
      {visibles.map((e) => (
        <ChipDeEtiqueta key={e.id} etiqueta={e} anchoMaximo="fila" className="shrink" />
      ))}
      {ocultas.length > 0 && (
        <span
          data-testid="etiquetas-ocultas"
          title={ocultas.map((e) => e.nombre).join(', ')}
          className="shrink-0 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300"
        >
          <span aria-hidden="true">+{ocultas.length}</span>
          <span className="sr-only">
            {ocultas.length === 1 ? 'y 1 etiqueta más: ' : `y ${ocultas.length} etiquetas más: `}
            {ocultas.map((e) => e.nombre).join(', ')}
          </span>
        </span>
      )}
    </div>
  );
}
