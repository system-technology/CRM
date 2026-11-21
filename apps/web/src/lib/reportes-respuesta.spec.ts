import type { ResumenDeReportes } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  formatearP90,
  formatearTasaDeRespuesta,
  N_MINIMO_TASA,
  TEXTO_SIN_DATOS,
  transformarResumenReporte,
} from './reportes-logica';

function resumenCon(respuesta: ResumenDeReportes['respuesta']): ResumenDeReportes {
  return {
    alcance: 'AGENCIA' as const,
    asesorId: null,
    periodo: { desde: '2026-10-01T05:00:00.000Z', hasta: '2026-11-01T05:00:00.000Z' },
    cotizaciones: { creadas: 0, enviadas: 0, aceptadas: 0, tasaAceptacion: null },
    ventasPorMoneda: [],
    oportunidades: {
      creadas: 0,
      ganadas: 0,
      perdidas: 0,
      abiertas: 0,
      tasaConversion: null,
      porEtapa: [],
    },
    respuesta,
  };
}

describe('primera respuesta: X de Y respondidas (Z %)', () => {
  it('con n suficiente muestra el porcentaje, la mediana y el p90', () => {
    const v = transformarResumenReporte(
      resumenCon({
        conversacionesNuevas: 40,
        conversacionesRespondidas: 30,
        sinResponder: 10,
        tasaRespuesta: 75,
        promedioMinutos: 14,
        medianaMinutos: 9,
        p90Minutos: 45,
      }),
    ).respuesta;
    expect(v.tasaRespuestaTexto).toBe('30 de 40 respondidas (75 %)');
    expect(v.p90Valor).toBe(45);
    expect(v.p90Texto).not.toMatch(/insuficiente/);
    expect(v.sinResponder).toBe(10);
  });

  it('con n pequeño no muestra porcentaje ni p90, y nunca sale «12 de 5»', () => {
    const v = transformarResumenReporte(
      resumenCon({
        conversacionesNuevas: 5,
        conversacionesRespondidas: 4,
        sinResponder: 1,
        tasaRespuesta: 80,
        promedioMinutos: 14,
        medianaMinutos: 9,
        p90Minutos: 45,
      }),
    ).respuesta;
    expect(v.tasaRespuestaTexto).toBe('4 de 5 respondidas (n insuficiente para el porcentaje)');
    expect(v.tasaRespuestaTexto).not.toContain('%');
    expect(v.p90Texto).toBe('n insuficiente (n = 4)');
  });

  it('con una API anterior (sin los campos nuevos) deriva sinResponder y la tasa', () => {
    const v = transformarResumenReporte(
      resumenCon({
        conversacionesNuevas: 20,
        conversacionesRespondidas: 15,
        promedioMinutos: 14,
        medianaMinutos: 9,
      }),
    ).respuesta;
    expect(v.sinResponder).toBe(5);
    expect(v.tasaRespuestaValor).toBe(75);
    expect(v.p90Texto).toBe(TEXTO_SIN_DATOS);
  });

  it('sin conversaciones: sin datos', () => {
    expect(formatearTasaDeRespuesta(0, 0, null)).toBe(TEXTO_SIN_DATOS);
    expect(formatearP90(null, 0)).toBe(TEXTO_SIN_DATOS);
  });

  it('el umbral es N_MINIMO_TASA, inclusive', () => {
    expect(formatearTasaDeRespuesta(10, N_MINIMO_TASA, 50)).toContain('50 %');
    expect(formatearTasaDeRespuesta(10, N_MINIMO_TASA - 1, 52.6)).not.toContain('%');
  });
});
