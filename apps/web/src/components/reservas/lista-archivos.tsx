import React from 'react';
import type { ResumenDeArchivo } from '@viajapro/contracts';
import {
  ETIQUETA_AVANCE,
  ETIQUETA_ESTADO_RESERVA,
  describirPlazo,
  reservaMasUrgente,
} from '../../lib/archivos-logica';
import { formatearFecha, formatearFechaHora } from '../../lib/formato';
import { SemaforoPlazo } from './semaforo-plazo';

interface ListaArchivosProps {
  archivos: ResumenDeArchivo[];
  seleccionadoId: string | null;
  zona: string;
  onSeleccionar: (id: string) => void;
}

/**
 * Lista de archivos de viaje ordenada por el servidor según el plazo más próximo. Cada fila dice
 * qué reserva vence primero y con qué mayorista. Con 500 filas, `content-visibility` evita pintar
 * las que están fuera de pantalla.
 */
export function ListaArchivos({
  archivos,
  seleccionadoId,
  zona,
  onSeleccionar,
}: ListaArchivosProps) {
  return (
    <ul
      aria-label="Archivos de viaje"
      className="divide-y divide-neutral-100 dark:divide-neutral-800/60"
    >
      {archivos.map((a) => {
        const urgente = reservaMasUrgente(a);
        const activo = a.id === seleccionadoId;
        return (
          <li key={a.id} className="[contain-intrinsic-size:auto_92px] [content-visibility:auto]">
            <button
              type="button"
              onClick={() => onSeleccionar(a.id)}
              aria-current={activo ? 'true' : undefined}
              className={`focus-visible:ring-acento-600 flex min-h-[44px] w-full flex-col gap-1 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${
                activo
                  ? 'bg-acento-50 dark:bg-acento-950/40'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-neutral-900 dark:text-white">
                  File {a.numero}
                </span>
                {a.estado === 'CANCELADO' ? (
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    Cancelado
                  </span>
                ) : (
                  <SemaforoPlazo semaforo={a.semaforo} />
                )}
              </span>
              <span className="truncate text-xs text-neutral-700 dark:text-neutral-300">
                {a.destino} · sale {formatearFecha(a.fechaSalida, { zona })}
              </span>
              {a.estado === 'ABIERTO' && (
                <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  {urgente ? (
                    <>
                      <strong className="font-semibold">
                        {urgente.mayoristaNombre ?? 'Mayorista por definir'}
                      </strong>
                      {' · '}
                      {ETIQUETA_ESTADO_RESERVA[urgente.estado]}
                      {' · '}
                      {describirPlazo(urgente.plazoVigente)}
                      {urgente.plazoVigente
                        ? ` (${formatearFechaHora(urgente.plazoVigente, { zona })})`
                        : ''}
                    </>
                  ) : (
                    <>{a.avance ? ETIQUETA_AVANCE[a.avance] : 'Sin plazo vigente'}</>
                  )}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
