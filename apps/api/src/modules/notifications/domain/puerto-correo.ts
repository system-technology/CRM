import type { MensajeDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';

/**
 * Quien envía de verdad un correo. Lo usa el trabajador; nadie más lo llama.
 *
 * Adaptadores: `CorreoPostmark` (producción, ADR-0012), `CorreoMailpit` (desarrollo) y
 * `CorreoEnMemoria` (CI). Los fallos se lanzan como `ErrorDeCorreo`.
 */
export abstract class PuertoCorreo {
  abstract enviar(mensaje: MensajeDeCorreo): Promise<void>;
}
