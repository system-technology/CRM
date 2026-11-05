import { describe, expect, it } from 'vitest';
import {
  esModoUnico,
  leerModoDeDespliegue,
  ModoDeDespliegueInvalidoError,
} from './modo-de-despliegue.js';

describe('leerModoDeDespliegue', () => {
  it('acepta unico y escalado', () => {
    expect(leerModoDeDespliegue({ MODO_DESPLIEGUE: 'unico' })).toBe('unico');
    expect(leerModoDeDespliegue({ MODO_DESPLIEGUE: 'escalado' })).toBe('escalado');
  });

  it('sin la variable o vacía, no hay respaldo: lanza', () => {
    expect(() => leerModoDeDespliegue({})).toThrow(ModoDeDespliegueInvalidoError);
    expect(() => leerModoDeDespliegue({ MODO_DESPLIEGUE: '' })).toThrow(/Falta MODO_DESPLIEGUE/);
  });

  it.each(['Unico', 'single', 'UNICO ', 'memoria'])('rechaza %j', (valor) => {
    expect(() => leerModoDeDespliegue({ MODO_DESPLIEGUE: valor })).toThrow(
      ModoDeDespliegueInvalidoError,
    );
  });
});

describe('esModoUnico', () => {
  it('solo es verdadero con unico', () => {
    expect(esModoUnico({ MODO_DESPLIEGUE: 'unico' })).toBe(true);
    expect(esModoUnico({ MODO_DESPLIEGUE: 'escalado' })).toBe(false);
  });

  it('ausente significa lo de siempre, pero un valor inválido sigue abortando', () => {
    expect(esModoUnico({})).toBe(false);
    expect(() => esModoUnico({ MODO_DESPLIEGUE: 'otro' })).toThrow(ModoDeDespliegueInvalidoError);
  });
});
