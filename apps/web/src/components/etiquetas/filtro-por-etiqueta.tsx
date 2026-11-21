'use client';

import React, { useEffect, useState } from 'react';
import { Info, Tag, X } from 'lucide-react';
import type { ModoDeFiltroDeEtiquetas } from '@viajapro/contracts';
import type { FiltroDeEtiquetas } from '../../lib/use-filtro-de-etiquetas';
import type { CatalogoDeEtiquetas } from '../../lib/use-catalogo-de-etiquetas';
import { textoSinResultadosDelFiltro } from '../../lib/etiquetas-logica';
import { ChipDeEtiqueta } from './chip-de-etiqueta';
import { PanelDeEtiquetas } from './panel-de-etiquetas';

const OPCIONES_DE_MODO: { valor: ModoDeFiltroDeEtiquetas; texto: string }[] = [
  { valor: 'cualquiera', texto: 'Cualquiera de estas' },
  { valor: 'todas', texto: 'Todas estas' },
];

/**
 * El botón «Etiquetas» de la barra de filtros de la bandeja y su selector (HU-inbox-1 §4.3): hoja
 * inferior en móvil, popover en escritorio. Aplica al marcar; «Listo» solo cierra. Con dos o más
 * etiquetas ofrece «Cualquiera de estas» (o) o «Todas estas» (y); por defecto, cualquiera.
 */
export function BotonFiltroPorEtiqueta({
  filtro,
  catalogo,
  puedeAdministrar,
}: {
  filtro: FiltroDeEtiquetas;
  catalogo: CatalogoDeEtiquetas;
  puedeAdministrar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const { recargar } = catalogo;

  // Al abrir se revalida el catálogo: una etiqueta borrada por otra persona sale del filtro ya.
  useEffect(() => {
    if (abierto) void recargar();
  }, [abierto, recargar]);

  const marcadas = new Set(filtro.ids);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        data-testid="boton-filtro-etiquetas"
        className={`focus-visible:ring-acento-600 flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px] ${
          filtro.ids.length > 0
            ? 'border-acento-700 bg-acento-50 text-acento-800 dark:bg-acento-950/40 dark:text-acento-200'
            : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
        }`}
      >
        <Tag aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Etiquetas</span>
        {filtro.ids.length > 0 && (
          <span
            data-testid="cuenta-filtro-etiquetas"
            className="bg-acento-700 rounded-full px-1.5 text-[10px] font-bold text-white"
          >
            <span className="sr-only">{filtro.ids.length} en el filtro: </span>
            <span aria-hidden="true">{filtro.ids.length}</span>
          </span>
        )}
      </button>

      {abierto && (
        <PanelDeEtiquetas
          titulo="Filtrar por etiqueta"
          catalogo={catalogo}
          seleccionadas={marcadas}
          onAlternar={(e) => filtro.alternar(e.id)}
          onCerrar={() => setAbierto(false)}
          puedeAdministrar={puedeAdministrar}
          testId="selector-de-filtro-de-etiquetas"
          extra={
            filtro.ids.length >= 2 ? (
              <div role="radiogroup" aria-label="Cómo combinar las etiquetas" className="space-y-1">
                {OPCIONES_DE_MODO.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    role="radio"
                    aria-checked={filtro.modo === o.valor}
                    onClick={() => filtro.cambiarModo(o.valor)}
                    data-testid={`modo-${o.valor}`}
                    className="focus-visible:ring-acento-600 flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm text-neutral-900 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px] md:text-xs dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        filtro.modo === o.valor
                          ? 'border-acento-700'
                          : 'border-neutral-400 dark:border-neutral-500'
                      }`}
                    >
                      {filtro.modo === o.valor && (
                        <span className="bg-acento-700 h-2 w-2 rounded-full" />
                      )}
                    </span>
                    {o.texto}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

/**
 * La fila de chips quitables encima de la lista mientras el filtro está activo (HU §4.1), con
 * «Quitar filtro», y el aviso cuando una etiqueta del filtro ya no existe.
 */
export function BarraDeFiltroDeEtiquetas({
  filtro,
  catalogo,
}: {
  filtro: FiltroDeEtiquetas;
  catalogo: CatalogoDeEtiquetas;
}) {
  if (filtro.ids.length === 0 && !filtro.aviso) return null;
  const nombresDesconocidos = filtro.ids.length > filtro.seleccionadas.length;
  return (
    <div data-testid="barra-filtro-etiquetas" className="space-y-1.5">
      {filtro.aviso && (
        <div
          role="status"
          data-testid="aviso-etiqueta-borrada"
          className="border-aviso-600/40 bg-aviso-50 text-aviso-700 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium dark:bg-amber-950/40 dark:text-amber-200"
        >
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">{filtro.aviso}</p>
          <button
            type="button"
            onClick={filtro.descartarAviso}
            aria-label="Cerrar aviso"
            className="focus-visible:ring-acento-600 -my-2 -mr-1.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none md:min-h-[28px] md:min-w-[28px]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}
      {filtro.ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
          {filtro.seleccionadas.map((e) => (
            <ChipDeEtiqueta
              key={e.id}
              etiqueta={e}
              anchoMaximo="fila"
              onQuitar={() => filtro.quitar(e.id)}
            />
          ))}
          {nombresDesconocidos && catalogo.estado !== 'listo' && (
            <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
              {filtro.ids.length === 1
                ? '1 etiqueta en el filtro'
                : `${filtro.ids.length} etiquetas en el filtro`}
            </span>
          )}
          <button
            type="button"
            onClick={filtro.limpiar}
            data-testid="quitar-filtro-etiquetas"
            aria-label="Quitar el filtro de etiquetas"
            className="focus-visible:ring-acento-600 ml-auto flex min-h-[44px] items-center rounded-lg px-2 text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px] dark:text-neutral-300 dark:hover:text-neutral-100"
          >
            Quitar filtro
          </button>
        </div>
      )}
    </div>
  );
}

/** «Ninguna conversación tiene “Pagado”.» + «Quitar filtro»: el estado de filtro sin resultados. */
export function SinResultadosDelFiltro({ filtro }: { filtro: FiltroDeEtiquetas }) {
  return (
    <div data-testid="filtro-etiquetas-sin-resultados" className="p-8 text-center text-xs">
      <p className="font-semibold text-neutral-800 dark:text-neutral-200">
        {filtro.seleccionadas.length > 0
          ? textoSinResultadosDelFiltro(filtro.seleccionadas, filtro.modo)
          : 'Ninguna conversación tiene las etiquetas elegidas.'}
      </p>
      <button
        type="button"
        onClick={filtro.limpiar}
        className="boton-secundario focus-visible:ring-acento-600 mt-3 inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px]"
      >
        Quitar filtro
      </button>
    </div>
  );
}
