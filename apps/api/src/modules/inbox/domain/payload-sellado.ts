/**
 * Cifrado en reposo del cuerpo de los webhooks de Meta.
 *
 * **Por qué se cifra.** El cuerpo de un `POST` de WhatsApp trae el teléfono del viajero, el
 * texto de lo que escribió y, en una agencia de viajes, a veces el número de pasaporte o la
 * fecha de nacimiento que manda por chat. Esa tabla vive **sin RLS** —se escribe antes de saber
 * de qué agencia es el mensaje, que es el problema entero del ADR-0008— así que es el único
 * sitio del sistema donde conviven datos de varias agencias sin política que los separe.
 * Cifrarlo es lo que hace tolerable esa ventana. R6, R10 y Ley 1581 de 2012.
 *
 * **AES-256-GCM, y el `recepcion_id` como dato asociado.** El identificador de la fila entra
 * como AAD, no como texto cifrado: eso ata el criptograma a *su* fila. Copiar el contenido de
 * una recepción sobre otra deja de descifrar en vez de pasar inadvertido. Cuesta una línea.
 *
 * **Un nonce nuevo por fila, siempre.** Repetir un nonce con la misma clave en GCM no filtra
 * «un poco»: permite recuperar la clave de autenticación y falsificar mensajes. Por eso se
 * genera aquí dentro y no se acepta por parámetro — un parámetro es algo que alguien puede
 * reutilizar «para que la prueba sea determinista».
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const LARGO_CLAVE = 32; // 256 bits
const LARGO_NONCE = 12; // 96 bits, el tamaño que GCM espera sin re-derivar
const LARGO_TAG = 16;

export interface PayloadSellado {
  cifrado: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

/**
 * Cifra el cuerpo crudo y lo ata a su identificador de recepción.
 *
 * `cuerpo` son los bytes exactos que mandó Meta, los mismos sobre los que se verificó la firma.
 */
export function sellarPayload(cuerpo: Buffer, clave: Buffer, recepcionId: Buffer): PayloadSellado {
  verificarClave(clave);

  const nonce = randomBytes(LARGO_NONCE);
  const cifrador = createCipheriv(ALGORITMO, clave, nonce);
  cifrador.setAAD(recepcionId);

  const cifrado = Buffer.concat([cifrador.update(cuerpo), cifrador.final()]);
  return { cifrado, nonce, tag: cifrador.getAuthTag() };
}

/**
 * Descifra. Lanza si el contenido, el nonce, la etiqueta o el `recepcionId` no son los suyos.
 *
 * Que lance es el comportamiento correcto: un payload que no autentica no es un payload
 * sospechoso que haya que intentar interpretar, es uno que no debe leerse.
 */
export function abrirPayload(sellado: PayloadSellado, clave: Buffer, recepcionId: Buffer): Buffer {
  verificarClave(clave);

  if (sellado.nonce.length !== LARGO_NONCE) {
    throw new Error(`El nonce debe medir ${LARGO_NONCE} bytes y mide ${sellado.nonce.length}.`);
  }
  if (sellado.tag.length !== LARGO_TAG) {
    throw new Error(`La etiqueta debe medir ${LARGO_TAG} bytes y mide ${sellado.tag.length}.`);
  }

  const descifrador = createDecipheriv(ALGORITMO, clave, sellado.nonce);
  descifrador.setAAD(recepcionId);
  descifrador.setAuthTag(sellado.tag);
  return Buffer.concat([descifrador.update(sellado.cifrado), descifrador.final()]);
}

/**
 * Resuelve la clave desde el entorno, **sin respaldo**.
 *
 * Mismo criterio que `resolverCadena` en el guardia de rol: caer a otro valor cuando falta el
 * que toca no produce ningún error visible, y aquí significaría escribir en claro o con una
 * clave que nadie sabe cuál es. Preferimos no arrancar.
 */
export function resolverClavePayload(
  entorno: Record<string, string | undefined>,
  variable: string,
): Buffer {
  const valor = entorno[variable];
  if (!valor) {
    throw new Error(
      `Falta ${variable}. No hay respaldo a propósito: sin ella el cuerpo de los webhooks se ` +
        'guardaría sin cifrar, y esa tabla no tiene RLS.',
    );
  }

  const clave = decodificarClave(valor);
  verificarClave(clave);
  return clave;
}

/**
 * Acepta la clave en hexadecimal o en base64, decidiéndolo por la forma del texto.
 *
 * No es un respaldo cómodo —de esos ya llevamos cuatro—: es una regla determinista. 64
 * caracteres de `[0-9a-f]` son hexadecimal y no pueden ser otra cosa; cualquier otra cosa se
 * intenta como base64. Y si el resultado no mide 32 bytes, se lanza igual.
 *
 * Existe porque el generador de secretos escribe hexadecimal y esto leía base64: la clave de
 * 32 bytes llegaba como 48 y el webhook respondía 500 a todo. Lo encontré mandando un POST de
 * verdad, no compilando.
 */
function decodificarClave(valor: string): Buffer {
  const limpio = valor.trim();
  if (/^[0-9a-fA-F]{64}$/.test(limpio)) return Buffer.from(limpio, 'hex');
  return Buffer.from(limpio, 'base64');
}

function verificarClave(clave: Buffer): void {
  if (clave.length !== LARGO_CLAVE) {
    throw new Error(
      `La clave de payload debe medir ${LARGO_CLAVE} bytes y mide ${clave.length}. ` +
        'Genérala con `scripts/generar-secretos-locales.ps1`.',
    );
  }
}
