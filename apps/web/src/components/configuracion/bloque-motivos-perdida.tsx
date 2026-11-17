'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { MotivoDePerdida } from '@viajapro/contracts';
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle, Lock, Plus, ThumbsDown } from 'lucide-react';
import {
  CrmApiError,
  actualizarMotivoDePerdidaApi,
  crearMotivoDePerdidaApi,
  estaUsandoApiReal,
  listarMotivosDePerdidaApi,
} from '../../lib/crm-api';
import { usePermisos, explicacionFaltaPermiso } from '../../lib/permisos';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';
import { motivosDePerdidaMock } from '../../lib/motivos-perdida-logica';

/** Traduce el error del API a algo que el asesor pueda corregir. */
function mensajeDeError(err: unknown, fallback: string): string {
  if (err instanceof CrmApiError && err.status === 409) {
    return 'Ya existe un motivo con esa etiqueta. Usa otro nombre o reactiva el existente.';
  }
  return formatearErrorAmigable(err, fallback);
}

const ordenar = (lista: MotivoDePerdida[]) => [...lista].sort((a, b) => a.orden - b.orden);

/**
 * Bloque de Configuración: Motivos de pérdida de la agencia (T-229, R12). Los de sistema
 * (clave no nula) se pueden renombrar y desactivar, no cambiar de clave ni borrar. Sin API real
 * opera sobre una lista local equivalente a los siete sembrados.
 */
export function BloqueMotivosPerdida() {
  const { puedeEscribirCrm } = usePermisos();
  const [motivos, setMotivos] = useState<MotivoDePerdida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [nuevaExigeNota, setNuevaExigeNota] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [etiquetaEditada, setEtiquetaEditada] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      if (estaUsandoApiReal()) {
        setMotivos(ordenar(await listarMotivosDePerdidaApi(true)));
      } else {
        setMotivos(motivosDePerdidaMock());
      }
    } catch (err) {
      setErrorCarga(mensajeDeError(err, 'No fue posible cargar los motivos de pérdida.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const reemplazar = (m: MotivoDePerdida) =>
    setMotivos((prev) => ordenar(prev.map((x) => (x.id === m.id ? m : x))));

  const avisar = (msg: string) => {
    setExito(msg);
    setTimeout(() => setExito(null), 3000);
  };

  /** Aplica un cambio parcial: API real o, sin ella, solo en la lista local. */
  const actualizar = async (
    m: MotivoDePerdida,
    cambios: Partial<Pick<MotivoDePerdida, 'etiqueta' | 'orden' | 'activo' | 'exigeNota'>>,
  ): Promise<MotivoDePerdida> =>
    estaUsandoApiReal() ? actualizarMotivoDePerdidaApi(m.id, cambios) : { ...m, ...cambios };

  const ejecutar = async (accion: () => Promise<void>, fallback: string): Promise<boolean> => {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      return true;
    } catch (err) {
      setError(mensajeDeError(err, fallback));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const etiqueta = nuevaEtiqueta.trim();
    if (!etiqueta) {
      setError('Escribe la etiqueta del motivo antes de crearlo.');
      return;
    }
    const ok = await ejecutar(async () => {
      const creado = estaUsandoApiReal()
        ? await crearMotivoDePerdidaApi({ etiqueta, exigeNota: nuevaExigeNota })
        : {
            id: crypto.randomUUID(),
            clave: null,
            etiqueta,
            orden: motivos.length,
            activo: true,
            exigeNota: nuevaExigeNota,
          };
      setMotivos((prev) => ordenar([...prev, creado]));
    }, 'No fue posible crear el motivo.');
    if (ok) {
      setNuevaEtiqueta('');
      setNuevaExigeNota(false);
      avisar('Motivo creado.');
    }
  };

  const cambiar = async (
    m: MotivoDePerdida,
    cambios: Parameters<typeof actualizar>[1],
    mensaje: string,
  ) => {
    const ok = await ejecutar(async () => reemplazar(await actualizar(m, cambios)), mensaje);
    return ok;
  };

  const guardarEtiqueta = async (m: MotivoDePerdida) => {
    const etiqueta = etiquetaEditada.trim();
    if (!etiqueta) {
      setError('La etiqueta no puede quedar vacía.');
      return;
    }
    if (etiqueta === m.etiqueta) {
      setEditandoId(null);
      return;
    }
    if (await cambiar(m, { etiqueta }, 'No fue posible renombrar el motivo.')) {
      setEditandoId(null);
      avisar('Motivo renombrado.');
    }
  };

  /** Intercambia el orden con el vecino visible. Dos PATCH: si el segundo falla se recarga. */
  const mover = async (visibles: MotivoDePerdida[], indice: number, delta: -1 | 1) => {
    const a = visibles[indice];
    const b = visibles[indice + delta];
    if (!a || !b) return;
    let ordenA = b.orden;
    let ordenB = a.orden;
    if (ordenA === ordenB) {
      ordenA = Math.max(0, b.orden + delta);
      ordenB = ordenA === b.orden ? b.orden + 1 : b.orden;
    }
    const ok = await ejecutar(async () => {
      try {
        const nuevoA = await actualizar(a, { orden: ordenA });
        const nuevoB = await actualizar(b, { orden: ordenB });
        setMotivos((prev) =>
          ordenar(prev.map((x) => (x.id === a.id ? nuevoA : x.id === b.id ? nuevoB : x))),
        );
      } catch (err) {
        void cargar();
        throw err;
      }
    }, 'No fue posible reordenar los motivos.');
    if (ok) avisar('Orden actualizado.');
  };

  const visibles = mostrarInactivos ? motivos : motivos.filter((m) => m.activo);
  const sinPermiso = !puedeEscribirCrm;
  const deshabilitar = sinPermiso || ocupado;
  const tituloPermiso = sinPermiso ? explicacionFaltaPermiso('crm.escribir') : undefined;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            <ThumbsDown className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Motivos de pérdida
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Lo que el asesor elige al marcar una oportunidad como perdida. Alimenta los reportes.
            </p>
          </div>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
            className="h-4 w-4"
          />
          Mostrar inactivos
        </label>
      </div>

      {exito && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{exito}</span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Alta */}
      <form onSubmit={(e) => void crear(e)} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={nuevaEtiqueta}
          onChange={(e) => setNuevaEtiqueta(e.target.value)}
          maxLength={80}
          disabled={deshabilitar}
          aria-label="Etiqueta del nuevo motivo"
          placeholder="Nuevo motivo, ej. Prefirió otro destino"
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <label className="flex min-h-[44px] items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={nuevaExigeNota}
            onChange={(e) => setNuevaExigeNota(e.target.checked)}
            disabled={deshabilitar}
            className="h-4 w-4"
          />
          Exige nota
        </label>
        <button
          type="submit"
          disabled={deshabilitar}
          title={tituloPermiso}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          <Plus className="h-4 w-4" />
          <span>Crear motivo</span>
        </button>
      </form>

      {/* Lista */}
      {cargando ? (
        <div data-testid="motivos-cargando" className="mt-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800/50"
            />
          ))}
        </div>
      ) : errorCarga ? (
        <div
          role="alert"
          className="mt-5 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <span>{errorCarga}</span>
          <button
            type="button"
            onClick={() => void cargar()}
            className="min-h-[44px] w-full rounded-xl border border-rose-300 bg-white px-4 text-xs font-semibold sm:w-auto sm:self-start dark:bg-neutral-900"
          >
            Reintentar
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <p
          data-testid="motivos-vacio"
          className="mt-5 rounded-xl border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500 dark:border-neutral-700"
        >
          {motivos.length === 0
            ? 'Tu agencia todavía no tiene motivos de pérdida. Crea el primero arriba.'
            : 'No hay motivos activos. Marca «Mostrar inactivos» para reactivarlos.'}
        </p>
      ) : (
        <ul className="mt-5 space-y-3" aria-label="Motivos de pérdida configurados">
          {visibles.map((m, idx) => (
            <li
              key={m.id}
              className={`flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-800/40 ${
                m.activo ? '' : 'opacity-60'
              }`}
            >
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void mover(visibles, idx, -1)}
                  disabled={idx === 0 || deshabilitar}
                  aria-label={`Subir motivo «${m.etiqueta}»`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void mover(visibles, idx, 1)}
                  disabled={idx === visibles.length - 1 || deshabilitar}
                  aria-label={`Bajar motivo «${m.etiqueta}»`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                {editandoId === m.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void guardarEtiqueta(m);
                    }}
                    className="flex flex-wrap gap-2"
                  >
                    <input
                      type="text"
                      value={etiquetaEditada}
                      onChange={(e) => setEtiquetaEditada(e.target.value)}
                      maxLength={80}
                      autoFocus
                      aria-label={`Nueva etiqueta para «${m.etiqueta}»`}
                      className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={deshabilitar}
                      className="min-h-[44px] rounded-xl bg-neutral-900 px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="min-h-[44px] rounded-xl px-3 text-xs font-medium text-neutral-600 dark:text-neutral-300"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {m.etiqueta}
                    </span>
                    {m.clave && (
                      <span className="flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                        <Lock className="h-3 w-3" />
                        Sistema · {m.clave}
                      </span>
                    )}
                    {!m.activo && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Inactivo
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-[44px] items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={m.exigeNota}
                    disabled={deshabilitar}
                    onChange={(e) =>
                      void cambiar(
                        m,
                        { exigeNota: e.target.checked },
                        'No fue posible cambiar «exige nota».',
                      )
                    }
                    aria-label={`Exige nota: ${m.etiqueta}`}
                    className="h-4 w-4"
                  />
                  Exige nota
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setEditandoId(m.id);
                    setEtiquetaEditada(m.etiqueta);
                    setError(null);
                  }}
                  disabled={deshabilitar}
                  title={tituloPermiso}
                  aria-label={`Renombrar motivo «${m.etiqueta}»`}
                  className="min-h-[44px] rounded-xl border border-neutral-300 bg-white px-3 text-xs font-medium disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void cambiar(
                      m,
                      { activo: !m.activo },
                      m.activo
                        ? 'No fue posible desactivar el motivo.'
                        : 'No fue posible activar el motivo.',
                    )
                  }
                  disabled={deshabilitar}
                  title={tituloPermiso}
                  aria-label={`${m.activo ? 'Desactivar' : 'Activar'} motivo «${m.etiqueta}»`}
                  className="min-h-[44px] rounded-xl border border-neutral-300 bg-white px-3 text-xs font-medium disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  {m.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
