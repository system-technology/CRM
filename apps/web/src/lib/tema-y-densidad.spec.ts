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

  describe('SCRIPT_ANTI_FOUC ejecutado: la clase que deja antes de la primera pintura (T-560)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

    /**
     * Ejecuta el script TAL COMO lo inyecta el layout en el <head>: es lo único que decide la clase
     * de la primera pintura, así que se prueba su comportamiento y no solo que contenga ciertas
     * cadenas. Evaluar un texto es justo el objeto de esta prueba.
     */
    function ejecutarScript(): void {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const ejecutar = new Function(SCRIPT_ANTI_FOUC) as () => void;
      ejecutar();
    }

    function ejecutar(sistemaOscuro: boolean, guardada: string | null, densidad?: string) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (consulta: string) => ({
          matches: consulta.includes('prefers-color-scheme: dark') ? sistemaOscuro : false,
        }),
      });
      localStorage.clear();
      if (guardada !== null) localStorage.setItem(CLAVE_LOCALSTORAGE_TEMA, guardada);
      if (densidad) localStorage.setItem(CLAVE_LOCALSTORAGE_DENSIDAD, densidad);
      ejecutarScript();
      const r = document.documentElement;
      return {
        oscuro: r.classList.contains('dark'),
        efectivo: r.getAttribute('data-tema-efectivo'),
        tema: r.getAttribute('data-tema'),
        densidad: r.getAttribute('data-densidad'),
      };
    }

    afterEach(() => {
      if (original) Object.defineProperty(window, 'matchMedia', original);
      else Reflect.deleteProperty(window, 'matchMedia');
    });

    it('sistema en oscuro y sin preferencia guardada: abre en oscuro', () => {
      expect(ejecutar(true, null)).toMatchObject({
        oscuro: true,
        efectivo: 'dark',
        tema: 'system',
      });
    });

    it('sistema en claro y sin preferencia guardada: abre en claro', () => {
      expect(ejecutar(false, null)).toMatchObject({
        oscuro: false,
        efectivo: 'light',
        tema: 'system',
      });
    });

    it('la preferencia guardada «claro» gana al sistema oscuro', () => {
      expect(ejecutar(true, 'light')).toMatchObject({
        oscuro: false,
        efectivo: 'light',
        tema: 'light',
      });
    });

    it('la preferencia guardada «oscuro» gana al sistema claro', () => {
      expect(ejecutar(false, 'dark')).toMatchObject({
        oscuro: true,
        efectivo: 'dark',
        tema: 'dark',
      });
    });

    it('«sistema» guardado explícitamente sigue al sistema', () => {
      expect(ejecutar(true, 'system').oscuro).toBe(true);
      expect(ejecutar(false, 'system').oscuro).toBe(false);
    });

    it('quita la clase dark si la preferencia resulta clara (no se queda pegada)', () => {
      document.documentElement.classList.add('dark');
      expect(ejecutar(false, 'light').oscuro).toBe(false);
    });

    it('fija la densidad guardada, y «cómoda» si no hay', () => {
      expect(ejecutar(false, null, 'compacta').densidad).toBe('compacta');
      expect(ejecutar(false, null).densidad).toBe('comoda');
    });

    it('si el almacenamiento falla no lanza ni rompe la página', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('almacenamiento bloqueado');
      });
      expect(() => ejecutarScript()).not.toThrow();
    });
  });
});
