import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModalPreferenciasCookies } from './modal-preferencias-cookies';
import { obtenerConsentimientoGuardado } from '../../lib/privacidad-cookies';

describe('ModalPreferenciasCookies (T-095) - Configuración granular accesible', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. No renderiza nada si abierto es false', () => {
    const { container } = render(<ModalPreferenciasCookies abierto={false} alCerrar={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('2. Renderiza las 3 categorías con explicación de cookies necesarias siempre activas', () => {
    render(<ModalPreferenciasCookies abierto={true} alCerrar={() => {}} />);

    expect(screen.getByTestId('modal-preferencias-cookies')).toBeDefined();
    expect(screen.getByText('Cookies Estrictamente Necesarias')).toBeDefined();
    expect(screen.getByText('Siempre activas')).toBeDefined();
    expect(screen.getByText('Preferencias y Ergonomía')).toBeDefined();
    expect(screen.getByText('Analítica y Rendimiento Operacional')).toBeDefined();
  });

  it('3. Permite alternar switches de preferencias y analítica', () => {
    render(<ModalPreferenciasCookies abierto={true} alCerrar={() => {}} />);

    const switchPref = screen.getByTestId('switch-cookies-preferencias');
    expect(switchPref.getAttribute('aria-checked')).toBe('false');

    act(() => {
      fireEvent.click(switchPref);
    });
    expect(switchPref.getAttribute('aria-checked')).toBe('true');

    const switchAna = screen.getByTestId('switch-cookies-analitica');
    expect(switchAna.getAttribute('aria-checked')).toBe('false');

    act(() => {
      fireEvent.click(switchAna);
    });
    expect(switchAna.getAttribute('aria-checked')).toBe('true');
  });

  it('4. Botón "Guardar preferencias" persiste decisión personalizada', () => {
    const alGuardar = vi.fn();
    const alCerrar = vi.fn();

    render(<ModalPreferenciasCookies abierto={true} alCerrar={alCerrar} alGuardar={alGuardar} />);

    // Activamos solo preferencias
    const switchPref = screen.getByTestId('switch-cookies-preferencias');
    act(() => {
      fireEvent.click(switchPref);
    });

    const btnGuardar = screen.getByTestId('btn-guardar-preferencias-cookies');
    act(() => {
      fireEvent.click(btnGuardar);
    });

    expect(alGuardar).toHaveBeenCalledTimes(1);
    const guardado = obtenerConsentimientoGuardado();
    expect(guardado).not.toBeNull();
    expect(guardado?.preferencias).toBe(true);
    expect(guardado?.analitica).toBe(false);
    expect(guardado?.decision).toBe('PERSONALIZADO');
  });

  it('5. Botón "Aceptar todas" activa todas las categorías desde el modal', () => {
    const alGuardar = vi.fn();

    render(<ModalPreferenciasCookies abierto={true} alCerrar={() => {}} alGuardar={alGuardar} />);

    const btnAceptarTodas = screen.getByTestId('btn-modal-aceptar-todas');
    act(() => {
      fireEvent.click(btnAceptarTodas);
    });

    expect(alGuardar).toHaveBeenCalledTimes(1);
    const guardado = obtenerConsentimientoGuardado();
    expect(guardado?.preferencias).toBe(true);
    expect(guardado?.analitica).toBe(true);
    expect(guardado?.decision).toBe('ACEPTAR_TODO');
  });

  it('6. Botón "Solo necesarias" bloquea analítica y preferencias desde el modal', () => {
    const alGuardar = vi.fn();

    render(<ModalPreferenciasCookies abierto={true} alCerrar={() => {}} alGuardar={alGuardar} />);

    const btnSoloNecesarias = screen.getByTestId('btn-modal-solo-necesarias');
    act(() => {
      fireEvent.click(btnSoloNecesarias);
    });

    expect(alGuardar).toHaveBeenCalledTimes(1);
    const guardado = obtenerConsentimientoGuardado();
    expect(guardado?.preferencias).toBe(false);
    expect(guardado?.analitica).toBe(false);
    expect(guardado?.decision).toBe('SOLO_NECESARIAS');
  });
});
