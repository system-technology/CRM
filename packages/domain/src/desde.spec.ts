import { describe, expect, it } from 'vitest';
import { calcularDesde, type TarifaParaDesde, type VigenciaParaDesde } from './desde.js';

const tarifa = (p: Partial<TarifaParaDesde> & { ventaUnidades: bigint }): TarifaParaDesde => ({
  moneda: 'COP',
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  aditiva: false,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  ocupaSilla: null,
  ...p,
});

const vigencia = (
  tarifas: TarifaParaDesde[],
  p: Partial<VigenciaParaDesde> = {},
): VigenciaParaDesde => ({
  activa: true,
  hasta: '2027-12-31',
  tarifas,
  ...p,
});

const texto = (r: ReturnType<typeof calcularDesde>) =>
  r.map((x) => `${x.precio.unidades} ${x.precio.moneda}`);

describe('calcularDesde', () => {
  it('Adulto 900000 COP + Infante 0 COP = [900000 COP], nunca 0', () => {
    const r = calcularDesde(
      [
        vigencia([
          tarifa({ ventaUnidades: 900000n, tipoPasajero: 'ADT' }),
          tarifa({ ventaUnidades: 0n, tipoPasajero: 'INF', edadMaxima: 2, ocupaSilla: false }),
        ]),
      ],
      '2027-01-01',
    );
    expect(texto(r)).toEqual(['900000 COP']);
  });

  it('una tarifa que no ocupa silla tampoco cuenta', () => {
    const r = calcularDesde(
      [
        vigencia([
          tarifa({ ventaUnidades: 500n }),
          tarifa({ ventaUnidades: 0n, ocupaSilla: false }),
        ]),
      ],
      null,
    );
    expect(texto(r)).toEqual(['500 COP']);
  });

  it('un suplemento aditivo no es el «desde»', () => {
    const r = calcularDesde(
      [
        vigencia([
          tarifa({ ventaUnidades: 900000n }),
          tarifa({ ventaUnidades: 150000n, aditiva: true }),
        ]),
      ],
      null,
    );
    expect(texto(r)).toEqual(['900000 COP']);
  });

  it('COP y USD van juntos, uno por moneda y sin conversión', () => {
    const r = calcularDesde(
      [
        vigencia([
          tarifa({ ventaUnidades: 900000n }),
          tarifa({ ventaUnidades: 25000n, moneda: 'USD' }),
          tarifa({ ventaUnidades: 950000n }),
        ]),
      ],
      null,
    );
    expect(texto(r)).toEqual(['900000 COP', '25000 USD']);
  });

  it('solo tarifas no base = []', () => {
    const r = calcularDesde(
      [
        vigencia([
          tarifa({ ventaUnidades: 100n, aditiva: true }),
          tarifa({ ventaUnidades: 200n, tipoPasajero: 'CHD', edadMinima: 2, edadMaxima: 11 }),
        ]),
      ],
      null,
    );
    expect(r).toEqual([]);
    expect(calcularDesde([], null)).toEqual([]);
  });

  it('ignora vigencias inactivas y vencidas (hasta < hoy); hasta = hoy cuenta', () => {
    const vigencias = [
      vigencia([tarifa({ ventaUnidades: 100n })], { activa: false }),
      vigencia([tarifa({ ventaUnidades: 200n })], { hasta: '2026-12-31' }),
      vigencia([tarifa({ ventaUnidades: 300n })], { hasta: '2027-01-01' }),
    ];
    expect(texto(calcularDesde(vigencias, '2027-01-01'))).toEqual(['300 COP']);
    expect(calcularDesde(vigencias, '2027-01-02')).toEqual([]);
  });

  it('una tarifa de grupo entra con su per cápita y queda marcada', () => {
    const r = calcularDesde(
      [
        vigencia([
          tarifa({ ventaUnidades: 280000n, unidad: 'POR_GRUPO', cubrePasajeros: 2 }),
          tarifa({ ventaUnidades: 189000n }),
        ]),
      ],
      null,
    );
    expect(texto(r)).toEqual(['140000 COP']);
    expect(r[0]?.esDeGrupo).toBe(true);
  });
});
