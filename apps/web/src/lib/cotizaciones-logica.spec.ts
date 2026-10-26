import { describe, expect, it } from 'vitest';
import type { VersionDeCotizacion } from '@viajapro/contracts';
import {
  armarComposicionDeVersion,
  armarCuerpoAnadirVersion,
  armarCuerpoGuardarCotizacion,
  interpretarErrorCotizaciones,
  obtenerUltimaVersion,
  ordenarVersiones,
  sugerirTituloCotizacion,
} from './cotizaciones-logica';

describe('cotizaciones-logica (0c.22)', () => {
  const PAQUETE_ID = '01932000-0000-7000-8000-000000000001';
  const CONTACTO_ID = '00000000-0002-4000-8000-000000000001';
  const OPORTUNIDAD_ID = '01932000-0000-7000-8000-000000000099';

  describe('armarComposicionDeVersion', () => {
    it('filtra estrictamente cualquier campo monetario o extraño (invariante R3)', () => {
      const entradaSucia = {
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-03',
        adultos: 2,
        ninos: 1,
        infantes: 0,
        acomodacion: 'DOBLE' as const,
        // Campos que jamás deben filtrarse a la API
        totalVenta: 5000000,
        precioUnitario: 2500000,
        neto: 4000000,
        margen: 1000000,
      };

      const composicion = armarComposicionDeVersion(entradaSucia);

      expect(composicion).toEqual({
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-03',
        adultos: 2,
        ninos: 1,
        infantes: 0,
        acomodacion: 'DOBLE',
      });
      // Verificamos que no contiene ninguna clave de importe
      expect('totalVenta' in composicion).toBe(false);
      expect('precioUnitario' in composicion).toBe(false);
      expect('neto' in composicion).toBe(false);
      expect('margen' in composicion).toBe(false);
    });

    it('incluye vigenteHasta si viene especificada', () => {
      const composicion = armarComposicionDeVersion({
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-03',
        adultos: 2,
        vigenteHasta: '2026-10-20',
      });

      expect(composicion.vigenteHasta).toBe('2026-10-20');
    });
  });

  describe('armarCuerpoGuardarCotizacion', () => {
    it('construye GuardarCotizacion válido con versión 1 estricta', () => {
      const cuerpo = armarCuerpoGuardarCotizacion({
        contactoId: CONTACTO_ID,
        oportunidadId: OPORTUNIDAD_ID,
        titulo: 'Cotización San Andrés para Juan Pérez',
        composicion: {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-03',
          adultos: 2,
        },
      });

      expect(cuerpo).toEqual({
        contactoId: CONTACTO_ID,
        oportunidadId: OPORTUNIDAD_ID,
        titulo: 'Cotización San Andrés para Juan Pérez',
        version: {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-03',
          adultos: 2,
        },
      });
    });

    it('omite oportunidadId si viene vacía o indefinida', () => {
      const cuerpo = armarCuerpoGuardarCotizacion({
        contactoId: CONTACTO_ID,
        oportunidadId: '',
        titulo: 'Cotización Sin Oportunidad',
        composicion: {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-03',
          adultos: 2,
        },
      });

      expect(cuerpo.oportunidadId).toBeUndefined();
    });
  });

  describe('armarCuerpoAnadirVersion', () => {
    it('construye AnadirVersionACotizacion sin importes', () => {
      const cuerpo = armarCuerpoAnadirVersion({
        paqueteId: PAQUETE_ID,
        fecha: '2026-11-15',
        adultos: 4,
        ninos: 2,
        acomodacion: 'TRIPLE',
        // intento de pasar importe
        venta: 12000000,
      });

      expect(cuerpo).toEqual({
        paqueteId: PAQUETE_ID,
        fecha: '2026-11-15',
        adultos: 4,
        ninos: 2,
        acomodacion: 'TRIPLE',
      });
      expect('venta' in cuerpo).toBe(false);
    });
  });

  describe('ordenarVersiones y obtenerUltimaVersion', () => {
    const version1 = {
      id: '01932000-0000-7000-8000-000000000011',
      numero: 1,
      creadaEn: '2026-10-19T10:00:00.000Z',
    } as unknown as VersionDeCotizacion;

    const version2 = {
      id: '01932000-0000-7000-8000-000000000012',
      numero: 2,
      creadaEn: '2026-10-19T11:00:00.000Z',
    } as unknown as VersionDeCotizacion;

    const version3 = {
      id: '01932000-0000-7000-8000-000000000013',
      numero: 3,
      creadaEn: '2026-10-19T12:00:00.000Z',
    } as unknown as VersionDeCotizacion;

    it('ordena ascendentemente (1, 2, 3)', () => {
      const ordenadas = ordenarVersiones([version2, version3, version1], 'asc');
      expect(ordenadas.map((v) => v.numero)).toEqual([1, 2, 3]);
    });

    it('ordena descendentemente (3, 2, 1)', () => {
      const ordenadas = ordenarVersiones([version2, version1, version3], 'desc');
      expect(ordenadas.map((v) => v.numero)).toEqual([3, 2, 1]);
    });

    it('obtiene la versión más reciente', () => {
      const ultima = obtenerUltimaVersion([version2, version1, version3]);
      expect(ultima?.numero).toBe(3);
    });

    it('devuelve undefined si la lista está vacía', () => {
      expect(obtenerUltimaVersion([])).toBeUndefined();
    });
  });

  describe('sugerirTituloCotizacion', () => {
    it('genera un título limpio eliminando guiones de descripción', () => {
      const titulo = sugerirTituloCotizacion(
        'San Andrés — 4 días / 3 noches, todo incluido',
        '2026-10-03',
      );
      expect(titulo).toBe('Cotización San Andrés (2026-10-03)');
    });
  });

  describe('interpretarErrorCotizaciones', () => {
    it('traduce 404 de cotización no encontrada honestamente', () => {
      const err = interpretarErrorCotizaciones({ code: 'COTIZACION_NO_ENCONTRADA' });
      expect(err.codigo).toBe('COTIZACION_NO_ENCONTRADA');
      expect(err.mensaje).toContain('no existe');
      expect(err.esErrorAgencia).toBe(false);
    });

    it('traduce falta de tenant en desarrollo', () => {
      const err = interpretarErrorCotizaciones({ code: 'SIN_SESION' });
      expect(err.esErrorAgencia).toBe(true);
      expect(err.mensaje).toContain('identificar la agencia activa');
    });

    it('maneja fallos desconocidos sin crashear', () => {
      const err = interpretarErrorCotizaciones(new Error('Fallo de red'));
      expect(err.codigo).toBe('DESCONOCIDO');
      expect(err.mensaje).toBe('Fallo de red');
    });
  });
});
