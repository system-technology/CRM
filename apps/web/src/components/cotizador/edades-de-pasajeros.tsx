'use client';

import React from 'react';

/**
 * Pide la edad de cada niño y de cada infante, y si el infante ocupa silla (T-179).
 *
 * Es lo que permite cotizar a una familia en un producto con tarifa de menor: la tarifa trae un
 * rango de edad (p. ej. 2 a 11) y sin la edad de cada pasajero el servidor no puede evaluarla.
 * No se pone una edad por defecto: lo que no se pregunta no se supone.
 */

import {
  EDAD_MAXIMA_INFANTE,
  EDAD_MAXIMA_NINO,
  ajustarLongitud,
  interpretarEdad,
  type EdadesIncompletas,
} from '../../lib/cotizador-edades';

interface Props {
  ninos: number;
  infantes: number;
  edadesNinos: EdadesIncompletas;
  edadesInfantes: EdadesIncompletas;
  infantesConSilla: readonly boolean[];
  onEdadesNinos: (edades: (number | null)[]) => void;
  onEdadesInfantes: (edades: (number | null)[]) => void;
  onInfantesConSilla: (silla: boolean[]) => void;
}

const CLASE_INPUT =
  'min-h-[44px] w-20 rounded-lg border border-neutral-300 bg-white p-2 text-center text-xs text-neutral-900 focus-visible:ring-2 focus-visible:ring-acento-600 focus-visible:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white';

export function EdadesDePasajeros(props: Props) {
  const { ninos, infantes } = props;
  if (ninos < 1 && infantes < 1) return null;

  const edadesNinos = ajustarLongitud(props.edadesNinos, ninos);
  const edadesInfantes = ajustarLongitud(props.edadesInfantes, infantes);
  const silla = Array.from({ length: infantes }, (_, i) => props.infantesConSilla[i] ?? false);

  return (
    <div
      role="group"
      aria-label="Edades de los pasajeros menores"
      className="border-acento-100 bg-acento-50/50 dark:border-acento-900 dark:bg-acento-950/30 mt-3 space-y-3 rounded-xl border p-3"
    >
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        La tarifa de menor depende de la edad: indica la de cada uno.
      </p>

      {edadesNinos.map((edad, i) => (
        <div key={`nino-${i}`} className="flex items-center justify-between gap-2">
          <label
            htmlFor={`edad-nino-${i}`}
            className="text-xs font-medium text-neutral-700 dark:text-neutral-300"
          >
            Edad del niño {i + 1}
          </label>
          <input
            id={`edad-nino-${i}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={EDAD_MAXIMA_NINO}
            step={1}
            placeholder="años"
            value={edad ?? ''}
            onChange={(e) => {
              const nuevas = [...edadesNinos];
              nuevas[i] = interpretarEdad(e.target.value, EDAD_MAXIMA_NINO);
              props.onEdadesNinos(nuevas);
            }}
            className={CLASE_INPUT}
          />
        </div>
      ))}

      {edadesInfantes.map((edad, i) => (
        <div key={`infante-${i}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`edad-infante-${i}`}
              className="text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              Edad del infante {i + 1}
            </label>
            <input
              id={`edad-infante-${i}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={EDAD_MAXIMA_INFANTE}
              step={1}
              placeholder="años"
              value={edad ?? ''}
              onChange={(e) => {
                const nuevas = [...edadesInfantes];
                nuevas[i] = interpretarEdad(e.target.value, EDAD_MAXIMA_INFANTE);
                props.onEdadesInfantes(nuevas);
              }}
              className={CLASE_INPUT}
            />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={silla[i] ?? false}
              onChange={(e) => {
                const nuevas = [...silla];
                nuevas[i] = e.target.checked;
                props.onInfantesConSilla(nuevas);
              }}
              className="h-4 w-4"
            />
            El infante {i + 1} ocupa silla propia
          </label>
        </div>
      ))}
    </div>
  );
}
