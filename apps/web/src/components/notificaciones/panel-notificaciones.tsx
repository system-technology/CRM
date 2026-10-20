'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, AlertTriangle, Clock, Info, CheckCheck, ExternalLink } from 'lucide-react';
import type { AlertaOperativa, SeveridadAlerta } from '../../lib/notificaciones-logica';

interface PanelNotificacionesProps {
  abierto: boolean;
  alCerrar: () => void;
  alertas: AlertaOperativa[];
  alMarcarLeida: (id: string) => void;
  alMarcarTodasLeidas: () => void;
}

export function PanelNotificaciones({
  abierto,
  alCerrar,
  alertas,
  alMarcarLeida,
  alMarcarTodasLeidas,
}: PanelNotificacionesProps) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'todas' | SeveridadAlerta>('todas');

  if (!abierto) return null;

  const alertasFiltradas = alertas.filter((a) => {
    if (filtro === 'todas') return true;
    return a.severidad === filtro;
  });

  const conteoNoLeidas = alertas.filter((a) => !a.leida).length;

  return (
    <div
      className="backdrop-blur-2xs fixed inset-0 z-50 flex items-start justify-end bg-black/40 p-3 sm:p-6"
      onClick={alCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Panel de Notificaciones"
    >
      <div
        className="flex h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl transition-all dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Alertas Operativas
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {conteoNoLeidas} alerta(s) crítica(s) pendientes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {conteoNoLeidas > 0 && (
              <button
                type="button"
                onClick={alMarcarTodasLeidas}
                title="Marcar todas como leídas"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Leídas</span>
              </button>
            )}
            <button
              type="button"
              onClick={alCerrar}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900/50">
          <button
            type="button"
            onClick={() => setFiltro('todas')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'todas'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            Todas ({alertas.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltro('critica')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'critica'
                ? 'bg-red-600 text-white dark:bg-red-500 dark:text-white'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            Críticas ({alertas.filter((a) => a.severidad === 'critica').length})
          </button>
          <button
            type="button"
            onClick={() => setFiltro('advertencia')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filtro === 'advertencia'
                ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-white'
                : 'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            Advertencias ({alertas.filter((a) => a.severidad === 'advertencia').length})
          </button>
        </div>

        {/* Lista de Alertas */}
        <div className="flex-1 scrollbar-thin space-y-2.5 overflow-y-auto p-4">
          {alertasFiltradas.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-neutral-400">
              <CheckCheck className="mb-2 h-8 w-8 text-neutral-300 dark:text-neutral-700" />
              <span>Sin alertas operativas en esta categoría.</span>
            </div>
          ) : (
            alertasFiltradas.map((alerta) => {
              const esCritica = alerta.severidad === 'critica';
              const esAdvertencia = alerta.severidad === 'advertencia';

              return (
                <div
                  key={alerta.id}
                  className={`rounded-xl border p-3.5 transition-all ${
                    !alerta.leida
                      ? esCritica
                        ? 'border-red-200 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20'
                        : esAdvertencia
                          ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
                          : 'border-blue-200 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20'
                      : 'border-neutral-200 bg-white opacity-75 dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        esCritica
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                          : esAdvertencia
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                      }`}
                    >
                      {esCritica ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : esAdvertencia ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        <Info className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          {alerta.titulo}
                        </span>
                        {!alerta.leida && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                        )}
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                        {alerta.mensaje}
                      </p>

                      <div className="mt-3 flex items-center justify-between border-t border-neutral-200/60 pt-2 dark:border-neutral-800/60">
                        <button
                          type="button"
                          onClick={() => {
                            alMarcarLeida(alerta.id);
                            alCerrar();
                            router.push(alerta.href);
                          }}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                            esCritica
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : esAdvertencia
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          <span>{alerta.accionTexto}</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>

                        {!alerta.leida && (
                          <button
                            type="button"
                            onClick={() => alMarcarLeida(alerta.id)}
                            className="text-[11px] font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                          >
                            Descartar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
