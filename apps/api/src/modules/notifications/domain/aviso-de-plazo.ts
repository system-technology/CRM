/**
 * Los avisos de plazo de una reserva como notificación en la aplicación (T-254, ADR-0024 §3.6).
 * Dominio puro: sin framework ni Prisma.
 *
 * **A quién se avisa** (el ADR no lo fija; decisión de T-254, documentada en la bitácora):
 *   1. El asesor responsable: el asesor asignado a la oportunidad de la que viene el archivo, si
 *      sigue activo y puede operar archivos (`archivo.operar`: avisarle a quien no puede actuar es
 *      ruido).
 *   2. Si no hay asesor elegible (el archivo no vino de una oportunidad, la oportunidad no tiene
 *      asesor, o ya no puede operar): TODOS los usuarios activos con `archivo.operar`. Es mejor un
 *      aviso repetido a quien puede actuar que un plazo que nadie vio.
 *   3. Si tampoco hay nadie: nadie. El semáforo de la pantalla Reservas sigue siendo la vigilancia.
 */
import {
  TIPO_PAGO_TOTAL_PROXIMO,
  TIPO_PAGO_TOTAL_VENCIDO,
  TIPO_TIME_LIMIT_PROXIMO,
  TIPO_TIME_LIMIT_VENCIDO,
  type TipoDeNotificacion,
} from '@viajapro/contracts';

export interface TipoDeAvisoDePlazo {
  /** `tipo_evento` del outbox. */
  tipoEvento: string;
  tipo: TipoDeNotificacion;
  /** Nombre del consumidor en el despachador, `contexto.nombre`. */
  consumidor: string;
}

/** Un consumidor por tipo de evento. */
export const AVISOS_DE_PLAZO: readonly TipoDeAvisoDePlazo[] = [
  {
    tipoEvento: TIPO_TIME_LIMIT_PROXIMO,
    tipo: 'TIME_LIMIT_PROXIMO',
    consumidor: 'notifications.aviso_time_limit_proximo',
  },
  {
    tipoEvento: TIPO_TIME_LIMIT_VENCIDO,
    tipo: 'TIME_LIMIT_VENCIDO',
    consumidor: 'notifications.aviso_time_limit_vencido',
  },
  {
    tipoEvento: TIPO_PAGO_TOTAL_PROXIMO,
    tipo: 'PAGO_TOTAL_PROXIMO',
    consumidor: 'notifications.aviso_pago_total_proximo',
  },
  {
    tipoEvento: TIPO_PAGO_TOTAL_VENCIDO,
    tipo: 'PAGO_TOTAL_VENCIDO',
    consumidor: 'notifications.aviso_pago_total_vencido',
  },
];

/** El permiso que hace a alguien destinatario: poder actuar sobre el archivo. */
export const PERMISO_DE_DESTINATARIO = 'archivo.operar' as const;

/**
 * `asesorElegible`: el asesor de la oportunidad, ya filtrado por activo + permiso (0 o 1).
 * `operadores`: los usuarios activos con el permiso. Sin duplicados, orden estable.
 */
export function destinatariosDelAviso(
  asesorElegible: readonly string[],
  operadores: readonly string[],
): string[] {
  const elegidos = asesorElegible.length > 0 ? asesorElegible : operadores;
  return [...new Set(elegidos)];
}

export interface NotificacionPorCrear {
  usuarioId: string;
  tipo: TipoDeNotificacion;
  outboxId: bigint;
  archivoId: string;
  reservaId: string;
  archivoNumero: number;
  venceEn: Date;
}
