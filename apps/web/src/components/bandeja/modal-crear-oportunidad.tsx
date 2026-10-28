'use client';

import React, { useState } from 'react';
import type { Oportunidad } from '@viajapro/contracts';
import {
  Target,
  X,
  Check,
  Loader2,
  AlertTriangle,
  Calendar,
  DollarSign,
  MapPin,
} from 'lucide-react';
import { crearOportunidadDeConversacionApi } from '../../lib/crm-api';

export interface ModalCrearOportunidadProps {
  conversacionId: string;
  contactoNombre: string | null;
  onCerrar: () => void;
  onOportunidadCreada: (oportunidad: Oportunidad) => void;
}

export function ModalCrearOportunidad({
  conversacionId,
  contactoNombre,
  onCerrar,
  onOportunidadCreada,
}: ModalCrearOportunidadProps) {
  const [titulo, setTitulo] = useState(
    contactoNombre ? `Viaje para ${contactoNombre}` : 'Oportunidad de viaje',
  );
  const [destino, setDestino] = useState('');
  const [valorEstimado, setValorEstimado] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setError('El título de la oportunidad es obligatorio.');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const valorDinero = valorEstimado.trim()
        ? {
            // Guardamos en centavos enteros conforme a la regla R8
            unidades: Math.round(parseFloat(valorEstimado.replace(/[^\d.]/g, '')) * 100).toString(),
            moneda: 'COP' as const,
          }
        : undefined;

      const nuevaOportunidad = await crearOportunidadDeConversacionApi(conversacionId, {
        titulo: titulo.trim(),
        destino: destino.trim() || undefined,
        fechaSalida: fechaSalida || undefined,
        valorEstimado: valorDinero,
      });

      onOportunidadCreada(nuevaOportunidad);
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la oportunidad.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-crear-oportunidad-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 sm:px-6 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="bg-acento-500/10 text-acento-600 dark:bg-acento-400/10 dark:text-acento-400 flex h-9 w-9 items-center justify-center rounded-xl">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="modal-crear-oportunidad-titulo"
                className="text-sm font-bold text-neutral-900 sm:text-base dark:text-neutral-100"
              >
                Abrir Oportunidad en Pipeline
              </h2>
              <p className="text-[11px] text-neutral-500 sm:text-xs dark:text-neutral-400">
                Se creará en la etapa inicial «Nuevo Lead»
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar modal de crear oportunidad"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(e);
          }}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="space-y-4 px-4 py-4 sm:px-6">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <p className="min-w-0 flex-1">{error}</p>
              </div>
            )}

            <div>
              <label
                htmlFor="input-titulo-oportunidad"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Título de la oportunidad <span className="text-red-500">*</span>
              </label>
              <input
                id="input-titulo-oportunidad"
                data-testid="input-titulo-oportunidad"
                type="text"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Vacaciones Cancún 4 pax"
                className="focus:border-acento-600 mt-1.5 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            <div>
              <label
                htmlFor="input-destino-oportunidad"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Destino previsto
              </label>
              <div className="relative mt-1.5">
                <MapPin className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                <input
                  id="input-destino-oportunidad"
                  data-testid="input-destino-oportunidad"
                  type="text"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  placeholder="Ej. San Andrés, Colombia"
                  className="focus:border-acento-600 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3 pl-9 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="input-valor-oportunidad"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Valor estimado (COP)
                </label>
                <div className="relative mt-1.5">
                  <DollarSign className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                  <input
                    id="input-valor-oportunidad"
                    data-testid="input-valor-oportunidad"
                    type="number"
                    min="0"
                    step="1000"
                    value={valorEstimado}
                    onChange={(e) => setValorEstimado(e.target.value)}
                    placeholder="Ej. 5000000"
                    className="focus:border-acento-600 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3 pl-9 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="input-fecha-salida"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Fecha de salida
                </label>
                <div className="relative mt-1.5">
                  <Calendar className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                  <input
                    id="input-fecha-salida"
                    data-testid="input-fecha-salida"
                    type="date"
                    value={fechaSalida}
                    onChange={(e) => setFechaSalida(e.target.value)}
                    className="focus:border-acento-600 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3 pl-9 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Botones al pie */}
          <div className="flex flex-col-reverse gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 dark:border-neutral-800 dark:bg-neutral-900/60">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="boton-guardar-oportunidad"
              disabled={guardando || !titulo.trim()}
              className="bg-acento-600 hover:bg-acento-700 flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Abriendo oportunidad...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Crear oportunidad</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
