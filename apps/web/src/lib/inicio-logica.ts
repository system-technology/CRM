/**
 * Lógica pura para la pantalla de Inicio / Dashboard de ViajaPro (T-037).
 *
 * Saludos dinámicos en español colombiano según la hora del día,
 * agregación de métricas del trabajo diario y formateo accesible.
 */

import type {
  AlcanceDelResumen,
  ContadoresBandeja,
  CotizacionesAbiertas,
  PendientesDelDia,
  PorCobrar,
  ResumenDeReportes,
  TableroPipeline,
} from '@viajapro/contracts';
import { formatearFecha } from './formato';

export interface ResumenTrabajoDelDia {
  conversacionesPendientes: number;
  conversacionesSinAsignar: number;
  oportunidadesActivas: number;
  oportunidadesPorEtapa: {
    nuevoLead: number;
    enCotizacion: number;
    enNegociacion: number;
    ganadas: number;
  };
  /**
   * T-546. Las dos las cuenta el SERVIDOR (T-528) con el alcance de quien consulta; aquí solo se
   * pasan. `null` = no llegaron (falló la consulta, o `porCobrar` sin `cobro.ver`): la pantalla
   * omite o avisa, nunca pinta ceros. Antes se contaban sobre las últimas 20 cotizaciones de la
   * agencia, que era un apaño que además mostraba lo de otros asesores.
   */
  cotizacionesAbiertas: CotizacionesAbiertas | null;
  porCobrar: PorCobrar | null;
  /** De quién son esas dos cifras, según dijo el servidor; `null` si no hubo respuesta. */
  alcanceDeCifras: AlcanceDelResumen | null;
  totalVentasEstimadasCop: string;
  estaVacio: boolean;
}

/**
 * Retorna el saludo dinámico según la hora del día (formato 24h, es-CO).
 * - 05:00 a 11:59: ¡Buenos días!
 * - 12:00 a 17:59: ¡Buenas tardes!
 * - 18:00 a 04:59: ¡Buenas noches!
 */
export function obtenerSaludoSegunHora(hora: number = new Date().getHours()): string {
  if (hora >= 5 && hora < 12) {
    return '¡Buenos días';
  }
  if (hora >= 12 && hora < 18) {
    return '¡Buenas tardes';
  }
  return '¡Buenas noches';
}

/**
 * Construye la frase de bienvenida completa con el nombre del usuario o rol.
 */
export function obtenerMensajeBienvenida(nombre?: string | null, hora?: number): string {
  const saludo = obtenerSaludoSegunHora(hora);
  const nombreLimpio = nombre?.trim();
  if (nombreLimpio) {
    return `${saludo}, ${nombreLimpio}!`;
  }
  return `${saludo}!`;
}

/**
 * Agrega los datos obtenidos de la API para construir las tarjetas de colores del trabajo del día.
 */
export function calcularResumenTrabajo(
  contadoresInbox: ContadoresBandeja | null,
  tablero: TableroPipeline | null,
  resumenDeReportes: ResumenDeReportes | null,
): ResumenTrabajoDelDia {
  // 1. Inbox / WhatsApp
  const conversacionesSinAsignar = contadoresInbox?.sinAsignar ?? 0;
  const conversacionesPendientes =
    (contadoresInbox?.sinAsignar ?? 0) + (contadoresInbox?.conversacionesSinLeer ?? 0);

  // 2. Oportunidades por etapa
  let oportunidadesActivas = 0;
  let totalEstimado = 0n;
  const oportunidadesPorEtapa = {
    nuevoLead: 0,
    enCotizacion: 0,
    enNegociacion: 0,
    ganadas: 0,
  };

  if (tablero && tablero.columnas) {
    for (const col of tablero.columnas) {
      const cantidad = col.oportunidades.length;
      if (!col.etapa.esGanada && !col.etapa.esPerdida) {
        oportunidadesActivas += cantidad;
      }

      const clave = col.etapa.clave;
      if (clave === 'NUEVO_LEAD') {
        oportunidadesPorEtapa.nuevoLead += cantidad;
      } else if (clave === 'EN_COTIZACION') {
        oportunidadesPorEtapa.enCotizacion += cantidad;
      } else if (clave === 'EN_NEGOCIACION') {
        oportunidadesPorEtapa.enNegociacion += cantidad;
      } else if (clave === 'GANADA' || col.etapa.esGanada) {
        oportunidadesPorEtapa.ganadas += cantidad;
      }

      for (const op of col.oportunidades) {
        if (op.valorEstimado?.unidades) {
          totalEstimado += BigInt(op.valorEstimado.unidades);
        }
      }
    }
  }

  const estaVacio =
    conversacionesPendientes === 0 &&
    oportunidadesActivas === 0 &&
    (resumenDeReportes?.cotizacionesAbiertas?.total ?? 0) === 0 &&
    oportunidadesPorEtapa.ganadas === 0;

  return {
    conversacionesPendientes,
    conversacionesSinAsignar,
    oportunidadesActivas,
    oportunidadesPorEtapa,
    cotizacionesAbiertas: resumenDeReportes?.cotizacionesAbiertas ?? null,
    porCobrar: resumenDeReportes?.porCobrar ?? null,
    alcanceDeCifras: resumenDeReportes?.alcance ?? null,
    totalVentasEstimadasCop: totalEstimado.toString(),
    estaVacio,
  };
}

export interface MetricasSeguimientos {
  totalVencidos: number;
  totalHoy: number;
  totalPendientes: number;
  estaAlDia: boolean;
  tieneVencidos: boolean;
}

/**
 * Calcula las métricas resumidas del bloque de seguimientos del asesor (T-020).
 */
export function calcularMetricasSeguimientos(
  pendientes: PendientesDelDia | null,
): MetricasSeguimientos {
  const totalVencidos = pendientes?.vencidos?.length ?? 0;
  const totalHoy = pendientes?.deHoy?.length ?? 0;
  const totalPendientes = totalVencidos + totalHoy;

  return {
    totalVencidos,
    totalHoy,
    totalPendientes,
    estaAlDia: totalPendientes === 0,
    tieneVencidos: totalVencidos > 0,
  };
}

/** Cifras del menú lateral (T-317): lo que requiere acción hoy y lo vencido. Mismas reglas que Inicio. */
export interface ContadoresDeMenu {
  hoy: number;
  seguimientosVencidos: number;
}

export function calcularContadoresDeMenu(pendientes: PendientesDelDia | null): ContadoresDeMenu {
  const m = calcularMetricasSeguimientos(pendientes);
  return { hoy: m.totalPendientes, seguimientosVencidos: m.totalVencidos };
}

/** Nombre accesible de un enlace con contador: «Hoy, 3 pendientes». Sin cifra (0), solo la etiqueta. */
export function nombreAccesibleConContador(
  etiqueta: string,
  cantidad: number,
  singular: string,
  plural: string,
): string {
  if (cantidad <= 0) return etiqueta;
  return `${etiqueta}, ${cantidad} ${cantidad === 1 ? singular : plural}`;
}

export type UrgenciaSeguimiento = 'VENCIDO' | 'HOY_URGENTE' | 'HOY_PROGRAMADO';

/**
 * Determina el nivel de urgencia de un seguimiento para su tratamiento visual y prioridad.
 */
export function clasificarUrgenciaSeguimiento(
  venceEnIso: string,
  ahora: Date = new Date(),
): UrgenciaSeguimiento {
  const diffMs = ahora.getTime() - new Date(venceEnIso).getTime();
  if (diffMs > 0) {
    return 'VENCIDO';
  }
  // Menos de 2 horas para vencer = urgente
  if (Math.abs(diffMs) <= 2 * 60 * 60 * 1000) {
    return 'HOY_URGENTE';
  }
  return 'HOY_PROGRAMADO';
}

/**
 * Retorna el texto amigable de retraso o tiempo restante en español colombiano.
 */
export function calcularRetrasoSeguimiento(venceEnIso: string, ahora: Date = new Date()): string {
  const diffMs = ahora.getTime() - new Date(venceEnIso).getTime();
  if (diffMs > 0) {
    const min = Math.floor(diffMs / 60000);
    if (min < 60) {
      return `Vencido hace ${min} min`;
    }
    const horas = Math.floor(min / 60);
    if (horas < 24) {
      return `Vencido hace ${horas} h`;
    }
    const dias = Math.floor(horas / 24);
    return `Vencido hace ${dias} d`;
  }

  const faltanMs = -diffMs;
  const min = Math.floor(faltanMs / 60000);
  if (min < 60) {
    return `En ${min} min`;
  }
  const horas = Math.floor(min / 60);
  if (horas < 24) {
    return `En ${horas} h`;
  }
  return 'Programado para hoy';
}

/**
 * Formatea la hora del seguimiento en formato amigable de Colombia (ej: 02:30 p. m.).
 */
export function formatearHoraSeguimiento(venceEnIso: string): string {
  try {
    return formatearFecha(venceEnIso, { estilo: 'hora' });
  } catch {
    return '';
  }
}
