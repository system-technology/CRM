import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  ClaveDeIdempotenciaReutilizadaError,
  FalloDeEscrituraDelLibroError,
  MovimientoRechazadoPorLaBaseError,
  MovimientoYaReversadoError,
  PagadorNoEncontradoError,
  ReversoDeReversoError,
  SinUsuarioParaRegistrarError,
  ArchivoDeCobroNoEncontradoError,
  MovimientoDeCobroNoEncontradoError,
  SumaIlegibleError,
} from '../domain/errors.js';
import { aBigInt } from './cobros.prisma.js';
import { traducirErrorDelLibro } from './errores-de-escritura-del-libro.js';

/** Un error de `$queryRaw`: el SQLSTATE viaja en `meta.code` y el texto trae la fila con la nota. */
const crudo = (codigo: string, mensaje: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Raw query failed', {
    code: 'P2010',
    clientVersion: 'x',
    meta: { code: codigo, message: mensaje },
  });

const atrapar = (e: unknown): unknown => {
  try {
    traducirErrorDelLibro(e);
  } catch (r) {
    return r;
  }
  return undefined;
};

describe('traducirErrorDelLibro', () => {
  it('23503 por la foránea del pagador → PagadorNoEncontrado', () => {
    expect(
      atrapar(
        crudo(
          '23503',
          'ERROR: insert or update on table "pagos" violates foreign key constraint "pagos_pagador_id_tenant_id_fkey"',
        ),
      ),
    ).toBeInstanceOf(PagadorNoEncontradoError);
  });

  it('23503 por el archivo/moneda, por el reverso y por el usuario', () => {
    expect(
      atrapar(
        crudo(
          '23503',
          'violates foreign key constraint "pagos_travel_file_id_tenant_id_moneda_iso_fkey"',
        ),
      ),
    ).toBeInstanceOf(ArchivoDeCobroNoEncontradoError);
    expect(
      atrapar(crudo('23503', 'violates foreign key constraint "pagos_reverso_de_id_fkey"')),
    ).toBeInstanceOf(MovimientoDeCobroNoEncontradoError);
    expect(
      atrapar(
        crudo('23503', 'violates foreign key constraint "pagos_registrado_por_tenant_id_fkey"'),
      ),
    ).toBeInstanceOf(SinUsuarioParaRegistrarError);
  });

  it('23505 del índice del reverso → MovimientoYaReversado; el de la clave → ClaveReutilizada', () => {
    expect(
      atrapar(
        crudo(
          '23505',
          'duplicate key value violates unique constraint "pagos_un_reverso_por_movimiento"',
        ),
      ),
    ).toBeInstanceOf(MovimientoYaReversadoError);
    expect(
      atrapar(
        crudo(
          '23505',
          'duplicate key value violates unique constraint "pagos_tenant_id_clave_idempotencia_key"',
        ),
      ),
    ).toBeInstanceOf(ClaveDeIdempotenciaReutilizadaError);
  });

  it('P2002 y P2003 de Prisma se leen como 23505 y 23503', () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: 'x',
      meta: { target: 'pagos_un_reverso_por_movimiento' },
    });
    expect(atrapar(p2002)).toBeInstanceOf(MovimientoYaReversadoError);
    const p2003 = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2003',
      clientVersion: 'x',
      meta: { field_name: 'pagos_pagador_id_tenant_id_fkey (index)' },
    });
    expect(atrapar(p2003)).toBeInstanceOf(PagadorNoEncontradoError);
  });

  it('23514 del disparador («un reverso no se reversa») → ReversoDeReverso', () => {
    expect(atrapar(crudo('23514', 'libro de cobro: un reverso no se reversa'))).toBeInstanceOf(
      ReversoDeReversoError,
    );
  });

  it('23514 de un CHECK → MovimientoRechazadoPorLaBase, sin repetir la fila que trae el texto', () => {
    const e = crudo(
      '23514',
      'ERROR: new row for relation "pagos" violates check constraint "pagos_monto_por_tipo"\nDETAIL: Failing row contains (…, nota secreta de Ana Pérez, …)',
    );
    const r = atrapar(e);
    expect(r).toBeInstanceOf(MovimientoRechazadoPorLaBaseError);
    const texto = JSON.stringify(r) + String((r as Error).message);
    expect(texto).not.toContain('Ana');
    expect(texto).not.toContain('secreta');
    expect((r as MovimientoRechazadoPorLaBaseError).restriccion).toBe('pagos_monto_por_tipo');
  });

  it('23001 (inmutable) y 42501 (privilegio) → fallo sin el texto original', () => {
    for (const codigo of ['23001', '42501']) {
      const r = atrapar(crudo(codigo, 'libro de cobro inmutable: UPDATE rechazado — nota privada'));
      expect(r).toBeInstanceOf(FalloDeEscrituraDelLibroError);
      expect((r as Error).message).not.toContain('privada');
      expect((r as FalloDeEscrituraDelLibroError).codigoPg).toBe(codigo);
      expect((r as { cause?: unknown }).cause).toBeUndefined();
    }
  });

  it('un error de dominio pasa tal cual; lo desconocido no arrastra el original', () => {
    const propio = new PagadorNoEncontradoError();
    expect(atrapar(propio)).toBe(propio);
    const raro = atrapar(new Error('conexión caída con la nota «hola»'));
    expect(raro).toBeInstanceOf(FalloDeEscrituraDelLibroError);
    expect((raro as Error).message).not.toContain('hola');
  });
});

describe('aBigInt: las sumas llegan exactas o no llegan', () => {
  it('acepta bigint y texto entero', () => {
    expect(aBigInt(9_999_999_999_999_991n)).toBe(9_999_999_999_999_991n);
    expect(aBigInt('9999999999999991')).toBe(9_999_999_999_999_991n);
    expect(aBigInt('-5')).toBe(-5n);
  });

  it('rechaza un number, aunque sea entero y seguro: nunca Number para dinero', () => {
    expect(() => aBigInt(5)).toThrow(SumaIlegibleError);
    expect(() => aBigInt(9_999_999_999_999_990)).toThrow(SumaIlegibleError);
    expect(() => aBigInt(null)).toThrow(SumaIlegibleError);
    expect(() => aBigInt('12.5')).toThrow(SumaIlegibleError);
  });
});
