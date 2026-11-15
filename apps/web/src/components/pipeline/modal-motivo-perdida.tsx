'use client';

import React, { useState } from 'react';
import { MotivoPerdida, Oportunidad } from '@viajapro/contracts';
import { AlertCircle, X, Check } from 'lucide-react';
import { enumDeMotivo, motivoExigeNota } from '../../lib/motivos-perdida-logica';
import { useMotivosDePerdida } from '../../lib/use-motivos-perdida';
import { useFocoModal } from '../../lib/use-foco-modal';

interface ModalMotivoPerdidaProps {
  oportunidad: Oportunidad;
  /** `motivoPerdidaId` es el motivo elegido de la agencia (T-229); `motivo` es el enum derivado. */
  onConfirmar: (motivo: MotivoPerdida, nota?: string | null, motivoPerdidaId?: string) => void;
  onCancelar: () => void;
}

export function ModalMotivoPerdida({
  oportunidad,
  onConfirmar,
  onCancelar,
}: ModalMotivoPerdidaProps) {
  const { motivos, cargando, error, recargar } = useMotivosDePerdida();
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto: true,
    alCerrar: onCancelar,
  });

  const motivoSeleccionado = motivos.find((m) => m.id === seleccionId) ?? motivos[0] ?? null;
  const exigeNota = motivoSeleccionado ? motivoExigeNota(motivoSeleccionado) : false;

  const manejarConfirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoSeleccionado) return;
    if (exigeNota && !nota.trim()) {
      setErrorValidacion(
        motivoSeleccionado.clave === 'OTRO'
          ? '«Otro» sin explicación no es un motivo válido. Describe qué ocurrió.'
          : `El motivo «${motivoSeleccionado.etiqueta}» exige una nota. Describe qué ocurrió.`,
      );
      return;
    }
    setErrorValidacion(null);
    onConfirmar(
      enumDeMotivo(motivoSeleccionado),
      nota.trim() ? nota.trim() : null,
      motivoSeleccionado.id,
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-perdida-titulo"
      onClick={onCancelar}
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs duration-200"
    >
      <div
        ref={contenedorRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="modal-perdida-titulo"
                className="text-sm font-semibold text-neutral-900 dark:text-neutral-100"
              >
                Marcar Oportunidad como Perdida
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {oportunidad.titulo} — {oportunidad.contactoNombre || 'Sin contacto'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={manejarConfirmar} className="p-6">
          <p className="mb-4 text-xs text-neutral-600 dark:text-neutral-300">
            El contrato de negocio exige registrar el motivo de pérdida. Esto alimenta la analítica
            comercial y permite corregir desviaciones de precios o tiempos de respuesta.
          </p>

          {cargando ? (
            <div data-testid="motivos-cargando" className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-11 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800/50"
                />
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={recargar}
                className="min-h-[44px] w-full rounded-xl border border-rose-300 bg-white px-4 text-xs font-semibold sm:w-auto sm:self-start dark:bg-neutral-900"
              >
                Reintentar
              </button>
            </div>
          ) : motivos.length === 0 ? (
            <p
              data-testid="motivos-vacio"
              className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500 dark:border-neutral-700"
            >
              Tu agencia no tiene motivos de pérdida activos. Actívalos en Configuración, Motivos de
              pérdida.
            </p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Selecciona el motivo principal:
              </legend>
              {motivos.map((m) => {
                const seleccionado = motivoSeleccionado?.id === m.id;
                return (
                  <label
                    key={m.id}
                    className={`focus-within:ring-acento-600 flex min-h-[44px] cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition-colors focus-within:ring-2 ${
                      seleccionado
                        ? 'border-acento-600 bg-acento-50/60 text-acento-900 dark:border-acento-500 dark:bg-acento-950/40 dark:text-acento-200 font-medium'
                        : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="radio"
                        name="motivoPerdida"
                        value={m.id}
                        checked={seleccionado}
                        onChange={() => {
                          setSeleccionId(m.id);
                          setErrorValidacion(null);
                        }}
                        className="text-acento-600 focus:ring-acento-500 h-4 w-4 border-neutral-300"
                      />
                      <span>{m.etiqueta}</span>
                    </div>
                    {seleccionado && (
                      <Check className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                    )}
                  </label>
                );
              })}
            </fieldset>
          )}

          {/* Nota: obligatoria si el motivo la exige */}
          {exigeNota && (
            <div className="animate-in fade-in mt-4 duration-150">
              <label
                htmlFor="nota-perdida"
                className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
              >
                Explica el motivo (obligatorio):
              </label>
              <textarea
                id="nota-perdida"
                rows={3}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Describe la razón por la cual se descartó la oportunidad..."
                className="focus:border-acento-500 focus:ring-acento-500 w-full rounded-xl border border-neutral-300 bg-white p-3 text-xs text-neutral-900 placeholder-neutral-400 focus:ring-1 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                maxLength={500}
                aria-required="true"
              />
            </div>
          )}

          {errorValidacion && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300"
            >
              {errorValidacion}
            </div>
          )}

          {/* Acciones */}
          <div className="mt-6 flex items-center justify-end space-x-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <button
              type="button"
              onClick={onCancelar}
              className="flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!motivoSeleccionado}
              className="flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              Confirmar pérdida
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
