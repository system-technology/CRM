import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PoliticaCookiesPage from './page';
import { EVENTO_ABRIR_MODAL_COOKIES } from '../../lib/privacidad-cookies';

describe('PoliticaCookiesPage (T-094) - Página pública de política e inventario', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renderiza el título principal y el marco normativo colombiano (Ley 1581 / SIC)', () => {
    render(<PoliticaCookiesPage />);

    expect(
      screen.getByRole('heading', {
        name: /Política de Cookies y Almacenamiento del Navegador/i,
      }),
    ).toBeDefined();

    expect(screen.getAllByText(/Ley 1581 \/ SIC/i).length).toBeGreaterThan(0);
  });

  it('2. Renderiza la tabla con el inventario completo de cookies y almacenamiento', () => {
    render(<PoliticaCookiesPage />);

    // Verifica que se muestren los nombres de las cookies técnicas de la API y de la web
    expect(screen.getByText(/viajapro\.session_token/i)).toBeDefined();
    expect(screen.getByText(/viajapro\.csrf_token/i)).toBeDefined();
    expect(screen.getByText('viajapro_consentimiento_cookies')).toBeDefined();
    expect(screen.getByText('viajapro_tema')).toBeDefined();
    expect(screen.getByText('viajapro_modo_demo')).toBeDefined();
    expect(screen.getByText('_viajapro_telemetria_rendimiento')).toBeDefined();
  });

  it('3. El botón interactivo permite disparar la apertura del modal de configuración', () => {
    const spyEvento = vi.fn();
    window.addEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyEvento);

    render(<PoliticaCookiesPage />);

    const botones = screen.getAllByTestId('btn-abrir-configuracion-desde-politica');
    expect(botones.length).toBeGreaterThan(0);

    const primerBoton = botones[0];
    expect(primerBoton).toBeDefined();
    if (!primerBoton) throw new Error('Boton no encontrado');

    act(() => {
      fireEvent.click(primerBoton);
    });

    expect(spyEvento).toHaveBeenCalled();
    window.removeEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyEvento);
  });

  it('4. Contiene la guía de configuración y desactivación en navegadores', () => {
    render(<PoliticaCookiesPage />);

    expect(screen.getByText(/Google Chrome:/i)).toBeDefined();
    expect(screen.getByText(/Mozilla Firefox:/i)).toBeDefined();
    expect(screen.getByText(/Apple Safari:/i)).toBeDefined();
    expect(screen.getByText(/Microsoft Edge:/i)).toBeDefined();
  });
});
