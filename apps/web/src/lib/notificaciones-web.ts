/**
 * Modelo de Notificaciones Web del CRM y canal en tiempo real (T-110).
 *
 * Integra:
 * 1. Eventos entrantes por Socket.IO (MENSAJE_RECIBIDO en WhatsApp).
 * 2. Seguimientos vencidos de la API de pendientes del CRM.
 * 3. Cotizaciones próximas a vencer.
 * 4. Respeto absoluto del criterio: CERO datos personales en títulos de notificación (R10).
 */

import type { EventoBandeja } from '@viajapro/contracts';
import {
  TITULOS_SEGUROS_NOTIFICACION,
  reproducirSonidoNotificacion,
  emitirNotificacionNavegador,
} from './preferencias-notificaciones';
import type { PendientesDelDia } from '@viajapro/contracts';
import type { AlertaOperativa } from './notificaciones-logica';

export type TipoNotificacionWeb =
  | 'mensaje_nuevo'
  | 'seguimiento_vencido'
  | 'cotizacion_por_vencer'
  | 'alerta_operativa'
  | 'aviso_plazo';

export type SeveridadNotificacion = 'critica' | 'advertencia' | 'informativa';

export interface NotificacionWeb {
  id: string;
  tipo: TipoNotificacionWeb;
  severidad: SeveridadNotificacion;
  titulo: string;
  detalle: string;
  href: string;
  creadaEn: string;
  leida: boolean;
  accionTexto: string;
}

/**
 * Convierte una AlertaOperativa en una NotificacionWeb para visualización unificada.
 */
export function adaptarAlertaOperativaANotificacion(alerta: AlertaOperativa): NotificacionWeb {
  return {
    id: alerta.id,
    tipo: 'alerta_operativa',
    severidad: alerta.severidad,
    titulo: alerta.titulo,
    detalle: alerta.mensaje,
    href: alerta.href,
    creadaEn: alerta.fechaUtc,
    leida: alerta.leida,
    accionTexto: alerta.accionTexto,
  };
}

/**
 * Crea una notificación para un mensaje entrante de WhatsApp.
 * Invariante R10: el título NUNCA incluye nombres de personas ni teléfonos.
 */
export function crearNotificacionMensajeNuevo(
  conversacionId: string,
  _textoMensaje?: string,
): NotificacionWeb {
  return {
    id: `notif-msg-${conversacionId}-${Date.now()}`,
    tipo: 'mensaje_nuevo',
    severidad: 'critica',
    titulo: TITULOS_SEGUROS_NOTIFICACION.MENSAJE_NUEVO,
    detalle: 'Has recibido un nuevo mensaje en la bandeja de WhatsApp.',
    href: `/bandeja/${conversacionId}`,
    creadaEn: new Date().toISOString(),
    leida: false,
    accionTexto: 'Responder',
  };
}

/**
 * Crea una notificación para un seguimiento vencido del asesor.
 * Invariante R10: título genérico sin PII.
 */
export function crearNotificacionSeguimientoVencido(
  seguimientoId: string,
  tipoAccion = 'Llamada o contacto',
): NotificacionWeb {
  return {
    id: `notif-seg-${seguimientoId}`,
    tipo: 'seguimiento_vencido',
    severidad: 'critica',
    titulo: TITULOS_SEGUROS_NOTIFICACION.SEGUIMIENTO_VENCIDO,
    detalle: `Tienes una tarea programada (${tipoAccion}) que ha superado su fecha límite.`,
    href: '/seguimientos',
    creadaEn: new Date().toISOString(),
    leida: false,
    accionTexto: 'Gestionar',
  };
}

/**
 * Crea una notificación para una cotización cuya oferta está próxima a vencer.
 */
export function crearNotificacionCotizacionPorVencer(
  cotizacionId: string,
  horasRestantes = 24,
): NotificacionWeb {
  return {
    id: `notif-cot-${cotizacionId}`,
    tipo: 'cotizacion_por_vencer',
    severidad: 'advertencia',
    titulo: TITULOS_SEGUROS_NOTIFICACION.COTIZACION_POR_VENCER,
    detalle: `La oferta vence en aproximadamente ${horasRestantes} hora(s). Revisa el itinerario con tu viajero.`,
    href: `/cotizaciones/${cotizacionId}`,
    creadaEn: new Date().toISOString(),
    leida: false,
    accionTexto: 'Ver Cotización',
  };
}

/**
 * Procesa un evento recibido por Socket.IO en tiempo real.
 * Si es un mensaje entrante, reproduce sonido y emite notificación de escritorio (si están activadas).
 */
export function procesarEventoSocketNotificacion(
  evento: EventoBandeja,
  notificacionesPrevias: NotificacionWeb[],
): NotificacionWeb[] {
  if (evento.tipo === 'MENSAJE_NUEVO' && evento.mensaje.direccion === 'ENTRANTE') {
    const nueva = crearNotificacionMensajeNuevo(
      evento.conversacionId,
      evento.mensaje.texto ?? undefined,
    );

    // Efectos colaterales controlados por preferencias del asesor
    reproducirSonidoNotificacion();
    emitirNotificacionNavegador(nueva.titulo, nueva.detalle, nueva.href);

    return [nueva, ...notificacionesPrevias];
  }

  return notificacionesPrevias;
}

/**
 * Agrega notificaciones iniciales combinando seguimientos vencidos y cotizaciones pendientes.
 */
export function generarNotificacionesIniciales(
  pendientes?: PendientesDelDia | null,
  cotizacionesPorVencerIds: string[] = ['01932000-0000-7000-8000-000000000001'],
  alertasOperativas?: AlertaOperativa[],
): NotificacionWeb[] {
  const resultado: NotificacionWeb[] = [];

  // 1. Mensaje de bienvenida/ejemplo en la bandeja
  resultado.push(
    crearNotificacionMensajeNuevo(
      '00000000-0000-4000-8000-000000000001',
      '¡Hola! Quisiera información sobre el paquete.',
    ),
  );

  // 2. Seguimientos vencidos si existen
  if (pendientes) {
    // Con datos de pendientes, la campana dice lo mismo que Hoy y Seguimientos: si no hay
    // vencidos, no se inventa uno.
    for (const s of pendientes.vencidos) {
      resultado.push(crearNotificacionSeguimientoVencido(s.id, s.descripcion));
    }
  } else {
    // Sin datos todavía (arranque en demostración): un seguimiento de ejemplo
    resultado.push(
      crearNotificacionSeguimientoVencido('01932000-0000-7000-8000-000000000099', 'LLAMADA'),
    );
  }

  // 3. Cotizaciones próximas a vencer
  for (const cotId of cotizacionesPorVencerIds) {
    resultado.push(crearNotificacionCotizacionPorVencer(cotId, 18));
  }

  // 4. Alertas operativas opcionales
  if (alertasOperativas && alertasOperativas.length > 0) {
    for (const al of alertasOperativas) {
      resultado.push(adaptarAlertaOperativaANotificacion(al));
    }
  }

  return resultado;
}

/**
 * Cuenta las notificaciones que no han sido leídas por el asesor.
 */
export function contarNotificacionesNoLeidas(notificaciones: NotificacionWeb[]): number {
  return notificaciones.filter((n) => !n.leida).length;
}

export type PendientesPorTipo = Record<TipoNotificacionWeb, number>;

export interface ResumenDeNotificaciones {
  /** No leídas de toda la lista: la cifra de la campana y de «Todas». */
  total: number;
  /** No leídas por pestaña. Su suma es `total` por construcción: no hay otra fuente. */
  porTipo: PendientesPorTipo;
}

/**
 * Única cuenta de la campana (T-322): el distintivo, el encabezado del desplegable y cada pestaña
 * salen de aquí, así que no pueden divergir. Cuenta lo pendiente (no leído), que es lo que la
 * asesora debe atender.
 */
export function resumirNotificaciones(notificaciones: NotificacionWeb[]): ResumenDeNotificaciones {
  const porTipo: PendientesPorTipo = {
    mensaje_nuevo: 0,
    seguimiento_vencido: 0,
    cotizacion_por_vencer: 0,
    alerta_operativa: 0,
    aviso_plazo: 0,
  };
  let total = 0;
  for (const n of notificaciones) {
    if (n.leida) continue;
    porTipo[n.tipo] += 1;
    total += 1;
  }
  return { total, porTipo };
}

/** Id del archivo de viaje al que apunta un `href` de la forma `/viajes?id=<id>`; `null` si no es de archivo. */
export function archivoIdDeHref(href: string): string | null {
  const m = /^\/viajes\?(?:[^#]*&)?id=([^&#]+)/.exec(href);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/**
 * Deja solo las notificaciones cuyo archivo de viaje existe en `idsExistentes` (la lista de
 * `listarArchivos`, la misma fuente de /viajes). Las que no apuntan a un archivo pasan intactas.
 * Con `idsExistentes === null` (la lista no se pudo leer) no se filtra: no se sabe, y esconder
 * avisos reales de plazo sería peor que mostrarlos.
 */
export function soloConArchivoExistente(
  notificaciones: NotificacionWeb[],
  idsExistentes: ReadonlySet<string> | null,
): NotificacionWeb[] {
  if (!idsExistentes) return notificaciones;
  return notificaciones.filter((n) => {
    const id = archivoIdDeHref(n.href);
    return id === null || idsExistentes.has(id);
  });
}

/**
 * Marca una notificación específica como leída de manera inmutable.
 */
export function marcarNotificacionLeida(
  notificaciones: NotificacionWeb[],
  id: string,
): NotificacionWeb[] {
  return notificaciones.map((n) => (n.id === id ? { ...n, leida: true } : n));
}

/**
 * Marca todas las notificaciones de la lista como leídas inmutablemente.
 */
export function marcarTodasNotificacionesLeidas(
  notificaciones: NotificacionWeb[],
): NotificacionWeb[] {
  return notificaciones.map((n) => ({ ...n, leida: true }));
}

/**
 * Descarta / elimina una notificación de la lista.
 */
export function descartarNotificacion(
  notificaciones: NotificacionWeb[],
  id: string,
): NotificacionWeb[] {
  return notificaciones.filter((n) => n.id !== id);
}
