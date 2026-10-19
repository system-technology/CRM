import { describe, expect, it } from 'vitest';
import { calcularEjemploVivo, formatearPesosCop } from './politica-precio-logica';

describe('Lógica de Formación del Precio (politica-precio-logica.ts - 0c.15)', () => {
  it('con base SOBRE_EL_NETO y 20%, venta sobre $1.000.000 es exactamente $1.200.000', () => {
    const res = calcularEjemploVivo(1_000_000, {
      porcentaje: 20,
      base: 'SOBRE_EL_NETO',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
      admiteMargenPorTarifa: true,
    });

    expect(res.ventaUnidades).toBe(1_200_000);
    expect(res.ventaFormateada).toContain('1.200.000');
    expect(res.margenImporteFormateado).toContain('200.000');
    expect(res.explicacionFormula).toContain('1.000.000');
  });

  it('con base SOBRE_LA_VENTA y 20%, venta sobre $1.000.000 es exactamente $1.250.000', () => {
    const res = calcularEjemploVivo(1_000_000, {
      porcentaje: 20,
      base: 'SOBRE_LA_VENTA',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
      admiteMargenPorTarifa: true,
    });

    expect(res.ventaUnidades).toBe(1_250_000);
    expect(res.ventaFormateada).toContain('1.250.000');
    expect(res.margenImporteFormateado).toContain('250.000');
    expect(res.explicacionFormula).toContain('1.250.000');
  });

  it('cambiar de base mueve el ejemplo de $1.200.000 a $1.250.000 y calcula diferencia de $50.000 por silla', () => {
    const resNeto = calcularEjemploVivo(1_000_000, {
      porcentaje: 20,
      base: 'SOBRE_EL_NETO',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
      admiteMargenPorTarifa: true,
    });

    const resVenta = calcularEjemploVivo(1_000_000, {
      porcentaje: 20,
      base: 'SOBRE_LA_VENTA',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
      admiteMargenPorTarifa: true,
    });

    expect(resNeto.ventaUnidades).not.toBe(resVenta.ventaUnidades);
    expect(resVenta.ventaUnidades - resNeto.ventaUnidades).toBe(50_000);
    expect(resNeto.diferenciaSillaFormateada).toContain('50.000');
    expect(resNeto.diferenciaBus40Formateada).toContain('2.000.000');
  });

  it('formatea montos en pesos COP de forma limpia', () => {
    const txt = formatearPesosCop(1250000);
    expect(txt).toContain('1.250.000');
  });

  it('aplica redondeo a la venta correctamente (ej. múltiplos de 5.000)', () => {
    // Neto 1.000.000 con 18.33% sobre el neto = 1.183.300 -> redondeado a 5.000 = 1.185.000
    const res = calcularEjemploVivo(1_000_000, {
      porcentaje: 18.33,
      base: 'SOBRE_EL_NETO',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 5000,
      admiteMargenPorTarifa: true,
    });

    expect(res.ventaUnidades % 5000).toBe(0);
  });
});
