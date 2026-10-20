'use client';

/**
 * Pantalla de Listado de Cotizaciones Guardadas (0c.28 & 0c.24).
 *
 * Muestra el directorio completo de cotizaciones con sus últimas versiones.
 * Regla R3: Tipos Zod oficiales de @viajapro/contracts (FilaDeCotizacion, ListarCotizaciones, PaginaDeCotizaciones).
 * Regla R8: Precios en enteros de COP sin coma flotante.
 * Regla R10: Cero filtración de neto o margen (solo total de venta).
 * Paginación por cursor con botón accesible «Cargar más cotizaciones».
 * Filtro por estado del contrato (BORRADOR, ENVIADA, ACEPTADA, RECHAZADA, VENCIDA).
 * Soporta caso de estrés con 500 cotizaciones con nombres largos a 375 px.
 */

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  Database,
  Eye,
  Filter,
} from 'lucide-react';
import type { FilaDeCotizacion, EstadoCotizacion } from '@viajapro/contracts';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { formatearDinero } from '../../lib/api';
import { listarCotizacionesApi, estaUsandoApiReal } from '../../lib/cotizaciones-api';
import {
  filtrarFilasCotizacion,
  extraerResumenVisualCotizacion,
  generarCotizacionesSimuladasLote,
  paginarPorCursor,
} from '../../lib/cotizaciones-listado-logica';
import { obtenerMockPaginaContactos } from '../../lib/mock-contactos';

export default function CotizacionesPage() {
  const usandoApiReal = estaUsandoApiReal();

  // Estados principales de datos y paginación por cursor
  const [filas, setFilas] = useState<FilaDeCotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoCotizacion | 'TODOS'>('TODOS');
  const [modoEstres500, setModoEstres500] = useState(false);
  const [filasEstres500, setFilasEstres500] = useState<FilaDeCotizacion[]>([]);

  // Mapa de nombres de contactos para búsqueda rápida y etiquetas
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

  // Carga inicial o reinicio de listado
  const cargarInicial = async (estres = modoEstres500, estado = estadoFiltro) => {
    setCargando(true);
    setError(null);

    try {
      if (estres) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        let lote = filasEstres500;
        if (lote.length === 0) {
          lote = generarCotizacionesSimuladasLote(500);
          setFilasEstres500(lote);
        }
        let filtradas = lote;
        if (estado !== 'TODOS') {
          filtradas = filtradas.filter((f) => f.estado === estado);
        }
        const pagina = paginarPorCursor(filtradas, undefined, 15);
        setFilas(pagina.datos);
        setNextCursor(pagina.pageInfo.nextCursor);
        setHasMore(pagina.pageInfo.hasMore);
      } else {
        const respuesta = await listarCotizacionesApi({
          limite: 15,
          estado: estado !== 'TODOS' ? estado : undefined,
        });
        setFilas(respuesta.datos);
        setNextCursor(respuesta.pageInfo.nextCursor);
        setHasMore(respuesta.pageInfo.hasMore);
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
    void cargarInicial(modoEstres500, estadoFiltro);
  }, [modoEstres500, estadoFiltro]);

  // Cargar más cotizaciones por cursor
  const cargarMas = async () => {
    if (!hasMore || !nextCursor || cargandoMas) return;
    setCargandoMas(true);

    try {
      if (modoEstres500) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        let lote = filasEstres500;
        if (estadoFiltro !== 'TODOS') {
          lote = lote.filter((f) => f.estado === estadoFiltro);
        }
        const pagina = paginarPorCursor(lote, nextCursor, 15);
        setFilas((prev) => [...prev, ...pagina.datos]);
        setNextCursor(pagina.pageInfo.nextCursor);
        setHasMore(pagina.pageInfo.hasMore);
      } else {
        const respuesta = await listarCotizacionesApi({
          cursor: nextCursor,
          limite: 15,
          estado: estadoFiltro !== 'TODOS' ? estadoFiltro : undefined,
        });
        setFilas((prev) => [...prev, ...respuesta.datos]);
        setNextCursor(respuesta.pageInfo.nextCursor);
        setHasMore(respuesta.pageInfo.hasMore);
      }
    } catch {
      setError('Error al cargar más cotizaciones. Intenta nuevamente.');
    } finally {
      setCargandoMas(false);
    }
  };

  // Filtrado reactivo en el cliente por búsqueda de texto
  const filasFiltradas = useMemo(() => {
    return filtrarFilasCotizacion(filas, busqueda, mapaContactos);
  }, [filas, busqueda, mapaContactos]);

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <BarraModulos />

      <main className="min-w-0 flex-1 overflow-x-hidden pb-28 md:pb-8">
        {/* Cabecera Principal */}
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="bg-acento-100 text-acento-700 dark:bg-acento-950/40 dark:text-acento-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-xs">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-neutral-900 sm:text-lg dark:text-white">
                    Directorio de Cotizaciones
                  </h1>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Historial de cotizaciones emitidas, versiones inmutables y estados
                  </p>
                </div>
                <DistintivoDatosDemo visible={!usandoApiReal || modoEstres500} />
              </div>
            </div>

            {/* Acciones principales y toggle de estrés */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModoEstres500((prev) => !prev)}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  modoEstres500
                    ? 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
                }`}
                title="Probar comportamiento con 500 cotizaciones de nombres largos"
              >
                <Database className="h-3.5 w-3.5" />
                <span>{modoEstres500 ? 'Modo normal' : 'Estrés (500 cot.)'}</span>
              </button>

              <Link
                href="/cotizador"
                className="bg-acento-600 hover:bg-acento-700 flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nueva Cotización</span>
              </Link>
            </div>
          </div>

          {/* Filtros de Búsqueda y Estado */}
          <div className="border-t border-neutral-100 bg-neutral-50/50 px-3.5 py-3 sm:px-6 dark:border-neutral-800/80 dark:bg-neutral-900/50">
            <div className="mx-auto flex max-w-7xl flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Buscador de texto */}
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por cliente, título, paquete o destino..."
                  className="focus:border-acento-500 focus:ring-acento-500 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-white pr-3 pl-9 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              {/* Selector de Estado */}
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Filter className="h-4 w-4 shrink-0 text-neutral-400" />
                <select
                  value={estadoFiltro}
                  onChange={(e) => setEstadoFiltro(e.target.value as EstadoCotizacion | 'TODOS')}
                  className="focus:border-acento-500 focus:ring-acento-500 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 focus:outline-hidden sm:w-auto dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <option value="TODOS">Todos los estados</option>
                  <option value="BORRADOR">Borrador</option>
                  <option value="ENVIADA">Enviada</option>
                  <option value="ACEPTADA">Aceptada</option>
                  <option value="RECHAZADA">Rechazada</option>
                  <option value="VENCIDA">Vencida</option>
                </select>
              </div>
            </div>
          </div>
        </header>

        {/* Contenido Principal */}
        <div className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6">
          {/* ESTADO 1: ERROR CON REINTENTO */}
          {error && !cargando && (
            <div
              className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold">Inconveniente al cargar cotizaciones</h2>
                    <p className="mt-1 text-xs leading-relaxed text-red-800 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void cargarInicial();
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

          {/* ESTADO 2: CARGANDO (ESQUELETO) */}
          {cargando && (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando cotizaciones...">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-4.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
                      <div className="h-3 w-72 rounded bg-neutral-100 dark:bg-neutral-800" />
                    </div>
                    <div className="h-6 w-28 rounded bg-neutral-200 dark:bg-neutral-700" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ESTADO 3: VACÍO */}
          {!cargando && !error && filasFiltradas.length === 0 && (
            <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <FileText className="mx-auto h-12 w-12 text-neutral-300 dark:text-neutral-600" />
              <h2 className="mt-4 text-sm font-bold text-neutral-800 dark:text-neutral-200">
                No hay cotizaciones para mostrar
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                {busqueda || estadoFiltro !== 'TODOS'
                  ? 'Ninguna cotización coincide con los filtros aplicados. Prueba restableciendo los criterios.'
                  : 'Aún no se han guardado cotizaciones en esta agencia.'}
              </p>
              <div className="mt-6 flex justify-center gap-3">
                {(busqueda || estadoFiltro !== 'TODOS') && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda('');
                      setEstadoFiltro('TODOS');
                    }}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Limpiar filtros
                  </button>
                )}
                <Link
                  href="/cotizador"
                  className="bg-acento-600 hover:bg-acento-700 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>Crear primera cotización</span>
                </Link>
              </div>
            </div>
          )}

          {/* ESTADO 4: LISTADO ACTIVO (CARDS EN MÓVIL, TABLA EN DESKTOP) */}
          {!cargando && !error && filasFiltradas.length > 0 && (
            <div className="space-y-4">
              {/* VISTA MÓVIL (< 768 px) */}
              <div className="space-y-3 md:hidden">
                {filasFiltradas.map((fila) => {
                  const resumen = extraerResumenVisualCotizacion(
                    fila,
                    fila.contactoId ? mapaContactos[fila.contactoId] : undefined,
                  );

                  return (
                    <article
                      key={resumen.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-300 rounded-md px-2 py-0.5 text-[10px] font-bold">
                              v{resumen.numeroDeVersiones}
                            </span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                resumen.estado === 'ACEPTADA'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  : resumen.estado === 'ENVIADA'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                    : resumen.estado === 'RECHAZADA'
                                      ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                                      : resumen.estado === 'VENCIDA'
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                              }`}
                            >
                              {resumen.estado}
                            </span>
                          </div>
                          <h2 className="mt-1.5 line-clamp-2 text-xs font-bold break-words text-neutral-900 dark:text-white">
                            {resumen.titulo}
                          </h2>
                          {resumen.contactoNombre && (
                            <p className="mt-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                              Cliente: {resumen.contactoNombre}
                            </p>
                          )}
                        </div>

                        {/* Total Venta */}
                        <div className="shrink-0 text-right">
                          <span className="cifra block text-sm font-extrabold text-neutral-900 dark:text-white">
                            {formatearDinero({
                              unidades: resumen.totalUnidades,
                              moneda: resumen.moneda,
                            })}
                          </span>
                          <span className="text-[10px] text-neutral-400">Total Venta</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2.5 text-[11px] text-neutral-500 dark:border-neutral-800">
                        <span className="truncate pr-2">Salida: {resumen.fechaSalida}</span>
                        <Link
                          href={`/cotizaciones/${resumen.id}`}
                          className="flex min-h-[44px] items-center gap-1 rounded-xl bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Ver</span>
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* VISTA ESCRITORIO (>= 768 px) */}
              <div className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs md:block dark:border-neutral-800 dark:bg-neutral-900">
                <table className="w-full text-left text-xs text-neutral-600 dark:text-neutral-300">
                  <thead className="border-b border-neutral-200 bg-neutral-50/80 text-[11px] font-bold text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40">
                    <tr>
                      <th className="px-5 py-3.5">Título / Cliente</th>
                      <th className="px-4 py-3.5">Paquete y Salida</th>
                      <th className="px-3 py-3.5 text-center">Versión</th>
                      <th className="px-3 py-3.5 text-center">Estado</th>
                      <th className="px-5 py-3.5 text-right">Total Venta (COP)</th>
                      <th className="px-4 py-3.5 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filasFiltradas.map((fila) => {
                      const resumen = extraerResumenVisualCotizacion(
                        fila,
                        fila.contactoId ? mapaContactos[fila.contactoId] : undefined,
                      );

                      return (
                        <tr
                          key={resumen.id}
                          className="transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/50"
                        >
                          <td className="px-5 py-4">
                            <span className="line-clamp-1 font-bold text-neutral-900 dark:text-white">
                              {resumen.titulo}
                            </span>
                            {resumen.contactoNombre && (
                              <span className="block text-[11px] text-neutral-500">
                                {resumen.contactoNombre}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className="line-clamp-1 font-medium text-neutral-800 dark:text-neutral-200">
                              {resumen.paqueteNombre}
                            </span>
                            <span className="text-[11px] text-neutral-400">
                              {resumen.fechaSalida}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-center">
                            <span className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-300 rounded-md px-2 py-0.5 text-[11px] font-bold">
                              v{resumen.numeroDeVersiones}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-center">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                resumen.estado === 'ACEPTADA'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  : resumen.estado === 'ENVIADA'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                    : resumen.estado === 'RECHAZADA'
                                      ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                                      : resumen.estado === 'VENCIDA'
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                              }`}
                            >
                              {resumen.estado}
                            </span>
                          </td>
                          <td className="cifra px-5 py-4 text-right font-extrabold text-neutral-900 dark:text-white">
                            {formatearDinero({
                              unidades: resumen.totalUnidades,
                              moneda: resumen.moneda,
                            })}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <Link
                              href={`/cotizaciones/${resumen.id}`}
                              className="text-acento-600 hover:text-acento-700 dark:text-acento-400 inline-flex min-h-[44px] items-center gap-1 font-semibold"
                            >
                              <Eye className="h-4 w-4" />
                              <span>Ver</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Botón «Cargar más cotizaciones» con cursor */}
              {hasMore && (
                <div className="flex justify-center pt-4 pb-6">
                  <button
                    type="button"
                    onClick={() => void cargarMas()}
                    disabled={cargandoMas}
                    className="dark:hover:bg-neutral-750 flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-300 bg-white px-6 py-2.5 text-xs font-bold text-neutral-800 shadow-xs transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {cargandoMas ? (
                      <>
                        <RefreshCw className="text-acento-600 h-4 w-4 animate-spin" />
                        <span>Cargando más cotizaciones...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        <span>Cargar más cotizaciones</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
