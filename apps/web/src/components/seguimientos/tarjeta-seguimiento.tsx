'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Kanban,
  Loader2,
  MessageSquare,
  User,
} from 'lucide-react';
import type { Seguimiento } from '@viajapro/contracts';
import { formatearDetalleVencimiento } from '../../lib/seguimientos-logica';

export interface TarjetaSeguimientoProps {
  seguimiento: Seguimiento;
  alCompletar?: (id: string) => Promise<void>;
  completando?: boolean;
}

export function TarjetaSeguimiento({
  seguimiento,
  alCompletar,
  completando = false,
}: TarjetaSeguimientoProps) {
  const detalle = formatearDetalleVencimiento(seguimiento.venceEn, seguimiento.completadoEn);

  const esCompletado = seguimiento.completadoEn !== null;

  return (
    <div
      data-testid={`tarjeta-seguimiento-${seguimiento.id}`}
      data-estado={detalle.etiqueta.toLowerCase()}
      className={`group relative flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all duration-200 sm:flex-row sm:items-center ${
        esCompletado
          ? 'border-neutral-200 bg-neutral-50/70 opacity-80 dark:border-neutral-800 dark:bg-neutral-900/50'
          : detalle.esVencido
            ? 'border-rose-300 bg-rose-50/30 shadow-2xs hover:border-rose-400 dark:border-rose-900/50 dark:bg-rose-950/20'
            : detalle.esUrgente
              ? 'border-amber-300 bg-amber-50/30 shadow-2xs hover:border-amber-400 dark:border-amber-900/50 dark:bg-amber-950/20'
              : 'border-neutral-200 bg-white shadow-2xs hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
      }`}
    >
      {/* Sección Izquierda: Botón de completar + Contenido principal */}
      <div className="flex flex-1 items-start gap-3.5">
        {/* Botón de acción para marcar completado */}
        <div className="shrink-0 pt-0.5">
          {esCompletado ? (
            <div
              title="Tarea completada"
              aria-label="Tarea completada"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
            >
              <Check className="h-5 w-5 stroke-[2.5]" />
            </div>
          ) : (
            <button
              type="button"
              disabled={completando}
              onClick={() => {
                if (alCompletar) {
                  void alCompletar(seguimiento.id);
                }
              }}
              title="Marcar como completado"
              aria-label={`Completar tarea: ${seguimiento.descripcion}`}
              className="hover:border-acento-500 hover:bg-acento-50 hover:text-acento-700 focus-visible:ring-acento-600 dark:hover:border-acento-400 dark:hover:bg-acento-950/40 dark:hover:text-acento-300 flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 bg-white text-neutral-400 transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500"
            >
              {completando ? (
                <Loader2 className="text-acento-600 dark:text-acento-400 h-5 w-5 animate-spin" />
              ) : (
                <Check className="h-5 w-5 transition group-hover:scale-110" />
              )}
            </button>
          )}
        </div>

        {/* Textos descriptivos */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Insignia de vencimiento */}
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${detalle.badgeClase}`}
            >
              {detalle.esVencido && <AlertTriangle className="h-3 w-3 shrink-0" />}
              {!detalle.esVencido && !esCompletado && detalle.esUrgente && (
                <Clock className="h-3 w-3 shrink-0" />
              )}
              {!detalle.esVencido && !esCompletado && !detalle.esUrgente && (
                <Calendar className="h-3 w-3 shrink-0" />
              )}
              <span>{detalle.etiqueta}</span>
            </span>

            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              {detalle.retrasoTexto}
            </span>
          </div>

          <h3
            className={`text-sm font-semibold ${
              esCompletado
                ? 'text-neutral-500 line-through dark:text-neutral-400'
                : 'text-neutral-900 dark:text-neutral-100'
            }`}
          >
            {seguimiento.descripcion}
          </h3>

          {/* Enlaces y referencias contextuales */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-neutral-600 dark:text-neutral-400">
            {/* Contacto vinculado */}
            <Link
              href={`/contactos/${seguimiento.contactoId}`}
              title="Ver ficha 360 del contacto"
              className="text-acento-700 hover:text-acento-800 dark:text-acento-400 dark:hover:text-acento-300 inline-flex min-h-[32px] items-center gap-1 font-medium hover:underline"
            >
              <User className="h-3.5 w-3.5" />
              <span>{seguimiento.contactoNombre ?? 'Contacto'}</span>
            </Link>

            {/* Oportunidad si existe */}
            {seguimiento.oportunidadId && (
              <Link
                href="/pipeline"
                title="Ver oportunidad en Pipeline"
                className="text-acento-700 hover:text-acento-800 dark:text-acento-400 dark:hover:text-acento-300 inline-flex min-h-[32px] items-center gap-1 font-medium hover:underline"
              >
                <Kanban className="h-3.5 w-3.5" />
                <span>{seguimiento.oportunidadTitulo ?? 'Oportunidad'}</span>
              </Link>
            )}

            {/* Chat de WhatsApp si existe */}
            {seguimiento.conversacionId && (
              <Link
                href={`/bandeja/${seguimiento.conversacionId}`}
                title="Abrir chat en bandeja"
                className="inline-flex min-h-[32px] items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Chat WhatsApp</span>
              </Link>
            )}

            {/* Asesor */}
            {seguimiento.asesorNombre && (
              <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                <span>·</span>
                <span>Asignado a: {seguimiento.asesorNombre}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sección Derecha: Acciones directas a 375 px */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 pt-2 sm:border-t-0 sm:pt-0 dark:border-neutral-800">
        {!esCompletado && (
          <button
            type="button"
            disabled={completando}
            onClick={() => {
              if (alCompletar) {
                void alCompletar(seguimiento.id);
              }
            }}
            className="border-acento-200 bg-acento-50 text-acento-700 hover:bg-acento-100 focus-visible:ring-acento-600 dark:border-acento-900/50 dark:bg-acento-950/40 dark:text-acento-300 dark:hover:bg-acento-900/50 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-2xs transition focus-visible:ring-2 focus-visible:outline-none"
          >
            {completando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>Completar</span>
          </button>
        )}

        <Link
          href={`/contactos/${seguimiento.contactoId}`}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          title="Ver Ficha 360"
        >
          <span>Ficha 360</span>
          <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
        </Link>
      </div>
    </div>
  );
}
