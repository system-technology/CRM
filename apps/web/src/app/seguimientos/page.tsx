'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { Seguimiento, CrearSeguimiento } from '@viajapro/contracts';
import {
  listarSeguimientosApi,
  completarSeguimientoApi,
  crearSeguimientoApi,
} from '../../lib/crm-api';
import {
  construirMensajeErrorAccionable,
  type MensajeErrorDetallado,
} from '../../lib/estados-ui-logica';
import { AvisoVacio, AvisoErrorAccionable } from '../../components/comun/esqueletos';
import { TarjetaSeguimiento } from '../../components/seguimientos/tarjeta-seguimiento';
import { ModalCrearSeguimiento } from '../../components/contactos/modal-crear-seguimiento';
import {
  calcularMetricasSeguimientos,
  filtrarYOrdenarSeguimientos,
  type TipoCategoriaSeguimiento,
} from '../../lib/seguimientos-logica';

export default function SeguimientosPage() {
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<MensajeErrorDetallado | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState<TipoCategoriaSeguimiento>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [asesorSeleccionado, setAsesorSeleccionado] = useState('todos');
  const [completandoId, setCompletandoId] = useState<string | null>(null);
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
  const [recargando, setRecargando] = useState(false);

  const cargarSeguimientos = useCallback(async () => {
    try {
      setError(null);
      const res = await listarSeguimientosApi({ estado: 'TODOS' });
      setSeguimientos(res.datos);
    } catch (err) {
      setError(construirMensajeErrorAccionable(err, 'CONTACTOS_LISTA'));
    } finally {
      setCargando(false);
      setRecargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarSeguimientos();
  }, [cargarSeguimientos]);

  const handleRecargar = () => {
    setRecargando(true);
    void cargarSeguimientos();
  };

  const handleCompletar = async (id: string) => {
    if (completandoId) return;
    setCompletandoId(id);

    // Actualización optimista inmediata
    const ahoraIso = new Date().toISOString();
    setSeguimientos((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completadoEn: ahoraIso } : s)),
    );

    try {
      const actualizado = await completarSeguimientoApi(id);
      setSeguimientos((prev) => prev.map((s) => (s.id === id ? actualizado : s)));
    } catch (_err) {
      // Reversión si la API falla
      await cargarSeguimientos();
    } finally {
      setCompletandoId(null);
    }
  };

  const handleCrearSeguimiento = async (cuerpo: CrearSeguimiento) => {
    const nuevo = await crearSeguimientoApi(cuerpo);
    setSeguimientos((prev) => [nuevo, ...prev]);
    setModalCrearAbierto(false);
    return nuevo;
  };

  // Métricas en tiempo real
  const metricas = useMemo(() => {
    return calcularMetricasSeguimientos(seguimientos);
  }, [seguimientos]);

  // Lista de asesores únicos para el selector
  const asesoresDisponibles = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const s of seguimientos) {
      if (s.asesorId && s.asesorNombre) {
        mapa.set(s.asesorId, s.asesorNombre);
      }
    }
    return Array.from(mapa.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [seguimientos]);

  // Seguimientos filtrados según criterios
  const seguimientosFiltrados = useMemo(() => {
    return filtrarYOrdenarSeguimientos({
      seguimientos,
      categoria: categoriaActiva,
      busqueda,
      asesorId: asesorSeleccionado,
    });
  }, [seguimientos, categoriaActiva, busqueda, asesorSeleccionado]);

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Cabecera / Hero */}
      <header className="flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <Link href="/" className="hover:text-teal-600 hover:underline">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/contactos" className="hover:text-teal-600 hover:underline">
              CRM
            </Link>
            <span>/</span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Seguimientos
            </span>
          </nav>
          <div className="mt-1 flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl dark:text-white">
              Seguimientos del Asesor
            </h1>
            {metricas.vencidos > 0 && (
              <span
                data-testid="badge-alerta-vencidos"
                className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/70 dark:text-rose-300"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  {metricas.vencidos} {metricas.vencidos === 1 ? 'vencido' : 'vencidos'}
                </span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-600 sm:text-sm dark:text-neutral-400">
            Compromisos con clientes, cotizaciones por cerrar y tareas pactadas en WhatsApp.
          </p>
        </div>

        {/* Acciones principales */}
        <div className="flex flex-wrap items-center gap-2 sm:self-end">
          <button
            type="button"
            onClick={handleRecargar}
            disabled={recargando || cargando}
            title="Recargar seguimientos"
            aria-label="Recargar lista de seguimientos"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white p-2.5 text-neutral-700 shadow-2xs hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <RefreshCw
              className={`h-4 w-4 ${recargando || cargando ? 'animate-spin text-teal-600' : ''}`}
            />
          </button>

          <button
            type="button"
            data-testid="boton-agendar-seguimiento"
            onClick={() => setModalCrearAbierto(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none sm:text-sm"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Agendar Seguimiento</span>
          </button>
        </div>
      </header>

      {/* Tarjetas KPI de Resumen */}
      <section
        aria-label="Resumen de compromisos"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4"
      >
        {/* Vencidos */}
        <button
          type="button"
          data-testid="kpi-vencidos"
          onClick={() => setCategoriaActiva('VENCIDOS')}
          className={`flex min-h-[44px] flex-col rounded-2xl border p-4 text-left transition hover:shadow-xs focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none ${
            categoriaActiva === 'VENCIDOS'
              ? 'border-rose-400 bg-rose-50/70 ring-2 ring-rose-500/30 dark:border-rose-800 dark:bg-rose-950/40'
              : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
              Vencidos
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <span className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-400">
            {metricas.vencidos}
          </span>
          <span className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            Requieren atención inmediata
          </span>
        </button>

        {/* De Hoy */}
        <button
          type="button"
          data-testid="kpi-hoy"
          onClick={() => setCategoriaActiva('HOY')}
          className={`flex min-h-[44px] flex-col rounded-2xl border p-4 text-left transition hover:shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${
            categoriaActiva === 'HOY'
              ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-500/30 dark:border-amber-800 dark:bg-amber-950/40'
              : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
              Para Hoy
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <span className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-400">
            {metricas.deHoy}
          </span>
          <span className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            Programados para el día
          </span>
        </button>

        {/* Próximos */}
        <button
          type="button"
          data-testid="kpi-proximos"
          onClick={() => setCategoriaActiva('PROXIMOS')}
          className={`flex min-h-[44px] flex-col rounded-2xl border p-4 text-left transition hover:shadow-xs focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none ${
            categoriaActiva === 'PROXIMOS'
              ? 'border-teal-400 bg-teal-50/70 ring-2 ring-teal-500/30 dark:border-teal-800 dark:bg-teal-950/40'
              : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
              Próximos
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <span className="mt-2 text-2xl font-black text-teal-700 dark:text-teal-400">
            {metricas.proximos}
          </span>
          <span className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            En los próximos días
          </span>
        </button>

        {/* Completados */}
        <button
          type="button"
          data-testid="kpi-completados"
          onClick={() => setCategoriaActiva('COMPLETADOS')}
          className={`flex min-h-[44px] flex-col rounded-2xl border p-4 text-left transition hover:shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${
            categoriaActiva === 'COMPLETADOS'
              ? 'border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-500/30 dark:border-emerald-800 dark:bg-emerald-950/40'
              : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
              Completados
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <span className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-400">
            {metricas.completados}
          </span>
          <span className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            Compromisos cumplidos
          </span>
        </button>
      </section>

      {/* Barra de Filtros, Pestañas y Búsqueda */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Pestañas de categoría */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            <button
              type="button"
              data-testid="tab-todos"
              onClick={() => setCategoriaActiva('TODOS')}
              className={`min-h-[44px] rounded-lg px-3.5 text-xs font-bold transition sm:text-sm ${
                categoriaActiva === 'TODOS'
                  ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              Pendientes ({metricas.pendientes})
            </button>

            <button
              type="button"
              data-testid="tab-vencidos"
              onClick={() => setCategoriaActiva('VENCIDOS')}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition sm:text-sm ${
                categoriaActiva === 'VENCIDOS'
                  ? 'bg-white text-rose-700 shadow-xs dark:bg-neutral-700 dark:text-rose-400'
                  : 'text-neutral-600 hover:text-rose-700 dark:text-neutral-400 dark:hover:text-rose-400'
              }`}
            >
              <span>Vencidos</span>
              {metricas.vencidos > 0 && (
                <span className="py-0.2 rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  {metricas.vencidos}
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="tab-hoy"
              onClick={() => setCategoriaActiva('HOY')}
              className={`min-h-[44px] rounded-lg px-3.5 text-xs font-bold transition sm:text-sm ${
                categoriaActiva === 'HOY'
                  ? 'bg-white text-amber-700 shadow-xs dark:bg-neutral-700 dark:text-amber-400'
                  : 'text-neutral-600 hover:text-amber-700 dark:text-neutral-400 dark:hover:text-amber-400'
              }`}
            >
              Hoy ({metricas.deHoy})
            </button>

            <button
              type="button"
              data-testid="tab-proximos"
              onClick={() => setCategoriaActiva('PROXIMOS')}
              className={`min-h-[44px] rounded-lg px-3.5 text-xs font-bold transition sm:text-sm ${
                categoriaActiva === 'PROXIMOS'
                  ? 'bg-white text-teal-700 shadow-xs dark:bg-neutral-700 dark:text-teal-400'
                  : 'text-neutral-600 hover:text-teal-700 dark:text-neutral-400 dark:hover:text-teal-400'
              }`}
            >
              Próximos ({metricas.proximos})
            </button>

            <button
              type="button"
              data-testid="tab-completados"
              onClick={() => setCategoriaActiva('COMPLETADOS')}
              className={`min-h-[44px] rounded-lg px-3.5 text-xs font-bold transition sm:text-sm ${
                categoriaActiva === 'COMPLETADOS'
                  ? 'bg-white text-emerald-700 shadow-xs dark:bg-neutral-700 dark:text-emerald-400'
                  : 'text-neutral-600 hover:text-emerald-700 dark:text-neutral-400 dark:hover:text-emerald-400'
              }`}
            >
              Completados ({metricas.completados})
            </button>
          </div>

          {/* Búsqueda y Selector de Asesor */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Buscador de texto */}
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                data-testid="input-busqueda-seguimientos"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por cliente o tarea..."
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 py-2.5 pr-8 pl-9 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-teal-400"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Selector de Asesor */}
            {asesoresDisponibles.length > 0 && (
              <div className="relative">
                <select
                  data-testid="select-filtro-asesor"
                  value={asesorSeleccionado}
                  onChange={(e) => setAsesorSeleccionado(e.target.value)}
                  aria-label="Filtrar por asesor asignado"
                  className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-neutral-50/50 px-3 py-2 text-xs font-semibold text-neutral-800 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-teal-400"
                >
                  <option value="todos">Todos los asesores</option>
                  {asesoresDisponibles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Lista de Seguimientos o Estados */}
      <main aria-label="Lista de seguimientos" className="space-y-3">
        {cargando ? (
          <div data-testid="esqueleto-seguimientos" className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="h-11 w-11 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
                </div>
                <div className="h-9 w-24 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : error ? (
          <AvisoErrorAccionable
            error={error}
            onReintentar={() => {
              void cargarSeguimientos();
            }}
          />
        ) : seguimientosFiltrados.length === 0 ? (
          <AvisoVacio
            titulo={
              categoriaActiva === 'VENCIDOS'
                ? '¡Sin tareas vencidas!'
                : categoriaActiva === 'HOY'
                  ? 'No hay seguimientos para hoy'
                  : categoriaActiva === 'COMPLETADOS'
                    ? 'No hay seguimientos completados'
                    : busqueda
                      ? 'No hay coincidencias'
                      : 'No hay seguimientos registrados'
            }
            descripcion={
              categoriaActiva === 'VENCIDOS'
                ? 'Tu agenda comercial está al día. No tienes tareas pendientes con fecha vencida.'
                : categoriaActiva === 'HOY'
                  ? 'No tienes tareas programadas para vencer durante el día de hoy.'
                  : categoriaActiva === 'COMPLETADOS'
                    ? 'Las tareas que completes se archivarán aquí para trazabilidad histórica.'
                    : busqueda
                      ? `No encontramos seguimientos que coincidan con "${busqueda}".`
                      : 'Programa nuevos seguimientos con clientes para cerrar oportunidades de viaje.'
            }
          />
        ) : (
          <div className="space-y-3">
            {seguimientosFiltrados.map((s) => (
              <TarjetaSeguimiento
                key={s.id}
                seguimiento={s}
                alCompletar={handleCompletar}
                completando={completandoId === s.id}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal para agendar nuevo seguimiento */}
      {modalCrearAbierto && (
        <ModalCrearSeguimiento
          contactoId="01932000-0000-7000-8000-000000000021"
          onCerrar={() => setModalCrearAbierto(false)}
          onCrear={handleCrearSeguimiento}
        />
      )}
    </div>
  );
}
