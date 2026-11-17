'use client';

import React, { useId, useState } from 'react';
import type {
  ActualizarReserva,
  EstadoDeReserva,
  MotivoDeCaida,
  ReservaDelArchivo,
} from '@viajapro/contracts';
import { MotivoDeCaida as EsquemaMotivoDeCaida } from '@viajapro/contracts';
import {
  ACCION_HACIA_ESTADO,
  ETIQUETA_ESTADO_RESERVA,
  ETIQUETA_MOTIVO_CAIDA,
  camposDelPaso,
  construirCambioDeReserva,
  instanteALocal,
  type ValoresDelPaso,
} from '../../lib/archivos-logica';

interface FormularioReservaProps {
  reserva: ReservaDelArchivo;
  /** El estado al que se avanza; si es el actual, es «corregir datos». */
  estadoDestino: EstadoDeReserva;
  zona: string;
  enviando: boolean;
  /** Error del servidor ya traducido a lenguaje claro. */
  errorServidor: string | null;
  onEnviar: (cambio: ActualizarReserva) => void;
  onCancelar: () => void;
}

const CAMPO =
  'focus-visible:ring-acento-600 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white';

/**
 * Pide solo los campos que exige el paso: time limit al confirmar, fecha de pago total al abonar,
 * motivo al caer. Las horas se escriben en la zona de la agencia y viajan en UTC (R9).
 */
export function FormularioReserva({
  reserva,
  estadoDestino,
  zona,
  enviando,
  errorServidor,
  onEnviar,
  onCancelar,
}: FormularioReservaProps) {
  const id = useId();
  const campos = camposDelPaso(estadoDestino);
  const corrige = estadoDestino === reserva.estado;
  const [valores, setValores] = useState<ValoresDelPaso>({
    localizador: reserva.localizador ?? '',
    timeLimit: instanteALocal(reserva.timeLimit, zona),
    pagoTotal: instanteALocal(reserva.pagoTotalVenceEn, zona),
    motivoCaida: reserva.motivoCaida ?? '',
    nota: reserva.nota ?? '',
  });
  const [errores, setErrores] = useState<Partial<Record<keyof ValoresDelPaso, string>>>({});

  const poner = <K extends keyof ValoresDelPaso>(k: K, v: ValoresDelPaso[K]) =>
    setValores((prev) => ({ ...prev, [k]: v }));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = construirCambioDeReserva(estadoDestino, valores, zona);
    if (!r.ok) {
      setErrores(r.errores);
      return;
    }
    setErrores({});
    onEnviar(r.cambio);
  };

  const error = (k: keyof ValoresDelPaso) =>
    errores[k] ? (
      <p
        id={`${id}-${k}-error`}
        role="alert"
        className="mt-1 text-xs text-red-700 dark:text-red-300"
      >
        {errores[k]}
      </p>
    ) : null;
  const describe = (k: keyof ValoresDelPaso) => (errores[k] ? `${id}-${k}-error` : undefined);

  return (
    <form
      onSubmit={enviar}
      aria-label={corrige ? 'Corregir datos de la reserva' : ACCION_HACIA_ESTADO[estadoDestino]}
      className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/40"
    >
      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
        {corrige
          ? 'Corregir datos'
          : `${ACCION_HACIA_ESTADO[estadoDestino]} → ${ETIQUETA_ESTADO_RESERVA[estadoDestino]}`}
      </p>

      <div>
        <label htmlFor={`${id}-loc`} className="mb-1 block text-xs font-medium">
          Localizador del mayorista (opcional)
        </label>
        <input
          id={`${id}-loc`}
          className={CAMPO}
          value={valores.localizador}
          maxLength={64}
          onChange={(e) => poner('localizador', e.target.value)}
        />
      </div>

      {campos.timeLimit !== 'no' && (
        <div>
          <label htmlFor={`${id}-tl`} className="mb-1 block text-xs font-medium">
            Time limit (hora de la agencia) *
          </label>
          <input
            id={`${id}-tl`}
            type="datetime-local"
            className={CAMPO}
            value={valores.timeLimit}
            aria-invalid={errores.timeLimit ? true : undefined}
            aria-describedby={describe('timeLimit')}
            onChange={(e) => poner('timeLimit', e.target.value)}
          />
          {error('timeLimit')}
        </div>
      )}

      {campos.pagoTotal !== 'no' && (
        <div>
          <label htmlFor={`${id}-pt`} className="mb-1 block text-xs font-medium">
            Fecha límite de pago total (hora de la agencia){' '}
            {campos.pagoTotal === 'obligatorio' ? '*' : '(opcional)'}
          </label>
          <input
            id={`${id}-pt`}
            type="datetime-local"
            className={CAMPO}
            value={valores.pagoTotal}
            aria-invalid={errores.pagoTotal ? true : undefined}
            aria-describedby={describe('pagoTotal')}
            onChange={(e) => poner('pagoTotal', e.target.value)}
          />
          {error('pagoTotal')}
        </div>
      )}

      {campos.motivoCaida && (
        <div>
          <label htmlFor={`${id}-mc`} className="mb-1 block text-xs font-medium">
            Motivo de la caída *
          </label>
          <select
            id={`${id}-mc`}
            className={CAMPO}
            value={valores.motivoCaida}
            aria-invalid={errores.motivoCaida ? true : undefined}
            aria-describedby={describe('motivoCaida')}
            onChange={(e) => poner('motivoCaida', e.target.value as MotivoDeCaida | '')}
          >
            <option value="">Elige un motivo…</option>
            {EsquemaMotivoDeCaida.options.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MOTIVO_CAIDA[m]}
              </option>
            ))}
          </select>
          {error('motivoCaida')}
        </div>
      )}

      <div>
        <label htmlFor={`${id}-nota`} className="mb-1 block text-xs font-medium">
          Nota (opcional)
        </label>
        <textarea
          id={`${id}-nota`}
          rows={2}
          maxLength={500}
          className={CAMPO}
          value={valores.nota}
          aria-describedby={describe('nota')}
          onChange={(e) => poner('nota', e.target.value)}
        />
        {error('nota')}
      </div>

      {errorServidor && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
        >
          {errorServidor}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="bg-acento-700 hover:bg-acento-800 focus-visible:ring-acento-600 min-h-[44px] rounded-xl px-4 text-xs font-semibold text-white focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="focus-visible:ring-acento-600 min-h-[44px] rounded-xl border border-neutral-300 px-4 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
        >
          Volver
        </button>
      </div>
    </form>
  );
}
