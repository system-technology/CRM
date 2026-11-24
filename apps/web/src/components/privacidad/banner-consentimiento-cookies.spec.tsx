import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  BannerConsentimientoCookies,
  VARIABLE_ALTURA_BANNER_COOKIES,
} from './banner-consentimiento-cookies';
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

  it('Reserva su altura en una variable CSS mientras está visible y la libera al decidir (no tapa el compositor de la bandeja)', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(132);
    render(<BannerConsentimientoCookies />);

    expect(document.documentElement.style.getPropertyValue(VARIABLE_ALTURA_BANNER_COOKIES)).toBe(
      '132px',
    );

    act(() => {
      fireEvent.click(screen.getByTestId('btn-cookies-solo-necesarias'));
    });

    expect(document.documentElement.style.getPropertyValue(VARIABLE_ALTURA_BANNER_COOKIES)).toBe(
      '',
    );
  });
});

/**
 * Guardas de T-628: el aviso NO debe volver a tapar el ingreso en el teléfono.
 *
 * Por qué existen: el arreglo de T-628 es de clases (`sm:`), y en este proyecto una clase que
 * cambia o desaparece **no avisa de nada** (T-561, T-569, T-627, T-626). El PR que lo arregló
 * dejó las siete pruebas de arriba en verde **sin tocar ninguna**: eso significa que ninguna
 * vigilaba el alto del aviso. Si alguien devuelve el párrafo largo al móvil o quita el `grid`,
 * el aviso vuelve a medir 355 px de 844 y parte por la mitad «Ingresar a ViajaPro», y la suite
 * seguiría verde.
 *
 * Lo que NO prueban, y hay que decirlo: cómo se ve. jsdom no evalúa `sm:`. El alto real se midió
 * con el navegador a 390 px (355 px -> 221 px, botón de 25 px tapados a 109 px de holgura).
 */
describe('BannerConsentimientoCookies — no tapa el ingreso en el teléfono (T-628)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('el móvil recibe el texto corto y el párrafo largo queda para pantallas anchas', () => {
    render(<BannerConsentimientoCookies />);
    const banner = screen.getByTestId('banner-consentimiento-cookies');

    const parrafos = Array.from(banner.querySelectorAll('p'));
    const corto = parrafos.find((p) => /Solo cookies técnicas/i.test(p.textContent ?? ''));
    const largo = parrafos.find((p) => /estrictamente necesarias/i.test(p.textContent ?? ''));

    expect(corto, 'el texto corto del móvil existe').toBeDefined();
    expect(largo, 'el párrafo completo sigue existiendo para pantallas anchas').toBeDefined();
    // El corto desaparece a partir de `sm`; el largo solo aparece a partir de `sm`.
    expect(corto!.className).toContain('sm:hidden');
    expect(largo!.className).toContain('hidden');
    expect(largo!.className).toContain('sm:block');
  });

  it('los tres botones van en tres columnas en el móvil, no envolviendo', () => {
    render(<BannerConsentimientoCookies />);
    const contenedor = screen.getByTestId('btn-cookies-aceptar-todas').parentElement!;

    // Con `flex-wrap` en móvil, «Aceptar todas» caía a una segunda fila: +56 px de alto.
    expect(contenedor.className).toContain('grid-cols-3');
    expect(contenedor.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/);
    expect(contenedor.querySelectorAll('button').length).toBe(3);
  });

  it('las etiquetas que no caben a 390 px tienen versión corta y larga', () => {
    render(<BannerConsentimientoCookies />);

    for (const [testid, corta, larga] of [
      ['btn-cookies-solo-necesarias', 'Necesarias', 'Solo necesarias'],
      ['btn-cookies-aceptar-todas', 'Aceptar', 'Aceptar todas'],
    ] as const) {
      const boton = screen.getByTestId(testid);
      const spans = Array.from(boton.querySelectorAll('span'));
      const spanCorto = spans.find((e) => e.textContent === corta);
      const spanLargo = spans.find((e) => e.textContent === larga);
      expect(spanCorto, `${testid} conserva la etiqueta corta del móvil`).toBeDefined();
      expect(spanLargo, `${testid} conserva la etiqueta completa`).toBeDefined();
      expect(spanCorto!.className).toContain('sm:hidden');
      expect(spanLargo!.className).toContain('hidden');
    }
  });

  it('los tres botones conservan el objetivo táctil de 44 px', () => {
    render(<BannerConsentimientoCookies />);
    for (const testid of [
      'btn-cookies-configurar',
      'btn-cookies-solo-necesarias',
      'btn-cookies-aceptar-todas',
    ]) {
      expect(screen.getByTestId(testid).className, `${testid} mantiene 44 px`).toContain(
        'min-h-[44px]',
      );
    }
  });
});
