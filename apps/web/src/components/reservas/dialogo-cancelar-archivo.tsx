'use client';

import React, { useState } from 'react';
import {
  CancelarArchivo as EsquemaCancelarArchivo,
  MotivoDeCancelacionDelArchivo as EsquemaMotivo,
  type CancelarArchivo,
  type MotivoDeCancelacionDelArchivo,
} from '@viajapro/contracts';
import { ETIQUETA_MOTIVO_CANCELACION } from '../../lib/archivos-logica';
import { useFocoModal } from '../../lib/use-foco-modal';

interface DialogoCancelarArchivoProps {
  numero: number;
  enviando: boolean;
  errorServidor: string | null;
  onConfirmar: (cancelacion: CancelarArchivo) => void;
  onCerrar: () => void;
}

const CAMPO =
  'focus-visible:ring-acento-600 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white';

export function DialogoCancelarArchivo({
  numero,
  enviando,
  errorServidor,
  onConfirmar,
  onCerrar,
}: DialogoCancelarArchivoProps) {
  const [motivo, setMotivo] = useState<MotivoDeCancelacionDelArchivo | ''>('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useFocoModal<HTMLDivElement>({ abierto: true, alCerrar: onCerrar });

  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo) {
      setError('Elige el motivo de la cancelación.');
      return;
    }
    const parseo = EsquemaCancelarArchivo.safeParse({ motivo, nota: nota.trim() || null });
    if (!parseo.success) {
      setError('Con el motivo «Otro» explica qué pasó en la nota.');
      return;
    }
    setError(null);
    onConfirmar(parseo.data);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancelar-archivo-titulo"
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div
        ref={contenedorRef}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-neutral-900"
      >
        <h2 id="cancelar-archivo-titulo" className="text-base font-bold">
          Cancelar el file {numero}
        </h2>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          Se cancelan también sus reservas vivas. Esta acción no se puede deshacer.
        </p>
        <form onSubmit={confirmar} className="mt-4 space-y-3">
          <div>
            <label htmlFor="cancelar-motivo" className="mb-1 block text-xs font-medium">
              Motivo *
            </label>
            <select
              id="cancelar-motivo"
              className={CAMPO}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoDeCancelacionDelArchivo | '')}
            >
              <option value="">Elige un motivo…</option>
              {EsquemaMotivo.options.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MOTIVO_CANCELACION[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cancelar-nota" className="mb-1 block text-xs font-medium">
              Nota {motivo === 'OTRO' ? '*' : '(opcional)'}
            </label>
            <textarea
              id="cancelar-nota"
              rows={3}
              maxLength={500}
              className={CAMPO}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
          {(error ?? errorServidor) && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
            >
              {error ?? errorServidor}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={enviando}
              className="focus-visible:ring-acento-600 min-h-[44px] rounded-xl border border-neutral-300 px-4 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
            >
              No cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="min-h-[44px] rounded-xl bg-red-700 px-4 text-xs font-semibold text-white hover:bg-red-800 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none disabled:opacity-60"
            >
              {enviando ? 'Cancelando…' : 'Cancelar archivo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
