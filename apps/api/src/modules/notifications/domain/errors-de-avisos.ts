/**
 * Errores de las notificaciones en la aplicación (T-254). Códigos estables: el despachador guarda
 * solo el `code` en `entregas_de_eventos.ultimo_error`. El filtro global traduce `*_NO_ENCONTRAD[OA]`
 * a 404.
 */
import { DomainError, InvariantError } from '@viajapro/domain';

/** El evento no trae la forma de `AvisoDePlazoV1`: defecto del productor, no un reintento. */
export class EventoDeAvisoInvalidoError extends InvariantError {
  readonly code = 'EVENTO_DE_AVISO_INVALIDO';
  constructor(motivo: string) {
    super(`El evento de aviso de plazo no es válido: ${motivo}`);
  }
}

/** El archivo/reserva del aviso no existe en esa agencia (o la reserva no es de ese archivo). */
export class ArchivoDelAvisoNoEncontradoError extends DomainError {
  readonly code = 'ARCHIVO_DEL_AVISO_NO_ENCONTRADO';
  constructor(
    readonly archivoId: string,
    readonly reservaId: string,
  ) {
    super(`No existe la reserva ${reservaId} del archivo ${archivoId} en esta agencia`);
  }
}

/** No existe en esta agencia, o no es de este usuario: el mismo error para las dos cosas. */
export class NotificacionNoEncontradaError extends DomainError {
  readonly code = 'NOTIFICACION_NO_ENCONTRADA';
  constructor(readonly notificacionId: string) {
    super(`No existe la notificación ${notificacionId}`);
  }
}
