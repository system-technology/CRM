'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { inboxApi } from '../../lib/inbox-api';
import { conversacionDelContacto, hrefConversacion } from '../../lib/enlaces-viaje-logica';

interface EnlaceAConversacionProps {
  contactoId: string;
  /** Con qué se busca al contacto en la bandeja: su teléfono (único) o, si no, su nombre. */
  termino: string | null;
  className?: string;
  title?: string;
  'aria-label'?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
}

/**
 * Enlace al chat de UNA persona desde una lista (tarjetas del pipeline, filas de Contactos).
 *
 * Una lista no trae el id de la conversación y pedirlo por fila sería una petición por tarjeta. Así
 * que el id se resuelve al tocar: una búsqueda en la bandeja por el contacto (la misma que usa la
 * fila de enlaces del viaje) y se navega directo a `/bandeja/<id>`. El `href` es un respaldo
 * honesto —la bandeja filtrada por esa persona— para abrir en otra pestaña o si la búsqueda falla.
 */
export function EnlaceAConversacion({
  contactoId,
  termino,
  className,
  title,
  'aria-label': ariaLabel,
  onClick,
  children,
}: EnlaceAConversacionProps) {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  const respaldo = '/bandeja';

  const alTocar = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    const conModificador = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
    if (conModificador || e.defaultPrevented || !termino) return;
    e.preventDefault();
    if (buscando) return;
    setBuscando(true);
    inboxApi
      .consultarBandeja({ filtro: 'TODAS', buscar: termino, limite: 10 })
      .then((pagina) => {
        const id = conversacionDelContacto(pagina.datos, contactoId);
        router.push(id ? hrefConversacion(id) : respaldo);
      })
      .catch((error: unknown) => {
        console.warn('[enlace-conversacion] No se pudo resolver la conversación:', error);
        router.push(respaldo);
      })
      .finally(() => setBuscando(false));
  };

  return (
    <Link
      href={respaldo}
      onClick={alTocar}
      aria-busy={buscando || undefined}
      data-testid="enlace-a-conversacion"
      {...(title ? { title } : {})}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={className}
    >
      {children}
    </Link>
  );
}
