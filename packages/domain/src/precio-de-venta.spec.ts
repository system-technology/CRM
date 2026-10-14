import { describe, expect, it } from 'vitest';
import { Money } from './money.js';
import {
  POLITICA_POR_DEFECTO,
  type PoliticaDePrecio,
  calcularMargen,
  calcularVenta,
  derivarNeto,
  redondearA,
} from './precio-de-venta.js';

const cop = (valor: string) => Money.desdeDecimal(valor, 'COP');
const con = (cambios: Partial<PoliticaDePrecio>): PoliticaDePrecio => ({
  ...POLITICA_POR_DEFECTO,
  ...cambios,
});

describe('Las dos lecturas de «margen del 20 %»', () => {
  // Esta es la prueba que justifica que `base` exista. Si alguien la borra porque «es obvio»,
  // que lea primero la diferencia en pesos de la tercera aserción.
  const NETO = cop('1000000');

  it('sobre el neto —«le subo el 20 %»— da 1.200.000', () => {
    expect(calcularVenta(NETO, con({ base: 'SOBRE_EL_NETO' })).aDecimal()).toBe('1200000');
  });

  it('sobre la venta —«me deja el 20 %»— da 1.250.000', () => {
    expect(calcularVenta(NETO, con({ base: 'SOBRE_LA_VENTA' })).aDecimal()).toBe('1250000');
  });

  it('la diferencia son 50.000 pesos por silla', () => {
    const porNeto = calcularVenta(NETO, con({ base: 'SOBRE_EL_NETO' }));
    const porVenta = calcularVenta(NETO, con({ base: 'SOBRE_LA_VENTA' }));
    expect(porVenta.restar(porNeto).aDecimal()).toBe('50000');
  });

  it('el valor por defecto es 20 % sobre el neto, que es la instrucción del propietario', () => {
    expect(POLITICA_POR_DEFECTO.porcentaje).toBe(20);
    expect(POLITICA_POR_DEFECTO.base).toBe('SOBRE_EL_NETO');
  });
});

describe('El redondeo de la venta', () => {
  it('lleva al múltiplo más cercano, medio hacia arriba', () => {
    expect(redondearA(cop('1236432'), 1000).aDecimal()).toBe('1236000');
    expect(redondearA(cop('1236500'), 1000).aDecimal()).toBe('1237000');
  });

  it('con paso 0 o 1 no toca el importe', () => {
    expect(redondearA(cop('1236432'), 0).aDecimal()).toBe('1236432');
    expect(redondearA(cop('1236432'), 1).aDecimal()).toBe('1236432');
  });

  it('se aplica a la venta, de modo que ninguna hoja publique 1.236.432', () => {
    // 1.030.360 × 1,20 = 1.236.432, que nadie pone en un tarifario.
    const venta = calcularVenta(cop('1030360'), con({ redondeoVenta: 1000 }));
    expect(venta.aDecimal()).toBe('1236000');
  });

  it('el neto NO se redondea: es lo que cobra el mayorista', () => {
    expect(derivarNeto(cop('329000'), POLITICA_POR_DEFECTO).aDecimal()).toBe('274167');
  });
});

describe('Derivar el neto desde la venta', () => {
  // Para qué: la hoja del piloto trae precios de venta al público y seguimos esperando la de
  // netos del mayorista. Esto da un neto coherente para la semilla —y hay que marcarlo como
  // derivado, nunca como dato del mayorista.
  it('sobre el neto: 329.000 al 20 % implica 274.167', () => {
    expect(derivarNeto(cop('329000'), con({ base: 'SOBRE_EL_NETO' })).aDecimal()).toBe('274167');
  });

  it('sobre la venta: 329.000 al 20 % implica 263.200', () => {
    expect(derivarNeto(cop('329000'), con({ base: 'SOBRE_LA_VENTA' })).aDecimal()).toBe('263200');
  });

  it('ida y vuelta vuelve al precio publicado', () => {
    for (const publicado of ['329000', '569000', '185000', '9100000']) {
      const neto = derivarNeto(cop(publicado), POLITICA_POR_DEFECTO);
      expect(calcularVenta(neto, POLITICA_POR_DEFECTO).aDecimal()).toBe(publicado);
    }
  });
});

describe('El margen que se informa', () => {
  const NETO = cop('274167');
  const VENTA = cop('329000');

  it('sobre el neto son 20,00 %', () => {
    const margen = calcularMargen(NETO, VENTA, 'SOBRE_EL_NETO');
    expect(margen?.importe.aDecimal()).toBe('54833');
    expect(margen?.porcentaje).toBe(20);
  });

  it('el MISMO dinero sobre la venta son 16,67 %', () => {
    // No es un margen distinto: es el mismo, dicho con otro denominador. Por eso `base` viaja
    // junto al número — un porcentaje sin su base no significa nada.
    const margen = calcularMargen(NETO, VENTA, 'SOBRE_LA_VENTA');
    expect(margen?.importe.aDecimal()).toBe('54833');
    expect(margen?.porcentaje).toBe(16.67);
  });

  it('sin neto cargado el margen es DESCONOCIDO, no cero', () => {
    // Decir «margen $0» afirmaría que vendemos a precio de costo. La verdad es que no lo sabemos.
    expect(calcularMargen(null, VENTA, 'SOBRE_EL_NETO')).toBeNull();
  });

  it('con neto en cero informa el importe y deja el porcentaje sin calcular', () => {
    const margen = calcularMargen(Money.cero('COP'), VENTA, 'SOBRE_EL_NETO');
    expect(margen?.importe.aDecimal()).toBe('329000');
    expect(margen?.porcentaje).toBeNull();
  });
});

describe('Lo que no se acepta', () => {
  it('un margen negativo: vender bajo el neto es pérdida, no política', () => {
    expect(() => calcularVenta(cop('100000'), con({ porcentaje: -5 }))).toThrow(/negativo/i);
  });

  it('un 100 % sobre la venta, que no tiene precio finito', () => {
    expect(() => calcularVenta(cop('100000'), con({ base: 'SOBRE_LA_VENTA', porcentaje: 100 }))) //
      .toThrow(/finito/i);
  });

  it('un porcentaje que no es un número', () => {
    expect(() => calcularVenta(cop('100000'), con({ porcentaje: Number.NaN })).aDecimal()) //
      .toThrow();
  });
});

describe('La unidad mínima del peso colombiano', () => {
  it('es el PESO, no el centavo', () => {
    // Esta prueba nace de un error de dos órdenes de magnitud que llegó hasta la pantalla.
    expect(cop('1000000').aPersistencia().unidades).toBe(1_000_000n);
  });

  it('admite decimales en el porcentaje sin perder precisión', () => {
    // 12,5 % sobre 800.000 son exactamente 900.000.
    const venta = calcularVenta(cop('800000'), con({ porcentaje: 12.5, redondeoVenta: 0 }));
    expect(venta.aDecimal()).toBe('900000');
  });
});
