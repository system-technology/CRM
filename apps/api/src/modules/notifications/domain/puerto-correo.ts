import type { MensajeDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';

/**
 * Quien envía de verdad un correo. Lo usa el trabajador; nadie más lo llama.
 *
 * Adaptadores: `CorreoMailpit` (desarrollo), `CorreoEnMemoria` (pruebas y CI). **El adaptador de
 * producción no existe**: elegir un proveedor es una decisión con ADR (CLAUDE.md §10), y hasta
 * entonces `crearCorreo` se niega a arrancar con cualquier otro valor de `MAIL_PROVIDER`.
 */
export abstract class PuertoCorreo {
  abstract enviar(mensaje: MensajeDeCorreo): Promise<void>;
}
