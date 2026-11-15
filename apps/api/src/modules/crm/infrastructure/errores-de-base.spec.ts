import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { esMotivoDePerdidaInactivoEnBase } from './errores-de-base.js';

describe('esMotivoDePerdidaInactivoEnBase (VP001, T-232)', () => {
  it('reconoce el SQLSTATE en code, en meta.code o en el texto del disparador', () => {
    expect(esMotivoDePerdidaInactivoEnBase({ code: 'VP001' })).toBe(true);
    expect(
      esMotivoDePerdidaInactivoEnBase(
        new Prisma.PrismaClientKnownRequestError('Raw query failed', {
          code: 'P2010',
          clientVersion: 'x',
          meta: { code: 'VP001', message: 'MOTIVO_DE_PERDIDA_INACTIVO: ...' },
        }),
      ),
    ).toBe(true);
    expect(
      esMotivoDePerdidaInactivoEnBase(
        new Prisma.PrismaClientUnknownRequestError(
          'Error occurred during query execution: ConnectorError(... PostgresError { code: "VP001", message: "MOTIVO_DE_PERDIDA_INACTIVO: el motivo ..." })',
          { clientVersion: 'x' },
        ),
      ),
    ).toBe(true);
  });

  it('no confunde otros errores de la base ni valores que no son errores', () => {
    expect(esMotivoDePerdidaInactivoEnBase({ code: '23514' })).toBe(false);
    expect(
      esMotivoDePerdidaInactivoEnBase(
        new Error('El motivo de pérdida exige explicación en nota_perdida'),
      ),
    ).toBe(false);
    expect(
      esMotivoDePerdidaInactivoEnBase({ message: 'el lote VP001 no cuadra' }),
      'un «VP001» suelto en otro texto no es este error',
    ).toBe(false);
    expect(esMotivoDePerdidaInactivoEnBase(null)).toBe(false);
    expect(esMotivoDePerdidaInactivoEnBase('VP001')).toBe(false);
  });
});
