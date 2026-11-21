/**
 * Traduce lo que Postgres rechaza al escribir una etiqueta (T-325, R10).
 *
 * **Por qué existe:** un error de Prisma o de `pg` por la unicidad (23505) o por un CHECK (23514)
 * trae en `message`, `meta` y `detail` el valor que se intentaba guardar —«Key (tenant_id,
 * lower(btrim(nombre)))=(…, ana lópez) already exists»—, y el nombre de una etiqueta es texto libre
 * de la agencia que puede ser el de una persona. Un error sin traducir llega al filtro global, que lo
 * escribe en el log con su traza.
 *
 * Así que aquí NO se reenvía `message`, `meta` ni `detail` de nada: solo el CÓDIGO (`P2002`,
 * `23505`…), que no lleva datos. Cuando Prisma no da código estructurado, se busca el SQLSTATE en
 * el texto y el texto se descarta. Lo conocido se vuelve un error de dominio; lo
 * desconocido, un `FalloDeEscrituraDeEtiquetas` cuyo mensaje es solo la clase y el código, sin
 * `cause` (que arrastraría el original a la traza).
 */
import { Prisma } from '@prisma/client';
import { EtiquetaDuplicadaError, EtiquetaInvalidaError } from '../domain/errores-de-etiqueta.js';

/** Un fallo inesperado al escribir etiquetas, sin nada que haya traído el original. */
export class FalloDeEscrituraDeEtiquetas extends Error {
  constructor(clase: string, codigo: string | null) {
    super(`Falló una escritura de etiquetas (${clase}${codigo ? ` ${codigo}` : ''}).`);
    this.name = 'FalloDeEscrituraDeEtiquetas';
  }
}

/** Las restricciones de la forma de `etiquetas` (CHECK) y la unicidad del nombre normalizado. */
const SQLSTATE_UNICIDAD = '23505';
const SQLSTATE_CHECK = '23514';

function texto(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function propiedad(o: unknown, nombre: string): unknown {
  return typeof o === 'object' && o !== null ? (o as Record<string, unknown>)[nombre] : undefined;
}

/** El código de error, sin tocar ningún texto libre: SQLSTATE de `pg`, `meta.code` o el `Pxxxx`. */
function codigoDe(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return SQLSTATE_UNICIDAD;
    // `$queryRaw`/`$executeRaw`: el SQLSTATE viaja en `meta.code`.
    return texto(propiedad(error.meta, 'code')) ?? error.code;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    // Sin código estructurado: se BUSCA el SQLSTATE en el texto y se descarta el texto. Lo único
    // que sale de aquí es el código de cinco caracteres.
    const m = /\b(23505|23514)\b/.exec(error.message);
    return m?.[1] ?? null;
  }
  const directo = texto(propiedad(error, 'code'));
  if (directo) return directo;
  return texto(propiedad(propiedad(error, 'cause'), 'code'));
}

/**
 * Para usar en el `catch` que rodea a la transacción (un error de Postgres la aborta: no se puede
 * seguir dentro de ella). Siempre lanza: nunca devuelve el error original.
 */
export function traducirErrorDeEscrituraDeEtiquetas(error: unknown): never {
  // Los nuestros pasan tal cual: no traen datos.
  if (
    error instanceof EtiquetaDuplicadaError ||
    error instanceof EtiquetaInvalidaError ||
    esErrorDeDominio(error)
  ) {
    throw error;
  }
  const codigo = codigoDe(error);
  if (codigo === SQLSTATE_UNICIDAD) throw new EtiquetaDuplicadaError();
  if (codigo === SQLSTATE_CHECK) throw new EtiquetaInvalidaError();
  throw new FalloDeEscrituraDeEtiquetas(
    error instanceof Error ? error.constructor.name : typeof error,
    codigo,
  );
}

/** Un error de dominio tiene `code` y `aJSON`: no se reenvuelve. */
function esErrorDeDominio(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof propiedad(error, 'code') === 'string' &&
    typeof propiedad(error, 'aJSON') === 'function'
  );
}
