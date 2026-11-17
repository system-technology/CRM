import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import { PuertoDeAgenciasVigilables, RepositorioDeAvisosDePlazo } from './puertos-de-vigilancia.js';
import { VigilarPlazosUseCase } from './vigilar-plazos.use-case.js';

const AHORA = new Date('2027-01-10T15:00:00.000Z');

function armar(ids: string[], avisarAgencia: RepositorioDeAvisosDePlazo['avisarAgencia']) {
  const agencias: PuertoDeAgenciasVigilables = { agenciasActivas: () => Promise.resolve(ids) };
  const repo: RepositorioDeAvisosDePlazo = { avisarAgencia };
  return new VigilarPlazosUseCase(agencias, repo);
}

describe('VigilarPlazosUseCase', () => {
  it('recorre cada agencia con el mismo instante y suma los avisos', async () => {
    const avisarAgencia = vi.fn((tenantId: string) => Promise.resolve(tenantId === 'a' ? 2 : 1));
    const r = await armar(['a', 'b'], avisarAgencia).ejecutar(AHORA);
    expect(r).toEqual({ agencias: 2, avisos: 3, agenciasConFallo: 0 });
    expect(avisarAgencia.mock.calls).toEqual([
      ['a', AHORA],
      ['b', AHORA],
    ]);
  });

  it('el fallo de una agencia no impide a las demás ni se propaga', async () => {
    const avisarAgencia = vi.fn((tenantId: string) =>
      tenantId === 'a'
        ? Promise.reject(new Error('contiene datos de la fila'))
        : Promise.resolve(1),
    );
    const r = await armar(['a', 'b'], avisarAgencia).ejecutar(AHORA);
    expect(r).toEqual({ agencias: 2, avisos: 1, agenciasConFallo: 1 });
    expect(avisarAgencia).toHaveBeenCalledTimes(2);
  });

  it('sin agencias no hace nada', async () => {
    const avisarAgencia = vi.fn(() => Promise.resolve(0));
    expect(await armar([], avisarAgencia).ejecutar(AHORA)).toEqual({
      agencias: 0,
      avisos: 0,
      agenciasConFallo: 0,
    });
    expect(avisarAgencia).not.toHaveBeenCalled();
  });
});
