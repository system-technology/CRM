/**
 * Línea de tiempo vertical para el itinerario de la propuesta al viajero.
 *
 * Punto de partida: el componente «Timeline» de slide-cn en 21st.dev (variante vertical alineada a
 * la izquierda), sin `cloneElement` ni variantes que la propuesta no usa, y con los tokens de
 * `globals.css` en lugar de `primary` / `muted-foreground` de shadcn. Se imprime: cada tramo evita
 * partirse entre páginas.
 */

import React from 'react';

export interface TramoDeLineaDeTiempo {
  clave: string;
  /** Lo que se lee primero junto al marcador: «Día 1 · sáb 12 dic». */
  etiqueta: React.ReactNode;
  /** Contenido del marcador (un número o un icono). */
  marcador: React.ReactNode;
  /** Marcador lleno para los extremos del viaje (salida y regreso). */
  destacado?: boolean;
  contenido: React.ReactNode;
}

export function LineaDeTiempo({ tramos }: { tramos: readonly TramoDeLineaDeTiempo[] }) {
  return (
    <ol className="flex flex-col">
      {tramos.map((t, i) => {
        const ultimo = i === tramos.length - 1;
        return (
          <li key={t.clave} className="flex break-inside-avoid flex-row items-stretch">
            <div className="mr-4 flex shrink-0 flex-col items-center" aria-hidden="true">
              <div
                className={
                  t.destacado
                    ? 'bg-turquesa-700 relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white [&_svg]:h-4 [&_svg]:w-4'
                    : 'border-turquesa-600/40 text-turquesa-800 relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white text-xs font-bold [&_svg]:h-4 [&_svg]:w-4'
                }
              >
                {t.marcador}
              </div>
              {!ultimo && <div className="mt-1 w-px flex-1 bg-neutral-300" />}
            </div>
            <div className={`flex min-w-0 flex-col gap-1 pt-1.5 ${ultimo ? 'pb-0' : 'pb-6'}`}>
              <p className="text-turquesa-800 text-xs font-semibold">{t.etiqueta}</p>
              <div className="text-sm leading-relaxed text-neutral-700">{t.contenido}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
