'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Plane, Search } from 'lucide-react';
import { pedirAperturaDeBusquedaGlobal } from '../../lib/busqueda-global-evento';
import { esDetalleMovilDeBandeja } from '../../lib/navegacion';

/**
 * Cabecera compacta SOLO móvil (variante B de D4, T-320): una fila de 44 px con la marca y la lupa
 * fija que abre la búsqueda global. La monta una sola vez `MarcoDeTrabajo`; no la pinta ninguna
 * pantalla. No aparece en la conversación a pantalla completa (`/bandeja/[id]`), que tiene su
 * propia cabecera con la flecha de volver, ni en escritorio (ahí la búsqueda está en el menú
 * lateral y en Ctrl+K).
 */
export function CabeceraMovil() {
  const pathname = usePathname();
  if (esDetalleMovilDeBandeja(pathname)) return null;

  return (
    <header
      data-testid="cabecera-movil"
      className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200 bg-white pr-1 pl-4 md:hidden dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
        <span
          aria-hidden="true"
          className="bg-acento-700 flex h-6 w-6 items-center justify-center rounded-md text-white"
        >
          <Plane className="h-3.5 w-3.5" />
        </span>
        ViajaPro
      </span>
      <button
        type="button"
        onClick={pedirAperturaDeBusquedaGlobal}
        aria-label="Buscar"
        data-testid="lupa-movil"
        className="focus-visible:ring-acento-600 flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-xl text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>
    </header>
  );
}
