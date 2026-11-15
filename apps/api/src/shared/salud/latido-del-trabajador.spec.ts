import { describe, expect, it } from 'vitest';
import { estadoPorEdad, LATIDO_VIEJO_TRAS_S, seExigeElLatido } from './latido-del-trabajador.js';

describe('latido del trabajador', () => {
  it('es fresco hasta el umbral y viejo despues', () => {
    expect(estadoPorEdad(3).estado).toBe('ok');
    expect(estadoPorEdad(LATIDO_VIEJO_TRAS_S).estado).toBe('ok');
    expect(estadoPorEdad(LATIDO_VIEJO_TRAS_S + 1)).toEqual({
      estado: 'viejo',
      edadSegundos: LATIDO_VIEJO_TRAS_S + 1,
    });
  });

  it('un reloj adelantado no da edad negativa', () => {
    expect(estadoPorEdad(-5)).toEqual({ estado: 'ok', edadSegundos: 0 });
  });

  it('solo se exige con Redis y fuera del modo unico', () => {
    expect(seExigeElLatido({})).toBe(false);
    expect(seExigeElLatido({ REDIS_URL: 'redis://x' })).toBe(true);
    expect(seExigeElLatido({ REDIS_URL: 'redis://x', MODO_DESPLIEGUE: 'escalado' })).toBe(true);
    expect(seExigeElLatido({ REDIS_URL: 'redis://x', MODO_DESPLIEGUE: 'unico' })).toBe(false);
  });
});
