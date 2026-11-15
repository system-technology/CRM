import { describe, expect, it } from 'vitest';
import { estadoDeCola, umbralDeColaMin } from './antiguedad-de-cola.js';

describe('estadoDeCola', () => {
  it('cola vacia o reciente: ok', () => {
    expect(estadoDeCola(0, 0, 5)).toEqual({ estado: 'ok', masViejaS: 0, pendientes: 0 });
    expect(estadoDeCola(300, 2, 5).estado).toBe('ok');
  });
  it('mas vieja que el umbral: atascada', () => {
    expect(estadoDeCola(301, 7, 5)).toEqual({
      estado: 'atascada',
      masViejaS: 301,
      pendientes: 7,
      umbralMin: 5,
    });
  });
  it('el umbral viene de COLA_ALERTA_MIN y tolera basura', () => {
    expect(umbralDeColaMin({ COLA_ALERTA_MIN: '10' })).toBe(10);
    expect(umbralDeColaMin({ COLA_ALERTA_MIN: 'x' })).toBe(5);
    expect(umbralDeColaMin({})).toBe(5);
  });
});
