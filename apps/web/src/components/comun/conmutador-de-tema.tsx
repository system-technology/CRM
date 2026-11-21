'use client';

import React, { useEffect, useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import { cargarPreferenciasTema, guardarModoTema, type ModoTema } from '../../lib/tema-y-densidad';

const OPCIONES: ReadonlyArray<{ modo: ModoTema; etiqueta: string; Icono: typeof Sun }> = [
  { modo: 'light', etiqueta: 'Claro', Icono: Sun },
  { modo: 'dark', etiqueta: 'Oscuro', Icono: Moon },
  { modo: 'system', etiqueta: 'Sistema', Icono: Laptop },
];

/**
 * Conmutador mínimo del tema (T-560) para las pantallas SIN marco —ingreso, invitación, cookies,
 * términos—, donde no existe el menú de perfil que lleva `SelectorTemaDensidad`. Usa la misma
 * preferencia (`viajapro_tema`) y la misma función que lo aplica, así que la elección vale también
 * al entrar. Al servidor no se le pregunta nada: el primer pintado ya lo resolvió el script del
 * `<head>`; aquí solo se lee la preferencia guardada al montar, para marcar la opción vigente.
 */
export function ConmutadorDeTema() {
  const [tema, setTema] = useState<ModoTema | null>(null);

  useEffect(() => {
    setTema(cargarPreferenciasTema().tema);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Tema visual"
      data-testid="conmutador-de-tema"
      className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {OPCIONES.map(({ modo, etiqueta, Icono }) => (
        <button
          key={modo}
          type="button"
          role="radio"
          aria-checked={tema === modo}
          aria-label={etiqueta}
          title={etiqueta}
          data-testid={`conmutador-tema-${modo}`}
          onClick={() => setTema(guardarModoTema(modo).tema)}
          className={`focus-visible:ring-acento-600 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition focus-visible:ring-2 focus-visible:outline-none ${
            tema === modo
              ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Icono aria-hidden="true" className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
