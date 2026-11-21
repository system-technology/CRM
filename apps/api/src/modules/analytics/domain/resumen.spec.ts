import { describe, expect, it } from 'vitest';
import type { AlcanceDeReporte } from '../../../shared/autorizacion/alcance-de-reporte.js';
import type {
  ArchivoPorCobrar,
  CobrosAgregados,
  CotizacionesAbiertasAgregadas,
  CotizacionesAgregadas,
  EtapaConOportunidades,
  RespuestaAgregada,
} from '../../../shared/puertos/puertos-de-reportes.js';
import {
  armarResumen,
  cotizacionesAbiertas,
  porcentaje,
  porcentajeDeMargen,
  porCobrarPorMoneda,
  ventasDeUnaMoneda,
} from './resumen.js';

/** Lo que devuelven los puertos de T-528 cuando no hay nada vivo. */
const sinAbiertas: CotizacionesAbiertasAgregadas = {
  borradores: 0,
  enviadas: 0,
  hastaTresDias: 0,
  deCuatroASiete: 0,
  masDeSiete: 0,
};
const sinCobros: CobrosAgregados = { archivos: [], truncado: false };

const rango = { desde: new Date('2026-10-01T05:00:00Z'), hasta: new Date('2026-11-01T05:00:00Z') };
const DE_AGENCIA: AlcanceDeReporte = { nivel: 'AGENCIA', asesorId: null };
const PROPIO: AlcanceDeReporte = {
  nivel: 'PROPIO',
  asesorId: '01932000-0000-7000-8000-00000000aaaa',
};

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
  p90Minutos: null,
  sinResponder: 0,
};

const sinCotizaciones: CotizacionesAgregadas = {
  creadas: 0,
  enviadas: 0,
  aceptadas: 0,
  aceptadasSinFecha: 0,
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
    const r = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
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
    expect(r.respuesta.p90Minutos).toBeNull();
    expect(r.respuesta.tasaRespuesta).toBeNull();
    expect(r.respuesta.sinResponder).toBe(0);
  });

  it('sin agregado de cobros (sin `cobro.ver`), la clave `porCobrar` no se construye (T-537)', () => {
    const r = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: undefined,
    });
    expect(r).not.toHaveProperty('porCobrar');
    expect(JSON.stringify(r)).not.toContain('porCobrar');
    // El resto del resumen no se recorta: lo que falta es la cifra, no el reporte.
    expect(r.cotizacionesAbiertas).toBeDefined();
  });

  it('respuesta: tasa = respondidas / nuevas, del mismo grupo; respondidas + sinResponder = nuevas', () => {
    const r = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [],
      respuesta: {
        conversacionesNuevas: 8,
        conversacionesRespondidas: 6,
        promedioMinutos: 12.5,
        medianaMinutos: 9,
        p90Minutos: 30.2,
        sinResponder: 2,
      },
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect(r.respuesta).toEqual({
      conversacionesNuevas: 8,
      conversacionesRespondidas: 6,
      promedioMinutos: 12.5,
      medianaMinutos: 9,
      p90Minutos: 30.2,
      sinResponder: 2,
      tasaRespuesta: 75,
    });
    expect(r.respuesta.conversacionesRespondidas + (r.respuesta.sinResponder ?? 0)).toBe(
      r.respuesta.conversacionesNuevas,
    );
  });

  it('respuesta: con nuevas pero ninguna respondida, la tasa es 0 y los tiempos null', () => {
    const r = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [],
      respuesta: { ...vacia, conversacionesNuevas: 3, sinResponder: 3 },
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect(r.respuesta.tasaRespuesta).toBe(0);
    expect(r.respuesta.medianaMinutos).toBeNull();
  });

  it('no mezcla monedas: una fila por moneda, en el orden recibido', () => {
    const r = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: {
        creadas: 4,
        enviadas: 3,
        aceptadas: 2,
        aceptadasSinFecha: 0,
        ventasPorMoneda: [
          { moneda: 'COP', cotizacionesAceptadas: 1, ventaUnidades: 1_200_000n },
          { moneda: 'USD', cotizacionesAceptadas: 1, ventaUnidades: 90_000n },
        ],
      },
      etapas: [],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect(r.cotizaciones.tasaAceptacion).toBe(66.7);
    expect(r.ventasPorMoneda.map((v) => [v.moneda, v.ventas.unidades])).toEqual([
      ['COP', '1200000'],
      ['USD', '90000'],
    ]);
  });

  it('aceptadasSinFecha: solo aparece cuando hay alguna (contrato opcional)', () => {
    const con = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: { ...sinCotizaciones, aceptadas: 2, enviadas: 2, aceptadasSinFecha: 2 },
      etapas: [],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect(con.cotizaciones.aceptadasSinFecha).toBe(2);
    const sin = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect('aceptadasSinFecha' in sin.cotizaciones).toBe(false);
  });

  it('oportunidades: ordena por etapa, cuenta ganadas/perdidas/abiertas y calcula la conversión', () => {
    const r = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [
        etapa(3, 2, { esGanada: true }),
        etapa(1, 5),
        etapa(4, 2, { esPerdida: true }),
        etapa(2, 0),
      ],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
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
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [etapa(1, 3)],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect(r.oportunidades.tasaConversion).toBeNull();
  });

  it('el alcance y el asesor efectivos viajan en la respuesta (ADR-0035 §4)', () => {
    const agencia = armarResumen({
      alcance: DE_AGENCIA,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect(agencia.alcance).toBe('AGENCIA');
    expect(agencia.asesorId).toBeNull();

    const propio = armarResumen({
      alcance: PROPIO,
      rango,
      cotizaciones: sinCotizaciones,
      etapas: [],
      respuesta: vacia,
      abiertas: sinAbiertas,
      cobros: sinCobros,
    });
    expect(propio.alcance).toBe('PROPIO');
    expect(propio.asesorId).toBe(PROPIO.asesorId);
    // Las cifras son las mismas claves: lo que cambia es qué filas las componen.
    expect(Object.keys(propio).sort()).toEqual(Object.keys(agencia).sort());
  });
});

describe('cotizacionesAbiertas (T-528)', () => {
  it('el total son borradores + enviadas, y los tramos solo reparten las enviadas', () => {
    const r = cotizacionesAbiertas({
      borradores: 2,
      enviadas: 6,
      hastaTresDias: 1,
      deCuatroASiete: 2,
      masDeSiete: 3,
    });
    expect(r).toEqual({
      total: 8,
      borradores: 2,
      enviadas: 6,
      porAntiguedad: { hastaTresDias: 1, deCuatroASiete: 2, masDeSiete: 3 },
    });
    const t = r.porAntiguedad;
    expect(t.hastaTresDias + t.deCuatroASiete + t.masDeSiete).toBe(r.enviadas);
  });

  it('sin nada vivo: ceros, no null', () => {
    expect(cotizacionesAbiertas(sinAbiertas).total).toBe(0);
  });
});

describe('porCobrarPorMoneda (T-528)', () => {
  const archivo = (extra: Partial<ArchivoPorCobrar> = {}): ArchivoPorCobrar => ({
    moneda: 'COP',
    estado: 'ABIERTO',
    ventaUnidades: 1_000_000n,
    sumas: { pagos: 0n, devoluciones: 0n, ajustes: 0n, penalidades: 0n },
    ...extra,
  });

  it('agrupa por moneda, sin sumar monedas distintas ni convertir con TRM (R8)', () => {
    const r = porCobrarPorMoneda({
      archivos: [
        archivo(),
        archivo({ ventaUnidades: 500_000n }),
        archivo({ moneda: 'USD', ventaUnidades: 20_000n }),
      ],
      truncado: false,
    });
    expect(r.porMoneda).toEqual([
      { moneda: 'COP', archivos: 2, saldo: { unidades: '1500000', moneda: 'COP' } },
      { moneda: 'USD', archivos: 1, saldo: { unidades: '20000', moneda: 'USD' } },
    ]);
    expect(r.truncado).toBe(false);
  });

  it('descuenta lo pagado y los ajustes, y no cuenta el archivo ya pagado', () => {
    const r = porCobrarPorMoneda({
      archivos: [
        // Venta 1.000.000, descuento de 100.000 y 400.000 pagados: debe 500.000.
        archivo({
          sumas: { pagos: 400_000n, devoluciones: 0n, ajustes: -100_000n, penalidades: 0n },
        }),
        // Pagado completo: no es «por cobrar».
        archivo({
          ventaUnidades: 700_000n,
          sumas: { pagos: 700_000n, devoluciones: 0n, ajustes: 0n, penalidades: 0n },
        }),
      ],
      truncado: false,
    });
    expect(r.porMoneda).toEqual([
      { moneda: 'COP', archivos: 1, saldo: { unidades: '500000', moneda: 'COP' } },
    ]);
  });

  it('un saldo a favor del viajero no resta a lo que deben los demás', () => {
    const r = porCobrarPorMoneda({
      archivos: [
        archivo(),
        // Pagó de más: saldo negativo. No entra ni en el conteo ni en la suma.
        archivo({
          ventaUnidades: 300_000n,
          sumas: { pagos: 900_000n, devoluciones: 0n, ajustes: 0n, penalidades: 0n },
        }),
      ],
      truncado: false,
    });
    expect(r.porMoneda).toEqual([
      { moneda: 'COP', archivos: 1, saldo: { unidades: '1000000', moneda: 'COP' } },
    ]);
  });

  it('sin archivos: lista vacía, y `truncado` se propaga tal cual', () => {
    expect(porCobrarPorMoneda({ archivos: [], truncado: true })).toEqual({
      porMoneda: [],
      truncado: true,
    });
  });

  it('las sumas son bigint de punta a punta: un saldo que desborda el entero seguro de JS', () => {
    const enorme = 9_007_199_254_740_993n; // 2^53 + 1
    const r = porCobrarPorMoneda({
      archivos: [archivo({ ventaUnidades: enorme })],
      truncado: false,
    });
    expect(r.porMoneda[0]?.saldo.unidades).toBe('9007199254740993');
  });
});
