/**
 * Errores de la gestión por id de vigencias y tarifas (ADR-0017 §4.1).
 *
 * Los códigos que terminan en `_NO_ENCONTRADO` el filtro global los traduce a 404; los
 * `EstadoInvalidoError`, a 409; los `InvariantError`, a 422.
 */

import { EstadoInvalidoError, DomainError, InvariantError } from '@viajapro/domain';

export class VigenciaNoEncontradaError extends DomainError {
  readonly code = 'VIGENCIA_NO_ENCONTRADO';
  constructor(readonly vigenciaId: string) {
    super(`No existe la vigencia ${vigenciaId} en esta agencia`);
  }
}

export class TarifaNoEncontradaError extends DomainError {
  readonly code = 'TARIFA_NO_ENCONTRADO';
  constructor(readonly tarifaId: string) {
    super(`No existe la tarifa ${tarifaId} en esta agencia`);
  }
}

export class MayoristaNoEncontradoError extends DomainError {
  readonly code = 'MAYORISTA_NO_ENCONTRADO';
  constructor(readonly mayoristaId: string) {
    super(`No existe el mayorista ${mayoristaId} en esta agencia`);
  }
}

/**
 * El resultado dejaría dos vigencias igual de específicas sobre una misma fecha. Es el mismo
 * empate que detecta `resolverVigencia` en el cotizador: no se elige en silencio, no se guarda.
 */
export class VigenciaEmpatadaError extends EstadoInvalidoError {
  readonly code = 'VIGENCIA_EMPATADA';
}

/** Ya hay otra vigencia del paquete con esa misma ventana de fechas, o una tarifa con ese nombre. */
export class VigenciaDuplicadaError extends EstadoInvalidoError {
  readonly code = 'VIGENCIA_DUPLICADA';
  constructor(readonly ventana: string) {
    super(`El paquete ya tiene una vigencia ${ventana} con datos distintos a los enviados`);
  }
}

export class TarifaDuplicadaError extends EstadoInvalidoError {
  readonly code = 'TARIFA_DUPLICADA';
  constructor(readonly nombre: string) {
    super(`La vigencia ya tiene una tarifa '${nombre}' con datos distintos a los enviados`);
  }
}

/** La ventana resultante de una edición no es una vigencia válida. */
export class VigenciaInvalidaError extends InvariantError {
  readonly code = 'VIGENCIA_INVALIDA';
}
