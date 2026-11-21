import React from 'react';
import Link from 'next/link';
import { ArrowLeft, UserRound } from 'lucide-react';
import { hrefConversacion } from '../../lib/enlaces-viaje-logica';

export interface BandaDeContextoProps {
  /** Nombre de la persona para quien se cotiza; `null` mientras se lee o si no se conoce. */
  nombre: string | null;
  /** Hay un contacto en la URL pero su nombre aún no llegó: se pinta un esqueleto, no un hueco. */
  cargandoNombre?: boolean;
  /** La conversación desde la que se llegó; `null` si se llegó por otra vía. */
  conversacionId: string | null;
}

/**
 * Dice para quién se cotiza y desde qué chat, con la salida de vuelta al chat. Sin contacto ni
 * conversación en la URL no se pinta nada: no hay contexto que mostrar.
 */
export function BandaDeContexto({
  nombre,
  cargandoNombre = false,
  conversacionId,
}: BandaDeContextoProps) {
  if (!nombre && !cargandoNombre && !conversacionId) return null;

  return (
    <div
      data-testid="banda-de-contexto"
      role="region"
      aria-label="Contexto de la cotización"
      className="border-acento-200 bg-acento-50 dark:border-acento-900/50 dark:bg-acento-950/30 flex items-center justify-between gap-3 rounded-xl border px-3 py-1.5"
    >
      <p className="text-acento-950 dark:text-acento-100 flex min-w-0 items-center gap-2 text-sm font-semibold">
        <UserRound className="text-acento-700 h-4 w-4 shrink-0" aria-hidden="true" />
        {cargandoNombre && !nombre ? (
          <span
            aria-label="Cargando el nombre del cliente"
            className="bg-acento-200 dark:bg-acento-900 h-4 w-32 animate-pulse rounded"
          />
        ) : (
          <span className="min-w-0 truncate" data-testid="contexto-texto">
            {nombre ? `Cotizando para ${nombre}` : 'Cotizando'}
            {conversacionId ? ' · desde la conversación' : ''}
          </span>
        )}
      </p>
      {conversacionId && (
        <Link
          href={hrefConversacion(conversacionId)}
          data-testid="volver-al-chat"
          className="text-acento-800 hover:bg-acento-100 focus-visible:ring-acento-600 dark:text-acento-200 dark:hover:bg-acento-900/50 flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Volver al chat</span>
        </Link>
      )}
    </div>
  );
}
