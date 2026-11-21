/**
 * Errores tipados de las etiquetas (T-325). El filtro global los traduce a HTTP:
 * `*_NO_ENCONTRAD[OA]` a 404, un `InvariantError` a 422, un `EstadoInvalidoError` a 409.
 *
 * **Ningún mensaje lleva el nombre de la etiqueta (R10):** es texto libre de la agencia y puede ser
 * el nombre de una persona, y el filtro global escribe `código: mensaje` en el log. La web ya sabe
 * qué nombre acaba de enviar; si necesita repetirlo en pantalla, lo pone ella.
 */
import { EstadoInvalidoError, DomainError, InvariantError } from '@viajapro/domain';

/**
 * No existe, o es de OTRA agencia: la misma respuesta a propósito (un 403 confirmaría que existe).
 * El id de una etiqueta ajena no se distingue del de una que nunca existió.
 */
export class EtiquetaNoEncontradaError extends DomainError {
  readonly code = 'ETIQUETA_NO_ENCONTRADA';

  constructor() {
    super('No existe esa etiqueta.');
  }
}

/** «Pagado» y « pagado » chocan: única por agencia sobre `lower(btrim(nombre))`. */
export class EtiquetaDuplicadaError extends EstadoInvalidoError {
  readonly code = 'ETIQUETA_DUPLICADA';

  constructor() {
    super('Ya existe una etiqueta con ese nombre. Usa otro nombre.');
  }
}

/** Un nombre que la base rechaza por su forma (23514) aunque el borde lo haya dejado pasar. */
export class EtiquetaInvalidaError extends InvariantError {
  readonly code = 'ETIQUETA_INVALIDA';

  constructor() {
    super('La etiqueta no cumple la forma esperada: revisa el nombre y el color.');
  }
}

export class TopeDeEtiquetasDeLaAgenciaError extends InvariantError {
  readonly code = 'TOPE_DE_ETIQUETAS_DE_LA_AGENCIA';

  constructor(readonly tope: number) {
    super(
      `La agencia ya tiene ${tope} etiquetas, que es el máximo. Elimina una que no uses antes de crear otra.`,
    );
  }
}

export class TopeDeEtiquetasDeLaConversacionError extends InvariantError {
  readonly code = 'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION';

  constructor(readonly tope: number) {
    super(`Una conversación admite hasta ${tope} etiquetas. Quita una antes de poner otra.`);
  }
}
