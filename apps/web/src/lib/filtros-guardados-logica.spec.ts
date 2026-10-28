import { describe, it, expect, beforeEach } from 'vitest';
import {
  obtenerFiltrosAlmacenados,
  guardarFiltrosEnAlmacenamiento,
  limpiarFiltrosEnAlmacenamiento,
  hayFiltrosActivos,
  CLAVE_FILTROS_BANDEJA,
  FILTROS_BANDEJA_DEFECTO,
  CLAVE_FILTROS_CONTACTOS,
  FILTROS_CONTACTOS_DEFECTO,
  CLAVE_FILTROS_PIPELINE,
  FILTROS_PIPELINE_DEFECTO,
} from './filtros-guardados-logica';

describe('filtros-guardados-logica (T-103)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('obtenerFiltrosAlmacenados', () => {
    it('retorna valores por defecto cuando no hay nada almacenado', () => {
      const resultado = obtenerFiltrosAlmacenados(CLAVE_FILTROS_BANDEJA, FILTROS_BANDEJA_DEFECTO);
      expect(resultado).toEqual(FILTROS_BANDEJA_DEFECTO);
    });

    it('retorna valores por defecto si el JSON almacenado es inválido o no es objeto', () => {
      localStorage.setItem(CLAVE_FILTROS_BANDEJA, 'invalido-no-json');
      const resultado = obtenerFiltrosAlmacenados(CLAVE_FILTROS_BANDEJA, FILTROS_BANDEJA_DEFECTO);
      expect(resultado).toEqual(FILTROS_BANDEJA_DEFECTO);

      localStorage.setItem(CLAVE_FILTROS_BANDEJA, '12345');
      expect(obtenerFiltrosAlmacenados(CLAVE_FILTROS_BANDEJA, FILTROS_BANDEJA_DEFECTO)).toEqual(
        FILTROS_BANDEJA_DEFECTO,
      );
    });

    it('combina valores almacenados válidos con valores por defecto', () => {
      localStorage.setItem(
        CLAVE_FILTROS_BANDEJA,
        JSON.stringify({ filtro: 'MIAS', buscar: 'Cancún' }),
      );
      const resultado = obtenerFiltrosAlmacenados(CLAVE_FILTROS_BANDEJA, FILTROS_BANDEJA_DEFECTO);
      expect(resultado).toEqual({ filtro: 'MIAS', buscar: 'Cancún' });
    });
  });

  describe('guardarFiltrosEnAlmacenamiento y limpiarFiltrosEnAlmacenamiento', () => {
    it('guarda filtros serializados en localStorage', () => {
      guardarFiltrosEnAlmacenamiento(CLAVE_FILTROS_CONTACTOS, {
        busqueda: 'Laura',
        etiquetaFiltro: 'VIP',
        consentimientoFiltro: 'PROMOCIONAL',
      });

      const guardado = localStorage.getItem(CLAVE_FILTROS_CONTACTOS);
      expect(guardado).toBeDefined();
      expect(JSON.parse(guardado!)).toEqual({
        busqueda: 'Laura',
        etiquetaFiltro: 'VIP',
        consentimientoFiltro: 'PROMOCIONAL',
      });
    });

    it('limpia filtros removiendo la clave de localStorage', () => {
      guardarFiltrosEnAlmacenamiento(CLAVE_FILTROS_PIPELINE, {
        filtroTexto: 'San Andrés',
        filtroAsesor: 'Laura Gómez',
        vista: 'tabla',
      });
      expect(localStorage.getItem(CLAVE_FILTROS_PIPELINE)).not.toBeNull();

      limpiarFiltrosEnAlmacenamiento(CLAVE_FILTROS_PIPELINE);
      expect(localStorage.getItem(CLAVE_FILTROS_PIPELINE)).toBeNull();
    });
  });

  describe('hayFiltrosActivos', () => {
    it('detecta cuando los filtros son idénticos a los de por defecto', () => {
      expect(hayFiltrosActivos(FILTROS_BANDEJA_DEFECTO, FILTROS_BANDEJA_DEFECTO)).toBe(false);
      expect(hayFiltrosActivos(FILTROS_CONTACTOS_DEFECTO, FILTROS_CONTACTOS_DEFECTO)).toBe(false);
      expect(hayFiltrosActivos(FILTROS_PIPELINE_DEFECTO, FILTROS_PIPELINE_DEFECTO)).toBe(false);
    });

    it('detecta cuando hay al menos un filtro activo distinto', () => {
      expect(
        hayFiltrosActivos(
          { ...FILTROS_BANDEJA_DEFECTO, filtro: 'SIN_LEER' },
          FILTROS_BANDEJA_DEFECTO,
        ),
      ).toBe(true);

      expect(
        hayFiltrosActivos(
          { ...FILTROS_CONTACTOS_DEFECTO, busqueda: 'Carlos' },
          FILTROS_CONTACTOS_DEFECTO,
        ),
      ).toBe(true);

      expect(
        hayFiltrosActivos(
          { ...FILTROS_PIPELINE_DEFECTO, filtroAsesor: 'Carlos Asesor' },
          FILTROS_PIPELINE_DEFECTO,
        ),
      ).toBe(true);
    });

    it('respeta campos ignorados para determinar si hay filtros activos', () => {
      // Si la vista ('kanban' vs 'tabla') se ignora, no se considera un filtro activo de datos
      const filtrosConVistaTabla = { ...FILTROS_PIPELINE_DEFECTO, vista: 'tabla' as const };
      expect(hayFiltrosActivos(filtrosConVistaTabla, FILTROS_PIPELINE_DEFECTO, ['vista'])).toBe(
        false,
      );
    });
  });
});
