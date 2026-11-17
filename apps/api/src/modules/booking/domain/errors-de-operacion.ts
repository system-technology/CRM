/**
 * Errores de la operación del archivo de viaje (T-242, ADR-0024 §3.3–§3.5). Códigos estables; el
 * filtro global traduce `*_NO_ENCONTRAD[OA]` a 404, las invariantes a 422 y los estados inválidos
 * a 409. El texto es para el log: nombres de pasajeros y notas nunca entran en un mensaje.
 */
import { DomainError, EstadoInvalidoError, InvariantError, ProhibidoError } from '@viajapro/domain';

/** No existe en esta agencia, o no es de ella: el mismo error para las dos cosas (RLS). */
export class ArchivoNoEncontradoError extends DomainError {
  readonly code = 'ARCHIVO_NO_ENCONTRADO';
  constructor(readonly archivoId: string) {
    super(`No existe el archivo de viaje ${archivoId} en esta agencia`);
  }
}

/** La reserva no existe en esta agencia o no pertenece a ESE archivo. */
export class ReservaNoEncontradaError extends DomainError {
  readonly code = 'RESERVA_NO_ENCONTRADA';
  constructor(
    readonly archivoId: string,
    readonly reservaId: string,
  ) {
    super(`No existe la reserva ${reservaId} en el archivo ${archivoId}`);
  }
}

/** La transición no está en el mapa de estados de ADR-0024 §3.4. */
export class TransicionDeReservaInvalidaError extends EstadoInvalidoError {
  readonly code = 'TRANSICION_DE_RESERVA_INVALIDA';
  constructor(
    readonly desde: string,
    readonly hasta: string,
  ) {
    super(`Una reserva ${desde} no puede pasar a ${hasta}`);
  }
}

/** La reserva ya terminó (pagada, caída o cancelada): solo admite corregir localizador y nota. */
export class ReservaCerradaError extends EstadoInvalidoError {
  readonly code = 'RESERVA_CERRADA';
  constructor(readonly estado: string) {
    super(`La reserva está ${estado}: solo se pueden corregir el localizador y la nota`);
  }
}

export class ArchivoCanceladoError extends EstadoInvalidoError {
  readonly code = 'ARCHIVO_CANCELADO';
  constructor(readonly archivoId: string) {
    super(`El archivo de viaje ${archivoId} está cancelado y no admite cambios`);
  }
}

export class ArchivoYaCanceladoError extends EstadoInvalidoError {
  readonly code = 'ARCHIVO_YA_CANCELADO';
  constructor(readonly archivoId: string) {
    super(`El archivo de viaje ${archivoId} ya estaba cancelado`);
  }
}

/** Pagado el total al mayorista, cancelar es penalidad, y la penalidad está fuera (ADR-0024 §3.4). */
export class ArchivoConReservaPagadaError extends EstadoInvalidoError {
  readonly code = 'ARCHIVO_CON_RESERVA_PAGADA';
  constructor(readonly archivoId: string) {
    super(
      `El archivo ${archivoId} tiene una reserva pagada al proveedor: cancelarlo es una penalidad, que aún no se gestiona aquí`,
    );
  }
}

export class TimeLimitRequeridoError extends InvariantError {
  readonly code = 'TIME_LIMIT_REQUERIDO';
  constructor() {
    super('Confirmar una reserva exige el time limit que dio el mayorista');
  }
}

export class PagoTotalRequeridoError extends InvariantError {
  readonly code = 'PAGO_TOTAL_REQUERIDO';
  constructor() {
    super('Registrar el abono exige la fecha de pago total al mayorista');
  }
}

export class MotivoDeCaidaRequeridoError extends InvariantError {
  readonly code = 'MOTIVO_DE_CAIDA_REQUERIDO';
  constructor() {
    super('Marcar una reserva como caída exige el motivo');
  }
}

export class MotivoDeCaidaNoAplicaError extends InvariantError {
  readonly code = 'MOTIVO_DE_CAIDA_NO_APLICA';
  constructor() {
    super('Solo una reserva CAIDA lleva motivo de caída');
  }
}

/** Se intentó fijar un plazo en un estado donde no se vigila. */
export class PlazoNoAplicaError extends InvariantError {
  readonly code = 'PLAZO_NO_APLICA';
  constructor(
    readonly plazo: 'timeLimit' | 'pagoTotalVenceEn',
    readonly estado: string,
  ) {
    super(`El plazo ${plazo} no se puede fijar en una reserva ${estado}`);
  }
}

export class PlazosIncoherentesError extends InvariantError {
  readonly code = 'PLAZOS_INCOHERENTES';
  constructor() {
    super('El time limit no puede ser posterior a la fecha de pago total');
  }
}

export class PlazoPosteriorALaSalidaError extends InvariantError {
  readonly code = 'PLAZO_POSTERIOR_A_LA_SALIDA';
  constructor(
    readonly plazo: 'timeLimit' | 'pagoTotalVenceEn',
    readonly fechaSalida: string,
  ) {
    super(`El plazo ${plazo} cae después de la salida (${fechaSalida}) en la zona de la agencia`);
  }
}

export class TitularInvalidoError extends InvariantError {
  readonly code = 'TITULAR_INVALIDO';
  constructor(readonly cantidad: number) {
    super(`Debe haber exactamente un titular entre los pasajeros (hay ${cantidad})`);
  }
}

export class EdadRequeridaError extends InvariantError {
  readonly code = 'EDAD_REQUERIDA';
  constructor(
    readonly posicion: number,
    readonly tipo: string,
  ) {
    super(`El pasajero en la posición ${posicion} (${tipo}) necesita la edad al viaje`);
  }
}

export class NotaDeCancelacionRequeridaError extends InvariantError {
  readonly code = 'NOTA_DE_CANCELACION_REQUERIDA';
  constructor() {
    super('Con el motivo OTRO la nota de cancelación es obligatoria');
  }
}

/** La cancelación se registra con quién la hizo (CHECK de la tabla): sin usuario no se cancela. */
export class CancelacionSinUsuarioError extends ProhibidoError {
  readonly code = 'CANCELACION_SIN_USUARIO';
  constructor() {
    super('Cancelar un archivo exige un usuario identificado');
  }
}
