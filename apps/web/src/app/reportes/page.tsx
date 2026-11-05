'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Lock,
  Printer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { EsqueletoReportes } from '../../components/comun/esqueletos';
import { formatearDinero, ZONA_HORARIA_COLOMBIA } from '../../lib/formato';
import { usePermisos } from '../../lib/permisos';
import { ErrorReportesApi, obtenerResumenDeReportesApi } from '../../lib/reportes-api';
import { diasDelRango, rangoAnterior } from '../../lib/reportes-periodo';
import {
  convertirPeriodoAInstantesUtc,
  formatearPorcentajeReporte,
  obtenerEtiquetaPeriodo,
  TEXTO_SIN_DATOS,
  transformarResumenReporte,
  type RangoPeriodo,
  type RolVistaReporte,
  type VistaReporteResumen,
} from '../../lib/reportes-logica';

const PERIODOS: RangoPeriodo[] = ['ultimos_30_dias', 'este_mes', 'trimestre', 'ano'];

const tarjetaClase =
  'rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900';
const etiquetaClase = 'text-xs font-medium text-neutral-500 dark:text-neutral-400';
const cifraGrandeClase = 'cifra mt-2 text-2xl font-extrabold text-neutral-900 dark:text-white';
const pieClase = 'mt-1 text-[11px] text-neutral-400 dark:text-neutral-500';

function formatearFechaCorta(instanteIso: string): string {
  const ts = Date.parse(instanteIso);
  if (Number.isNaN(ts)) return instanteIso;
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeZone: ZONA_HORARIA_COLOMBIA,
  }).format(new Date(ts));
}

type EstadoReportes =
  | { tipo: 'cargando' }
  | { tipo: 'sin-permiso' }
  | { tipo: 'error'; mensaje: string }
  | {
      tipo: 'listo';
      vista: VistaReporteResumen;
      diasAnteriores: number | null;
    };

interface ReportesPageProps {
  /** Reloj inyectable para pruebas deterministas. */
  ahora?: () => Date;
}

export default function ReportesPage({ ahora }: ReportesPageProps) {
  const { puedeVerNetoYMargen } = usePermisos();
  const [periodo, setPeriodo] = useState<RangoPeriodo>('ultimos_30_dias');
  const [rol, setRol] = useState<RolVistaReporte>('DUENO');
  const [estado, setEstado] = useState<EstadoReportes>({ tipo: 'cargando' });
  const [intento, setIntento] = useState(0);

  const rolEfectivo: RolVistaReporte = puedeVerNetoYMargen ? rol : 'ASESOR';
  const esDueño = rolEfectivo === 'DUENO';

  const recargar = useCallback(() => {
    setEstado({ tipo: 'cargando' });
    setIntento((n) => n + 1);
  }, []);

  useEffect(() => {
    const control = new AbortController();
    const reloj = ahora ? ahora() : new Date();
    const rango = convertirPeriodoAInstantesUtc(periodo, reloj);
    const previo = rangoAnterior(rango);

    void (async () => {
      try {
        const [resumen, anterior] = await Promise.all([
          obtenerResumenDeReportesApi(rango, control.signal),
          previo
            ? obtenerResumenDeReportesApi(previo, control.signal).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (control.signal.aborted) return;

        setEstado({
          tipo: 'listo',
          vista: transformarResumenReporte(resumen, anterior),
          diasAnteriores: anterior ? diasDelRango(rango) : null,
        });
      } catch (err) {
        if (control.signal.aborted) return;
        if (err instanceof ErrorReportesApi && err.estado === 403) {
          setEstado({ tipo: 'sin-permiso' });
        } else {
          setEstado({
            tipo: 'error',
            mensaje: err instanceof Error ? err.message : 'No se pudo cargar el reporte.',
          });
        }
      }
    })();

    return () => {
      control.abort();
    };
  }, [periodo, intento, ahora]);

  const vista = estado.tipo === 'listo' ? estado.vista : null;

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
                <span className="rounded-lg bg-emerald-100 p-1.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                  Reportes y Rendimiento Comercial
                </h1>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {vista
                  ? `Del ${formatearFechaCorta(vista.periodo.desde)} al ${formatearFechaCorta(
                      new Date(Date.parse(vista.periodo.hasta) - 1).toISOString(),
                    )} (hora de Colombia).`
                  : 'Lectura ejecutiva de ventas, cuellos de botella en el embudo y tiempos de atención.'}
              </p>
            </div>

            {/* Controles de Vista y Período */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Conmutador de Rol (Solo si tiene permiso cotizacion.ver_neto_y_margen) */}
              {puedeVerNetoYMargen ? (
                <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs dark:border-neutral-800 dark:bg-neutral-800">
                  <button
                    type="button"
                    onClick={() => setRol('DUENO')}
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
                    onClick={() => setRol('ASESOR')}
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
                  onChange={(e) => setPeriodo(e.target.value as RangoPeriodo)}
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

        {/* Contenido Principal con Estados */}
        <div className="flex-1 space-y-6 p-6">
          {estado.tipo === 'cargando' ? (
            <EsqueletoReportes />
          ) : estado.tipo === 'sin-permiso' ? (
            <div
              role="alert"
              data-testid="reportes-sin-permiso"
              className={`${tarjetaClase} mx-auto flex max-w-md flex-col items-center gap-1 text-center text-xs`}
            >
              <Lock className="h-5 w-5 text-neutral-400" />
              <p className="font-semibold text-neutral-800 dark:text-neutral-100">
                No tienes permiso para ver los reportes.
              </p>
              <p className="text-neutral-500">
                Pide a un Dueño de la agencia que te habilite el acceso.
              </p>
            </div>
          ) : estado.tipo === 'error' ? (
            <div
              role="alert"
              data-testid="reportes-error"
              className={`${tarjetaClase} mx-auto flex max-w-md flex-col items-center gap-2 text-center text-xs`}
            >
              <AlertTriangle className="h-5 w-5 text-rose-600" />
              <p className="font-semibold text-rose-800 dark:text-rose-300">
                No se pudo cargar el reporte.
              </p>
              <p className="text-neutral-600 dark:text-neutral-300">{estado.mensaje}</p>
              <button
                type="button"
                onClick={recargar}
                className="min-h-[44px] rounded-xl border border-neutral-300 px-4 py-2 font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <ReportesListo
              vista={estado.vista}
              diasAnteriores={estado.diasAnteriores}
              puedeVerNetoYMargen={puedeVerNetoYMargen}
              esDueño={esDueño}
            />
          )}
        </div>
      </main>
    </div>
  );
}

interface ReportesListoProps {
  vista: VistaReporteResumen;
  diasAnteriores: number | null;
  puedeVerNetoYMargen: boolean;
  esDueño: boolean;
}

function ReportesListo({
  vista,
  diasAnteriores,
  puedeVerNetoYMargen,
  esDueño,
}: ReportesListoProps) {
  const sinActividad =
    vista.cotizaciones.creadas === 0 &&
    vista.cotizaciones.enviadas === 0 &&
    vista.oportunidades.creadas === 0 &&
    vista.respuesta.conversacionesNuevas === 0 &&
    vista.respuesta.conversacionesRespondidas === 0 &&
    vista.filasVentas.length === 0;

  const maxEtapa = Math.max(1, ...vista.oportunidades.porEtapa.map((e) => e.cantidad));

  return (
    <div className="space-y-6" data-testid="reportes-reales">
      {sinActividad && (
        <div
          data-testid="reportes-vacio"
          className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
        >
          Todavía no hay actividad registrada en este periodo. Cuando haya cotizaciones,
          oportunidades o conversaciones, aparecerán aquí.
        </div>
      )}

      {/* Fila 1: KPIs Principales */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Ventas en el periodo (una tarjeta/fila por moneda, nunca sumadas) */}
        <div className={tarjetaClase} data-testid="kpi-ventas">
          <span className={etiquetaClase}>Ventas en el período</span>
          {vista.filasVentas.length === 0 ? (
            <div className={cifraGrandeClase}>{TEXTO_SIN_DATOS}</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {vista.filasVentas.map((f) => (
                <li key={f.moneda} data-testid={`ventas-${f.moneda}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="cifra text-xl font-extrabold text-neutral-900 dark:text-white">
                      {formatearDinero(f.ventas)}
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-500">{f.moneda}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>
                      {f.cotizacionesAceptadas}{' '}
                      {f.cotizacionesAceptadas === 1
                        ? 'cotización aceptada'
                        : 'cotizaciones aceptadas'}
                    </span>
                    {f.variacionPorcentaje !== null ? (
                      <span
                        className={`flex items-center gap-0.5 font-bold ${
                          f.variacionPorcentaje >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {f.variacionPorcentaje >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {f.variacionPorcentaje > 0 ? '+' : ''}
                        {f.variacionPorcentaje} %
                      </span>
                    ) : (
                      <span>vs. anterior: {TEXTO_SIN_DATOS}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {diasAnteriores !== null && (
            <div className={pieClase}>Variación contra los {diasAnteriores} días anteriores.</div>
          )}
        </div>

        {/* KPI 2: Cotizaciones (Tasa de aceptación con cohorte explícita) */}
        <div className={tarjetaClase} data-testid="kpi-cotizaciones">
          <span className={etiquetaClase}>Tasa de aceptación</span>
          <div className={cifraGrandeClase}>{vista.cotizaciones.tasaAceptacionTexto}</div>
          <div className={pieClase}>{vista.cotizaciones.cohorteTexto}</div>
        </div>

        {/* KPI 3: Oportunidades (Tasa de conversión con cohorte explícita) */}
        <div className={tarjetaClase} data-testid="kpi-oportunidades">
          <span className={etiquetaClase}>Tasa de conversión</span>
          <div className={cifraGrandeClase}>{vista.oportunidades.tasaConversionTexto}</div>
          <div className={pieClase}>{vista.oportunidades.cohorteTexto}</div>
        </div>

        {/* KPI 4: Primera respuesta (Mediana protagonista, promedio en pie de cohorte) */}
        <div className={tarjetaClase} data-testid="kpi-respuesta">
          <span className={etiquetaClase}>Primera respuesta (mediana)</span>
          <div className={cifraGrandeClase}>{vista.respuesta.medianaTexto}</div>
          <div className={pieClase}>
            Promedio: {vista.respuesta.promedioTexto} · {vista.respuesta.cohorteTexto}
          </div>
        </div>
      </section>

      {/* Neto y margen: solo si el servidor los entregó (permiso) y se eligió vista dueño */}
      {puedeVerNetoYMargen && esDueño && (
        <section
          data-testid="seccion-margen-confidencial"
          className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-emerald-800 uppercase dark:text-emerald-300">
              Utilidad Bruta y Margen Real (venta − costo neto)
            </span>
            <span className="text-[11px] font-medium text-emerald-700/80 dark:text-emerald-400">
              Margen Comercial
            </span>
          </div>

          {!vista.hayConfidencial ? (
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{TEXTO_SIN_DATOS}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {vista.filasVentas.map((f) =>
                f.confidencial ? (
                  <li
                    key={f.moneda}
                    data-testid={`margen-${f.moneda}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs"
                  >
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      {f.moneda}
                    </span>
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Costo Neto Mayoristas:{' '}
                      <strong className="text-neutral-900 dark:text-white">
                        {f.confidencial.neto
                          ? formatearDinero(f.confidencial.neto)
                          : TEXTO_SIN_DATOS}
                      </strong>
                    </span>
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Margen Comercial:{' '}
                      <strong className="text-neutral-900 dark:text-white">
                        {f.confidencial.margen
                          ? formatearDinero(f.confidencial.margen)
                          : TEXTO_SIN_DATOS}
                      </strong>
                      {f.confidencial.margenPorcentaje !== null && (
                        <span className="ml-1 text-emerald-700 dark:text-emerald-400">
                          ({formatearPorcentajeReporte(f.confidencial.margenPorcentaje)})
                        </span>
                      )}
                    </span>
                    {f.confidencial.cotizacionesSinNeto > 0 && (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        ({f.confidencial.cotizacionesSinNeto}{' '}
                        {f.confidencial.cotizacionesSinNeto === 1
                          ? 'cotización sin costo neto'
                          : 'cotizaciones sin costo neto'}
                        )
                      </span>
                    )}
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </section>
      )}

      {/* Embudo de Oportunidades por Etapa */}
      {vista.oportunidades.porEtapa.length > 0 && (
        <section data-testid="embudo-periodo" className={`${tarjetaClase} space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-neutral-700 uppercase dark:text-neutral-300">
              Oportunidades por Etapa
            </h2>
            <span className="text-[11px] text-neutral-400">
              {vista.oportunidades.creadas} oportunidades en el periodo
            </span>
          </div>
          <div className="space-y-2">
            {vista.oportunidades.porEtapa.map((e) => {
              const porcentaje = Math.round((e.cantidad / maxEtapa) * 100);
              return (
                <div key={e.etapaId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-700 dark:text-neutral-300">{e.nombre}</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {e.cantidad}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
