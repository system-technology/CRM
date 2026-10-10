/**
 * El identificador de una recepción: `sha256` del cuerpo crudo del `POST`.
 *
 * **Por qué el contenido y no un UUID.** Meta reintenta. Reintenta ante un tiempo de espera,
 * ante un 500, y a veces ante un 200 que no le llegó. Un identificador aleatorio crearía una
 * fila nueva en cada reintento y el viajero recibiría la misma respuesta dos veces. Derivarlo
 * del contenido hace que el reintento caiga exactamente en la fila que ya existe, y que
 * `registrar_recepcion` devuelva `false` sin insertar nada. La idempotencia de R5 no es una
 * comprobación que se añade después: es la forma de la clave.
 *
 * **Y es irreversible, que es lo que permite guardarlo sin cifrar.** El cuerpo lleva teléfonos
 * y texto del viajero; su hash, no. Por eso esta columna puede ser la clave primaria de una
 * tabla sin RLS mientras el cuerpo de al lado va cifrado.
 */

import { createHash } from 'node:crypto';

/** 32 bytes. Los mismos bytes que se firmaron, no el JSON reserializado. */
export function identificarRecepcion(cuerpo: Buffer): Buffer {
  return createHash('sha256').update(cuerpo).digest();
}
