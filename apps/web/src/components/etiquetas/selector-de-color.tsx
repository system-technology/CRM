import React from 'react';
import { Check } from 'lucide-react';
import { COLORES_DE_ETIQUETA, type ColorDeEtiqueta } from '@viajapro/contracts';
import { estiloDeColor } from '../../lib/etiquetas-logica';

/**
 * Las 8 muestras de la paleta (HU-inbox-1 §4.6): 44 px cada una, con nombre accesible («Verde»), la
 * elegida marcada con una palomita (no solo con el color) y su nombre escrito al lado. Sin rojo ni
 * hexadecimales libres: la paleta es invariante de accesibilidad del producto.
 */
export function SelectorDeColor({
  valor,
  onCambiar,
  nombre,
  deshabilitado = false,
}: {
  valor: ColorDeEtiqueta;
  onCambiar: (color: ColorDeEtiqueta) => void;
  /** Nombre accesible del grupo, único en la pantalla. */
  nombre: string;
  deshabilitado?: boolean;
}) {
  return (
    <div>
      <div role="radiogroup" aria-label={nombre} className="flex flex-wrap gap-1">
        {COLORES_DE_ETIQUETA.map((color) => {
          const estilo = estiloDeColor(color);
          const elegido = color === valor;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={elegido}
              aria-label={estilo.nombre}
              title={estilo.nombre}
              disabled={deshabilitado}
              onClick={() => onCambiar(color)}
              data-testid={`color-${color}`}
              className={`focus-visible:ring-acento-600 flex h-11 w-11 items-center justify-center rounded-xl border-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:opacity-50 ${
                elegido
                  ? 'border-neutral-900 dark:border-white'
                  : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${estilo.punto}`}
              >
                {elegido && (
                  <Check aria-hidden="true" className="h-4 w-4 text-neutral-950" strokeWidth={3} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
        Color: <span className="font-semibold">{estiloDeColor(valor).nombre}</span>
      </p>
    </div>
  );
}
