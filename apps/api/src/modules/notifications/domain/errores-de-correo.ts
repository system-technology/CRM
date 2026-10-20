/**
 * Fallos de envío de correo, tipados. Ninguno guarda el `Message` del proveedor, el destinatario
 * ni el contenido (R10): solo un código numérico, que es lo único que se puede registrar.
 */
export abstract class ErrorDeCorreo extends Error {
  /** `ErrorCode` del proveedor, o null si no hubo respuesta (red, timeout). */
  readonly codigo: number | null;
  readonly estadoHttp: number | null;
  constructor(mensaje: string, codigo: number | null, estadoHttp: number | null) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
  }
}

/** Red, timeout, 429 o 5xx: la cola puede reintentar. */
export class ErrorDeCorreoTransitorio extends ErrorDeCorreo {}

/** 4xx (token, validación, destinatario suprimido): reintentar no lo arregla. */
export class ErrorDeCorreoDefinitivo extends ErrorDeCorreo {}
