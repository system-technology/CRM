'use client';

import React, { useMemo } from 'react';
import {
  CATEGORIAS_RESPUESTA_RAPIDA,
  interpolarVariables,
  type ContextoInterpolacion,
  type RespuestaRapida,
} from '../../lib/respuestas-rapidas-logica';
import { Zap, CornerDownLeft, X } from 'lucide-react';

export interface MenuRespuestasRapidasProps {
  respuestas: RespuestaRapida[];
  query: string;
  contexto: ContextoInterpolacion;
  indiceSeleccionado: number;
  onSeleccionar: (respuesta: RespuestaRapida, textoInterpolado: string) => void;
  onCerrar: () => void;
}

export function MenuRespuestasRapidas({
  respuestas,
  query,
  contexto,
  indiceSeleccionado,
  onSeleccionar,
  onCerrar,
}: MenuRespuestasRapidasProps) {
  // Pre-calcular textos interpolados para la vista previa
  const respuestasConPreview = useMemo(() => {
    return respuestas.map((r) => ({
      item: r,
      textoInterpolado: interpolarVariables(r.contenido, contexto),
    }));
  }, [respuestas, contexto]);

  return (
    <div
      role="dialog"
      aria-label="Menú de respuestas rápidas"
      className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-xl rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-2xl backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95"
    >
      {/* Cabecera del menú flotante */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Zap className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100">
            Respuestas Rápidas
          </span>
          {query && (
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              /{query}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-neutral-400 sm:inline">
            ↑↓ para moverte · Enter para insertar
          </span>
          <button
            type="button"
            onClick={onCerrar}
            className="flex h-8 min-h-[44px] w-8 min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar respuestas rápidas"
            title="Cerrar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Lista de opciones seleccionables */}
      <div
        role="listbox"
        id="lista-respuestas-rapidas"
        aria-label="Respuestas rápidas disponibles"
        className="max-h-64 overflow-y-auto p-1 focus:outline-none"
      >
        {respuestasConPreview.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No se encontraron respuestas que coincidan con «/{query}».
            </p>
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
              Presiona <kbd className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">Esc</kbd>{' '}
              para continuar escribiendo texto libre.
            </p>
          </div>
        ) : (
          respuestasConPreview.map(({ item, textoInterpolado }, index) => {
            const estaSeleccionado = index === indiceSeleccionado;
            const cat = CATEGORIAS_RESPUESTA_RAPIDA.find((c) => c.id === item.categoria);

            return (
              <div
                key={item.id}
                role="option"
                id={`opcion-rr-${item.id}`}
                aria-selected={estaSeleccionado}
                onClick={() => onSeleccionar(item, textoInterpolado)}
                className={`group flex min-h-[44px] cursor-pointer flex-col justify-center rounded-xl p-2.5 transition-colors ${
                  estaSeleccionado
                    ? 'bg-acento-50 ring-acento-300 dark:bg-acento-950/40 dark:ring-acento-800 text-neutral-900 ring-1 dark:text-neutral-100'
                    : 'text-neutral-700 hover:bg-neutral-100/80 dark:text-neutral-300 dark:hover:bg-neutral-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-acento-700 dark:text-acento-400 font-mono text-xs font-bold">
                      /{item.atajo}
                    </span>
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      {item.titulo}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {cat && (
                      <span className="hidden rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 sm:inline-flex dark:bg-neutral-800 dark:text-neutral-400">
                        {cat.icono} {cat.etiqueta}
                      </span>
                    )}
                    {estaSeleccionado && (
                      <span className="text-acento-700 dark:text-acento-400 flex items-center gap-1 text-[10px] font-semibold">
                        <CornerDownLeft className="h-3 w-3" />
                        <span className="hidden sm:inline">Insertar</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Vista previa con variables ya interpoladas ({nombre}, {asesor}, etc.) */}
                <p className="mt-1 line-clamp-2 text-[11px] text-neutral-500 group-hover:text-neutral-700 dark:text-neutral-400 dark:group-hover:text-neutral-300">
                  {textoInterpolado}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
