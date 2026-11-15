import { describe, expect, it } from 'vitest';
import { totalesEnDinero } from './ver-tablero.js';

describe('totales del tablero por moneda (T-181, R8)', () => {
  it('columna vacía: sin total y sin desglose', () => {
    expect(totalesEnDinero([])).toEqual({ valorTotal: null, valoresPorMoneda: [] });
  });

  it('una sola moneda: el total es esa suma', () => {
    const r = totalesEnDinero([{ monedaIso: 'COP', unidades: 5_000_000n }]);
    expect(r.valorTotal).toEqual({ unidades: '5000000', moneda: 'COP' });
    expect(r.valoresPorMoneda).toHaveLength(1);
  });

  it('USD 2.000 y COP 5.000.000 no se suman: total nulo y desglose por moneda', () => {
    const r = totalesEnDinero([
      { monedaIso: 'COP', unidades: 5_000_000n },
      { monedaIso: 'USD', unidades: 200_000n },
    ]);
    expect(r.valorTotal).toBeNull();
    expect(r.valoresPorMoneda).toEqual([
      { unidades: '5000000', moneda: 'COP' },
      { unidades: '200000', moneda: 'USD' },
    ]);
  });

  it('conserva importes por encima del entero seguro de JavaScript', () => {
    const grande = 2n ** 60n;
    expect(totalesEnDinero([{ monedaIso: 'COP', unidades: grande }]).valorTotal?.unidades).toBe(
      grande.toString(),
    );
  });

  it('una moneda fuera del contrato falla ruidosamente', () => {
    expect(() => totalesEnDinero([{ monedaIso: 'XXX', unidades: 1n }])).toThrow();
  });
});
