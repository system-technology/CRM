/**
 * Errores tipados de la bandeja. El filtro global los traduce a HTTP: `*_NO_ENCONTRAD[OA]` a 404,
 * un `InvariantError` a 422, un `EstadoInvalidoError` a 409.
 */
import { DomainError, EstadoInvalidoError, InvariantError, ProhibidoError } from '@viajapro/domain';

/**
 * No existe, o existe pero ESTE miembro no la ve. **Es la misma respuesta a propósito**: un 403 en
 * una conversación ajena confirmaría que existe, y el id de una conversación es un dato de otro
 * asesor (`docs/01-producto/12-visibilidad-de-conversaciones.md`, CA3).
 */
export class ConversacionNoEncontradaError extends DomainError {
  readonly code = 'CONVERSACION_NO_ENCONTRADA';

  constructor() {
    super('No existe esa conversación.');
  }
}

export class AdjuntoNoEncontradoError extends DomainError {
  readonly code = 'ADJUNTO_NO_ENCONTRADO';

  constructor() {
    super('No existe ese adjunto en esa conversación.');
  }
}

/**
 * El destino de una asignación no existe en esta agencia, o está dado de baja. Un solo código
 * para ambos casos y para «es de otra agencia»: distinguirlos serviría para sondear usuarios.
 */
export class UsuarioNoAsignableError extends InvariantError {
  readonly code = 'USUARIO_NO_ASIGNABLE';

  constructor() {
    super('Ese usuario no puede recibir la conversación.');
  }
}

/** Fuera de la ventana de 24 h no sale texto libre: hay que usar una plantilla. */
export class VentanaCerradaError extends EstadoInvalidoError {
  readonly code = 'VENTANA_CERRADA';

  constructor() {
    super('La ventana de servicio de 24 horas está cerrada: solo se pueden enviar plantillas.');
  }
}

/** Alguien más cambió la conversación entre que se leyó y se escribió. Se reintenta. */
export class ConversacionModificadaError extends EstadoInvalidoError {
  readonly code = 'CONVERSACION_MODIFICADA';

  constructor() {
    super('La conversación cambió mientras se procesaba. Inténtalo de nuevo.');
  }
}

/** La misma clave de idempotencia ya se usó en OTRA conversación. */
export class ClaveDeIdempotenciaEnUsoError extends EstadoInvalidoError {
  readonly code = 'CLAVE_DE_IDEMPOTENCIA_EN_USO';

  constructor() {
    super('Esa clave de idempotencia ya se usó en otra conversación.');
  }
}

export class CursorInvalidoError extends InvariantError {
  readonly code = 'CURSOR_INVALIDO';

  constructor() {
    super('El cursor de paginación no es válido.');
  }
}

/** La acción exige un usuario de la agencia detrás de la petición (no el atajo de desarrollo sin usuario). */
export class SinUsuarioError extends ProhibidoError {
  readonly code = 'SIN_USUARIO';

  constructor() {
    super('Esta acción requiere un usuario de la agencia.');
  }
}
