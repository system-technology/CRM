/**
 * La reserva (`Booking`) con un mayorista y su máquina de estados (ADR-0024 §3.4). Lógica pura: sin
 * base de datos, sin reloj (el instante llega por parámetro) y sin framework.
 *
 * ```
 * PENDIENTE → SOLICITADA → [EN_ESPERA] → CONFIRMADA → ABONADA_AL_PROVEEDOR → PAGADA_AL_PROVEEDOR
 * CANCELADA: desde PENDIENTE … ABONADA_AL_PROVEEDOR
 * CAIDA:     desde SOLICITADA … ABONADA_AL_PROVEEDOR
 * ```
 *
 * Lo que la tabla exige por CHECK (confirmada sin time limit, abonada sin fecha de pago total) se
 * comprueba aquí ANTES, con un error tipado: el CHECK es la red, no el mensaje al asesor.
 * `transitar` devuelve la reserva nueva y no toca la recibida.
 */
import {
  MotivoDeCaidaNoAplicaError,
  MotivoDeCaidaRequeridoError,
  PagoTotalRequeridoError,
  PlazoNoAplicaError,
  PlazoPosteriorALaSalidaError,
  PlazosIncoherentesError,
  ReservaCerradaError,
  TimeLimitRequeridoError,
  TransicionDeReservaInvalidaError,
} from './errors-de-operacion.js';

export type EstadoReserva =
  | 'PENDIENTE'
  | 'SOLICITADA'
  | 'EN_ESPERA'
  | 'CONFIRMADA'
  | 'ABONADA_AL_PROVEEDOR'
  | 'PAGADA_AL_PROVEEDOR'
  | 'CAIDA'
  | 'CANCELADA';

export type MotivoCaida =
  'TIME_LIMIT_VENCIDO' | 'PAGO_TOTAL_VENCIDO' | 'SIN_CUPO' | 'NEGADA_EN_ESPERA' | 'OTRO';

export interface Reserva {
  id: string;
  mayoristaId: string | null;
  mayoristaNombre: string | null;
  /** R8: unidad mínima de la moneda. `null` = desconocido, que no es cero. */
  netoUnidades: bigint | null;
  monedaIso: string;
  localizador: string | null;
  estado: EstadoReserva;
  solicitadaEn: Date | null;
  confirmadaEn: Date | null;
  abonadaEn: Date | null;
  pagadaEn: Date | null;
  timeLimit: Date | null;
  pagoTotalVenceEn: Date | null;
  motivoCaida: MotivoCaida | null;
  nota: string | null;
  avisoTimeLimitProximoEn: Date | null;
  avisoTimeLimitVencidoEn: Date | null;
  avisoPagoTotalProximoEn: Date | null;
  avisoPagoTotalVencidoEn: Date | null;
}

/**
 * Lo que pide el asesor. En los opcionales, `undefined` = conservar y `null` = borrar. Repetir el
 * mismo cambio no modifica nada: las fechas de paso se escriben al ENTRAR a un estado.
 */
export interface CambioDeReserva {
  estado: EstadoReserva;
  localizador?: string | null | undefined;
  timeLimit?: Date | null | undefined;
  pagoTotalVenceEn?: Date | null | undefined;
  motivoCaida?: MotivoCaida | null | undefined;
  nota?: string | null | undefined;
}

export interface ContextoDeTransicion {
  ahora: Date;
  /** `AAAA-MM-DD`: la salida del archivo. */
  fechaSalida: string;
  /** Zona IANA de la agencia: solo para comparar un plazo con la fecha de salida (R9). */
  zonaHoraria: string;
}

const TRANSICIONES: Readonly<Record<EstadoReserva, readonly EstadoReserva[]>> = {
  PENDIENTE: ['SOLICITADA', 'CANCELADA'],
  SOLICITADA: ['EN_ESPERA', 'CONFIRMADA', 'CAIDA', 'CANCELADA'],
  EN_ESPERA: ['CONFIRMADA', 'CAIDA', 'CANCELADA'],
  CONFIRMADA: ['ABONADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA'],
  ABONADA_AL_PROVEEDOR: ['PAGADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA'],
  PAGADA_AL_PROVEEDOR: [],
  CAIDA: [],
  CANCELADA: [],
};

const CERRADAS: ReadonlySet<EstadoReserva> = new Set(['PAGADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA']);

/** Dónde se puede fijar cada plazo: el que se vigila en ese estado. */
const ADMITEN_TIME_LIMIT: ReadonlySet<EstadoReserva> = new Set(['CONFIRMADA']);
const ADMITEN_PAGO_TOTAL: ReadonlySet<EstadoReserva> = new Set([
  'CONFIRMADA',
  'ABONADA_AL_PROVEEDOR',
]);

/** Una reserva viva es la que todavía cuenta para el avance del archivo. */
export const estaViva = (r: Pick<Reserva, 'estado'>): boolean =>
  r.estado !== 'CAIDA' && r.estado !== 'CANCELADA';

export const transicionesDesde = (estado: EstadoReserva): readonly EstadoReserva[] =>
  TRANSICIONES[estado];

const mismoInstante = (a: Date | null, b: Date | null): boolean =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** El día calendario de un instante en la zona de la agencia, `AAAA-MM-DD`. */
export function diaEnZona(instante: Date, zonaHoraria: string): string {
  // `en-CA` formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

export function transitar(
  actual: Reserva,
  cambio: CambioDeReserva,
  contexto: ContextoDeTransicion,
): Reserva {
  const desde = actual.estado;
  const hasta = cambio.estado;
  const entra = hasta !== desde;

  if (entra && !TRANSICIONES[desde].includes(hasta)) {
    throw new TransicionDeReservaInvalidaError(desde, hasta);
  }

  const localizador = cambio.localizador === undefined ? actual.localizador : cambio.localizador;
  const nota = cambio.nota === undefined ? actual.nota : cambio.nota;
  const timeLimit = cambio.timeLimit === undefined ? actual.timeLimit : cambio.timeLimit;
  const pagoTotalVenceEn =
    cambio.pagoTotalVenceEn === undefined ? actual.pagoTotalVenceEn : cambio.pagoTotalVenceEn;

  const cambiaTimeLimit = !mismoInstante(timeLimit, actual.timeLimit);
  const cambiaPagoTotal = !mismoInstante(pagoTotalVenceEn, actual.pagoTotalVenceEn);

  // Una reserva terminada solo admite corregir localizador y nota.
  if (!entra && CERRADAS.has(desde)) {
    const motivoDistinto =
      cambio.motivoCaida !== undefined && cambio.motivoCaida !== actual.motivoCaida;
    if (cambiaTimeLimit || cambiaPagoTotal || motivoDistinto) throw new ReservaCerradaError(desde);
  }

  // Motivo de caída: lo lleva la CAIDA y solo ella.
  let motivoCaida: MotivoCaida | null;
  if (hasta === 'CAIDA') {
    motivoCaida = cambio.motivoCaida === undefined ? actual.motivoCaida : cambio.motivoCaida;
    if (motivoCaida === null) throw new MotivoDeCaidaRequeridoError();
  } else {
    if (cambio.motivoCaida !== undefined && cambio.motivoCaida !== null) {
      throw new MotivoDeCaidaNoAplicaError();
    }
    motivoCaida = null;
  }

  // Un plazo solo se fija donde se vigila; repetir el valor que ya tiene no es un cambio.
  if (cambiaTimeLimit && timeLimit !== null && !ADMITEN_TIME_LIMIT.has(hasta)) {
    throw new PlazoNoAplicaError('timeLimit', hasta);
  }
  if (cambiaPagoTotal && pagoTotalVenceEn !== null && !ADMITEN_PAGO_TOTAL.has(hasta)) {
    throw new PlazoNoAplicaError('pagoTotalVenceEn', hasta);
  }
  // Borrar un plazo que el estado exige no es posible (la base lo rechazaría).
  if (
    hasta === 'CONFIRMADA' ||
    hasta === 'ABONADA_AL_PROVEEDOR' ||
    hasta === 'PAGADA_AL_PROVEEDOR'
  ) {
    if (timeLimit === null) throw new TimeLimitRequeridoError();
  }
  if (hasta === 'ABONADA_AL_PROVEEDOR' || hasta === 'PAGADA_AL_PROVEEDOR') {
    if (pagoTotalVenceEn === null) throw new PagoTotalRequeridoError();
  }

  if (timeLimit !== null && pagoTotalVenceEn !== null && timeLimit > pagoTotalVenceEn) {
    throw new PlazosIncoherentesError();
  }
  // Ninguno posterior a la salida, en la zona de la agencia. Solo se revisa el que cambia: una
  // reserva vieja no queda bloqueada por un plazo que ya estaba.
  if (cambiaTimeLimit && timeLimit !== null) {
    if (diaEnZona(timeLimit, contexto.zonaHoraria) > contexto.fechaSalida) {
      throw new PlazoPosteriorALaSalidaError('timeLimit', contexto.fechaSalida);
    }
  }
  if (cambiaPagoTotal && pagoTotalVenceEn !== null) {
    if (diaEnZona(pagoTotalVenceEn, contexto.zonaHoraria) > contexto.fechaSalida) {
      throw new PlazoPosteriorALaSalidaError('pagoTotalVenceEn', contexto.fechaSalida);
    }
  }

  const siguiente: Reserva = {
    ...actual,
    estado: hasta,
    localizador,
    nota,
    timeLimit,
    pagoTotalVenceEn,
    motivoCaida,
    // Cambiar un plazo borra su par de marcas de aviso, en la misma escritura (§3.4).
    ...(cambiaTimeLimit ? { avisoTimeLimitProximoEn: null, avisoTimeLimitVencidoEn: null } : {}),
    ...(cambiaPagoTotal ? { avisoPagoTotalProximoEn: null, avisoPagoTotalVencidoEn: null } : {}),
  };

  if (entra) {
    const { ahora } = contexto;
    if (hasta === 'SOLICITADA' || hasta === 'EN_ESPERA') siguiente.solicitadaEn ??= ahora;
    if (hasta === 'CONFIRMADA') siguiente.confirmadaEn = ahora;
    if (hasta === 'ABONADA_AL_PROVEEDOR') siguiente.abonadaEn = ahora;
    if (hasta === 'PAGADA_AL_PROVEEDOR') siguiente.pagadaEn = ahora;
  }
  return siguiente;
}
