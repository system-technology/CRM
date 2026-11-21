'use client';

/**
 * Pieza común del dashboard de administración (T-344): el marco de un bloque con sus tres estados
 * (cargando, error con «Reintentar», sin permiso) y el hook que lo alimenta. Cada bloque carga por
 * su cuenta: que fallen los cobros no apaga las ventas.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';

export type Carga<T> =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string; codigo?: string }
  | { estado: 'sin-permiso'; mensaje: string }
  | { estado: 'listo'; datos: T };

interface ErrorConEstado {
  estado?: number | null;
  codigo?: string;
  message?: string;
}

/**
 * Ejecuta `cargar` al montar y cuando cambia `clave`; cancela la lectura anterior. Un 403 es «sin
 * permiso» (se explica), no un error que se reintente.
 */
export function useCarga<T>(
  cargar: (senal: AbortSignal) => Promise<T>,
  clave: string,
  /** `false`: no se pide nada (el bloque que lo usa no se muestra). */
  activo = true,
): [Carga<T>, () => void] {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    setCarga({ estado: 'cargando' });
    cargarRef
      .current(control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setCarga({ estado: 'listo', datos });
      })
      .catch((err: unknown) => {
        if (control.signal.aborted) return;
        const e = err as ErrorConEstado;
        if (e.estado === 403 || e.codigo === 'PERMISO_DENEGADO') {
          setCarga({
            estado: 'sin-permiso',
            mensaje: e.message ?? 'Tu rol no tiene permiso para ver esta información.',
          });
          return;
        }
        setCarga({
          estado: 'error',
          mensaje: 'No pudimos cargar esta información. Revisa tu conexión e inténtalo de nuevo.',
          ...(e.codigo ? { codigo: e.codigo } : {}),
        });
      });
    return () => control.abort();
  }, [clave, intento, activo]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return [carga, reintentar];
}

const tarjeta =
  'rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900';

interface BloqueProps<T> {
  /** Para `aria-labelledby` y para las pruebas. */
  id: string;
  titulo: string;
  /** Una línea que dice qué mide y de qué cohorte: sin ella la cifra se malinterpreta. */
  nota?: string;
  carga: Carga<T>;
  reintentar: () => void;
  className?: string;
  children: (datos: T) => React.ReactNode;
}

export function Bloque<T>({
  id,
  titulo,
  nota,
  carga,
  reintentar,
  className = '',
  children,
}: BloqueProps<T>) {
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      data-testid={`bloque-${id}`}
      className={`${tarjeta} min-w-0 ${className}`}
    >
      <h2 id={`${id}-titulo`} className="text-sm font-semibold text-neutral-900 dark:text-white">
        {titulo}
      </h2>
      {nota ? (
        <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">{nota}</p>
      ) : null}
      <div className="mt-3">
        {carga.estado === 'cargando' ? (
          <div role="status" aria-label={`Cargando ${titulo.toLowerCase()}`} className="space-y-2">
            <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ) : carga.estado === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="flex items-start gap-2 text-neutral-700 dark:text-neutral-300">
              <AlertTriangle
                aria-hidden="true"
                className="text-aviso-700 mt-0.5 size-4 shrink-0 dark:text-amber-400"
              />
              {carga.mensaje}
            </p>
            <button
              type="button"
              onClick={reintentar}
              className="focus-visible:outline-acento-600 min-h-11 rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 md:min-h-9 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              Reintentar
            </button>
          </div>
        ) : carga.estado === 'sin-permiso' ? (
          <p className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <Lock
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-neutral-600 dark:text-neutral-400"
            />
            {carga.mensaje}
          </p>
        ) : (
          children(carga.datos)
        )}
      </div>
    </section>
  );
}
