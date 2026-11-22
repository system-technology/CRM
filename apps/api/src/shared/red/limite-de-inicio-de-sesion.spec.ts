import { describe, expect, it, vi } from 'vitest';
import {
  avisarDeLimiteDeInicioDeSesion,
  leerLimiteDeInicioDeSesion,
} from './limite-de-inicio-de-sesion.js';

const V = 'LIMITE_INICIO_SESION_POR_IP';

describe('leerLimiteDeInicioDeSesion', () => {
  it('sin variable usa 5 y no avisa', () => {
    expect(leerLimiteDeInicioDeSesion({ APP_ENV: 'staging' })).toEqual({ valor: 5, avisos: [] });
    expect(leerLimiteDeInicioDeSesion({})).toEqual({ valor: 5, avisos: [] });
  });

  it('una variable vacía se trata como ausente', () => {
    expect(leerLimiteDeInicioDeSesion({ [V]: '  ' })).toEqual({ valor: 5, avisos: [] });
  });

  it('con un valor válido lo usa', () => {
    expect(leerLimiteDeInicioDeSesion({ APP_ENV: 'local', [V]: '20' }).valor).toBe(20);
    expect(leerLimiteDeInicioDeSesion({ [V]: '3' })).toEqual({ valor: 3, avisos: [] });
  });

  it.each(['abc', '0', '-4', '2.5', '1e3', '1001', '99999999999999999999', 'NaN'])(
    'con basura (%s) usa 5 y avisa',
    (basura) => {
      const r = leerLimiteDeInicioDeSesion({ APP_ENV: 'staging', [V]: basura });
      expect(r.valor).toBe(5);
      expect(r.avisos).toHaveLength(1);
      expect(r.avisos[0]?.mensaje).toContain(V);
    },
  );

  it('con basura avisa también en local, pero sigue aplicando 5', () => {
    const r = leerLimiteDeInicioDeSesion({ APP_ENV: 'local', [V]: 'x' });
    expect(r.valor).toBe(5);
    expect(r.avisos).toHaveLength(1);
  });

  it('avisa si es más alto que 5 fuera de local, con el valor y el efecto', () => {
    for (const entorno of [{ APP_ENV: 'staging' }, { APP_ENV: 'production' }, {}]) {
      const r = leerLimiteDeInicioDeSesion({ ...entorno, [V]: '20' });
      expect(r.valor).toBe(20);
      expect(r.avisos).toHaveLength(1);
      expect(r.avisos[0]?.valorEnUso).toBe(20);
      expect(r.avisos[0]?.mensaje).toContain('20');
      expect(r.avisos[0]?.mensaje).toContain('fuerza bruta');
    }
  });

  it('no avisa en local', () => {
    expect(leerLimiteDeInicioDeSesion({ APP_ENV: 'local', [V]: '20' }).avisos).toEqual([]);
  });

  it('no avisa si es 5 o menos fuera de local', () => {
    expect(leerLimiteDeInicioDeSesion({ APP_ENV: 'staging', [V]: '5' }).avisos).toEqual([]);
  });
});

describe('avisarDeLimiteDeInicioDeSesion', () => {
  it('registra un aviso por anomalía y no lanza', () => {
    const warn = vi.fn();
    avisarDeLimiteDeInicioDeSesion({ APP_ENV: 'staging', [V]: '20' }, { warn });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('no registra nada sin anomalía', () => {
    const warn = vi.fn();
    avisarDeLimiteDeInicioDeSesion({ APP_ENV: 'staging' }, { warn });
    expect(warn).not.toHaveBeenCalled();
  });
});
