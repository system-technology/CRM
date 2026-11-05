import React from 'react';
import { AlertTriangle, X, FileText, RefreshCw, RotateCcw } from 'lucide-react';
import type { DetalleErrorEnvio } from '../../lib/errores-de-envio';

export interface AlertaErrorEnvioProps {
  error: DetalleErrorEnvio;
  onDescartar?: () => void;
  onAbrirPlantillas?: () => void;
  onRecargar?: () => void;
  onReintentar?: () => void;
}

/**
 * Alerta accesible para errores de envío en la bandeja (compositor o modales).
 * Garantiza que el asesor comprenda qué ocurrió y cuál es el siguiente paso,
 * sin exponer códigos crudos de error (T-117).
 */
export function AlertaErrorEnvio({
  error,
  onDescartar,
  onAbrirPlantillas,
  onRecargar,
  onReintentar,
}: AlertaErrorEnvioProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="alerta-error-envio-compositor"
      className="relative flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/95 p-3 text-xs text-red-900 shadow-xs dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-red-950 dark:text-red-100">{error.titulo}</p>
          {onDescartar && (
            <button
              type="button"
              onClick={onDescartar}
              aria-label="Cerrar aviso de error"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-100 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-900/50 dark:hover:text-red-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <p className="mt-0.5 text-[11px] leading-relaxed text-red-900/90 dark:text-red-200/90">
          {error.mensaje}
        </p>

        <p className="mt-1 text-[11px] font-medium text-red-800 dark:text-red-300">
          💡 {error.accionSugerida}
        </p>

        {/* Acciones contextuales según el tipo de error */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {error.tipoAccion === 'usar_plantilla' && onAbrirPlantillas && (
            <button
              type="button"
              onClick={onAbrirPlantillas}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Abrir plantillas</span>
            </button>
          )}

          {error.tipoAccion === 'recargar' && onRecargar && (
            <button
              type="button"
              onClick={onRecargar}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-neutral-900 focus:ring-2 focus:ring-neutral-500 focus:outline-hidden dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Recargar chat</span>
            </button>
          )}

          {error.reintentable && onReintentar && (
            <button
              type="button"
              onClick={onReintentar}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reintentar envío</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
