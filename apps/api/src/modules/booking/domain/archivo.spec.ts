import { describe, expect, it } from 'vitest';
import {
  type Archivo,
  avanceDelArchivo,
  cancelarArchivo,
  compararPorPlazo,
  exigirAbierto,
  pasajerosNoCuadran,
  plazosDelArchivo,
  semaforoDe,
  validarPasajeros,
} from './archivo.js';
import {
  ArchivoCanceladoError,
  ArchivoConReservaPagadaError,
  ArchivoYaCanceladoError,
  CancelacionSinUsuarioError,
  EdadRequeridaError,
  NotaDeCancelacionRequeridaError,
  TitularInvalidoError,
} from './errors-de-operacion.js';
import type { EstadoReserva, Reserva } from './reserva.js';

const AHORA = new Date('2027-01-10T12:00:00.000Z');
const h = (horas: number): Date => new Date(AHORA.getTime() + horas * 3_600_000);

const r = (estado: EstadoReserva, parcial: Partial<Reserva> = {}): Reserva => ({
  id: `r-${estado}-${Math.random()}`,
  mayoristaId: null,
  mayoristaNombre: null,
  netoUnidades: null,
  monedaIso: 'COP',
  localizador: null,
  estado,
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

const archivo = (reservas: Reserva[], estado: Archivo['estado'] = 'ABIERTO') => ({
  id: 'a1',
  estado,
  reservas,
});

describe('avance del archivo (derivado de las reservas vivas)', () => {
  it('POR_CONFIRMAR si alguna viva está PENDIENTE, SOLICITADA o EN_ESPERA', () => {
    for (const e of ['PENDIENTE', 'SOLICITADA', 'EN_ESPERA'] as const) {
      expect(avanceDelArchivo(archivo([r('CONFIRMADA'), r(e)]))).toBe('POR_CONFIRMAR');
    }
  });

  it('CONFIRMADO cuando todas las vivas están confirmadas por el mayorista o más allá', () => {
    expect(
      avanceDelArchivo(
        archivo([r('CONFIRMADA'), r('ABONADA_AL_PROVEEDOR'), r('PAGADA_AL_PROVEEDOR')]),
      ),
    ).toBe('CONFIRMADO');
  });

  it('PAGADO_A_PROVEEDORES solo cuando todas las vivas están pagadas', () => {
    expect(avanceDelArchivo(archivo([r('PAGADA_AL_PROVEEDOR'), r('PAGADA_AL_PROVEEDOR')]))).toBe(
      'PAGADO_A_PROVEEDORES',
    );
    expect(avanceDelArchivo(archivo([r('PAGADA_AL_PROVEEDOR'), r('ABONADA_AL_PROVEEDOR')]))).toBe(
      'CONFIRMADO',
    );
  });

  it('las caídas y canceladas no cuentan', () => {
    expect(avanceDelArchivo(archivo([r('CONFIRMADA'), r('CAIDA'), r('CANCELADA')]))).toBe(
      'CONFIRMADO',
    );
    expect(avanceDelArchivo(archivo([r('PAGADA_AL_PROVEEDOR'), r('CAIDA')]))).toBe(
      'PAGADO_A_PROVEEDORES',
    );
  });

  it('SIN_RESERVAS_VIVAS si se cayeron o cancelaron todas (el archivo sigue ABIERTO)', () => {
    expect(avanceDelArchivo(archivo([r('CAIDA'), r('CANCELADA')]))).toBe('SIN_RESERVAS_VIVAS');
  });

  it('un archivo cancelado no tiene avance', () => {
    expect(avanceDelArchivo(archivo([r('CANCELADA')], 'CANCELADO'))).toBeNull();
  });
});

describe('semáforo y orden por plazo', () => {
  it('VENCIDO, MENOS_DE_24_H y EN_PLAZO; sin plazo, nada', () => {
    expect(semaforoDe(h(-1), AHORA)).toBe('VENCIDO');
    expect(semaforoDe(AHORA, AHORA)).toBe('VENCIDO');
    expect(semaforoDe(h(23), AHORA)).toBe('MENOS_DE_24_H');
    expect(semaforoDe(h(24), AHORA)).toBe('EN_PLAZO');
    expect(semaforoDe(null, AHORA)).toBeNull();
  });

  it('el plazo vigente es el time limit si CONFIRMADA y el pago total si ABONADA', () => {
    const { proximoPlazo, semaforo } = plazosDelArchivo(
      [
        r('CONFIRMADA', { timeLimit: h(48) }),
        r('ABONADA_AL_PROVEEDOR', { timeLimit: h(-100), pagoTotalVenceEn: h(5) }),
        r('PAGADA_AL_PROVEEDOR', { timeLimit: h(-200), pagoTotalVenceEn: h(-100) }),
        r('CAIDA', { timeLimit: h(-300) }),
      ],
      AHORA,
    );
    expect(proximoPlazo).toEqual(h(5));
    expect(semaforo).toBe('MENOS_DE_24_H');
  });

  it('el peor semáforo gana', () => {
    expect(
      plazosDelArchivo(
        [r('CONFIRMADA', { timeLimit: h(-1) }), r('CONFIRMADA', { timeLimit: h(72) })],
        AHORA,
      ).semaforo,
    ).toBe('VENCIDO');
  });

  it('sin reservas con plazo vigente no hay plazo ni semáforo', () => {
    expect(plazosDelArchivo([r('PENDIENTE'), r('SOLICITADA')], AHORA)).toEqual({
      proximoPlazo: null,
      semaforo: null,
    });
  });

  it('ordena por el plazo más próximo y deja los que no tienen al final', () => {
    const lista = [
      { proximoPlazo: null, numero: 1 },
      { proximoPlazo: h(10), numero: 2 },
      { proximoPlazo: h(-5), numero: 3 },
      { proximoPlazo: null, numero: 0 },
    ];
    expect(lista.sort(compararPorPlazo).map((x) => x.numero)).toEqual([3, 2, 0, 1]);
  });
});

describe('pasajeros', () => {
  const adulto = (esTitular = false) => ({
    nombre: 'Ana',
    tipo: 'ADT' as const,
    edadAlViaje: null,
    esTitular,
  });

  it('una lista vacía es válida (se pueden vaciar)', () => {
    expect(() => validarPasajeros([])).not.toThrow();
  });

  it('exige exactamente un titular cuando hay pasajeros', () => {
    expect(() => validarPasajeros([adulto(false)])).toThrow(TitularInvalidoError);
    expect(() => validarPasajeros([adulto(true), adulto(true)])).toThrow(TitularInvalidoError);
    expect(() => validarPasajeros([adulto(true), adulto(false)])).not.toThrow();
  });

  it('CHD e INF exigen edad; ADT no', () => {
    const base = { nombre: 'Luis', edadAlViaje: null, esTitular: false };
    expect(() => validarPasajeros([adulto(true), { ...base, tipo: 'CHD' }])).toThrow(
      EdadRequeridaError,
    );
    expect(() => validarPasajeros([adulto(true), { ...base, tipo: 'INF' }])).toThrow(
      EdadRequeridaError,
    );
    expect(() =>
      validarPasajeros([adulto(true), { ...base, tipo: 'CHD', edadAlViaje: 7 }]),
    ).not.toThrow();
  });

  it('avisa, sin impedir, si no cuadran con los conteos de la venta', () => {
    const venta = { adultos: 2, ninos: 1, infantes: 0 };
    expect(pasajerosNoCuadran(venta, [])).toBe(false);
    expect(pasajerosNoCuadran(venta, [{ tipo: 'ADT' }, { tipo: 'ADT' }, { tipo: 'CHD' }])).toBe(
      false,
    );
    expect(pasajerosNoCuadran(venta, [{ tipo: 'ADT' }])).toBe(true);
    expect(pasajerosNoCuadran(venta, [{ tipo: 'ADT' }, { tipo: 'ADT' }, { tipo: 'INF' }])).toBe(
      true,
    );
  });
});

describe('cancelación del archivo', () => {
  const entrada = {
    motivo: 'CLIENTE_DESISTIO' as const,
    nota: null,
    ahora: AHORA,
    usuarioId: 'u1',
  };

  it('cancela las reservas vivas con el archivo y deja las caídas como están', () => {
    const viva1 = r('PENDIENTE');
    const viva2 = r('ABONADA_AL_PROVEEDOR');
    const caida = r('CAIDA', { motivoCaida: 'SIN_CUPO' });
    const c = cancelarArchivo(archivo([viva1, viva2, caida]), entrada);
    expect(c.reservasACancelar).toEqual([viva1.id, viva2.id]);
    expect(c.canceladoPor).toBe('u1');
    expect(c.canceladoEn).toEqual(AHORA);
  });

  it('OTRO exige nota', () => {
    expect(() =>
      cancelarArchivo(archivo([r('PENDIENTE')]), { ...entrada, motivo: 'OTRO' }),
    ).toThrow(NotaDeCancelacionRequeridaError);
    expect(() =>
      cancelarArchivo(archivo([r('PENDIENTE')]), { ...entrada, motivo: 'OTRO', nota: '   ' }),
    ).toThrow(NotaDeCancelacionRequeridaError);
    expect(
      cancelarArchivo(archivo([r('PENDIENTE')]), {
        ...entrada,
        motivo: 'OTRO',
        nota: 'Cambió de planes',
      }).nota,
    ).toBe('Cambió de planes');
  });

  it('no se cancela dos veces', () => {
    expect(() => cancelarArchivo(archivo([r('CANCELADA')], 'CANCELADO'), entrada)).toThrow(
      ArchivoYaCanceladoError,
    );
  });

  it('exige un usuario identificado', () => {
    expect(() =>
      cancelarArchivo(archivo([r('PENDIENTE')]), { ...entrada, usuarioId: null }),
    ).toThrow(CancelacionSinUsuarioError);
  });

  it('una reserva pagada al proveedor lo impide (penalidad, fuera del alcance)', () => {
    expect(() =>
      cancelarArchivo(archivo([r('PENDIENTE'), r('PAGADA_AL_PROVEEDOR')]), entrada),
    ).toThrow(ArchivoConReservaPagadaError);
  });

  it('un archivo cancelado no admite cambios', () => {
    expect(() => exigirAbierto({ id: 'a1', estado: 'CANCELADO' })).toThrow(ArchivoCanceladoError);
    expect(() => exigirAbierto({ id: 'a1', estado: 'ABIERTO' })).not.toThrow();
  });
});
