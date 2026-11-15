/**
 * UUID versión 7 (RFC 9562 §5.7) generado en la aplicación.
 *
 * Existe por la concreción 3 del ADR-0015: **todo id de una fila cifrada se genera en la
 * aplicación antes del INSERT**, porque entra en el AAD del criptograma. Versión 7 y no `randomUUID`
 * (v4) por la regla del esquema: claves ordenables en el tiempo, como las que pone Prisma con
 * `@default(uuid(7))`.
 *
 * 48 bits de milisegundos Unix, versión 7, 12 bits aleatorios, variante RFC y 62 bits aleatorios.
 * Dentro del mismo milisegundo el orden es aleatorio; el desempate de orden lo pone el instante de
 * la fila, no el id.
 */
import { randomBytes } from 'node:crypto';

export function uuidV7(ahoraMs: number = Date.now()): string {
  const b = randomBytes(16);
  let ms = BigInt(Math.floor(ahoraMs));
  for (let i = 5; i >= 0; i--) {
    b[i] = Number(ms & 0xffn);
    ms >>= 8n;
  }
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
