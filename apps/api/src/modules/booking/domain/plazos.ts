/**
 * La vigilancia de los dos plazos del mayorista (ADR-0024 §3.6). Lógica pura: sin base de datos, sin
 * reloj (el instante llega por parámetro) y sin framework.
 *
 *   · `CONFIRMADA`           vigila el `time_limit` (el abono);
 *   · `ABONADA_AL_PROVEEDOR` vigila `pago_total_vence_en`.
 *
 * Cada plazo avisa a lo sumo DOS veces en su vida: «próximo» (dentro del umbral) y «vencido». «Una
 * vez» lo garantizan las marcas `aviso_*` de la reserva, que el dominio borra al cambiar el plazo.
 * Todo se compara en UTC (R9); la zona de la agencia solo sirve para presentar.
 */
import {
  AvisoDePlazoV1,
  type PlazoDeReserva,
  TIPO_PAGO_TOTAL_PROXIMO,
  TIPO_PAGO_TOTAL_VENCIDO,
  TIPO_TIME_LIMIT_PROXIMO,
  TIPO_TIME_LIMIT_VENCIDO,
} from '@viajapro/contracts';
import { InvariantError } from '@viajapro/domain';
import type { Reserva } from './reserva.js';

/** ADR-0024 §3.6.6: constante. Hacerlo política de la agencia (R12) espera a la segunda agencia. */
export const UMBRAL_DE_AVISO_MS = 24 * 60 * 60 * 1000;

export type MomentoDeAviso = 'PROXIMO' | 'VENCIDO';

export interface AvisoDePlazo {
  plazo: PlazoDeReserva;
  momento: MomentoDeAviso;
  /** El plazo que dispara el aviso. */
  venceEn: Date;
}

export type ReservaVigilable = Pick<
  Reserva,
  | 'estado'
  | 'timeLimit'
  | 'pagoTotalVenceEn'
  | 'avisoTimeLimitProximoEn'
  | 'avisoTimeLimitVencidoEn'
  | 'avisoPagoTotalProximoEn'
  | 'avisoPagoTotalVencidoEn'
>;

function avisoDeUnPlazo(
  plazo: PlazoDeReserva,
  venceEn: Date | null,
  marcaProximo: Date | null,
  marcaVencido: Date | null,
  ahora: Date,
  umbralMs: number,
): AvisoDePlazo | null {
  if (venceEn === null) return null;
  if (venceEn.getTime() <= ahora.getTime()) {
    // Un plazo ya vencido avisa solo de que venció: el «próximo» llegó tarde y no se manda.
    return marcaVencido === null ? { plazo, momento: 'VENCIDO', venceEn } : null;
  }
  if (venceEn.getTime() - ahora.getTime() <= umbralMs) {
    return marcaProximo === null ? { plazo, momento: 'PROXIMO', venceEn } : null;
  }
  return null;
}

/**
 * Los avisos que esta reserva debe a `ahora`. Una reserva que no está en el estado que vigila ese
 * plazo no avisa de él (una `CAIDA`, una `CANCELADA` o una `PAGADA_AL_PROVEEDOR` no avisan de nada).
 * No cambia la reserva: devuelve qué decir, no qué hacer con su estado.
 */
export function avisosDePlazo(
  reserva: ReservaVigilable,
  ahora: Date,
  umbralMs: number = UMBRAL_DE_AVISO_MS,
): AvisoDePlazo[] {
  const avisos: AvisoDePlazo[] = [];
  if (reserva.estado === 'CONFIRMADA') {
    const a = avisoDeUnPlazo(
      'TIME_LIMIT',
      reserva.timeLimit,
      reserva.avisoTimeLimitProximoEn,
      reserva.avisoTimeLimitVencidoEn,
      ahora,
      umbralMs,
    );
    if (a) avisos.push(a);
  }
  if (reserva.estado === 'ABONADA_AL_PROVEEDOR') {
    const a = avisoDeUnPlazo(
      'PAGO_TOTAL',
      reserva.pagoTotalVenceEn,
      reserva.avisoPagoTotalProximoEn,
      reserva.avisoPagoTotalVencidoEn,
      ahora,
      umbralMs,
    );
    if (a) avisos.push(a);
  }
  return avisos;
}

export const tipoDeEventoDelAviso = (aviso: Pick<AvisoDePlazo, 'plazo' | 'momento'>): string => {
  if (aviso.plazo === 'TIME_LIMIT') {
    return aviso.momento === 'PROXIMO' ? TIPO_TIME_LIMIT_PROXIMO : TIPO_TIME_LIMIT_VENCIDO;
  }
  return aviso.momento === 'PROXIMO' ? TIPO_PAGO_TOTAL_PROXIMO : TIPO_PAGO_TOTAL_VENCIDO;
};

/** Lo que se escribe en el outbox, sin el tenant (lo pone quien escribe, del contexto). */
export interface EventoDeAvisoParaOutbox {
  agregado: 'reserva';
  agregadoId: string;
  tipoEvento: string;
  versionEvento: 1;
  payload: AvisoDePlazoV1;
}

export class AvisoDePlazoInvalidoError extends InvariantError {
  readonly code = 'AVISO_DE_PLAZO_INVALIDO';
  constructor(readonly reservaId: string) {
    super(`El aviso de plazo de la reserva ${reservaId} no cumple el contrato del evento`);
  }
}

/** Arma el evento (solo ids y el instante del plazo) y lo valida con el esquema compartido (R3). */
export function eventoDeAvisoDePlazo(
  reservaId: string,
  archivoId: string,
  aviso: AvisoDePlazo,
): EventoDeAvisoParaOutbox {
  const payload = AvisoDePlazoV1.safeParse({
    v: 1,
    reservaId,
    archivoId,
    plazo: aviso.plazo,
    venceEn: aviso.venceEn.toISOString(),
  });
  if (!payload.success) throw new AvisoDePlazoInvalidoError(reservaId);
  return {
    agregado: 'reserva',
    agregadoId: reservaId,
    tipoEvento: tipoDeEventoDelAviso(aviso),
    versionEvento: 1,
    payload: payload.data,
  };
}
