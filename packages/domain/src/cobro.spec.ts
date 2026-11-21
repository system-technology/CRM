import { describe, expect, it } from 'vitest';
import {
  calcularCobro,
  diasEntre,
  estadoDeCobro,
  fechaLimiteDeCobro,
  idsReversados,
  FechaDeCobroInvalidaError,
  DiasDePlazoInvalidosError,
  type MovimientoParaSaldo,
  esFechaDeCalendario,
  pagadoNeto,
  restarDias,
  saldoDelArchivo,
  situacionDelSaldo,
  sumasVigentes,
  SUMAS_EN_CERO,
  totalDelArchivo,
} from './cobro.js';
import { Money } from './money.js';

const mov = (
  id: string,
  tipo: MovimientoParaSaldo['tipo'],
  montoUnidades: bigint,
  reversoDeId: string | null = null,
): MovimientoParaSaldo => ({ id, tipo, montoUnidades, reversoDeId });

const cop = (n: bigint): Money => Money.desdeUnidades(n, 'COP');

describe('vigencia y sumas', () => {
  it('un movimiento reversado no cuenta, ni el reverso mueve dinero', () => {
    const movs = [
      mov('p1', 'PAGO', 500n),
      mov('p2', 'PAGO', 300n),
      mov('r1', 'REVERSO', 500n, 'p1'),
    ];
    expect(idsReversados(movs)).toEqual(new Set(['p1']));
    expect(sumasVigentes(movs)).toEqual({ ...SUMAS_EN_CERO, pagos: 300n });
  });

  it('suma cada tipo por separado y respeta el descuento negativo', () => {
    const s = sumasVigentes([
      mov('a', 'PAGO', 1_000n),
      mov('b', 'DEVOLUCION', 200n),
      mov('c', 'AJUSTE', 50n),
      mov('d', 'AJUSTE', -80n),
      mov('e', 'PENALIDAD', 300n),
    ]);
    expect(s).toEqual({ pagos: 1_000n, devoluciones: 200n, ajustes: -30n, penalidades: 300n });
  });

  it('reversar un descuento (monto negativo copiado) lo deja sin efecto', () => {
    const s = sumasVigentes([mov('d', 'AJUSTE', -80n), mov('r', 'REVERSO', -80n, 'd')]);
    expect(s.ajustes).toBe(0n);
  });

  it('sin movimientos, todo en cero', () => {
    expect(sumasVigentes([])).toEqual(SUMAS_EN_CERO);
  });
});

describe('total, pagado y saldo', () => {
  it('abierto: venta más ajustes vigentes', () => {
    const sumas = { ...SUMAS_EN_CERO, ajustes: -100n };
    expect(totalDelArchivo('ABIERTO', 1_000n, sumas, 'COP').unidades).toBe(900n);
  });

  it('cancelado: solo las penalidades; la venta y los ajustes dejan de exigirse', () => {
    const sumas = { ...SUMAS_EN_CERO, ajustes: 500n, penalidades: 250n };
    expect(totalDelArchivo('CANCELADO', 1_000n, sumas, 'COP').unidades).toBe(250n);
  });

  it('pagado es pagos menos devoluciones', () => {
    expect(pagadoNeto({ ...SUMAS_EN_CERO, pagos: 700n, devoluciones: 200n }, 'COP').unidades).toBe(
      500n,
    );
  });

  it('un archivo cancelado cierra en cero cuando lo pagado menos lo devuelto iguala la penalidad', () => {
    const sumas = { pagos: 1_000n, devoluciones: 700n, ajustes: 0n, penalidades: 300n };
    const total = totalDelArchivo('CANCELADO', 5_000n, sumas, 'COP');
    const saldo = saldoDelArchivo(total, pagadoNeto(sumas, 'COP'));
    expect(saldo.unidades).toBe(0n);
    expect(situacionDelSaldo(total, pagadoNeto(sumas, 'COP'))).toBe('PAGADO');
  });

  it('cancelado con pagos y sin devolver: saldo negativo (pagado sin devolver)', () => {
    const sumas = { ...SUMAS_EN_CERO, pagos: 1_000n };
    const total = totalDelArchivo('CANCELADO', 5_000n, sumas, 'COP');
    expect(saldoDelArchivo(total, pagadoNeto(sumas, 'COP')).unidades).toBe(-1_000n);
  });

  it('COP va en pesos: 1.500.000 pesos son 1500000 unidades, no 150000000', () => {
    const total = totalDelArchivo('ABIERTO', 1_500_000n, SUMAS_EN_CERO, 'COP');
    expect(total.aDecimal()).toBe('1500000');
  });

  it('USD va en centavos', () => {
    const total = totalDelArchivo('ABIERTO', 150_000n, SUMAS_EN_CERO, 'USD');
    expect(total.aDecimal()).toBe('1500.00');
  });

  it('enteros cerca de 10^15 sin perder precisión (la suma de 3 movimientos supera 2^53)', () => {
    const tope = 999_999_999_999_999n;
    const movs = [mov('a', 'PAGO', tope), mov('b', 'PAGO', tope), mov('c', 'PAGO', tope)];
    const sumas = sumasVigentes(movs);
    expect(sumas.pagos).toBe(2_999_999_999_999_997n);
    // Number(2999999999999997) ya no es seguro en suma acumulada: el bigint conserva el último dígito.
    const pagado = pagadoNeto(sumas, 'COP');
    const total = totalDelArchivo('ABIERTO', tope, SUMAS_EN_CERO, 'COP');
    expect(saldoDelArchivo(total, pagado).unidades).toBe(tope - 2_999_999_999_999_997n);
    expect(saldoDelArchivo(total, pagado).unidades).toBe(-1_999_999_999_999_998n);
  });
});

describe('situación del saldo: cada umbral', () => {
  const total = cop(1_000n);
  it('SIN_PAGOS: pagado 0 y total > 0', () => {
    expect(situacionDelSaldo(total, cop(0n))).toBe('SIN_PAGOS');
  });
  it('PARCIAL: 0 < pagado < total, en sus dos bordes', () => {
    expect(situacionDelSaldo(total, cop(1n))).toBe('PARCIAL');
    expect(situacionDelSaldo(total, cop(999n))).toBe('PARCIAL');
  });
  it('PAGADO: saldo exacto cero', () => {
    expect(situacionDelSaldo(total, cop(1_000n))).toBe('PAGADO');
  });
  it('SALDO_A_FAVOR: un solo peso de más ya es sobrepago', () => {
    expect(situacionDelSaldo(total, cop(1_001n))).toBe('SALDO_A_FAVOR');
  });
  it('total 0 y pagado 0: PAGADO (no hay nada que cobrar)', () => {
    expect(situacionDelSaldo(cop(0n), cop(0n))).toBe('PAGADO');
  });
});

describe('fechas', () => {
  it('restarDias cruza mes y año', () => {
    expect(restarDias('2027-01-10', 30)).toBe('2026-12-11');
    expect(restarDias('2027-03-01', 1)).toBe('2027-02-28');
    expect(restarDias('2028-03-01', 1)).toBe('2028-02-29');
  });
  it('diasEntre es con signo', () => {
    expect(diasEntre('2027-01-10', '2027-01-17')).toBe(7);
    expect(diasEntre('2027-01-10', '2027-01-09')).toBe(-1);
    expect(diasEntre('2027-01-10', '2027-01-10')).toBe(0);
  });
  it('rechaza una fecha que no existe en el calendario', () => {
    expect(esFechaDeCalendario('2027-02-30')).toBe(false);
    expect(esFechaDeCalendario('2027-13-01')).toBe(false);
    expect(esFechaDeCalendario('27-01-01')).toBe(false);
    expect(esFechaDeCalendario('2028-02-29')).toBe(true);
    expect(() => diasEntre('2027-02-30', '2027-03-01')).toThrow(FechaDeCobroInvalidaError);
  });
});

describe('fecha límite de cobro', () => {
  it('por defecto: salida menos 30 días', () => {
    expect(fechaLimiteDeCobro({ fechaSalida: '2027-03-01', creadoEl: '2027-01-01' })).toBe(
      '2027-01-30',
    );
  });
  it('N por agencia', () => {
    expect(
      fechaLimiteDeCobro({ fechaSalida: '2027-03-01', creadoEl: '2027-01-01', diasDePlazo: 45 }),
    ).toBe('2027-01-15');
  });
  it('N = 0: vence el día de la salida', () => {
    expect(
      fechaLimiteDeCobro({ fechaSalida: '2027-03-01', creadoEl: '2027-01-01', diasDePlazo: 0 }),
    ).toBe('2027-03-01');
  });
  it('una venta con salida a menos de N días no nace vencida: fecha límite = creación', () => {
    expect(fechaLimiteDeCobro({ fechaSalida: '2027-01-20', creadoEl: '2027-01-10' })).toBe(
      '2027-01-10',
    );
  });
  it('justo en el borde: salida − N == creación', () => {
    expect(fechaLimiteDeCobro({ fechaSalida: '2027-02-09', creadoEl: '2027-01-10' })).toBe(
      '2027-01-10',
    );
  });
  it('la última fecha fijada a mano manda sobre el cálculo', () => {
    expect(
      fechaLimiteDeCobro({
        fechaSalida: '2027-03-01',
        creadoEl: '2027-01-01',
        plazoManual: '2027-02-20',
      }),
    ).toBe('2027-02-20');
  });
  it('rechaza días fuera de 0..365 o no enteros', () => {
    for (const diasDePlazo of [-1, 366, 1.5]) {
      expect(() =>
        fechaLimiteDeCobro({ fechaSalida: '2027-03-01', creadoEl: '2027-01-01', diasDePlazo }),
      ).toThrow(DiasDePlazoInvalidosError);
    }
  });
});

describe('estado de cobro: umbrales de 0, 7 y 8 días', () => {
  const hoy = '2027-01-10';
  const base = { estadoDelArchivo: 'ABIERTO', saldo: cop(1n), hoy } as const;

  it('saldo ≤ 0: AL_DIA, aunque la fecha ya pasó', () => {
    expect(estadoDeCobro({ ...base, saldo: cop(0n), fechaLimite: '2027-01-01' })).toBe('AL_DIA');
    expect(estadoDeCobro({ ...base, saldo: cop(-5n), fechaLimite: '2027-01-01' })).toBe('AL_DIA');
  });
  it('d = 8: SALDO_PENDIENTE', () => {
    expect(estadoDeCobro({ ...base, fechaLimite: '2027-01-18' })).toBe('SALDO_PENDIENTE');
  });
  it('d = 7: POR_VENCER', () => {
    expect(estadoDeCobro({ ...base, fechaLimite: '2027-01-17' })).toBe('POR_VENCER');
  });
  it('d = 0: POR_VENCER (vence hoy, aún no está vencido)', () => {
    expect(estadoDeCobro({ ...base, fechaLimite: '2027-01-10' })).toBe('POR_VENCER');
  });
  it('d = -1: VENCIDO', () => {
    expect(estadoDeCobro({ ...base, fechaLimite: '2027-01-09' })).toBe('VENCIDO');
  });
  it('saldo de un solo peso ya cuenta como deuda', () => {
    expect(estadoDeCobro({ ...base, saldo: cop(1n), fechaLimite: '2027-01-09' })).toBe('VENCIDO');
  });
  it('archivo CANCELADO: CANCELADO, no es deudor aunque tenga saldo y la fecha pasó', () => {
    expect(
      estadoDeCobro({
        ...base,
        estadoDelArchivo: 'CANCELADO',
        saldo: cop(999n),
        fechaLimite: '2027-01-01',
      }),
    ).toBe('CANCELADO');
  });
});

describe('calcularCobro', () => {
  it('junta todo: archivo abierto con un anticipo y salida lejana', () => {
    const r = calcularCobro({
      estadoDelArchivo: 'ABIERTO',
      ventaUnidades: 2_400_000n,
      moneda: 'COP',
      sumas: { ...SUMAS_EN_CERO, pagos: 800_000n },
      fechaSalida: '2027-03-01',
      creadoEl: '2027-01-01',
      hoy: '2027-01-10',
    });
    expect(r.total.unidades).toBe(2_400_000n);
    expect(r.pagado.unidades).toBe(800_000n);
    expect(r.saldo.unidades).toBe(1_600_000n);
    expect(r.situacion).toBe('PARCIAL');
    expect(r.fechaLimite).toBe('2027-01-30');
    expect(r.estadoDeCobro).toBe('SALDO_PENDIENTE');
  });

  it('cancelado con pago, penalidad y devolución: cierra en cero', () => {
    const r = calcularCobro({
      estadoDelArchivo: 'CANCELADO',
      ventaUnidades: 2_400_000n,
      moneda: 'COP',
      sumas: { pagos: 1_000_000n, devoluciones: 700_000n, ajustes: 0n, penalidades: 300_000n },
      fechaSalida: '2027-03-01',
      creadoEl: '2027-01-01',
      hoy: '2027-01-10',
    });
    expect(r.saldo.unidades).toBe(0n);
    expect(r.situacion).toBe('PAGADO');
    expect(r.estadoDeCobro).toBe('CANCELADO');
  });

  it('con plazo manual y N de agencia', () => {
    const r = calcularCobro({
      estadoDelArchivo: 'ABIERTO',
      ventaUnidades: 100n,
      moneda: 'COP',
      sumas: SUMAS_EN_CERO,
      fechaSalida: '2027-03-01',
      creadoEl: '2027-01-01',
      diasDePlazo: 10,
      plazoManual: '2027-01-12',
      hoy: '2027-01-10',
    });
    expect(r.fechaLimite).toBe('2027-01-12');
    expect(r.situacion).toBe('SIN_PAGOS');
    expect(r.estadoDeCobro).toBe('POR_VENCER');
  });
});
