/**
 * Pruebas de las piezas compartidas de los contratos.
 *
 * Estos esquemas son el borde del sistema: todo lo que entra por la API y todo lo que la web
 * recibe pasa por aquí. Un cambio accidental en uno de ellos no rompe la compilación —Zod se
 * construye en tiempo de ejecución— así que sin pruebas nadie se entera hasta producción.
 */

import { describe, expect, it } from 'vitest';
import {
  ComposicionPasajeros,
  Dinero,
  ErrorApi,
  FechaViaje,
  ParametrosPagina,
  TelefonoE164,
  pagina,
} from './comunes.js';
import { z } from 'zod';

describe('Dinero', () => {
  it('acepta un entero en texto con su moneda', () => {
    expect(Dinero.parse({ unidades: '9100000', moneda: 'COP' })).toEqual({
      unidades: '9100000',
      moneda: 'COP',
    });
  });

  it('acepta importes mayores que el entero seguro de JavaScript', () => {
    // Es exactamente la razón de que `unidades` viaje como cadena: 9.007.199.254.740.993
    // centavos no sobrevive a un `number`. En pesos colombianos no es una cifra absurda.
    const enorme = '9007199254740993';
    expect(Dinero.parse({ unidades: enorme, moneda: 'COP' }).unidades).toBe(enorme);
  });

  it('rechaza decimales: el importe va en la unidad mínima', () => {
    expect(Dinero.safeParse({ unidades: '91000.50', moneda: 'COP' }).success).toBe(false);
  });

  it('rechaza un número donde se espera texto', () => {
    expect(Dinero.safeParse({ unidades: 9100000, moneda: 'COP' }).success).toBe(false);
  });

  it('acepta importes negativos: un ajuste o una nota crédito lo es', () => {
    expect(Dinero.safeParse({ unidades: '-50000', moneda: 'COP' }).success).toBe(true);
  });

  it('rechaza una moneda fuera de la lista', () => {
    expect(Dinero.safeParse({ unidades: '1000', moneda: 'ARS' }).success).toBe(false);
  });
});

describe('TelefonoE164', () => {
  it('acepta un móvil colombiano', () => {
    expect(TelefonoE164.parse('+573001234567')).toBe('+573001234567');
  });

  it.each([
    ['sin el prefijo +', '573001234567'],
    ['con espacios', '+57 300 1234567'],
    ['con guiones', '+57-300-1234567'],
    ['empezando por cero tras el +', '+0573001234567'],
    ['demasiado corto', '+571'],
  ])('rechaza %s', (_caso, valor) => {
    expect(TelefonoE164.safeParse(valor).success).toBe(false);
  });
});

describe('FechaViaje', () => {
  it('acepta AAAA-MM-DD', () => {
    expect(FechaViaje.parse('2026-12-24')).toBe('2026-12-24');
  });

  it('rechaza una marca de tiempo completa: una fecha de viaje no tiene hora', () => {
    expect(FechaViaje.safeParse('2026-12-24T00:00:00Z').success).toBe(false);
  });
});

describe('ComposicionPasajeros', () => {
  it('completa niños e infantes cuando no vienen', () => {
    expect(ComposicionPasajeros.parse({ adultos: 2 })).toEqual({
      adultos: 2,
      ninos: 0,
      infantes: 0,
    });
  });

  it('exige al menos un adulto', () => {
    const r = ComposicionPasajeros.safeParse({ adultos: 0, ninos: 2 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain('al menos un adulto');
  });

  it('no permite más infantes que adultos, y lo señala en el campo correcto', () => {
    const r = ComposicionPasajeros.safeParse({ adultos: 1, infantes: 2 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['infantes']);
  });

  it('permite tantos infantes como adultos', () => {
    expect(ComposicionPasajeros.safeParse({ adultos: 2, infantes: 2 }).success).toBe(true);
  });

  it('rechaza cantidades fraccionarias', () => {
    expect(ComposicionPasajeros.safeParse({ adultos: 1.5 }).success).toBe(false);
  });
});

describe('ParametrosPagina', () => {
  it('usa 25 como límite por defecto', () => {
    expect(ParametrosPagina.parse({}).limite).toBe(25);
  });

  it('tope en 100: el límite lo fija el servidor, no quien llama', () => {
    expect(ParametrosPagina.safeParse({ limite: 500 }).success).toBe(false);
  });
});

describe('pagina()', () => {
  it('envuelve cualquier elemento conservando la forma del cursor', () => {
    const esquema = pagina(z.object({ id: z.string() }));
    expect(
      esquema.parse({ datos: [{ id: 'a' }], pageInfo: { nextCursor: null, hasMore: false } }),
    ).toEqual({ datos: [{ id: 'a' }], pageInfo: { nextCursor: null, hasMore: false } });
  });
});

describe('ErrorApi', () => {
  it('acepta el sobre con detalles opcionales', () => {
    expect(
      ErrorApi.safeParse({ error: { code: 'SIN_TARIFA', message: 'No hay tarifa' } }).success,
    ).toBe(true);
  });

  it('rechaza un cuerpo sin el sobre: es lo que distingue un error nuestro de un 502 ajeno', () => {
    expect(ErrorApi.safeParse({ code: 'SIN_TARIFA', message: 'No hay tarifa' }).success).toBe(
      false,
    );
  });

  it('rechaza null, que es lo que devuelve un cuerpo vacío', () => {
    expect(ErrorApi.safeParse(null).success).toBe(false);
  });
});
