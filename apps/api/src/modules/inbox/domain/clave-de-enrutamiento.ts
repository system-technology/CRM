/**
 * La clave con la que el directorio de enrutamiento busca un número: `HMAC-SHA256(pimienta,
 * 'pn:' || phone_number_id)`. ADR-0008 §1.1.
 *
 * El tipo va DENTRO del mensaje —`pn:` para un número, `waba:` para una cuenta— para que un
 * identificador de número y uno de cuenta nunca colisionen sin necesitar una columna de tipo.
 *
 * Y la pimienta vive FUERA de la base: con ella un volcado no revela ningún identificador, y por
 * eso esta función la recibe y no la lee de ningún sitio.
 */
import { createHmac } from 'node:crypto';

export type TipoDeClave = 'pn' | 'waba';

export function claveDeEnrutamiento(
  pimienta: string,
  tipo: TipoDeClave,
  identificadorDeMeta: string,
): Buffer {
  if (!pimienta) throw new Error('La pimienta del directorio no puede estar vacía.');
  return createHmac('sha256', pimienta).update(`${tipo}:${identificadorDeMeta}`, 'utf8').digest();
}
