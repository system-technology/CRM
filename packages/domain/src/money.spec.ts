import { describe, expect, it } from 'vitest';
import {
  ImporteInvalidoError,
  MonedaInvalidaError,
  MonedasIncompatiblesError,
  Money,
} from './money.js';

describe('Money', () => {
  describe('construcción', () => {
    it('acepta unidades enteras', () => {
      expect(Money.desdeUnidades(150_000, 'COP').aDecimal()).toBe('150000');
      expect(Money.desdeUnidades(1234, 'USD').aDecimal()).toBe('12.34');
    });

    it('rechaza unidades con decimales, porque la unidad mínima es entera por definición', () => {
      expect(() => Money.desdeUnidades(12.5, 'USD')).toThrow(ImporteInvalidoError);
    });

    it('rechaza una moneda no habilitada', () => {
      expect(() => Money.desdeUnidades(100, 'BTC')).toThrow(MonedaInvalidaError);
    });

    it('convierte decimal a unidades según los decimales de la moneda', () => {
      expect(Money.desdeDecimal('12.34', 'USD').unidades).toBe(1234n);
      expect(Money.desdeDecimal('150000', 'COP').unidades).toBe(150_000n);
      expect(Money.desdeDecimal('12.3', 'USD').unidades).toBe(1230n);
    });

    it('rechaza más decimales de los que admite la moneda, en vez de redondear en silencio', () => {
      // Redondear es una decisión de negocio. Si la tomamos nosotros sin avisar,
      // el tarifario y la cotización dejan de cuadrar y nadie sabe por qué.
      expect(() => Money.desdeDecimal('12.345', 'USD')).toThrow(ImporteInvalidoError);
      expect(() => Money.desdeDecimal('150000.50', 'COP')).toThrow(ImporteInvalidoError);
    });

    it('acepta importes negativos: un margen puede ser negativo y hay que poder expresarlo', () => {
      const perdida = Money.desdeDecimal('-50.00', 'USD');
      expect(perdida.esNegativo()).toBe(true);
      expect(perdida.aDecimal()).toBe('-50.00');
    });
  });

  describe('aritmética', () => {
    it('suma y resta dentro de la misma moneda', () => {
      const a = Money.desdeDecimal('100.00', 'USD');
      const b = Money.desdeDecimal('25.50', 'USD');
      expect(a.sumar(b).aDecimal()).toBe('125.50');
      expect(a.restar(b).aDecimal()).toBe('74.50');
    });

    it('se niega a operar monedas distintas sin conversión explícita', () => {
      const pesos = Money.desdeDecimal('150000', 'COP');
      const dolares = Money.desdeDecimal('40.00', 'USD');
      expect(() => pesos.sumar(dolares)).toThrow(MonedasIncompatiblesError);
    });

    it('no acumula error de coma flotante al sumar muchas veces', () => {
      // El caso que motiva toda esta clase: 0.1 + 0.2 !== 0.3 en coma flotante.
      let total = Money.cero('USD');
      for (let i = 0; i < 10; i++) total = total.sumar(Money.desdeDecimal('0.10', 'USD'));
      expect(total.aDecimal()).toBe('1.00');
      expect(total.igualA(Money.desdeDecimal('1.00', 'USD'))).toBe(true);
    });

    it('multiplica por una cantidad entera de pasajeros', () => {
      const porPersona = Money.desdeDecimal('1250000', 'COP');
      expect(porPersona.porCantidad(4).aDecimal()).toBe('5000000');
    });

    it('rechaza una cantidad fraccionaria: no existen 2,5 pasajeros', () => {
      expect(() => Money.desdeDecimal('100.00', 'USD').porCantidad(2.5)).toThrow(
        ImporteInvalidoError,
      );
    });
  });

  describe('markup y porcentajes', () => {
    it('aplica un markup del 20% sobre la tarifa neta', () => {
      const neta = Money.desdeDecimal('1000000', 'COP');
      expect(neta.aplicarMarkup(20).aDecimal()).toBe('1200000');
    });

    it('admite porcentajes con decimales, como 12,5%', () => {
      const neta = Money.desdeDecimal('1000000', 'COP');
      expect(neta.aplicarPorcentaje(12.5).aDecimal()).toBe('125000');
    });

    it('redondea medio hacia arriba, que es lo que espera un comercial', () => {
      // 1005 * 10% = 100.5 unidades → 101, no 100.
      expect(Money.desdeUnidades(1005, 'COP').aplicarPorcentaje(10).unidades).toBe(101n);
    });

    it('calcula el margen como venta menos costo neto', () => {
      const neto = Money.desdeDecimal('4200000', 'COP');
      const venta = Money.desdeDecimal('4950000', 'COP');
      expect(venta.restar(neto).aDecimal()).toBe('750000');
    });
  });

  describe('persistencia', () => {
    it('devuelve unidades y moneda para las columnas de la base', () => {
      const { unidades, moneda } = Money.desdeDecimal('4950000', 'COP').aPersistencia();
      expect(unidades).toBe(4_950_000n);
      expect(moneda).toBe('COP');
    });

    it('sobrevive al viaje de ida y vuelta sin perder precisión', () => {
      const original = Money.desdeDecimal('1234567.89', 'USD');
      const { unidades, moneda } = original.aPersistencia();
      expect(Money.desdeUnidades(unidades, moneda).igualA(original)).toBe(true);
    });

    it('soporta importes por encima del entero seguro de JavaScript', () => {
      // Un tour operador grande factura miles de millones de pesos al año.
      const enorme = Money.desdeUnidades(9_007_199_254_740_993n, 'COP');
      expect(enorme.sumar(Money.desdeUnidades(1n, 'COP')).unidades).toBe(9_007_199_254_740_994n);
    });
  });
});
