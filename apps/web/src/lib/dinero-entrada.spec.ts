import { describe, it, expect } from 'vitest';
import { parsearMontoAUnidades } from './dinero-entrada';

describe('parsearMontoAUnidades (R8)', () => {
  it('COP: la unidad es el peso, sin multiplicar', () => {
    expect(parsearMontoAUnidades('5000000', 'COP')).toBe('5000000');
    expect(parsearMontoAUnidades('5.000.000', 'COP')).toBe('5000000');
    expect(parsearMontoAUnidades('$ 5,000,000', 'COP')).toBe('5000000');
    expect(parsearMontoAUnidades('5.000', 'COP')).toBe('5000');
  });
  it('USD: la unidad es el centavo', () => {
    expect(parsearMontoAUnidades('1250', 'USD')).toBe('125000');
    expect(parsearMontoAUnidades('12,50', 'USD')).toBe('1250');
    expect(parsearMontoAUnidades('1.234,56', 'USD')).toBe('123456');
    expect(parsearMontoAUnidades('12.5', 'USD')).toBe('1250');
  });
  it('una moneda desconocida usa 2 decimales, como el formateo (una sola tabla, T-544)', () => {
    expect(parsearMontoAUnidades('12,50', 'XYZ')).toBe('1250');
    expect(parsearMontoAUnidades('12,50', 'usd')).toBe('1250');
  });
  it('vacío, cero o basura devuelven null', () => {
    expect(parsearMontoAUnidades('', 'COP')).toBeNull();
    expect(parsearMontoAUnidades('abc', 'COP')).toBeNull();
    expect(parsearMontoAUnidades('0', 'USD')).toBeNull();
  });
});
