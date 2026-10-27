/**
 * Lógica pura para la pantalla de Inicio / Dashboard de ViajaPro (T-037).
 *
 * Saludos dinámicos en español colombiano según la hora del día,
 * agregación de métricas del trabajo diario y formateo accesible.
 */

import type { ContadoresBandeja, TableroPipeline, PaginaDeCotizaciones } from '@viajapro/contracts';

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
