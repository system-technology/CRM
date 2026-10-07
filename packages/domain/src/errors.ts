/**
 * Errores de dominio.
 *
 * Son clases tipadas con código estable, no cadenas. El código (`SERVICE_WINDOW_CLOSED`,
 * `MONEDA_INVALIDA`) es contrato: la interfaz lo traduce a un mensaje para el asesor, y el filtro
 * global lo traduce a HTTP. El mensaje en español es para el log y para depurar, no para la UI.
 *
 * Nunca `throw new Error('algo falló')`: eso obliga a quien lo atrapa a leer el texto para saber
 * qué pasó, y entonces el texto se vuelve contrato sin que nadie lo decida.
 */

export abstract class DomainError extends Error {
  /** Código estable. Es lo que consume la interfaz; el mensaje puede cambiar, esto no. */
  abstract readonly code: string;

  constructor(mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
    // Necesario al extender Error con target ES2015+ compilado.
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, new.target);
  }

  /** Forma serializable, para logs estructurados y respuestas de API. */
  aJSON(): { code: string; message: string; name: string } {
    return { code: this.code, message: this.message, name: this.name };
  }
}

/** La entrada viola una invariante del dominio. Corresponde a un 422 en HTTP. */
export abstract class InvariantError extends DomainError {}

/** La operación no está permitida en el estado actual. Corresponde a un 409. */
export abstract class EstadoInvalidoError extends DomainError {}
