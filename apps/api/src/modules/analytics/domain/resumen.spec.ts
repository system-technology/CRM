import { describe, expect, it } from 'vitest';
import type {
  CotizacionesAgregadas,
  EtapaConOportunidades,
  RespuestaAgregada,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { armarResumen, porcentaje, porcentajeDeMargen, ventasDeUnaMoneda } from './resumen.js';

const rango = { desde: new Date('2026-10-01T05:00:00Z'), hasta: new Date('2026-11-01T05:00:00Z') };

const etapa = (
  orden: number,
  cantidad: number,
  extra: Partial<EtapaConOportunidades> = {},
): EtapaConOportunidades => ({
  etapaId: `00000000-0000-7000-8000-00000000000${orden}`,
  nombre: `Etapa ${orden}`,
  orden,
  esGanada: false,
  esPerdida: false,
  cantidad,
  ...extra,
});

const vacia: RespuestaAgregada = {
  conversacionesNuevas: 0,
  conversacionesRespondidas: 0,
  promedioMinutos: null,
  medianaMinutos: null,
};

const sinCotizaciones: CotizacionesAgregadas = {
  creadas: 0,
  enviadas: 0,
  aceptadas: 0,
  ventasPorMoneda: [],
};

describe('porcentaje', () => {
  it('redondea a un decimal', () => {
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(2, 3)).toBe(66.7);
    expect(porcentaje(5, 5)).toBe(100);
  });

  it('sin denominador es null, no 0', () => {
    expect(porcentaje(0, 0)).toBeNull();
  });
});

describe('porcentajeDeMargen', () => {
  it('calcula con enteros grandes sin perder precisión (R8)', () => {
    // 12 345 678 901 de margen sobre 98 765 432 101: más allá de lo cómodo para un float en COP.
    expect(porcentajeDeMargen(2_000_000n, 10_000_000n)).toBe(20);
    expect(porcentajeDeMargen(12_345_678_901n, 98_765_432_101n)).toBe(12.5);
  });

  it('sin base de venta es null; un margen negativo se conserva', () => {
    expect(porcentajeDeMargen(0n, 0n)).toBeNull();
    expect(porcentajeDeMargen(-1_000n, 10_000n)).toBe(-10);
  });
});

describe('ventasDeUnaMoneda', () => {
  it('sin margen en el agregado, las claves NO existen (ni en cero ni en null)', () => {
    const fila = ventasDeUnaMoneda({
      moneda: 'COP',
      cotizacionesAceptadas: 2,
      ventaUnidades: 5_000_000n,
    });
    expect(fila).toEqual({
      moneda: 'COP',
      cotizacionesAceptadas: 2,
      ventas: { unidades: '5000000', moneda: 'COP' },
    });
    for (const clave of ['neto', 'margen', 'margenPorcentaje', 'cotizacionesSinNeto']) {
      expect(Object.keys(fila)).not.toContain(clave);
    }
  });

  it('con margen, calcula el porcentaje sobre la venta de lo que tiene neto', () => {
    const fila = ventasDeUnaMoneda({
      moneda: 'COP',
      cotizacionesAceptadas: 3,
      ventaUnidades: 6_000_000n,
      margen: {
        netoUnidades: 4_000_000n,
        margenUnidades: 1_000_000n,
        // Una de las tres cotizaciones no tiene neto: su venta no entra en la base.
        ventaConNetoUnidades: 5_000_000n,
        cotizacionesSinNeto: 1,
      },
    });
    expect(fila.neto).toEqual({ unidades: '4000000', moneda: 'COP' });
    expect(fila.margen).toEqual({ unidades: '1000000', moneda: 'COP' });
    expect(fila.margenPorcentaje).toBe(20);
    expect(fila.cotizacionesSinNeto).toBe(1);
  });

  it('con margen pero sin ningún neto conocido, neto y margen son null (desconocido, no cero)', () => {
    const fila = ventasDeUnaMoneda({
      moneda: 'USD',
      cotizacionesAceptadas: 1,
      ventaUnidades: 90_000n,
      margen: {
        netoUnidades: null,
        margenUnidades: null,
        ventaConNetoUnidades: 0n,
        cotizacionesSinNeto: 1,
      },
    });
    expect(fila.neto).toBeNull();
    expect(fila.margen).toBeNull();
    expect(fila.margenPorcentaje).toBeNull();
  });
});

describe('armarResumen', () => {
  it('sin datos: todo en cero y las razones en null', () => {
    const r = armarResumen({ rango, cotizaciones: sinCotizaciones, etapas: [], respuesta: vacia });
    expect(r.periodo).toEqual({
      desde: '2026-10-01T05:00:00.000Z',
      hasta: '2026-11-01T05:00:00.000Z',
    });
    expect(r.cotizaciones.tasaAceptacion).toBeNull();
    expect(r.ventasPorMoneda).toEqual([]);
    expect(r.oportunidades).toMatchObject({
      creadas: 0,
      ganadas: 0,
      perdidas: 0,
      abiertas: 0,
      tasaConversion: null,
      porEtapa: [],
    });
    expect(r.respuesta.promedioMinutos).toBeNull();
  });

  it('no mezcla monedas: una fila por moneda, en el orden recibido', () => {
    const r = armarResumen({
      rango,
      cotizaciones: {
        creadas: 4,
        enviadas: 3,
        aceptadas: 2,
        ventasPorMoneda: [
          { moneda: 'COP', cotizacionesAceptadas: 1, ventaUnidades: 1_200_000n },
          { moneda: 'USD', cotizacionesAceptadas: 1, ventaUnidades: 90_000n },
        ],
      },
      etapas: [],
      respuesta: vacia,
    });
    expect(r.cotizaciones.tasaAceptacion).toBe(66.7);
    expect(r.ventasPorMoneda.map((v) => [v.moneda, v.ventas.unidades])).toEqual([
      ['COP', '1200000'],
      ['USD', '90000'],
    ]);
  });

  it('oportunidades: ordena por etapa, cuenta ganadas/perdidas/abiertas y calcula la conversión', () => {
    const r = armarResumen({
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [
        etapa(3, 2, { esGanada: true }),
        etapa(1, 5),
        etapa(4, 2, { esPerdida: true }),
        etapa(2, 0),
      ],
      respuesta: vacia,
    });
    expect(r.oportunidades.porEtapa.map((e) => e.orden)).toEqual([1, 2, 3, 4]);
    expect(r.oportunidades).toMatchObject({
      creadas: 9,
      ganadas: 2,
      perdidas: 2,
      abiertas: 5,
      tasaConversion: 50,
    });
  });

  it('oportunidades sin ninguna cerrada: conversión null, no 0', () => {
    const r = armarResumen({
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [etapa(1, 3)],
      respuesta: vacia,
    });
    expect(r.oportunidades.tasaConversion).toBeNull();
  });
});
