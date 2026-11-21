/**
 * Errores del contexto de cobros. Códigos estables; el texto en español es para el log.
 *
 * **Ningún mensaje lleva `nota`, `referencia`, `motivo` ni el valor rechazado**: el filtro global
 * escribe el mensaje en el log, y el libro de cobro no deja texto libre en logs (ADR-0034 §6).
 * Traducción a HTTP: invariante violada = 422, estado que no lo admite = 409, `*_NO_ENCONTRADO` =
 * 404, sin permiso o sin usuario = 403.
 */
import { DomainError, EstadoInvalidoError, InvariantError, ProhibidoError } from '@viajapro/domain';

export class ArchivoDeCobroNoEncontradoError extends DomainError {
  readonly code = 'ARCHIVO_NO_ENCONTRADO';
  constructor(readonly archivoId?: string) {
    // Sin el id en el texto: el 404 de un archivo ajeno es idéntico al de uno inexistente.
    super('No hay un archivo de viaje con ese id en esta agencia');
  }
}

export class MovimientoDeCobroNoEncontradoError extends DomainError {
  readonly code = 'MOVIMIENTO_DE_COBRO_NO_ENCONTRADO';
  constructor(readonly pagoId?: string) {
    super('No hay un movimiento de cobro con ese id en ese archivo de esta agencia');
  }
}

export class PagadorNoEncontradoError extends DomainError {
  readonly code = 'PAGADOR_NO_ENCONTRADO';
  constructor() {
    super('El pagador no es un contacto de esta agencia');
  }
}

export class MonedaDistintaDelArchivoError extends InvariantError {
  readonly code = 'MONEDA_DISTINTA_DEL_ARCHIVO';
  constructor(
    readonly esperada: string,
    readonly recibida: string,
  ) {
    super(`El archivo está en ${esperada} y el movimiento viene en ${recibida}`);
  }
}

export class MontoInvalidoParaElTipoError extends InvariantError {
  readonly code = 'MONTO_INVALIDO_PARA_EL_TIPO';
  constructor(readonly tipo: string) {
    super(`El monto de un ${tipo} es un entero distinto de cero, dentro del tope y con su signo`);
  }
}

export class FechaDePagoFuturaError extends InvariantError {
  readonly code = 'FECHA_DE_PAGO_FUTURA';
  constructor() {
    super('La fecha en que llegó o salió el dinero no puede ser posterior a hoy');
  }
}

export class TipoNoPermitidoParaElEstadoError extends EstadoInvalidoError {
  readonly code = 'TIPO_NO_PERMITIDO_PARA_EL_ESTADO_DEL_ARCHIVO';
  constructor(
    readonly tipo: string,
    readonly estado: string,
  ) {
    super(`Un movimiento ${tipo} no se registra en un archivo ${estado}`);
  }
}

export class DevolucionExcedeLoPagadoError extends InvariantError {
  readonly code = 'DEVOLUCION_EXCEDE_LO_PAGADO';
  constructor() {
    super('La devolución es mayor que lo pagado y no devuelto: lo pagado quedaría en negativo');
  }
}

export class ReversoDejaPagadoNegativoError extends InvariantError {
  readonly code = 'REVERSO_DEJA_LO_PAGADO_NEGATIVO';
  constructor() {
    super('Reversar este pago dejaría lo pagado en negativo: antes hay que reversar la devolución');
  }
}

export class AjusteDejaTotalNegativoError extends InvariantError {
  readonly code = 'AJUSTE_DEJA_EL_TOTAL_NEGATIVO';
  constructor() {
    super('El ajuste dejaría el total del archivo en negativo');
  }
}

export class PenalidadExcedeLoPagadoError extends InvariantError {
  readonly code = 'PENALIDAD_EXCEDE_LO_PAGADO';
  constructor() {
    super('Las penalidades no pueden superar lo pagado y no devuelto');
  }
}

/**
 * Devolver o reversar un pago dejaría una penalidad retenida que nadie pagó (ADR-0034 §3: la
 * penalidad no supera lo pagado neto, y eso se mantiene mientras la penalidad esté vigente).
 */
export class PenalidadRetenidaSinPagarError extends InvariantError {
  readonly code = 'PENALIDAD_RETENIDA_SIN_PAGAR';
  constructor() {
    super(
      'Lo pagado y no devuelto no puede quedar por debajo de las penalidades vigentes; ' +
        'para renunciar a la penalidad, reversa primero la PENALIDAD',
    );
  }
}

/** Otro proceso retiene el candado del archivo: se puede reintentar. 409. */
export class CobroOcupadoError extends EstadoInvalidoError {
  readonly code = 'COBRO_OCUPADO_REINTENTA';
  constructor() {
    super('El cobro de este archivo está ocupado por otra operación; reintenta en un momento');
  }
}

/** El pago deja saldo a favor: hay que confirmarlo con `confirmarSobrepago: true`. */
export class SobrepagoSinConfirmarError extends EstadoInvalidoError {
  readonly code = 'SOBREPAGO_SIN_CONFIRMAR';
  constructor() {
    super('El pago supera el saldo del archivo; confírmalo con confirmarSobrepago');
  }
}

/** La misma clave de idempotencia con otro contenido. */
export class ClaveDeIdempotenciaReutilizadaError extends EstadoInvalidoError {
  readonly code = 'CLAVE_DE_IDEMPOTENCIA_REUTILIZADA';
  constructor() {
    super('La clave de idempotencia ya se usó con un contenido distinto');
  }
}

export class MovimientoYaReversadoError extends EstadoInvalidoError {
  readonly code = 'MOVIMIENTO_YA_REVERSADO';
  constructor() {
    super('Ese movimiento ya fue reversado: un movimiento se reversa una sola vez');
  }
}

export class ReversoDeReversoError extends InvariantError {
  readonly code = 'REVERSO_DE_REVERSO';
  constructor() {
    super('Un reverso no se reversa: registra el movimiento correcto');
  }
}

/** Sesión sin usuario (atajo de desarrollo sin `x-dev-usuario-id`): no hay a quién atribuir el cambio. */
export class SinUsuarioParaRegistrarError extends ProhibidoError {
  readonly code = 'SIN_USUARIO_PARA_REGISTRAR';
  constructor() {
    super('Registrar en el libro de cobro exige un usuario de la agencia');
  }
}

/** La base rechazó el movimiento con un CHECK que la API no anticipó. */
export class MovimientoRechazadoPorLaBaseError extends InvariantError {
  readonly code = 'MOVIMIENTO_RECHAZADO_POR_LA_BASE';
  constructor(readonly restriccion: string | null) {
    super('La base rechazó el movimiento por incumplir una regla del libro de cobro');
  }
}

/**
 * Fallo de la base que no se sabe traducir. Lleva SOLO la clase y el código de Postgres: el mensaje
 * original de un `23514` trae «Failing row contains (…)» con la nota y la referencia. No es un
 * `DomainError`: llega al filtro global como lo inesperado que es (500), igual que
 * `FalloDeEscrituraDeEtiquetas`.
 */
export class FalloDeEscrituraDelLibroError extends Error {
  readonly code = 'FALLO_DE_ESCRITURA_DEL_LIBRO';
  constructor(
    clase: string,
    readonly codigoPg: string | null,
  ) {
    super(`Falló una escritura del libro de cobro (${clase}${codigoPg ? ` ${codigoPg}` : ''}).`);
    this.name = 'FalloDeEscrituraDelLibroError';
  }
}

/** Una suma de la base llegó como `number` o ilegible: perdería precisión, se rechaza. */
export class SumaIlegibleError extends InvariantError {
  readonly code = 'SUMA_DE_COBRO_ILEGIBLE';
  constructor() {
    super('Una suma del libro de cobro no llegó como entero exacto');
  }
}

/**
 * `travel_files.moneda_iso` es un `CHAR(3)` y el contrato admite cuatro monedas. Se valida en vez
 * de forzar el tipo: un `as CodigoMoneda` dejaría pasar una fila con `'XXX'` hasta la pantalla.
 */
export class MonedaDesconocidaEnElLibroError extends InvariantError {
  readonly code = 'MONEDA_DESCONOCIDA';
  constructor(readonly iso: string) {
    super(`'${iso}' no es una moneda habilitada, y viene de un archivo guardado en la base`);
  }
}
