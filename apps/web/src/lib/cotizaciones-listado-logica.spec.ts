import { describe, expect, it } from 'vitest';
import {
  extraerResumenVisualCotizacion,
  filtrarCotizaciones,
  ordenarCotizaciones,
  paginarItems,
  generarCotizacionesSimuladasLote,
} from './cotizaciones-listado-logica';
import { MOCK_COTIZACIONES_INICIALES } from './mock-cotizaciones';

describe('Lógica de Listado de Cotizaciones (0c.24)', () => {
  describe('extraerResumenVisualCotizacion', () => {
    it('extrae el resumen de la última versión con total de venta y sin exponer netos ni margen', () => {
      const demo = MOCK_COTIZACIONES_INICIALES[0]!;
      const resumen = extraerResumenVisualCotizacion(demo, 'Juan Pérez');

      expect(resumen.id).toBe(demo.id);
      expect(resumen.versionNumero).toBe(2);
      expect(resumen.totalVersiones).toBe(2);
      expect(resumen.contactoNombre).toBe('Juan Pérez');
      expect(resumen.totalUnidades).toBe('6550000');
      expect(resumen.moneda).toBe('COP');
      expect(resumen.pasajerosTotal).toBe(3); // 2 adultos + 1 niño en v2
      // Garantía R10: las propiedades extraídas no contienen costo neto ni porcentaje de margen
      expect(resumen).not.toHaveProperty('neto');
      expect(resumen).not.toHaveProperty('margen');
      expect(resumen).not.toHaveProperty('politica');
    });
  });

  describe('filtrarCotizaciones', () => {
    it('devuelve todas las cotizaciones si el término de búsqueda está vacío', () => {
      const filtradas = filtrarCotizaciones(MOCK_COTIZACIONES_INICIALES, '   ');
      expect(filtradas).toHaveLength(MOCK_COTIZACIONES_INICIALES.length);
    });

    it('filtra por título de la cotización', () => {
      const filtradas = filtrarCotizaciones(MOCK_COTIZACIONES_INICIALES, 'San Andrés');
      expect(filtradas.length).toBeGreaterThan(0);
      expect(filtradas[0]?.titulo).toContain('San Andrés');
    });

    it('filtra por nombre de contacto usando el mapa', () => {
      const mapa = { '00000000-0002-4000-8000-000000000001': 'Juan Pérez' };
      const filtradas = filtrarCotizaciones(MOCK_COTIZACIONES_INICIALES, 'Pérez', mapa);
      expect(filtradas.length).toBeGreaterThan(0);
    });

    it('devuelve vacío cuando ninguna cotización coincide', () => {
      const filtradas = filtrarCotizaciones(
        MOCK_COTIZACIONES_INICIALES,
        'Tombuctú Inexistente 9999',
      );
      expect(filtradas).toHaveLength(0);
    });
  });

  describe('ordenarCotizaciones', () => {
    it('ordena por fecha descendente y ascendente', () => {
      const lote = generarCotizacionesSimuladasLote(5);
      const desc = ordenarCotizaciones(lote, 'fecha_desc');
      const asc = ordenarCotizaciones(lote, 'fecha_asc');

      const tiempoDesc0 = new Date(desc[0]!.actualizadaEn).getTime();
      const tiempoDesc1 = new Date(desc[1]!.actualizadaEn).getTime();
      expect(tiempoDesc0).toBeGreaterThanOrEqual(tiempoDesc1);

      const tiempoAsc0 = new Date(asc[0]!.actualizadaEn).getTime();
      const tiempoAsc1 = new Date(asc[1]!.actualizadaEn).getTime();
      expect(tiempoAsc0).toBeLessThanOrEqual(tiempoAsc1);
    });

    it('ordena por total de venta', () => {
      const lote = generarCotizacionesSimuladasLote(10);
      const ordenadasDesc = ordenarCotizaciones(lote, 'total_desc');
      const total0 = BigInt(ordenadasDesc[0]!.versiones[0]!.venta.unidades);
      const totalUltimo = BigInt(
        ordenadasDesc[ordenadasDesc.length - 1]!.versiones[0]!.venta.unidades,
      );
      expect(total0).toBeGreaterThanOrEqual(totalUltimo);
    });
  });

  describe('paginarItems', () => {
    it('divide correctamente 500 cotizaciones en páginas de tamaño 10', () => {
      const lote500 = generarCotizacionesSimuladasLote(500);
      const pagina1 = paginarItems(lote500, 1, 10);

      expect(pagina1.totalItems).toBe(500);
      expect(pagina1.totalPaginas).toBe(50);
      expect(pagina1.paginaActual).toBe(1);
      expect(pagina1.items).toHaveLength(10);
      expect(pagina1.items[0]?.id).toBe(lote500[0]?.id);

      const paginaUltima = paginarItems(lote500, 50, 10);
      expect(paginaUltima.paginaActual).toBe(50);
      expect(paginaUltima.items).toHaveLength(10);
      expect(paginaUltima.items[9]?.id).toBe(lote500[499]?.id);
    });

    it('corrige páginas fuera de rango inferior o superior', () => {
      const lote = generarCotizacionesSimuladasLote(25);
      const bajo = paginarItems(lote, -5, 10);
      expect(bajo.paginaActual).toBe(1);

      const alto = paginarItems(lote, 999, 10);
      expect(alto.paginaActual).toBe(3);
    });
  });

  describe('generarCotizacionesSimuladasLote', () => {
    it('genera 500 cotizaciones válidas con nombres largos sin errores', () => {
      const lote = generarCotizacionesSimuladasLote(500);
      expect(lote).toHaveLength(500);
      for (const cot of lote.slice(0, 5)) {
        expect(cot.versiones).toHaveLength(1);
        expect(cot.versiones[0]?.venta.moneda).toBe('COP');
        expect(cot.titulo.length).toBeGreaterThan(25); // Nombres largos
      }
    });
  });
});
