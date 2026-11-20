'use client';

import React, { useState } from 'react';
import { fechaIsoADiaMesAnio, diaMesAnioAFechaIso } from '../../lib/formato';

interface CampoFechaProps {
  id: string;
  /** Fecha en ISO `AAAA-MM-DD` (lo que se guarda), o cadena vacía. */
  valor: string;
  onChange: (iso: string) => void;
  className?: string;
}

/**
 * Campo de fecha en `dd/mm/aaaa`. El selector nativo (`type="date"`) muestra el formato del
 * navegador (mm/dd/aaaa en inglés de EE. UU.), ambiguo para una agencia colombiana; aquí se
 * escribe y se lee siempre día/mes/año y se guarda ISO.
 */
export function CampoFecha({ id, valor, onChange, className = '' }: CampoFechaProps) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const texto = borrador ?? fechaIsoADiaMesAnio(valor);
  const incompleto = borrador !== null && borrador !== '' && diaMesAnioAFechaIso(borrador) === null;

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={texto}
        aria-invalid={incompleto}
        onChange={(e) => {
          const nuevo = e.target.value;
          setBorrador(nuevo);
          if (nuevo === '') onChange('');
          else {
            const iso = diaMesAnioAFechaIso(nuevo);
            if (iso) onChange(iso);
          }
        }}
        onBlur={() => setBorrador(null)}
        className={className}
      />
      {incompleto && (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Escribe la fecha como día/mes/año, por ejemplo 15/12/2026.
        </p>
      )}
    </>
  );
}
