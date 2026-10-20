import { describe, expect, it } from 'vitest';
import {
  extraerResumenVisualCotizacion,
  filtrarFilasCotizacion,
  paginarPorCursor,
  generarCotizacionesSimuladasLote,
  cotizacionGuardadaAFila,
} from './cotizaciones-listado-logica';
import { MOCK_COTIZACIONES_INICIALES } from './mock-cotizaciones';

describe('Lógica de Listado de Cotizaciones con Contratos Reales (0c.28 & 0c.24)', () => {
  describe('cotizacionGuardadaAFila y extraerResumenVisualCotizacion', () => {
    it('convierte CotizacionGuardada a FilaDeCotizacion y extrae resumen sin netos ni margen', () => {
      const demo = MOCK_COTIZACIONES_INICIALES[0]!;
      const fila = cotizacionGuardadaAFila(demo);

      expect(fila.id).toBe(demo.id);
      expect(fila.numeroDeVersiones).toBe(2);
      expect(fila.venta.unidades).toBe('6550000');
      expect(fila.venta.moneda).toBe('COP');

      const resumen = extraerResumenVisualCotizacion(fila, 'Juan Pérez');

      expect(resumen.id).toBe(demo.id);
      expect(resumen.numeroDeVersiones).toBe(2);
      expect(resumen.contactoNombre).toBe('Juan Pérez');
      expect(resumen.totalUnidades).toBe('6550000');
      expect(resumen.moneda).toBe('COP');
      expect(resumen.estado).toBe('ENVIADA');

      // Garantía R10: las propiedades del resumen no contienen costo neto ni porcentaje de margen
      expect(resumen).not.toHaveProperty('neto');
      expect(resumen).not.toHaveProperty('margen');
      expect(resumen).not.toHaveProperty('politica');
      expect(fila).not.toHaveProperty('politica');
    });
  });

  describe('filtrarFilasCotizacion', () => {
    it('devuelve todas las filas si el término de búsqueda está vacío', () => {
      const lote = generarCotizacionesSimuladasLote(10);
      const filtradas = filtrarFilasCotizacion(lote, '   ');
      expect(filtradas).toHaveLength(10);
    });

    it('filtra por título de la cotización', () => {
      const lote = generarCotizacionesSimuladasLote(20);
      const primera = lote[0]!;
      const palabraClave = primera.titulo.split(' ')[1] || 'Cotización';
      const filtradas = filtrarFilasCotizacion(lote, palabraClave);
      expect(filtradas.length).toBeGreaterThan(0);
      expect(filtradas[0]?.titulo).toContain(palabraClave);
    });

    it('filtra por nombre de contacto usando el mapa', () => {
      const lote = generarCotizacionesSimuladasLote(5);
      const targetContactoId = lote[0]!.contactoId;
      const mapa = { [targetContactoId]: 'Cliente Especial VIP' };

      const filtradas = filtrarFilasCotizacion(lote, 'VIP', mapa);
      expect(filtradas.length).toBeGreaterThan(0);
      expect(filtradas[0]?.contactoId).toBe(targetContactoId);
    });

    it('devuelve vacío cuando ninguna fila coincide', () => {
      const lote = generarCotizacionesSimuladasLote(5);
      const filtradas = filtrarFilasCotizacion(lote, 'Tombuctú Inexistente 9999');
      expect(filtradas).toHaveLength(0);
    });
  });

  describe('paginarPorCursor', () => {
    it('pagina correctamente por cursor según PaginaDeCotizaciones', () => {
      const lote = generarCotizacionesSimuladasLote(50);
      const pagina1 = paginarPorCursor(lote, undefined, 15);

      expect(pagina1.datos).toHaveLength(15);
      expect(pagina1.pageInfo.hasMore).toBe(true);
      expect(pagina1.pageInfo.nextCursor).toBe(lote[14]?.id);

      // Siguiente página usando el cursor
      const pagina2 = paginarPorCursor(lote, pagina1.pageInfo.nextCursor!, 15);
      expect(pagina2.datos).toHaveLength(15);
      expect(pagina2.datos[0]?.id).toBe(lote[15]?.id);
      expect(pagina2.pageInfo.hasMore).toBe(true);
      expect(pagina2.pageInfo.nextCursor).toBe(lote[29]?.id);
    });

    it('marca hasMore false y nextCursor null en la última página', () => {
      const lote = generarCotizacionesSimuladasLote(10);
      const pagina = paginarPorCursor(lote, undefined, 20);

      expect(pagina.datos).toHaveLength(10);
      expect(pagina.pageInfo.hasMore).toBe(false);
      expect(pagina.pageInfo.nextCursor).toBeNull();
    });

    it('maneja cursor no encontrado comenzando desde el inicio', () => {
      const lote = generarCotizacionesSimuladasLote(10);
      const pagina = paginarPorCursor(lote, 'cursor-inexistente-123', 5);

      expect(pagina.datos).toHaveLength(5);
      expect(pagina.datos[0]?.id).toBe(lote[0]?.id);
    });
  });

  describe('generarCotizacionesSimuladasLote', () => {
    it('genera 500 filas de cotización válidas con nombres largos conformes a FilaDeCotizacion', () => {
      const lote = generarCotizacionesSimuladasLote(500);
      expect(lote).toHaveLength(500);
      for (const cot of lote.slice(0, 5)) {
        expect(cot.venta.moneda).toBe('COP');
        expect(cot.titulo.length).toBeGreaterThan(25);
        expect(cot.numeroDeVersiones).toBeGreaterThanOrEqual(1);
        expect(cot.estado).toBeDefined();
      }
    });
  });
});
