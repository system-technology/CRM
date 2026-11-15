'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe, Loader2, Save } from 'lucide-react';
import {
  actualizarZonaHorariaApi,
  ErrorAjustesAgenciaApi,
  obtenerAjustesDeAgencia,
} from '../../lib/agencia-api';

/** Zonas IANA del navegador; America/* primero, el resto por región. */
export function listarZonasHorarias(actual?: string): string[] {
  const conjunto = new Set<string>();
  try {
    for (const z of Intl.supportedValuesOf('timeZone')) conjunto.add(z);
  } catch {
    // Navegador sin supportedValuesOf: queda la zona actual o el valor por defecto.
  }
  if (actual) conjunto.add(actual);
  if (conjunto.size === 0) conjunto.add('America/Bogota');
  return [...conjunto].sort((a, b) => {
    const pa = a.startsWith('America/') ? 0 : 1;
    const pb = b.startsWith('America/') ? 0 : 1;
    return pa - pb || a.localeCompare(b);
  });
}

export function mensajeDeErrorZona(err: unknown): string {
  if (err instanceof ErrorAjustesAgenciaApi) {
    if (err.estado === 403) return 'Solo el dueño o un administrador puede cambiarla.';
    if (err.estado === 422 || err.codigo === 'ZONA_HORARIA_INVALIDA') {
      return 'Esa zona horaria no existe. Elige una de la lista, por ejemplo America/Bogota.';
    }
    if (err.codigo === 'ERROR_CONEXION') {
      return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    }
    return 'No se pudo guardar la zona horaria. Inténtalo de nuevo en unos segundos.';
  }
  return 'No se pudo guardar la zona horaria. Inténtalo de nuevo en unos segundos.';
}

export function BloqueZonaHoraria() {
  const [actual, setActual] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState('');
  const [filtro, setFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setErrorCarga(null);
    obtenerAjustesDeAgencia()
      .then((a) => {
        if (!activo) return;
        setActual(a.zonaHoraria);
        setSeleccion(a.zonaHoraria);
      })
      .catch(() => {
        if (activo) {
          setErrorCarga('No se pudo cargar la zona horaria de la agencia. Reintenta.');
        }
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [intento]);

  const zonas = useMemo(() => listarZonasHorarias(actual ?? undefined), [actual]);
  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase().replace(/\s+/g, '_');
    const lista = f ? zonas.filter((z) => z.toLowerCase().includes(f)) : zonas;
    return seleccion && !lista.includes(seleccion) ? [seleccion, ...lista] : lista;
  }, [zonas, filtro, seleccion]);

  const grupos = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const z of visibles) {
      const region = z.includes('/') ? (z.split('/')[0] ?? 'Otras') : 'Otras';
      m.set(region, [...(m.get(region) ?? []), z]);
    }
    return [...m.entries()];
  }, [visibles]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seleccion || guardando) return;
    setGuardando(true);
    setExito(false);
    setErrorGuardado(null);
    try {
      const a = await actualizarZonaHorariaApi(seleccion);
      setActual(a.zonaHoraria);
      setSeleccion(a.zonaHoraria);
      setExito(true);
    } catch (err) {
      setErrorGuardado(mensajeDeErrorZona(err));
    } finally {
      setGuardando(false);
    }
  };

  const claseCampo =
    'mt-1 min-h-[44px] w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white';

  return (
    <form
      onSubmit={(e) => void guardar(e)}
      data-testid="bloque-zona-horaria"
      aria-labelledby="titulo-zona-horaria"
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <h3
          id="titulo-zona-horaria"
          className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white"
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          Zona horaria de la agencia
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Afecta cómo se muestran fechas y horas en toda la agencia. Los datos se guardan en UTC y
          no cambian.
        </p>
      </div>

      {cargando && (
        <div data-testid="cargando-zona-horaria" className="animate-pulse space-y-2" aria-busy>
          <div className="h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-11 w-full rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
      )}

      {!cargando && errorCarga && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorCarga}</span>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="min-h-[44px] rounded-lg border border-rose-300 px-3 font-semibold"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !errorCarga && actual && (
        <>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Zona actual:{' '}
            <strong data-testid="zona-horaria-actual" className="font-semibold">
              {actual}
            </strong>
          </p>

          <div>
            <label
              htmlFor="filtro-zona-horaria"
              className="block text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              Buscar zona
            </label>
            <input
              id="filtro-zona-horaria"
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Ej. Bogota, Mexico, Madrid"
              className={claseCampo}
            />
          </div>

          <div>
            <label
              htmlFor="selector-zona-horaria"
              className="block text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              Zona horaria
            </label>
            <select
              id="selector-zona-horaria"
              data-testid="selector-zona-horaria"
              value={seleccion}
              onChange={(e) => {
                setSeleccion(e.target.value);
                setExito(false);
              }}
              className={claseCampo}
            >
              {grupos.map(([region, items]) => (
                <optgroup key={region} label={region}>
                  {items.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {errorGuardado && (
            <div
              role="alert"
              data-testid="error-zona-horaria"
              className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorGuardado}</span>
            </div>
          )}
          {exito && (
            <div
              role="status"
              data-testid="exito-zona-horaria"
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Zona horaria actualizada.</span>
            </div>
          )}

          <button
            type="submit"
            data-testid="guardar-zona-horaria"
            disabled={guardando || seleccion === actual}
            className="flex min-h-[44px] items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{guardando ? 'Guardando…' : 'Guardar zona horaria'}</span>
          </button>
        </>
      )}
    </form>
  );
}
