import { AvisoDePlazoV1 } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  avisosDePlazo,
  eventoDeAvisoDePlazo,
  marcasALimpiar,
  type ReservaVigilable,
  UMBRAL_DE_AVISO_MS,
} from './plazos.js';
import { type Reserva, transitar } from './reserva.js';

const AHORA = new Date('2027-01-10T15:00:00.000Z');
const enHoras = (h: number): Date => new Date(AHORA.getTime() + h * 3_600_000);

const vigilable = (p: Partial<ReservaVigilable> = {}): ReservaVigilable => ({
  estado: 'CONFIRMADA',
  timeLimit: null,
  pagoTotalVenceEn: null,
  avisoTimeLimitProximoEn: null,
  avisoTimeLimitVencidoEn: null,
  avisoPagoTotalProximoEn: null,
  avisoPagoTotalVencidoEn: null,
  ...p,
});

describe('avisosDePlazo: time limit (CONFIRMADA)', () => {
  it('dentro del umbral avisa «próximo»', () => {
    expect(avisosDePlazo(vigilable({ timeLimit: enHoras(23) }), AHORA)).toEqual([
      { plazo: 'TIME_LIMIT', momento: 'PROXIMO', venceEn: enHoras(23) },
    ]);
  });

  it('justo en el umbral (24 h) avisa; un minuto más allá, no', () => {
    expect(avisosDePlazo(vigilable({ timeLimit: enHoras(24) }), AHORA)).toHaveLength(1);
    const pasado = new Date(AHORA.getTime() + UMBRAL_DE_AVISO_MS + 60_000);
    expect(avisosDePlazo(vigilable({ timeLimit: pasado }), AHORA)).toEqual([]);
  });

  it('con la marca de próximo ya escrita no repite', () => {
    const r = vigilable({ timeLimit: enHoras(5), avisoTimeLimitProximoEn: enHoras(-1) });
    expect(avisosDePlazo(r, AHORA)).toEqual([]);
  });

  it('vencido: avisa «vencido» y no «próximo», aunque nunca se avisara antes', () => {
    expect(avisosDePlazo(vigilable({ timeLimit: enHoras(-2) }), AHORA)).toEqual([
      { plazo: 'TIME_LIMIT', momento: 'VENCIDO', venceEn: enHoras(-2) },
    ]);
  });

  it('el instante exacto del plazo ya cuenta como vencido', () => {
    const [a] = avisosDePlazo(vigilable({ timeLimit: AHORA }), AHORA);
    expect(a?.momento).toBe('VENCIDO');
  });

  it('con la marca de vencido escrita no repite', () => {
    const r = vigilable({
      timeLimit: enHoras(-2),
      avisoTimeLimitProximoEn: enHoras(-20),
      avisoTimeLimitVencidoEn: enHoras(-1),
    });
    expect(avisosDePlazo(r, AHORA)).toEqual([]);
  });

  it('sin plazo no avisa', () => {
    expect(avisosDePlazo(vigilable(), AHORA)).toEqual([]);
  });
});

describe('avisosDePlazo: pago total (ABONADA_AL_PROVEEDOR)', () => {
  const abonada = (p: Partial<ReservaVigilable>) =>
    vigilable({ estado: 'ABONADA_AL_PROVEEDOR', timeLimit: enHoras(-100), ...p });

  it('vigila el pago total, no el time limit', () => {
    // El time limit ya pasó, pero esta reserva ya se abonó: solo cuenta el pago total.
    expect(avisosDePlazo(abonada({ pagoTotalVenceEn: enHoras(10) }), AHORA)).toEqual([
      { plazo: 'PAGO_TOTAL', momento: 'PROXIMO', venceEn: enHoras(10) },
    ]);
    expect(avisosDePlazo(abonada({ pagoTotalVenceEn: enHoras(-1) }), AHORA)).toEqual([
      { plazo: 'PAGO_TOTAL', momento: 'VENCIDO', venceEn: enHoras(-1) },
    ]);
  });

  it('las marcas del time limit no silencian al pago total', () => {
    const r = abonada({
      pagoTotalVenceEn: enHoras(3),
      avisoTimeLimitProximoEn: enHoras(-50),
      avisoTimeLimitVencidoEn: enHoras(-40),
    });
    expect(avisosDePlazo(r, AHORA)).toHaveLength(1);
  });
});

describe('avisosDePlazo: estados que no vigilan', () => {
  it.each([
    'PENDIENTE',
    'SOLICITADA',
    'EN_ESPERA',
    'PAGADA_AL_PROVEEDOR',
    'CAIDA',
    'CANCELADA',
  ] as const)('%s no avisa de nada aunque tenga plazos vencidos', (estado) => {
    const r = vigilable({ estado, timeLimit: enHoras(-5), pagoTotalVenceEn: enHoras(-3) });
    expect(avisosDePlazo(r, AHORA)).toEqual([]);
  });

  it('una CONFIRMADA no avisa del pago total (ADR-0024 §3.6.3)', () => {
    expect(avisosDePlazo(vigilable({ pagoTotalVenceEn: enHoras(1) }), AHORA)).toEqual([]);
  });
});

describe('cambiar el plazo vuelve a armar el aviso', () => {
  const confirmada = (): Reserva => ({
    id: '01932000-0000-7000-8000-0000000000b1',
    mayoristaId: null,
    mayoristaNombre: null,
    netoUnidades: null,
    monedaIso: 'COP',
    localizador: null,
    estado: 'CONFIRMADA',
    solicitadaEn: enHoras(-72),
    confirmadaEn: enHoras(-48),
    abonadaEn: null,
    pagadaEn: null,
    timeLimit: enHoras(6),
    pagoTotalVenceEn: null,
    motivoCaida: null,
    nota: null,
    avisoTimeLimitProximoEn: enHoras(-1),
    avisoTimeLimitVencidoEn: null,
    avisoPagoTotalProximoEn: null,
    avisoPagoTotalVencidoEn: null,
  });
  const ctx = { ahora: AHORA, fechaSalida: '2027-03-15', zonaHoraria: 'America/Bogota' };

  it('con la marca puesta no avisa; tras mover el plazo, avisa otra vez', () => {
    const antes = confirmada();
    expect(avisosDePlazo(antes, AHORA)).toEqual([]);

    const movida = transitar(antes, { estado: 'CONFIRMADA', timeLimit: enHoras(12) }, ctx);
    expect(movida.avisoTimeLimitProximoEn).toBeNull();
    expect(avisosDePlazo(movida, AHORA)).toEqual([
      { plazo: 'TIME_LIMIT', momento: 'PROXIMO', venceEn: enHoras(12) },
    ]);
  });
});

describe('eventoDeAvisoDePlazo', () => {
  const R = '01932000-0000-7000-8000-0000000000b1';
  const F = '01932000-0000-7000-8000-0000000000f1';

  it.each([
    ['TIME_LIMIT', 'PROXIMO', 'booking.time_limit_proximo'],
    ['TIME_LIMIT', 'VENCIDO', 'booking.time_limit_vencido'],
    ['PAGO_TOTAL', 'PROXIMO', 'booking.pago_total_proximo'],
    ['PAGO_TOTAL', 'VENCIDO', 'booking.pago_total_vencido'],
  ] as const)('%s %s → %s, solo ids y el instante del plazo', (plazo, momento, tipo) => {
    const e = eventoDeAvisoDePlazo(R, F, { plazo, momento, venceEn: enHoras(5) });
    expect(e.tipoEvento).toBe(tipo);
    expect(e.agregado).toBe('reserva');
    expect(e.agregadoId).toBe(R);
    expect(AvisoDePlazoV1.parse(e.payload)).toEqual({
      v: 1,
      reservaId: R,
      archivoId: F,
      plazo,
      venceEn: enHoras(5).toISOString(),
    });
    expect(Object.keys(e.payload).sort()).toEqual([
      'archivoId',
      'plazo',
      'reservaId',
      'v',
      'venceEn',
    ]);
  });
});

describe('marcasALimpiar', () => {
  const plazos = (t: Date | null, p: Date | null) => ({ timeLimit: t, pagoTotalVenceEn: p });

  it('editar la nota (plazos iguales) no limpia ninguna marca', () => {
    expect(marcasALimpiar(plazos(enHoras(5), null), plazos(enHoras(5), null))).toEqual({
      timeLimit: false,
      pagoTotal: false,
    });
  });

  it('un instante igual en otro objeto Date tampoco cuenta como cambio', () => {
    expect(
      marcasALimpiar(plazos(new Date(enHoras(5)), null), plazos(new Date(enHoras(5)), null)),
    ).toEqual({ timeLimit: false, pagoTotal: false });
  });

  it('cada plazo limpia solo su par', () => {
    expect(marcasALimpiar(plazos(enHoras(5), null), plazos(enHoras(6), null))).toEqual({
      timeLimit: true,
      pagoTotal: false,
    });
    expect(marcasALimpiar(plazos(enHoras(5), enHoras(9)), plazos(enHoras(5), null))).toEqual({
      timeLimit: false,
      pagoTotal: true,
    });
  });
});
