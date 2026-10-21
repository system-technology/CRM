/**
 * Elige el adaptador del puerto de correo según `MAIL_PROVIDER`. Sin valor por omisión.
 *
 *   mailpit   desarrollo local (solo con APP_ENV=local)
 *   memoria   pruebas y CI
 *   postmark  producción (ADR-0012). Exige `POSTMARK_SERVER_TOKEN`; sin él **aborta**.
 *   otro      se niega.
 *
 * Nunca hay respaldo silencioso a Mailpit ni a memoria: un proveedor mal escrito o un token que
 * falta detienen el arranque.
 */
import { PuertoCorreo } from '../domain/puerto-correo.js';
import { CorreoEnMemoria } from './correo.en-memoria.js';
import { CorreoMailpit, transporteDeMailpit } from './correo.mailpit.js';
import { CorreoPostmark } from './correo.postmark.js';

/**
 * Lo que la API comprueba al arrancar aunque no envíe ella: con `postmark`, sin token no arranca.
 * Así el despliegue falla a la vista y no al primer OTP.
 */
export function validarConfiguracionDeCorreo(entorno: Record<string, string | undefined>): void {
  if (entorno['MAIL_PROVIDER'] === 'postmark' && !entorno['POSTMARK_SERVER_TOKEN']) {
    throw new Error('MAIL_PROVIDER=postmark exige POSTMARK_SERVER_TOKEN (sin respaldo).');
  }
}

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
  if (proveedor === 'postmark') {
    validarConfiguracionDeCorreo(entorno);
    return new CorreoPostmark({
      token: entorno['POSTMARK_SERVER_TOKEN'] ?? '',
      remitente: entorno['MAIL_FROM'] ?? 'ViajaPro <no-reply@viajapro.test>',
      stream: entorno['POSTMARK_MESSAGE_STREAM'] || 'outbound',
    });
  }
  throw new Error(
    `MAIL_PROVIDER=${proveedor ?? '(sin definir)'} no tiene adaptador. Usa postmark en ` +
      'producción, mailpit en local o memoria en pruebas.',
  );
}
