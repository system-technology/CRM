import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { esColisionDeApodo } from './colision-de-apodo.js';

const error = (code: string, meta: Record<string, unknown>, mensaje = 'x') =>
  new Prisma.PrismaClientKnownRequestError(mensaje, { code, clientVersion: 'prueba', meta });

describe('esColisionDeApodo', () => {
  it('reconoce la restricción por su nombre (índice global y el de la agencia)', () => {
    expect(esColisionDeApodo(error('P2002', { target: 'accesos_identidad_apodo_key' }))).toBe(true);
    expect(esColisionDeApodo(error('P2002', { target: ['usuarios_tenant_id_apodo_key'] }))).toBe(
      true,
    );
    expect(esColisionDeApodo(error('P2002', { constraint: 'accesos_identidad_apodo_key' }))).toBe(
      true,
    );
  });

  it('reconoce las columnas cuando Prisma parseó el DETAIL de Postgres', () => {
    expect(esColisionDeApodo(error('P2002', { target: ['apodo'] }))).toBe(true);
    expect(esColisionDeApodo(error('P2002', { target: ['tenant_id', 'apodo'] }))).toBe(true);
  });

  it('reconoce el 23505 crudo de un disparador solo si nombra la restricción', () => {
    expect(
      esColisionDeApodo(
        error(
          'P2010',
          { code: '23505' },
          'duplicate key value violates "accesos_identidad_apodo_key"',
        ),
      ),
    ).toBe(true);
    expect(esColisionDeApodo(error('P2010', { code: '23505' }, 'otra restricción'))).toBe(false);
  });

  it('no confunde otras unicidades ni otros errores', () => {
    expect(esColisionDeApodo(error('P2002', { target: ['correo'] }))).toBe(false);
    expect(
      esColisionDeApodo(error('P2002', { target: 'usuarios_tenant_id_identidad_id_key' })),
    ).toBe(false);
    expect(esColisionDeApodo(error('P2025', {}))).toBe(false);
    expect(esColisionDeApodo(new Error('Key (apodo)=(ialvear)'))).toBe(false);
    expect(esColisionDeApodo(undefined)).toBe(false);
  });
});
