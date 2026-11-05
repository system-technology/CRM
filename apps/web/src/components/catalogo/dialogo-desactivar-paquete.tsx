'use client';

import React, { useRef } from 'react';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';
import type { ResumenDePaqueteGestion } from '@viajapro/contracts';
import { useFocoModal } from '../../lib/use-foco-modal';

interface DialogoDesactivarPaqueteProps {
  abierto: boolean;
  paquete: ResumenDePaqueteGestion | null;
  alCerrar: () => void;
  alConfirmar: (id: string) => Promise<void>;
  cargando?: boolean;
}

export function DialogoDesactivarPaquete({
  abierto,
  paquete,
  alCerrar,
  alConfirmar,
  cargando = false,
}: DialogoDesactivarPaqueteProps) {
  const botonCancelarRef = useRef<HTMLButtonElement>(null);
  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto,
    alCerrar,
    elementoInicialRef: botonCancelarRef,
  });

  if (!abierto || !paquete) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-dialogo-desactivar"
      aria-describedby="descripcion-dialogo-desactivar"
      data-testid="dialogo-desactivar-paquete"
      onClick={alCerrar}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs"
    >
      <div
        ref={contenedorRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h3
              id="titulo-dialogo-desactivar"
              className="text-base font-bold text-neutral-900 dark:text-white"
            >
              ¿Desactivar este producto?
            </h3>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            data-testid="boton-cerrar-dialogo-desactivar"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:outline-hidden dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar diálogo"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div id="descripcion-dialogo-desactivar" className="mt-4 space-y-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            Estás a punto de desactivar el paquete:{' '}
            <strong className="font-semibold text-neutral-900 dark:text-white">
              {paquete.nombre}
            </strong>{' '}
            {paquete.codigo && (
              <span className="font-mono text-neutral-500 dark:text-neutral-400">
                ({paquete.codigo})
              </span>
            )}
            .
          </p>

          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="font-semibold">Protección del historial de cotizaciones:</p>
              <p className="leading-relaxed">
                El producto dejará de mostrarse en el cotizador express para nuevas cotizaciones.
                Esta acción <strong>NO elimina el producto</strong> ni altera cotizaciones previas
                emitidas ni viajes confirmados con clientes.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button
            ref={botonCancelarRef}
            type="button"
            onClick={alCerrar}
            disabled={cargando}
            data-testid="boton-cancelar-desactivar"
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              void alConfirmar(paquete.id);
            }}
            disabled={cargando}
            data-testid="boton-confirmar-desactivar"
            aria-label="Desactivar paquete"
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:outline-hidden disabled:opacity-50"
          >
            {cargando ? 'Desactivando...' : 'Confirmar desactivación'}
          </button>
        </div>
      </div>
    </div>
  );
}
