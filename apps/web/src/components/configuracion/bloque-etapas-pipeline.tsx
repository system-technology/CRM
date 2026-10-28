'use client';

import React, { useState, useEffect } from 'react';
import { EtapaDefinida } from '@viajapro/contracts';
import {
  GitCommit,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Save,
  CheckCircle,
  AlertCircle,
  Percent,
  ShieldAlert,
} from 'lucide-react';
import { listarEtapasPipelineApi, actualizarEtapasPipelineApi } from '../../lib/crm-api';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';

/**
 * Bloque de Configuración: Etapas del Pipeline Comercial (T-025).
 * Permite listar, reordenar, renombrar y calibrar las probabilidades de cierre
 * de las etapas comerciales activas de la agencia.
 */
export function BloqueEtapasPipeline() {
  const [etapas, setEtapas] = useState<EtapaDefinida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let montado = true;
    listarEtapasPipelineApi()
      .then((datos) => {
        if (montado) {
          // Ordenar por campo orden ascendente
          const ordenadas = [...datos].sort((a, b) => a.orden - b.orden);
          setEtapas(ordenadas);
          setCargando(false);
        }
      })
      .catch((err) => {
        if (montado) {
          setError(formatearErrorAmigable(err, 'No fue posible cargar las etapas del pipeline.'));
          setCargando(false);
        }
      });

    return () => {
      montado = false;
    };
  }, []);

  const moverArriba = (indice: number) => {
    if (indice <= 0) return;
    const nuevas = [...etapas];
    const actual = nuevas[indice];
    const anterior = nuevas[indice - 1];

    if (!actual || !anterior) return;

    // Intercambiar orden numérico
    const ordenTemp = actual.orden;
    actual.orden = anterior.orden;
    anterior.orden = ordenTemp;

    nuevas[indice - 1] = actual;
    nuevas[indice] = anterior;

    setEtapas(nuevas);
  };

  const moverAbajo = (indice: number) => {
    if (indice >= etapas.length - 1) return;
    const nuevas = [...etapas];
    const actual = nuevas[indice];
    const siguiente = nuevas[indice + 1];

    if (!actual || !siguiente) return;

    const ordenTemp = actual.orden;
    actual.orden = siguiente.orden;
    siguiente.orden = ordenTemp;

    nuevas[indice + 1] = actual;
    nuevas[indice] = siguiente;

    setEtapas(nuevas);
  };

  const actualizarNombre = (id: string, nuevoNombre: string) => {
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, nombre: nuevoNombre } : e)));
  };

  const actualizarProbabilidad = (id: string, nuevaProb: number) => {
    const prob = Math.min(100, Math.max(0, isNaN(nuevaProb) ? 0 : nuevaProb));
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, probabilidad: prob } : e)));
  };

  const guardarCambios = async () => {
    setGuardando(true);
    setError(null);
    setMensajeExito(null);

    try {
      const actualizadas = await actualizarEtapasPipelineApi(etapas);
      setEtapas(actualizadas);
      setMensajeExito('Etapas del pipeline guardadas correctamente.');
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err) {
      setError(formatearErrorAmigable(err, 'Error al guardar los cambios en las etapas.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <GitCommit className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Etapas del Pipeline Comercial
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Configura el embudo de ventas, nombres personalizados, orden y probabilidad por etapa
              (ADR-0016 / T-025).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void guardarCambios()}
          disabled={guardando || cargando}
          className="bg-primary-600 hover:bg-primary-700 flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-2xs transition-colors disabled:opacity-50 sm:w-auto"
        >
          <Save className="h-4 w-4" />
          <span>{guardando ? 'Guardando...' : 'Guardar etapas'}</span>
        </button>
      </div>

      {/* Alertas de Éxito / Error */}
      {mensajeExito && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{mensajeExito}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Listado Interactivo de Etapas */}
      {cargando ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800/50"
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-3" role="list" aria-label="Listado de etapas configuradas">
          {etapas.map((etapa, idx) => {
            return (
              <div
                key={etapa.id}
                role="listitem"
                className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-800/40"
              >
                {/* Controles de Orden y Nombre */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {/* Flechas arriba / abajo con objetivo táctil >= 44px */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moverArriba(idx)}
                      disabled={idx === 0}
                      title={`Mover etapa "${etapa.nombre}" hacia arriba`}
                      aria-label={`Mover etapa "${etapa.nombre}" hacia arriba`}
                      className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moverAbajo(idx)}
                      disabled={idx === etapas.length - 1}
                      title={`Mover etapa "${etapa.nombre}" hacia abajo`}
                      aria-label={`Mover etapa "${etapa.nombre}" hacia abajo`}
                      className="flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Número de orden */}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    {etapa.orden}
                  </span>

                  {/* Input de Nombre editable */}
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={etapa.nombre}
                      onChange={(e) => actualizarNombre(etapa.id, e.target.value)}
                      aria-label={`Nombre de la etapa ${etapa.nombre}`}
                      className="focus:border-acento-600 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* Calibración de Probabilidad y Badges de Comportamiento */}
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {/* Probabilidad */}
                  <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-2.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800">
                    <Percent className="h-3.5 w-3.5 text-neutral-400" />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={etapa.probabilidad}
                      onChange={(e) =>
                        actualizarProbabilidad(etapa.id, parseInt(e.target.value, 10))
                      }
                      aria-label={`Probabilidad de cierre para ${etapa.nombre}`}
                      className="cifra min-h-[36px] w-12 bg-transparent text-center text-xs font-bold text-neutral-900 focus:outline-hidden dark:text-white"
                    />
                    <span className="text-[11px] text-neutral-400">%</span>
                  </div>

                  {/* Badges de regla */}
                  {etapa.esGanada && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <Sparkles className="h-3 w-3" />
                      Ganada
                    </span>
                  )}

                  {etapa.esPerdida && (
                    <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      <ShieldAlert className="h-3 w-3" />
                      Exige Motivo
                    </span>
                  )}

                  {etapa.clave && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {etapa.clave}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
