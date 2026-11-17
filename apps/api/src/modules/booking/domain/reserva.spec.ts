import { describe, expect, it } from 'vitest';
import {
  MotivoDeCaidaNoAplicaError,
  MotivoDeCaidaRequeridoError,
  PagoTotalRequeridoError,
  PlazoNoAplicaError,
  PlazoPosteriorALaSalidaError,
  PlazosIncoherentesError,
  ReservaCerradaError,
  TimeLimitRequeridoError,
  TransicionDeReservaInvalidaError,
} from './errors-de-operacion.js';
import {
  diaEnZona,
  type EstadoReserva,
  type Reserva,
  transicionesDesde,
  transitar,
} from './reserva.js';

const AHORA = new Date('2027-01-10T15:00:00.000Z');
const CTX = { ahora: AHORA, fechaSalida: '2027-03-15', zonaHoraria: 'America/Bogota' };

const reserva = (parcial: Partial<Reserva> = {}): Reserva => ({
  id: 'r1',
  mayoristaId: 'm1',
  mayoristaNombre: 'Mayorista',
  netoUnidades: 1_000_000n,
  monedaIso: 'COP',
  localizador: null,
  estado: 'PENDIENTE',
  solicitadaEn: null,
  confirmadaEn: null,
  abonadaEn: null,
  pagadaEn: null,
  timeLimit: null,
  pagoTotalVenceEn: null,
  motivoCaida: null,
  nota: null,
  avisoTimeLimitProximoEn: null,
  avisoTimeLimitVencidoEn: null,
  avisoPagoTotalProximoEn: null,
  avisoPagoTotalVencidoEn: null,
  ...parcial,
});

const TL = new Date('2027-01-20T23:00:00.000Z');
const PT = new Date('2027-02-10T23:00:00.000Z');

const solicitada = reserva({
  estado: 'SOLICITADA',
  solicitadaEn: new Date('2027-01-05T10:00:00Z'),
});
const confirmada = reserva({
  ...solicitada,
  estado: 'CONFIRMADA',
  confirmadaEn: new Date('2027-01-08T10:00:00Z'),
  timeLimit: TL,
});
const abonada = reserva({
  ...confirmada,
  estado: 'ABONADA_AL_PROVEEDOR',
  abonadaEn: new Date('2027-01-09T10:00:00Z'),
  pagoTotalVenceEn: PT,
});
const pagada = reserva({ ...abonada, estado: 'PAGADA_AL_PROVEEDOR', pagadaEn: AHORA });

describe('máquina de estados de la reserva (ADR-0024 §3.4)', () => {
  it('el mapa de transiciones es exactamente el del ADR', () => {
    expect(transicionesDesde('PENDIENTE')).toEqual(['SOLICITADA', 'CANCELADA']);
    expect(transicionesDesde('SOLICITADA')).toEqual([
      'EN_ESPERA',
      'CONFIRMADA',
      'CAIDA',
      'CANCELADA',
    ]);
    expect(transicionesDesde('EN_ESPERA')).toEqual(['CONFIRMADA', 'CAIDA', 'CANCELADA']);
    expect(transicionesDesde('CONFIRMADA')).toEqual(['ABONADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA']);
    expect(transicionesDesde('ABONADA_AL_PROVEEDOR')).toEqual([
      'PAGADA_AL_PROVEEDOR',
      'CAIDA',
      'CANCELADA',
    ]);
    for (const terminal of ['PAGADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA'] as const) {
      expect(transicionesDesde(terminal)).toEqual([]);
    }
  });

  it('lo que no se pidió no se puede caer: PENDIENTE no pasa a CAIDA', () => {
    expect(() => transitar(reserva(), { estado: 'CAIDA', motivoCaida: 'SIN_CUPO' }, CTX)).toThrow(
      TransicionDeReservaInvalidaError,
    );
  });

  it('no se salta pasos: PENDIENTE no pasa a CONFIRMADA ni CONFIRMADA a PAGADA', () => {
    expect(() => transitar(reserva(), { estado: 'CONFIRMADA', timeLimit: TL }, CTX)).toThrow(
      TransicionDeReservaInvalidaError,
    );
    expect(() => transitar(confirmada, { estado: 'PAGADA_AL_PROVEEDOR' }, CTX)).toThrow(
      TransicionDeReservaInvalidaError,
    );
  });

  it('no se retrocede ni se sale de un estado terminal', () => {
    expect(() => transitar(confirmada, { estado: 'SOLICITADA' }, CTX)).toThrow(
      TransicionDeReservaInvalidaError,
    );
    for (const terminal of [pagada, reserva({ estado: 'CANCELADA' })]) {
      expect(() => transitar(terminal, { estado: 'PENDIENTE' }, CTX)).toThrow(
        TransicionDeReservaInvalidaError,
      );
    }
    expect(() => transitar(pagada, { estado: 'CANCELADA' }, CTX)).toThrow(
      TransicionDeReservaInvalidaError,
    );
  });

  it('recorre el camino feliz y fecha cada paso al entrar', () => {
    const a = transitar(reserva(), { estado: 'SOLICITADA', localizador: 'ABC123' }, CTX);
    expect(a.estado).toBe('SOLICITADA');
    expect(a.solicitadaEn).toEqual(AHORA);
    expect(a.localizador).toBe('ABC123');

    const b = transitar(a, { estado: 'EN_ESPERA' }, CTX);
    expect(b.solicitadaEn).toEqual(AHORA);

    const c = transitar(b, { estado: 'CONFIRMADA', timeLimit: TL }, CTX);
    expect(c.confirmadaEn).toEqual(AHORA);
    expect(c.timeLimit).toEqual(TL);

    const d = transitar(c, { estado: 'ABONADA_AL_PROVEEDOR', pagoTotalVenceEn: PT }, CTX);
    expect(d.abonadaEn).toEqual(AHORA);
    expect(d.pagoTotalVenceEn).toEqual(PT);

    const e = transitar(d, { estado: 'PAGADA_AL_PROVEEDOR' }, CTX);
    expect(e.pagadaEn).toEqual(AHORA);
    expect(e.timeLimit).toEqual(TL);
  });

  it('EN_ESPERA es opcional: SOLICITADA pasa directo a CONFIRMADA', () => {
    expect(transitar(solicitada, { estado: 'CONFIRMADA', timeLimit: TL }, CTX).estado).toBe(
      'CONFIRMADA',
    );
  });

  describe('exigencias que la base también comprueba por CHECK', () => {
    it('CONFIRMADA exige time limit', () => {
      expect(() => transitar(solicitada, { estado: 'CONFIRMADA' }, CTX)).toThrow(
        TimeLimitRequeridoError,
      );
      expect(() => transitar(solicitada, { estado: 'CONFIRMADA', timeLimit: null }, CTX)).toThrow(
        TimeLimitRequeridoError,
      );
    });

    it('ABONADA_AL_PROVEEDOR exige la fecha de pago total', () => {
      expect(() => transitar(confirmada, { estado: 'ABONADA_AL_PROVEEDOR' }, CTX)).toThrow(
        PagoTotalRequeridoError,
      );
    });

    it('el pago total puede fijarse ya al confirmar y no hace falta repetirlo al abonar', () => {
      const c = transitar(
        solicitada,
        { estado: 'CONFIRMADA', timeLimit: TL, pagoTotalVenceEn: PT },
        CTX,
      );
      expect(transitar(c, { estado: 'ABONADA_AL_PROVEEDOR' }, CTX).pagoTotalVenceEn).toEqual(PT);
    });

    it('CAIDA exige motivo, y solo CAIDA lo lleva', () => {
      expect(() => transitar(confirmada, { estado: 'CAIDA' }, CTX)).toThrow(
        MotivoDeCaidaRequeridoError,
      );
      expect(() => transitar(confirmada, { estado: 'CAIDA', motivoCaida: null }, CTX)).toThrow(
        MotivoDeCaidaRequeridoError,
      );
      const caida = transitar(
        confirmada,
        { estado: 'CAIDA', motivoCaida: 'TIME_LIMIT_VENCIDO' },
        CTX,
      );
      expect(caida.motivoCaida).toBe('TIME_LIMIT_VENCIDO');
      expect(() =>
        transitar(solicitada, { estado: 'EN_ESPERA', motivoCaida: 'SIN_CUPO' }, CTX),
      ).toThrow(MotivoDeCaidaNoAplicaError);
    });

    it('CANCELADA se alcanza desde cualquier estado antes del pago total', () => {
      for (const origen of [reserva(), solicitada, confirmada, abonada]) {
        const r = transitar(origen, { estado: 'CANCELADA' }, CTX);
        expect(r.estado).toBe('CANCELADA');
        expect(r.motivoCaida).toBeNull();
      }
    });
  });

  describe('plazos', () => {
    it('el time limit no puede ser posterior al pago total', () => {
      expect(() =>
        transitar(solicitada, { estado: 'CONFIRMADA', timeLimit: PT, pagoTotalVenceEn: TL }, CTX),
      ).toThrow(PlazosIncoherentesError);
    });

    it('ningún plazo puede ser posterior a la salida, comparado en la zona de la agencia', () => {
      // 2027-03-16T03:00Z es el 15 a las 22:00 en Bogotá (UTC-5): aún es el día de la salida.
      const justoEnElDia = new Date('2027-03-16T03:00:00.000Z');
      expect(
        transitar(solicitada, { estado: 'CONFIRMADA', timeLimit: justoEnElDia }, CTX).timeLimit,
      ).toEqual(justoEnElDia);
      // 2027-03-16T05:00Z ya es el 16 en Bogotá.
      expect(() =>
        transitar(
          solicitada,
          { estado: 'CONFIRMADA', timeLimit: new Date('2027-03-16T05:00:00.000Z') },
          CTX,
        ),
      ).toThrow(PlazoPosteriorALaSalidaError);
    });

    it('diaEnZona respeta la zona y no el UTC', () => {
      const i = new Date('2027-03-16T03:00:00.000Z');
      expect(diaEnZona(i, 'America/Bogota')).toBe('2027-03-15');
      expect(diaEnZona(i, 'UTC')).toBe('2027-03-16');
    });

    it('el time limit solo se fija al confirmar; el pago total, al confirmar o abonar', () => {
      expect(() => transitar(solicitada, { estado: 'EN_ESPERA', timeLimit: TL }, CTX)).toThrow(
        PlazoNoAplicaError,
      );
      expect(() =>
        transitar(solicitada, { estado: 'EN_ESPERA', pagoTotalVenceEn: PT }, CTX),
      ).toThrow(PlazoNoAplicaError);
    });

    it('cambiar un plazo borra su par de marcas de aviso, y solo el suyo', () => {
      const conAvisos = reserva({
        ...confirmada,
        avisoTimeLimitProximoEn: AHORA,
        avisoTimeLimitVencidoEn: AHORA,
        avisoPagoTotalProximoEn: AHORA,
        avisoPagoTotalVencidoEn: AHORA,
      });
      const nuevo = new Date('2027-01-25T23:00:00.000Z');
      const r = transitar(conAvisos, { estado: 'CONFIRMADA', timeLimit: nuevo }, CTX);
      expect(r.timeLimit).toEqual(nuevo);
      expect(r.avisoTimeLimitProximoEn).toBeNull();
      expect(r.avisoTimeLimitVencidoEn).toBeNull();
      expect(r.avisoPagoTotalProximoEn).toEqual(AHORA);
      expect(r.avisoPagoTotalVencidoEn).toEqual(AHORA);
    });

    it('repetir el mismo plazo no borra los avisos', () => {
      const conAvisos = reserva({ ...confirmada, avisoTimeLimitProximoEn: AHORA });
      const r = transitar(conAvisos, { estado: 'CONFIRMADA', timeLimit: new Date(TL) }, CTX);
      expect(r.avisoTimeLimitProximoEn).toEqual(AHORA);
    });

    it('un plazo ya guardado que hoy quedaría después de la salida no bloquea una edición ajena', () => {
      const vieja = reserva({ ...confirmada, timeLimit: new Date('2027-03-20T12:00:00.000Z') });
      expect(transitar(vieja, { estado: 'CONFIRMADA', localizador: 'XYZ' }, CTX).localizador).toBe(
        'XYZ',
      );
    });
  });

  describe('idempotencia: PUT repetido no cambia nada', () => {
    it.each<[EstadoReserva, Reserva]>([
      ['SOLICITADA', solicitada],
      ['CONFIRMADA', confirmada],
      ['ABONADA_AL_PROVEEDOR', abonada],
      ['PAGADA_AL_PROVEEDOR', pagada],
    ])('repetir %s deja la reserva igual y no vuelve a fechar el paso', (estado, base) => {
      const despues = transitar(
        base,
        { estado },
        { ...CTX, ahora: new Date('2027-02-01T00:00:00Z') },
      );
      expect(despues).toEqual(base);
    });

    it('repetir CAIDA con el mismo motivo no cambia nada', () => {
      const caida = transitar(confirmada, { estado: 'CAIDA', motivoCaida: 'SIN_CUPO' }, CTX);
      expect(transitar(caida, { estado: 'CAIDA', motivoCaida: 'SIN_CUPO' }, CTX)).toEqual(caida);
    });

    it('no muta la reserva recibida', () => {
      const copia = structuredClone(solicitada);
      transitar(solicitada, { estado: 'CONFIRMADA', timeLimit: TL }, CTX);
      expect(solicitada).toEqual(copia);
    });
  });

  describe('reserva terminada', () => {
    it('admite corregir localizador y nota', () => {
      const r = transitar(
        pagada,
        { estado: 'PAGADA_AL_PROVEEDOR', localizador: 'NUEVO', nota: 'ok' },
        CTX,
      );
      expect(r.localizador).toBe('NUEVO');
      expect(r.nota).toBe('ok');
    });

    it('no admite cambiar plazos ni el motivo de caída', () => {
      expect(() =>
        transitar(
          pagada,
          { estado: 'PAGADA_AL_PROVEEDOR', timeLimit: new Date('2027-01-21T00:00:00Z') },
          CTX,
        ),
      ).toThrow(ReservaCerradaError);
      const caida = transitar(confirmada, { estado: 'CAIDA', motivoCaida: 'SIN_CUPO' }, CTX);
      expect(() => transitar(caida, { estado: 'CAIDA', motivoCaida: 'OTRO' }, CTX)).toThrow(
        ReservaCerradaError,
      );
    });
  });
});
