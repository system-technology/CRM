import { describe, expect, it } from 'vitest';
import { presentarPrecio, type TarifaPresentable } from './presentacion-de-precio.js';

const HOY = '2026-11-10';
const base: TarifaPresentable = {
  ventaUnidades: 300_000n,
  listaUnidades: 400_000n,
  moneda: 'COP',
  promoHasta: '2026-12-01',
};

describe('presentarPrecio', () => {
  it.each(['OCULTAR', 'TACHAR'] as const)('promo vigente (%s): lista tachada sin leyenda', (p) => {
    const r = presentarPrecio(base, HOY, p);
    expect(r.estado).toBe('PROMO_VIGENTE');
    expect(r.venta).toEqual({ unidades: '300000', moneda: 'COP' });
    expect(r.listaTachada).toEqual({ unidades: '400000', moneda: 'COP' });
    expect(r.leyenda).toBeNull();
    expect(r.promoVigente).toBe(true);
  });

  it.each(['OCULTAR', 'TACHAR'] as const)('promoHasta nulo es vigente (%s)', (p) => {
    const r = presentarPrecio({ ...base, promoHasta: null }, HOY, p);
    expect(r.estado).toBe('PROMO_VIGENTE');
    expect(r.listaTachada).not.toBeNull();
  });

  it('el último día de la promo sigue vigente', () => {
    expect(presentarPrecio({ ...base, promoHasta: HOY }, HOY, 'OCULTAR').estado).toBe(
      'PROMO_VIGENTE',
    );
  });

  it('vencida + OCULTAR: solo venta, sin tachado ni leyenda', () => {
    const r = presentarPrecio({ ...base, promoHasta: '2026-11-09' }, HOY, 'OCULTAR');
    expect(r.estado).toBe('PROMO_VENCIDA');
    expect(r.venta).toEqual({ unidades: '300000', moneda: 'COP' });
    expect(r.listaTachada).toBeNull();
    expect(r.leyenda).toBeNull();
    expect(r.promoVigente).toBe(false);
  });

  it('vencida + TACHAR: lista tachada y leyenda; la venta no cambia', () => {
    const r = presentarPrecio({ ...base, promoHasta: '2026-11-09' }, HOY, 'TACHAR');
    expect(r.estado).toBe('PROMO_VENCIDA');
    expect(r.venta).toEqual({ unidades: '300000', moneda: 'COP' });
    expect(r.listaTachada).toEqual({ unidades: '400000', moneda: 'COP' });
    expect(r.leyenda).toBe('PROMO_VENCIDA');
    expect(r.promoVigente).toBe(false);
  });

  it.each(['OCULTAR', 'TACHAR'] as const)('sin lista no hay promo (%s)', (p) => {
    for (const promoHasta of [null, '2026-01-01', '2027-01-01']) {
      const r = presentarPrecio({ ...base, listaUnidades: null, promoHasta }, HOY, p);
      expect(r.estado).toBe('VIGENTE');
      expect(r.listaTachada).toBeNull();
      expect(r.leyenda).toBeNull();
      expect(r.venta?.unidades).toBe('300000');
    }
  });

  it('una lista que no supera la venta no se tacha', () => {
    const r = presentarPrecio({ ...base, listaUnidades: 300_000n }, HOY, 'TACHAR');
    expect(r.estado).toBe('VIGENTE');
    expect(r.listaTachada).toBeNull();
  });

  it.each(['OCULTAR', 'TACHAR'] as const)('sin precio: consultar (%s)', (p) => {
    const r = presentarPrecio(null, HOY, p);
    expect(r).toEqual({
      estado: 'CONSULTAR',
      venta: null,
      listaTachada: null,
      leyenda: null,
      promoVigente: false,
    });
  });

  it('respeta la moneda de la tarifa', () => {
    const r = presentarPrecio(
      { ventaUnidades: 29_900n, listaUnidades: 39_900n, moneda: 'USD', promoHasta: null },
      HOY,
      'TACHAR',
    );
    expect(r.venta).toEqual({ unidades: '29900', moneda: 'USD' });
    expect(r.listaTachada).toEqual({ unidades: '39900', moneda: 'USD' });
  });

  it('una moneda no habilitada es un error, no un precio', () => {
    expect(() => presentarPrecio({ ...base, moneda: 'XXX' }, HOY, 'OCULTAR')).toThrow();
  });
});
