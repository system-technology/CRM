import { describe, expect, it } from 'vitest';
import type { ResumenDeReportes } from '@viajapro/contracts';
import {
  formatearTasaConN,
  N_MINIMO_TASA,
  TEXTO_SIN_DATOS,
  transformarResumenReporte,
} from './reportes-logica';

const base = { desde: '2026-10-01T05:00:00.000Z', hasta: '2026-11-01T05:00:00.000Z' };

function resumen(p: {
  enviadas: number;
  aceptadas: number;
  ganadas: number;
  perdidas: number;
  sinNeto?: number;
}): ResumenDeReportes {
  return {
    alcance: 'AGENCIA' as const,
    asesorId: null,
    periodo: base,
    cotizaciones: {
      creadas: p.enviadas,
      enviadas: p.enviadas,
      aceptadas: p.aceptadas,
      tasaAceptacion: p.enviadas ? Math.round((p.aceptadas / p.enviadas) * 1000) / 10 : null,
    },
    ventasPorMoneda: [
      {
        moneda: 'COP',
        cotizacionesAceptadas: p.aceptadas,
        ventas: { unidades: '1000000', moneda: 'COP' },
        ...(p.sinNeto !== undefined
          ? { neto: null, margen: null, margenPorcentaje: null, cotizacionesSinNeto: p.sinNeto }
          : {}),
      },
    ],
    oportunidades: {
      creadas: p.ganadas + p.perdidas,
      ganadas: p.ganadas,
      perdidas: p.perdidas,
      abiertas: 0,
      tasaConversion: p.ganadas + p.perdidas ? (p.ganadas / (p.ganadas + p.perdidas)) * 100 : null,
      porEtapa: [],
    },
    respuesta: {
      conversacionesNuevas: 0,
      conversacionesRespondidas: 0,
      medianaMinutos: null,
      promedioMinutos: null,
    },
  };
}

describe('tasas con n mínimo (T-184)', () => {
  it('1 ganada y 0 perdidas no muestra 100 %', () => {
    const v = transformarResumenReporte(
      resumen({ enviadas: 1, aceptadas: 1, ganadas: 1, perdidas: 0 }),
    );
    expect(v.oportunidades.tasaConversionTexto).toBe('1 de 1');
    expect(v.cotizaciones.tasaAceptacionTexto).toBe('1 de 1');
    expect(v.oportunidades.tasaConversionN).toBe(1);
  });

  it('en el mínimo muestra porcentaje junto a n', () => {
    expect(formatearTasaConN(50, N_MINIMO_TASA)).toBe(`50 % (n = ${N_MINIMO_TASA})`);
    expect(formatearTasaConN(50, N_MINIMO_TASA - 1)).toBe(
      `n insuficiente (n = ${N_MINIMO_TASA - 1})`,
    );
  });

  it('sin casos sigue siendo «Aún sin datos»', () => {
    expect(formatearTasaConN(null, 0)).toBe(TEXTO_SIN_DATOS);
  });

  it('el denominador de la tasa de victoria son las cerradas', () => {
    const v = transformarResumenReporte(
      resumen({ enviadas: 30, aceptadas: 15, ganadas: 12, perdidas: 13 }),
    );
    expect(v.oportunidades.tasaConversionTexto).toBe('48 % (n = 25)');
    expect(v.cotizaciones.tasaAceptacionTexto).toBe('50 % (n = 30)');
  });

  it('deriva las cotizaciones con neto de aceptadas menos sin neto', () => {
    const v = transformarResumenReporte(
      resumen({ enviadas: 5, aceptadas: 5, ganadas: 0, perdidas: 0, sinNeto: 2 }),
    );
    expect(v.filasVentas[0]?.confidencial?.cotizacionesConNeto).toBe(3);
  });

  it('expone aceptadasSinFecha (0 si la API no lo envía)', () => {
    const r = resumen({ enviadas: 5, aceptadas: 5, ganadas: 0, perdidas: 0 });
    expect(transformarResumenReporte(r).cotizaciones.aceptadasSinFecha).toBe(0);
    const con = { ...r, cotizaciones: { ...r.cotizaciones, aceptadasSinFecha: 3 } };
    expect(transformarResumenReporte(con).cotizaciones.aceptadasSinFecha).toBe(3);
  });
});
