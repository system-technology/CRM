'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Users,
  Printer,
  MapPin,
  Calendar,
} from 'lucide-react';
import type { TableroPipeline } from '@viajapro/contracts';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { EsqueletoReportes } from '../../components/comun/esqueletos';
import { formatearDinero } from '../../lib/api';
import {
  obtenerEtiquetaPeriodo,
  obtenerReportePorPeriodo,
  type RangoPeriodo,
  type RolVistaReporte,
} from '../../lib/reportes-logica';
import { usePermisos } from '../../lib/permisos';
import { obtenerTableroPipeline } from '../../lib/crm-api';
import { esModoDemo } from '../../lib/modo-demo';

const PERIODOS: RangoPeriodo[] = ['ultimos_30_dias', 'este_mes', 'trimestre', 'ano'];

export default function ReportesPage() {
  const { puedeVerNetoYMargen } = usePermisos();
  const [periodo, setPeriodo] = useState<RangoPeriodo>('ultimos_30_dias');
  const [rol, setRol] = useState<RolVistaReporte>('DUENO');
  const [tablero, setTablero] = useState<TableroPipeline | null>(null);
  const [cargando, setCargando] = useState(false);
  const [esDemo, setEsDemo] = useState(false);

  useEffect(() => {
    let activo = true;
    setEsDemo(esModoDemo());

    const cargarDatos = async () => {
      try {
        const datos = await obtenerTableroPipeline();
        if (activo) setTablero(datos);
      } catch {
        // En caso de desconexión o fallo, tablero permanece en null
        // y la vista exhibe indicadores transparentes de «Aún sin datos» (T-021)
      }
    };

    void cargarDatos();
    return () => {
      activo = false;
    };
  }, []);

  const cambiarPeriodo = (nuevo: RangoPeriodo) => {
    setCargando(true);
    setPeriodo(nuevo);
    setTimeout(() => setCargando(false), 150);
  };

  const cambiarRol = (nuevo: RolVistaReporte) => {
    setCargando(true);
    setRol(nuevo);
    setTimeout(() => setCargando(false), 150);
  };

  // Regla R10 / ADR-0011: el servidor es la fuente del permiso. Sin él,
  // la vista siempre es ASESOR y el reporte calcula sin netos ni márgenes.
  const rolEfectivo: RolVistaReporte = puedeVerNetoYMargen ? rol : 'ASESOR';
  const reporte = obtenerReportePorPeriodo(periodo, rolEfectivo, tablero);
  const esDueño = rolEfectivo === 'DUENO';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* 1. Barra Lateral de Módulos */}
      <BarraModulos />

      {/* 2. Cuerpo Principal */}
      <main className="flex flex-1 flex-col overflow-y-auto pb-14 md:pb-0">
        {/* Encabezado */}
        <header className="border-b border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 rounded-lg p-1.5">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                  Reportes y Rendimiento Comercial
                </h1>
                <DistintivoDatosDemo visible={esDemo} />
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Lectura ejecutiva de ventas, cuellos de botella en el embudo y tiempos de atención
                de WhatsApp.
              </p>
            </div>

            {/* Controles de Vista y Período */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Conmutador de Rol (Solo si tiene permiso para vista de dueño) */}
              {puedeVerNetoYMargen ? (
                <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs dark:border-neutral-800 dark:bg-neutral-800">
                  <button
                    type="button"
                    onClick={() => cambiarRol('DUENO')}
                    className={`min-h-[44px] rounded-md px-3.5 py-2 font-medium transition-colors ${
                      esDueño
                        ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                    }`}
                  >
                    Vista Dueño (Gerencial)
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiarRol('ASESOR')}
                    className={`min-h-[44px] rounded-md px-3.5 py-2 font-medium transition-colors ${
                      !esDueño
                        ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                    }`}
                  >
                    Vista Asesor (Operativa)
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[44px] items-center rounded-lg border border-neutral-200 bg-neutral-100 px-3.5 py-2 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
                  Vista Asesor (Operativa)
                </div>
              )}

              {/* Selector de Período */}
              <div className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800">
                <Calendar className="h-4 w-4 text-neutral-400" />
                <select
                  value={periodo}
                  onChange={(e) => cambiarPeriodo(e.target.value as RangoPeriodo)}
                  className="bg-transparent font-medium text-neutral-700 outline-hidden dark:text-neutral-200"
                >
                  {PERIODOS.map((p) => (
                    <option key={p} value={p}>
                      {obtenerEtiquetaPeriodo(p)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Botón Imprimir */}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
            </div>
          </div>
        </header>

        {/* Contenido Principal con Estados (0c.25) */}
        <div className="flex-1 space-y-6 p-6">
          {cargando ? (
            <EsqueletoReportes />
          ) : (
            <>
              {/* Fila 1: KPIs Principales */}
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* KPI 1: Ventas Totales */}
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Ventas en el Período
                    </span>
                    {reporte.cambioVentasPorcentaje !== null ? (
                      <span
                        className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          reporte.cambioVentasPorcentaje >= 0
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {reporte.cambioVentasPorcentaje >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {reporte.cambioVentasPorcentaje > 0 ? '+' : ''}
                        {reporte.cambioVentasPorcentaje}%
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        Aún sin datos
                      </span>
                    )}
                  </div>
                  <div className="cifra mt-2 text-2xl font-extrabold text-neutral-900 dark:text-white">
                    {reporte.ventasTotales
                      ? formatearDinero(reporte.ventasTotales)
                      : 'Aún sin datos'}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {reporte.ventasPeriodoAnterior
                      ? `Anterior: ${formatearDinero(reporte.ventasPeriodoAnterior)}`
                      : 'Anterior: Aún sin datos'}
                  </div>
                </div>

                {/* KPI 2: Meta de Cierres */}
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Meta Comercial
                    </span>
                    <span className="cifra text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      {reporte.porcentajeMetaMes !== null
                        ? `${reporte.porcentajeMetaMes}%`
                        : 'Aún sin datos'}
                    </span>
                  </div>
                  <div className="cifra mt-2 text-2xl font-extrabold text-neutral-900 dark:text-white">
                    {reporte.metaMesVentas
                      ? formatearDinero(reporte.metaMesVentas)
                      : 'Aún sin datos'}
                  </div>
                  {/* Barra de progreso */}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="bg-ok-600 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, reporte.porcentajeMetaMes ?? 0)}%` }}
                    />
                  </div>
                </div>

                {/* KPI 3: Tasa de Conversión */}
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Tasa de Conversión
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {reporte.oportunidadesGanadas} ganadas / {reporte.oportunidadesPerdidas}{' '}
                      perdidas
                    </span>
                  </div>
                  <div className="cifra mt-2 text-2xl font-extrabold text-neutral-900 dark:text-white">
                    {reporte.tasaConversion !== null
                      ? `${reporte.tasaConversion}%`
                      : 'Aún sin datos'}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {reporte.oportunidadesCreadas ?? 0} oportunidades en el período
                  </div>
                </div>

                {/* KPI 4: Tiempo de Respuesta (SLA) */}
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      SLA Primera Respuesta
                    </span>
                    {typeof reporte.tiempoRespuestaPeriodoAnteriorMinutos === 'number' &&
                    typeof reporte.tiempoRespuestaPromedioMinutos === 'number' ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <Clock className="h-3 w-3" />-
                        {(
                          reporte.tiempoRespuestaPeriodoAnteriorMinutos -
                          reporte.tiempoRespuestaPromedioMinutos
                        ).toFixed(1)}{' '}
                        min
                      </span>
                    ) : (
                      <Clock className="h-4 w-4 text-neutral-400" />
                    )}
                  </div>
                  <div className="cifra mt-2 text-2xl font-extrabold text-neutral-900 dark:text-white">
                    {reporte.tiempoRespuestaPromedioMinutos !== null
                      ? `${reporte.tiempoRespuestaPromedioMinutos} min`
                      : 'Aún sin datos'}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {typeof reporte.tiempoRespuestaPeriodoAnteriorMinutos === 'number'
                      ? `Anterior: ${reporte.tiempoRespuestaPeriodoAnteriorMinutos} min`
                      : 'SLA WhatsApp: Aún sin datos'}
                  </div>
                </div>
              </section>

              {/* Margen Confidencial (Solo Dueño con permiso de servidor - R10 / ADR-0011) */}
              {puedeVerNetoYMargen && esDueño && (
                <section
                  data-testid="seccion-margen-confidencial"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 uppercase dark:text-emerald-300">
                        <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Utilidad Bruta y Margen Real (Venta − Costo Mayorista)
                      </div>
                      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                        Calculado sobre expedientes confirmados. Oculto por política en la vista
                        operativa de asesores.
                      </p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Costo Neto Mayoristas:
                        </span>
                        <div className="cifra text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                          {reporte.costoNetoTotal
                            ? formatearDinero(reporte.costoNetoTotal)
                            : 'Aún sin datos'}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-emerald-800 dark:text-emerald-400">
                          Margen Comercial{' '}
                          {reporte.margenPorcentaje !== null
                            ? `(${reporte.margenPorcentaje}%)`
                            : ''}
                          :
                        </span>
                        <div className="cifra text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                          {reporte.margenTotal
                            ? formatearDinero(reporte.margenTotal)
                            : 'Aún sin datos'}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Fila 2: Ventas por Destino y Embudo de Conversión */}
              <section className="grid gap-6 lg:grid-cols-2">
                {/* Ventas por Destino */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                    <MapPin className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                    Ventas por Destino Turístico
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Distribución porcentual de facturación en el período seleccionado.
                  </p>

                  <div className="mt-5 space-y-4">
                    {reporte.ventasPorDestino.length === 0 ? (
                      <div className="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                        Aún sin datos de ventas por destino en este período
                      </div>
                    ) : (
                      reporte.ventasPorDestino.map((dest) => (
                        <div key={dest.destino}>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                {dest.destino}
                              </span>
                              <span className="text-neutral-400">
                                ({dest.paquetesVendidos} paquetes)
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="cifra font-bold text-neutral-900 dark:text-white">
                                {formatearDinero(dest.totalVentas)}
                              </span>
                              <span className="cifra w-12 text-right text-neutral-500">
                                {dest.porcentaje}%
                              </span>
                            </div>
                          </div>
                          {/* Barra de proporción */}
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                            <div
                              className="bg-acento-600 h-full rounded-full transition-all"
                              style={{ width: `${dest.porcentaje}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Embudo de Conversión (Funnel) */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                    <Target className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                    Embudo Comercial de Conversión
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Transición de leads desde consulta inicial hasta cierre confirmado.
                  </p>

                  <div className="mt-5 space-y-3">
                    {reporte.conversionPorEtapa.length === 0 ? (
                      <div className="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                        Aún sin datos de conversión en el embudo
                      </div>
                    ) : (
                      reporte.conversionPorEtapa.map((etapa) => (
                        <div
                          key={etapa.etapaId}
                          className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-800/40"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-bold text-neutral-700 shadow-xs dark:bg-neutral-700 dark:text-white">
                              {etapa.cantidad}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-neutral-900 dark:text-white">
                                {etapa.nombre}
                              </div>
                              <div className="text-[11px] text-neutral-400">
                                {etapa.porcentajeEmbudo}% del total de consultas
                              </div>
                            </div>
                          </div>

                          <div className="w-32">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                              <div
                                className="bg-ok-600 h-full rounded-full transition-all"
                                style={{ width: `${etapa.porcentajeEmbudo}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* Fila 3: Rendimiento por Asesor */}
              <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                  <Users className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                  Rendimiento Operativo por Asesor
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Volumen de atención en WhatsApp, cierres concretados y tiempos de respuesta.
                </p>

                <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-100 dark:border-neutral-800">
                  {reporte.rendimientoAsesores.length === 0 ? (
                    <div className="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                      Aún sin datos de rendimiento de asesores en este período
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-neutral-100 bg-neutral-50/60 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
                          <th className="px-4 py-2.5 font-medium">Asesor</th>
                          <th className="px-4 py-2.5 text-right font-medium">Chats Atendidos</th>
                          <th className="px-4 py-2.5 text-right font-medium">Cierres Ganados</th>
                          <th className="px-4 py-2.5 text-right font-medium">Facturación</th>
                          <th className="px-4 py-2.5 text-right font-medium">Tiempo Respuesta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                        {reporte.rendimientoAsesores.map((asesor) => (
                          <tr
                            key={asesor.asesorId}
                            className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                                  {asesor.avatar}
                                </div>
                                <div>
                                  <div className="font-semibold text-neutral-900 dark:text-white">
                                    {asesor.nombre}
                                  </div>
                                  <div className="text-[11px] text-neutral-400">
                                    {asesor.correo}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="cifra px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">
                              {asesor.conversaciones}
                            </td>

                            <td className="cifra text-ok-700 dark:text-ok-400 px-4 py-3 text-right font-bold">
                              {asesor.oportunidadesGanadas}
                            </td>

                            <td className="cifra px-4 py-3 text-right font-bold text-neutral-900 dark:text-white">
                              {formatearDinero(asesor.totalVentas)}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {asesor.tiempoRespuestaMinutos !== null ? (
                                <span
                                  className={`cifra inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                                    asesor.tiempoRespuestaMinutos <= 5
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  }`}
                                >
                                  <Clock className="h-3 w-3" />
                                  {asesor.tiempoRespuestaMinutos} min
                                </span>
                              ) : (
                                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                                  Aún sin datos
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
