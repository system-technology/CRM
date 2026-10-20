'use client';

import React from 'react';
import { estaUsandoApiReal } from '../../lib/crm-api';

interface DistintivoDatosDemoProps {
  visible?: boolean;
  className?: string;
}

/**
 * Distintivo honesto, visible y discreto que alerta cuando una pantalla
 * está pintando datos simulados / de demostración (Tarea 0c.14.1).
 *
 * Cuando la pantalla conecta con la API real, no renderiza nada ("lo normal no se anuncia").
 */
export function DistintivoDatosDemo({ visible, className = '' }: DistintivoDatosDemoProps) {
  const mostrar = visible !== undefined ? visible : !estaUsandoApiReal();

  if (!mostrar) return null;

  return (
    <span
      data-testid="distintivo-datos-demo"
      role="status"
      title="Esta pantalla está mostrando datos de demostración (simulados)"
      className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100/90 px-2 py-0.5 text-[10px] font-medium text-neutral-500 select-none dark:border-neutral-700/60 dark:bg-neutral-800/90 dark:text-neutral-400 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80" aria-hidden="true" />
      datos de demostración
    </span>
  );
}
