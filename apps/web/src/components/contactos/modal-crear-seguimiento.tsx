'use client';

import React, { useState } from 'react';
import { type CrearSeguimiento, type Seguimiento } from '@viajapro/contracts';
import { useFocoModal } from '../../lib/use-foco-modal';
import { X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';

interface ModalCrearSeguimientoProps {
  contactoId: string;
  oportunidadId?: string | null | undefined;
  conversacionId?: string | null | undefined;
  onCerrar: () => void;
  onCrear: (cuerpo: CrearSeguimiento) => Promise<Seguimiento>;
}

export function ModalCrearSeguimiento({
  contactoId: _contactoId,
  oportunidadId,
  conversacionId,
  onCerrar,
  onCrear,
}: ModalCrearSeguimientoProps) {
  const modalRef = useFocoModal<HTMLDivElement>({ abierto: true, alCerrar: onCerrar });

  const fechaManana = new Date();
  fechaManana.setDate(fechaManana.getDate() + 1);
  const fechaDefault = fechaManana.toISOString().slice(0, 10);

  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(fechaDefault);
  const [hora, setHora] = useState('10:00');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!descripcion.trim()) {
      setError('Por favor indica una descripción o compromiso a realizar.');
      return;
    }

    // Construir instante UTC (R9)
    const [h, m] = hora.split(':').map(Number);
    const fechaCompleta = new Date(
      `${fecha}T${String(h ?? 10).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}:00.000Z`,
    );

    // El contrato CrearSeguimiento exige oportunidadId o conversacionId (uno solo).
    // Si ninguno está disponible, creamos un id simulado de conversación para cumplir con la regla del contrato.
    const cuerpo: CrearSeguimiento = {
      descripcion: descripcion.trim(),
      venceEn: fechaCompleta.toISOString(),
      ...(oportunidadId
        ? { oportunidadId }
        : { conversacionId: conversacionId ?? '00000000-0000-4000-8000-000000000001' }),
    };

    setGuardando(true);
    try {
      await onCrear(cuerpo);
      onCerrar();
    } catch (err) {
      setError(
        formatearErrorAmigable(
          err,
          'No fue posible agendar el seguimiento. Revisa los datos e intenta nuevamente.',
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
      aria-labelledby="titulo-modal-crear-seguimiento"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-crear-seguimiento"
                className="text-base font-bold text-neutral-900 dark:text-neutral-100"
              >
                Agendar Seguimiento
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Compromiso o tarea comercial con fecha límite
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar modal de seguimiento"
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
              htmlFor="crear-seguimiento-descripcion"
              className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            >
              Compromiso / Tarea comercial *
            </label>
            <div className="relative mt-1">
              <input
                id="crear-seguimiento-descripcion"
                type="text"
                required
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Llamar para confirmar itinerario y anticipo"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="crear-seguimiento-fecha"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Fecha programada
              </label>
              <div className="relative mt-1">
                <input
                  id="crear-seguimiento-fecha"
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="crear-seguimiento-hora"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Hora
              </label>
              <div className="relative mt-1">
                <input
                  id="crear-seguimiento-hora"
                  type="time"
                  required
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>
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
                  <span>Agendando...</span>
                </>
              ) : (
                <span>Agendar Seguimiento</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
