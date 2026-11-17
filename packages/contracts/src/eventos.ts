/**
 * Eventos de dominio entre contextos (ADR-0004, ADR-0024 §1). Son contrato público: quien los
 * produce y quien los consume importan el MISMO esquema de aquí (R3) y ninguno importa al otro (R4).
 *
 * **Solo identificadores.** Nada de nombres, teléfonos ni importes: el outbox no es sitio de datos
 * personales ni de dinero. Quien necesita el contenido lo lee, bajo RLS, de su dueño.
 */
import { z } from 'zod';
import { Id, Instante } from './comunes.js';

/** `quoting.cotizacion_aceptada` (v1): la cotización pasó de ENVIADA a ACEPTADA. */
export const TIPO_COTIZACION_ACEPTADA = 'quoting.cotizacion_aceptada';

export const CotizacionAceptadaV1 = z.object({
  v: z.literal(1),
  cotizacionId: Id,
  /** `cotizaciones.version_enviada`: lo aceptado es lo que vio el cliente. */
  version: z.number().int().min(1),
  contactoId: Id,
  oportunidadId: Id.nullable(),
  aceptadaPorUsuarioId: Id.nullable(),
  aceptadaEn: Instante,
});
export type CotizacionAceptadaV1 = z.infer<typeof CotizacionAceptadaV1>;

/**
 * Los cuatro avisos de plazo de una reserva (ADR-0024 §3.6). Los escribe la vigilancia de `booking`
 * en el outbox, una vez por reserva y plazo; el primer consumidor previsto es `notifications`
 * (aviso activo al asesor). No cambian el estado de la reserva: solo avisan.
 *
 *   · `booking.time_limit_proximo`  — `CONFIRMADA` con el time limit del abono en las próximas 24 h
 *   · `booking.time_limit_vencido`  — `CONFIRMADA` con el time limit ya pasado
 *   · `booking.pago_total_proximo`  — `ABONADA_AL_PROVEEDOR` con el pago total en las próximas 24 h
 *   · `booking.pago_total_vencido`  — `ABONADA_AL_PROVEEDOR` con el pago total ya pasado
 */
export const TIPO_TIME_LIMIT_PROXIMO = 'booking.time_limit_proximo';
export const TIPO_TIME_LIMIT_VENCIDO = 'booking.time_limit_vencido';
export const TIPO_PAGO_TOTAL_PROXIMO = 'booking.pago_total_proximo';
export const TIPO_PAGO_TOTAL_VENCIDO = 'booking.pago_total_vencido';

export const TIPOS_DE_AVISO_DE_PLAZO = [
  TIPO_TIME_LIMIT_PROXIMO,
  TIPO_TIME_LIMIT_VENCIDO,
  TIPO_PAGO_TOTAL_PROXIMO,
  TIPO_PAGO_TOTAL_VENCIDO,
] as const;

export const PlazoDeReserva = z.enum(['TIME_LIMIT', 'PAGO_TOTAL']);
export type PlazoDeReserva = z.infer<typeof PlazoDeReserva>;

/** Mismo esquema para los cuatro tipos: lo que cambia es `tipo_evento`, no la forma. */
export const AvisoDePlazoV1 = z.object({
  v: z.literal(1),
  reservaId: Id,
  archivoId: Id,
  plazo: PlazoDeReserva,
  /** El plazo vigente cuando se avisó, en UTC (R9). La zona de la agencia es solo presentación. */
  venceEn: Instante,
});
export type AvisoDePlazoV1 = z.infer<typeof AvisoDePlazoV1>;
