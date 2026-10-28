import type { CotizacionDeSalida, OpcionDePrecio } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { armarVersion } from './version-de-cotizacion.js';

const POLITICA = {
  porcentaje: 20,
  base: 'SOBRE_EL_NETO',
  origenDeLaVenta: 'DERIVADA_DEL_NETO',
  redondeoVenta: 1000,
} as const;

type Moneda = OpcionDePrecio['total']['moneda'];

const linea = (total: string, margen?: string | null, moneda: Moneda = 'COP'): OpcionDePrecio => ({
  tarifaId: '01932000-0000-7000-8000-000000000001',
  nombre: 'Adulto',
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  veces: 1,
  precioUnitario: { unidades: total, moneda },
  total: { unidades: total, moneda },
  ...(margen === undefined
    ? {}
    : { margen: margen === null ? null : { unidades: margen, moneda } }),
  masBarata: false,
});

function calculo(lineas: OpcionDePrecio[], total?: string): CotizacionDeSalida {
  const suma = lineas.reduce((a, l) => a + BigInt(l.total.unidades), 0n).toString();
  return {
    paqueteId: '01932000-0000-7000-8000-000000000002',
    paqueteNombre: 'San Andrés 4D/3N',
    destino: 'San Andrés',
    noches: 3,
    fecha: '2026-12-20',
    vigenciaId: '01932000-0000-7000-8000-000000000003',
    vigenciaDesde: '2026-12-01',
    vigenciaHasta: '2026-12-31',
    deSalidaProgramada: false,
    adultos: 2,
    ninos: 0,
    infantes: 0,
    pasajeros: 2,
    lineas,
    total: { unidades: total ?? suma, moneda: 'COP' },
    alternativas: [],
    noAplicables: [],
    suplementos: [],
    pideComposicion: false,
  };
}

describe('armarVersion', () => {
  it('suma las líneas en enteros y deriva el neto de la venta y el margen', () => {
    const v = armarVersion(
      calculo([linea('1200000', '200000'), linea('600000', '100000')]),
      POLITICA,
      {},
    );
    expect(v.ventaUnidades).toBe(1_800_000n);
    expect(v.margenUnidades).toBe(300_000n);
    expect(v.netoUnidades).toBe(1_500_000n);
    expect(v.monedaIso).toBe('COP');
  });

  it('si una línea no tiene margen, neto y margen quedan DESCONOCIDOS, no en cero', () => {
    const v = armarVersion(
      calculo([linea('1200000', '200000'), linea('600000', null)]),
      POLITICA,
      {},
    );
    expect(v.netoUnidades).toBeNull();
    expect(v.margenUnidades).toBeNull();
  });

  it('si no se calculó el margen (las líneas no lo traen), tampoco hay neto', () => {
    const v = armarVersion(calculo([linea('1200000')]), POLITICA, {});
    expect(v.netoUnidades).toBeNull();
    expect(v.ventaUnidades).toBe(1_200_000n);
  });

  it('conserva la política aplicada, la acomodación y la vigencia de la oferta', () => {
    const v = armarVersion(calculo([linea('100')]), POLITICA, {
      acomodacion: 'DOBLE',
      vigenteHasta: '2026-11-30',
    });
    expect(v.politica).toEqual(POLITICA);
    expect(v.acomodacion).toBe('DOBLE');
    expect(v.vigenteHasta).toBe('2026-11-30');
  });

  it('guarda la opción de salida con la que cotizó el servidor, y null si no hubo (T-062)', () => {
    const conOpcion = armarVersion(
      {
        ...calculo([linea('100')]),
        opcionDeSalida: { id: '01932000-0000-7000-8000-000000000009', etiqueta: 'Lancha' },
      },
      POLITICA,
      {},
    );
    expect(conOpcion.opcionDeSalidaId).toBe('01932000-0000-7000-8000-000000000009');

    expect(armarVersion(calculo([linea('100')]), POLITICA, {}).opcionDeSalidaId).toBeNull();
    expect(
      armarVersion({ ...calculo([linea('100')]), opcionDeSalida: null }, POLITICA, {})
        .opcionDeSalidaId,
    ).toBeNull();
  });

  it('sin líneas no hay nada que guardar', () => {
    expect(() => armarVersion(calculo([]), POLITICA, {})).toThrow(/no tiene líneas/i);
  });

  it('rechaza líneas que no suman el total', () => {
    expect(() => armarVersion(calculo([linea('100')], '999'), POLITICA, {})).toThrow(/suman/);
  });

  it('rechaza una línea en otra moneda', () => {
    expect(() =>
      armarVersion(calculo([linea('100', undefined, 'USD')], '100'), POLITICA, {}),
    ).toThrow(/USD/);
  });
});
