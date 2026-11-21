/**
 * Lógica pura del módulo de Reportes y agregados ejecutivos (ADR-0011, T-142).
 *
 * Reglas:
 * - El periodo elegido se convierte en instantes UTC desde/hasta con la zona horaria
 *   de la agencia (hasta exclusivo).
 * - Una tarjeta por moneda de ventasPorMoneda: ninguna cifra suma monedas ni asume COP (R8).
 * - Se elimina calcularReporteDesdePipeline y el cálculo truncado a 20 tarjetas del tablero.
 * - null se pinta como «Aún sin datos» (o «Sin datos»), nunca como 0 o 0 %.
 * - Cohorte explícita de cada cifra y protagonismo de la mediana en tiempos de respuesta.
 * - Margen y neto solo si vienen en la respuesta (bajo permiso cotizacion.ver_neto_y_margen).
 */

import type { Dinero, ResumenDeReportes } from '@viajapro/contracts';
import { rangoDePeriodo, type PeriodoDeReporte, type RangoDeInstantes } from './reportes-periodo';
import { ZONA_HORARIA_COLOMBIA } from './formato';

export type RangoPeriodo = PeriodoDeReporte;
export type RolVistaReporte = 'DUENO' | 'ASESOR';

/** @deprecated Tipos legados para compatibilidad de tipos mock existentes */
export interface VentaPorDestino {
  destino: string;
  totalVentas: Dinero;
  porcentaje: number;
  paquetesVendidos: number;
}

export interface EtapaConversion {
  etapaId: string;
  nombre: string;
  cantidad: number;
  porcentajeEmbudo: number;
}

export interface RendimientoAsesor {
  asesorId: string;
  nombre: string;
  correo: string | null;
  avatar: string;
  conversaciones: number | null;
  oportunidadesGanadas: number;
  totalVentas: Dinero;
  tiempoRespuestaMinutos: number | null;
}

export interface ReporteComercial {
  periodo: RangoPeriodo;
  ventasTotales: Dinero | null;
  ventasPeriodoAnterior: Dinero | null;
  cambioVentasPorcentaje: number | null;
  oportunidadesCreadas: number;
  oportunidadesPeriodoAnterior: number | null;
  cambioOportunidadesPorcentaje: number | null;
  oportunidadesGanadas: number;
  oportunidadesPerdidas: number;
  tasaConversion: number | null;
  tasaConversionPeriodoAnterior?: number | null;
  tiempoRespuestaPromedioMinutos: number | null;
  tiempoRespuestaPeriodoAnteriorMinutos?: number | null;
  costoNetoTotal: Dinero | null;
  margenTotal: Dinero | null;
  margenPorcentaje: number | null;
  metaMesVentas: Dinero | null;
  porcentajeMetaMes: number | null;
  ventasPorDestino: VentaPorDestino[];
  conversionPorEtapa: EtapaConversion[];
  rendimientoAsesores: RendimientoAsesor[];
  tieneDatosReales: boolean;
}

export const TEXTO_SIN_DATOS = 'Aún sin datos';

/**
 * Denominador mínimo para mostrar una tasa como porcentaje (T-184). Con menos casos
 * cerrados/enviados el porcentaje engaña (1 ganada y 0 perdidas = 100 %), así que se
 * muestra «n insuficiente (n = X)». Es política de presentación, no de dominio.
 */
export const N_MINIMO_TASA = 20;

/** Texto de una tasa junto a su denominador: porcentaje solo si n alcanza el mínimo. */
export function formatearTasaConN(valor: number | null, n: number, numerador?: number): string {
  if (valor === null || n <= 0) return TEXTO_SIN_DATOS;
  // Bajo el mínimo no hay porcentaje, pero sí la fracción: «7 de 15» dice la verdad (ADR-0035 §5).
  if (n < N_MINIMO_TASA)
    return numerador === undefined ? `n insuficiente (n = ${n})` : `${numerador} de ${n}`;
  return `${formatearPorcentajeReporte(valor)} (n = ${n})`;
}

/**
 * «X de Y respondidas (Z %)». Numerador y denominador son del mismo grupo (las conversaciones
 * creadas en el periodo). Con menos de `N_MINIMO_TASA` conversaciones no se muestra el porcentaje.
 */
export function formatearTasaDeRespuesta(
  respondidas: number,
  nuevas: number,
  tasa: number | null,
): string {
  if (nuevas <= 0) return TEXTO_SIN_DATOS;
  const base = `${respondidas} de ${nuevas} respondidas`;
  if (nuevas < N_MINIMO_TASA || tasa === null) return `${base} (n insuficiente para el porcentaje)`;
  return `${base} (${formatearPorcentajeReporte(tasa)})`;
}

/** Un percentil (p90) con pocas respuestas medidas es ruido: bajo el mínimo no se muestra. */
export function formatearP90(valor: number | null, respondidas: number): string {
  if (valor === null || respondidas <= 0) return TEXTO_SIN_DATOS;
  if (respondidas < N_MINIMO_TASA) return `n insuficiente (n = ${respondidas})`;
  return formatearMinutosReporte(valor);
}

export function obtenerEtiquetaPeriodo(periodo: RangoPeriodo): string {
  switch (periodo) {
    case 'ultimos_30_dias':
      return 'Últimos 30 días';
    case 'este_mes':
      return 'Este mes';
    case 'trimestre':
      return 'Últimos 90 días';
    case 'ano':
      return 'Este año';
  }
}

/**
 * Convierte un periodo elegido a su rango [desde, hasta) en instantes UTC (R9),
 * aplicando la zona horaria de la agencia (por defecto Bogotá: America/Bogota).
 */
export function convertirPeriodoAInstantesUtc(
  periodo: RangoPeriodo,
  ahora?: Date,
  zona: string = ZONA_HORARIA_COLOMBIA,
): RangoDeInstantes {
  return rangoDePeriodo(periodo, ahora ?? new Date(), zona);
}

/**
 * Calcula la tasa de conversión porcentual (ganadas / cerradas).
 * Retorna null si no hay cerradas (sin inventar 0%).
 */
export function calcularTasaConversion(ganadas: number, perdidas: number): number | null {
  const cerradas = ganadas + perdidas;
  if (cerradas <= 0) return null;
  return Math.round((ganadas / cerradas) * 1000) / 10;
}

/**
 * Calcula la variación porcentual entre dos cantidades consecutivas en enteros BigInt.
 * Retorna el delta con 1 decimal de precisión (+16.5, -4.2), o null si el valor anterior <= 0.
 */
export function calcularVariacionPorcentual(
  actual: number | bigint | string,
  anterior: number | bigint | string,
): number | null {
  const a = BigInt(actual);
  const b = BigInt(anterior);
  if (b <= 0n) return null;
  const delta = (a - b) * 1000n;
  const signo = delta < 0n ? -1n : 1n;
  const abs = delta < 0n ? -delta : delta;
  const decimas = signo * ((abs + b / 2n) / b);
  return Number(decimas) / 10;
}

/**
 * Calcula el margen bruto y porcentaje sobre ventas garantizando operaciones
 * R8 en enteros (centavos o pesos) con BigInt.
 */
export function calcularMargenReporte(
  venta: Dinero,
  neto: Dinero,
): { margen: Dinero; porcentaje: number } {
  const uVenta = BigInt(venta.unidades);
  const uNeto = BigInt(neto.unidades);
  const uMargen = uVenta - uNeto;
  const porcentaje = uVenta > 0n ? Math.round((Number(uMargen) / Number(uVenta)) * 1000) / 10 : 0;

  return {
    margen: {
      unidades: String(uMargen),
      moneda: venta.moneda,
    },
    porcentaje,
  };
}

/** Formatea porcentaje con un decimal o «Aún sin datos» si es null/undefined. */
export function formatearPorcentajeReporte(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return TEXTO_SIN_DATOS;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(valor)} %`;
}

/** Formatea minutos con un decimal o «Aún sin datos» si es null/undefined. */
export function formatearMinutosReporte(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return TEXTO_SIN_DATOS;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(valor)} min`;
}

export interface FilaVentaMoneda {
  moneda: string;
  ventas: Dinero;
  cotizacionesAceptadas: number;
  variacionPorcentaje: number | null;
  confidencial?: {
    neto: Dinero | null;
    margen: Dinero | null;
    margenPorcentaje: number | null;
    cotizacionesSinNeto: number;
    /** Aceptadas con neto conocido: base sobre la que se calculan neto y margen. */
    cotizacionesConNeto: number;
  };
}

export interface VistaReporteResumen {
  periodo: { desde: string; hasta: string };
  filasVentas: FilaVentaMoneda[];
  hayConfidencial: boolean;
  cotizaciones: {
    creadas: number;
    enviadas: number;
    aceptadas: number;
    /** Aceptadas sin fecha de aceptación: quedan fuera de «Ventas del período». */
    aceptadasSinFecha: number;
    tasaAceptacionTexto: string;
    tasaAceptacionValor: number | null;
    /** Denominador de la tasa de aceptación: cotizaciones enviadas. */
    tasaAceptacionN: number;
    cohorteTexto: string;
  };
  oportunidades: {
    creadas: number;
    ganadas: number;
    perdidas: number;
    abiertas: number;
    tasaConversionTexto: string;
    tasaConversionValor: number | null;
    /** Denominador de la tasa de victoria: ganadas + perdidas (cerradas). */
    tasaConversionN: number;
    cohorteTexto: string;
    porEtapa: Array<{
      etapaId: string;
      nombre: string;
      orden: number;
      cantidad: number;
    }>;
  };
  respuesta: {
    conversacionesNuevas: number;
    conversacionesRespondidas: number;
    medianaTexto: string;
    medianaValor: number | null;
    promedioTexto: string;
    promedioValor: number | null;
    p90Texto: string;
    p90Valor: number | null;
    sinResponder: number;
    tasaRespuestaValor: number | null;
    /** «X de Y respondidas (Z %)»; sin porcentaje bajo `N_MINIMO_TASA`. */
    tasaRespuestaTexto: string;
    cohorteTexto: string;
  };
}

export function transformarResumenReporte(
  resumen: ResumenDeReportes,
  resumenAnterior?: ResumenDeReportes | null,
): VistaReporteResumen {
  const filasVentas: FilaVentaMoneda[] = resumen.ventasPorMoneda.map((f) => {
    const previa = resumenAnterior?.ventasPorMoneda.find((p) => p.moneda === f.moneda);
    const variacionPorcentaje = previa
      ? calcularVariacionPorcentual(f.ventas.unidades, previa.ventas.unidades)
      : null;

    const fila: FilaVentaMoneda = {
      moneda: f.moneda,
      ventas: f.ventas,
      cotizacionesAceptadas: f.cotizacionesAceptadas,
      variacionPorcentaje,
    };

    const tieneConfidencial =
      'neto' in f || 'margen' in f || 'margenPorcentaje' in f || 'cotizacionesSinNeto' in f;

    if (tieneConfidencial) {
      fila.confidencial = {
        neto: f.neto ?? null,
        margen: f.margen ?? null,
        margenPorcentaje: f.margenPorcentaje ?? null,
        cotizacionesSinNeto: f.cotizacionesSinNeto ?? 0,
        cotizacionesConNeto: Math.max(0, f.cotizacionesAceptadas - (f.cotizacionesSinNeto ?? 0)),
      };
    }

    return fila;
  });

  const hayConfidencial = filasVentas.some((f) => f.confidencial !== undefined);

  const cotizacionesAceptadasTexto =
    resumen.cotizaciones.aceptadas === 1
      ? '1 aceptada'
      : `${resumen.cotizaciones.aceptadas} aceptadas`;
  const cotizacionesEnviadasTexto =
    resumen.cotizaciones.enviadas === 1 ? '1 enviada' : `${resumen.cotizaciones.enviadas} enviadas`;

  const { conversacionesNuevas, conversacionesRespondidas } = resumen.respuesta;
  const tasaRespuesta =
    resumen.respuesta.tasaRespuesta ??
    (conversacionesNuevas > 0
      ? Math.round((conversacionesRespondidas / conversacionesNuevas) * 1000) / 10
      : null);

  return {
    periodo: resumen.periodo,
    filasVentas,
    hayConfidencial,
    cotizaciones: {
      creadas: resumen.cotizaciones.creadas,
      enviadas: resumen.cotizaciones.enviadas,
      aceptadas: resumen.cotizaciones.aceptadas,
      aceptadasSinFecha: resumen.cotizaciones.aceptadasSinFecha ?? 0,
      tasaAceptacionTexto: formatearTasaConN(
        resumen.cotizaciones.tasaAceptacion,
        resumen.cotizaciones.enviadas,
        resumen.cotizaciones.aceptadas,
      ),
      tasaAceptacionValor: resumen.cotizaciones.tasaAceptacion,
      tasaAceptacionN: resumen.cotizaciones.enviadas,
      cohorteTexto: `${cotizacionesAceptadasTexto} de ${cotizacionesEnviadasTexto} en el periodo (${resumen.cotizaciones.creadas} creadas)`,
    },
    oportunidades: {
      creadas: resumen.oportunidades.creadas,
      ganadas: resumen.oportunidades.ganadas,
      perdidas: resumen.oportunidades.perdidas,
      abiertas: resumen.oportunidades.abiertas,
      tasaConversionTexto: formatearTasaConN(
        resumen.oportunidades.tasaConversion,
        resumen.oportunidades.ganadas + resumen.oportunidades.perdidas,
        resumen.oportunidades.ganadas,
      ),
      tasaConversionValor: resumen.oportunidades.tasaConversion,
      tasaConversionN: resumen.oportunidades.ganadas + resumen.oportunidades.perdidas,
      cohorteTexto: `${resumen.oportunidades.creadas} creadas en el periodo (${resumen.oportunidades.ganadas} ganadas · ${resumen.oportunidades.perdidas} perdidas · ${resumen.oportunidades.abiertas} abiertas)`,
      porEtapa: resumen.oportunidades.porEtapa.map((e) => ({
        etapaId: e.etapaId,
        nombre: e.nombre,
        orden: e.orden,
        cantidad: e.cantidad,
      })),
    },
    respuesta: {
      conversacionesNuevas: resumen.respuesta.conversacionesNuevas,
      conversacionesRespondidas: resumen.respuesta.conversacionesRespondidas,
      medianaTexto: formatearMinutosReporte(resumen.respuesta.medianaMinutos),
      medianaValor: resumen.respuesta.medianaMinutos,
      promedioTexto: formatearMinutosReporte(resumen.respuesta.promedioMinutos),
      promedioValor: resumen.respuesta.promedioMinutos,
      p90Texto: formatearP90(
        resumen.respuesta.p90Minutos ?? null,
        resumen.respuesta.conversacionesRespondidas,
      ),
      p90Valor: resumen.respuesta.p90Minutos ?? null,
      sinResponder:
        resumen.respuesta.sinResponder ??
        Math.max(
          0,
          resumen.respuesta.conversacionesNuevas - resumen.respuesta.conversacionesRespondidas,
        ),
      tasaRespuestaValor: tasaRespuesta,
      tasaRespuestaTexto: formatearTasaDeRespuesta(
        resumen.respuesta.conversacionesRespondidas,
        resumen.respuesta.conversacionesNuevas,
        tasaRespuesta,
      ),
      cohorteTexto: formatearTasaDeRespuesta(
        resumen.respuesta.conversacionesRespondidas,
        resumen.respuesta.conversacionesNuevas,
        tasaRespuesta,
      ),
    },
  };
}
