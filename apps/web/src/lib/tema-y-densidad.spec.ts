import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolverTemaEfectivo,
  consultarPreferenciaSistemaOscuro,
  cargarPreferenciasTema,
  aplicarTemaYDensidadEnDocumento,
  guardarModoTema,
  guardarDensidadVisual,
  PREFERENCIAS_TEMA_POR_DEFECTO,
  CLAVE_LOCALSTORAGE_TEMA,
  CLAVE_LOCALSTORAGE_DENSIDAD,
  SCRIPT_ANTI_FOUC,
} from './tema-y-densidad';

describe('Módulo de Modo Oscuro y Preferencia de Densidad Visual (tema-y-densidad.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-tema');
    document.documentElement.removeAttribute('data-tema-efectivo');
    document.documentElement.removeAttribute('data-densidad');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('resolverTemaEfectivo', () => {
    it('fuerza dark cuando el modo es dark independientemente del sistema', () => {
      expect(resolverTemaEfectivo('dark', false)).toBe('dark');
      expect(resolverTemaEfectivo('dark', true)).toBe('dark');
    });

    it('fuerza light cuando el modo es light independientemente del sistema', () => {
      expect(resolverTemaEfectivo('light', false)).toBe('light');
      expect(resolverTemaEfectivo('light', true)).toBe('light');
    });

    it('sigue la preferencia del sistema operativo cuando el modo es system', () => {
      expect(resolverTemaEfectivo('system', false)).toBe('light');
      expect(resolverTemaEfectivo('system', true)).toBe('dark');
    });
  });

  describe('consultarPreferenciaSistemaOscuro', () => {
    function crearMockMediaQueryList(matches: boolean): MediaQueryList {
      return {
        matches,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }

    it('retorna true si matchMedia coincide con dark', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue(crearMockMediaQueryList(true));

      expect(consultarPreferenciaSistemaOscuro()).toBe(true);
    });

    it('retorna false si matchMedia no coincide con dark', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue(crearMockMediaQueryList(false));

      expect(consultarPreferenciaSistemaOscuro()).toBe(false);
    });
  });

  describe('cargarPreferenciasTema', () => {
    it('devuelve valores por defecto (system, comoda) cuando el storage está vacío', () => {
      const prefs = cargarPreferenciasTema();
      expect(prefs).toEqual(PREFERENCIAS_TEMA_POR_DEFECTO);
    });

    it('recupera tema y densidad válidos previamente guardados', () => {
      localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, 'dark');
      localStorage.setItem(CLAVE_LOCALSTORAGE_DENSIDAD, 'compacta');

      const prefs = cargarPreferenciasTema();
      expect(prefs.tema).toBe('dark');
      expect(prefs.densidad).toBe('compacta');
    });

    it('utiliza fallback ante valores desconocidos o corruptos', () => {
      localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, 'neon_azul');
      localStorage.setItem(CLAVE_LOCALSTORAGE_DENSIDAD, 'super_densa');

      const prefs = cargarPreferenciasTema();
      expect(prefs.tema).toBe('system');
      expect(prefs.densidad).toBe('comoda');
    });
  });

  describe('aplicarTemaYDensidadEnDocumento', () => {
    it('agrega clase dark y fija atributos cuando el modo es dark', () => {
      aplicarTemaYDensidadEnDocumento('dark', 'comoda');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-tema')).toBe('dark');
      expect(document.documentElement.getAttribute('data-tema-efectivo')).toBe('dark');
      expect(document.documentElement.getAttribute('data-densidad')).toBe('comoda');
    });

    it('remueve clase dark y fija atributos cuando el modo es light', () => {
      document.documentElement.classList.add('dark');
      aplicarTemaYDensidadEnDocumento('light', 'compacta');

      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.getAttribute('data-tema')).toBe('light');
      expect(document.documentElement.getAttribute('data-tema-efectivo')).toBe('light');
      expect(document.documentElement.getAttribute('data-densidad')).toBe('compacta');
    });
  });

  describe('guardarModoTema y guardarDensidadVisual', () => {
    it('persiste el modo de tema y lo refleja en el documento', () => {
      const resultado = guardarModoTema('dark');
      expect(resultado.tema).toBe('dark');
      expect(localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA)).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('persiste la densidad visual y la refleja en data-densidad', () => {
      const resultado = guardarDensidadVisual('compacta');
      expect(resultado.densidad).toBe('compacta');
      expect(localStorage.getItem(CLAVE_LOCALSTORAGE_DENSIDAD)).toBe('compacta');
      expect(document.documentElement.getAttribute('data-densidad')).toBe('compacta');
    });
  });

  describe('SCRIPT_ANTI_FOUC', () => {
    it('contiene la lógica inline de lectura de storage y prevención de parpadeo', () => {
      expect(SCRIPT_ANTI_FOUC).toContain(CLAVE_LOCALSTORAGE_TEMA);
      expect(SCRIPT_ANTI_FOUC).toContain(CLAVE_LOCALSTORAGE_DENSIDAD);
      expect(SCRIPT_ANTI_FOUC).toContain('prefers-color-scheme');
      expect(SCRIPT_ANTI_FOUC).toContain('classList.add');
    });
  });
});
