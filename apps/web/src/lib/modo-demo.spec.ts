import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  esModoDemo,
  fijarModoDemo,
  CLAVE_LOCALSTORAGE_MODO_DEMO,
  EVENTO_CAMBIO_MODO_DEMO,
} from './modo-demo';

describe('modo-demo (Bloque 1: Modo real por defecto / Modo demo opcional)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env['NEXT_PUBLIC_FORCE_DEMO'];
    delete process.env['NEXT_PUBLIC_USE_MOCK_INBOX'];
    delete process.env['NEXT_PUBLIC_USE_REAL_CRM'];
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('por defecto devuelve false (Modo Real por defecto sin variables de desarrollo)', () => {
    expect(esModoDemo()).toBe(false);
  });

  it('devuelve true si NEXT_PUBLIC_FORCE_DEMO es true', () => {
    process.env['NEXT_PUBLIC_FORCE_DEMO'] = 'true';
    expect(esModoDemo()).toBe(true);
  });

  it('devuelve true si NEXT_PUBLIC_USE_MOCK_INBOX es true', () => {
    process.env['NEXT_PUBLIC_USE_MOCK_INBOX'] = 'true';
    expect(esModoDemo()).toBe(true);
  });

  it('devuelve true si NEXT_PUBLIC_USE_REAL_CRM es explicitamente false (para tests)', () => {
    process.env['NEXT_PUBLIC_USE_REAL_CRM'] = 'false';
    expect(esModoDemo()).toBe(true);
  });

  it('devuelve true si localStorage tiene viajapro_modo_demo en true', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'true');
    expect(esModoDemo()).toBe(true);
  });

  it('devuelve false si localStorage tiene viajapro_modo_demo en false incluso si hay variables de mock', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'false');
    expect(esModoDemo()).toBe(false);
  });

  it('fijarModoDemo actualiza localStorage y emite evento custom', () => {
    const spyEvent = vi.fn();
    window.addEventListener(EVENTO_CAMBIO_MODO_DEMO, spyEvent);

    fijarModoDemo(true);
    expect(window.localStorage.getItem(CLAVE_LOCALSTORAGE_MODO_DEMO)).toBe('true');
    expect(spyEvent).toHaveBeenCalledTimes(1);

    fijarModoDemo(false);
    expect(window.localStorage.getItem(CLAVE_LOCALSTORAGE_MODO_DEMO)).toBe('false');
    expect(spyEvent).toHaveBeenCalledTimes(2);

    window.removeEventListener(EVENTO_CAMBIO_MODO_DEMO, spyEvent);
  });
});
