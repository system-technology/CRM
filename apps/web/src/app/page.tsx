'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Kanban,
  Compass,
  ArrowRight,
  Clock,
  PlusCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  MapPin,
  ChevronRight,
  BarChart3,
  Building2,
} from 'lucide-react';
import { BarraModulos } from '../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../components/comun/distintivo-datos-demo';
import { BloqueSeguimientosDia } from '../components/inicio/bloque-seguimientos-dia';
import { obtenerSesionActualApi } from '../lib/auth-api';
import {
  obtenerResumenTrabajoDelDia,
  obtenerPendientesDelDiaApi,
  completarSeguimientoApi,
  type ResumenTrabajoDelDia,
} from '../lib/crm-api';
import { obtenerMensajeBienvenida } from '../lib/inicio-logica';
import type { PendientesDelDia, SesionActual } from '@viajapro/contracts';

export default function InicioPage() {
  const [sesion, setSesion] = useState<SesionActual | null>(null);
  const [resumen, setResumen] = useState<ResumenTrabajoDelDia | null>(null);
  const [pendientes, setPendientes] = useState<PendientesDelDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [sesionRes, resumenRes, pendientesRes] = await Promise.all([
        obtenerSesionActualApi().catch(() => null),
        obtenerResumenTrabajoDelDia(),
        obtenerPendientesDelDiaApi().catch(() => null),
      ]);
      setSesion(sesionRes);
      setResumen(resumenRes);
      setPendientes(pendientesRes);
    } catch {
      setError(
        'No pudimos conectar con los servicios de tu agencia. Comprueba tu conexión a internet e intenta nuevamente.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  const handleCompletarSeguimiento = async (id: string) => {
    await completarSeguimientoApi(id);
    setPendientes((actual) => {
      if (!actual) return null;
      return {
        ...actual,
        vencidos: actual.vencidos.filter((v) => v.id !== id),
        deHoy: actual.deHoy.filter((h) => h.id !== id),
      };
    });
  };

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const nombreUsuario = sesion?.identidad?.nombre ?? null;
  const agenciaActiva =
    sesion?.agencias?.find((a) => a.id === sesion.tenantActivoId)?.nombre ?? 'JD Tours Cartagena';

  const mensajeBienvenida = obtenerMensajeBienvenida(nombreUsuario);

  const iniciales = nombreUsuario
    ? nombreUsuario
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'VP';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* 1. Barra Lateral de Navegación y Módulos */}
      <BarraModulos />

      {/* 2. Cuerpo Principal */}
      <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-6">
        {/* Encabezado Principal */}
        <header className="border-b border-neutral-200 bg-white px-5 py-6 md:px-8 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-tr from-cyan-600 to-sky-700 text-base font-bold text-white shadow-sm ring-2 ring-amber-400"
                aria-hidden="true"
              >
                {iniciales}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl dark:text-neutral-50">
                    {mensajeBienvenida}
                  </h1>
                  <DistintivoDatosDemo visible={true} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="flex items-center gap-1 font-medium text-neutral-700 dark:text-neutral-300">
                    <Building2 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                    {agenciaActiva}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    Turno activo
                  </span>
                  <span>•</span>
                  <span>CRM Turismo WhatsApp</span>
                </div>
              </div>
            </div>

            {/* Accesos rápidos superiores para desktop */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/cotizador"
                data-testid="acceso-nueva-cotizacion"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-linear-to-r from-cyan-600 to-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-cyan-700 hover:to-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
              >
                <PlusCircle className="h-4 w-4" />
                <span>+ Nueva cotización</span>
              </Link>
              <Link
                href="/bandeja"
                data-testid="acceso-abrir-bandeja"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 shadow-xs transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700/60"
              >
                <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Bandeja WhatsApp</span>
                {resumen && resumen.conversacionesPendientes > 0 && (
                  <span className="ml-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {resumen.conversacionesPendientes}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </header>

        {/* Contenido Central */}
        <div className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8">
          {/* ESTADO 1: ERROR */}
          {error && (
            <div
              data-testid="inicio-error"
              className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/40"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                <div className="flex-1 text-sm text-rose-900 dark:text-rose-200">
                  <p className="font-semibold">Fallo al conectar con la agencia</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-rose-800 dark:text-rose-300">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => void cargarDatos()}
                    data-testid="boton-reintentar"
                    className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reintentar conexión</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ESTADO 2: CARGANDO (Esqueleto) */}
          {cargando && (
            <div data-testid="inicio-cargando" className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-36 animate-pulse rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                      <div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
                    </div>
                    <div className="mt-4 h-8 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="mt-2 h-3 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                ))}
              </div>
              <BloqueSeguimientosDia pendientes={null} cargando={true} />
            </div>
          )}

          {/* ESTADO 3: CON DATOS O VACÍO */}
          {!cargando && !error && resumen && (
            <div className="space-y-8">
              {/* Notificación si la cuenta está completamente vacía (onboarding para agencias nuevas) */}
              {resumen.estaVacio &&
                (!pendientes ||
                  (pendientes.vencidos.length === 0 && pendientes.deHoy.length === 0)) && (
                  <div
                    data-testid="inicio-vacio"
                    className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/40 dark:bg-amber-950/20"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-700 ring-2 ring-amber-400 dark:text-amber-300">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                            ¡Te damos la bienvenida a tu CRM de turismo!
                          </h2>
                          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                            Aún no tienes actividad registrada para hoy. Comienza cotizando para un
                            cliente o explorando las excursiones disponibles.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href="/bienvenida"
                          data-testid="enlace-asistente-bienvenida-inicio"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-xs hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        >
                          <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <span>Asistente de 4 pasos (T-105)</span>
                        </Link>
                        <Link
                          href="/cotizador"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-neutral-900 shadow-xs hover:bg-amber-400"
                        >
                          <PlusCircle className="h-4 w-4" />
                          <span>Crear primera cotización</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

              {/* BLOQUE DE 4 TARJETAS CON PALETA CARIBEÑA DE VIAJAPRO */}
              <section aria-labelledby="seccion-trabajo-dia">
                <div className="mb-4 flex items-center justify-between">
                  <h2
                    id="seccion-trabajo-dia"
                    className="text-base font-bold text-neutral-900 dark:text-neutral-100"
                  >
                    Trabajo del día y métricas activas
                  </h2>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Actualizado en tiempo real
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* TARJETA 1: Turquesa Caribeño (#06B6D4) - Conversaciones pendientes */}
                  <Link
                    href="/bandeja"
                    data-testid="tarjeta-conversaciones-pendientes"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-cyan-200/90 bg-linear-to-b from-cyan-50/70 to-white p-5 shadow-xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none dark:border-cyan-900/50 dark:from-cyan-950/30 dark:to-neutral-900"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600/10 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                          <MessageSquare className="h-5 w-5" />
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-cyan-700 group-hover:underline dark:text-cyan-400">
                          Ver chats <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                      <h3 className="mt-3 text-xs font-semibold tracking-wider text-neutral-600 uppercase dark:text-neutral-400">
                        Conversaciones pendientes
                      </h3>
                      <p className="cifra mt-1 text-2xl font-black text-cyan-950 dark:text-cyan-100">
                        {resumen.conversacionesPendientes}
                      </p>
                    </div>
                    <div className="mt-3 border-t border-cyan-100 pt-2.5 dark:border-cyan-900/40">
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        <strong className="font-semibold text-cyan-800 dark:text-cyan-300">
                          {resumen.conversacionesSinAsignar}
                        </strong>{' '}
                        sin asignar · Ventana 24h WhatsApp activa
                      </p>
                    </div>
                  </Link>

                  {/* TARJETA 2: Océano Profundo (#0284C7) - Oportunidades por etapa */}
                  <Link
                    href="/pipeline"
                    data-testid="tarjeta-oportunidades-etapa"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-sky-200/90 bg-linear-to-b from-sky-50/70 to-white p-5 shadow-xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none dark:border-sky-900/50 dark:from-sky-950/30 dark:to-neutral-900"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                          <Kanban className="h-5 w-5" />
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-sky-700 group-hover:underline dark:text-sky-400">
                          Ir a pipeline <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                      <h3 className="mt-3 text-xs font-semibold tracking-wider text-neutral-600 uppercase dark:text-neutral-400">
                        Oportunidades en Pipeline
                      </h3>
                      <p className="cifra mt-1 text-2xl font-black text-sky-950 dark:text-sky-100">
                        {resumen.oportunidadesActivas}
                      </p>
                    </div>
                    <div className="mt-3 border-t border-sky-100 pt-2.5 dark:border-sky-900/40">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-300">
                          {resumen.oportunidadesPorEtapa.nuevoLead} leads
                        </span>
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-300">
                          {resumen.oportunidadesPorEtapa.enCotizacion} cotiz.
                        </span>
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-300">
                          {resumen.oportunidadesPorEtapa.enNegociacion} negoc.
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* TARJETA 3: Coral Cálido (#FB7185) - Cotizaciones por vencer */}
                  <Link
                    href="/cotizaciones"
                    data-testid="tarjeta-cotizaciones-vencer"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-rose-200/90 bg-linear-to-b from-rose-50/70 to-white p-5 shadow-xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-rose-400 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none dark:border-rose-900/50 dark:from-rose-950/30 dark:to-neutral-900"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                          <Clock className="h-5 w-5" />
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-700 group-hover:underline dark:text-rose-400">
                          Revisar <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                      <h3 className="mt-3 text-xs font-semibold tracking-wider text-neutral-600 uppercase dark:text-neutral-400">
                        Cotizaciones por vencer
                      </h3>
                      <p className="cifra mt-1 text-2xl font-black text-rose-950 dark:text-rose-100">
                        {resumen.cotizacionesPorVencer}
                      </p>
                    </div>
                    <div className="mt-3 border-t border-rose-100 pt-2.5 dark:border-rose-900/40">
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        Seguimiento requerido y bloqueo de cupos
                      </p>
                    </div>
                  </Link>

                  {/* TARJETA 4: Atardecer Tropical (#F97316) con Aro Dorado (#C9A24B) */}
                  <Link
                    href="/catalogo"
                    data-testid="tarjeta-catalogo-turismo"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-amber-200/90 bg-linear-to-b from-amber-50/70 to-white p-5 shadow-xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none dark:border-amber-900/50 dark:from-amber-950/30 dark:to-neutral-900"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-800 ring-2 ring-amber-400 dark:bg-amber-400/20 dark:text-amber-300">
                          <Compass className="h-5 w-5" />
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-800 group-hover:underline dark:text-amber-400">
                          Ver catálogo <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                      <h3 className="mt-3 text-xs font-semibold tracking-wider text-neutral-600 uppercase dark:text-neutral-400">
                        Catálogo de excursiones
                      </h3>
                      <p className="mt-1 text-xl font-black text-amber-950 dark:text-amber-100">
                        Pasadías & Tours
                      </p>
                    </div>
                    <div className="mt-3 border-t border-amber-100 pt-2.5 dark:border-amber-900/40">
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        Salidas programadas y tarifas en pesos COP
                      </p>
                    </div>
                  </Link>
                </div>
              </section>

              {/* SECCIÓN 2: SEGUIMIENTOS PENDIENTES DEL DÍA (T-020) */}
              <BloqueSeguimientosDia
                pendientes={pendientes}
                cargando={false}
                alCompletarSeguimiento={handleCompletarSeguimiento}
              />

              {/* SECCIÓN 3: ACCESOS RÁPIDOS OPERACIONALES */}
              <section aria-labelledby="seccion-accesos-rapidos">
                <h2
                  id="seccion-accesos-rapidos"
                  className="mb-4 text-base font-bold text-neutral-900 dark:text-neutral-100"
                >
                  Accesos rápidos operacionales
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <Link
                    href="/cotizador"
                    className="flex min-h-[52px] items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs transition hover:border-cyan-400 hover:bg-cyan-50/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                        <PlusCircle className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          Cotizador
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Calcular y propuesta
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  </Link>

                  <Link
                    href="/bandeja"
                    className="flex min-h-[52px] items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs transition hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          Bandeja
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Chats de WhatsApp
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  </Link>

                  <Link
                    href="/catalogo"
                    data-testid="acceso-ver-catalogo"
                    className="flex min-h-[52px] items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs transition hover:border-amber-400 hover:bg-amber-50/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-amber-700 dark:hover:bg-amber-950/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800 ring-1 ring-amber-400 dark:bg-amber-950 dark:text-amber-300">
                        <Compass className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          Catálogo
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Excursiones y salidas
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  </Link>

                  <Link
                    href="/pipeline"
                    data-testid="acceso-ver-pipeline"
                    className="flex min-h-[52px] items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs transition hover:border-sky-400 hover:bg-sky-50/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-sky-700 dark:hover:bg-sky-950/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                        <Kanban className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          Pipeline
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Tablero comercial
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  </Link>
                </div>
              </section>

              {/* SECCIÓN 3: DESTINOS DE VIAJE POPULARES & REPORTES */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Destinos destacados para cotización directa */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      <MapPin className="h-4 w-4 text-rose-500" />
                      Destinos populares para cotizar
                    </h3>
                    <Link
                      href="/catalogo"
                      className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                    >
                      Ver todos
                    </Link>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    {[
                      {
                        nombre: 'Islas del Rosario & Barú',
                        tipo: 'Pasadía nàutico',
                        tag: 'Top ventas',
                      },
                      {
                        nombre: 'San Andrés & Providencia',
                        tipo: 'Paquete de playa',
                        tag: 'Promo',
                      },
                      { nombre: 'Santa Marta & Tayrona', tipo: 'Ecoturismo', tag: 'Disponible' },
                      { nombre: 'Eje Cafetero', tipo: 'Cultura & Hacienda', tag: 'Familiar' },
                    ].map((dest) => (
                      <Link
                        key={dest.nombre}
                        href={`/cotizador?destino=${encodeURIComponent(dest.nombre)}`}
                        className="group flex flex-col justify-between rounded-lg border border-neutral-200/80 bg-neutral-50/60 p-3 transition hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-neutral-800 dark:bg-neutral-800/40 dark:hover:border-cyan-700"
                      >
                        <p className="text-xs font-semibold text-neutral-800 group-hover:text-cyan-800 dark:text-neutral-200 dark:group-hover:text-cyan-300">
                          {dest.nombre}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-[10px]">
                          <span className="text-neutral-500 dark:text-neutral-400">
                            {dest.tipo}
                          </span>
                          <span className="rounded bg-white px-1.5 py-0.5 font-medium text-cyan-800 shadow-2xs dark:bg-neutral-700 dark:text-cyan-300">
                            {dest.tag}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Enlace directo a rendimiento y métricas */}
                <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        <BarChart3 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        Rendimiento comercial y cierres
                      </h3>
                      <Link
                        href="/reportes"
                        className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                      >
                        Informe completo
                      </Link>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                      Revisa el embudo de conversión, las ventas ganadas del mes en pesos COP y la
                      tasa de respuesta del equipo en WhatsApp.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        Cálculos reales sin datos simulados (R8)
                      </span>
                    </div>
                    <Link
                      href="/reportes"
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    >
                      <span>Abrir reportes</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
