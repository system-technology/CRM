/**
 * Elige el adaptador del puerto de correo según `MAIL_PROVIDER`. Sin valor por omisión.
 *
 *   mailpit  desarrollo local (solo con APP_ENV=local)
 *   memoria  pruebas y CI
 *   otro     **se niega**: el adaptador de producción está pendiente de un ADR (CLAUDE.md §10).
 *
 * TODO(declarado, ADR de correo transaccional): adaptador de producción detrás de este puerto.
 */
import { PuertoCorreo } from '../domain/puerto-correo.js';
import { CorreoEnMemoria } from './correo.en-memoria.js';
import { CorreoMailpit, transporteDeMailpit } from './correo.mailpit.js';

export function crearCorreo(entorno: Record<string, string | undefined>): PuertoCorreo {
  const proveedor = entorno['MAIL_PROVIDER'];
  if (proveedor === 'memoria') return new CorreoEnMemoria();
  if (proveedor === 'mailpit') {
    if (entorno['APP_ENV'] !== 'local') {
      throw new Error('MAIL_PROVIDER=mailpit solo se permite con APP_ENV=local.');
    }
    return new CorreoMailpit(
      transporteDeMailpit(entorno),
      entorno['MAIL_FROM'] ?? 'ViajaPro <no-reply@viajapro.test>',
    );
  }
  throw new Error(
    `MAIL_PROVIDER=${proveedor ?? '(sin definir)'} no tiene adaptador: el de producción está ` +
      'pendiente de un ADR (CLAUDE.md §10). Usa mailpit en local o memoria en pruebas.',
  );
}
