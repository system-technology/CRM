import type { VersionDeCotizacion } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  fechaEnEspanol,
  formatearDinero,
  TextoDeCotizacionDemasiadoLargoError,
  textoDeCotizacionParaWhatsapp,
} from './texto-de-cotizacion-whatsapp.js';

const ID = '01932000-0000-7000-8000-000000000001';

function version(sobre: Partial<VersionDeCotizacion> = {}): VersionDeCotizacion {
  return {
    id: ID,
    numero: 1,
    creadaEn: '2026-10-27T10:00:00.000Z',
    paqueteId: ID,
    paqueteNombre: 'San Andrés todo incluido',
    destino: 'San Andrés',
    noches: 3,
    fechaSalida: '2026-12-15',
    vigenciaId: ID,
    vigenciaDesde: '2026-12-01',
    vigenciaHasta: '2026-12-31',
    deSalidaProgramada: false,
    adultos: 2,
    ninos: 1,
    infantes: 0,
    acomodacion: null,
    lineas: [
      {
        tarifaId: ID,
        nombre: 'Adulto',
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        veces: 2,
        precioUnitario: { unidades: '1200000', moneda: 'COP' },
        total: { unidades: '2400000', moneda: 'COP' },
        masBarata: true,
      },
    ],
    venta: { unidades: '2400000', moneda: 'COP' },
    vigenteHasta: null,
    ...sobre,
  };
}

describe('formatearDinero (es-CO)', () => {
  it('COP: la unidad mínima es el peso, miles con punto', () => {
    expect(formatearDinero({ unidades: '2400000', moneda: 'COP' })).toBe('$ 2.400.000');
    expect(formatearDinero({ unidades: '950', moneda: 'COP' })).toBe('$ 950');
  });

  it('USD: la unidad mínima es el centavo, decimal con coma', () => {
    expect(formatearDinero({ unidades: '123456', moneda: 'USD' })).toBe('US$ 1.234,56');
    expect(formatearDinero({ unidades: '5', moneda: 'USD' })).toBe('US$ 0,05');
  });

  it('no pierde precisión con enteros grandes', () => {
    expect(formatearDinero({ unidades: '9007199254740993', moneda: 'COP' })).toBe(
      '$ 9.007.199.254.740.993',
    );
  });
});

describe('fechaEnEspanol', () => {
  it('escribe el mes en español sin pasar por Date (sin corrimiento de huso)', () => {
    expect(fechaEnEspanol('2026-12-05')).toBe('5 de diciembre de 2026');
    expect(fechaEnEspanol('2027-01-01')).toBe('1 de enero de 2027');
  });
});

describe('textoDeCotizacionParaWhatsapp', () => {
  it('incluye producto, fecha, pasajeros, detalle y total', () => {
    const t = textoDeCotizacionParaWhatsapp(version(), []);
    expect(t).toContain('*Cotización: San Andrés todo incluido*');
    expect(t).toContain('Destino: San Andrés · 3 noches');
    expect(t).toContain('Fecha de salida: 15 de diciembre de 2026');
    expect(t).toContain('Pasajeros: 2 adultos, 1 niño');
    expect(t).toContain('• Adulto × 2: $ 2.400.000');
    expect(t).toContain('*Total: $ 2.400.000 COP*');
    expect(t).not.toContain('No incluido');
    expect(t).not.toContain('vigente hasta');
  });

  it('pone los cargos en destino aparte, bajo «No incluido», y no los suma', () => {
    const t = textoDeCotizacionParaWhatsapp(version(), [
      {
        concepto: 'Tasa de turismo',
        monto: { unidades: '120000', moneda: 'COP' },
        unidad: 'POR_PERSONA',
      },
      { concepto: 'Impuesto de muelle', monto: null, unidad: 'POR_GRUPO', nota: 'se confirma' },
    ]);
    expect(t).toContain('*No incluido (se paga en destino)*');
    expect(t).toContain('• Tasa de turismo: $ 120.000 por persona');
    expect(t).toContain('• Impuesto de muelle: monto por confirmar (se confirma)');
    expect(t).toContain('*Total: $ 2.400.000 COP*');
    expect(t.indexOf('No incluido')).toBeGreaterThan(t.indexOf('*Total'));
  });

  it('incluye la vigencia de la oferta cuando existe', () => {
    const t = textoDeCotizacionParaWhatsapp(version({ vigenteHasta: '2026-11-30' }), []);
    expect(t).toContain('Precio vigente hasta el 30 de noviembre de 2026.');
  });

  it('nunca filtra neto, margen ni política aunque vengan en la versión', () => {
    const t = textoDeCotizacionParaWhatsapp(
      version({
        neto: { unidades: '2000000', moneda: 'COP' },
        margen: { unidades: '400000', moneda: 'COP' },
        politica: {
          porcentaje: 20,
          base: 'SOBRE_EL_NETO',
          origenDeLaVenta: 'DERIVADA_DEL_NETO',
          redondeoVenta: 0,
        },
      }),
      [],
    );
    expect(t).not.toMatch(/neto|margen|(?<![\d.])2\.000\.000|(?<![\d.])400\.000|SOBRE_EL/i);
  });

  it('un texto que excede el tope de WhatsApp lanza un error tipado', () => {
    const muchas = Array.from({ length: 200 }, (_, i) => ({
      concepto: `Cargo número ${i} con un nombre largo para llenar el mensaje`,
      monto: null,
      unidad: 'POR_PERSONA' as const,
    }));
    expect(() => textoDeCotizacionParaWhatsapp(version(), muchas)).toThrow(
      TextoDeCotizacionDemasiadoLargoError,
    );
  });
});
