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
    alcance: 'AGENCIA' as const,
    asesorId: null,
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

  it('una respuesta sin `alcance` ya no es válida: la vista la decide la respuesta (T-513)', () => {
    const { alcance: _a, asesorId: _i, ...sinAlcance } = sinMargen;
    expect(ResumenDeReportes.safeParse(sinAlcance).success).toBe(false);
  });

  describe('porAsesor y ventasPorDestino (T-531, T-532): solo de agencia', () => {
    const idUno = '01932000-0000-7000-8000-00000000aaaa';
    const fila = {
      asesorId: idUno,
      cotizaciones: { creadas: 1, enviadas: 1, aceptadas: 1, tasaAceptacion: 100 },
      ventasPorMoneda: sinMargen.ventasPorMoneda,
      oportunidades: { creadas: 0, ganadas: 0, perdidas: 0, abiertas: 0, tasaConversion: null },
      respuesta: sinMargen.respuesta,
    };
    const destino = { destino: 'Cartagena', ...sinMargen.ventasPorMoneda[0] };

    it('la respuesta de agencia las admite y las conserva', () => {
      const r = ResumenDeReportes.parse({
        ...sinMargen,
        porAsesor: [fila],
        ventasPorDestino: [destino],
      });
      if (r.alcance !== 'AGENCIA') throw new Error('debía ser de agencia');
      expect(r.porAsesor?.[0]?.asesorId).toBe(idUno);
      expect(r.ventasPorDestino?.[0]?.destino).toBe('Cartagena');
    });

    it('una API anterior, sin ninguna de las dos, sigue siendo válida', () => {
      expect(ResumenDeReportes.safeParse(sinMargen).success).toBe(true);
    });

    it('la respuesta PROPIA las rechaza: no se recortan en silencio (§9.3)', () => {
      const propio = { ...sinMargen, alcance: 'PROPIO' as const, asesorId: idUno };
      expect(ResumenDeReportes.safeParse(propio).success).toBe(true);
      expect(ResumenDeReportes.safeParse({ ...propio, porAsesor: [fila] }).success).toBe(false);
      expect(ResumenDeReportes.safeParse({ ...propio, ventasPorDestino: [destino] }).success).toBe(
        false,
      );
    });

    it('la fila de un asesor es estricta: una clave de más (p. ej. un margen suelto) falla', () => {
      expect(
        ResumenDeReportes.safeParse({ ...sinMargen, porAsesor: [{ ...fila, margen: 1 }] }).success,
      ).toBe(false);
    });

    it('una fila de destino exige destino y la forma de una venta por moneda', () => {
      const { destino: _d, ...sinDestino } = destino;
      expect(
        ResumenDeReportes.safeParse({ ...sinMargen, ventasPorDestino: [sinDestino] }).success,
      ).toBe(false);
      expect(
        ResumenDeReportes.safeParse({
          ...sinMargen,
          ventasPorDestino: [{ ...destino, ventas: { unidades: 12.5, moneda: 'COP' } }],
        }).success,
      ).toBe(false);
    });
  });
});
