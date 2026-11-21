import React from 'react';
import { Tag, X } from 'lucide-react';
import type { EtiquetaDeConversacion } from '@viajapro/contracts';
import { estiloDeColor } from '../../lib/etiquetas-logica';

export interface ChipDeEtiquetaProps {
  etiqueta: Pick<EtiquetaDeConversacion, 'nombre' | 'color'> & { id?: string };
  /** Con función, el chip lleva una «×» que quita la etiqueta (zona táctil de 44 × 44 px en móvil). */
  onQuitar?: () => void;
  /** La «×» está esperando al servidor: no admite otro toque. */
  ocupada?: boolean;
  /** Ancho máximo del nombre antes de cortarlo con «…». */
  anchoMaximo?: 'fila' | 'cabecera';
  className?: string;
}

/**
 * Chip de etiqueta (HU-inbox-1 §3 y §4): fondo claro + texto oscuro del mismo tono + punto de color
 * + icono de etiqueta + EL NOMBRE ESCRITO. Con escala de grises se entiende igual: el color nunca es
 * lo único que dice qué etiqueta es. Los pares de color miden ≥ 4,5:1 (AA, ver `globals.css`).
 *
 * En la lista no es un botón (tocar la fila abre el chat). En la cabecera del chat lleva «×».
 */
export function ChipDeEtiqueta({
  etiqueta,
  onQuitar,
  ocupada = false,
  anchoMaximo = 'cabecera',
  className = '',
}: ChipDeEtiquetaProps) {
  const estilo = estiloDeColor(etiqueta.color);
  return (
    <span
      data-testid="chip-de-etiqueta"
      data-color={etiqueta.color}
      title={etiqueta.nombre}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-full py-0.5 pl-1.5 text-[11px] leading-4 font-semibold ${
        onQuitar ? 'pr-0.5 md:pr-1' : 'pr-2'
      } ${estilo.chip} ${ocupada ? 'opacity-70' : ''} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${estilo.punto}`} />
      <Tag aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span
        className={`truncate ${anchoMaximo === 'fila' ? 'max-w-[9rem]' : 'max-w-[12rem] sm:max-w-[16rem]'}`}
      >
        {etiqueta.nombre}
      </span>
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          disabled={ocupada}
          aria-label={`Quitar etiqueta ${etiqueta.nombre}`}
          data-testid="quitar-etiqueta"
          // Zona táctil de 44 × 44 px aunque el dibujo sea menor: el margen negativo la saca del
          // alto del chip sin agrandarlo. En escritorio vuelve a un botón compacto.
          className="focus-visible:ring-acento-600 -my-3 flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-full hover:bg-black/10 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-wait md:my-0 md:h-5 md:min-h-0 md:w-5 md:min-w-0 dark:hover:bg-white/15"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
