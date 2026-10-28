'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  MessageSquare,
  Users,
  Kanban,
  Briefcase,
  Package,
  Zap,
  FileText,
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';
import {
  buscarEnIndiceGlobal,
  type ResultadoBusqueda,
  type CategoriaBusqueda,
} from '../../lib/buscador-global-logica';
import { useFocoModal } from '../../lib/use-foco-modal';

interface ModalBusquedaGlobalProps {
  abierto: boolean;
  alCerrar: () => void;
}

const CATEGORIA_INFO: Record<
  CategoriaBusqueda,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  acciones: { label: 'Acciones Rápidas', icon: Zap, color: 'text-amber-600 dark:text-amber-400' },
  conversaciones: {
    label: 'Conversaciones WhatsApp',
    icon: MessageSquare,
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  contactos: {
    label: 'Contactos y Viajeros',
    icon: Users,
    color: 'text-blue-600 dark:text-blue-400',
  },
  cotizaciones: {
    label: 'Cotizaciones',
    icon: FileText,
    color: 'text-amber-600 dark:text-amber-400',
  },
  oportunidades: {
    label: 'Pipeline / Oportunidades',
    icon: Kanban,
    color: 'text-purple-600 dark:text-purple-400',
  },
  viajes: {
    label: 'Archivos de Viaje (TravelFiles)',
    icon: Briefcase,
    color: 'text-indigo-600 dark:text-indigo-400',
  },
  catalogo: {
    label: 'Catálogo de Mayoristas',
    icon: Package,
    color: 'text-teal-600 dark:text-teal-400',
  },
};

const PESTANAS_FILTRO: Array<{ id: CategoriaBusqueda | 'todos'; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'conversaciones', label: 'WhatsApp' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'acciones', label: 'Acciones' },
];

export function ModalBusquedaGlobal({ abierto, alCerrar }: ModalBusquedaGlobalProps) {
  const router = useRouter();
  const [consulta, setConsulta] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaBusqueda | 'todos'>('todos');
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto,
    alCerrar,
    elementoInicialRef: inputRef,
  });

  // Enfocar input al abrir
  useEffect(() => {
    if (abierto) {
      setConsulta('');
      setFiltroCategoria('todos');
      setIndiceSeleccionado(0);
    }
  }, [abierto]);

  // Resultados agrupados
  const resultadosAgrupados = useMemo(() => {
    return buscarEnIndiceGlobal(consulta, undefined, 4, filtroCategoria);
  }, [consulta, filtroCategoria]);

  // Lista plana para navegación por teclado
  const itemsPlanos = useMemo(() => {
    const ordenCategorias: CategoriaBusqueda[] = [
      'acciones',
      'conversaciones',
      'contactos',
      'cotizaciones',
      'oportunidades',
      'viajes',
      'catalogo',
    ];
    const lista: ResultadoBusqueda[] = [];
    for (const cat of ordenCategorias) {
      if (resultadosAgrupados[cat]) {
        lista.push(...resultadosAgrupados[cat]);
      }
    }
    return lista;
  }, [resultadosAgrupados]);

  // Manejo de teclado dentro del modal
  const manejarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSeleccionado((prev) => (prev + 1) % Math.max(1, itemsPlanos.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSeleccionado(
        (prev) => (prev - 1 + itemsPlanos.length) % Math.max(1, itemsPlanos.length),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const seleccionado = itemsPlanos[indiceSeleccionado];
      if (seleccionado) {
        alCerrar();
        router.push(seleccionado.href);
      }
    }
  };

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-12 backdrop-blur-xs sm:pt-20"
      onClick={alCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de Comandos y Búsqueda Global"
      data-testid="modal-paleta-comandos"
    >
      <div
        ref={contenedorRef}
        className="anim-modal w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl transition-all dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={manejarKeyDown}
      >
        {/* Aviso dinámico para lectores de pantalla */}
        <div aria-live="polite" className="sr-only">
          {consulta.trim()
            ? `${itemsPlanos.length} resultados encontrados para ${consulta}`
            : 'Búsqueda global abierta. Escribe un término o selecciona una categoría para buscar.'}
        </div>

        {/* Cabecera / Omnibox Input */}
        <div className="relative flex items-center border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <Search className="h-5 w-5 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setIndiceSeleccionado(0);
            }}
            placeholder="Buscar contactos, chats, cotizaciones, paquetes o acciones... (Ctrl+K)"
            className="w-full bg-transparent px-3 text-sm text-neutral-900 outline-hidden placeholder:text-neutral-400 dark:text-neutral-100"
          />
          {consulta ? (
            <button
              type="button"
              onClick={() => {
                setConsulta('');
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="rounded-md p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden rounded-md border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 sm:inline-block dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              ESC
            </kbd>
          )}
        </div>

        {/* Pestañas de Filtro Temático (T-034) */}
        <div className="flex scrollbar-none items-center gap-1.5 overflow-x-auto border-b border-neutral-100 bg-neutral-50/70 px-3 py-2 dark:border-neutral-800/60 dark:bg-neutral-950/40">
          {PESTANAS_FILTRO.map((tab) => {
            const estaActiva = filtroCategoria === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`filtro-categoria-${tab.id}`}
                onClick={() => {
                  setFiltroCategoria(tab.id);
                  setIndiceSeleccionado(0);
                  inputRef.current?.focus();
                }}
                className={`focus-visible:ring-acento-600 inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                  estaActiva
                    ? 'bg-acento-700 dark:bg-acento-600 text-white shadow-xs'
                    : 'text-neutral-600 hover:bg-neutral-200/70 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Lista de Resultados */}
        <div className="max-h-[55vh] scrollbar-thin overflow-y-auto p-2">
          {itemsPlanos.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No se encontraron resultados para &ldquo;
              <span className="font-semibold">{consulta}</span>
              &rdquo;.
            </div>
          ) : (
            Object.entries(resultadosAgrupados).map(([catKey, items]) => {
              if (items.length === 0) return null;
              const cat = catKey as CategoriaBusqueda;
              const info = CATEGORIA_INFO[cat];
              const Icon = info.icon;

              return (
                <div key={cat} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
                    <Icon className={`h-3.5 w-3.5 ${info.color}`} />
                    <span>{info.label}</span>
                  </div>

                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const idxGlobal = itemsPlanos.findIndex((p) => p.id === item.id);
                      const esSeleccionado = idxGlobal === indiceSeleccionado;

                      return (
                        <div
                          key={item.id}
                          role="option"
                          aria-selected={esSeleccionado}
                          tabIndex={0}
                          onClick={() => {
                            alCerrar();
                            router.push(item.href);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              alCerrar();
                              router.push(item.href);
                            }
                          }}
                          onMouseEnter={() => setIndiceSeleccionado(idxGlobal)}
                          className={`focus-visible:ring-acento-600 flex min-h-[44px] cursor-pointer items-center justify-between rounded-xl px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                            esSeleccionado
                              ? 'bg-sky-50 text-neutral-900 ring-1 ring-amber-400/50 dark:bg-sky-950/60 dark:text-neutral-50 dark:ring-amber-500/50'
                              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                                esSeleccionado
                                  ? 'border-acento-200 text-acento-700 dark:border-acento-800 dark:text-acento-400 bg-white dark:bg-neutral-900'
                                  : 'border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-semibold">
                                  {item.titulo}
                                </span>
                                {item.etiquetaExtra && (
                                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                    {item.etiquetaExtra}
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                {item.subtitulo}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 pl-2">
                            {esSeleccionado && (
                              <CornerDownLeft className="text-acento-600 dark:text-acento-400 h-3.5 w-3.5" />
                            )}
                            <ArrowRight className="h-3.5 w-3.5 text-neutral-400 opacity-60" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer con atajos de navegación rápida */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold dark:border-neutral-700 dark:bg-neutral-800">
                ↑↓
              </kbd>{' '}
              Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold dark:border-neutral-700 dark:bg-neutral-800">
                ↵
              </kbd>{' '}
              Seleccionar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold dark:border-neutral-700 dark:bg-neutral-800">
                ESC
              </kbd>{' '}
              Cerrar
            </span>
          </div>
          <span className="hidden text-[10px] text-neutral-400 sm:inline-block">
            Paleta de Comandos · ViajaPro
          </span>
        </div>
      </div>
    </div>
  );
}
