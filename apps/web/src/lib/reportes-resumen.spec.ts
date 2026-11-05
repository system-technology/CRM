import { describe, expect, it } from 'vitest';
import { ResumenDeReportes } from '@viajapro/contracts';
import {
  prepararResumen,
  TEXTO_SIN_DATOS,
  textoMinutos,
  textoPorcentaje,
  variacionDeImportes,
} from './reportes-resumen';

const ETAPA = '01932000-0000-7000-8000-0000000000e1';

function resumen(extra: Partial<ResumenDeReportes> = {}): ResumenDeReportes {
  return {
    periodo: { desde: '2026-11-01T05:00:00.000Z', hasta: '2026-11-04T05:00:00.000Z' },
    cotizaciones: { creadas: 0, enviadas: 0, aceptadas: 0, tasaAceptacion: null },
    ventasPorMoneda: [],
    oportunidades: {
      creadas: 0,
      ganadas: 0,
      perdidas: 0,
      abiertas: 0,
      tasaConversion: null,
      porEtapa: [
        {
          etapaId: ETAPA,
          nombre: 'Nuevo',
          orden: 1,
          esGanada: false,
          esPerdida: false,
          cantidad: 0,
        },
      ],
    },
    respuesta: {
      conversacionesNuevas: 0,
      conversacionesRespondidas: 0,
      promedioMinutos: null,
      medianaMinutos: null,
    },
    ...extra,
  };
}

describe('reportes-resumen', () => {
  it('una razón null es «Aún sin datos», no 0', () => {
    expect(textoPorcentaje(null)).toBe(TEXTO_SIN_DATOS);
    expect(textoMinutos(null)).toBe(TEXTO_SIN_DATOS);
    const v = prepararResumen(resumen(), null);
    expect(v.tasaAceptacion).toBe('Aún sin datos');
    expect(v.tasaConversion).toBe('Aún sin datos');
    expect(v.promedioRespuesta).toBe('Aún sin datos');
    expect(v.medianaRespuesta).toBe('Aún sin datos');
  });

  it('un 0 real sí se muestra como 0 (no se confunde con sin datos)', () => {
    expect(textoPorcentaje(0)).toBe('0 %');
    expect(textoMinutos(0)).toBe('0 min');
  });

  it('formatea con coma decimal es-CO', () => {
    expect(textoPorcentaje(12.5)).toBe('12,5 %');
    expect(textoMinutos(4.5)).toBe('4,5 min');
  });

  it('una fila por moneda: nunca suma COP con USD', () => {
    const v = prepararResumen(
      resumen({
        ventasPorMoneda: [
          {
            moneda: 'COP',
            cotizacionesAceptadas: 2,
            ventas: { unidades: '9100000', moneda: 'COP' },
          },
          {
            moneda: 'USD',
            cotizacionesAceptadas: 1,
            ventas: { unidades: '125000', moneda: 'USD' },
          },
        ],
      }),
      null,
    );
    expect(v.filasDeVentas).toHaveLength(2);
    expect(v.filasDeVentas.map((f) => f.ventas.unidades)).toEqual(['9100000', '125000']);
    expect(v.filasDeVentas.map((f) => f.moneda)).toEqual(['COP', 'USD']);
  });

  it('sin el permiso las claves no están y la vista no fabrica margen', () => {
    const v = prepararResumen(
      resumen({
        ventasPorMoneda: [
          {
            moneda: 'COP',
            cotizacionesAceptadas: 1,
            ventas: { unidades: '1000000', moneda: 'COP' },
          },
        ],
      }),
      null,
    );
    expect(v.hayConfidencial).toBe(false);
    expect(v.filasDeVentas[0]?.confidencial).toBeUndefined();
  });

  it('con el permiso conserva neto, margen y null como desconocido (no cero)', () => {
    const v = prepararResumen(
      resumen({
        ventasPorMoneda: [
          {
            moneda: 'COP',
            cotizacionesAceptadas: 2,
            ventas: { unidades: '1000000', moneda: 'COP' },
            neto: null,
            margen: null,
            margenPorcentaje: null,
            cotizacionesSinNeto: 2,
          },
        ],
      }),
      null,
    );
    expect(v.hayConfidencial).toBe(true);
    expect(v.filasDeVentas[0]?.confidencial).toEqual({
      neto: null,
      margen: null,
      margenPorcentaje: null,
      cotizacionesSinNeto: 2,
    });
  });

  it('la variación se calcula por moneda contra el periodo anterior', () => {
    const actual = resumen({
      ventasPorMoneda: [
        { moneda: 'COP', cotizacionesAceptadas: 1, ventas: { unidades: '1150', moneda: 'COP' } },
        { moneda: 'USD', cotizacionesAceptadas: 1, ventas: { unidades: '500', moneda: 'USD' } },
      ],
    });
    const anterior = resumen({
      ventasPorMoneda: [
        { moneda: 'COP', cotizacionesAceptadas: 1, ventas: { unidades: '1000', moneda: 'COP' } },
      ],
    });
    const v = prepararResumen(actual, anterior);
    expect(v.filasDeVentas[0]?.variacionPorcentaje).toBe(15);
    // USD no existía antes: sin base, sin variación (no se compara con COP).
    expect(v.filasDeVentas[1]?.variacionPorcentaje).toBeNull();
  });

  it('variacionDeImportes: sin base es null y usa enteros grandes sin perder precisión', () => {
    expect(variacionDeImportes('100', '0')).toBeNull();
    expect(variacionDeImportes('50', '100')).toBe(-50);
    expect(variacionDeImportes('9007199254740993000', '9007199254740993000')).toBe(0);
  });

  it('el resumen de ejemplo cumple el contrato', () => {
    expect(ResumenDeReportes.safeParse(resumen()).success).toBe(true);
  });
});
