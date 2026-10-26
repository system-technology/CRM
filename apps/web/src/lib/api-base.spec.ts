import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { obtenerBaseApi } from './api-base';

describe('obtenerBaseApi (ADR-0011 §2)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('respeta NEXT_PUBLIC_API_URL si está explícitamente configurada y no vacía', () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.viajapro.com';
    expect(obtenerBaseApi()).toBe('https://api.viajapro.com');
  });

  it('devuelve cadena vacía en navegador si NEXT_PUBLIC_API_URL es vacía o indefinida', () => {
    delete process.env['NEXT_PUBLIC_API_URL'];
    // En jsdom, typeof window !== 'undefined' es verdadero
    expect(obtenerBaseApi()).toBe('');
  });

  it('utiliza API_INTERNAL_URL en entorno de servidor si NEXT_PUBLIC_API_URL no está', () => {
    delete process.env['NEXT_PUBLIC_API_URL'];
    process.env['API_INTERNAL_URL'] = 'http://api-interna:3333';

    // Simulamos entorno sin window
    const originalWindow = global.window;
    // @ts-expect-error simulación de SSR
    delete global.window;

    try {
      expect(obtenerBaseApi()).toBe('http://api-interna:3333');
    } finally {
      global.window = originalWindow;
    }
  });

  it('utiliza fallback localhost:3333 en entorno de servidor si no hay variables de entorno', () => {
    delete process.env['NEXT_PUBLIC_API_URL'];
    delete process.env['API_INTERNAL_URL'];

    const originalWindow = global.window;
    // @ts-expect-error simulación de SSR
    delete global.window;

    try {
      expect(obtenerBaseApi()).toBe('http://localhost:3333');
    } finally {
      global.window = originalWindow;
    }
  });
});
