'use client';

import React from 'react';
import { estaUsandoApiReal } from '../../lib/crm-api';
import { useModoDemo } from '../../lib/modo-demo';
import { useMontado } from '../../lib/use-montado';
import { herramientasDevActivas } from '../../lib/herramientas-dev';

interface DistintivoDatosDemoProps {
  visible?: boolean;
  className?: string;
  permitirDesactivar?: boolean;
}

/**
 * Distintivo honesto, visible y discreto que alerta cuando una pantalla
 * está pintando datos simulados / de demostración (Bloque 1 / Tarea 0c.14.1).
 *
 * El modo demostración es explícito, visible y opcional.
 * Cuando la pantalla conecta con la API real, no renderiza nada ("lo normal no se anuncia").
 */
export function DistintivoDatosDemo({
  visible,
  className = '',
  permitirDesactivar = true,
}: DistintivoDatosDemoProps) {
  const { desactivarDemo } = useModoDemo();
  // `estaUsandoApiReal()` lee `?demo=1` y `localStorage`, que el servidor no ve: sin esperar al
  // montaje, el primer render del cliente difiere del HTML y la hidratación falla (T-607).
  const montado = useMontado();
  const mostrar = visible !== undefined ? visible : montado && !estaUsandoApiReal();

  if (!mostrar) return null;

  return (
    <span
      data-testid="distintivo-datos-demo"
      role="status"
      title="Esta pantalla muestra datos de demostración."
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-sm font-medium whitespace-nowrap text-amber-800 select-none dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-300 ${className}`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
      <span>datos de demostración</span>
      {permitirDesactivar && herramientasDevActivas() && (
        <button
          type="button"
          onClick={() => desactivarDemo()}
          className="ml-1 font-semibold text-amber-900 underline hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
          title="Cambiar a la API real de tu agencia"
        >
          (Usar API real)
        </button>
      )}
    </span>
  );
}
