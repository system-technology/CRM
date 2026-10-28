import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  INVENTARIO_COOKIES,
  CLAVE_LOCALSTORAGE_CONSENTIMIENTO,
  EVENTO_CONSENTIMIENTO_ACTUALIZADO,
  EVENTO_ABRIR_MODAL_COOKIES,
  obtenerConsentimientoGuardado,
  guardarConsentimiento,
  aceptarTodasLasCookies,
  aceptarSoloCookiesNecesarias,
  tieneConsentimientoPara,
  dispararAperturaModalCookies,
  limpiarDatosNoConsentidos,
  type PreferenciasConsentimiento,
} from './privacidad-cookies';

describe('Privacidad y Cookies (T-094 & T-095) - Gestión de Consentimiento', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Inventario de cookies y almacenamiento (T-094)', () => {
    it('contiene todas las cookies y claves de almacenamiento documentadas', () => {
      expect(INVENTARIO_COOKIES.length).toBeGreaterThanOrEqual(6);

      const nombres = INVENTARIO_COOKIES.map((c) => c.nombre);
      expect(nombres.some((n) => n.includes('viajapro.session_token'))).toBe(true);
      expect(nombres.some((n) => n.includes('viajapro.csrf_token'))).toBe(true);
      expect(nombres).toContain(CLAVE_LOCALSTORAGE_CONSENTIMIENTO);
      expect(nombres).toContain('viajapro_tema');
      expect(nombres).toContain('viajapro_modo_demo');
      expect(nombres).toContain('_viajapro_telemetria_rendimiento');
    });

    it('las cookies técnicas indispensables están catalogadas como estrictamente necesarias', () => {
      const sesion = INVENTARIO_COOKIES.find((c) => c.id === 'cookie-sesion');
      expect(sesion?.categoria).toBe('NECESARIAS');
      expect(sesion?.estrictamenteNecesaria).toBe(true);

      const csrf = INVENTARIO_COOKIES.find((c) => c.id === 'cookie-csrf');
      expect(csrf?.categoria).toBe('NECESARIAS');
      expect(csrf?.estrictamenteNecesaria).toBe(true);
    });

    it('las cookies de telemetría y personalización están catalogadas como no esenciales', () => {
      const telemetria = INVENTARIO_COOKIES.find((c) => c.id === 'storage-telemetria');
      expect(telemetria?.categoria).toBe('ANALITICA');
      expect(telemetria?.estrictamenteNecesaria).toBe(false);

      const tema = INVENTARIO_COOKIES.find((c) => c.id === 'storage-tema');
      expect(tema?.categoria).toBe('PREFERENCIAS');
      expect(tema?.estrictamenteNecesaria).toBe(false);
    });
  });

  describe('2. Lectura y validación de consentimiento (T-095)', () => {
    it('devuelve null cuando el usuario no ha tomado una decisión', () => {
      expect(obtenerConsentimientoGuardado()).toBeNull();
    });

    it('devuelve null y limpia el storage si los datos están corruptos', () => {
      window.localStorage.setItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO, 'datos-invalidos-no-json');
      expect(obtenerConsentimientoGuardado()).toBeNull();

      window.localStorage.setItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO, JSON.stringify({ algo: 123 }));
      expect(obtenerConsentimientoGuardado()).toBeNull();
    });

    it('devuelve null si el consentimiento tiene más de 365 días de antigüedad (expiración legal)', () => {
      const fechaVieja = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
      const registroExpirado: PreferenciasConsentimiento = {
        necesarias: true,
        preferencias: true,
        analitica: true,
        decision: 'ACEPTAR_TODO',
        version: 1,
        fechaUtc: fechaVieja,
      };

      window.localStorage.setItem(
        CLAVE_LOCALSTORAGE_CONSENTIMIENTO,
        JSON.stringify(registroExpirado),
      );

      expect(obtenerConsentimientoGuardado()).toBeNull();
      expect(window.localStorage.getItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO)).toBeNull();
    });

    it('devuelve el objeto de consentimiento válido cuando está vigente', () => {
      const registro: PreferenciasConsentimiento = {
        necesarias: true,
        preferencias: false,
        analitica: false,
        decision: 'SOLO_NECESARIAS',
        version: 1,
        fechaUtc: new Date().toISOString(),
      };

      window.localStorage.setItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO, JSON.stringify(registro));

      const obtenido = obtenerConsentimientoGuardado();
      expect(obtenido).not.toBeNull();
      expect(obtenido?.necesarias).toBe(true);
      expect(obtenido?.preferencias).toBe(false);
      expect(obtenido?.analitica).toBe(false);
      expect(obtenido?.decision).toBe('SOLO_NECESARIAS');
    });
  });

  describe('3. Guardado y acciones rápidas (T-095)', () => {
    it('guardarConsentimiento persiste en localStorage y emite evento global', () => {
      const spyEvento = vi.fn();
      window.addEventListener(EVENTO_CONSENTIMIENTO_ACTUALIZADO, spyEvento);

      const resultado = guardarConsentimiento({
        preferencias: true,
        analitica: false,
        decision: 'PERSONALIZADO',
      });

      expect(resultado.necesarias).toBe(true);
      expect(resultado.preferencias).toBe(true);
      expect(resultado.analitica).toBe(false);
      expect(resultado.decision).toBe('PERSONALIZADO');
      expect(spyEvento).toHaveBeenCalledTimes(1);

      const guardado = window.localStorage.getItem(CLAVE_LOCALSTORAGE_CONSENTIMIENTO);
      expect(guardado).toBeTruthy();

      window.removeEventListener(EVENTO_CONSENTIMIENTO_ACTUALIZADO, spyEvento);
    });

    it('aceptarTodasLasCookies habilita todas las categorías con decisión ACEPTAR_TODO', () => {
      const resultado = aceptarTodasLasCookies();
      expect(resultado.preferencias).toBe(true);
      expect(resultado.analitica).toBe(true);
      expect(resultado.decision).toBe('ACEPTAR_TODO');
    });

    it('aceptarSoloCookiesNecesarias deshabilita preferencias y analítica', () => {
      const resultado = aceptarSoloCookiesNecesarias();
      expect(resultado.preferencias).toBe(false);
      expect(resultado.analitica).toBe(false);
      expect(resultado.decision).toBe('SOLO_NECESARIAS');
    });

    it('limpia datos de analítica si la categoría no fue autorizada', () => {
      window.localStorage.setItem('_viajapro_telemetria_rendimiento', 'telemetria-activa');

      limpiarDatosNoConsentidos({
        necesarias: true,
        preferencias: true,
        analitica: false,
        decision: 'PERSONALIZADO',
        version: 1,
        fechaUtc: new Date().toISOString(),
      });

      expect(window.localStorage.getItem('_viajapro_telemetria_rendimiento')).toBeNull();
    });
  });

  describe('4. Verificación de permisos y eventos de reapertura', () => {
    it('tieneConsentimientoPara siempre devuelve true para NECESARIAS', () => {
      expect(tieneConsentimientoPara('NECESARIAS')).toBe(true);

      aceptarSoloCookiesNecesarias();
      expect(tieneConsentimientoPara('NECESARIAS')).toBe(true);
    });

    it('tieneConsentimientoPara responde según la decisión guardada', () => {
      expect(tieneConsentimientoPara('ANALITICA')).toBe(false);
      expect(tieneConsentimientoPara('PREFERENCIAS')).toBe(false);

      guardarConsentimiento({
        preferencias: true,
        analitica: false,
        decision: 'PERSONALIZADO',
      });

      expect(tieneConsentimientoPara('PREFERENCIAS')).toBe(true);
      expect(tieneConsentimientoPara('ANALITICA')).toBe(false);
    });

    it('dispararAperturaModalCookies emite el evento para reabrir preferencias desde el footer', () => {
      const spyModal = vi.fn();
      window.addEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyModal);

      dispararAperturaModalCookies();

      expect(spyModal).toHaveBeenCalledTimes(1);
      window.removeEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyModal);
    });
  });
});
