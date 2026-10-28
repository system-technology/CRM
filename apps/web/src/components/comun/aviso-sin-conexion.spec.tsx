import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AvisoSinConexion } from './aviso-sin-conexion';

describe('AvisoSinConexion (T-109)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('no muestra aviso si el navegador está en línea inicialmente', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    render(<AvisoSinConexion />);

    expect(screen.queryByTestId('banner-sin-conexion')).toBeNull();
    expect(screen.queryByTestId('aviso-conexion-restablecida')).toBeNull();
  });

  it('muestra el banner cuando se dispara el evento offline de pérdida de red', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    render(<AvisoSinConexion />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    const banner = screen.getByTestId('banner-sin-conexion');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('Estás trabajando sin conexión');
  });

  it('muestra el aviso de conexión restablecida al disparar el evento online y se oculta tras timeout', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<AvisoSinConexion />);

    // Simular que vuelve internet
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    const aviso = screen.getByTestId('aviso-conexion-restablecida');
    expect(aviso).toBeDefined();
    expect(aviso.textContent).toContain('Conexión restablecida con ViajaPro');

    // Avanzar temporizador
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByTestId('aviso-conexion-restablecida')).toBeNull();
  });

  it('permite comprobar la red manualmente con el botón comprobar red', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
      }),
    );

    render(<AvisoSinConexion />);

    const btnComprobar = screen.getByTestId('btn-comprobar-conexion');
    await act(async () => {
      fireEvent.click(btnComprobar);
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith('/salud', expect.anything());
    expect(screen.getByTestId('aviso-conexion-restablecida')).toBeDefined();
  });
});
