import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import { PuertoAvisoDeEventosDeDominio } from '../../../shared/puertos/puertos-de-eventos-de-dominio.js';
import { PuertoDeAgenciasVigilables, RepositorioDeAvisosDePlazo } from './puertos-de-vigilancia.js';
import { VigilarPlazosUseCase } from './vigilar-plazos.use-case.js';

const AHORA = new Date('2027-01-10T15:00:00.000Z');

const despacho: PuertoAvisoDeEventosDeDominio = { avisar: vi.fn() };

function armar(ids: string[], avisarAgencia: RepositorioDeAvisosDePlazo['avisarAgencia']) {
  const agencias: PuertoDeAgenciasVigilables = { agenciasActivas: () => Promise.resolve(ids) };
  const repo: RepositorioDeAvisosDePlazo = { avisarAgencia };
  return new VigilarPlazosUseCase(agencias, repo, despacho);
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

  it('despierta al despachador solo de las agencias que escribieron avisos', async () => {
    const avisar = vi.fn();
    const agencias: PuertoDeAgenciasVigilables = {
      agenciasActivas: () => Promise.resolve(['a', 'b']),
    };
    const repo: RepositorioDeAvisosDePlazo = {
      avisarAgencia: (t: string) => Promise.resolve(t === 'a' ? 2 : 0),
    };
    await new VigilarPlazosUseCase(agencias, repo, { avisar }).ejecutar(AHORA);
    expect(avisar.mock.calls).toEqual([['a']]);
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
