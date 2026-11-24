'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { BarraModulos } from '../bandeja/barra-modulos';
import { CabeceraMovil } from './cabecera-movil';
import { PieDePaginaPrivacidad } from '../privacidad/pie-de-pagina-privacidad';
import { esDetalleMovilDeBandeja, moduloActivo, tituloDeDocumento } from '../../lib/navegacion';
import { useTituloDeDocumento } from '../../lib/use-titulo-de-documento';
import { ProveedorDeTituloDeDetalle } from '../../lib/titulo-de-detalle';

/**
 * Marco de las pantallas privadas (ADR-0032): barra lateral en escritorio, barra inferior en móvil
 * y `<main id="contenido">`. Lo monta una sola vez `app/(app)/layout.tsx`; las páginas pintan solo
 * su contenido. La altura y el desplazamiento de la región de trabajo los fija este componente:
 * una página que gestiona su propio scroll interno usa `min-h-0 flex-1 overflow-hidden`.
 *
 * Aquí hay UN solo desplazamiento: el de `main`. El pie legal vive dentro de `main`, tras el
 * contenido (`basis-full` mantiene la página a la altura de la región), y el layout raíz oculta el
 * suyo cuando el marco está presente (`data-marco`). En la bandeja no se monta: es de pantalla
 * completa, con su propio scroll, y un pie bajo el compositor la haría desplazable.
 */
export function MarcoDeTrabajo({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tituloDelModulo = useTituloDeDocumento();
  // Lo que una pantalla de detalle quiera poner en la pestaña (T-633, ADR-0032 §4).
  const [detalle, setDetalle] = React.useState<string | null>(null);
  const titulo = detalle ? tituloDeDocumento(detalle) : tituloDelModulo;
  // En la conversación a pantalla completa no hay barra inferior que reservar.
  const reservaBarraInferior = !esDetalleMovilDeBandeja(pathname);
  const conPie = moduloActivo(pathname)?.id !== 'conversaciones';

  return (
    <div
      data-marco
      className="flex h-[calc(100dvh-var(--altura-banner-cookies,0px))] w-full overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100"
    >
      {/* React 19 eleva <title> al <head> y gana al de `metadata` del layout raíz. */}
      <title>{titulo}</title>
      <BarraModulos />
      {/* Columna de trabajo: en móvil, cabecera de 44 px con la lupa y debajo la región `main`. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CabeceraMovil />
        <main
          id="contenido"
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto ${
            reservaBarraInferior ? 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0' : ''
          }`}
        >
          {/* El detalle avisa del nombre de lo que se ve; el marco sigue pintando el `<title>`. */}
          <ProveedorDeTituloDeDetalle fijar={setDetalle}>
            {conPie ? (
              <>
                <div className="flex shrink-0 grow basis-full flex-col">{children}</div>
                <PieDePaginaPrivacidad />
              </>
            ) : (
              children
            )}
          </ProveedorDeTituloDeDetalle>
        </main>
      </div>
    </div>
  );
}
