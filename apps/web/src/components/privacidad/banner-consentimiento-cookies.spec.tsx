import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BannerConsentimientoCookies } from './banner-consentimiento-cookies';
import {
  CLAVE_LOCALSTORAGE_CONSENTIMIENTO,
  obtenerConsentimientoGuardado,
  dispararAperturaModalCookies,
  type PreferenciasConsentimiento,
} from '../../lib/privacidad-cookies';

describe('BannerConsentimientoCookies (T-095) - Consentimiento de cookies y privacidad', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Renderiza el banner flotante cuando no hay consentimiento previo guardado', () => {
    render(<BannerConsentimientoCookies />);

    expect(screen.getByTestId('banner-consentimiento-cookies')).toBeDefined();
    expect(screen.getByText('Tu privacidad y seguridad en ViajaPro')).toBeDefined();
    expect(screen.getByTestId('btn-cookies-aceptar-todas')).toBeDefined();
    expect(screen.getByTestId('btn-cookies-solo-necesarias')).toBeDefined();
    expect(screen.getByTestId('btn-cookies-configurar')).toBeDefined();
    expect(screen.getByTestId('enlace-politica-cookies')).toBeDefined();
  });

  it('2. No renderiza el banner si el usuario ya tomó una decisión vigente', () => {
    const decision: PreferenciasConsentimiento = {
      necesarias: true,
      preferencias: false,
      analitica: false,
      decision: 'SOLO_NECESARIAS',
      version: 1,
      fechaUtc: new Date().toISOString(),
    };
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO, JSON.stringify(decision));

    render(<BannerConsentimientoCookies />);

    expect(screen.queryByTestId('banner-consentimiento-cookies')).toBeNull();
  });

  it('3. Al pulsar "Aceptar todas" guarda el consentimiento completo y oculta el banner', () => {
    render(<BannerConsentimientoCookies />);

    const botonAceptar = screen.getByTestId('btn-cookies-aceptar-todas');
    act(() => {
      fireEvent.click(botonAceptar);
    });

    expect(screen.queryByTestId('banner-consentimiento-cookies')).toBeNull();

    const guardado = obtenerConsentimientoGuardado();
    expect(guardado).not.toBeNull();
    expect(guardado?.necesarias).toBe(true);
    expect(guardado?.preferencias).toBe(true);
    expect(guardado?.analitica).toBe(true);
    expect(guardado?.decision).toBe('ACEPTAR_TODO');
  });

  it('4. Al pulsar "Solo necesarias" bloquea analítica y preferencias y oculta el banner', () => {
    render(<BannerConsentimientoCookies />);

    const botonSoloNecesarias = screen.getByTestId('btn-cookies-solo-necesarias');
    act(() => {
      fireEvent.click(botonSoloNecesarias);
    });

    expect(screen.queryByTestId('banner-consentimiento-cookies')).toBeNull();

    const guardado = obtenerConsentimientoGuardado();
    expect(guardado).not.toBeNull();
    expect(guardado?.necesarias).toBe(true);
    expect(guardado?.preferencias).toBe(false);
    expect(guardado?.analitica).toBe(false);
    expect(guardado?.decision).toBe('SOLO_NECESARIAS');
  });

  it('5. Al pulsar "Configurar" abre el modal de configuración granular', () => {
    render(<BannerConsentimientoCookies />);

    expect(screen.queryByTestId('modal-preferencias-cookies')).toBeNull();

    const botonConfigurar = screen.getByTestId('btn-cookies-configurar');
    act(() => {
      fireEvent.click(botonConfigurar);
    });

    expect(screen.getByTestId('modal-preferencias-cookies')).toBeDefined();
    expect(screen.getByText('Preferencias de Privacidad y Cookies')).toBeDefined();
  });

  it('6. Responde al evento global de reapertura emitido desde el pie de página', () => {
    const decision: PreferenciasConsentimiento = {
      necesarias: true,
      preferencias: true,
      analitica: true,
      decision: 'ACEPTAR_TODO',
      version: 1,
      fechaUtc: new Date().toISOString(),
    };
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO, JSON.stringify(decision));

    render(<BannerConsentimientoCookies />);
    expect(screen.queryByTestId('modal-preferencias-cookies')).toBeNull();

    act(() => {
      dispararAperturaModalCookies();
    });

    expect(screen.getByTestId('modal-preferencias-cookies')).toBeDefined();
  });
});
