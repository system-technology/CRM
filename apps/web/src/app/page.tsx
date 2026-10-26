'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Kanban,
  FileText,
  ArrowRight,
  RefreshCw,
  Clock,
  CheckCircle2,
  PlusCircle,
  Compass,
  AlertCircle,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { BarraModulos } from '../components/bandeja/barra-modulos';
import { consultarResumenInicioAsesor, type ResumenInicioAsesor } from '../lib/crm-api';
import { formatearCOP, formatearFecha, formatearTelefono } from '../lib/formato';

export default function InicioPage() {
  const [resumen, setResumen] = useState<ResumenInicioAsesor | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      const datos = await consultarResumenInicioAsesor();
      setResumen(datos);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar el resumen operativo del asesor.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Barra de navegación superior unificada */}
      <BarraModulos />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Encabezado Principal y Acciones Rápidas */}
        <header className="mb-8 flex flex-col gap-4 border-b border-neutral-200 pb-6 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/60 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:border-teal-800/60 dark:bg-teal-950/60 dark:text-teal-300">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Operación en Vivo · Colombia
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
              Resumen Operativo del Asesor
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Prioridades comerciales, atención inmediata en WhatsApp y cotizaciones por vencer.
            </p>
          </div>

          {/* Acciones Rápidas (Accesibles y táctiles a 375 px) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/cotizador"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:outline-none dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              Nueva Cotización
            </Link>
            <Link
              href="/catalogo"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              Catálogo
            </Link>
          </div>
        </header>

        {/* Estado: Cargando (Skeletons) */}
        {cargando && (
          <div
            data-testid="inicio-cargando"
            className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label="Cargando resumen del asesor"
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="h-5 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-7 w-12 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                </div>
                <div className="mt-4 space-y-3">
                  <div className="h-4 w-full rounded bg-neutral-100 dark:bg-neutral-800/60" />
                  <div className="h-4 w-5/6 rounded bg-neutral-100 dark:bg-neutral-800/60" />
                  <div className="h-4 w-4/6 rounded bg-neutral-100 dark:bg-neutral-800/60" />
                </div>
                <div className="mt-8 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <div className="h-8 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Estado: Error Accionable con Reintento */}
        {!cargando && error && (
          <div
            data-testid="inicio-error"
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="flex-1">
                <h2 className="text-base font-semibold">Error al conectar con los servicios</h2>
                <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
                <button
                  type="button"
                  data-testid="boton-reintentar"
                  onClick={() => void cargarDatos()}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:outline-none dark:bg-rose-700 dark:hover:bg-rose-600"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Reintentar sincronización
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Estado: Datos Reales Renderizados */}
        {!cargando && !error && resumen && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* TARJETA 1: Conversaciones WhatsApp Pendientes */}
              <section
                data-testid="tarjeta-conversaciones"
                className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <MessageSquare className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        WhatsApp Pendientes
                      </h2>
                    </div>
                    <span
                      data-testid="badge-pendientes-total"
                      className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      {resumen.conversaciones.totalPendientes} pendientes
                    </span>
                  </div>

                  {/* Desglose de contadores */}
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      Sin responder: {resumen.conversaciones.sinResponder}
                    </span>
                    <span className="rounded bg-amber-50 px-2 py-1 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Ventana 24h: {resumen.conversaciones.ventanaCritica}
                    </span>
                    <span className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      Sin asignar: {resumen.conversaciones.sinAsignar}
                    </span>
                  </div>

                  {/* Lista previa o Estado Vacío */}
                  <div className="mt-5">
                    {resumen.conversaciones.itemsUrgentes.length === 0 ? (
                      <div
                        data-testid="tarjeta-vacia"
                        className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
                      >
                        <CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        ¡Al día! No tienes mensajes pendientes de respuesta.
                      </div>
                    ) : (
                      <ul className="space-y-2.5" aria-label="Conversaciones urgentes">
                        {resumen.conversaciones.itemsUrgentes.map((item) => (
                          <li
                            key={item.id}
                            data-testid="item-conversacion-urgente"
                            className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-xs dark:border-neutral-800/80 dark:bg-neutral-800/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
                                {item.contactoNombre}
                              </span>
                              {item.esUrgente && (
                                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Prioridad
                                </span>
                              )}
                            </div>
                            <p className="mt-1 truncate text-neutral-600 dark:text-neutral-400">
                              {item.ultimoMensaje}
                            </p>
                            {item.contactoTelefono && (
                              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-500">
                                {formatearTelefono(item.contactoTelefono)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="mt-6 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <Link
                    href="/bandeja?filtro=sin-responder"
                    data-testid="enlace-bandeja-filtrada"
                    className="group inline-flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  >
                    <span>Atender bandeja de mensajes</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </Link>
                </div>
              </section>

              {/* TARJETA 2: Oportunidades por Etapa (Pipeline Comercial) */}
              <section
                data-testid="tarjeta-pipeline"
                className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        <Kanban className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        Pipeline Comercial
                      </h2>
                    </div>
                    <span
                      data-testid="badge-oportunidades-total"
                      className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      {resumen.pipeline.totalOportunidades} tratos
                    </span>
                  </div>

                  {/* Métrica de Valor Total en COP */}
                  <div className="mt-4 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      Valor total activo en embudo
                    </span>
                    <p
                      data-testid="valor-total-pipeline"
                      className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50"
                    >
                      {formatearCOP(resumen.pipeline.valorTotalCop)}
                    </p>
                  </div>

                  {/* Distribución por Etapas */}
                  <div className="mt-4 space-y-2">
                    {resumen.pipeline.totalOportunidades === 0 ? (
                      <div
                        data-testid="tarjeta-vacia"
                        className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
                      >
                        <TrendingUp className="mx-auto mb-1 h-6 w-6 text-neutral-400" />
                        No hay oportunidades activas en este momento.
                      </div>
                    ) : (
                      resumen.pipeline.etapas.map((etapa) => (
                        <div
                          key={etapa.id}
                          className="flex items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: etapa.color }}
                            />
                            <span className="truncate font-medium text-neutral-700 dark:text-neutral-300">
                              {etapa.nombre}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {etapa.cantidad}
                            </span>
                            <span className="text-neutral-500 dark:text-neutral-400">
                              {formatearCOP(etapa.valorCop)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-6 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <Link
                    href="/pipeline"
                    data-testid="enlace-pipeline-filtrado"
                    className="group inline-flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                  >
                    <span>Ver tablero Kanban completo</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </Link>
                </div>
              </section>

              {/* TARJETA 3: Cotizaciones por Vencer */}
              <section
                data-testid="tarjeta-cotizaciones"
                className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        Cotizaciones por Vencer
                      </h2>
                    </div>
                    <span
                      data-testid="badge-cotizaciones-total"
                      className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    >
                      {resumen.cotizaciones.totalPorVencer} en curso
                    </span>
                  </div>

                  {/* Desglose de estado */}
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      Enviadas: {resumen.cotizaciones.enviadas}
                    </span>
                    <span className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      Borradores: {resumen.cotizaciones.borradores}
                    </span>
                  </div>

                  {/* Lista previa o Estado Vacío */}
                  <div className="mt-5">
                    {resumen.cotizaciones.proximas.length === 0 ? (
                      <div
                        data-testid="tarjeta-vacia"
                        className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
                      >
                        <Clock className="mx-auto mb-1 h-6 w-6 text-amber-500 dark:text-amber-400" />
                        Sin cotizaciones próximas a vencer.
                      </div>
                    ) : (
                      <ul className="space-y-2.5" aria-label="Cotizaciones prioritarias">
                        {resumen.cotizaciones.proximas.map((cot) => (
                          <li
                            key={cot.id}
                            data-testid="item-cotizacion-urgente"
                            className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-xs dark:border-neutral-800/80 dark:bg-neutral-800/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
                                {cot.titulo || cot.paqueteNombre}
                              </span>
                              {cot.esCritica && (
                                <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                  Vence pronto
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                              <span>Salida: {formatearFecha(cot.fechaSalida)}</span>
                              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                                {formatearCOP(cot.totalCop)}
                              </span>
                            </div>
                            {cot.vigenteHasta && (
                              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                Vigente hasta: {formatearFecha(cot.vigenteHasta)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="mt-6 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <Link
                    href="/cotizaciones?estado=ENVIADA"
                    data-testid="enlace-cotizaciones-filtrada"
                    className="group inline-flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                  >
                    <span>Revisar cotizaciones enviadas</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </Link>
                </div>
              </section>
            </div>

            {/* Directorio de Accesos Rápidos Complementarios */}
            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="mb-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Accesos y Herramientas del CRM
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                  href="/bandeja"
                  className="rounded-lg border border-neutral-100 p-4 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60"
                >
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    Bandeja Multicanal
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Atención de chats de WhatsApp con ventana de 24h y reasignación de asesores.
                  </p>
                </Link>
                <Link
                  href="/cotizador"
                  className="rounded-lg border border-neutral-100 p-4 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60"
                >
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    Cotizador de Paquetes
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Cálculo en vivo de acomodación, margen comercial e itinerarios.
                  </p>
                </Link>
                <Link
                  href="/catalogo"
                  className="rounded-lg border border-neutral-100 p-4 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60"
                >
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    Catálogo de Excursiones
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Tarjetas con precios desde, cupos en vivo y ficha técnica exportable a WhatsApp.
                  </p>
                </Link>
                <Link
                  href="/contactos"
                  className="rounded-lg border border-neutral-100 p-4 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60"
                >
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    Directorio de Clientes
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Gestión de viajeros con protección PII y ciclo de vida de pasajeros.
                  </p>
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
