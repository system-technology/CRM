'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowLeft } from 'lucide-react';

export interface ElementoMiga {
  etiqueta: string;
  href?: string;
  icono?: React.ComponentType<{ className?: string }>;
}

export interface MigasDePanProps {
  elementos: ElementoMiga[];
  mostrarBotonVolver?: boolean;
  volverHref?: string;
  volverTexto?: string;
  className?: string;
}

/**
 * Componente accesible de migas de pan (Breadcrumbs) para pantallas de detalle (T-034).
 *
 * Cumple con:
 * - WAI-ARIA Breadcrumb pattern (`<nav aria-label="Migas de pan">`, `<ol>`, `aria-current="page"`).
 * - Touch targets >= 44px para el botón de retroceso opcional en móvil.
 * - Estética caribeña integrada con ViajaPro.
 */
export function MigasDePan({
  elementos,
  mostrarBotonVolver = false,
  volverHref,
  volverTexto = 'Volver',
  className = '',
}: MigasDePanProps) {
  if (!elementos || elementos.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 py-2 select-none ${className}`}>
      {mostrarBotonVolver && volverHref && (
        <Link
          href={volverHref}
          data-testid="boton-volver-migas"
          title={volverTexto}
          aria-label={volverTexto}
          className="focus-visible:ring-acento-600 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only sm:ml-1.5 sm:text-xs sm:font-medium">
            {volverTexto}
          </span>
        </Link>
      )}

      <nav aria-label="Migas de pan" data-testid="migas-de-pan" className="flex items-center">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          {elementos.map((item, index) => {
            const esUltimo = index === elementos.length - 1;
            const Icono = item.icono;

            return (
              <li key={`${item.etiqueta}-${index}`} className="flex items-center">
                {index > 0 && (
                  <ChevronRight
                    className="mx-1 h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-600"
                    aria-hidden="true"
                  />
                )}

                {esUltimo ? (
                  <span
                    aria-current="page"
                    data-testid="miga-activa"
                    className="flex items-center gap-1 font-semibold text-neutral-900 dark:text-neutral-100"
                  >
                    {Icono && (
                      <Icono className="text-acento-600 dark:text-acento-400 h-3.5 w-3.5" />
                    )}
                    <span className="max-w-[200px] truncate sm:max-w-[320px]">{item.etiqueta}</span>
                  </span>
                ) : item.href ? (
                  <Link
                    href={item.href}
                    className="focus-visible:ring-acento-600 hover:text-acento-700 dark:hover:text-acento-400 flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {Icono && <Icono className="h-3.5 w-3.5" />}
                    <span>{item.etiqueta}</span>
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                    {Icono && <Icono className="h-3.5 w-3.5" />}
                    <span>{item.etiqueta}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
