'use client';

import React from 'react';
import { Sliders } from 'lucide-react';
import { dispararAperturaModalCookies } from '../../lib/privacidad-cookies';

interface BotonAbrirPreferenciasProps {
  readonly grande?: boolean;
}

export function BotonAbrirPreferencias({ grande = false }: BotonAbrirPreferenciasProps) {
  return (
    <button
      type="button"
      onClick={dispararAperturaModalCookies}
      data-testid="btn-abrir-configuracion-desde-politica"
      className={
        grande
          ? 'inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:bg-teal-600 dark:hover:bg-teal-500'
          : 'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-xs transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
      }
    >
      <Sliders className="h-4 w-4" />
      <span>{grande ? 'Abrir configuración de cookies' : 'Preferencias'}</span>
    </button>
  );
}
