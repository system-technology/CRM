'use client';

/**
 * Confirmación de que el viajero aceptó la cotización (T-563).
 *
 * No es un cambio de etiqueta: al confirmar se abre el **archivo de viaje** del pasajero y la
 * cotización queda cerrada para siempre. El asesor tiene que saber eso ANTES de pulsar, y dicho
 * como se dice en una agencia: nada de eventos, colas ni endpoints.
 */
import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, FileText, X } from 'lucide-react';
import { formatearDinero } from '../../lib/formato';
import type { Dinero } from '@viajapro/contracts';

export interface ModalAceptarCotizacionProps {
  abierto: boolean;
  /** Cómo se llama el viajero en la ficha; si no se sabe, se habla de «el viajero». */
  nombreViajero: string | null;
  /** La versión que el viajero tuvo delante: la que queda en el archivo de viaje. */
  numeroDeVersion: number;
  totalDeLaVenta: Dinero;
  /** En curso: el botón no se puede pulsar dos veces. */
  confirmando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onCerrar: () => void;
}

export function ModalAceptarCotizacion({
  abierto,
  nombreViajero,
  numeroDeVersion,
  totalDeLaVenta,
  confirmando,
  error,
  onConfirmar,
  onCerrar,
}: ModalAceptarCotizacionProps) {
  const botonConfirmar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    botonConfirmar.current?.focus();

    const alPulsarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmando) {
        e.preventDefault();
        onCerrar();
      }
    };
    document.addEventListener('keydown', alPulsarTecla);
    return () => document.removeEventListener('keydown', alPulsarTecla);
  }, [abierto, confirmando, onCerrar]);

  if (!abierto) return null;

  const viajero = nombreViajero?.trim() || 'el viajero';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-aceptar-cotizacion"
      data-testid="dialogo-aceptar-cotizacion"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirmando) onCerrar();
      }}
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-5 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2
              id="titulo-aceptar-cotizacion"
              className="text-lg font-black text-neutral-900 dark:text-white"
            >
              ¿El viajero aceptó esta cotización?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={confirmando}
            aria-label="Cerrar"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm text-neutral-700 dark:text-neutral-300">
          <p>
            Vas a dejar constancia de que <strong>{viajero}</strong> cerró el negocio sobre la{' '}
            <strong>versión {numeroDeVersion}</strong>, por{' '}
            <strong className="cifra">{formatearDinero(totalDeLaVenta)}</strong>.
          </p>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <p className="flex items-start gap-2 font-bold text-emerald-900 dark:text-emerald-200">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Se abre el archivo de viaje de este pasajero</span>
            </p>
            <p className="mt-2 text-emerald-900/90 dark:text-emerald-200/90">
              Con esta versión: el paquete, la fecha de salida y los pasajeros tal como quedaron
              cotizados. Es el expediente donde después se reservan los servicios y se cobra.
            </p>
            <p className="mt-2 text-emerald-900/80 dark:text-emerald-200/80">
              Tarda unos segundos en aparecer. Te dejamos el enlace en cuanto esté.
            </p>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              La cotización <strong>queda cerrada</strong>: ya no admite versiones nuevas ni otro
              estado. Si todavía estás negociando el precio, ajústala antes de aceptarla.
            </span>
          </p>

          {error && (
            <p
              role="alert"
              data-testid="error-aceptar-cotizacion"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 p-5 sm:flex-row sm:justify-end dark:border-neutral-800">
          <button
            type="button"
            data-testid="btn-cancelar-aceptada"
            onClick={onCerrar}
            disabled={confirmando}
            className="flex min-h-[48px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            Todavía no
          </button>
          <button
            type="button"
            ref={botonConfirmar}
            data-testid="btn-confirmar-aceptada"
            onClick={onConfirmar}
            disabled={confirmando}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span>{confirmando ? 'Registrando…' : 'Sí, aceptó: abrir el archivo de viaje'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
