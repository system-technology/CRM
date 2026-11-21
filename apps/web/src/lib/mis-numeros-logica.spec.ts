import { describe, expect, it } from 'vitest';
import { plural } from './mis-numeros-logica';

describe('plural', () => {
  it('singular con 1 y plural con el resto, incluido 0', () => {
    expect(plural(1, 'cotización aceptada', 'cotizaciones aceptadas')).toBe(
      '1 cotización aceptada',
    );
    expect(plural(2, 'cotización aceptada', 'cotizaciones aceptadas')).toBe(
      '2 cotizaciones aceptadas',
    );
    expect(plural(0, 'cotización aceptada', 'cotizaciones aceptadas')).toBe(
      '0 cotizaciones aceptadas',
    );
  });
});
