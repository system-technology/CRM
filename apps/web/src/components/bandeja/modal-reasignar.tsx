'use client';

import React, { useState } from 'react';
import { X, UserCheck, Users, Loader2 } from 'lucide-react';
import { ASESORES } from '../../lib/mock-inbox';
import { useFocoModal } from '../../lib/use-foco-modal';

export interface ModalReasignarProps {
  abierto: boolean;
  conversacionId: string;
  asignadoActualId: string | null;
  onCerrar: () => void;
  onReasignar: (nuevoUsuarioId: string | null) => Promise<void>;
}

export function ModalReasignar({
  abierto,
  asignadoActualId,
  onCerrar,
  onReasignar,
}: ModalReasignarProps) {
  const [seleccionado, setSeleccionado] = useState<string | null>(asignadoActualId);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto,
    alCerrar: onCerrar,
  });

  if (!abierto) return null;

  const manejarConfirmar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await onReasignar(seleccionado);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible reasignar la conversación');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-reasignar"
    >
      <div
        ref={contenedorRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400 flex h-9 w-9 items-center justify-center rounded-xl">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="titulo-modal-reasignar"
                className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
              >
                Reasignar conversación
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Selecciona el asesor responsable o devuelve a la cola común.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar modal de reasignación"
            className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {/* Opción 1: Dejar sin asignar */}
          <button
            type="button"
            onClick={() => setSeleccionado(null)}
            className={`focus-visible:ring-primary-500 flex min-h-[48px] w-full items-center justify-between rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              seleccionado === null
                ? 'border-primary-500 bg-primary-50/60 text-primary-900 dark:border-primary-500 dark:bg-primary-950/40 dark:text-primary-200 font-semibold'
                : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold">Sin asignar (Cola común)</p>
                <p className="text-[10px] text-neutral-400">
                  Visible para todo el equipo de la agencia
                </p>
              </div>
            </div>
            {seleccionado === null && (
              <span className="bg-primary-600 dark:bg-primary-400 h-2 w-2 rounded-full" />
            )}
          </button>

          {/* Opciones de Asesores */}
          {ASESORES.map((asesor) => {
            const esActivo = seleccionado === asesor.id;
            return (
              <button
                key={asesor.id}
                type="button"
                onClick={() => setSeleccionado(asesor.id)}
                className={`focus-visible:ring-primary-500 flex min-h-[48px] w-full items-center justify-between rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                  esActivo
                    ? 'border-primary-500 bg-primary-50/60 text-primary-900 dark:border-primary-500 dark:bg-primary-950/40 dark:text-primary-200 font-semibold'
                    : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold">
                    {asesor.nombre.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      {asesor.nombre}
                    </p>
                    <p className="text-[10px] text-neutral-400">Asesor de viajes</p>
                  </div>
                </div>
                {esActivo && (
                  <span className="bg-primary-600 dark:bg-primary-400 h-2 w-2 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void manejarConfirmar()}
            disabled={guardando}
            data-testid="boton-confirmar-reasignacion"
            className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs disabled:opacity-50"
          >
            {guardando ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <span>Confirmar asignación</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
