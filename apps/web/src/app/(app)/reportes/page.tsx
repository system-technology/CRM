'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Printer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AvisoReportesDeAdministracion } from '../../../components/comun/aviso-de-alcance';
import { EsqueletoReportes } from '../../../components/comun/esqueletos';
import { DashboardAdmin } from '../../../components/dashboard-admin/dashboard-admin';
import { formatearDinero, ZONA_HORARIA_COLOMBIA, formatearFecha } from '../../../lib/formato';
import { usePermisos } from '../../../lib/permisos';
import { useVistaDemo } from '../../../lib/vista-demo';
import { estaUsandoApiReal, obtenerPendientesDelDiaApi } from '../../../lib/crm-api';
import { MisNumeros, type SeguimientosDelAsesor } from '../../../components/reportes/mis-numeros';
import { tituloDeReportes, tituloDeReportesSinRespuesta } from '../../../lib/alcance-de-vista';
import {
  ErrorReportesApi,
  obtenerResumenDeReportesApi,
  obtenerZonaHorariaAgenciaApi,
} from '../../../lib/reportes-api';
import { diasDelRango, rangoAnterior } from '../../../lib/reportes-periodo';
import {
  convertirPeriodoAInstantesUtc,
  formatearPorcentajeReporte,
  N_MINIMO_TASA,
  obtenerEtiquetaPeriodo,
  TEXTO_SIN_DATOS,
  transformarResumenReporte,
  type RangoPeriodo,
  type VistaReporteResumen,
} from '../../../lib/reportes-logica';

import { TituloDePantalla } from '../../../components/comun/titulo-de-pantalla';
const PERIODOS: RangoPeriodo[] = ['este_mes', 'ultimos_30_dias', 'trimestre', 'ano'];

const tarjetaClase =
  'rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900';
const etiquetaClase = 'text-xs font-medium text-neutral-600 dark:text-neutral-400';
const cifraGrandeClase = 'cifra mt-2 text-2xl font-extrabold text-neutral-900 dark:text-white';
const pieClase = 'mt-1 text-[11px] text-neutral-600 dark:text-neutral-400';

function formatearFechaCorta(instanteIso: string, zona: string): string {
  const ts = Date.parse(instanteIso);
  if (Number.isNaN(ts)) return instanteIso;
  return formatearFecha(ts, { zona });
}

type EstadoReportes =
  | { tipo: 'cargando' }
  | { tipo: 'sin-permiso' }
  | { tipo: 'error'; mensaje: string }
  | {
      tipo: 'listo';
      vista: VistaReporteResumen;
      /** Lo decidió la respuesta de la API, no un permiso de la web (ADR-0035 §5). */
      alcance: 'PROPIO' | 'AGENCIA';
      diasAnteriores: number | null;
      seguimientos: SeguimientosDelAsesor | null;
    };

interface ReportesPageProps {
  /** Reloj inyectable para pruebas deterministas. */
  ahora?: () => Date;
}

function ReportesContenido({ ahora }: ReportesPageProps) {
  const { sesion } = usePermisos();
  // Solo demostración: qué alcance simular (la vista elegida en la insignia). Con la API real lo decide el servidor.
  const { vista: vistaDeLaDemo } = useVistaDemo();
  const alcanceDemo: 'PROPIO' | 'AGENCIA' = vistaDeLaDemo === 'asesor' ? 'PROPIO' : 'AGENCIA';
  // «Míos» filtra la vista de agencia; la API lo impone (un ajeno sin permiso responde 403).
  const [soloMios, setSoloMios] = useState(false);
  const [periodo, setPeriodo] = useState<RangoPeriodo>('este_mes');
  const [estado, setEstado] = useState<EstadoReportes>({ tipo: 'cargando' });
  const [intento, setIntento] = useState(0);
  // Zona IANA de la agencia (R9). `null` mientras se lee; si falla, respaldo a Bogotá.
  const [zonaAgencia, setZonaAgencia] = useState<string | null>(null);
  const zona = zonaAgencia ?? ZONA_HORARIA_COLOMBIA;

  const recargar = useCallback(() => {
    setEstado({ tipo: 'cargando' });
    setIntento((n) => n + 1);
  }, []);

  useEffect(() => {
    const control = new AbortController();
    void obtenerZonaHorariaAgenciaApi(control.signal).then((z) => {
      if (!control.signal.aborted) setZonaAgencia(z ?? ZONA_HORARIA_COLOMBIA);
    });
    return () => {
      control.abort();
    };
  }, []);

  useEffect(() => {
    // Los límites del periodo dependen de la zona: se espera a conocerla (el esqueleto sigue visible).
    if (zonaAgencia === null) return;
    const control = new AbortController();
    const reloj = ahora ? ahora() : new Date();
    const rango = convertirPeriodoAInstantesUtc(periodo, reloj, zonaAgencia);
    const previo = rangoAnterior(rango);
    const opciones = {
      ...(soloMios ? { asesorId: 'yo' } : {}),
      ...(!estaUsandoApiReal() ? { alcanceDemo } : {}),
    };

    void (async () => {
      try {
        const [resumen, anterior] = await Promise.all([
          obtenerResumenDeReportesApi(rango, control.signal, opciones),
          previo
            ? obtenerResumenDeReportesApi(previo, control.signal, opciones).catch(() => null)
            : Promise.resolve(null),
        ]);

        // Sus seguimientos: solo con la vista propia. Si falla, el bloque se omite (no se pintan ceros).
        const seguimientos: SeguimientosDelAsesor | null =
          resumen.alcance === 'PROPIO'
            ? await obtenerPendientesDelDiaApi('yo')
                .then((p) => ({ vencidos: p.vencidos.length, deHoy: p.deHoy.length }))
                .catch(() => null)
            : null;

        if (control.signal.aborted) return;

        setEstado({
          tipo: 'listo',
          vista: transformarResumenReporte(resumen, anterior),
          alcance: resumen.alcance,
          diasAnteriores: anterior ? diasDelRango(rango) : null,
          seguimientos,
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
  }, [periodo, intento, ahora, zonaAgencia, soloMios, alcanceDemo]);

  const vista = estado.tipo === 'listo' ? estado.vista : null;
  // Titular: la respuesta manda; antes de que llegue (o si falla), el permiso solo rotula.
  const alcance = estado.tipo === 'listo' ? estado.alcance : null;
  const tituloPantalla = alcance ? tituloDeReportes(alcance) : tituloDeReportesSinRespuesta(sesion);
  const puedeFiltrarAgencia = alcance === 'AGENCIA';

  return (
    <>
      {/* 2. Cuerpo Principal */}
      <div className="flex flex-1 flex-col bg-neutral-50 dark:bg-neutral-950">
        {/* Encabezado */}
        <header className="border-b border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-emerald-100 p-1.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <TituloDePantalla
                  modulo="reportes"
                  etiqueta={tituloPantalla}
                  className="text-xl font-bold text-neutral-900 dark:text-white"
                />
              </div>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                {vista
                  ? `Del ${formatearFechaCorta(vista.periodo.desde, zona)} al ${formatearFechaCorta(
                      new Date(Date.parse(vista.periodo.hasta) - 1).toISOString(),
                      zona,
                    )} (zona horaria: ${zona}).`
                  : alcance === 'PROPIO' || (!alcance && tituloPantalla === 'Mis números')
                    ? 'Tus cierres, cotizaciones, oportunidades y tiempos de respuesta.'
                    : 'Lectura ejecutiva de ventas, cuellos de botella en el embudo y tiempos de atención.'}
              </p>
            </div>

            {/* Controles de Vista y Período */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Ámbito: solo si la respuesta es de agencia (la API ya impone qué filas) */}
              {puedeFiltrarAgencia && (
                <div className="flex min-h-[44px] items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800">
                  <label htmlFor="reportes-ambito" className="sr-only">
                    Qué cifras ver
                  </label>
                  <select
                    id="reportes-ambito"
                    data-testid="reportes-ambito"
                    value={soloMios ? 'yo' : 'agencia'}
                    onChange={(e) => setSoloMios(e.target.value === 'yo')}
                    className="bg-transparent font-medium text-neutral-700 outline-hidden dark:text-neutral-200"
                  >
                    <option value="agencia">Toda la agencia</option>
                    <option value="yo">Míos</option>
                  </select>
                </div>
              )}

              {/* Selector de Período */}
              <div className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800">
                <Calendar className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <label htmlFor="reportes-periodo" className="sr-only">
                  Periodo
                </label>
                <select
                  id="reportes-periodo"
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
            <AvisoReportesDeAdministracion />
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
          ) : estado.alcance === 'PROPIO' ? (
            <MisNumeros
              vista={estado.vista}
              diasAnteriores={estado.diasAnteriores}
              seguimientos={estado.seguimientos}
            />
          ) : (
            <>
              <ReportesListo vista={estado.vista} diasAnteriores={estado.diasAnteriores} />
              {/* Comparación entre asesores, cobros y salidas (T-344). Solo con la respuesta de
                  agencia (la decide el servidor) y sin el filtro «Míos»: son cifras de toda la
                  agencia. Ventas, embudo y respuesta ya los pinta `ReportesListo`. */}
              {!soloMios && (
                <DashboardAdmin
                  periodo={periodo}
                  zona={zona}
                  bloques={['asesores', 'cobros', 'salidas', 'destinos']}
                  {...(ahora ? { ahora: ahora() } : {})}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

interface ReportesListoProps {
  vista: VistaReporteResumen;
  diasAnteriores: number | null;
}

function ReportesListo({ vista, diasAnteriores }: ReportesListoProps) {
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
          className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
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
                    <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      {f.moneda}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-600 dark:text-neutral-400">
                    <span>
                      {f.cotizacionesAceptadas}{' '}
                      {f.cotizacionesAceptadas === 1
                        ? 'cotización aceptada'
                        : 'cotizaciones aceptadas'}
                    </span>
                    {f.variacionPorcentaje !== null ? (
                      <span
                        className={`flex items-center gap-0.5 font-bold ${
                          f.variacionPorcentaje >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
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
          {vista.cotizaciones.aceptadasSinFecha > 0 && (
            <div data-testid="aviso-aceptadas-sin-fecha" className={pieClase}>
              {vista.cotizaciones.aceptadasSinFecha}{' '}
              {vista.cotizaciones.aceptadasSinFecha === 1
                ? 'cotización aceptada sin fecha de aceptación registrada no se incluye'
                : 'cotizaciones aceptadas sin fecha de aceptación registrada no se incluyen'}
              .
            </div>
          )}
          {diasAnteriores !== null && (
            <div className={pieClase}>Variación contra los {diasAnteriores} días anteriores.</div>
          )}
        </div>

        {/* KPI 2: Cotizaciones (Tasa de aceptación con cohorte explícita) */}
        <div className={tarjetaClase} data-testid="kpi-cotizaciones">
          <span className={etiquetaClase}>Tasa de aceptación</span>
          <div className={cifraGrandeClase}>{vista.cotizaciones.tasaAceptacionTexto}</div>
          <div className={pieClase}>
            Aceptadas / enviadas. Con menos de {N_MINIMO_TASA} enviadas no se muestra el porcentaje.
          </div>
          <div className={pieClase}>{vista.cotizaciones.cohorteTexto}</div>
        </div>

        {/* KPI 3: Oportunidades (Tasa de conversión con cohorte explícita) */}
        <div className={tarjetaClase} data-testid="kpi-oportunidades">
          <span className={etiquetaClase}>Tasa de victoria (cerradas)</span>
          <div className={cifraGrandeClase}>{vista.oportunidades.tasaConversionTexto}</div>
          <div className={pieClase}>
            Ganadas / (ganadas + perdidas) de las oportunidades creadas en el periodo. Con menos de{' '}
            {N_MINIMO_TASA} cerradas no se muestra el porcentaje.
          </div>
          <div className={pieClase}>{vista.oportunidades.cohorteTexto}</div>
        </div>

        {/* KPI 4: Primera respuesta (Mediana protagonista, promedio en pie de cohorte) */}
        <div className={tarjetaClase} data-testid="kpi-respuesta">
          <span className={etiquetaClase}>Primera respuesta (mediana)</span>
          <div className={cifraGrandeClase}>{vista.respuesta.medianaTexto}</div>
          <div className={pieClase}>
            {vista.respuesta.tasaRespuestaTexto} · de las conversaciones creadas en el periodo
          </div>
          <div className={pieClase}>
            p90: {vista.respuesta.p90Texto} · Promedio: {vista.respuesta.promedioTexto}
            {vista.respuesta.sinResponder > 0 && ` · ${vista.respuesta.sinResponder} sin responder`}
          </div>
        </div>
      </section>

      {/* Neto y margen: solo si el servidor los entregó (cotizacion.ver_neto_y_margen) */}
      {vista.hayConfidencial && (
        <section
          data-testid="seccion-margen-confidencial"
          className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              Margen cotizado (venta − costo neto)
            </span>
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              Sobre cotizaciones aceptadas, con el neto del tarifario; no son ventas cobradas.
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
                      <span
                        data-testid={`neto-base-${f.moneda}`}
                        className="text-[11px] text-amber-700 dark:text-amber-400"
                      >
                        Neto y margen calculados sobre {f.confidencial.cotizacionesConNeto} de{' '}
                        {f.cotizacionesAceptadas}{' '}
                        {f.cotizacionesAceptadas === 1
                          ? 'cotización aceptada'
                          : 'cotizaciones aceptadas'}{' '}
                        con neto ({f.confidencial.cotizacionesSinNeto} sin costo neto, no
                        incluidas).
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
            <h2 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Estado actual de las oportunidades creadas en el periodo
            </h2>
            <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
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

export default function ReportesPage({ ahora }: ReportesPageProps) {
  return (
    <Suspense fallback={<div aria-busy="true" className="min-h-64 flex-1" />}>
      <ReportesContenido {...(ahora ? { ahora } : {})} />
    </Suspense>
  );
}
