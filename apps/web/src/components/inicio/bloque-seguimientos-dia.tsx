'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Sparkles,
  User,
} from 'lucide-react';
import type { PendientesDelDia, Seguimiento } from '@viajapro/contracts';
import { calcularRetrasoSeguimiento, formatearHoraSeguimiento } from '../../lib/inicio-logica';
import { obtenerClaseEscalonada } from '../comun/animaciones';

export interface BloqueSeguimientosDiaProps {
  pendientes: PendientesDelDia | null;
  cargando?: boolean;
  alCompletarSeguimiento?: (id: string) => Promise<void>;
}

type TabFiltro = 'TODOS' | 'VENCIDOS' | 'HOY';

export function BloqueSeguimientosDia({
  pendientes,
  cargando = false,
  alCompletarSeguimiento,
}: BloqueSeguimientosDiaProps) {
  const [tabActiva, setTabActiva] = useState<TabFiltro>('TODOS');
  const [completandoId, setCompletandoId] = useState<string | null>(null);

  const vencidos = pendientes?.vencidos ?? [];
  const deHoy = pendientes?.deHoy ?? [];
  const totalPendientes = vencidos.length + deHoy.length;

  const handleCompletar = async (id: string) => {
    if (!alCompletarSeguimiento || completandoId) return;
    setCompletandoId(id);
    try {
      await alCompletarSeguimiento(id);
    } finally {
      setCompletandoId(null);
    }
  };

  if (cargando) {
    return (
      <section
        data-testid="seguimientos-cargando"
        className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between pb-4">
          <div className="h-5 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40"
            />
          ))}
        </div>
      </section>
    );
  }

  const itemsAMostrar: { item: Seguimiento; esVencido: boolean }[] = [];
  if (tabActiva === 'TODOS' || tabActiva === 'VENCIDOS') {
    for (const s of vencidos) {
      itemsAMostrar.push({ item: s, esVencido: true });
    }
  }
  if (tabActiva === 'TODOS' || tabActiva === 'HOY') {
    for (const s of deHoy) {
      itemsAMostrar.push({ item: s, esVencido: false });
    }
  }

  return (
    <section
      data-testid="bloque-seguimientos-dia"
      aria-labelledby="titulo-seguimientos"
      className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Cabecera con título, métricas y filtros */}
      <div className="flex flex-col gap-3 border-b border-neutral-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <h2
              id="titulo-seguimientos"
              className="text-base font-bold text-neutral-900 dark:text-neutral-100"
            >
              Seguimientos pendientes del día
            </h2>
            {vencidos.length > 0 && (
              <span
                data-testid="badge-alerta-vencidos"
                className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950/70 dark:text-rose-300"
              >
                <AlertTriangle className="h-3 w-3" />
                {vencidos.length} {vencidos.length === 1 ? 'vencido' : 'vencidos'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Compromisos con clientes y cotizaciones en curso para hoy
          </p>
        </div>

        {/* Pestañas de filtrado rápido */}
        <div className="flex items-center gap-1.5 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            type="button"
            data-testid="filtro-seguimientos-todos"
            onClick={() => setTabActiva('TODOS')}
            className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition ${
              tabActiva === 'TODOS'
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            Todos ({totalPendientes})
          </button>
          <button
            type="button"
            data-testid="filtro-seguimientos-vencidos"
            onClick={() => setTabActiva('VENCIDOS')}
            className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition ${
              tabActiva === 'VENCIDOS'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
            }`}
          >
            Vencidos ({vencidos.length})
          </button>
          <button
            type="button"
            data-testid="filtro-seguimientos-hoy"
            onClick={() => setTabActiva('HOY')}
            className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition ${
              tabActiva === 'HOY'
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            Para hoy ({deHoy.length})
          </button>
        </div>
      </div>

      {/* ESTADO VACÍO: Al día sin seguimientos */}
      {itemsAMostrar.length === 0 && (
        <div
          data-testid="seguimientos-vacio"
          className="dark:bg-neutral-850 my-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 p-8 text-center dark:border-neutral-800"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-neutral-900 dark:text-white">
            ¡Estás al día con tus seguimientos!
          </h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
            {tabActiva === 'VENCIDOS'
              ? 'No tienes tareas vencidas acumuladas de días anteriores.'
              : 'No hay tareas pendientes programadas para hoy. Puedes explorar la bandeja de WhatsApp o crear nuevas cotizaciones.'}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/bandeja"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Abrir WhatsApp</span>
            </Link>
            <Link
              href="/cotizador"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
            >
              <Sparkles className="h-4 w-4" />
              <span>Nueva cotización</span>
            </Link>
          </div>
        </div>
      )}

      {/* LISTA DE SEGUIMIENTOS */}
      {itemsAMostrar.length > 0 && (
        <div className="mt-4 space-y-3" data-testid="lista-seguimientos-items">
          {itemsAMostrar.map(({ item, esVencido }, idx) => {
            const retraso = calcularRetrasoSeguimiento(item.venceEn);
            const hora = formatearHoraSeguimiento(item.venceEn);
            const estaCompletando = completandoId === item.id;

            return (
              <div
                key={item.id}
                data-testid={`item-seguimiento-${item.id}`}
                className={`group tarjeta-turismo-hover flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${obtenerClaseEscalonada(idx)} ${
                  esVencido
                    ? 'border-rose-200 bg-rose-50/40 hover:border-rose-300 dark:border-rose-900/50 dark:bg-rose-950/20'
                    : 'dark:bg-neutral-850 border-neutral-200 bg-white hover:border-teal-500/40 dark:border-neutral-800 dark:hover:border-teal-500/30'
                }`}
              >
                <div className="flex flex-1 items-start gap-3">
                  {/* Botón de completar rápido */}
                  <button
                    type="button"
                    data-testid={`btn-completar-${item.id}`}
                    aria-label={`Marcar completado: ${item.descripcion}`}
                    disabled={estaCompletando}
                    onClick={() => void handleCompletar(item.id)}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all ${
                      estaCompletando
                        ? 'border-neutral-300 bg-neutral-100 text-neutral-400'
                        : esVencido
                          ? 'border-rose-300 bg-white text-rose-700 hover:border-rose-500 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'border-neutral-300 bg-white text-neutral-600 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}
                  >
                    {estaCompletando ? (
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Urgencia / Horario */}
                      {esVencido ? (
                        <span
                          data-testid="badge-seguimiento-vencido"
                          className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        >
                          <Clock className="h-3 w-3" />
                          {retraso}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                          <Calendar className="h-3 w-3" />
                          {hora || 'Hoy'}
                        </span>
                      )}

                      {/* Contacto */}
                      {item.contactoNombre && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                          <User className="h-3 w-3 text-neutral-400" />
                          {item.contactoNombre}
                        </span>
                      )}

                      {/* Oportunidad asociada */}
                      {item.oportunidadTitulo && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {item.oportunidadTitulo}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs font-medium text-neutral-900 dark:text-neutral-100">
                      {item.descripcion}
                    </p>
                  </div>
                </div>

                {/* Acciones directas (enlace a WhatsApp o Pipeline) */}
                <div className="flex items-center gap-2 pt-2 sm:pt-0">
                  {item.conversacionId && (
                    <Link
                      href={`/bandeja/${item.conversacionId}`}
                      data-testid={`enlace-chat-${item.id}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Chat</span>
                      <ExternalLink className="h-3 w-3 text-neutral-400" />
                    </Link>
                  )}

                  {item.oportunidadId && !item.conversacionId && (
                    <Link
                      href="/pipeline"
                      data-testid={`enlace-pipeline-${item.id}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    >
                      <span>Oportunidad</span>
                      <ExternalLink className="h-3 w-3 text-neutral-400" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pie con enlace a todos los seguimientos */}
      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {totalPendientes} compromisos en agenda
        </span>
        <Link
          href="/seguimientos"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline dark:text-teal-400"
        >
          <span>Ver todos los seguimientos</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
