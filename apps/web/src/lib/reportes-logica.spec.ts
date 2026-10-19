import { describe, expect, it } from 'vitest';
import {
  calcularMargenReporte,
  calcularTasaConversion,
  calcularVariacionPorcentual,
  filtrarMetricasPorRol,
  obtenerReportePorPeriodo,
} from './reportes-logica';

describe('Pruebas del Módulo de Reportes, Métricas y Cierres (Screen 4)', () => {
  it('1. calcularTasaConversion calcula el porcentaje de éxito y es seguro ante cero', () => {
    // 18 ganadas y 6 perdidas = 18 / 24 = 75.0%
    expect(calcularTasaConversion(18, 6)).toBe(75.0);

    // 0 ganadas y 0 perdidas no lanza excepción ni NaN
    expect(calcularTasaConversion(0, 0)).toBe(0);

    // Solo ganadas
    expect(calcularTasaConversion(5, 0)).toBe(100.0);
  });

  it('2. calcularVariacionPorcentual calcula deltas positivos y negativos con 1 decimal', () => {
    // De 42.2M a 48.95M
    const delta = calcularVariacionPorcentual(48950000, 42200000);
    expect(delta).toBe(16.0);

    // Caída
    const deltaNegativo = calcularVariacionPorcentual(80, 100);
    expect(deltaNegativo).toBe(-20.0);

    // Base cero
    expect(calcularVariacionPorcentual(50, 0)).toBe(100.0);
    expect(calcularVariacionPorcentual(0, 0)).toBe(0);
  });

  it('3. calcularMargenReporte calcula margen y porcentaje usando BigInt sin redondeos engañosos (R8)', () => {
    const venta = { unidades: '50000000', moneda: 'COP' as const };
    const neto = { unidades: '40000000', moneda: 'COP' as const };

    const resultado = calcularMargenReporte(venta, neto);
    expect(resultado.margen.unidades).toBe('10000000');
    expect(resultado.margen.moneda).toBe('COP');
    expect(resultado.porcentaje).toBe(20.0);
  });

  it('4. filtrarMetricasPorRol oculta márgenes a la vista de asesor y los mantiene para el dueño', () => {
    const reporteBase = obtenerReportePorPeriodo('ultimos_30_dias', 'DUENO');
    expect(Number(reporteBase.margenTotal.unidades)).toBeGreaterThan(0);
    expect(reporteBase.margenPorcentaje).toBeGreaterThan(0);

    const reporteAsesor = filtrarMetricasPorRol(reporteBase, 'ASESOR');
    expect(reporteAsesor.margenTotal.unidades).toBe('0');
    expect(reporteAsesor.costoNetoTotal.unidades).toBe('0');
    expect(reporteAsesor.margenPorcentaje).toBe(0);
    // Pero mantiene métricas operativas
    expect(reporteAsesor.oportunidadesCreadas).toBe(reporteBase.oportunidadesCreadas);
    expect(reporteAsesor.tasaConversion).toBe(reporteBase.tasaConversion);
    expect(reporteAsesor.tiempoRespuestaPromedioMinutos).toBe(
      reporteBase.tiempoRespuestaPromedioMinutos,
    );
  });

  it('5. obtenerReportePorPeriodo entrega datos consistentes para todos los períodos requeridos', () => {
    const periodos = ['ultimos_30_dias', 'este_mes', 'trimestre', 'ano'] as const;

    for (const p of periodos) {
      const rep = obtenerReportePorPeriodo(p);
      expect(rep.periodo).toBe(p);
      expect(rep.ventasPorDestino.length).toBeGreaterThanOrEqual(4);
      expect(rep.conversionPorEtapa.length).toBe(4);
      expect(rep.rendimientoAsesores.length).toBe(2);
      expect(rep.tiempoRespuestaPromedioMinutos).toBeGreaterThan(0);
    }
  });
});
