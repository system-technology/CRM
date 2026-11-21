/**
 * R10 (T-400): lo que Postgres rechaza al escribir una etiqueta trae el nombre en `message`, `meta`
 * y `detail`. La traducción conserva solo el código; lo que sale no puede contener el nombre.
 */
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  EtiquetaDuplicadaError,
  EtiquetaInvalidaError,
  EtiquetaNoEncontradaError,
} from '../domain/errores-de-etiqueta.js';
import {
  FalloDeEscrituraDeEtiquetas,
  traducirErrorDeEscrituraDeEtiquetas,
} from './errores-de-escritura-de-etiquetas.js';

const NOMBRE = 'Luna de miel de Marta Gómez';
const DETALLE = `Key (tenant_id, lower(btrim(nombre::text)))=(01932000, ${NOMBRE.toLowerCase()}) already exists.`;

function capturar(error: unknown): Error {
  try {
    traducirErrorDeEscrituraDeEtiquetas(error);
  } catch (e) {
    return e as Error;
  }
  throw new Error('debía lanzar');
}

/** Todo lo que un log podría imprimir de un error. */
function todoLoImprimible(e: Error): string {
  return [
    e.name,
    e.message,
    e.stack ?? '',
    JSON.stringify(e),
    e.cause === undefined ? '' : JSON.stringify(e.cause),
  ].join('\n');
}

const conocidos = (codigo: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(`Unique constraint failed: ${DETALLE}`, {
    code: codigo,
    clientVersion: 'test',
    ...(meta ? { meta } : {}),
  });

describe('traducirErrorDeEscrituraDeEtiquetas', () => {
  it('P2002 (unicidad) es ETIQUETA_DUPLICADA, sin el nombre', () => {
    const e = capturar(conocidos('P2002', { target: ['tenant_id'], detail: DETALLE }));
    expect(e).toBeInstanceOf(EtiquetaDuplicadaError);
    expect(todoLoImprimible(e)).not.toMatch(/Marta|Gómez|Luna/i);
  });

  it('el SQLSTATE 23505 de $executeRaw (P2010 con meta.code) es ETIQUETA_DUPLICADA', () => {
    const e = capturar(conocidos('P2010', { code: '23505', message: DETALLE }));
    expect(e).toBeInstanceOf(EtiquetaDuplicadaError);
  });

  it('el SQLSTATE 23514 (CHECK de forma) es ETIQUETA_INVALIDA, sin el nombre', () => {
    const e = capturar(conocidos('P2010', { code: '23514', message: DETALLE }));
    expect(e).toBeInstanceOf(EtiquetaInvalidaError);
    expect(todoLoImprimible(e)).not.toMatch(/Marta|Gómez|Luna/i);
  });

  it('un error de `pg` con `code` y `detail` también se traduce', () => {
    const pg = (code: string) => Object.assign(new Error(DETALLE), { code, detail: DETALLE });
    expect(capturar(pg('23505'))).toBeInstanceOf(EtiquetaDuplicadaError);
    expect(capturar(pg('23514'))).toBeInstanceOf(EtiquetaInvalidaError);
  });

  it('un error con el código en `cause` (adaptadores de driver) se traduce', () => {
    const e = Object.assign(new Error('wrapper'), { cause: { code: '23505', detail: DETALLE } });
    expect(capturar(e)).toBeInstanceOf(EtiquetaDuplicadaError);
  });

  it('un error sin código estructurado cuyo texto trae el SQLSTATE se traduce y el texto se descarta', () => {
    const e = new Prisma.PrismaClientUnknownRequestError(
      `Error occurred during query execution: PostgresError { code: "23514", message: "${DETALLE}" }`,
      { clientVersion: 'test' },
    );
    const t = capturar(e);
    expect(t).toBeInstanceOf(EtiquetaInvalidaError);
    expect(todoLoImprimible(t)).not.toMatch(/Marta|Gómez|Luna/i);
  });

  it('lo desconocido sale como FalloDeEscrituraDeEtiquetas: clase y código, sin message ni cause originales', () => {
    const original = Object.assign(new Error(`algo raro con ${NOMBRE}`), { code: '53300' });
    const t = capturar(original);
    expect(t).toBeInstanceOf(FalloDeEscrituraDeEtiquetas);
    expect(t.cause).toBeUndefined();
    expect(t.message).toContain('Error');
    expect(t.message).toContain('53300');
    expect(todoLoImprimible(t)).not.toMatch(/Marta|Gómez|Luna|raro/i);
  });

  it('un valor que no es un Error tampoco se imprime', () => {
    const t = capturar(`texto suelto con ${NOMBRE}`);
    expect(t).toBeInstanceOf(FalloDeEscrituraDeEtiquetas);
    expect(todoLoImprimible(t)).not.toMatch(/Marta|Gómez|Luna/i);
  });

  it('los errores de dominio pasan tal cual', () => {
    const e = new EtiquetaNoEncontradaError();
    expect(capturar(e)).toBe(e);
  });
});
