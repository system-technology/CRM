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
  ArrowRight,
  CornerDownLeft,
  LayoutGrid,
  FileSpreadsheet,
} from 'lucide-react';
import {
  buscarEnIndiceGlobal,
  type ResultadoBusqueda,
  type CategoriaBusqueda,
} from '../../lib/buscador-global-logica';
import { useFocoModal } from '../../lib/use-foco-modal';

export interface ModalBusquedaGlobalProps {
  abierto: boolean;
  alCerrar: () => void;
}

const CATEGORIA_INFO: Record<
  CategoriaBusqueda,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  modulos: {
    label: 'Módulos del Sistema',
    icon: LayoutGrid,
    color: 'text-amber-500 dark:text-amber-400',
  },
  cotizaciones: {
    label: 'Cotizaciones de Viaje',
    icon: FileSpreadsheet,
    color: 'text-sky-600 dark:text-sky-400',
  },
  acciones: {
    label: 'Acciones Rápidas',
    icon: Zap,
    color: 'text-orange-600 dark:text-orange-400',
  },
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
  oportunidades: {
    label: 'Pipeline / Oportunidades',
    icon: Kanban,
    color: 'text-purple-600 dark:text-purple-400',
  },
  viajes: {
    label: 'Archivos de Viaje (TravelFiles)',
    icon: Briefcase,
    color: 'text-teal-600 dark:text-teal-400',
  },
  catalogo: {
    label: 'Catálogo de Excursiones y Paquetes',
    icon: Package,
    color: 'text-rose-600 dark:text-rose-400',
  },
};

const CHIPS_FILTRO: Array<{ id: 'todas' | CategoriaBusqueda; label: string }> = [
  { id: 'todas', label: 'Todos' },
  { id: 'modulos', label: 'Módulos' },
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'catalogo', label: 'Excursiones' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'acciones', label: 'Acciones' },
];

export function ModalBusquedaGlobal({ abierto, alCerrar }: ModalBusquedaGlobalProps) {
  const router = useRouter();
  const [consulta, setConsulta] = useState('');
  const [filtroActivo, setFiltroActivo] = useState<'todas' | CategoriaBusqueda>('todas');
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto,
    alCerrar,
    elementoInicialRef: inputRef,
  });

  // Reset al abrir
  useEffect(() => {
    if (abierto) {
      setConsulta('');
      setFiltroActivo('todas');
      setIndiceSeleccionado(0);
    }
  }, [abierto]);

  // Resultados agrupados según consulta
  const resultadosAgrupados = useMemo(() => {
    return buscarEnIndiceGlobal(consulta);
  }, [consulta]);

  // Filtrado por chip si aplica
  const resultadosFiltrados = useMemo(() => {
    if (filtroActivo === 'todas') return resultadosAgrupados;
    const filtrado: Partial<Record<CategoriaBusqueda, ResultadoBusqueda[]>> = {};
    filtrado[filtroActivo] = resultadosAgrupados[filtroActivo] ?? [];
    return filtrado as Record<CategoriaBusqueda, ResultadoBusqueda[]>;
  }, [resultadosAgrupados, filtroActivo]);

  // Lista plana para navegación por teclado
  const itemsPlanos = useMemo(() => {
    const ordenCategorias: CategoriaBusqueda[] = [
      'modulos',
      'cotizaciones',
      'acciones',
      'conversaciones',
      'contactos',
      'oportunidades',
      'viajes',
      'catalogo',
    ];
    const lista: ResultadoBusqueda[] = [];
    for (const cat of ordenCategorias) {
      if (resultadosFiltrados[cat]) {
        lista.push(...resultadosFiltrados[cat]);
      }
    }
    return lista;
  }, [resultadosFiltrados]);

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
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos y búsqueda global"
      onKeyDown={manejarKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24"
      data-testid="modal-busqueda-global"
    >
      {/* Telón de fondo con desenfoque suave */}
      <div
        className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs transition-opacity"
        onClick={alCerrar}
        aria-hidden="true"
      />

      {/* Contenedor Modal */}
      <div
        ref={contenedorRef}
        tabIndex={-1}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-amber-400/40 bg-white shadow-2xl transition-all dark:border-amber-500/30 dark:bg-neutral-900"
      >
        {/* Aviso dinámico para lectores de pantalla */}
        <div aria-live="polite" className="sr-only">
          {consulta.trim()
            ? `${itemsPlanos.length} resultados encontrados para ${consulta}`
            : 'Búsqueda global abierta (paleta de comandos). Escribe un término para buscar o navegar.'}
        </div>

        {/* Cabecera / Input */}
        <div className="relative flex items-center border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <Search className="h-5 w-5 text-amber-500 dark:text-amber-400" />
          <input
            ref={inputRef}
            type="text"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setIndiceSeleccionado(0);
            }}
            placeholder="Buscar contactos, chats, excursiones o escribir comando... (Ctrl+K)"
            aria-label="Buscar en ViajaPro"
            data-testid="input-paleta-comandos"
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

        {/* Chips de filtro temático */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto border-b border-neutral-100 px-4 py-2 text-xs select-none dark:border-neutral-800"
          role="tablist"
          aria-label="Filtrar por categoría"
        >
          {CHIPS_FILTRO.map((chip) => {
            const activo = filtroActivo === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => {
                  setFiltroActivo(chip.id);
                  setIndiceSeleccionado(0);
                }}
                className={`focus-visible:ring-acento-600 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                  activo
                    ? 'bg-amber-400 font-semibold text-neutral-950 shadow-2xs dark:bg-amber-400'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Lista de Resultados */}
        <div
          className="max-h-[55vh] overflow-y-auto p-2"
          role="listbox"
          aria-label="Resultados de búsqueda"
        >
          {itemsPlanos.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No se encontraron resultados para &ldquo;
              <span className="font-semibold">{consulta}</span>
              &rdquo;.
            </div>
          ) : (
            Object.entries(resultadosFiltrados).map(([catKey, items]) => {
              if (!items || items.length === 0) return null;
              const cat = catKey as CategoriaBusqueda;
              const info = CATEGORIA_INFO[cat];
              if (!info) return null;
              const Icon = info.icon;

              return (
                <div key={cat} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
                    <Icon className={`h-3.5 w-3.5 ${info.color}`} />
                    <span>{info.label}</span>
                  </div>

                  <div className="space-y-1">
                    {items.map((item) => {
                      const idxGlobal = itemsPlanos.findIndex((p) => p.id === item.id);
                      const esSeleccionado = idxGlobal === indiceSeleccionado;

                      return (
                        <div
                          key={item.id}
                          role="option"
                          aria-selected={esSeleccionado}
                          tabIndex={0}
                          data-testid={`resultado-busqueda-${item.id}`}
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
                          className={`focus-visible:ring-acento-600 flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                            esSeleccionado
                              ? 'border border-amber-400/60 bg-amber-50/80 text-neutral-900 shadow-2xs dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-neutral-50'
                              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                                esSeleccionado
                                  ? 'border-amber-400 bg-white text-amber-600 dark:border-amber-500 dark:bg-neutral-900 dark:text-amber-400'
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
                              <CornerDownLeft className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
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

        {/* Footer con atajos de teclado accesibles */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
          <div className="flex items-center gap-4">
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
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
            ViajaPro Paleta de Comandos
          </span>
        </div>
      </div>
    </div>
  );
}
