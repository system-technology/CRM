import { describe, expect, it } from 'vitest';
import { mismoContenido } from './movimiento.js';

const base = {
  tipo: 'PAGO' as const,
  travelFileId: 'abcdef00-0000-7000-8000-0000000000aa',
  montoUnidades: 100n,
  monedaIso: 'COP',
  pagadoEl: '2027-01-10',
  medio: 'EFECTIVO',
  pagadorId: 'abcdef00-0000-7000-8000-0000000000bb',
  reversoDeId: null,
};

describe('mismoContenido', () => {
  it('igual aunque los uuid vengan en mayúsculas', () => {
    expect(
      mismoContenido(base, {
        ...base,
        travelFileId: base.travelFileId.toUpperCase(),
        pagadorId: base.pagadorId.toUpperCase(),
      }),
    ).toBe(true);
  });
  it('distinto si cambia el tipo, el pagador o el monto', () => {
    expect(mismoContenido(base, { ...base, tipo: 'DEVOLUCION' })).toBe(false);
    expect(mismoContenido(base, { ...base, pagadorId: null })).toBe(false);
    expect(mismoContenido(base, { ...base, montoUnidades: 101n })).toBe(false);
  });
});
