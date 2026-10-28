'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Send,
  MessageSquare,
  Kanban,
  CheckCircle2,
  Building2,
  Compass,
  Users,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import type { ProgresoOnboarding } from '../../lib/onboarding-logica';

export interface ResumenOnboardingCompletadoProps {
  progreso: ProgresoOnboarding;
  alReiniciar: () => void;
}

export function ResumenOnboardingCompletado({
  progreso,
  alReiniciar,
}: ResumenOnboardingCompletadoProps) {
  const { marca, catalogo, equipo, whatsapp } = progreso;

  return (
    <div
      data-testid="resumen-onboarding-completado"
      className="space-y-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Banner de Celebración */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-700 p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Configuración Inicial Completa
          </span>

          <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
            ¡Felicitaciones! {marca.nombreComercial} está lista para vender
          </h2>

          <p className="mt-2 max-w-xl text-xs leading-relaxed text-emerald-50 sm:text-sm">
            Tu agencia ha completado el asistente de inicio. Tienes tu identidad visual de marca,
            catálogo de excursiones, equipo y canal de WhatsApp configurados.
          </p>

          {/* Botón Principal Destacado (Criterio de aceptación 1) */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/cotizador"
              data-testid="btn-crear-primera-cotizacion"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-xs font-extrabold text-neutral-900 shadow-lg transition-all hover:bg-neutral-100 active:scale-98"
            >
              <Send className="h-4 w-4 text-emerald-600" />
              <span>Crear y Enviar Mi Primera Cotización</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/bandeja"
              data-testid="btn-ir-a-bandeja"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white/15 px-5 py-3 text-xs font-bold text-white backdrop-blur-xs transition-all hover:bg-white/25 active:scale-98"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Ir a la Bandeja de WhatsApp</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Resumen de los 4 Pilares Configurados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pilar 1: Marca */}
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <Building2 className="h-4 w-4" />
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
            1. Marca & Identidad
          </h4>
          <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
            {marca.nombreComercial} · NIT {marca.nit}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-xs"
              style={{ backgroundColor: marca.colorAcento }}
            />
            <span className="font-mono text-[10px] text-neutral-500 uppercase">
              {marca.colorAcento}
            </span>
          </div>
        </div>

        {/* Pilar 2: Catálogo */}
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              <Compass className="h-4 w-4" />
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
            2. Catálogo Turístico
          </h4>
          <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
            {catalogo.totalExcursiones} excursiones listas para cotizar
          </p>
          <span className="mt-2.5 inline-block rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
            Moneda: COP (Pesos)
          </span>
        </div>

        {/* Pilar 3: Equipo */}
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              <Users className="h-4 w-4" />
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
            3. Equipo de Trabajo
          </h4>
          <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
            {equipo.miembrosInvitados.length > 0
              ? `${equipo.miembrosInvitados.length} miembros invitados`
              : 'Administrador principal activo'}
          </p>
          <span className="mt-2.5 inline-block rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            Roles asignados
          </span>
        </div>

        {/* Pilar 4: WhatsApp */}
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <MessageSquare className="h-4 w-4" />
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
            4. Canal WhatsApp
          </h4>
          <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
            {whatsapp.modo === 'meta_cloud_oficial'
              ? 'WABA Oficial Meta Conectada'
              : 'Modo Simulador Activo'}
          </p>
          <span className="mt-2.5 inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Seguridad R6 Cero Secretos
          </span>
        </div>
      </div>

      {/* Accesos Rápidos Adicionales */}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-neutral-100 pt-6 sm:flex-row dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pipeline"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <Kanban className="h-4 w-4" />
            <span>Ver Pipeline Kanban</span>
          </Link>

          <Link
            href="/configuracion"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <span>Configuración de Agencia</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={alReiniciar}
          data-testid="btn-reiniciar-onboarding"
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Volver a iniciar el asistente</span>
        </button>
      </div>
    </div>
  );
}
