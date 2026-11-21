import React from 'react';
import { Bookmark, Loader2 } from 'lucide-react';

export interface BarraDeAccionCotizadorProps {
  /** El total ya formateado («$ 10.800.000 COP»); `null` mientras se calcula. */
  total: string | null;
  /** Composición en una línea («2 adt, 1 chd»). */
  detalle?: string | undefined;
  onGuardar: () => void;
  guardando?: boolean;
  /** Sin permiso, o sin nada que guardar. */
  deshabilitado?: boolean;
  motivoDeshabilitado?: string | undefined;
}

/**
 * El total y «Guardar» siempre a la vista: la barra se queda pegada al borde inferior del área de
 * trabajo (encima de la barra de navegación móvil, que mide 56 px) mientras se ajusta la ocupación.
 * Va al final del contenido, así que no tapa nada: en el flujo normal es el último bloque.
 */
export function BarraDeAccionCotizador({
  total,
  detalle,
  onGuardar,
  guardando = false,
  deshabilitado = false,
  motivoDeshabilitado,
}: BarraDeAccionCotizadorProps) {
  return (
    <div
      data-testid="barra-de-accion-cotizador"
      className="sticky bottom-16 z-30 flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white/95 p-2.5 pl-4 shadow-lg backdrop-blur-md md:bottom-4 dark:border-neutral-700 dark:bg-neutral-900/95"
    >
      <div className="min-w-0">
        <span className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400">
          Total{detalle ? ` · ${detalle}` : ''}
        </span>
        {total === null ? (
          <span
            aria-label="Calculando el total"
            className="mt-1 block h-6 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700"
          />
        ) : (
          <span
            data-testid="total-barra-de-accion"
            aria-live="polite"
            className="cifra block text-lg leading-tight font-black whitespace-nowrap text-neutral-900 dark:text-white"
          >
            {total}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onGuardar}
        disabled={guardando || deshabilitado || total === null}
        title={deshabilitado ? motivoDeshabilitado : undefined}
        className="boton-primario focus-visible:ring-acento-600 flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
      >
        {guardando ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Bookmark className="h-4 w-4" aria-hidden="true" />
        )}
        <span>Guardar cotización</span>
      </button>
    </div>
  );
}
