import { describe, expect, it } from 'vitest';
import type { ResumenDeReportes } from '@viajapro/contracts';
import * as logica from './reportes-logica';
import {
  calcularMargenReporte,
  calcularTasaConversion,
  calcularVariacionPorcentual,
  convertirPeriodoAInstantesUtc,
  formatearMinutosReporte,
  formatearPorcentajeReporte,
  obtenerEtiquetaPeriodo,
  TEXTO_SIN_DATOS,
  transformarResumenReporte,
} from './reportes-logica';

describe('reportes-logica (T-142)', () => {
  it('1b. la zona de la agencia cambia los instantes UTC de los limites de este_mes', () => {
    const ahora = new Date('2026-11-04T15:00:00.000Z');
    expect(convertirPeriodoAInstantesUtc('este_mes', ahora, 'America/Bogota').desde).toBe(
      '2026-11-01T05:00:00.000Z',
    );
    expect(convertirPeriodoAInstantesUtc('este_mes', ahora, 'America/Mexico_City').desde).toBe(
      '2026-11-01T06:00:00.000Z',
    );
    expect(convertirPeriodoAInstantesUtc('este_mes', ahora, 'Europe/Madrid').desde).toBe(
      '2026-10-31T23:00:00.000Z',
    );
  });

  it('1. convertirPeriodoAInstantesUtc convierte periodos a instantes UTC con zona horaria de la agencia', () => {
    // 2026-11-04 10:00:00 en Bogotá (UTC-5) -> 2026-11-04T15:00:00.000Z
    const ahora = new Date('2026-11-04T15:00:00.000Z');

    const esteMes = convertirPeriodoAInstantesUtc('este_mes', ahora);
    // Inicio del mes en Bogotá: 2026-11-01 00:00:00 Bogotá -> 2026-11-01T05:00:00.000Z
    expect(esteMes.desde).toBe('2026-11-01T05:00:00.000Z');
    expect(Date.parse(esteMes.hasta)).toBeGreaterThan(Date.parse(esteMes.desde));

    const ultimos30 = convertirPeriodoAInstantesUtc('ultimos_30_dias', ahora);
    expect(Date.parse(ultimos30.hasta)).toBeGreaterThan(Date.parse(ultimos30.desde));

    const trimestre = convertirPeriodoAInstantesUtc('trimestre', ahora);
    expect(Date.parse(trimestre.hasta)).toBeGreaterThan(Date.parse(trimestre.desde));

    const ano = convertirPeriodoAInstantesUtc('ano', ahora);
    // Inicio de año 2026 en Bogotá -> 2026-01-01T05:00:00.000Z
    expect(ano.desde).toBe('2026-01-01T05:00:00.000Z');
  });

  it('2. etiquetas de periodos en español', () => {
    expect(obtenerEtiquetaPeriodo('ultimos_30_dias')).toBe('Últimos 30 días');
    expect(obtenerEtiquetaPeriodo('este_mes')).toBe('Este mes');
    expect(obtenerEtiquetaPeriodo('trimestre')).toBe('Últimos 90 días');
    expect(obtenerEtiquetaPeriodo('ano')).toBe('Este año');
  });

  it('3. calcularTasaConversion calcula porcentaje sobre cerradas y entrega null si no hay cerradas', () => {
    // 18 ganadas y 6 perdidas = 18 / 24 = 75.0%
    expect(calcularTasaConversion(18, 6)).toBe(75.0);

    // 0 ganadas y 0 perdidas: null (no inventa 0%)
    expect(calcularTasaConversion(0, 0)).toBeNull();

    // Solo ganadas
    expect(calcularTasaConversion(5, 0)).toBe(100.0);
  });

  it('4. calcularVariacionPorcentual calcula deltas con 1 decimal y entrega null si base <= 0', () => {
    // De 42.2M a 48.95M
    const delta = calcularVariacionPorcentual(48950000, 42200000);
    expect(delta).toBe(16.0);

    // Caída
    const deltaNegativo = calcularVariacionPorcentual(80, 100);
    expect(deltaNegativo).toBe(-20.0);

    // Base cero: null (no inventa +100%)
    expect(calcularVariacionPorcentual(50, 0)).toBeNull();
    expect(calcularVariacionPorcentual(0, 0)).toBeNull();
  });

  it('5. calcularMargenReporte calcula margen y porcentaje usando BigInt (R8)', () => {
    const venta = { unidades: '50000000', moneda: 'COP' as const };
    const neto = { unidades: '40000000', moneda: 'COP' as const };

    const resultado = calcularMargenReporte(venta, neto);
    expect(resultado.margen.unidades).toBe('10000000');
    expect(resultado.margen.moneda).toBe('COP');
    expect(resultado.porcentaje).toBe(20.0);
  });

  it('6. formatearPorcentajeReporte y formatearMinutosReporte entregan «Aún sin datos» ante null/undefined', () => {
    expect(formatearPorcentajeReporte(null)).toBe(TEXTO_SIN_DATOS);
    expect(formatearPorcentajeReporte(undefined)).toBe(TEXTO_SIN_DATOS);
    expect(formatearPorcentajeReporte(25.4)).toContain('25,4');

    expect(formatearMinutosReporte(null)).toBe(TEXTO_SIN_DATOS);
    expect(formatearMinutosReporte(undefined)).toBe(TEXTO_SIN_DATOS);
    expect(formatearMinutosReporte(12.3)).toContain('12,3 min');
  });

  it('7. transformarResumenReporte maneja múltiples monedas sin sumarlas ni asumir COP', () => {
    const mockResumen: ResumenDeReportes = {
      periodo: { desde: '2026-10-01T05:00:00.000Z', hasta: '2026-11-01T05:00:00.000Z' },
      cotizaciones: { creadas: 4, enviadas: 3, aceptadas: 1, tasaAceptacion: 33.3 },
      ventasPorMoneda: [
        {
          moneda: 'COP',
          cotizacionesAceptadas: 1,
          ventas: { unidades: '9100000', moneda: 'COP' },
        },
        {
          moneda: 'USD',
          cotizacionesAceptadas: 2,
          ventas: { unidades: '250000', moneda: 'USD' },
        },
      ],
      oportunidades: {
        creadas: 5,
        ganadas: 1,
        perdidas: 1,
        abiertas: 3,
        tasaConversion: 50.0,
        porEtapa: [
          {
            etapaId: '01932000-0000-7000-8000-0000000000e1',
            nombre: 'Nuevo',
            orden: 1,
            esGanada: false,
            esPerdida: false,
            cantidad: 3,
          },
        ],
      },
      respuesta: {
        conversacionesNuevas: 10,
        conversacionesRespondidas: 8,
        promedioMinutos: 15.5,
        medianaMinutos: 9.0,
      },
    };

    const vista = transformarResumenReporte(mockResumen);

    expect(vista.filasVentas).toHaveLength(2);
    expect(vista.filasVentas[0]?.moneda).toBe('COP');
    expect(vista.filasVentas[0]?.ventas.unidades).toBe('9100000');
    expect(vista.filasVentas[1]?.moneda).toBe('USD');
    expect(vista.filasVentas[1]?.ventas.unidades).toBe('250000');

    // Cohortes explícitas
    expect(vista.cotizaciones.cohorteTexto).toBe(
      '1 aceptada de 3 enviadas en el periodo (4 creadas)',
    );
    expect(vista.oportunidades.cohorteTexto).toBe(
      '5 creadas en el periodo (1 ganadas · 1 perdidas · 3 abiertas)',
    );
    expect(vista.respuesta.cohorteTexto).toBe(
      '8 de 10 conversaciones nuevas respondidas en el periodo',
    );

    // Mediana como valor protagonista
    expect(vista.respuesta.medianaTexto).toContain('9 min');
    expect(vista.respuesta.promedioTexto).toContain('15,5 min');

    // Sin datos confidenciales en la respuesta
    expect(vista.hayConfidencial).toBe(false);
    expect(vista.filasVentas[0]?.confidencial).toBeUndefined();
  });

  it('8. transformarResumenReporte preserva confidencial si el servidor lo entrega', () => {
    const mockResumen: ResumenDeReportes = {
      periodo: { desde: '2026-10-01T05:00:00.000Z', hasta: '2026-11-01T05:00:00.000Z' },
      cotizaciones: { creadas: 1, enviadas: 1, aceptadas: 1, tasaAceptacion: 100 },
      ventasPorMoneda: [
        {
          moneda: 'COP',
          cotizacionesAceptadas: 1,
          ventas: { unidades: '10000000', moneda: 'COP' },
          neto: { unidades: '8000000', moneda: 'COP' },
          margen: { unidades: '2000000', moneda: 'COP' },
          margenPorcentaje: 20.0,
          cotizacionesSinNeto: 0,
        },
      ],
      oportunidades: {
        creadas: 0,
        ganadas: 0,
        perdidas: 0,
        abiertas: 0,
        tasaConversion: null,
        porEtapa: [],
      },
      respuesta: {
        conversacionesNuevas: 0,
        conversacionesRespondidas: 0,
        promedioMinutos: null,
        medianaMinutos: null,
      },
    };

    const vista = transformarResumenReporte(mockResumen);
    expect(vista.hayConfidencial).toBe(true);
    expect(vista.filasVentas[0]?.confidencial).toBeDefined();
    expect(vista.filasVentas[0]?.confidencial?.neto?.unidades).toBe('8000000');
    expect(vista.filasVentas[0]?.confidencial?.margen?.unidades).toBe('2000000');
    expect(vista.filasVentas[0]?.confidencial?.margenPorcentaje).toBe(20.0);
  });

  it('9. calcularReporteDesdePipeline y obtenerReportePorPeriodo fueron eliminados', () => {
    expect((logica as Record<string, unknown>).calcularReporteDesdePipeline).toBeUndefined();
    expect((logica as Record<string, unknown>).obtenerReportePorPeriodo).toBeUndefined();
  });
});
