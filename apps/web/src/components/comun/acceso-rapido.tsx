'use client';

import React from 'react';
import Link from 'next/link';

export interface AccionRapidaItem {
  id: string;
  label: string;
  descripcion?: string;
  href?: string;
  onClick?: () => void;
  icono: React.ComponentType<{ className?: string }>;
  destacado?: boolean;
}

export interface AccesoRapidoProps {
  titulo?: string;
  acciones: AccionRapidaItem[];
  className?: string;
}

/**
 * Componente de accesos rápidos a la siguiente acción lógica en el flujo de ventas turísticas.
 *
 * Ejemplo: desde la conversación hacia el cotizador, o desde el cotizador hacia la propuesta en WhatsApp.
 */
export function AccesoRapido({
  titulo = 'Siguiente acción recomendada',
  acciones,
  className = '',
}: AccesoRapidoProps) {
  if (!acciones || acciones.length === 0) return null;

  return (
    <div
      className={`rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3 dark:border-neutral-800/80 dark:bg-neutral-900/50 ${className}`}
      data-testid="contenedor-acceso-rapido"
    >
      {titulo && (
        <p className="mb-2 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
          {titulo}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {acciones.map((acc) => {
          const Icono = acc.icono;
          const contenido = (
            <>
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  acc.destacado
                    ? 'bg-amber-400 text-neutral-950 dark:bg-amber-400'
                    : 'bg-white text-neutral-700 shadow-2xs dark:bg-neutral-800 dark:text-neutral-300'
                }`}
              >
                <Icono className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-left">
                <span className="block truncate text-xs font-semibold">{acc.label}</span>
                {acc.descripcion && (
                  <span className="block truncate text-[10px] opacity-80">{acc.descripcion}</span>
                )}
              </div>
            </>
          );

          const estilo = `focus-visible:ring-acento-600 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 text-xs transition-transform hover:scale-[1.01] focus-visible:ring-2 focus-visible:outline-none ${
            acc.destacado
              ? 'degradado-mar font-semibold text-white shadow-xs'
              : 'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
          }`;

          if (acc.href) {
            return (
              <Link
                key={acc.id}
                href={acc.href}
                data-testid={`acceso-rapido-${acc.id}`}
                className={estilo}
              >
                {contenido}
              </Link>
            );
          }

          return (
            <button
              key={acc.id}
              type="button"
              onClick={acc.onClick}
              data-testid={`acceso-rapido-${acc.id}`}
              className={estilo}
            >
              {contenido}
            </button>
          );
        })}
      </div>
    </div>
  );
}
