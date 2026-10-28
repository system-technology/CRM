'use client';

import React, { useState } from 'react';
import { MotivoPerdida, Oportunidad } from '@viajapro/contracts';
import { AlertCircle, X, Check } from 'lucide-react';
import { NOMBRES_MOTIVOS_PERDIDA } from '../../lib/pipeline-logica';
import { useFocoModal } from '../../lib/use-foco-modal';

interface ModalMotivoPerdidaProps {
  oportunidad: Oportunidad;
  onConfirmar: (motivo: MotivoPerdida, nota?: string | null) => void;
  onCancelar: () => void;
}

export function ModalMotivoPerdida({
  oportunidad,
  onConfirmar,
  onCancelar,
}: ModalMotivoPerdidaProps) {
  const [motivoSeleccionado, setMotivoSeleccionado] = useState<MotivoPerdida>('PRECIO');
  const [nota, setNota] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto: true,
    alCerrar: onCancelar,
  });

  const manejarConfirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (motivoSeleccionado === 'OTRO' && !nota.trim()) {
      setErrorValidacion('«Otro» sin explicación no es un motivo válido. Describe qué ocurrió.');
      return;
    }
    setErrorValidacion(null);
    onConfirmar(motivoSeleccionado, motivoSeleccionado === 'OTRO' ? nota.trim() : null);
  };

  const motivos = Object.keys(NOMBRES_MOTIVOS_PERDIDA) as MotivoPerdida[];

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

          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Selecciona el motivo principal:
            </legend>
            {motivos.map((m) => {
              const seleccionado = motivoSeleccionado === m;
              return (
                <label
                  key={m}
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
                      value={m}
                      checked={seleccionado}
                      onChange={() => {
                        setMotivoSeleccionado(m);
                        setErrorValidacion(null);
                      }}
                      className="text-acento-600 focus:ring-acento-500 h-4 w-4 border-neutral-300"
                    />
                    <span>{NOMBRES_MOTIVOS_PERDIDA[m]}</span>
                  </div>
                  {seleccionado && (
                    <Check className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                  )}
                </label>
              );
            })}
          </fieldset>

          {/* Campo adicional si es OTRO */}
          {motivoSeleccionado === 'OTRO' && (
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
                required
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
              className="flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-amber-700"
            >
              Confirmar pérdida
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
