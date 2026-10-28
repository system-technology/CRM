/**
 * Lógica pura para la pantalla de Inicio / Dashboard de ViajaPro (T-037).
 *
 * Saludos dinámicos en español colombiano según la hora del día,
 * agregación de métricas del trabajo diario y formateo accesible.
 */

import type {
  ContadoresBandeja,
  TableroPipeline,
  PaginaDeCotizaciones,
  PendientesDelDia,
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
  cotizacionesPorVencer: number;
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
  cotizaciones: PaginaDeCotizaciones | null,
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

  // 3. Cotizaciones por vencer
  let cotizacionesPorVencer = 0;
  if (cotizaciones && cotizaciones.datos) {
    cotizacionesPorVencer = cotizaciones.datos.filter(
      (c) => c.estado === 'ENVIADA' || c.estado === 'BORRADOR',
    ).length;
  }

  const estaVacio =
    conversacionesPendientes === 0 &&
    oportunidadesActivas === 0 &&
    cotizacionesPorVencer === 0 &&
    oportunidadesPorEtapa.ganadas === 0;

  return {
    conversacionesPendientes,
    conversacionesSinAsignar,
    oportunidadesActivas,
    oportunidadesPorEtapa,
    cotizacionesPorVencer,
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
