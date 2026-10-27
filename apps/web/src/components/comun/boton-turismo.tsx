'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export type VarianteBotonTurismo =
  'mar' | 'atardecer' | 'dorado' | 'oceano' | 'contorno' | 'fantasma';

export type TamanoBotonTurismo = 'sm' | 'md' | 'lg';

export interface BotonTurismoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotonTurismo;
  tamano?: TamanoBotonTurismo;
  cargando?: boolean;
  textoCarga?: string;
  iconoIzquierda?: React.ReactNode;
  iconoDerecha?: React.ReactNode;
  anchoCompleto?: boolean;
}

const ESTILOS_VARIANTES: Record<VarianteBotonTurismo, string> = {
  mar: 'degradado-mar text-white shadow-sm hover:brightness-105 active:brightness-95 focus-visible:ring-cyan-500 border border-blue-400/30',
  atardecer:
    'degradado-atardecer text-white shadow-sm hover:brightness-105 active:brightness-95 focus-visible:ring-rose-500 border border-orange-400/30',
  dorado:
    'degradado-dorado text-neutral-900 font-bold shadow-sm hover:brightness-105 active:brightness-95 focus-visible:ring-amber-500 border border-amber-400/50',
  oceano:
    'bg-[#0B1F3A] text-white hover:bg-[#0F2B4C] active:bg-[#061122] focus-visible:ring-cyan-500 border border-cyan-800/40 shadow-sm dark:bg-[#0F2B4C] dark:hover:bg-[#163860]',
  contorno:
    'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 focus-visible:ring-blue-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800',
  fantasma:
    'bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 focus-visible:ring-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800',
};

const ESTILOS_TAMANOS: Record<TamanoBotonTurismo, string> = {
  sm: 'text-xs px-3 py-1.5 min-h-[44px]',
  md: 'text-sm px-4 py-2 min-h-[44px]',
  lg: 'text-base px-5 py-2.5 min-h-[48px]',
};

/**
 * Botón con Identidad Visual Turística (T-032).
 * Incluye degradados temáticos (mar, atardecer, dorado), spinner accesible de carga,
 * foco accesible y touch target garantizado >= 44px para cumplimiento WCAG y 375 px.
 */
export const BotonTurismo = React.forwardRef<HTMLButtonElement, BotonTurismoProps>(
  (
    {
      children,
      variante = 'mar',
      tamano = 'md',
      cargando = false,
      textoCarga,
      iconoIzquierda,
      iconoDerecha,
      anchoCompleto = false,
      disabled,
      className = '',
      type = 'button',
      ...resto
    },
    ref,
  ) => {
    const estaDeshabilitado = disabled || cargando;

    return (
      <button
        ref={ref}
        type={type}
        disabled={estaDeshabilitado}
        aria-busy={cargando}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:brightness-100 ${
          anchoCompleto ? 'w-full' : ''
        } ${ESTILOS_VARIANTES[variante]} ${ESTILOS_TAMANOS[tamano]} ${className}`}
        {...resto}
      >
        {cargando ? (
          <>
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>{textoCarga ?? children}</span>
          </>
        ) : (
          <>
            {iconoIzquierda && (
              <span className="flex shrink-0 items-center" aria-hidden="true">
                {iconoIzquierda}
              </span>
            )}
            <span>{children}</span>
            {iconoDerecha && (
              <span className="flex shrink-0 items-center" aria-hidden="true">
                {iconoDerecha}
              </span>
            )}
          </>
        )}
      </button>
    );
  },
);

BotonTurismo.displayName = 'BotonTurismo';
