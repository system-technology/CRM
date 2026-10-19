'use client';

/**
 * Pantalla de Listado de Cotizaciones Guardadas (0c.24).
 *
 * Muestra el directorio completo de cotizaciones con sus últimas versiones.
 * Regla R8: Precios en enteros de COP sin coma flotante.
 * Regla R10: Cero filtración de neto o margen (solo total de venta).
 * Estados de carga (esqueleto, no spinner centrado), vacío y error con reintento.
 * Soporta caso de estrés con 500 cotizaciones con nombres largos a 375 px.
 */

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  Plus,
  ArrowUpDown,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
} from 'lucide-react';
import type { CotizacionGuardada } from '@viajapro/contracts';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { formatearDinero } from '../../lib/api';
import { listarCotizacionesApi, estaUsandoApiReal } from '../../lib/cotizaciones-api';
import {
  filtrarCotizaciones,
  ordenarCotizaciones,
  paginarItems,
  extraerResumenVisualCotizacion,
  generarCotizacionesSimuladasLote,
  type CriterioOrdenCotizaciones,
} from '../../lib/cotizaciones-listado-logica';
import { obtenerMockPaginaContactos } from '../../lib/mock-contactos';

export default function CotizacionesPage() {
  const usandoApiReal = estaUsandoApiReal();

  // Estados principales
  const [todasCotizaciones, setTodasCotizaciones] = useState<CotizacionGuardada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros y orden
  const [busqueda, setBusqueda] = useState('');
  const [criterioOrden, setCriterioOrden] = useState<CriterioOrdenCotizaciones>('fecha_desc');
  const [paginaActual, setPaginaActual] = useState(1);
  const [modoEstres500, setModoEstres500] = useState(false);

  // Mapa de nombres de contactos para búsqueda rápida
  const mapaContactos = useMemo(() => {
    const mapa: Record<string, string> = {};
    const contactos = obtenerMockPaginaContactos().datos;
    for (const c of contactos) {
      if (c.nombre) {
        mapa[c.id] = c.nombre;
      }
    }
    return mapa;
  }, []);

  const cargarDatos = async (usar500 = modoEstres500) => {
    setCargando(true);
    setError(null);

    try {
      if (usar500) {
        // Simulación de 500 cotizaciones con nombres largos
        await new Promise((resolve) => setTimeout(resolve, 300));
        const lote = generarCotizacionesSimuladasLote(500);
        setTodasCotizaciones(lote);
      } else {
        const datos = await listarCotizacionesApi();
        setTodasCotizaciones(datos);
      }
    } catch {
      setError(
        'No fue posible cargar el listado de cotizaciones. Verifica tu conexión o el estado del servidor e intenta nuevamente.',
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarDatos(modoEstres500);
  }, [modoEstres500]);

  // Filtrado y ordenamiento en memoria
  const cotizacionesProcesadas = useMemo(() => {
    const filtradas = filtrarCotizaciones(todasCotizaciones, busqueda, mapaContactos);
    return ordenarCotizaciones(filtradas, criterioOrden);
  }, [todasCotizaciones, busqueda, mapaContactos, criterioOrden]);

  // Paginación (10 cotizaciones por página para rendimiento óptimo)
  const paginacion = useMemo(() => {
    return paginarItems(cotizacionesProcesadas, paginaActual, 10);
  }, [cotizacionesProcesadas, paginaActual]);

  // Si cambia la búsqueda o el orden, regresamos a la página 1
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, criterioOrden]);

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <BarraModulos />

      <main className="flex-1 overflow-x-hidden">
        {/* Cabecera Principal */}
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="bg-acento-100 text-acento-700 dark:bg-acento-950/40 dark:text-acento-300 flex h-10 w-10 items-center justify-center rounded-xl">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black tracking-tight text-neutral-900 sm:text-xl dark:text-white">
                      Cotizaciones Guardadas
                    </h1>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {cargando ? '...' : cotizacionesProcesadas.length}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Histórico inmutable de versiones y propuestas comerciales
                  </p>
                </div>
              </div>
            </div>

            {/* Acciones y Badges */}
            <div className="flex flex-wrap items-center gap-2.5">
              <DistintivoDatosDemo visible={!usandoApiReal} />

              {/* Botón estrés 500 cotizaciones */}
              <button
                type="button"
                onClick={() => setModoEstres500((prev) => !prev)}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  modoEstres500
                    ? 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
                }`}
                title="Alternar prueba de estrés con 500 cotizaciones de nombres largos"
              >
                <Database className="h-3.5 w-3.5" />
                <span>{modoEstres500 ? 'Modo 500 activo' : 'Probar 500'}</span>
              </button>

              {/* Botón Nueva Cotización */}
              <Link
                href="/cotizador"
                className="bg-acento-600 hover:bg-acento-700 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nueva Cotización</span>
              </Link>
            </div>
          </div>

          {/* Barra de Búsqueda y Filtros */}
          <div className="border-t border-neutral-100 bg-neutral-50/50 px-4 py-3 sm:px-6 dark:border-neutral-800/60 dark:bg-neutral-900/50">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Buscador */}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por cliente, destino, paquete o título..."
                  className="focus:border-acento-500 focus:ring-acento-500 block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3.5 pl-9 text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-1 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                />
              </div>

              {/* Orden */}
              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </div>
                  <select
                    value={criterioOrden}
                    onChange={(e) => setCriterioOrden(e.target.value as CriterioOrdenCotizaciones)}
                    className="focus:border-acento-500 focus:ring-acento-500 min-h-[44px] appearance-none rounded-xl border border-neutral-300 bg-white py-2 pr-8 pl-9 text-xs font-medium text-neutral-800 focus:ring-1 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    aria-label="Ordenar listado"
                  >
                    <option value="fecha_desc">Más recientes primero</option>
                    <option value="fecha_asc">Más antiguas primero</option>
                    <option value="total_desc">Mayor total de venta</option>
                    <option value="total_asc">Menor total de venta</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Contenido Principal */}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {/* ESTADO 1: ERROR CON REINTENTO */}
          {error && !cargando && (
            <div
              className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold">Error al cargar cotizaciones</h2>
                    <p className="mt-1 text-xs leading-relaxed text-red-800 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void cargarDatos();
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 focus:outline-none"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reintentar carga</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ESTADO 2: CARGANDO (ESQUELETO, NO SPINNER) */}
          {cargando && (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando cotizaciones...">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-4.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-48 rounded-md bg-neutral-200 dark:bg-neutral-800" />
                        <div className="h-5 w-12 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                      </div>
                      <div className="h-3.5 w-72 rounded-md bg-neutral-100 dark:bg-neutral-800/60" />
                      <div className="h-3 w-36 rounded-md bg-neutral-100 dark:bg-neutral-800/60" />
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                      <div className="h-6 w-28 rounded-md bg-neutral-200 dark:bg-neutral-800" />
                      <div className="h-8 w-24 rounded-xl bg-neutral-100 dark:bg-neutral-800" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ESTADO 3: VACÍO */}
          {!cargando && !error && cotizacionesProcesadas.length === 0 && (
            <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
                <FileText className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-base font-bold text-neutral-900 dark:text-white">
                {busqueda ? 'No se encontraron resultados' : 'No hay cotizaciones registradas'}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
                {busqueda
                  ? `Ninguna cotización coincide con "${busqueda}". Prueba cambiando el término de búsqueda.`
                  : 'Crea tu primera cotización desde el cotizador para guardarla y enviar propuestas a tus viajeros.'}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {busqueda ? (
                  <button
                    type="button"
                    onClick={() => setBusqueda('')}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    Limpiar búsqueda
                  </button>
                ) : (
                  <Link
                    href="/cotizador"
                    className="bg-acento-600 hover:bg-acento-700 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Ir al Cotizador</span>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* ESTADO 4: LISTADO CON DATOS (RESPONSIVE: TABLA EN DESKTOP, TARJETAS EN MÓVIL 375 px) */}
          {!cargando && !error && cotizacionesProcesadas.length > 0 && (
            <div className="space-y-4">
              {/* VISTA MÓVIL (cards optimizadas a 375 px) */}
              <div className="space-y-3 md:hidden">
                {paginacion.items.map((cot) => {
                  const resumen = extraerResumenVisualCotizacion(
                    cot,
                    cot.contactoId ? mapaContactos[cot.contactoId] : undefined,
                  );

                  return (
                    <article
                      key={resumen.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-300 rounded-md px-2 py-0.5 text-[10px] font-bold">
                              v{resumen.versionNumero}
                            </span>
                            {resumen.totalVersiones > 1 && (
                              <span className="text-[10px] text-neutral-400">
                                ({resumen.totalVersiones} vers.)
                              </span>
                            )}
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                resumen.estado === 'ACEPTADA'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : resumen.estado === 'ENVIADA'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                              }`}
                            >
                              {resumen.estado}
                            </span>
                          </div>
                          <h3 className="mt-1.5 line-clamp-2 text-xs font-bold text-neutral-900 dark:text-white">
                            {resumen.titulo}
                          </h3>
                        </div>
                      </div>

                      {/* Detalles: Cliente y Paquete */}
                      <div className="mt-2.5 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                        <p className="truncate font-medium text-neutral-900 dark:text-neutral-200">
                          {resumen.contactoNombre || 'Sin contacto asociado'}
                        </p>
                        <p className="truncate text-[11px] text-neutral-500">
                          {resumen.paqueteNombre}
                        </p>
                      </div>

                      {/* Pie: Total y botón */}
                      <div className="mt-3.5 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                        <div>
                          <span className="text-[10px] text-neutral-400 uppercase">
                            Total Venta
                          </span>
                          <p className="text-sm font-black text-neutral-900 dark:text-white">
                            {formatearDinero({
                              unidades: resumen.totalUnidades,
                              moneda: 'COP',
                            })}
                          </p>
                        </div>
                        <Link
                          href={`/cotizaciones/${resumen.id}`}
                          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-neutral-100 px-3.5 py-2 text-xs font-bold text-neutral-800 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Ver</span>
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* VISTA ESCRITORIO (Tabla limpia con truncate para nombres largos) */}
              <div className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs md:block dark:border-neutral-800 dark:bg-neutral-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-bold text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/50">
                    <tr>
                      <th scope="col" className="px-5 py-3.5">
                        Cotización & Paquete
                      </th>
                      <th scope="col" className="px-5 py-3.5">
                        Cliente
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-center">
                        Versión
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-right">
                        Total Venta
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-center">
                        Estado
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {paginacion.items.map((cot) => {
                      const resumen = extraerResumenVisualCotizacion(
                        cot,
                        cot.contactoId ? mapaContactos[cot.contactoId] : undefined,
                      );

                      return (
                        <tr
                          key={resumen.id}
                          className="transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40"
                        >
                          {/* Cotización & Paquete */}
                          <td className="max-w-xs px-5 py-4">
                            <Link
                              href={`/cotizaciones/${resumen.id}`}
                              className="hover:text-acento-600 dark:hover:text-acento-400 block truncate font-bold text-neutral-900 dark:text-white"
                              title={resumen.titulo}
                            >
                              {resumen.titulo}
                            </Link>
                            <p
                              className="mt-0.5 truncate text-[11px] text-neutral-500"
                              title={resumen.paqueteNombre}
                            >
                              {resumen.paqueteNombre}
                            </p>
                          </td>

                          {/* Cliente */}
                          <td className="max-w-[200px] px-5 py-4">
                            <span
                              className="block truncate font-medium text-neutral-800 dark:text-neutral-200"
                              title={resumen.contactoNombre || 'Sin contacto'}
                            >
                              {resumen.contactoNombre || 'Sin contacto'}
                            </span>
                            <span className="text-[11px] text-neutral-400">
                              {new Date(resumen.creadaEn).toLocaleDateString('es-CO', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </td>

                          {/* Versión */}
                          <td className="px-5 py-4 text-center">
                            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                              v{resumen.versionNumero}
                            </span>
                            {resumen.totalVersiones > 1 && (
                              <span className="mt-0.5 block text-[10px] text-neutral-400">
                                {resumen.totalVersiones} vers.
                              </span>
                            )}
                          </td>

                          {/* Total Venta */}
                          <td className="px-5 py-4 text-right">
                            <span className="text-sm font-black text-neutral-900 dark:text-white">
                              {formatearDinero({
                                unidades: resumen.totalUnidades,
                                moneda: 'COP',
                              })}
                            </span>
                          </td>

                          {/* Estado */}
                          <td className="px-5 py-4 text-center">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                resumen.estado === 'ACEPTADA'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : resumen.estado === 'ENVIADA'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                              }`}
                            >
                              {resumen.estado}
                            </span>
                          </td>

                          {/* Acción */}
                          <td className="px-5 py-4 text-right">
                            <Link
                              href={`/cotizaciones/${resumen.id}`}
                              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Ver</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Barra de Paginación */}
              {paginacion.totalPaginas > 1 && (
                <nav
                  className="flex flex-col items-center justify-between gap-3 border-t border-neutral-200 pt-4 sm:flex-row dark:border-neutral-800"
                  aria-label="Paginación de cotizaciones"
                >
                  <p className="text-xs text-neutral-500">
                    Mostrando{' '}
                    <span className="font-bold text-neutral-800 dark:text-neutral-200">
                      {(paginacion.paginaActual - 1) * paginacion.tamanoPagina + 1}
                    </span>{' '}
                    a{' '}
                    <span className="font-bold text-neutral-800 dark:text-neutral-200">
                      {Math.min(
                        paginacion.paginaActual * paginacion.tamanoPagina,
                        paginacion.totalItems,
                      )}
                    </span>{' '}
                    de{' '}
                    <span className="font-bold text-neutral-800 dark:text-neutral-200">
                      {paginacion.totalItems}
                    </span>{' '}
                    cotizaciones
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={paginacion.paginaActual <= 1}
                      onClick={() => setPaginaActual((prev) => Math.max(1, prev - 1))}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-200 bg-white p-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                      aria-label="Página anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <span className="px-3 text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      Página {paginacion.paginaActual} de {paginacion.totalPaginas}
                    </span>

                    <button
                      type="button"
                      disabled={paginacion.paginaActual >= paginacion.totalPaginas}
                      onClick={() =>
                        setPaginaActual((prev) => Math.min(paginacion.totalPaginas, prev + 1))
                      }
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-200 bg-white p-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                      aria-label="Página siguiente"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </nav>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
