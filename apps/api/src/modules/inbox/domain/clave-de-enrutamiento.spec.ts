import { describe, expect, it } from 'vitest';
import { claveDeEnrutamiento } from './clave-de-enrutamiento.js';

describe('claveDeEnrutamiento', () => {
  it('es determinista y mide 32 bytes', () => {
    const a = claveDeEnrutamiento('pimienta', 'pn', '123');
    expect(a.equals(claveDeEnrutamiento('pimienta', 'pn', '123'))).toBe(true);
    expect(a.length).toBe(32);
  });

  it('el tipo separa dominios: un número y una cuenta con el mismo id no colisionan', () => {
    expect(
      claveDeEnrutamiento('p', 'pn', '123').equals(claveDeEnrutamiento('p', 'waba', '123')),
    ).toBe(false);
  });

  it('otra pimienta, otra clave: sin la pimienta no se puede preguntar', () => {
    expect(
      claveDeEnrutamiento('p1', 'pn', '123').equals(claveDeEnrutamiento('p2', 'pn', '123')),
    ).toBe(false);
  });

  it('rechaza una pimienta vacía', () => {
    expect(() => claveDeEnrutamiento('', 'pn', '1')).toThrow(/pimienta/);
  });
});
