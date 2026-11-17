/**
 * Errores del contexto de reservas. Códigos estables; el texto en español es para el log.
 *
 * Los usa el consumidor `booking.abrir_archivo`: el despachador guarda solo el `code` en
 * `entregas_de_eventos.ultimo_error`, nunca el mensaje.
 */
import { DomainError, InvariantError } from '@viajapro/domain';

/** La cotización del evento no existe en esa agencia, no está ACEPTADA o la versión no es la aceptada. */
export class VersionAceptadaNoEncontradaError extends DomainError {
  readonly code = 'VERSION_ACEPTADA_NO_ENCONTRADA';
  constructor(
    readonly cotizacionId: string,
    readonly version: number,
  ) {
    super(
      `No hay una versión aceptada ${version} de la cotización ${cotizacionId} en esta agencia`,
    );
  }
}

/** El evento no trae la forma de `CotizacionAceptada` v1: es un defecto del productor, no un reintento. */
export class EventoDeAceptacionInvalidoError extends InvariantError {
  readonly code = 'EVENTO_DE_ACEPTACION_INVALIDO';
  constructor(motivo: string) {
    super(`El evento de aceptación no es válido: ${motivo}`);
  }
}
