import { describe, expect, it } from 'vitest';
import { ImporteInvalidoError, Money, MonedasIncompatiblesError } from './money.js';
import {
  POLITICA_POR_DEFECTO,
  politicaPorDefecto,
  type PoliticaDePrecio,
  calcularMargen,
  calcularVenta,
  derivarNeto,
  redondearA,
} from './precio-de-venta.js';

const cop = (valor: string) => Money.desdeDecimal(valor, 'COP');
const usd = (valor: string) => Money.desdeDecimal(valor, 'USD');
const con = (cambios: Partial<PoliticaDePrecio>): PoliticaDePrecio => ({
  ...POLITICA_POR_DEFECTO,
  ...cambios,
});

describe('Venta menor que el neto (margen negativo)', () => {
  it('calcularMargen lo informa como pérdida, sin lanzar, en ambas bases', () => {
    const neto = cop('1000000');
    const venta = cop('900000');

    const sobreNeto = calcularMargen(neto, venta, 'SOBRE_EL_NETO');
    expect(sobreNeto?.importe.aDecimal()).toBe('-100000');
    expect(sobreNeto?.importe.esNegativo()).toBe(true);
    expect(sobreNeto?.porcentaje).toBe(-10);

    const sobreVenta = calcularMargen(neto, venta, 'SOBRE_LA_VENTA');
    expect(sobreVenta?.porcentaje).toBe(-11.11);
  });

  it('venta igual al neto: margen exactamente cero, no nulo', () => {
    const margen = calcularMargen(cop('500000'), cop('500000'), 'SOBRE_EL_NETO');
    expect(margen?.importe.esCero()).toBe(true);
    expect(margen?.porcentaje).toBe(0);
  });

  it('venta en cero con neto positivo y base SOBRE_LA_VENTA: importe negativo y porcentaje sin calcular', () => {
    const margen = calcularMargen(cop('1000'), Money.cero('COP'), 'SOBRE_LA_VENTA');
    expect(margen?.importe.aDecimal()).toBe('-1000');
    expect(margen?.porcentaje).toBeNull();
  });

  it('calcularVenta nunca produce una venta bajo el neto: con política válida la venta >= neto', () => {
    const neto = cop('1234567');
    for (const base of ['SOBRE_EL_NETO', 'SOBRE_LA_VENTA'] as const) {
      for (const porcentaje of [0, 0.5, 20, 99.99]) {
        const venta = calcularVenta(neto, con({ base, porcentaje, redondeoVenta: 0 }));
        expect(venta.mayorQue(neto) || venta.igualA(neto)).toBe(true);
      }
    }
  });

  it('con porcentaje 0 la venta es el neto (se permite vender a costo)', () => {
    expect(calcularVenta(cop('777000'), con({ porcentaje: 0, redondeoVenta: 0 })).aDecimal()).toBe(
      '777000',
    );
  });

  it('el redondeo de la venta nunca la deja bajo el neto: sube al siguiente paso (T-218)', () => {
    // Neto 1.000.100, 0,01 % = 100 -> 1.000.200 -> medio-arriba daría 1.000.000 (bajo el neto).
    const neto = cop('1000100');
    const venta = calcularVenta(neto, con({ porcentaje: 0.01, redondeoVenta: 1000 }));
    expect(venta.aDecimal()).toBe('1001000');
    expect(calcularMargen(neto, venta, 'SOBRE_EL_NETO')?.importe.esNegativo()).toBe(false);
  });

  it('lo mismo con base SOBRE_LA_VENTA', () => {
    const neto = cop('1000100');
    const venta = calcularVenta(
      neto,
      con({ base: 'SOBRE_LA_VENTA', porcentaje: 0.01, redondeoVenta: 1000 }),
    );
    expect(venta.mayorQue(neto)).toBe(true);
  });

  it('si el neto ya es múltiplo del paso y el margen es 0, la venta es el neto', () => {
    const venta = calcularVenta(cop('1000000'), con({ porcentaje: 0, redondeoVenta: 1000 }));
    expect(venta.aDecimal()).toBe('1000000');
  });

  it('barrido: con cualquier neto y paso la venta >= neto', () => {
    for (const neto of [1, 499, 500, 999, 1_000_100, 1_234_567]) {
      for (const porcentaje of [0, 0.001, 0.01, 0.4, 20]) {
        for (const base of ['SOBRE_EL_NETO', 'SOBRE_LA_VENTA'] as const) {
          const n = Money.desdeUnidades(neto, 'COP');
          const v = calcularVenta(n, con({ base, porcentaje, redondeoVenta: 1000 }));
          expect(v.mayorQue(n) || v.igualA(n)).toBe(true);
        }
      }
    }
  });
});

describe('Markup negativo', () => {
  it('calcularVenta lo rechaza en ambas bases', () => {
    for (const base of ['SOBRE_EL_NETO', 'SOBRE_LA_VENTA'] as const) {
      expect(() => calcularVenta(cop('100000'), con({ base, porcentaje: -0.01 }))).toThrow(
        ImporteInvalidoError,
      );
    }
  });

  it('derivarNeto también lo rechaza', () => {
    expect(() => derivarNeto(cop('100000'), con({ porcentaje: -1 }))).toThrow(/negativo/i);
  });

  it('Money.aplicarMarkup SÍ admite porcentaje negativo (es un descuento): la regla está en la política, no en Money', () => {
    expect(cop('100000').aplicarMarkup(-10).aDecimal()).toBe('90000');
  });

  it('Money.aplicarMarkup(-100) deja el importe en cero y -150 lo vuelve negativo sin lanzar', () => {
    expect(cop('100000').aplicarMarkup(-100).esCero()).toBe(true);
    expect(cop('100000').aplicarMarkup(-150).aDecimal()).toBe('-50000');
  });

  it('rechaza porcentajes no finitos', () => {
    expect(() => cop('1').aplicarPorcentaje(Number.POSITIVE_INFINITY)).toThrow(
      ImporteInvalidoError,
    );
    expect(() => cop('1').aplicarPorcentaje(Number.NEGATIVE_INFINITY)).toThrow(
      ImporteInvalidoError,
    );
    expect(() => cop('1').aplicarPorcentaje(Number.NaN)).toThrow(ImporteInvalidoError);
  });
});

describe('Cantidad cero y cantidades inválidas', () => {
  it('cantidad cero da cero, en la misma moneda', () => {
    const total = usd('150.75').porCantidad(0);
    expect(total.esCero()).toBe(true);
    expect(total.moneda).toBe('USD');
  });

  it('una suma de cero ítems es cero', () => {
    const total = [] as Money[];
    expect(total.reduce((a, b) => a.sumar(b), Money.cero('COP')).esCero()).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rechaza la cantidad %s', (cantidad) => {
    expect(() => cop('1000').porCantidad(cantidad)).toThrow(ImporteInvalidoError);
  });

  it('el margen de una línea de cantidad cero es cero con porcentaje sin calcular', () => {
    const neto = cop('1000').porCantidad(0);
    const venta = cop('1200').porCantidad(0);
    const margen = calcularMargen(neto, venta, 'SOBRE_EL_NETO');
    expect(margen?.importe.esCero()).toBe(true);
    expect(margen?.porcentaje).toBeNull();
  });
});

describe('Mezcla de monedas', () => {
  const errores = [
    ['sumar', (a: Money, b: Money) => a.sumar(b)],
    ['restar', (a: Money, b: Money) => a.restar(b)],
    ['mayorQue', (a: Money, b: Money) => a.mayorQue(b)],
  ] as const;

  it.each(errores)('%s COP con USD falla con MonedasIncompatiblesError', (_n, op) => {
    expect(() => op(cop('1000'), usd('1.00'))).toThrow(MonedasIncompatiblesError);
  });

  it('igualA no lanza: COP 100 y USD 1,00 no son iguales aunque lleven las mismas unidades', () => {
    expect(Money.desdeUnidades(100, 'COP').igualA(Money.desdeUnidades(100, 'USD'))).toBe(false);
  });

  it('calcularMargen con neto en una moneda y venta en otra falla', () => {
    expect(() => calcularMargen(cop('1000'), usd('1.00'), 'SOBRE_EL_NETO')).toThrow(
      MonedasIncompatiblesError,
    );
  });

  it('no hay conversión implícita: el error nombra ambas monedas', () => {
    try {
      cop('1').sumar(usd('1'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MonedasIncompatiblesError);
      expect((e as MonedasIncompatiblesError).a).toBe('COP');
      expect((e as MonedasIncompatiblesError).b).toBe('USD');
    }
  });

  it('una moneda no habilitada se rechaza al construir', () => {
    expect(() => Money.desdeUnidades(1, 'JPY')).toThrow(/moneda/i);
    expect(() => Money.desdeUnidades(1, 'cop')).toThrow(/moneda/i);
    expect(() => Money.desdeUnidades(1, 'toString')).toThrow(/moneda/i);
  });
});

describe('Importes mayores que Number.MAX_SAFE_INTEGER', () => {
  const MAX = Number.MAX_SAFE_INTEGER;

  it('desdeUnidades con number inseguro se rechaza', () => {
    expect(() => Money.desdeUnidades(MAX + 1, 'COP')).toThrow(ImporteInvalidoError);
    expect(() => Money.desdeUnidades(-(MAX + 1), 'COP')).toThrow(ImporteInvalidoError);
    expect(() => Money.desdeUnidades(Number.POSITIVE_INFINITY, 'COP')).toThrow(
      ImporteInvalidoError,
    );
  });

  it('el máximo seguro exacto se acepta', () => {
    expect(Money.desdeUnidades(MAX, 'COP').aDecimal()).toBe('9007199254740991');
  });

  it('con bigint el importe supera el entero seguro sin perder precisión', () => {
    const grande = Money.desdeUnidades(BigInt(MAX) + 2n, 'COP');
    expect(grande.aDecimal()).toBe('9007199254740993'); // un number daría ...992
    expect(grande.sumar(Money.desdeUnidades(1, 'COP')).aDecimal()).toBe('9007199254740994');
  });

  it('desdeDecimal con cadena larga conserva todos los dígitos', () => {
    expect(cop('9007199254740993').aPersistencia().unidades).toBe(9007199254740993n);
    expect(usd('90071992547409.93').aPersistencia().unidades).toBe(9007199254740993n);
  });

  it('desdeDecimal con number que ya perdió precisión no lo disimula: 1e21 no tiene formato decimal', () => {
    expect(() => Money.desdeDecimal(1e21, 'COP')).toThrow(ImporteInvalidoError);
  });

  it('porCantidad y markup sobre importes enormes siguen siendo exactos (bigint)', () => {
    const casiMax = Money.desdeUnidades(BigInt(MAX), 'COP');
    expect(casiMax.porCantidad(3).aPersistencia().unidades).toBe(BigInt(MAX) * 3n);
    expect(casiMax.aplicarMarkup(100).aPersistencia().unidades).toBe(BigInt(MAX) * 2n);
  });

  it('aPersistencia de un importe inseguro entrega bigint: quien lo guarde en number lo corrompe', () => {
    const grande = Money.desdeUnidades(BigInt(MAX) + 2n, 'COP');
    expect(typeof grande.aPersistencia().unidades).toBe('bigint');
    expect(BigInt(Number(grande.aPersistencia().unidades))).not.toBe(
      grande.aPersistencia().unidades,
    ); // demostración de la pérdida
  });

  it('calcularVenta sobre un neto enorme es exacta', () => {
    const neto = Money.desdeUnidades(10n ** 18n, 'COP');
    const venta = calcularVenta(neto, con({ redondeoVenta: 0 }));
    expect(venta.aPersistencia().unidades).toBe(12n * 10n ** 17n);
  });

  it('redondearA con un importe inseguro no lanza ni pierde precisión', () => {
    const grande = Money.desdeUnidades(10n ** 18n + 499n, 'COP');
    expect(redondearA(grande, 1000).aPersistencia().unidades).toBe(10n ** 18n);
  });
});

describe('Redondeo en COP (0 decimales) y USD (2)', () => {
  it('COP no admite decimales al construir', () => {
    expect(() => cop('100.5')).toThrow(ImporteInvalidoError);
    expect(() => cop('100.0')).toThrow(ImporteInvalidoError); // incluso .0 se rechaza
  });

  it('USD admite hasta 2 decimales y rechaza 3', () => {
    expect(usd('10.5').aDecimal()).toBe('10.50');
    expect(usd('10').aDecimal()).toBe('10.00');
    expect(() => usd('10.005')).toThrow(ImporteInvalidoError);
  });

  it('aplicarPorcentaje en COP redondea medio hacia arriba al peso', () => {
    expect(cop('5').aplicarPorcentaje(10).aDecimal()).toBe('1'); // 0,5 -> 1
    expect(cop('4').aplicarPorcentaje(10).aDecimal()).toBe('0'); // 0,4 -> 0
    expect(cop('14').aplicarPorcentaje(10).aDecimal()).toBe('1'); // 1,4 -> 1
    expect(cop('15').aplicarPorcentaje(10).aDecimal()).toBe('2'); // 1,5 -> 2
  });

  it('aplicarPorcentaje en USD redondea medio hacia arriba al centavo', () => {
    expect(usd('0.05').aplicarPorcentaje(10).aDecimal()).toBe('0.01'); // 0,5 centavos -> 1
    expect(usd('0.04').aplicarPorcentaje(10).aDecimal()).toBe('0.00');
    expect(usd('19.99').aplicarPorcentaje(15).aDecimal()).toBe('3.00'); // 2,9985 -> 3,00
  });

  it('el redondeo medio es simétrico en magnitud para negativos (se aleja de cero)', () => {
    expect(cop('-5').aplicarPorcentaje(10).aDecimal()).toBe('-1');
    expect(cop('5').aplicarPorcentaje(-10).aDecimal()).toBe('-1');
  });

  it('un porcentaje distinto de 0 que redondearía a 0 milésimas se rechaza (T-218)', () => {
    expect(() => cop('1000000').aplicarPorcentaje(0.0004)).toThrow(ImporteInvalidoError);
    expect(() => cop('1000000').aplicarPorcentaje(-0.0004)).toThrow(ImporteInvalidoError);
    expect(() => cop('1000000').aplicarMarkup(0.0004)).toThrow(ImporteInvalidoError);
    expect(() => calcularVenta(cop('1000000'), con({ porcentaje: 0.0004 }))).toThrow(
      ImporteInvalidoError,
    );
    expect(cop('1000000').aplicarPorcentaje(0).esCero()).toBe(true); // el cero sí es válido
    expect(cop('1000000').aplicarPorcentaje(0.0005).aDecimal()).toBe('10'); // 0,0005 sube a 0,001 %
  });

  it('calcularVenta en USD con redondeoVenta en centavos: paso 100 = al dólar', () => {
    const venta = calcularVenta(usd('83.33'), con({ porcentaje: 20, redondeoVenta: 100 }));
    expect(venta.aDecimal()).toBe('100.00'); // 99,996 -> 9999,6 centavos -> 10000
  });

  it('el redondeo por defecto depende de la moneda: USD/EUR paso 100 = una unidad (T-218)', () => {
    expect(politicaPorDefecto('COP').redondeoVenta).toBe(1000);
    expect(politicaPorDefecto('USD').redondeoVenta).toBe(100);
    expect(politicaPorDefecto('EUR').redondeoVenta).toBe(100);
    const venta = calcularVenta(usd('103.00'), politicaPorDefecto('USD'));
    expect(venta.aDecimal()).toBe('124.00'); // 123,60 -> 124, no 120
  });

  it('redondearA rechaza pasos negativos o no enteros', () => {
    expect(() => redondearA(cop('1000'), -1)).toThrow(ImporteInvalidoError);
    expect(() => redondearA(cop('1000'), 0.5)).toThrow(ImporteInvalidoError);
  });

  it('redondearA medio exacto sube (también en negativos, alejándose de cero)', () => {
    expect(redondearA(cop('1500'), 1000).aDecimal()).toBe('2000');
    expect(redondearA(cop('-1500'), 1000).aDecimal()).toBe('-2000');
    expect(redondearA(cop('1499'), 1000).aDecimal()).toBe('1000');
  });

  it('SOBRE_LA_VENTA redondea el cociente antes del paso: 100 / 0,8 = 125 exactos', () => {
    expect(
      calcularVenta(cop('100'), con({ base: 'SOBRE_LA_VENTA', redondeoVenta: 0 })).aDecimal(),
    ).toBe('125');
    // 100 / 0,7 = 142,857 -> 143
    expect(
      calcularVenta(
        cop('100'),
        con({ base: 'SOBRE_LA_VENTA', porcentaje: 30, redondeoVenta: 0 }),
      ).aDecimal(),
    ).toBe('143');
  });

  it('aDecimal de importes negativos menores a una unidad mayor en USD', () => {
    expect(Money.desdeUnidades(-5, 'USD').aDecimal()).toBe('-0.05');
    expect(Money.desdeUnidades(5, 'USD').aDecimal()).toBe('0.05');
  });
});
