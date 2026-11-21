import React from 'react';
import Link from 'next/link';
import { Briefcase, FileText, MessageSquare, User } from 'lucide-react';
import type { EnlaceDelViaje } from '../../lib/enlaces-viaje-logica';

const ICONOS = {
  conversacion: MessageSquare,
  contacto: User,
  cotizacion: FileText,
  archivo: Briefcase,
} as const;

const BASE =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-1 text-sm font-semibold';

/**
 * Una fila de enlaces entre las piezas del mismo viaje (conversación, contacto, cotización, file).
 * Es navegación, no una acción: contorno acento tenue y sin relleno, para no competir con la
 * acción principal de la pantalla.
 */
export function EnlacesDelViaje({
  enlaces,
  className = '',
}: {
  enlaces: EnlaceDelViaje[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Piezas de este viaje"
      data-testid="enlaces-del-viaje"
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {enlaces.map((e) => {
        const Icono = ICONOS[e.clave];
        if (e.cargando) {
          return (
            <span
              key={e.clave}
              aria-hidden="true"
              className="h-11 w-32 animate-pulse rounded-lg bg-neutral-100 motion-reduce:animate-none dark:bg-neutral-800"
            />
          );
        }
        if (!e.href) {
          return (
            <span
              key={e.clave}
              data-testid={`enlace-${e.clave}-vacio`}
              className={`${BASE} border-dashed border-neutral-300 font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400`}
            >
              <Icono className="h-3.5 w-3.5" aria-hidden="true" />
              {e.sinDestino ?? e.texto}
            </span>
          );
        }
        return (
          <Link
            key={e.clave}
            href={e.href}
            data-testid={`enlace-${e.clave}`}
            className={`${BASE} border-acento-200 text-acento-700 hover:bg-acento-50 focus-visible:outline-acento-500 dark:border-acento-900/60 dark:text-acento-300 dark:hover:bg-acento-950/40 focus-visible:outline-2 focus-visible:outline-offset-2`}
          >
            <Icono className="h-3.5 w-3.5" aria-hidden="true" />
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
