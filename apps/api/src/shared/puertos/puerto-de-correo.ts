/**
 * El puerto por el que otros contextos piden enviar un correo, sin saber cómo sale.
 * R4, R5 y CLAUDE.md §10 (ningún servicio externo sin puerto).
 *
 * **Pedir un correo es ENCOLARLO**, no enviarlo: el efecto externo pasa por cola (R5) y lo hace
 * un trabajador, con reintentos. Lo implementa `notifications`. Quien lo usa no importa ese módulo.
 *
 * `claveDeIdempotencia` es el identificador del trabajo: pedir dos veces lo mismo con la misma
 * clave encola una sola vez. Una clave aleatoria significa «cada petición es un correo distinto»
 * (un código de un solo uso); una derivada del hecho (el hash de una invitación) significa «este
 * correo existe una sola vez, lo pida quien lo pida». Solo caracteres `[A-Za-z0-9_-]`.
 *
 * **Los correos de este sistema llevan secretos** (un token de invitación, un código). Por eso el
 * trabajo se borra de la cola al completarse y no se registra su contenido.
 */
export interface MensajeDeCorreo {
  para: string;
  asunto: string;
  /** Texto plano. Sin HTML: nada que ejecutar ni que maquetar en una invitación. */
  texto: string;
}

export abstract class PuertoColaDeCorreo {
  abstract encolar(mensaje: MensajeDeCorreo, claveDeIdempotencia: string): Promise<void>;
}
