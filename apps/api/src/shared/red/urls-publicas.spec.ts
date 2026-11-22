import { describe, expect, it, vi } from 'vitest';
import { avisarDeUrlsPublicas, avisosDeUrlsPublicas } from './urls-publicas.js';

const BIEN = {
  APP_ENV: 'staging',
  WEB_PUBLIC_URL: 'https://staging.agencia.example',
  API_PUBLIC_URL: 'https://api.staging.agencia.example',
};

describe('avisosDeUrlsPublicas', () => {
  it('con las dos variables bien puestas fuera de desarrollo no avisa', () => {
    expect(avisosDeUrlsPublicas(BIEN)).toEqual([]);
  });

  it('falta WEB_PUBLIC_URL en producción: avisa, con el valor que se usará y la consecuencia', () => {
    const { WEB_PUBLIC_URL: _omitida, ...sin } = BIEN;
    const avisos = avisosDeUrlsPublicas(sin);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.variable).toBe('WEB_PUBLIC_URL');
    expect(avisos[0]?.valorEnUso).toBe('http://localhost:3000');
    expect(avisos[0]?.mensaje).toContain('WEB_PUBLIC_URL');
    expect(avisos[0]?.mensaje).toContain('http://localhost:3000');
    expect(avisos[0]?.mensaje).toContain('ningún navegador podrá iniciar sesión');
  });

  it('falta API_PUBLIC_URL: avisa con el valor por omisión que usa Better Auth', () => {
    const { API_PUBLIC_URL: _omitida, ...sin } = BIEN;
    const avisos = avisosDeUrlsPublicas({ ...sin, API_PORT: '10000' });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.variable).toBe('API_PUBLIC_URL');
    expect(avisos[0]?.valorEnUso).toBe('http://localhost:10000');
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://LOCALHOST',
    'http://[::1]:3000',
  ])('WEB_PUBLIC_URL apunta a %s en producción: avisa', (url) => {
    const avisos = avisosDeUrlsPublicas({ ...BIEN, WEB_PUBLIC_URL: url });
    expect(avisos.map((a) => a.variable)).toEqual(['WEB_PUBLIC_URL']);
    expect(avisos[0]?.valorEnUso).toBe(url);
  });

  it('API_PUBLIC_URL a localhost en producción: avisa', () => {
    const avisos = avisosDeUrlsPublicas({ ...BIEN, API_PUBLIC_URL: 'http://localhost:3333' });
    expect(avisos.map((a) => a.variable)).toEqual(['API_PUBLIC_URL']);
  });

  it('una variable vacía cuenta como ausente', () => {
    const avisos = avisosDeUrlsPublicas({ ...BIEN, WEB_PUBLIC_URL: '' });
    expect(avisos.map((a) => a.variable)).toEqual(['WEB_PUBLIC_URL']);
  });

  it('un valor que no es una URL avisa', () => {
    const avisos = avisosDeUrlsPublicas({ ...BIEN, WEB_PUBLIC_URL: 'staging.agencia.example' });
    expect(avisos.map((a) => a.variable)).toEqual(['WEB_PUBLIC_URL']);
  });

  it('ambas mal: dos avisos', () => {
    expect(avisosDeUrlsPublicas({ APP_ENV: 'staging' })).toHaveLength(2);
  });

  it('sin APP_ENV se trata como producción', () => {
    expect(avisosDeUrlsPublicas({})).toHaveLength(2);
  });

  it('en desarrollo (APP_ENV=local) no molesta, aunque falten o apunten a localhost', () => {
    expect(avisosDeUrlsPublicas({ APP_ENV: 'local' })).toEqual([]);
    expect(
      avisosDeUrlsPublicas({
        APP_ENV: 'local',
        WEB_PUBLIC_URL: 'http://localhost:3000',
        API_PUBLIC_URL: 'http://127.0.0.1:3333',
      }),
    ).toEqual([]);
  });
});

describe('avisarDeUrlsPublicas', () => {
  it('registra un error por aviso y no lanza', () => {
    const error = vi.fn();
    expect(() => avisarDeUrlsPublicas({ APP_ENV: 'staging' }, { error })).not.toThrow();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('no registra nada si todo está bien', () => {
    const error = vi.fn();
    avisarDeUrlsPublicas(BIEN, { error });
    expect(error).not.toHaveBeenCalled();
  });
});
