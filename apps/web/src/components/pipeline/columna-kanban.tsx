'use client';

import React, { useState } from 'react';
import { ClaveEtapa, ColumnaPipeline, EtapaDefinida, Oportunidad } from '@viajapro/contracts';
import { TarjetaOportunidad } from './tarjeta-oportunidad';
import { formatearDineroCifra } from '../../lib/pipeline-logica';

interface ColumnaKanbanProps {
  columna: ColumnaPipeline;
  onSolicitarMover: (oportunidad: Oportunidad, nuevaEtapa: EtapaDefinida) => void;
  onDropOportunidad: (oportunidadId: string, nuevaEtapa: EtapaDefinida) => void;
  /** Todas las etapas del tablero, para el menú «mover a» de cada tarjeta. */
  etapas: EtapaDefinida[];
}

/** Para las etapas que la agencia inventó y el vocabulario común no nombra. */
const COLOR_ETAPA_PROPIA = {
  punto: 'bg-neutral-400',
  badge: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

const COLORES_CABECERA_ETAPA: Record<ClaveEtapa, { punto: string; badge: string }> = {
  NUEVO_LEAD: {
    punto: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  },
  EN_COTIZACION: {
    punto: 'bg-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  },
  EN_NEGOCIACION: {
    punto: 'bg-purple-500',
    badge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  },
  GANADA: {
    punto: 'bg-ok-500',
    badge: 'bg-ok-50 text-ok-700 dark:bg-ok-950/60 dark:text-ok-300',
  },
  PERDIDA: {
    punto: 'bg-neutral-400',
    badge: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
};

export function ColumnaKanban({
  columna,
  etapas,
  onSolicitarMover,
  onDropOportunidad,
}: ColumnaKanbanProps) {
  const [arrastrandoEncima, setArrastrandoEncima] = useState(false);

  const { etapa, total, valorTotal, oportunidades } = columna;
  // El color se elige por la clave canónica, que puede no existir: una agencia con una etapa
  // propia —«Esperando anticipo»— no tiene clave, y entonces se usa un gris neutro. Pintarla
  // de rojo o de verde por adivinanza sería peor que no pintarla.
  const estilo = etapa.clave ? COLORES_CABECERA_ETAPA[etapa.clave] : COLOR_ETAPA_PROPIA;

  const manejarDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!arrastrandoEncima) setArrastrandoEncima(true);
  };

  const manejarDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrandoEncima(false);
  };

  const manejarDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrandoEncima(false);
    const oportunidadId = e.dataTransfer.getData('text/plain');
    if (oportunidadId) {
      onDropOportunidad(oportunidadId, etapa);
    }
  };

  return (
    <div
      onDragOver={manejarDragOver}
      onDragLeave={manejarDragLeave}
      onDrop={manejarDrop}
      className={`flex h-full max-w-[320px] min-w-[280px] flex-1 flex-col rounded-2xl border transition-colors ${
        arrastrandoEncima
          ? 'border-acento-500 bg-acento-50/40 dark:border-acento-400 dark:bg-acento-950/20 border-dashed'
          : 'border-neutral-200/90 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40'
      }`}
    >
      {/* Cabecera de Columna */}
      <div className="border-b border-neutral-200/80 px-4 py-3.5 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className={`h-2 w-2 rounded-full ${estilo.punto}`} />
            <h2 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              {etapa.nombre}
            </h2>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${estilo.badge}`}>
            {total}
          </span>
        </div>

        {/* Total monetario de columna desde el servidor en .cifra (R8) */}
        <div className="mt-1 flex items-baseline justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <span>Total en etapa:</span>
          <span className="cifra font-semibold text-neutral-900 dark:text-neutral-200">
            {formatearDineroCifra(valorTotal)}
          </span>
        </div>
      </div>

      {/* Lista de tarjetas con scroll independiente */}
      <div className="flex flex-1 flex-col space-y-3 overflow-y-auto p-3">
        {oportunidades.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
            <span>Sin oportunidades</span>
            <span className="mt-1 text-[10px]">Arrastra una tarjeta aquí</span>
          </div>
        ) : (
          oportunidades.map((op) => (
            <TarjetaOportunidad
              key={op.id}
              oportunidad={op}
              etapas={etapas}
              onSolicitarMover={onSolicitarMover}
            />
          ))
        )}
      </div>
    </div>
  );
}
