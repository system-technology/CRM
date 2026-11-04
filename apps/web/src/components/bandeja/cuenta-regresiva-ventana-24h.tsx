'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Lock, PlusCircle, ShieldCheck } from 'lucide-react';
import {
  evaluarReaperturaConPlantilla,
  type EstadoCuentaRegresiva24h,
  type PlantillaResumenReapertura,
} from '../../lib/ventana-24h';

export interface InsigniaCuentaRegresiva24hProps {
  estado: EstadoCuentaRegresiva24h;
}

/**
 * Insignia compacta de cabecera que muestra horas y minutos restantes,
 * cambia a ámbar bajo 2 horas y a «Cerrada» al vencer (T-113).
 */
export function InsigniaCuentaRegresiva24h({ estado }: InsigniaCuentaRegresiva24hProps) {
  if (estado.cerrada) {
    return (
      <span
        data-testid="insignia-ventana-24h"
        data-nivel="cerrada"
        title={estado.explicacion}
        className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-neutral-100 px-1.5 py-1 text-[10px] font-semibold text-neutral-700 sm:text-[11px] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
      >
        <Lock className="h-3 w-3 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
        <span className="hidden sm:inline">24h </span>
        <span>Cerrada</span>
      </span>
    );
  }

  if (estado.esAmbar) {
    return (
      <span
        data-testid="insignia-ventana-24h"
        data-nivel="ambar"
        title={estado.explicacion}
        className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-900 sm:text-[11px] dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
      >
        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span className="hidden sm:inline">Por vencer · </span>
        <span>{estado.etiquetaTiempo}</span>
      </span>
    );
  }

  return (
    <span
      data-testid="insignia-ventana-24h"
      data-nivel="abierta"
      title={estado.explicacion}
      className="bg-ok-50 text-ok-800 border-ok-200 dark:bg-ok-950/40 dark:text-ok-300 dark:border-ok-900 flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold sm:text-[11px]"
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      <span className="hidden sm:inline">Ventana 24h · </span>
      <span>{estado.etiquetaTiempo}</span>
    </span>
  );
}

export interface BannerAvisoVentana24hProps {
  estado: EstadoCuentaRegresiva24h;
  onAbrirPlantillas: () => void;
}

/**
 * Franja preventiva en ámbar cuando restan 2 horas o menos en la ventana de 24 h.
 */
export function BannerAvisoVentana24h({ estado, onAbrirPlantillas }: BannerAvisoVentana24hProps) {
  if (!estado.esAmbar || estado.cerrada) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="banner-ventana-ambar"
      className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <span>
          <strong>Ventana de Meta por cerrar: </strong>
          Quedan {estado.etiquetaTiempo}. Envía tu respuesta ahora o la reapertura exigirá una
          plantilla aprobada.
        </span>
      </div>
      <button
        type="button"
        onClick={onAbrirPlantillas}
        className="shrink-0 text-[11px] font-semibold underline hover:text-amber-950 dark:hover:text-amber-100"
      >
        Ver plantillas
      </button>
    </div>
  );
}

export interface CompositorVentanaCerrada24hProps {
  estado: EstadoCuentaRegresiva24h;
  plantillas: ReadonlyArray<PlantillaResumenReapertura>;
  textoBorrador?: string;
  mostrarAvisoBorrador?: boolean;
  onAbrirPlantillas: () => void;
}

/**
 * Bloque del compositor cuando la ventana de 24 h está cerrada: explica el motivo y ofrece
 * el botón de plantilla de reapertura (deshabilitado si no hay ninguna plantilla APROBADA).
 */
export function CompositorVentanaCerrada24h({
  estado,
  plantillas,
  textoBorrador = '',
  mostrarAvisoBorrador = false,
  onAbrirPlantillas,
}: CompositorVentanaCerrada24hProps) {
  const evaluacion = evaluarReaperturaConPlantilla(plantillas);
  const borradorLimpio = textoBorrador.trim();
  const hayBorrador = mostrarAvisoBorrador || borradorLimpio.length > 0;

  return (
    <div
      data-testid="compositor-ventana-cerrada"
      className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-800/40"
    >
      <div className="flex items-center justify-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
        <Lock className="h-4 w-4 text-neutral-500" aria-hidden="true" />
        <span>Ventana de 24 horas cerrada por Meta</span>
      </div>

      <p
        data-testid="explicacion-ventana-cerrada"
        className="text-center leading-relaxed text-neutral-600 dark:text-neutral-400"
      >
        {estado.explicacion}
      </p>

      {hayBorrador && (
        <div
          aria-live="polite"
          data-testid="aviso-borrador-preservado"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-amber-950 dark:text-amber-100">
                La ventana se cerró; tu borrador sigue aquí
              </p>
              {borradorLimpio && (
                <p className="mt-1 line-clamp-2 rounded bg-amber-100/70 p-1.5 text-[11px] text-amber-800 italic dark:bg-amber-900/40 dark:text-amber-300">
                  «{borradorLimpio}»
                </p>
              )}
            </div>
          </div>
          {evaluacion.habilitada && (
            <div className="mt-2.5 flex w-full sm:justify-end">
              <button
                type="button"
                onClick={onAbrirPlantillas}
                className="flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 sm:w-auto"
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                <span>Usar borrador en plantilla</span>
              </button>
            </div>
          )}
        </div>
      )}

      {!evaluacion.habilitada && evaluacion.motivoDeshabilitada && (
        <div
          role="alert"
          data-testid="aviso-sin-plantilla-aprobada"
          className="rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-center text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
        >
          <p className="font-semibold">{evaluacion.motivoDeshabilitada}</p>
          <Link
            href="/configuracion/whatsapp"
            className="mt-1 inline-block font-bold underline hover:text-rose-950 dark:hover:text-rose-100"
          >
            Ir a Configuración → WhatsApp
          </Link>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          data-testid="btn-plantilla-reapertura"
          disabled={!evaluacion.habilitada}
          onClick={() => {
            if (evaluacion.habilitada) {
              onAbrirPlantillas();
            }
          }}
          className="bg-acento-700 hover:bg-acento-800 flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-600 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>
            {evaluacion.habilitada
              ? 'Seleccionar plantilla aprobada'
              : 'Sin plantilla aprobada para reabrir'}
          </span>
        </button>
      </div>
    </div>
  );
}
