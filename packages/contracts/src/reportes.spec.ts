import { describe, expect, it } from 'vitest';
import { ConsultarResumenDeReportes, ResumenDeReportes } from './reportes.js';

const base = { desde: '2026-10-01T05:00:00.000Z', hasta: '2026-11-01T05:00:00.000Z' };

describe('ConsultarResumenDeReportes', () => {
  it('acepta un rango válido', () => {
    expect(ConsultarResumenDeReportes.safeParse(base).success).toBe(true);
  });

  it('rechaza un rango invertido o vacío', () => {
    expect(
      ConsultarResumenDeReportes.safeParse({ desde: base.hasta, hasta: base.desde }).success,
    ).toBe(false);
    expect(
      ConsultarResumenDeReportes.safeParse({ desde: base.desde, hasta: base.desde }).success,
    ).toBe(false);
  });

  it('rechaza más de 366 días', () => {
    const r = ConsultarResumenDeReportes.safeParse({
      desde: '2025-01-01T00:00:00.000Z',
      hasta: '2026-06-01T00:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza fechas sin hora y claves ajenas (nunca un tenantId del cliente)', () => {
    expect(
      ConsultarResumenDeReportes.safeParse({ desde: '2026-10-01', hasta: '2026-11-01' }).success,
    ).toBe(false);
    expect(
      ConsultarResumenDeReportes.safeParse({
        ...base,
        tenantId: '01932000-0000-7000-8000-000000000001',
      }).success,
    ).toBe(false);
  });
});

describe('ResumenDeReportes', () => {
  const sinMargen = {
    periodo: base,
    cotizaciones: { creadas: 1, enviadas: 1, aceptadas: 1, tasaAceptacion: 100 },
    ventasPorMoneda: [
      { moneda: 'COP', cotizacionesAceptadas: 1, ventas: { unidades: '1200000', moneda: 'COP' } },
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

  it('una fila de ventas sin las claves de margen es válida', () => {
    expect(ResumenDeReportes.safeParse(sinMargen).success).toBe(true);
  });

  it('una fila con margen conserva sus claves tras el parseo', () => {
    const fila = {
      ...sinMargen.ventasPorMoneda[0],
      neto: { unidades: '1000000', moneda: 'COP' },
      margen: { unidades: '200000', moneda: 'COP' },
      margenPorcentaje: 16.7,
      cotizacionesSinNeto: 0,
    };
    const r = ResumenDeReportes.parse({ ...sinMargen, ventasPorMoneda: [fila] });
    expect(r.ventasPorMoneda[0]?.margen?.unidades).toBe('200000');
  });
});
