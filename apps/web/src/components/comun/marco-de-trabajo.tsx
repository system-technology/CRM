'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { BarraModulos } from '../bandeja/barra-modulos';
import { esDetalleMovilDeBandeja } from '../../lib/navegacion';
import { useTituloDeDocumento } from '../../lib/use-titulo-de-documento';

/**
 * Marco de las pantallas privadas (ADR-0032): barra lateral en escritorio, barra inferior en móvil
 * y `<main id="contenido">`. Lo monta una sola vez `app/(app)/layout.tsx`; las páginas pintan solo
 * su contenido. La altura y el desplazamiento de la región de trabajo los fija este componente:
 * una página que gestiona su propio scroll interno usa `min-h-0 flex-1 overflow-hidden`.
 */
export function MarcoDeTrabajo({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const titulo = useTituloDeDocumento();
  // En la conversación a pantalla completa no hay barra inferior que reservar.
  const reservaBarraInferior = !esDetalleMovilDeBandeja(pathname);

  return (
    <div className="flex h-[calc(100dvh-var(--altura-banner-cookies,0px))] w-full overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* React 19 eleva <title> al <head> y gana al de `metadata` del layout raíz. */}
      <title>{titulo}</title>
      <BarraModulos />
      <main
        id="contenido"
        className={`flex min-w-0 flex-1 flex-col overflow-y-auto ${
          reservaBarraInferior ? 'pb-14 md:pb-0' : ''
        }`}
      >
        {children}
      </main>
    </div>
  );
}
