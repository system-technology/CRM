import { describe, expect, it, vi } from 'vitest';
import { AgenciaNoEncontradaError, ZonaHorariaInvalidaError } from '../application/errores.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { traducirErrorDeZonaHoraria, ZonaHorariaPrisma } from './zona-horaria.prisma.js';

const errorSql = (code: string) => Object.assign(new Error('x'), { code: 'P2010', meta: { code } });

describe('traducirErrorDeZonaHoraria', () => {
  it('22023 es ZonaHorariaInvalidaError (422)', () => {
    expect(() => traducirErrorDeZonaHoraria(errorSql('22023'))).toThrow(ZonaHorariaInvalidaError);
  });
  it('P0002 es AgenciaNoEncontradaError (404)', () => {
    expect(() => traducirErrorDeZonaHoraria(errorSql('P0002'))).toThrow(AgenciaNoEncontradaError);
  });
  it('el resto se relanza sin tocarlo', () => {
    for (const e of [errorSql('42501'), errorSql('P0003'), new Error('boom'), 'texto']) {
      let capturado: unknown;
      try {
        traducirErrorDeZonaHoraria(e);
      } catch (x) {
        capturado = x;
      }
      expect(capturado).toBe(e);
    }
  });
});

describe('ZonaHorariaPrisma', () => {
  const con = (resultado: () => Promise<unknown>) =>
    new ZonaHorariaPrisma({
      conTenant: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: vi.fn(resultado) }),
    } as unknown as PrismaService);

  it('devuelve la zona guardada', async () => {
    const p = con(() => Promise.resolve([{ zona_horaria: 'America/Lima' }]));
    await expect(p.actualizar('America/Lima')).resolves.toBe('America/Lima');
  });
  it('traduce el 22023 de la base', async () => {
    const p = con(() => Promise.reject(errorSql('22023')));
    await expect(p.actualizar('Nope')).rejects.toBeInstanceOf(ZonaHorariaInvalidaError);
  });
  it('relanza lo desconocido', async () => {
    const e = errorSql('42501');
    await expect(con(() => Promise.reject(e)).actualizar('x')).rejects.toBe(e);
  });
});
