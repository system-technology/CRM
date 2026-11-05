'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Lock, TrendingDown, TrendingUp } from 'lucide-react';
import type { ResumenDeReportes, TableroPipeline } from '@viajapro/contracts';
import { EsqueletoReportes } from '../comun/esqueletos';
import { formatearDinero, ZONA_HORARIA_COLOMBIA } from '../../lib/formato';
import { obtenerTableroPipeline } from '../../lib/crm-api';
import { ErrorReportesApi, obtenerResumenDeReportesApi } from '../../lib/reportes-api';
import {
  diasDelRango,
  rangoAnterior,
  rangoDePeriodo,
  type PeriodoDeReporte,
} from '../../lib/reportes-periodo';
import { prepararResumen, TEXTO_SIN_DATOS, type VistaDeResumen } from '../../lib/reportes-resumen';

interface Props {
  periodo: PeriodoDeReporte;
  /** Vista gerencial elegida por quien tiene el permiso. */
  esDueno: boolean;
  puedeVerNetoYMargen: boolean;
  /** Reloj inyectable para pruebas. */
  ahora?: () => Date;
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin-permiso' }
  | { tipo: 'error'; mensaje: string }
  | {
      tipo: 'listo';
      resumen: ResumenDeReportes;
      vista: VistaDeResumen;
      diasAnteriores: number | null;
    };

const tarjeta =
  'rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900';
const etiqueta = 'text-xs font-medium text-neutral-500 dark:text-neutral-400';
const cifraGrande = 'cifra mt-2 text-2xl font-extrabold text-neutral-900 dark:text-white';
const pie = 'mt-1 text-[11px] text-neutral-400 dark:text-neutral-500';

function fechaCorta(instante: number): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeZone: ZONA_HORARIA_COLOMBIA,
  }).format(new Date(instante));
}

export function ReportesReales({ periodo, esDueno, puedeVerNetoYMargen, ahora }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [tablero, setTablero] = useState<TableroPipeline | null>(null);
  const [intento, setIntento] = useState(0);

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' });
    setIntento((n) => n + 1);
  }, []);

  useEffect(() => {
    const control = new AbortController();
    const rango = rangoDePeriodo(periodo, (ahora ?? (() => new Date()))());
    const previo = rangoAnterior(rango);

    void (async () => {
      try {
        const [resumen, anterior] = await Promise.all([
          obtenerResumenDeReportesApi(rango, control.signal),
          // La variación es opcional: si esta segunda llamada falla, se muestra sin comparar.
          previo
            ? obtenerResumenDeReportesApi(previo, control.signal).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (control.signal.aborted) return;
        setEstado({
          tipo: 'listo',
          resumen,
          vista: prepararResumen(resumen, anterior),
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

    return () => control.abort();
  }, [periodo, intento, ahora]);

  // Foto actual del pipeline (no depende del periodo): se pide una vez, sin bloquear el reporte.
  useEffect(() => {
    let activo = true;
    obtenerTableroPipeline()
      .then((t) => {
        if (activo) setTablero(t);
      })
      .catch(() => {
        // La foto es complementaria: sin ella la sección simplemente no se muestra.
      });
    return () => {
      activo = false;
    };
  }, []);

  if (estado.tipo === 'cargando') return <EsqueletoReportes />;

  if (estado.tipo === 'sin-permiso') {
    return (
      <div
        role="alert"
        data-testid="reportes-sin-permiso"
        className={`${tarjeta} mx-auto flex max-w-md flex-col items-center gap-1 text-center text-xs`}
      >
        <Lock className="h-5 w-5 text-neutral-400" />
        <p className="font-semibold text-neutral-800 dark:text-neutral-100">
          No tienes permiso para ver los reportes.
        </p>
        <p className="text-neutral-500">Pide a un Dueño de la agencia que te habilite el acceso.</p>
      </div>
    );
  }

  if (estado.tipo === 'error') {
    return (
      <div
        role="alert"
        data-testid="reportes-error"
        className={`${tarjeta} mx-auto flex max-w-md flex-col items-center gap-2 text-center text-xs`}
      >
        <AlertTriangle className="h-5 w-5 text-rose-600" />
        <p className="font-semibold text-rose-800 dark:text-rose-300">
          No se pudo cargar el reporte.
        </p>
        <p className="text-neutral-600 dark:text-neutral-300">{estado.mensaje}</p>
        <button
          type="button"
          onClick={cargar}
          className="min-h-[44px] rounded-xl border border-neutral-300 px-4 py-2 font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { resumen, vista, diasAnteriores } = estado;
  const { cotizaciones, oportunidades, respuesta } = resumen;
  const sinActividad =
    cotizaciones.creadas === 0 &&
    cotizaciones.enviadas === 0 &&
    oportunidades.creadas === 0 &&
    respuesta.conversacionesNuevas === 0 &&
    respuesta.conversacionesRespondidas === 0 &&
    vista.filasDeVentas.length === 0;
  const maxEtapa = Math.max(1, ...oportunidades.porEtapa.map((e) => e.cantidad));
  const hasta = Date.parse(resumen.periodo.hasta) - 1;

  return (
    <div className="space-y-6" data-testid="reportes-reales">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Del {fechaCorta(Date.parse(resumen.periodo.desde))} al {fechaCorta(hasta)} (hora de
        Colombia).
      </p>

      {sinActividad && (
        <div
          data-testid="reportes-vacio"
          className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
        >
          Todavía no hay actividad registrada en este periodo. Cuando haya cotizaciones,
          oportunidades o conversaciones, aparecerán aquí.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Ventas: una fila por moneda, nunca sumadas entre monedas */}
        <div className={tarjeta} data-testid="kpi-ventas">
          <span className={etiqueta}>Ventas en el periodo</span>
          {vista.filasDeVentas.length === 0 ? (
            <div className={cifraGrande}>{TEXTO_SIN_DATOS}</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {vista.filasDeVentas.map((f) => (
                <li key={f.moneda} data-testid={`ventas-${f.moneda}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="cifra text-xl font-extrabold text-neutral-900 dark:text-white">
                      {formatearDinero(f.ventas)}
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-500">{f.moneda}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>{f.cotizacionesAceptadas} cotizaciones aceptadas</span>
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
            <div className={pie}>Variación contra los {diasAnteriores} días anteriores.</div>
          )}
        </div>

        <div className={tarjeta} data-testid="kpi-cotizaciones">
          <span className={etiqueta}>Tasa de aceptación</span>
          <div className={cifraGrande}>{vista.tasaAceptacion}</div>
          <div className={pie}>
            {cotizaciones.creadas} creadas · {cotizaciones.enviadas} enviadas ·{' '}
            {cotizaciones.aceptadas} aceptadas
          </div>
        </div>

        <div className={tarjeta} data-testid="kpi-oportunidades">
          <span className={etiqueta}>Tasa de conversión</span>
          <div className={cifraGrande}>{vista.tasaConversion}</div>
          <div className={pie}>
            {oportunidades.creadas} creadas · {oportunidades.ganadas} ganadas ·{' '}
            {oportunidades.perdidas} perdidas · {oportunidades.abiertas} abiertas
          </div>
        </div>

        <div className={tarjeta} data-testid="kpi-respuesta">
          <span className={etiqueta}>Primera respuesta (promedio)</span>
          <div className={cifraGrande}>{vista.promedioRespuesta}</div>
          <div className={pie}>
            Mediana: {vista.medianaRespuesta} · {respuesta.conversacionesRespondidas} de{' '}
            {respuesta.conversacionesNuevas} conversaciones nuevas respondidas
          </div>
        </div>
      </section>

      {/* Neto y margen: solo si el servidor los entregó (permiso) y se eligió la vista gerencial */}
      {puedeVerNetoYMargen && esDueno && (
        <section
          data-testid="seccion-margen-confidencial"
          className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        >
          <div className="text-xs font-bold text-emerald-800 uppercase dark:text-emerald-300">
            Utilidad bruta y margen real (venta − costo neto)
          </div>
          {!vista.hayConfidencial ? (
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{TEXTO_SIN_DATOS}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {vista.filasDeVentas.map((f) =>
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
                      Costo neto:{' '}
                      <span className="cifra font-semibold">
                        {f.confidencial.neto
                          ? formatearDinero(f.confidencial.neto)
                          : TEXTO_SIN_DATOS}
                      </span>
                    </span>
                    <span className="text-emerald-800 dark:text-emerald-400">
                      Margen
                      {f.confidencial.margenPorcentaje !== null
                        ? ` (${f.confidencial.margenPorcentaje} %)`
                        : ''}
                      :{' '}
                      <span className="cifra text-base font-extrabold">
                        {f.confidencial.margen
                          ? formatearDinero(f.confidencial.margen)
                          : TEXTO_SIN_DATOS}
                      </span>
                    </span>
                    {f.confidencial.cotizacionesSinNeto > 0 && (
                      <span className="text-[11px] text-neutral-500">
                        {f.confidencial.cotizacionesSinNeto} cotizaciones sin neto conocido
                      </span>
                    )}
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className={`${tarjeta} p-5`} data-testid="embudo-periodo">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
            Oportunidades creadas en el periodo, por etapa actual
          </h2>
          <div className="mt-4 space-y-3">
            {oportunidades.porEtapa.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-400">{TEXTO_SIN_DATOS}</div>
            ) : (
              oportunidades.porEtapa.map((e) => (
                <div key={e.etapaId}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {e.nombre}
                    </span>
                    <span className="cifra font-bold">{e.cantidad}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="bg-acento-600 h-full rounded-full"
                      style={{ width: `${Math.round((e.cantidad / maxEtapa) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`${tarjeta} p-5`} data-testid="foto-pipeline">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
            Foto actual del pipeline
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Oportunidades abiertas hoy por etapa; no depende del periodo elegido.
          </p>
          <div className="mt-4 space-y-2">
            {!tablero || tablero.columnas.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-400">{TEXTO_SIN_DATOS}</div>
            ) : (
              tablero.columnas.map((c) => (
                <div
                  key={c.etapa.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-100 p-2.5 text-xs dark:border-neutral-800"
                >
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {c.etapa.nombre}
                  </span>
                  <span className="cifra font-bold">{c.oportunidades.length}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section
        data-testid="reportes-pendientes-api"
        className="rounded-xl border border-dashed border-neutral-300 p-4 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
      >
        Ventas por destino y rendimiento por asesor: Aún sin datos. La API todavía no los entrega
        por periodo.
      </section>
    </div>
  );
}
