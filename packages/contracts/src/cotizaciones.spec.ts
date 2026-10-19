import { describe, expect, it } from 'vitest';
import { AnadirVersionACotizacion, GuardarCotizacion } from './cotizaciones.js';

const ID = '01932000-0000-7000-8000-000000000001';
const valido = {
  contactoId: ID,
  titulo: 'San Andrés para dos',
  version: { paqueteId: ID, fecha: '2027-03-15', adultos: 2 },
};

describe('GuardarCotizacion', () => {
  it('acepta la composición y nada más', () => {
    expect(GuardarCotizacion.safeParse(valido).success).toBe(true);
  });

  it('rechaza importes: el servidor recalcula, el cliente no fija el precio', () => {
    const conTotal = {
      ...valido,
      version: { ...valido.version, total: { unidades: '1', moneda: 'COP' } },
    };
    expect(GuardarCotizacion.safeParse(conTotal).success).toBe(false);
    expect(GuardarCotizacion.safeParse({ ...valido, venta: '1' }).success).toBe(false);
  });

  it('exige título no vacío y una fecha AAAA-MM-DD', () => {
    expect(GuardarCotizacion.safeParse({ ...valido, titulo: '  ' }).success).toBe(false);
    expect(
      GuardarCotizacion.safeParse({
        ...valido,
        version: { ...valido.version, fecha: '15/03/2027' },
      }).success,
    ).toBe(false);
  });
});

describe('AnadirVersionACotizacion', () => {
  it('es la misma composición, y también rechaza importes', () => {
    expect(AnadirVersionACotizacion.safeParse(valido.version).success).toBe(true);
    expect(AnadirVersionACotizacion.safeParse({ ...valido.version, venta: '1' }).success).toBe(
      false,
    );
  });
});
