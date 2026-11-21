import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { CabeceraMovil } from './cabecera-movil';
import { EVENTO_ABRIR_BUSQUEDA_GLOBAL } from '../../lib/busqueda-global-evento';

let ruta = '/';
vi.mock('next/navigation', () => ({ usePathname: () => ruta }));

beforeEach(() => {
  ruta = '/';
});
afterEach(cleanup);

describe('CabeceraMovil (lupa fija, T-320)', () => {
  it('es una fila de 44 px solo móvil con la lupa de 44 × 44 px', () => {
    render(<CabeceraMovil />);
    const cabecera = screen.getByTestId('cabecera-movil');
    expect(cabecera.className).toContain('h-11');
    expect(cabecera.className).toContain('md:hidden');
    const lupa = screen.getByRole('button', { name: 'Buscar' });
    expect(lupa.className).toContain('min-h-[44px]');
    expect(lupa.className).toContain('min-w-[44px]');
  });

  it('la lupa pide abrir la búsqueda global existente (un evento, no una paleta nueva)', () => {
    const alAbrir = vi.fn();
    window.addEventListener(EVENTO_ABRIR_BUSQUEDA_GLOBAL, alAbrir);
    render(<CabeceraMovil />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(alAbrir).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_ABRIR_BUSQUEDA_GLOBAL, alAbrir);
  });

  it.each(['/', '/bandeja', '/viajes', '/seguimientos', '/pipeline'])('aparece en %s', (r) => {
    ruta = r;
    render(<CabeceraMovil />);
    expect(screen.getByTestId('lupa-movil')).toBeDefined();
  });

  it('no aparece en la conversación a pantalla completa', () => {
    ruta = '/bandeja/abc-123';
    render(<CabeceraMovil />);
    expect(screen.queryByTestId('cabecera-movil')).toBeNull();
  });
});
