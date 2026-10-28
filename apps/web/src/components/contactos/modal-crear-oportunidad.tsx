'use client';

import React, { useState } from 'react';
import { type CrearOportunidad, type Oportunidad } from '@viajapro/contracts';
import { useFocoModal } from '../../lib/use-foco-modal';
import { X, Kanban, Loader2, AlertCircle } from 'lucide-react';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';

interface ModalCrearOportunidadProps {
  contactoId: string;
  contactoNombre: string | null;
  onCerrar: () => void;
  onCrear: (cuerpo: CrearOportunidad) => Promise<Oportunidad>;
}

export function ModalCrearOportunidad({
  contactoId,
  contactoNombre,
  onCerrar,
  onCrear,
}: ModalCrearOportunidadProps) {
  const modalRef = useFocoModal<HTMLDivElement>({ abierto: true, alCerrar: onCerrar });

  const [titulo, setTitulo] = useState(
    contactoNombre ? `Viaje vacacional para ${contactoNombre}` : 'Nuevo paquete vacacional',
  );
  const [destino, setDestino] = useState('Cancún, México');
  const [valorEstimadoCop, setValorEstimadoCop] = useState('6500000');
  const [fechaSalida, setFechaSalida] = useState('2026-12-15');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!titulo.trim()) {
      setError('Por favor indica un título para la oportunidad.');
      return;
    }

    const valorNumero = parseInt(valorEstimadoCop.replace(/\D/g, ''), 10);

    const cuerpo: CrearOportunidad = {
      contactoId,
      titulo: titulo.trim(),
      destino: destino.trim() || null,
      fechaSalida: fechaSalida || null,
      valorEstimado:
        Number.isFinite(valorNumero) && valorNumero > 0
          ? {
              unidades: String(valorNumero), // R8: COP en pesos enteros
              moneda: 'COP',
            }
          : null,
    };

    setGuardando(true);
    try {
      await onCrear(cuerpo);
      onCerrar();
    } catch (err) {
      setError(
        formatearErrorAmigable(
          err,
          'No fue posible crear la oportunidad. Revisa la información e intenta nuevamente.',
        ),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-crear-oportunidad"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
              <Kanban className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-crear-oportunidad"
                className="text-base font-bold text-neutral-900 dark:text-neutral-100"
              >
                Nueva Oportunidad Comercial
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Abre una negociación en el embudo para este contacto
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar modal de oportunidad"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="font-semibold">Atención</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="mt-5 space-y-4"
        >
          <div>
            <label
              htmlFor="crear-oportunidad-titulo"
              className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            >
              Título de la oportunidad *
            </label>
            <div className="relative mt-1">
              <input
                id="crear-oportunidad-titulo"
                type="text"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Paquete San Andrés Dic 2026"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="crear-oportunidad-destino"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Destino turístico
              </label>
              <div className="relative mt-1">
                <input
                  id="crear-oportunidad-destino"
                  type="text"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  placeholder="Cancún, San Andrés, Punta Cana..."
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="crear-oportunidad-fecha"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Fecha estimada de viaje
              </label>
              <div className="relative mt-1">
                <input
                  id="crear-oportunidad-fecha"
                  type="date"
                  value={fechaSalida}
                  onChange={(e) => setFechaSalida(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="crear-oportunidad-valor"
              className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            >
              Presupuesto / Valor estimado (COP)
            </label>
            <div className="relative mt-1">
              <input
                id="crear-oportunidad-valor"
                type="text"
                value={valorEstimadoCop}
                onChange={(e) => setValorEstimadoCop(e.target.value)}
                placeholder="Ej: 6500000"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Valor en pesos colombianos para el cálculo de volumen del pipeline.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
            >
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creando...</span>
                </>
              ) : (
                <span>Crear Oportunidad</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
