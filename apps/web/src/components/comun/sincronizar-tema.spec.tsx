// @vitest-environment happy-dom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SincronizarTema } from './sincronizar-tema';
import { CLAVE_LOCALSTORAGE_TEMA } from '../../lib/tema-y-densidad';

describe('SincronizarTema (T-586)', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('data-tema');
  });

  it('repone la clase dark si la hidratación vació <html>', () => {
    localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    render(<SincronizarTema />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-tema')).toBe('dark');
  });

  it('quita dark si la preferencia es claro', () => {
    localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, 'light');
    document.documentElement.classList.add('dark');
    render(<SincronizarTema />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
