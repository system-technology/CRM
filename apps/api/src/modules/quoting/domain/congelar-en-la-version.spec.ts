import type { OpcionDePrecio } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { congelarMayoristaPorLinea, congelarTrm } from './congelar-en-la-version.js';
import { TrmInnecesariaError } from './errors.js';

const T1 = '01932000-0000-7000-8000-0000000000a1';
const T2 = '01932000-0000-7000-8000-0000000000a2';
const T3 = '01932000-0000-7000-8000-0000000000a3';
const M1 = '01932000-0000-7000-8000-0000000000b1';
const M2 = '01932000-0000-7000-8000-0000000000b2';

const linea = (tarifaId: string): OpcionDePrecio => ({
  tarifaId,
  nombre: 'x',
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  veces: 1,
  precioUnitario: { unidades: '100', moneda: 'USD' },
  total: { unidades: '100', moneda: 'USD' },
  masBarata: false,
});

describe('congelarMayoristaPorLinea', () => {
  it('pone el mayorista de cada tarifa y null donde no se conoce', () => {
    const r = congelarMayoristaPorLinea(
      [linea(T1), linea(T2), linea(T3)],
      new Map<string, string | null>([
        [T1, M1],
        [T2, M2],
        [T3, null],
      ]),
    );
    expect(r.map((l) => l.mayoristaId)).toEqual([M1, M2, null]);
  });

  it('una tarifa ausente del mapa queda en null, no se inventa', () => {
    expect(congelarMayoristaPorLinea([linea(T1)], new Map())[0]?.mayoristaId).toBeNull();
  });
});

describe('congelarTrm', () => {
  const entrada = { valor: '4150.5', fecha: '2027-03-01', fuente: 'AGENCIA' } as const;

  it('sin TRM declarada no hay TRM', () => {
    expect(congelarTrm('USD', 'COP', undefined)).toBeNull();
  });

  it('origen = moneda de la versión, destino = la de la agencia, valor con 6 decimales', () => {
    expect(congelarTrm('USD', 'COP', entrada)).toEqual({
      monedaOrigen: 'USD',
      monedaDestino: 'COP',
      valor: '4150.500000',
      fecha: '2027-03-01',
      fuente: 'AGENCIA',
    });
    expect(congelarTrm('USD', 'COP', { ...entrada, valor: '4150' })?.valor).toBe('4150.000000');
  });

  it('una TRM en una versión ya en la moneda de la agencia es un error tipado', () => {
    expect(() => congelarTrm('COP', 'COP', entrada)).toThrow(TrmInnecesariaError);
  });
});
