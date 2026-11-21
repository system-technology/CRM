import { describe, expect, it } from 'vitest';
import {
  FijarParametrosDeCobro,
  FijarPlazoDeCobro,
  IdEnMinusculas,
  RegistrarMovimiento,
  ReversarMovimiento,
  contieneNumeroDeTarjeta,
} from './cobros.js';

const CLAVE = '01932000-0000-7000-8000-0000000000aa';
const PAGO = {
  tipo: 'PAGO',
  claveIdempotencia: CLAVE,
  monto: { unidades: '800000', moneda: 'COP' },
  pagadoEl: '2027-01-10',
  medio: 'TRANSFERENCIA',
};

describe('contieneNumeroDeTarjeta (Luhn)', () => {
  it('detecta una tarjeta de prueba, con espacios, guiones y puntos', () => {
    expect(contieneNumeroDeTarjeta('4111111111111111')).toBe(true);
    expect(contieneNumeroDeTarjeta('4111 1111 1111 1111')).toBe(true);
    expect(contieneNumeroDeTarjeta('4111-1111-1111-1111')).toBe(true);
    expect(contieneNumeroDeTarjeta('4111.1111.1111.1111')).toBe(true);
    expect(contieneNumeroDeTarjeta('paga con 4111 1111 1111 1111 el viernes')).toBe(true);
  });
  it('detecta los largos de 13 y 19 dígitos', () => {
    expect(contieneNumeroDeTarjeta('4222222222222')).toBe(true); // 13, Visa antigua
    expect(contieneNumeroDeTarjeta('6200000000000000000')).toBe(true); // 19, Luhn válido
  });
  it('no marca lo que no pasa Luhn ni lo corto', () => {
    expect(contieneNumeroDeTarjeta('4111111111111112')).toBe(false);
    expect(contieneNumeroDeTarjeta('41111111111111111111')).toBe(false); // 20 dígitos: no es una tarjeta
    expect(contieneNumeroDeTarjeta('411111111111')).toBe(false); // 12 dígitos
    expect(contieneNumeroDeTarjeta('Transferencia Bancolombia ref 8842193')).toBe(false);
    expect(contieneNumeroDeTarjeta('')).toBe(false);
  });
});

describe('RegistrarMovimiento', () => {
  it('acepta un pago mínimo', () => {
    expect(RegistrarMovimiento.parse(PAGO).tipo).toBe('PAGO');
  });

  it('rechaza claves que el cliente nunca manda (strict), una por una', () => {
    for (const extra of [
      { registradoPor: CLAVE },
      { registradoEn: '2027-01-10T00:00:00Z' },
      { tenantId: CLAVE },
      { saldo: '0' },
      { travelFileId: CLAVE },
    ]) {
      expect(RegistrarMovimiento.safeParse({ ...PAGO, ...extra }).success).toBe(false);
    }
  });

  it('no admite REVERSO por esta ruta ni un tipo desconocido', () => {
    expect(RegistrarMovimiento.safeParse({ ...PAGO, tipo: 'REVERSO' }).success).toBe(false);
    expect(RegistrarMovimiento.safeParse({ ...PAGO, tipo: 'OTRO' }).success).toBe(false);
  });

  it('el monto es entero positivo en texto: sin decimales, sin cero, sin signo, sin number', () => {
    for (const unidades of ['0', '-5', '12.5', '1e3', '', '0100', '1000000000000000']) {
      expect(
        RegistrarMovimiento.safeParse({ ...PAGO, monto: { unidades, moneda: 'COP' } }).success,
        unidades,
      ).toBe(false);
    }
    expect(
      RegistrarMovimiento.safeParse({ ...PAGO, monto: { unidades: 800000, moneda: 'COP' } })
        .success,
    ).toBe(false);
    expect(
      RegistrarMovimiento.safeParse({
        ...PAGO,
        monto: { unidades: '999999999999999', moneda: 'COP' },
      }).success,
    ).toBe(true);
  });

  it('el medio es uno de los 8 del catálogo', () => {
    for (const medio of [
      'TRANSFERENCIA',
      'EFECTIVO',
      'TARJETA',
      'CONSIGNACION',
      'BILLETERA_DIGITAL',
      'PSE',
      'LINK_DE_PAGO',
      'OTRO',
    ]) {
      expect(RegistrarMovimiento.safeParse({ ...PAGO, medio }).success, medio).toBe(true);
    }
    expect(RegistrarMovimiento.safeParse({ ...PAGO, medio: 'CHEQUE' }).success).toBe(false);
  });

  it('la clave de idempotencia es un uuid y es obligatoria', () => {
    expect(RegistrarMovimiento.safeParse({ ...PAGO, claveIdempotencia: 'abc' }).success).toBe(
      false,
    );
    const { claveIdempotencia: _quitada, ...sinClave } = PAGO;
    expect(RegistrarMovimiento.safeParse(sinClave).success).toBe(false);
  });

  it('rechaza una fecha que no existe en el calendario', () => {
    expect(RegistrarMovimiento.safeParse({ ...PAGO, pagadoEl: '2027-02-30' }).success).toBe(false);
  });

  it('rechaza una tarjeta en nota y en referencia sin repetir el valor en el error', () => {
    for (const campo of ['nota', 'referencia']) {
      const r = RegistrarMovimiento.safeParse({ ...PAGO, [campo]: 'tarjeta 4111 1111 1111 1111' });
      expect(r.success).toBe(false);
      if (!r.success) {
        const texto = JSON.stringify(r.error.issues);
        expect(texto).not.toContain('4111');
        expect(r.error.issues[0]?.path).toEqual([campo]);
      }
    }
  });

  it('la devolución no lleva pagador ni sobrepago; el ajuste admite signo y exige motivo', () => {
    const devolucion = {
      tipo: 'DEVOLUCION',
      claveIdempotencia: CLAVE,
      monto: { unidades: '100', moneda: 'COP' },
      pagadoEl: '2027-01-10',
      medio: 'EFECTIVO',
    };
    expect(RegistrarMovimiento.safeParse(devolucion).success).toBe(true);
    expect(RegistrarMovimiento.safeParse({ ...devolucion, pagadorId: CLAVE }).success).toBe(false);
    const ajuste = {
      tipo: 'AJUSTE',
      claveIdempotencia: CLAVE,
      monto: { unidades: '-50000', moneda: 'COP' },
      motivo: 'Descuento por cliente frecuente',
    };
    expect(RegistrarMovimiento.safeParse(ajuste).success).toBe(true);
    expect(RegistrarMovimiento.safeParse({ ...ajuste, motivo: undefined }).success).toBe(false);
    expect(RegistrarMovimiento.safeParse({ ...ajuste, motivo: '   ' }).success).toBe(false);
    expect(
      RegistrarMovimiento.safeParse({ ...ajuste, monto: { unidades: '0', moneda: 'COP' } }).success,
    ).toBe(false);
  });

  it('la penalidad es positiva y con motivo', () => {
    const p = {
      tipo: 'PENALIDAD',
      claveIdempotencia: CLAVE,
      monto: { unidades: '300000', moneda: 'COP' },
      motivo: 'Cancelación a 10 días',
    };
    expect(RegistrarMovimiento.safeParse(p).success).toBe(true);
    expect(
      RegistrarMovimiento.safeParse({ ...p, monto: { unidades: '-1', moneda: 'COP' } }).success,
    ).toBe(false);
  });
});

describe('otros cuerpos', () => {
  it('reverso: clave y motivo, nada más', () => {
    expect(
      ReversarMovimiento.safeParse({ claveIdempotencia: CLAVE, motivo: 'Error' }).success,
    ).toBe(true);
    expect(ReversarMovimiento.safeParse({ claveIdempotencia: CLAVE }).success).toBe(false);
    expect(
      ReversarMovimiento.safeParse({ claveIdempotencia: CLAVE, motivo: 'x', monto: {} }).success,
    ).toBe(false);
    expect(
      ReversarMovimiento.safeParse({ claveIdempotencia: CLAVE, motivo: 'x', registradoPor: CLAVE })
        .success,
    ).toBe(false);
  });

  it('plazo: fecha real, motivo opcional, sin extras', () => {
    expect(FijarPlazoDeCobro.safeParse({ venceEl: '2027-02-20' }).success).toBe(true);
    expect(FijarPlazoDeCobro.safeParse({ venceEl: '2027-02-31' }).success).toBe(false);
    expect(FijarPlazoDeCobro.safeParse({ venceEl: '2027-02-20', registradoEn: 'x' }).success).toBe(
      false,
    );
  });

  it('parámetros: entero entre 0 y 365', () => {
    for (const d of [0, 30, 365]) {
      expect(FijarParametrosDeCobro.safeParse({ diasPlazoDeCobro: d }).success).toBe(true);
    }
    for (const d of [-1, 366, 1.5, '30']) {
      expect(FijarParametrosDeCobro.safeParse({ diasPlazoDeCobro: d }).success).toBe(false);
    }
  });
});

describe('uuid en minúsculas (un reintento con mayúsculas es el mismo)', () => {
  const MAYUS = 'ABCDEF00-0000-7000-8000-0000000000AA';
  it('IdEnMinusculas normaliza y sigue rechazando lo que no es uuid', () => {
    expect(IdEnMinusculas.parse(MAYUS)).toBe(MAYUS.toLowerCase());
    expect(IdEnMinusculas.safeParse('no-es-uuid').success).toBe(false);
  });
  it('la clave y el pagador del cuerpo salen en minúsculas', () => {
    const r = RegistrarMovimiento.parse({ ...PAGO, claveIdempotencia: MAYUS, pagadorId: MAYUS });
    expect(r.claveIdempotencia).toBe(MAYUS.toLowerCase());
    expect(r.tipo === 'PAGO' && r.pagadorId).toBe(MAYUS.toLowerCase());
    expect(
      ReversarMovimiento.parse({ claveIdempotencia: MAYUS, motivo: 'x' }).claveIdempotencia,
    ).toBe(MAYUS.toLowerCase());
  });
});
