'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, Loader2, Save } from 'lucide-react';
import { RntDeAgencia } from '@viajapro/contracts';
import {
  actualizarRntApi,
  ErrorAjustesAgenciaApi,
  obtenerAjustesDeAgencia,
} from '../../lib/agencia-api';

export function mensajeDeErrorRnt(err: unknown): string {
  if (err instanceof ErrorAjustesAgenciaApi) {
    if (err.estado === 403) return 'Solo el dueño o un administrador puede cambiarlo.';
    if (err.estado === 400) return 'El RNT son solo dígitos, hasta 10. Revisa el número.';
    if (err.codigo === 'ERROR_CONEXION') {
      return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    }
  }
  return 'No se pudo guardar el RNT. Inténtalo de nuevo en unos segundos.';
}

/**
 * El RNT de la agencia (T-261, ADR-0030 §3.3). Lo escribe el dueño o un administrador; lo verifica
 * la plataforma. Mientras no esté verificado no sale en la propuesta al viajero, y cambiarlo
 * obliga a verificarlo de nuevo: la pantalla lo dice antes de guardar.
 */
export function BloqueRnt() {
  const [guardado, setGuardado] = useState<string | null>(null);
  const [verificado, setVerificado] = useState(false);
  const [valor, setValor] = useState('');
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
        setGuardado(a.rnt ?? null);
        setVerificado(a.rntVerificado === true);
        setValor(a.rnt ?? '');
      })
      .catch(() => {
        if (activo) setErrorCarga('No se pudo cargar el RNT de la agencia. Reintenta.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [intento]);

  const limpio = valor.trim();
  const invalido = limpio !== '' && !RntDeAgencia.safeParse(limpio).success;
  const sinCambios = limpio === (guardado ?? '');
  const perderaVerificacion = verificado && !sinCambios;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalido || sinCambios || guardando) return;
    setGuardando(true);
    setExito(false);
    setErrorGuardado(null);
    try {
      const a = await actualizarRntApi(limpio === '' ? null : limpio);
      setGuardado(a.rnt ?? null);
      setVerificado(a.rntVerificado === true);
      setValor(a.rnt ?? '');
      setExito(true);
    } catch (err) {
      setErrorGuardado(mensajeDeErrorRnt(err));
    } finally {
      setGuardando(false);
    }
  };

  const claseCampo =
    'mt-1 min-h-[44px] w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-acento-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white';

  return (
    <form
      onSubmit={(e) => void guardar(e)}
      data-testid="bloque-rnt"
      aria-labelledby="titulo-rnt"
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <h3
          id="titulo-rnt"
          className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white"
        >
          <BadgeCheck className="h-4 w-4" aria-hidden="true" />
          Registro Nacional de Turismo (RNT)
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Es el número con el que la agencia está registrada. La propuesta al viajero lo imprime
          cuando está verificado.
        </p>
      </div>

      {cargando && (
        <div data-testid="cargando-rnt" className="animate-pulse space-y-2" aria-busy>
          <div className="h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-11 w-full rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
      )}

      {!cargando && errorCarga && (
        <div
          role="alert"
          className="border-alerta-600/30 bg-alerta-50 text-alerta-700 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorCarga}</span>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="boton-secundario min-h-[44px] rounded-lg px-3 text-xs font-semibold"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !errorCarga && (
        <>
          <div data-testid="estado-rnt" className="text-sm">
            {guardado === null && (
              <p className="text-neutral-700 dark:text-neutral-300">
                Aún no registraste el RNT. Hasta entonces la propuesta al viajero sale sin él.
              </p>
            )}
            {guardado !== null && verificado && (
              <p className="text-ok-700 flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Verificado.</strong> El RNT {guardado} sale en la propuesta al viajero.
                </span>
              </p>
            )}
            {guardado !== null && !verificado && (
              <p className="text-aviso-700 flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Pendiente de verificación.</strong> El RNT {guardado} todavía no sale en
                  la propuesta al viajero. Lo verifica el equipo de ViajaPro; no tienes que hacer
                  nada más.
                </span>
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="campo-rnt"
              className="block text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              Número de RNT
            </label>
            <input
              id="campo-rnt"
              data-testid="campo-rnt"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setExito(false);
                setErrorGuardado(null);
              }}
              aria-invalid={invalido}
              aria-describedby="ayuda-rnt"
              placeholder="Ej. 48213"
              className={claseCampo}
            />
            <p
              id="ayuda-rnt"
              data-testid="ayuda-rnt"
              className={`mt-1 text-xs ${invalido ? 'text-alerta-700' : 'text-neutral-500 dark:text-neutral-400'}`}
            >
              {invalido
                ? 'Escribe solo dígitos, hasta 10.'
                : 'Solo dígitos, hasta 10. Déjalo vacío para quitarlo.'}
            </p>
          </div>

          {perderaVerificacion && (
            <p
              data-testid="aviso-reverificar"
              className="border-aviso-600/30 bg-aviso-50 text-aviso-700 flex items-start gap-2 rounded-lg border p-3 text-xs"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Si cambias el RNT, tendrá que verificarse de nuevo y dejará de salir en la propuesta
                hasta entonces.
              </span>
            </p>
          )}

          {errorGuardado && (
            <div
              role="alert"
              data-testid="error-rnt"
              className="border-alerta-600/30 bg-alerta-50 text-alerta-700 flex items-center gap-2 rounded-lg border p-3 text-xs"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorGuardado}</span>
            </div>
          )}
          {exito && (
            <div
              role="status"
              data-testid="exito-rnt"
              className="border-ok-600/30 bg-ok-50 text-ok-700 flex items-center gap-2 rounded-lg border p-3 text-xs"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>RNT guardado.</span>
            </div>
          )}

          <button
            type="submit"
            data-testid="guardar-rnt"
            disabled={guardando || invalido || sinCambios}
            className="boton-primario flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{guardando ? 'Guardando…' : 'Guardar RNT'}</span>
          </button>
        </>
      )}
    </form>
  );
}
