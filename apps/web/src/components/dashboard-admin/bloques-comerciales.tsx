'use client';

/**
 * Bloques comerciales del dashboard de administración (T-344): ventas por moneda, embudo con
 * cotizaciones y tiempos de respuesta. Todos pintan lo que la API devolvió, con la comparación
 * contra el periodo anterior del mismo largo (ADR-0035 §5).
 */
import React from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { ResumenDeReportes } from '@viajapro/contracts';
import { formatearDinero } from '../../lib/formato';
import {
  barrasDelEmbudo,
  compararVentasPorMoneda,
  presentarP90,
  presentarTasa,
  sentidoDeVariacion,
  textoDeVariacion,
  type FilaDeVentasComparada,
} from '../../lib/dashboard-admin-logica';
import { calcularVariacionPorcentual, formatearMinutosReporte } from '../../lib/reportes-logica';

export interface ParDeResumenes {
  actual: ResumenDeReportes;
  /** `null` si no se pudo pedir el anterior: se compara contra nada, y se dice. */
  anterior: ResumenDeReportes | null;
  /** Rótulo del periodo anterior, ya en texto («1–31 oct»). */
  etiquetaAnterior: string;
}

const etiqueta = 'text-xs font-medium text-neutral-600 dark:text-neutral-400';
const cifra = 'cifra text-2xl font-extrabold text-neutral-900 dark:text-white';

/** Texto + icono + color: nunca solo color. */
export function Variacion({ variacion, contra }: { variacion: number | null; contra: string }) {
  const sentido = sentidoDeVariacion(variacion);
  const Icono = sentido === 'sube' ? TrendingUp : sentido === 'baja' ? TrendingDown : Minus;
  const color =
    sentido === 'sube'
      ? 'text-ok-700'
      : sentido === 'baja'
        ? 'text-aviso-700'
        : 'text-neutral-600 dark:text-neutral-400';
  return (
    <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 text-xs ${color}`}>
      <Icono aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="font-semibold">{textoDeVariacion(variacion)}</span>
      <span className="text-neutral-600 dark:text-neutral-400">{contra}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// Ventas por moneda
// ---------------------------------------------------------------------------------------------

function TarjetaDeMoneda({ fila, contra }: { fila: FilaDeVentasComparada; contra: string }) {
  return (
    <li
      className="min-w-0 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
      data-testid={`ventas-${fila.moneda}`}
    >
      <p className={etiqueta}>Ventas en {fila.moneda}</p>
      <p className={`${cifra} mt-1 break-words`}>
        {formatearDinero(fila.ventas, { conCodigo: true })}
      </p>
      <p className="mt-0.5 text-xs text-neutral-700 dark:text-neutral-300">
        {fila.cotizacionesAceptadas === 1
          ? '1 venta cerrada'
          : `${fila.cotizacionesAceptadas} ventas cerradas`}
      </p>
      <Variacion variacion={fila.variacion} contra={contra} />
      {fila.anterior ? (
        <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
          Antes: {formatearDinero(fila.anterior, { conCodigo: true })}
        </p>
      ) : null}
      {fila.tieneMargen ? (
        <dl
          className="mt-2 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-800"
          aria-label={`Margen en ${fila.moneda}`}
        >
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600 dark:text-neutral-400">Margen</dt>
            <dd className="cifra font-semibold text-neutral-900 dark:text-white">
              {fila.margen
                ? `${formatearDinero(fila.margen, { conCodigo: true })}${
                    fila.margenPorcentaje !== null
                      ? ` · ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(fila.margenPorcentaje)} %`
                      : ''
                  }`
                : 'Sin neto conocido'}
            </dd>
          </div>
          {fila.cotizacionesSinNeto > 0 ? (
            <div className="mt-0.5 flex justify-between gap-2">
              <dt className="text-neutral-600 dark:text-neutral-400">Sin neto cargado</dt>
              <dd>
                {fila.cotizacionesSinNeto === 1
                  ? '1 cotización'
                  : `${fila.cotizacionesSinNeto} cotizaciones`}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}

export function VentasPorMoneda({ datos }: { datos: ParDeResumenes }) {
  const filas = compararVentasPorMoneda(
    datos.actual.ventasPorMoneda,
    datos.anterior ? datos.anterior.ventasPorMoneda : null,
  );
  if (filas.length === 0) {
    return (
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        Aún no hay ventas cerradas en este periodo. Cuando una cotización pase a Aceptada, aparece
        aquí por moneda.
      </p>
    );
  }
  const contra = datos.anterior ? `frente a ${datos.etiquetaAnterior}` : 'sin periodo anterior';
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filas.map((f) => (
        <TarjetaDeMoneda key={f.moneda} fila={f} contra={contra} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// Embudo y cotizaciones
// ---------------------------------------------------------------------------------------------

function deConteo(actual: number, anterior: number | undefined): number | null {
  return anterior === undefined ? null : calcularVariacionPorcentual(actual, anterior);
}

export function EmbudoYCotizaciones({ datos }: { datos: ParDeResumenes }) {
  const { actual, anterior } = datos;
  const barras = barrasDelEmbudo(actual.oportunidades.porEtapa);
  const o = actual.oportunidades;
  const c = actual.cotizaciones;
  const cerradas = o.ganadas + o.perdidas;
  const conversion = presentarTasa(o.ganadas, cerradas, o.tasaConversion);
  const aceptacion = presentarTasa(c.aceptadas, c.enviadas, c.tasaAceptacion);

  return (
    <div className="space-y-4">
      {barras.length === 0 ? (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Aún no hay etapas ni oportunidades en este periodo.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Oportunidades por etapa">
          {barras.map((b) => (
            <li key={b.etapaId} data-testid="etapa-embudo">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-neutral-800 dark:text-neutral-200">
                  {b.nombre}
                </span>
                <span className="cifra shrink-0 font-semibold text-neutral-900 dark:text-white">
                  {b.cantidad}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
              >
                <div
                  className={`h-full rounded-full ${
                    b.esGanada ? 'bg-ok-600' : b.esPerdida ? 'bg-neutral-400' : 'bg-acento-600'
                  }`}
                  style={{ width: `${b.anchoPorciento}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
        <div>
          <dt className={etiqueta}>Ganadas de las cerradas</dt>
          <dd className="cifra mt-0.5 font-semibold text-neutral-900 dark:text-white">
            {conversion.texto}
          </dd>
          {conversion.esPorcentaje ? (
            <dd className="text-xs text-neutral-600 dark:text-neutral-400">
              {conversion.fraccion}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className={etiqueta}>Cotizaciones aceptadas</dt>
          <dd className="cifra mt-0.5 font-semibold text-neutral-900 dark:text-white">
            {aceptacion.texto}
          </dd>
          <dd className="text-xs text-neutral-600 dark:text-neutral-400">
            {aceptacion.esPorcentaje ? `${aceptacion.fraccion} enviadas` : 'enviadas'}
          </dd>
        </div>
        <div>
          <dt className={etiqueta}>Cotizaciones enviadas</dt>
          <dd className="cifra mt-0.5 font-semibold text-neutral-900 dark:text-white">
            {c.enviadas}
          </dd>
          <dd>
            <Variacion
              variacion={deConteo(c.enviadas, anterior?.cotizaciones.enviadas)}
              contra={anterior ? `frente a ${datos.etiquetaAnterior}` : 'sin periodo anterior'}
            />
          </dd>
        </div>
        <div>
          <dt className={etiqueta}>Oportunidades nuevas</dt>
          <dd className="cifra mt-0.5 font-semibold text-neutral-900 dark:text-white">
            {o.creadas}
          </dd>
          <dd>
            <Variacion
              variacion={deConteo(o.creadas, anterior?.oportunidades.creadas)}
              contra={anterior ? `frente a ${datos.etiquetaAnterior}` : 'sin periodo anterior'}
            />
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tiempos de respuesta
// ---------------------------------------------------------------------------------------------

function textoDeDiferenciaDeMediana(
  actual: number | null,
  anterior: number | null | undefined,
): { texto: string; sentido: 'sube' | 'baja' | 'igual' | 'sin-base' } {
  if (actual === null || anterior === null || anterior === undefined) {
    return { texto: 'Sin base para comparar', sentido: 'sin-base' };
  }
  const dif = Math.round((actual - anterior) * 10) / 10;
  if (dif === 0) return { texto: 'Igual que el periodo anterior', sentido: 'igual' };
  const cifra = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(Math.abs(dif));
  // Responder más rápido es mejor: la mediana BAJA.
  return dif < 0
    ? { texto: `${cifra} min más rápido`, sentido: 'baja' }
    : { texto: `${cifra} min más lento`, sentido: 'sube' };
}

export function TiemposDeRespuesta({ datos }: { datos: ParDeResumenes }) {
  const r = datos.actual.respuesta;
  if (r.conversacionesNuevas === 0) {
    return (
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        No entró ninguna conversación nueva en este periodo.
      </p>
    );
  }
  const respondidas = presentarTasa(
    r.conversacionesRespondidas,
    r.conversacionesNuevas,
    r.tasaRespuesta ?? null,
  );
  const dif = textoDeDiferenciaDeMediana(
    r.medianaMinutos,
    datos.anterior?.respuesta.medianaMinutos,
  );
  const Icono = dif.sentido === 'baja' ? TrendingDown : dif.sentido === 'sube' ? TrendingUp : Minus;
  const color =
    dif.sentido === 'baja'
      ? 'text-ok-700'
      : dif.sentido === 'sube'
        ? 'text-aviso-700'
        : 'text-neutral-600 dark:text-neutral-400';
  const sinResponder = r.sinResponder ?? r.conversacionesNuevas - r.conversacionesRespondidas;

  return (
    <div>
      <p className={etiqueta}>Mediana de la primera respuesta</p>
      <p className={`${cifra} mt-1`}>{formatearMinutosReporte(r.medianaMinutos)}</p>
      <p className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs ${color}`}>
        <Icono aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="font-semibold">{dif.texto}</span>
        {dif.sentido !== 'sin-base' ? (
          <span className="text-neutral-600 dark:text-neutral-400">
            frente a {datos.etiquetaAnterior}
          </span>
        ) : null}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
        <div>
          <dt className={etiqueta}>Promedio</dt>
          <dd className="cifra mt-0.5 font-semibold">
            {formatearMinutosReporte(r.promedioMinutos)}
          </dd>
        </div>
        <div>
          <dt className={etiqueta}>El 10 % más lento (p90)</dt>
          <dd className="cifra mt-0.5 font-semibold">
            {presentarP90(r.p90Minutos, r.conversacionesRespondidas)}
          </dd>
        </div>
        <div>
          <dt className={etiqueta}>Conversaciones respondidas</dt>
          <dd className="cifra mt-0.5 font-semibold">{respondidas.texto}</dd>
          {respondidas.esPorcentaje ? (
            <dd className="text-xs text-neutral-600 dark:text-neutral-400">
              {respondidas.fraccion} nuevas
            </dd>
          ) : null}
        </div>
        <div>
          <dt className={etiqueta}>Sin responder</dt>
          <dd className={`cifra mt-0.5 font-semibold ${sinResponder > 0 ? 'text-aviso-700' : ''}`}>
            {sinResponder}
          </dd>
        </div>
      </dl>
    </div>
  );
}
