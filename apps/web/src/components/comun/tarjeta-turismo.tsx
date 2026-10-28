'use client';

import React from 'react';

export interface TarjetaTurismoProps extends React.HTMLAttributes<HTMLDivElement> {
  elevacion?: boolean;
  bordeDorado?: boolean;
  destacada?: boolean;
  fondoOceano?: boolean;
}

/**
 * Tarjeta Base con Identidad Turística (T-032).
 * Proporciona bordes pulidos, elevación suave al pasar el cursor (respetando prefers-reduced-motion)
 * y soporte opcional de ribete dorado o fondo oceánico para productos y métricas VIP.
 */
export const TarjetaTurismo = React.forwardRef<HTMLDivElement, TarjetaTurismoProps>(
  (
    {
      children,
      elevacion = true,
      bordeDorado = false,
      destacada = false,
      fondoOceano = false,
      className = '',
      ...resto
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl border transition-all duration-200 ${
          fondoOceano
            ? 'border-cyan-800/40 bg-[#0B1F3A] text-white shadow-sm'
            : 'border-neutral-200 bg-white text-neutral-900 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
        } ${elevacion ? 'tarjeta-turismo-hover' : ''} ${
          bordeDorado
            ? 'border-[#C9A24B] shadow-[0_0_0_1px_rgba(201,162,75,0.2)]'
            : destacada
              ? 'border-cyan-500/60 ring-2 ring-cyan-500/20'
              : ''
        } ${className}`}
        {...resto}
      >
        {children}
      </div>
    );
  },
);

TarjetaTurismo.displayName = 'TarjetaTurismo';
