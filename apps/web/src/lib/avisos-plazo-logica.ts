/**
 * Composición en pantalla de los avisos de plazo (T-255). El contrato no trae texto: la pantalla
 * lo arma con el tipo, el número de file y el plazo en la zona horaria de la agencia (R9).
 * Sin pasajeros ni importes (R10): el contrato no los trae.
 */
import type { Notificacion, TipoDeNotificacion } from '@viajapro/contracts';
import { describirPlazo } from './archivos-logica';
import { formatearFechaHora } from './formato';
import type { NotificacionWeb } from './notificaciones-web';

/** Cada cuánto se refresca la campana en segundo plano (sin websockets): 3 minutos. */
export const INTERVALO_REFRESCO_AVISOS_MS = 180_000;
/** Al abrir el desplegable no se vuelve a pedir si el último refresco es más reciente que esto. */
export const VIGENCIA_AVISOS_MS = 15_000;
export const PREFIJO_AVISO = 'aviso-';

const TITULOS: Record<TipoDeNotificacion, string> = {
  TIME_LIMIT_PROXIMO: 'Time limit próximo',
  TIME_LIMIT_VENCIDO: 'Time limit vencido',
  PAGO_TOTAL_PROXIMO: 'Pago total próximo',
  PAGO_TOTAL_VENCIDO: 'Pago total vencido',
};

export function tituloDeAviso(tipo: TipoDeNotificacion): string {
  return TITULOS[tipo];
}

export function esAvisoDePlazo(id: string): boolean {
  return id.startsWith(PREFIJO_AVISO);
}

export function idDeAviso(idWeb: string): string {
  return idWeb.slice(PREFIJO_AVISO.length);
}

/** «Time limit del file 1043: vence en 3 horas (sáb 3 oct 2026, 9:30 a. m.)». */
export function textoDeAviso(n: Notificacion, zona: string, ahoraMs: number = Date.now()): string {
  const que = n.tipo.startsWith('TIME_LIMIT') ? 'Time limit' : 'Pago total';
  const cuando = formatearFechaHora(n.venceEn, { zona });
  return `${que} del file ${n.archivoNumero}: ${describirPlazo(n.venceEn, ahoraMs)} (${cuando})`;
}

export function adaptarAvisoANotificacionWeb(
  n: Notificacion,
  zona: string,
  ahoraMs: number = Date.now(),
): NotificacionWeb {
  const vencido = n.tipo.endsWith('VENCIDO');
  return {
    id: `${PREFIJO_AVISO}${n.id}`,
    tipo: 'aviso_plazo',
    severidad: vencido ? 'critica' : 'advertencia',
    titulo: tituloDeAviso(n.tipo),
    detalle: textoDeAviso(n, zona, ahoraMs),
    href: `/viajes?id=${n.archivoId}`,
    creadaEn: n.creadaEn,
    leida: n.leidaEn !== null,
    accionTexto: 'Ver reserva',
  };
}
