/**
 * De un `CampoCifrado` a las cuatro columnas que Prisma espera, y de vuelta. Sin importar Prisma:
 * solo la forma. Tenerlas aquí evita escribir los cuatro nombres a mano en cada adaptador (y
 * equivocarse de uno).
 */
import type { CampoCifrado, CampoCifradoNulable } from './puerto-de-cifrado.js';

/** Las cuatro columnas a nulo: un valor que se borra (p. ej. preferencias vaciadas). */
const NULAS = { cifrado: null, nonce: null, tag: null, claveVersion: null } as const;

/** `mensajes.texto` y `notas_internas.texto`. */
export function columnasDeTexto(c: CampoCifrado) {
  return {
    textoCifrado: c.cifrado,
    textoNonce: c.nonce,
    textoTag: c.tag,
    textoClaveVersion: c.claveVersion,
  };
}

/** `conversaciones.ultimo_mensaje_texto`. */
export function columnasDeUltimoMensaje(c: CampoCifrado) {
  return {
    ultimoMensajeTextoCifrado: c.cifrado,
    ultimoMensajeTextoNonce: c.nonce,
    ultimoMensajeTextoTag: c.tag,
    ultimoMensajeTextoClaveVersion: c.claveVersion,
  };
}

/** `contactos.preferencias`; con `null`, las cuatro columnas a nulo. */
export function columnasDePreferencias(c: CampoCifrado | null) {
  const v = c ?? NULAS;
  return {
    preferenciasCifrado: v.cifrado,
    preferenciasNonce: v.nonce,
    preferenciasTag: v.tag,
    preferenciasClaveVersion: v.claveVersion,
  };
}

/** `adjuntos.nombre_archivo`. */
export function columnasDeNombreDeArchivo(c: CampoCifrado) {
  return {
    nombreArchivoCifrado: c.cifrado,
    nombreArchivoNonce: c.nonce,
    nombreArchivoTag: c.tag,
    nombreArchivoClaveVersion: c.claveVersion,
  };
}

// ----------------------------------------------------------------------------- lectura

export const SELECCION_DE_TEXTO = {
  textoCifrado: true,
  textoNonce: true,
  textoTag: true,
  textoClaveVersion: true,
} as const;

export const SELECCION_DE_ULTIMO_MENSAJE = {
  ultimoMensajeTextoCifrado: true,
  ultimoMensajeTextoNonce: true,
  ultimoMensajeTextoTag: true,
  ultimoMensajeTextoClaveVersion: true,
} as const;

export const SELECCION_DE_PREFERENCIAS = {
  preferenciasCifrado: true,
  preferenciasNonce: true,
  preferenciasTag: true,
  preferenciasClaveVersion: true,
} as const;

export const SELECCION_DE_NOMBRE_DE_ARCHIVO = {
  nombreArchivoCifrado: true,
  nombreArchivoNonce: true,
  nombreArchivoTag: true,
  nombreArchivoClaveVersion: true,
} as const;

type Bytes = Uint8Array | null;

export function campoDeTexto(f: {
  textoCifrado: Bytes;
  textoNonce: Bytes;
  textoTag: Bytes;
  textoClaveVersion: number | null;
}): CampoCifradoNulable {
  return {
    cifrado: f.textoCifrado,
    nonce: f.textoNonce,
    tag: f.textoTag,
    claveVersion: f.textoClaveVersion,
  };
}

/** Para `notas_internas.texto`, NOT NULL en la base. */
export function campoDeTextoObligatorio(f: {
  textoCifrado: Uint8Array;
  textoNonce: Uint8Array;
  textoTag: Uint8Array;
  textoClaveVersion: number;
}): CampoCifrado {
  return {
    cifrado: Buffer.from(f.textoCifrado),
    nonce: Buffer.from(f.textoNonce),
    tag: Buffer.from(f.textoTag),
    claveVersion: f.textoClaveVersion,
  };
}

export function campoDeUltimoMensaje(f: {
  ultimoMensajeTextoCifrado: Bytes;
  ultimoMensajeTextoNonce: Bytes;
  ultimoMensajeTextoTag: Bytes;
  ultimoMensajeTextoClaveVersion: number | null;
}): CampoCifradoNulable {
  return {
    cifrado: f.ultimoMensajeTextoCifrado,
    nonce: f.ultimoMensajeTextoNonce,
    tag: f.ultimoMensajeTextoTag,
    claveVersion: f.ultimoMensajeTextoClaveVersion,
  };
}

export function campoDePreferencias(f: {
  preferenciasCifrado: Bytes;
  preferenciasNonce: Bytes;
  preferenciasTag: Bytes;
  preferenciasClaveVersion: number | null;
}): CampoCifradoNulable {
  return {
    cifrado: f.preferenciasCifrado,
    nonce: f.preferenciasNonce,
    tag: f.preferenciasTag,
    claveVersion: f.preferenciasClaveVersion,
  };
}

export function campoDeNombreDeArchivo(f: {
  nombreArchivoCifrado: Bytes;
  nombreArchivoNonce: Bytes;
  nombreArchivoTag: Bytes;
  nombreArchivoClaveVersion: number | null;
}): CampoCifradoNulable {
  return {
    cifrado: f.nombreArchivoCifrado,
    nonce: f.nombreArchivoNonce,
    tag: f.nombreArchivoTag,
    claveVersion: f.nombreArchivoClaveVersion,
  };
}
