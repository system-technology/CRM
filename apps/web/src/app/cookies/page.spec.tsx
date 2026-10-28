import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CookiesPage from './page';
import { EVENTO_ABRIR_MODAL_COOKIES } from '../../lib/privacidad-cookies';

describe('CookiesPage (T-108) - Página pública /cookies', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renderiza el encabezado principal, marco normativo y marca de borrador', () => {
    render(<CookiesPage />);

    expect(
      screen.getByRole('heading', {
        name: /Política de Cookies y Almacenamiento Local/i,
      }),
    ).toBeDefined();

    const badgeBorrador = screen.getByTestId('badge-borrador');
    expect(badgeBorrador).toBeDefined();
    expect(badgeBorrador.textContent).toContain('Borrador en revisión jurídica');
  });

  it('2. Presenta el inventario completo de almacenamiento con cookies técnicas', () => {
    render(<CookiesPage />);

    expect(screen.getByText(/viajapro\.session_token/i)).toBeDefined();
    expect(screen.getByText(/viajapro\.csrf_token/i)).toBeDefined();
    expect(screen.getByText('viajapro_consentimiento_cookies')).toBeDefined();
  });

  it('3. El botón interactivo dispara el evento global para abrir las preferencias', () => {
    const spyEvento = vi.fn();
    window.addEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyEvento);

    render(<CookiesPage />);

    const botones = screen.getAllByTestId('btn-abrir-configuracion-desde-politica');
    expect(botones.length).toBeGreaterThan(0);

    const boton = botones[0]!;
    act(() => {
      fireEvent.click(boton);
    });

    expect(spyEvento).toHaveBeenCalled();
    window.removeEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyEvento);
  });
});
