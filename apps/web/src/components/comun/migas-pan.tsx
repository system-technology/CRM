'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowLeft, Home } from 'lucide-react';

export interface ElementoMiga {
  label: string;
  href?: string;
  icono?: React.ComponentType<{ className?: string }>;
}

export interface AccionPrincipalMiga {
  label: string;
  href?: string;
  onClick?: () => void;
  icono?: React.ComponentType<{ className?: string }>;
  variante?: 'mar' | 'atardecer' | 'dorado' | 'neutro';
}

export interface MigasPanProps {
  elementos: ElementoMiga[];
  conBotonVolver?: boolean;
  alVolver?: () => void;
  accionPrincipal?: AccionPrincipalMiga;
  className?: string;
}

/**
 * Migas de pan (Breadcrumbs) para pantallas de detalle y navegación jerárquica en ViajaPro.
 *
 * Cumple WCAG 2.1 AA (foco visible, nav semántico, aria-current="page") y estética caribeña.
 */
export function MigasPan({
  elementos,
  conBotonVolver = true,
  alVolver,
  accionPrincipal,
  className = '',
}: MigasPanProps) {
  const router = useRouter();

  const manejarVolver = () => {
    if (alVolver) {
      alVolver();
    } else {
      router.back();
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 bg-white/70 px-4 py-2.5 backdrop-blur-xs transition-colors sm:px-6 dark:border-neutral-800/80 dark:bg-neutral-900/70 ${className}`}
      data-testid="contenedor-migas-pan"
    >
      {/* Ruta y navegación */}
      <nav aria-label="Migas de pan" className="flex min-w-0 items-center gap-1.5 text-xs">
        {/* Botón Volver rápido */}
        {conBotonVolver && (
          <button
            type="button"
            onClick={manejarVolver}
            aria-label="Volver a la vista anterior"
            data-testid="boton-volver-migas"
            className="focus-visible:ring-acento-600 mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        {/* Inicio */}
        <Link
          href="/bandeja"
          title="Ir al inicio"
          aria-label="Inicio"
          className="focus-visible:ring-acento-600 flex items-center gap-1 text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          <Home className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Inicio</span>
        </Link>

        {elementos.map((item, idx) => {
          const esUltimo = idx === elementos.length - 1;
          const Icono = item.icono;

          return (
            <React.Fragment key={`${item.label}-${idx}`}>
              <ChevronRight className="h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-600" />
              {item.href && !esUltimo ? (
                <Link
                  href={item.href}
                  className="focus-visible:ring-acento-600 flex max-w-[140px] items-center gap-1 truncate text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none sm:max-w-[200px] dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  {Icono && <Icono className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={esUltimo ? 'page' : undefined}
                  className={`flex max-w-[180px] items-center gap-1 truncate sm:max-w-[280px] ${
                    esUltimo
                      ? 'font-semibold text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                  data-testid={esUltimo ? 'miga-pagina-actual' : undefined}
                >
                  {Icono && <Icono className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Acción principal contextual */}
      {accionPrincipal && (
        <div className="flex shrink-0 items-center">
          {accionPrincipal.href ? (
            <Link
              href={accionPrincipal.href}
              data-testid="accion-principal-migas"
              className="degradado-mar focus-visible:ring-acento-600 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:outline-none"
            >
              {accionPrincipal.icono && <accionPrincipal.icono className="h-3.5 w-3.5 shrink-0" />}
              <span>{accionPrincipal.label}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={accionPrincipal.onClick}
              data-testid="accion-principal-migas"
              className="degradado-mar focus-visible:ring-acento-600 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:outline-none"
            >
              {accionPrincipal.icono && <accionPrincipal.icono className="h-3.5 w-3.5 shrink-0" />}
              <span>{accionPrincipal.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
