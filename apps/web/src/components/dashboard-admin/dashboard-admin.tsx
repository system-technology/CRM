'use client';

/**
 * Dashboard de administración (T-344, ADR-0035 §5 y §6). Autocontenido: pide sus propios datos y
 * no sabe en qué pantalla vive (el marco de «Reportes» lo monta cuando la respuesta trae
 * `alcance: 'AGENCIA'`).
 *
 * **Pinta lo que la API devuelve.** No lee permisos: si la respuesta dice `PROPIO`, muestra el
 * aviso de administración; si no trae margen, no hay margen.
 *
 * **Orden.** Escritorio: ventas → embudo y respuesta → asesores → cobros y salidas. Móvil, donde
 * el administrador abre esto para decidir qué hacer hoy: cobros → salidas → ventas → embudo →
 * respuesta → asesores → destinos.
 */
import React, { useMemo, useState } from 'react';
import { formatearFecha, ZONA_HORARIA_COLOMBIA } from '../../lib/formato';
import { filasDeAsesores, hoyEnZona } from '../../lib/dashboard-admin-logica';
import {
  obtenerResumenDeAgenciaApi,
  obtenerResumenesDeAsesoresApi,
  obtenerVistaDeCobrosApi,
} from '../../lib/dashboard-admin-api';
import { TEXTO_REPORTES_SOLO_ADMINISTRACION } from '../../lib/alcance-de-vista';
import { rangoAnterior, rangoDePeriodo, type PeriodoDeReporte } from '../../lib/reportes-periodo';
import { Bloque, useCarga } from './bloque';
import {
  EmbudoYCotizaciones,
  TiemposDeRespuesta,
  VentasPorMoneda,
  type ParDeResumenes,
} from './bloques-comerciales';
import { ComparacionDeAsesores } from './comparacion-de-asesores';
import { CobrosPorCobrar, DestinosAbiertos, SalidasProximas } from './bloques-de-cobros';

export interface DashboardAdminProps {
  /** Por defecto, el mes calendario en curso (ADR-0035 pregunta 7). */
  periodo?: PeriodoDeReporte;
  /** Zona IANA de la agencia (R9). */
  zona?: string;
  /** Solo para pruebas y capturas. */
  ahora?: Date;
}

function rotuloDeRango(desde: string, hasta: string, zona: string): string {
  // `hasta` es exclusivo: el último día incluido es un instante antes.
  const ultimo = Date.parse(hasta) - 1;
  return `${formatearFecha(Date.parse(desde), { zona })} – ${formatearFecha(ultimo, { zona })}`;
}

export function DashboardAdmin({
  periodo = 'este_mes',
  zona = ZONA_HORARIA_COLOMBIA,
  ahora: ahoraProp,
}: DashboardAdminProps) {
  const [ahoraInicial] = useState(() => new Date());
  const ahora = ahoraProp ?? ahoraInicial;
  const clave = `${periodo}|${zona}|${ahora.toISOString().slice(0, 10)}`;

  const rango = useMemo(() => rangoDePeriodo(periodo, ahora, zona), [periodo, ahora, zona]);
  const previo = useMemo(() => rangoAnterior(rango), [rango]);
  const hoy = hoyEnZona(ahora, zona);

  const [resumen, reintentarResumen] = useCarga<ParDeResumenes>(async (senal) => {
    const [actual, anterior] = await Promise.all([
      obtenerResumenDeAgenciaApi(rango, undefined, senal),
      previo
        ? obtenerResumenDeAgenciaApi(previo, undefined, senal).catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            // El periodo anterior es un adorno de la comparación: sin él se dice «sin base».
            return null;
          })
        : Promise.resolve(null),
    ]);
    return {
      actual,
      anterior,
      etiquetaAnterior: previo ? rotuloDeRango(previo.desde, previo.hasta, zona) : '',
    };
  }, clave);

  const [asesores, reintentarAsesores] = useCarga(async (senal) => {
    const { filas, recortado } = await obtenerResumenesDeAsesoresApi(rango, senal);
    return { filas: filasDeAsesores(filas), recortado };
  }, clave);

  const [cobros, reintentarCobros] = useCarga(
    async (senal) => obtenerVistaDeCobrosApi(ahora, senal),
    clave,
  );

  // El servidor contestó «solo lo tuyo» (o 403): esta pantalla no es para quien la pide.
  if (
    resumen.estado === 'sin-permiso' ||
    (resumen.estado === 'error' && resumen.codigo === 'ALCANCE_PROPIO')
  ) {
    return (
      <div
        role="status"
        data-testid="dashboard-administracion-sin-alcance"
        className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">
          {TEXTO_REPORTES_SOLO_ADMINISTRACION.titulo}
        </p>
        <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
          {TEXTO_REPORTES_SOLO_ADMINISTRACION.detalle}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="dashboard-administracion" className="space-y-3">
      <p className="text-xs text-neutral-700 dark:text-neutral-300" data-testid="rotulo-periodo">
        {rotuloDeRango(rango.desde, rango.hasta, zona)}
        {previo ? ` · comparado con ${rotuloDeRango(previo.desde, previo.hasta, zona)}` : ''}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Bloque
          id="ventas"
          titulo="Ventas cerradas por moneda"
          nota="Cotizaciones que pasaron a Aceptada en el periodo. Cada moneda va aparte."
          carga={resumen}
          reintentar={reintentarResumen}
          className="order-3 lg:order-1 lg:col-span-12"
        >
          {(d) => <VentasPorMoneda datos={d} />}
        </Bloque>

        <Bloque
          id="embudo"
          titulo="Embudo y cotizaciones"
          nota="Oportunidades creadas en el periodo, en la etapa en que están hoy."
          carga={resumen}
          reintentar={reintentarResumen}
          className="order-4 lg:order-2 lg:col-span-7"
        >
          {(d) => <EmbudoYCotizaciones datos={d} />}
        </Bloque>

        <Bloque
          id="respuesta"
          titulo="Tiempos de respuesta"
          nota="Desde el primer mensaje del viajero hasta la primera respuesta."
          carga={resumen}
          reintentar={reintentarResumen}
          className="order-5 lg:order-3 lg:col-span-5"
        >
          {(d) => <TiemposDeRespuesta datos={d} />}
        </Bloque>

        <Bloque
          id="asesores"
          titulo="Comparación entre asesores"
          nota="Ordenados por ventas cerradas en el periodo."
          carga={asesores}
          reintentar={reintentarAsesores}
          className="order-6 lg:order-4 lg:col-span-12"
        >
          {(d) => <ComparacionDeAsesores filas={d.filas} recortado={d.recortado} />}
        </Bloque>

        <Bloque
          id="cobros"
          titulo="Por cobrar"
          nota="Saldo de los archivos abiertos, hoy."
          carga={cobros}
          reintentar={reintentarCobros}
          className="order-1 lg:order-5 lg:col-span-5"
        >
          {(d) => <CobrosPorCobrar datos={d} />}
        </Bloque>

        <Bloque
          id="salidas"
          titulo="Salen pronto"
          nota="Archivos abiertos con salida en los próximos 30 días."
          carga={cobros}
          reintentar={reintentarCobros}
          className="order-2 lg:order-6 lg:col-span-7"
        >
          {(d) => <SalidasProximas datos={d} hoy={hoy} />}
        </Bloque>

        <Bloque
          id="destinos"
          titulo="Destinos de los archivos abiertos"
          nota="Lo vendido en lo que sigue abierto; no son las ventas del periodo."
          carga={cobros}
          reintentar={reintentarCobros}
          className="order-7 lg:order-7 lg:col-span-12"
        >
          {(d) => <DestinosAbiertos datos={d} />}
        </Bloque>
      </div>
    </div>
  );
}
