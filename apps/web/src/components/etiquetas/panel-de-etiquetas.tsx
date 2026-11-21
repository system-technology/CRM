'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, RefreshCw, Search, Settings2 } from 'lucide-react';
import type { Etiqueta } from '@viajapro/contracts';
import type { CatalogoDeEtiquetas } from '../../lib/use-catalogo-de-etiquetas';
import { estiloDeColor } from '../../lib/etiquetas-logica';
import { useFocoModal } from '../../lib/use-foco-modal';

export interface PanelDeEtiquetasProps {
  /** Nombre accesible y título visible: «Etiquetas», «Filtrar por etiqueta». */
  titulo: string;
  catalogo: CatalogoDeEtiquetas;
  /** Ids marcados: las de la conversación (poner/quitar) o las del filtro. */
  seleccionadas: ReadonlySet<string>;
  /** Ids con una petición en vuelo: la fila se marca ocupada. */
  pendientes?: ReadonlySet<string>;
  onAlternar: (etiqueta: Etiqueta) => void;
  onCerrar: () => void;
  /** Con `etiquetas.administrar`: «Gestionar etiquetas» y «Crear etiqueta». */
  puedeAdministrar: boolean;
  /** Controles propios del modo (p. ej. «Cualquiera de estas / Todas estas» del filtro). */
  extra?: React.ReactNode;
  textoCerrar?: string;
  testId?: string;
  /** Lado del botón al que se ancla el popover en escritorio. */
  alineacion?: 'izquierda' | 'derecha';
}

/** Con más etiquetas que estas aparece el buscador (HU §4.2: combobox con buscador en escritorio). */
const UMBRAL_DE_BUSCADOR = 6;

/**
 * El contenido de «poner y quitar» y de «filtrar» (HU-inbox-1 §4.2 y §4.3): en móvil, una hoja
 * inferior con filas de 48 px; desde `md`, un popover anclado a su botón. Un solo DOM, dos
 * presentaciones por CSS. Cada fila es `role="menuitemcheckbox"` con `aria-checked`; flechas mueven,
 * Enter o Espacio marcan, Esc cierra y devuelve el foco al botón que lo abrió.
 *
 * Estados: cargando (esqueleto), error (qué pasó + Reintentar), vacío (qué hacer) y lista.
 */
export function PanelDeEtiquetas({
  titulo,
  catalogo,
  seleccionadas,
  pendientes,
  onAlternar,
  onCerrar,
  puedeAdministrar,
  extra,
  textoCerrar = 'Listo',
  testId = 'panel-de-etiquetas',
  alineacion = 'derecha',
}: PanelDeEtiquetasProps) {
  const contenedorRef = useFocoModal<HTMLDivElement>({ abierto: true, alCerrar: onCerrar });
  const [busqueda, setBusqueda] = useState('');
  const [activo, setActivo] = useState(0);
  const filasRef = useRef<(HTMLButtonElement | null)[]>([]);

  const { estado, etiquetas } = catalogo;
  const conBuscador = etiquetas.length > UMBRAL_DE_BUSCADOR;
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? etiquetas.filter((e) => e.nombre.toLowerCase().includes(q)) : etiquetas;
  }, [etiquetas, busqueda]);

  const moverA = (indice: number) => {
    const limitado = Math.max(0, Math.min(indice, visibles.length - 1));
    setActivo(limitado);
    filasRef.current[limitado]?.focus();
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moverA(activo + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moverA(activo - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moverA(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      moverA(visibles.length - 1);
    }
  };

  return (
    <>
      {/* Fondo: oscurece en móvil; en escritorio solo recoge el clic fuera para cerrar. */}
      <div
        aria-hidden="true"
        data-testid={`${testId}-fondo`}
        onClick={onCerrar}
        className="fixed inset-0 z-50 bg-black/40 md:bg-transparent"
      />
      <div
        ref={contenedorRef}
        role="dialog"
        aria-label={titulo}
        data-testid={testId}
        // Las teclas del selector no son atajos de la lista ni del chat (j, k, e…): se quedan aquí.
        onKeyDown={(e) => e.stopPropagation()}
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-2xl md:absolute md:inset-x-auto md:top-full ${alineacion === 'derecha' ? 'md:right-0' : 'md:left-0'} md:bottom-auto md:mt-1 md:max-h-[22rem] md:w-72 md:rounded-xl dark:border-neutral-700 dark:bg-neutral-900`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-4 py-1 dark:border-neutral-800">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{titulo}</h3>
          <button
            type="button"
            onClick={onCerrar}
            data-testid={`${testId}-cerrar`}
            className="text-acento-700 dark:text-acento-300 focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-3 text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px]"
          >
            {textoCerrar}
          </button>
        </div>

        {conBuscador && estado === 'listo' && (
          <div className="relative shrink-0 border-b border-neutral-100 p-2 dark:border-neutral-800">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setActivo(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  moverA(0);
                }
              }}
              aria-label="Buscar etiqueta"
              placeholder="Buscar etiqueta…"
              className="focus:border-acento-600 focus:ring-acento-600/30 min-h-[44px] w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pr-3 pl-8 text-base text-neutral-900 placeholder-neutral-500 focus:bg-white focus:ring-2 focus:outline-none md:min-h-[32px] md:text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={catalogo.recargando}>
          {estado === 'cargando' && (
            <div data-testid={`${testId}-cargando`} className="space-y-1.5 p-3" role="status">
              <span className="sr-only">Cargando etiquetas…</span>
              {[1, 2, 3].map((i) => (
                <div key={i} className="esqueleto-brillo h-12 rounded-lg md:h-9" />
              ))}
            </div>
          )}

          {estado === 'error' && (
            <div
              role="alert"
              data-testid={`${testId}-error`}
              className="border-alerta-600/30 bg-alerta-50 text-alerta-700 dark:bg-alerta-950/30 dark:text-alerta-300 m-3 rounded-xl border p-3 text-center text-xs"
            >
              <AlertTriangle aria-hidden="true" className="mx-auto h-5 w-5" />
              <p className="mt-1.5 font-semibold">
                No se pudieron cargar las etiquetas. Revisa tu conexión.
              </p>
              <button
                type="button"
                onClick={() => void catalogo.recargar()}
                className="bg-alerta-700 focus-visible:ring-acento-600 mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 font-semibold text-white focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px]"
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Reintentar
              </button>
            </div>
          )}

          {estado === 'listo' && etiquetas.length === 0 && (
            <div data-testid={`${testId}-vacio`} className="p-4 text-center text-xs">
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                Tu agencia no tiene etiquetas.
              </p>
              {puedeAdministrar ? (
                <Link
                  href="/configuracion?pestana=etiquetas"
                  onClick={onCerrar}
                  className="boton-primario mt-2 inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-semibold md:min-h-[32px]"
                >
                  Crear etiqueta
                </Link>
              ) : (
                <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                  Pídele a quien administra la agencia que cree una.
                </p>
              )}
            </div>
          )}

          {estado === 'listo' && etiquetas.length > 0 && (
            <div
              role="menu"
              aria-label={titulo}
              onKeyDown={alTeclear}
              data-testid={`${testId}-lista`}
              className="p-1.5"
            >
              {visibles.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-neutral-600 dark:text-neutral-400">
                  Ninguna etiqueta coincide con la búsqueda.
                </p>
              )}
              {visibles.map((e, i) => {
                const marcada = seleccionadas.has(e.id);
                const ocupada = pendientes?.has(e.id) ?? false;
                const estilo = estiloDeColor(e.color);
                return (
                  <button
                    key={e.id}
                    ref={(el) => {
                      filasRef.current[i] = el;
                    }}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={marcada}
                    aria-busy={ocupada}
                    tabIndex={i === activo ? 0 : -1}
                    data-testid="opcion-de-etiqueta"
                    data-etiqueta-id={e.id}
                    onFocus={() => setActivo(i)}
                    onClick={() => onAlternar(e)}
                    className={`focus-visible:ring-acento-600 flex min-h-[48px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-neutral-900 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset md:min-h-[36px] md:text-xs dark:text-neutral-100 dark:hover:bg-neutral-800 ${
                      ocupada ? 'opacity-70' : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                        marcada
                          ? 'border-acento-700 bg-acento-700 text-white'
                          : 'border-neutral-400 bg-white dark:border-neutral-500 dark:bg-neutral-900'
                      }`}
                    >
                      {marcada && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${estilo.punto}`}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{e.nombre}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {extra && (
          <div className="shrink-0 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
            {extra}
          </div>
        )}

        {puedeAdministrar && (
          <Link
            href="/configuracion?pestana=etiquetas"
            onClick={onCerrar}
            data-testid={`${testId}-gestionar`}
            className="text-acento-700 dark:text-acento-300 focus-visible:ring-acento-600 flex min-h-[48px] shrink-0 items-center gap-2 border-t border-neutral-200 px-4 text-sm font-semibold hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset md:min-h-[36px] md:text-xs dark:border-neutral-800 dark:hover:bg-neutral-800"
          >
            <Settings2 aria-hidden="true" className="h-4 w-4" />
            Gestionar etiquetas
          </Link>
        )}
      </div>
    </>
  );
}
