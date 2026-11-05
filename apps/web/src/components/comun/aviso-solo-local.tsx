'use client';

import React from 'react';
import { HardDrive } from 'lucide-react';
import { estaUsandoApiReal } from '../../lib/crm-api';
import { useModoDemo } from '../../lib/modo-demo';

interface AvisoSoloLocalProps {
  /** Qué se guarda solo en el navegador, en minúsculas: «las respuestas rápidas». */
  que: string;
  /** Fuerza la visibilidad (pruebas). Por defecto: solo en modo real. */
  visible?: boolean;
  className?: string;
}

/**
 * Aviso visible de que una pantalla guarda sus datos únicamente en este navegador
 * (localStorage) y no en la API (T-124). En modo real, un asesor que cambia de equipo o de
 * navegador no vería lo que configuró ni lo vería el resto de la agencia; callarlo sería mentir.
 * En modo demostración no se muestra: ahí ya está el distintivo de datos de demostración.
 */
export function AvisoSoloLocal({ que, visible, className = '' }: AvisoSoloLocalProps) {
  const { esDemo } = useModoDemo();
  const mostrar = visible !== undefined ? visible : !esDemo && estaUsandoApiReal();

  if (!mostrar) return null;

  return (
    <div
      role="note"
      data-testid="aviso-solo-local"
      className={`flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200 ${className}`}
    >
      <HardDrive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">Solo en este navegador.</strong> {capitalizar(que)} se
        guardan aquí, no en la agencia: no se comparten con tu equipo ni aparecen en otro
        dispositivo.
      </p>
    </div>
  );
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
