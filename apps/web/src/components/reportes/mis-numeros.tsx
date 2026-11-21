'use client';

/**
 * «Mis números» (T-343, ADR-0035 §5–§6): la vista de quien mira lo suyo, pensada para el celular.
 *
 * - Tarjetas apiladas con una lista de datos por tarjeta; nada de tablas anchas (390 px sin
 *   desplazamiento lateral).
 * - **Pinta lo que la API devolvió.** No suma, no deduce el alcance y no pide nada de la agencia:
 *   la rama `PROPIO` del contrato no trae claves ajenas, y aquí tampoco se inventan.
 * - Dinero por moneda, enteros en la unidad mínima (R8); nunca un total convertido.
 * - Porcentaje solo con `n ≥ 20`; debajo, la fracción («2 de 6»).
 */
import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, TrendingDown, TrendingUp } from 'lucide-react';
import { formatearDinero } from '../../lib/formato';
import type { VistaReporteResumen } from '../../lib/reportes-logica';
import { formatearPorcentajeReporte, TEXTO_SIN_DATOS } from '../../lib/reportes-logica';
import { plural } from '../../lib/mis-numeros-logica';
import { CotizacionesAbiertasPorAntiguedad, SaldoPorCobrarPorMoneda } from './cifras-de-hoy';

export interface SeguimientosDelAsesor {
  vencidos: number;
  deHoy: number;
}

interface Props {
  vista: VistaReporteResumen;
  /** Días del periodo anterior con el que se compara; `null` si no hubo comparación. */
  diasAnteriores: number | null;
  /** `null` si no se pudo leer: el bloque se omite en lugar de mostrar ceros que mienten. */
  seguimientos: SeguimientosDelAsesor | null;
}

const tarjeta =
  'rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900';
const titulo = 'text-sm font-bold text-neutral-900 dark:text-neutral-100';
const fila =
  'flex items-baseline justify-between gap-3 border-t border-neutral-100 py-2 first:border-t-0 dark:border-neutral-800';
const rotulo = 'text-xs text-neutral-600 dark:text-neutral-400';
const valor = 'cifra text-right text-sm font-semibold text-neutral-900 dark:text-white';

function Variacion({ porcentaje }: { porcentaje: number | null }) {
  if (porcentaje === null) {
    return <span className="text-xs text-neutral-500">Sin comparación</span>;
  }
  const sube = porcentaje >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        sube ? 'text-ok-700' : 'text-alerta-700'
      }`}
    >
      <Icono className="h-3.5 w-3.5" aria-hidden="true" />
      {sube ? 'Subió' : 'Bajó'} {Math.abs(porcentaje)} %
    </span>
  );
}

export function MisNumeros({ vista, diasAnteriores, seguimientos }: Props) {
  const { cotizaciones, oportunidades, respuesta } = vista;
  const sinActividad =
    cotizaciones.creadas === 0 &&
    cotizaciones.enviadas === 0 &&
    oportunidades.creadas === 0 &&
    respuesta.conversacionesNuevas === 0 &&
    vista.filasVentas.length === 0;

  return (
    <div className="space-y-4" data-testid="mis-numeros">
      {sinActividad && (
        <div
          data-testid="mis-numeros-vacio"
          className="rounded-xl border border-dashed border-neutral-300 p-5 text-center dark:border-neutral-700"
        >
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Aún no hay movimiento tuyo en este periodo
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Tus cotizaciones, oportunidades y conversaciones aparecerán aquí en cuanto las trabajes.
          </p>
          <Link
            href="/cotizador"
            className="boton-primario mt-3 inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Nueva cotización
          </Link>
        </div>
      )}

      {seguimientos && (
        <section
          aria-labelledby="mn-atencion"
          data-testid="mis-numeros-atencion"
          className={`${tarjeta} ${seguimientos.vencidos > 0 ? 'border-alerta-600/50' : ''}`}
        >
          <h2 id="mn-atencion" className={titulo}>
            Pide tu atención
          </h2>
          <dl className="mt-2">
            <div className={fila}>
              <dt className={rotulo}>Seguimientos vencidos</dt>
              <dd
                className={`${valor} ${seguimientos.vencidos > 0 ? 'text-alerta-700 dark:text-alerta-600' : ''}`}
                data-testid="mn-seguimientos-vencidos"
              >
                {seguimientos.vencidos > 0 && (
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                )}
                {seguimientos.vencidos}
              </dd>
            </div>
            <div className={fila}>
              <dt className={rotulo}>Seguimientos para hoy</dt>
              <dd className={valor} data-testid="mn-seguimientos-hoy">
                <CalendarClock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {seguimientos.deHoy}
              </dd>
            </div>
          </dl>
          <Link
            href="/seguimientos"
            className="text-acento-700 dark:text-acento-400 mt-2 inline-flex min-h-[44px] items-center text-xs font-semibold hover:underline"
          >
            Abrir mis seguimientos
          </Link>
        </section>
      )}

      {vista.cotizacionesAbiertas && (
        <section
          aria-labelledby="mn-abiertas"
          data-testid="mis-numeros-abiertas"
          className={tarjeta}
        >
          <h2 id="mn-abiertas" className={titulo}>
            Mis cotizaciones abiertas hoy
          </h2>
          <p className="mb-2 text-xs text-neutral-500">
            Es el estado de hoy, no del periodo: borradores y enviadas que aún esperan respuesta.
          </p>
          <CotizacionesAbiertasPorAntiguedad datos={vista.cotizacionesAbiertas} />
          <Link
            href="/cotizaciones"
            className="text-acento-700 dark:text-acento-400 mt-2 inline-flex min-h-[44px] items-center text-xs font-semibold hover:underline"
          >
            Abrir mis cotizaciones
          </Link>
        </section>
      )}

      {vista.porCobrar && (
        <section
          aria-labelledby="mn-por-cobrar"
          data-testid="mis-numeros-por-cobrar"
          className={tarjeta}
        >
          <h2 id="mn-por-cobrar" className={titulo}>
            Por cobrar hoy
          </h2>
          <p className="mb-2 text-xs text-neutral-500">
            Saldo de tus archivos de viaje abiertos, por moneda.
          </p>
          <SaldoPorCobrarPorMoneda datos={vista.porCobrar} />
        </section>
      )}

      <section aria-labelledby="mn-cierres" data-testid="mis-numeros-cierres" className={tarjeta}>
        <h2 id="mn-cierres" className={titulo}>
          Mis cierres del periodo
        </h2>
        {vista.filasVentas.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            Sin cierres en este periodo.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {vista.filasVentas.map((f) => (
              <li
                key={f.moneda}
                data-testid={`mn-ventas-${f.moneda}`}
                className="border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0 dark:border-neutral-800"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="cifra text-xl font-extrabold text-neutral-900 dark:text-white">
                    {formatearDinero(f.ventas)}
                  </span>
                  <span className="text-xs font-semibold text-neutral-600">{f.moneda}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">
                    {plural(
                      f.cotizacionesAceptadas,
                      'cotización aceptada',
                      'cotizaciones aceptadas',
                    )}
                  </span>
                  {diasAnteriores !== null && <Variacion porcentaje={f.variacionPorcentaje} />}
                </div>
                {f.confidencial && (
                  <p
                    data-testid={`mn-margen-${f.moneda}`}
                    className="mt-1 text-xs text-neutral-600"
                  >
                    Margen de tus cotizaciones:{' '}
                    <strong className="text-neutral-900 dark:text-white">
                      {f.confidencial.margen
                        ? formatearDinero(f.confidencial.margen)
                        : TEXTO_SIN_DATOS}
                    </strong>
                    {f.confidencial.margenPorcentaje !== null &&
                      ` (${formatearPorcentajeReporte(f.confidencial.margenPorcentaje)})`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {cotizaciones.aceptadasSinFecha > 0 && (
          <p className="mt-2 text-xs text-neutral-600" data-testid="mn-sin-fecha">
            {plural(
              cotizaciones.aceptadasSinFecha,
              'cotización aceptada no tiene fecha de aceptación y no entra en el periodo',
              'cotizaciones aceptadas no tienen fecha de aceptación y no entran en el periodo',
            )}
            .
          </p>
        )}
        {diasAnteriores !== null && (
          <p className="mt-2 text-xs text-neutral-500">
            Comparado con los {diasAnteriores} días anteriores.
          </p>
        )}
      </section>

      <section aria-labelledby="mn-cotizaciones" className={tarjeta}>
        <h2 id="mn-cotizaciones" className={titulo}>
          Mis cotizaciones
        </h2>
        <dl className="mt-2" data-testid="mn-cotizaciones">
          <div className={fila}>
            <dt className={rotulo}>Creadas en el periodo</dt>
            <dd className={valor}>{cotizaciones.creadas}</dd>
          </div>
          <div className={fila}>
            <dt className={rotulo}>Enviadas en el periodo</dt>
            <dd className={valor}>{cotizaciones.enviadas}</dd>
          </div>
          <div className={fila}>
            <dt className={rotulo}>Aceptadas de las enviadas</dt>
            <dd className={valor} data-testid="mn-tasa-aceptacion">
              {cotizaciones.tasaAceptacionTexto}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="mn-oportunidades" className={tarjeta}>
        <h2 id="mn-oportunidades" className={titulo}>
          Mis oportunidades
        </h2>
        <dl className="mt-2" data-testid="mn-oportunidades">
          <div className={fila}>
            <dt className={rotulo}>Abiertas (de las creadas en el periodo)</dt>
            <dd className={valor}>{oportunidades.abiertas}</dd>
          </div>
          <div className={fila}>
            <dt className={rotulo}>Ganadas</dt>
            <dd className={valor}>{oportunidades.ganadas}</dd>
          </div>
          <div className={fila}>
            <dt className={rotulo}>Perdidas</dt>
            <dd className={valor}>{oportunidades.perdidas}</dd>
          </div>
          <div className={fila}>
            <dt className={rotulo}>Ganadas de las cerradas</dt>
            <dd className={valor} data-testid="mn-tasa-conversion">
              {oportunidades.tasaConversionTexto}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="mn-respuesta" className={tarjeta}>
        <h2 id="mn-respuesta" className={titulo}>
          Mi primera respuesta
        </h2>
        <dl className="mt-2" data-testid="mn-respuesta">
          <div className={fila}>
            <dt className={rotulo}>Tiempo típico (mediana)</dt>
            <dd className={valor}>{respuesta.medianaTexto}</dd>
          </div>
          <div className={fila}>
            <dt className={rotulo}>Conversaciones nuevas respondidas</dt>
            <dd className={valor}>
              {respuesta.conversacionesRespondidas} de {respuesta.conversacionesNuevas}
            </dd>
          </div>
          {respuesta.sinResponder > 0 && (
            <div className={fila}>
              <dt className={rotulo}>Sin responder</dt>
              <dd className={valor}>{respuesta.sinResponder}</dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
