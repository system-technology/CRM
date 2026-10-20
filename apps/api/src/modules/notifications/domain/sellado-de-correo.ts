/**
 * Cifrado del trabajo de correo en Redis: AES-256-GCM, con una clave compartida entre la API (que
 * encola) y el trabajador (que envía). Mismo patrón que el staging del webhook de WhatsApp
 * (`payload-sellado` de `inbox`); se repite aquí en vez de importarlo porque los módulos no se
 * importan entre sí (R4).
 *
 * **Por qué.** El mensaje lleva un secreto que no se puede reconstruir desde la base (el token de
 * una invitación, un código de un solo uso): en la base solo está su hash. Redis no tiene RLS ni
 * cifrado, y un panel de colas o una copia lo mostrarían en claro. Con esto, lo que hay en Redis
 * es texto cifrado y solo quien tiene `CORREO_PAYLOAD_KEY` lo abre.
 *
 * **El identificador del trabajo va como dato autenticado (AAD):** un trabajo cifrado no se puede
 * copiar bajo otro identificador sin que el descifrado falle.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { MensajeDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';

const ALGORITMO = 'aes-256-gcm';
const LARGO_CLAVE = 32;
const LARGO_NONCE = 12;
const LARGO_TAG = 16;

/** Lo que viaja por Redis. Nada de esto revela el mensaje. */
export const TrabajoSellado = z.object({
  v: z.literal(1),
  nonce: z.string(),
  tag: z.string(),
  cifrado: z.string(),
});
export type TrabajoSellado = z.infer<typeof TrabajoSellado>;

export function sellarCorreo(
  mensaje: MensajeDeCorreo,
  clave: Buffer,
  idDeTrabajo: string,
): TrabajoSellado {
  verificarClave(clave);
  const nonce = randomBytes(LARGO_NONCE);
  const cifrador = createCipheriv(ALGORITMO, clave, nonce);
  cifrador.setAAD(Buffer.from(idDeTrabajo, 'utf8'));
  const cifrado = Buffer.concat([
    cifrador.update(JSON.stringify(mensaje), 'utf8'),
    cifrador.final(),
  ]);
  return {
    v: 1,
    nonce: nonce.toString('base64'),
    tag: cifrador.getAuthTag().toString('base64'),
    cifrado: cifrado.toString('base64'),
  };
}

/** Abre un trabajo. Lanza si la clave, el identificador o el contenido no cuadran. */
export function abrirCorreo(sellado: unknown, clave: Buffer, idDeTrabajo: string): unknown {
  verificarClave(clave);
  const s = TrabajoSellado.parse(sellado);
  const nonce = Buffer.from(s.nonce, 'base64');
  const tag = Buffer.from(s.tag, 'base64');
  if (nonce.length !== LARGO_NONCE || tag.length !== LARGO_TAG) {
    throw new Error('Trabajo de correo malformado.');
  }
  const descifrador = createDecipheriv(ALGORITMO, clave, nonce);
  descifrador.setAAD(Buffer.from(idDeTrabajo, 'utf8'));
  descifrador.setAuthTag(tag);
  const plano = Buffer.concat([
    descifrador.update(Buffer.from(s.cifrado, 'base64')),
    descifrador.final(),
  ]);
  return JSON.parse(plano.toString('utf8')) as unknown;
}

/** `CORREO_PAYLOAD_KEY`: 32 bytes en hex (64 caracteres) o base64. Sin respaldo. */
export function resolverClaveDeCorreo(entorno: Record<string, string | undefined>): Buffer {
  const valor = entorno['CORREO_PAYLOAD_KEY']?.trim();
  if (!valor) {
    throw new Error(
      'Falta CORREO_PAYLOAD_KEY. No hay respaldo a propósito: sin ella el token de una invitación ' +
        'o un código de acceso viajarían en claro por Redis. Genera una con `openssl rand -base64 32`.',
    );
  }
  const clave = /^[0-9a-fA-F]{64}$/.test(valor)
    ? Buffer.from(valor, 'hex')
    : Buffer.from(valor, 'base64');
  verificarClave(clave);
  return clave;
}

function verificarClave(clave: Buffer): void {
  if (clave.length !== LARGO_CLAVE) {
    throw new Error(`La clave del correo debe medir ${LARGO_CLAVE} bytes y mide ${clave.length}.`);
  }
}
