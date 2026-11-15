/**
 * La primitiva AES-256-GCM del repositorio, sin dominio (ADR-0015, concreción 5).
 *
 * La usan el sellado del cuerpo de los webhooks (`inbox/domain/payload-sellado.ts`) y el cifrado
 * de columnas con PII sensible (`cifrado-de-campos.ts`). Cada uno decide su clave y su AAD; aquí
 * solo vive lo que no puede variar entre ellos:
 *
 * - **El nonce se genera aquí dentro, 96 bits aleatorios por cifrado, y no se acepta por
 *   parámetro.** Repetir uno con la misma clave en GCM permite recuperar la clave de autenticación
 *   y falsificar mensajes; un parámetro es algo que alguien reutiliza «para que la prueba sea
 *   determinista».
 * - **La etiqueta es de 128 bits** y se exige ese largo al abrir: una etiqueta truncada es una
 *   autenticación más débil que nadie eligió.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
export const LARGO_CLAVE = 32; // 256 bits
export const LARGO_NONCE = 12; // 96 bits, el tamaño que GCM espera sin re-derivar
export const LARGO_TAG = 16; // 128 bits

export interface Sellado {
  cifrado: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

/** Cifra `claro` con `clave` y lo ata a `aad`. La clave debe medir 32 bytes. */
export function sellarAesGcm(claro: Buffer, clave: Buffer, aad: Buffer): Sellado {
  exigirLargoDeClave(clave);
  const nonce = randomBytes(LARGO_NONCE);
  const cifrador = createCipheriv(ALGORITMO, clave, nonce, { authTagLength: LARGO_TAG });
  cifrador.setAAD(aad);
  const cifrado = Buffer.concat([cifrador.update(claro), cifrador.final()]);
  return { cifrado, nonce, tag: cifrador.getAuthTag() };
}

/**
 * Descifra. Lanza si el contenido, el nonce, la etiqueta, la clave o el AAD no son los suyos: un
 * criptograma que no autentica no se intenta interpretar.
 */
export function abrirAesGcm(s: Sellado, clave: Buffer, aad: Buffer): Buffer {
  exigirLargoDeClave(clave);
  if (s.nonce.length !== LARGO_NONCE) {
    throw new Error(`El nonce debe medir ${LARGO_NONCE} bytes y mide ${s.nonce.length}.`);
  }
  if (s.tag.length !== LARGO_TAG) {
    throw new Error(`La etiqueta debe medir ${LARGO_TAG} bytes y mide ${s.tag.length}.`);
  }
  const descifrador = createDecipheriv(ALGORITMO, clave, s.nonce, { authTagLength: LARGO_TAG });
  descifrador.setAAD(aad);
  descifrador.setAuthTag(s.tag);
  return Buffer.concat([descifrador.update(s.cifrado), descifrador.final()]);
}

/**
 * Una clave de 32 bytes escrita en el entorno, en hexadecimal o en base64, decidido por la forma
 * del texto: 64 caracteres de `[0-9a-f]` son hexadecimal y no pueden ser otra cosa; cualquier otra
 * cosa se intenta como base64. No valida el largo: lo hace quien la usa, con su propio mensaje.
 */
export function decodificarClave(valor: string): Buffer {
  const limpio = valor.trim();
  if (/^[0-9a-fA-F]{64}$/.test(limpio)) return Buffer.from(limpio, 'hex');
  return Buffer.from(limpio, 'base64');
}

function exigirLargoDeClave(clave: Buffer): void {
  if (clave.length !== LARGO_CLAVE) {
    // Solo el largo: la clave misma no sale en ningún mensaje.
    throw new Error(`La clave AES-256-GCM debe medir ${LARGO_CLAVE} bytes y mide ${clave.length}.`);
  }
}
