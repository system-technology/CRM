/**
 * De un `CampoCifrado` a las cuatro columnas que Prisma espera, una función por prefijo del
 * esquema. Sin importar Prisma: solo la forma. Mantenerlas aquí evita escribir los cuatro nombres
 * a mano en cada adaptador (y equivocarse de uno).
 */
import type { CampoCifrado } from './puerto-de-cifrado.js';

/** `mensajes.texto` y `notas_internas.texto`. */
export function columnasDeTexto(c: CampoCifrado): {
  textoCifrado: Buffer;
  textoNonce: Buffer;
  textoTag: Buffer;
  textoClaveVersion: number;
} {
  return {
    textoCifrado: c.cifrado,
    textoNonce: c.nonce,
    textoTag: c.tag,
    textoClaveVersion: c.claveVersion,
  };
}

/** `conversaciones.ultimo_mensaje_texto`. */
export function columnasDeUltimoMensaje(c: CampoCifrado): {
  ultimoMensajeTextoCifrado: Buffer;
  ultimoMensajeTextoNonce: Buffer;
  ultimoMensajeTextoTag: Buffer;
  ultimoMensajeTextoClaveVersion: number;
} {
  return {
    ultimoMensajeTextoCifrado: c.cifrado,
    ultimoMensajeTextoNonce: c.nonce,
    ultimoMensajeTextoTag: c.tag,
    ultimoMensajeTextoClaveVersion: c.claveVersion,
  };
}

/** `contactos.preferencias`. */
export function columnasDePreferencias(c: CampoCifrado): {
  preferenciasCifrado: Buffer;
  preferenciasNonce: Buffer;
  preferenciasTag: Buffer;
  preferenciasClaveVersion: number;
} {
  return {
    preferenciasCifrado: c.cifrado,
    preferenciasNonce: c.nonce,
    preferenciasTag: c.tag,
    preferenciasClaveVersion: c.claveVersion,
  };
}

/** `adjuntos.nombre_archivo`. */
export function columnasDeNombreDeArchivo(c: CampoCifrado): {
  nombreArchivoCifrado: Buffer;
  nombreArchivoNonce: Buffer;
  nombreArchivoTag: Buffer;
  nombreArchivoClaveVersion: number;
} {
  return {
    nombreArchivoCifrado: c.cifrado,
    nombreArchivoNonce: c.nonce,
    nombreArchivoTag: c.tag,
    nombreArchivoClaveVersion: c.claveVersion,
  };
}
