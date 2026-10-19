import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { MensajeErrorDetallado } from '../../lib/estados-ui-logica';

/**
 * Esqueleto para el detalle de una conversación en la Bandeja (0c.25).
 * Sustituye el spinner centrado por la silueta visual del chat.
 */
export function EsqueletoConversacion() {
  return (
    <div
      className="flex h-full w-full flex-col bg-neutral-50/40 select-none dark:bg-neutral-950/20"
      aria-busy="true"
      aria-label="Cargando conversación"
    >
      {/* Cabecera del chat */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-8 w-8 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        </div>
      </div>

      {/* Flujo de mensajes con burbujas alternadas */}
      <div className="flex-1 space-y-4 overflow-hidden p-6">
        {/* Mensaje entrante */}
        <div className="flex items-start gap-2.5">
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
          <div className="max-w-md space-y-2 rounded-2xl rounded-tl-sm bg-white p-4 shadow-2xs dark:bg-neutral-900">
            <div className="h-3 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-3 w-36 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>

        {/* Mensaje saliente */}
        <div className="flex justify-end">
          <div className="max-w-md space-y-2 rounded-2xl rounded-tr-sm bg-purple-100/60 p-4 dark:bg-purple-950/30">
            <div className="h-3 w-40 animate-pulse rounded bg-purple-200/80 dark:bg-purple-800/50" />
            <div className="h-3 w-56 animate-pulse rounded bg-purple-200/60 dark:bg-purple-800/40" />
          </div>
        </div>

        {/* Tarjeta comercial o cotización */}
        <div className="mx-auto max-w-sm rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="h-3.5 w-28 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="mt-2.5 h-3 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="mt-3 flex justify-between">
            <div className="h-3 w-16 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-3 w-20 animate-pulse rounded bg-purple-200 dark:bg-purple-800" />
          </div>
        </div>

        {/* Otro mensaje entrante */}
        <div className="flex items-start gap-2.5">
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
          <div className="max-w-sm space-y-2 rounded-2xl rounded-tl-sm bg-white p-4 shadow-2xs dark:bg-neutral-900">
            <div className="h-3 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          </div>
        </div>
      </div>

      {/* Barra de envío */}
      <div className="border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-10 w-10 animate-pulse rounded-xl bg-purple-200 dark:bg-purple-900" />
        </div>
      </div>
    </div>
  );
}

/**
 * Esqueleto para el tablero Kanban en Pipeline (0c.25).
 * Sustituye el spinner centrado por 4 columnas pulse.
 */
export function EsqueletoKanban() {
  return (
    <div
      className="flex flex-1 overflow-x-auto overflow-y-hidden p-6 select-none"
      aria-busy="true"
      aria-label="Cargando tablero kanban"
    >
      <div className="flex min-w-full space-x-4">
        {[1, 2, 3, 4].map((col) => (
          <div
            key={col}
            className="flex h-full max-w-[320px] min-w-[280px] flex-1 flex-col rounded-2xl border border-neutral-200/90 bg-neutral-50/60 p-3.5 dark:border-neutral-800 dark:bg-neutral-900/40"
          >
            {/* Cabecera de columna */}
            <div className="border-b border-neutral-200/80 pb-3 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                <div className="h-4 w-6 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
              </div>
              <div className="mt-2 h-2.5 w-32 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>

            {/* Tarjetas esqueleto */}
            <div className="mt-3 space-y-3 overflow-hidden">
              {[1, 2, 3].map((card) => (
                <div
                  key={card}
                  className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="h-3.5 w-36 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                  <div className="mt-2 h-2.5 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                  <div className="mt-3 flex items-center justify-between pt-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-purple-100 dark:bg-purple-950/60" />
                    <div className="h-5 w-5 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Esqueleto para la cuadrícula de paquetes del Catálogo (0c.25).
 * Sustituye el spinner centrado por 6 tarjetas pulse en grid.
 */
export function EsqueletoGridTarjetas({ cantidad = 6 }: { cantidad?: number }) {
  return (
    <div
      className="grid gap-5 select-none sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Cargando catálogo"
    >
      {Array.from({ length: cantidad }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          {/* Imagen esqueleto */}
          <div className="h-40 w-full animate-pulse bg-neutral-200 dark:bg-neutral-800" />
          {/* Contenido */}
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
              <div className="h-3 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
            <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="flex items-baseline justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <div className="h-2.5 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="h-5 w-24 animate-pulse rounded bg-purple-200 dark:bg-purple-900" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Esqueleto para tablas de datos (Contactos, Miembros, Cotizaciones) (0c.25).
 */
export function EsqueletoTabla({ filas = 6 }: { filas?: number }) {
  return (
    <div
      className="w-full space-y-2 p-4 select-none"
      aria-busy="true"
      aria-label="Cargando registros"
    >
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50/60 p-3.5 dark:border-neutral-800/60 dark:bg-neutral-900/40"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-36 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
          </div>
          <div className="hidden space-y-1.5 sm:block">
            <div className="h-3 w-28 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
        </div>
      ))}
    </div>
  );
}

/**
 * Esqueleto para Expedientes Operativos de Viaje (0c.25).
 */
export function EsqueletoExpediente() {
  return (
    <div
      className="flex h-full w-full select-none"
      aria-busy="true"
      aria-label="Cargando expedientes de viaje"
    >
      {/* Sidebar esqueleto */}
      <div className="w-80 shrink-0 space-y-3 border-r border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="h-8 w-full animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl p-3">
            <div className="flex justify-between">
              <div className="h-3 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
              <div className="h-3 w-12 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
            </div>
            <div className="h-3.5 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          </div>
        ))}
      </div>

      {/* Detalle central esqueleto */}
      <div className="flex-1 space-y-6 p-6">
        <div className="flex justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-3 w-32 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
          <div className="h-7 w-28 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((k) => (
            <div
              key={k}
              className="h-20 animate-pulse rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
      </div>
    </div>
  );
}

/**
 * Esqueleto para Reportes y KPIs (0c.25).
 */
export function EsqueletoReportes() {
  return (
    <div
      className="space-y-6 select-none"
      aria-busy="true"
      aria-label="Cargando reportes comerciales"
    >
      {/* 4 KPIs principales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((kpi) => (
          <div
            key={kpi}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex justify-between">
              <div className="h-3 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
              <div className="h-4 w-10 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
            </div>
            <div className="mt-3 h-6 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ))}
      </div>

      {/* Gráficos y tablas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        <div className="h-64 animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
      </div>
    </div>
  );
}

/**
 * Componente descriptivo y accesible de error (0c.25).
 * Informa qué pasó, la causa y la acción recomendada, con botón táctil >= 44px.
 */
export function AvisoErrorAccionable({
  error,
  onReintentar,
  onAccionSecundaria,
  etiquetaSecundaria,
}: {
  error: MensajeErrorDetallado;
  onReintentar?: () => void;
  onAccionSecundaria?: () => void;
  etiquetaSecundaria?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-alerta-200 bg-alerta-50/90 text-alerta-950 dark:border-alerta-900/50 dark:bg-alerta-950/40 dark:text-alerta-200 mx-auto my-4 max-w-xl rounded-2xl border p-5 shadow-sm"
    >
      <div className="flex items-start gap-3.5">
        <div className="bg-alerta-100 text-alerta-700 dark:bg-alerta-900/60 dark:text-alerta-300 mt-0.5 shrink-0 rounded-xl p-2">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            {error.titulo}
          </h3>
          <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">
            <span className="font-semibold">Qué pasó: </span>
            {error.quePaso}
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              Qué hacer:{' '}
            </span>
            {error.queHacer}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {error.esReintentable && onReintentar && (
              <button
                type="button"
                onClick={onReintentar}
                className="bg-acento-700 hover:bg-acento-800 focus-visible:ring-acento-600 flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reintentar</span>
              </button>
            )}

            {onAccionSecundaria && etiquetaSecundaria && (
              <button
                type="button"
                onClick={onAccionSecundaria}
                className="flex min-h-[44px] items-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                {etiquetaSecundaria}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
