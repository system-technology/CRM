import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConmutadorDeTema } from './conmutador-de-tema';
import { CLAVE_LOCALSTORAGE_TEMA } from '../../lib/tema-y-densidad';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});
afterEach(cleanup);

describe('ConmutadorDeTema (T-560): pantallas públicas sin menú de perfil', () => {
  it('ofrece claro, oscuro y sistema, con nombre accesible y 44 px', () => {
    render(<ConmutadorDeTema />);
    const grupo = screen.getByRole('radiogroup', { name: 'Tema visual' });
    expect(grupo).toBeTruthy();
    for (const nombre of ['Claro', 'Oscuro', 'Sistema']) {
      const radio = screen.getByRole('radio', { name: nombre });
      expect(radio.className).toContain('min-h-[44px]');
      expect(radio.className).toContain('min-w-[44px]');
    }
  });

  it('elegir «Oscuro» lo guarda y pone la clase dark en <html>', () => {
    render(<ConmutadorDeTema />);
    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Oscuro' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Claro' }).getAttribute('aria-checked')).toBe('false');
  });

  it('elegir «Claro» después quita la clase dark', () => {
    document.documentElement.classList.add('dark');
    render(<ConmutadorDeTema />);
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('al montar marca la opción que ya estaba guardada (sobrevive a recargar)', async () => {
    localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, 'dark');
    render(<ConmutadorDeTema />);
    expect(
      (await screen.findByRole('radio', { name: 'Oscuro' })).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('sin preferencia guardada marca «Sistema», que es el valor por defecto', async () => {
    render(<ConmutadorDeTema />);
    expect(
      (await screen.findByRole('radio', { name: 'Sistema' })).getAttribute('aria-checked'),
    ).toBe('true');
  });
});
