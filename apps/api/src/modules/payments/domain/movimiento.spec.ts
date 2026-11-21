import { describe, expect, it } from 'vitest';
import { type ContenidoDeMovimiento, mismoContenido } from './movimiento.js';

const base = {
  tipo: 'PAGO' as const,
  travelFileId: 'abcdef00-0000-7000-8000-0000000000aa',
  montoUnidades: 100n,
  monedaIso: 'COP',
  pagadoEl: '2027-01-10',
  medio: 'EFECTIVO',
  pagadorId: 'abcdef00-0000-7000-8000-0000000000bb',
  reversoDeId: null,
  referencia: 'TRX-1',
  nota: 'abono de la señora',
  motivo: null,
};
/** La fila guardada: el candidato no lleva `notaTachadaEn` (lo pone la base, ADR-0034 §2.4). */
const guardado = (
  parcial: Partial<ContenidoDeMovimiento> & { notaTachadaEn?: Date | null } = {},
): ContenidoDeMovimiento & { notaTachadaEn: Date | null } => ({
  ...base,
  notaTachadaEn: null,
  ...parcial,
});

describe('mismoContenido', () => {
  it('igual aunque los uuid vengan en mayúsculas', () => {
    expect(
      mismoContenido(guardado(), {
        ...base,
        travelFileId: base.travelFileId.toUpperCase(),
        pagadorId: base.pagadorId.toUpperCase(),
      }),
    ).toBe(true);
  });
  it('distinto si cambia el tipo, el pagador o el monto', () => {
    expect(mismoContenido(guardado(), { ...base, tipo: 'DEVOLUCION' })).toBe(false);
    expect(mismoContenido(guardado(), { ...base, pagadorId: null })).toBe(false);
    expect(mismoContenido(guardado(), { ...base, montoUnidades: 101n })).toBe(false);
  });

  // T-516: el texto libre también cuenta. Antes se ignoraba y la corrección se perdía en silencio.
  it('distinto si cambia la referencia, la nota o el motivo', () => {
    expect(mismoContenido(guardado(), { ...base, referencia: 'TRX-2' })).toBe(false);
    expect(mismoContenido(guardado(), { ...base, nota: 'abono del señor' })).toBe(false);
    expect(
      mismoContenido(
        guardado({ tipo: 'AJUSTE', referencia: null, nota: null, motivo: 'descuento' }),
        { ...base, tipo: 'AJUSTE', referencia: null, nota: null, motivo: 'cortesía' },
      ),
    ).toBe(false);
  });
  it('distinto si el reintento quita la nota o la referencia que traía', () => {
    expect(mismoContenido(guardado(), { ...base, nota: null })).toBe(false);
    expect(mismoContenido(guardado(), { ...base, referencia: null })).toBe(false);
  });
  it('igual con el mismo texto libre', () => {
    expect(mismoContenido(guardado(), { ...base })).toBe(true);
  });

  it('en una fila tachada el texto libre no cuenta: lo vació la base, no el cliente', () => {
    const tachada = guardado({
      referencia: null,
      nota: null,
      notaTachadaEn: new Date('2027-02-01T00:00:00.000Z'),
    });
    expect(mismoContenido(tachada, base)).toBe(true);
    // Lo demás se sigue comparando igual.
    expect(mismoContenido(tachada, { ...base, montoUnidades: 101n })).toBe(false);
  });
});
