import { describe, expect, it } from 'vitest';
import type { ResumenDeArchivo } from '@viajapro/contracts';
import {
  camposDelPaso,
  construirCambioDeReserva,
  describirPlazo,
  filtrarArchivos,
  instanteALocal,
  localAInstante,
  mensajeDeErrorDelArchivo,
  reservaMasUrgente,
  type ValoresDelPaso,
} from './archivos-logica';
import { MOCK_DETALLES_ARCHIVOS } from './mock-archivos';

const BOGOTA = 'America/Bogota';
const VACIO: ValoresDelPaso = {
  localizador: '',
  timeLimit: '',
  pagoTotal: '',
  motivoCaida: '',
  nota: '',
};

describe('plazos en la zona de la agencia (R9)', () => {
  it('convierte hora de Bogotá (UTC-5) a UTC y de vuelta', () => {
    expect(localAInstante('2026-12-01T18:30', BOGOTA)).toBe('2026-12-01T23:30:00.000Z');
    expect(instanteALocal('2026-12-01T23:30:00.000Z', BOGOTA)).toBe('2026-12-01T18:30');
  });

  it('cruza de día: 22:00 en Bogotá es el día siguiente en UTC', () => {
    expect(localAInstante('2026-12-31T22:00', BOGOTA)).toBe('2027-01-01T03:00:00.000Z');
  });

  it('respeta una zona con horario de verano', () => {
    // Madrid: UTC+1 en invierno, UTC+2 en verano.
    expect(localAInstante('2026-01-15T10:00', 'Europe/Madrid')).toBe('2026-01-15T09:00:00.000Z');
    expect(localAInstante('2026-07-15T10:00', 'Europe/Madrid')).toBe('2026-07-15T08:00:00.000Z');
  });

  it('devuelve null con una entrada inválida', () => {
    expect(localAInstante('mañana', BOGOTA)).toBeNull();
    expect(instanteALocal(null, BOGOTA)).toBe('');
  });
});

describe('describirPlazo', () => {
  const ahora = Date.parse('2026-12-01T12:00:00Z');
  it('dice vence en horas, en días o venció hace', () => {
    expect(describirPlazo('2026-12-01T17:00:00Z', ahora)).toBe('vence en 5 horas');
    expect(describirPlazo('2026-12-05T12:00:00Z', ahora)).toBe('vence en 4 días');
    expect(describirPlazo('2026-12-01T10:00:00Z', ahora)).toBe('venció hace 2 horas');
    expect(describirPlazo(null, ahora)).toBe('Sin plazo vigente');
  });
});

describe('campos que exige cada paso', () => {
  it('time limit al confirmar, pago total al abonar, motivo al caer', () => {
    expect(camposDelPaso('CONFIRMADA')).toEqual({
      timeLimit: 'obligatorio',
      pagoTotal: 'opcional',
      motivoCaida: false,
    });
    expect(camposDelPaso('ABONADA_AL_PROVEEDOR').pagoTotal).toBe('obligatorio');
    expect(camposDelPaso('CAIDA').motivoCaida).toBe(true);
    expect(camposDelPaso('SOLICITADA')).toEqual({
      timeLimit: 'no',
      pagoTotal: 'no',
      motivoCaida: false,
    });
  });
});

describe('construirCambioDeReserva', () => {
  it('confirmar sin time limit no sale al servidor', () => {
    const r = construirCambioDeReserva('CONFIRMADA', VACIO, BOGOTA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.timeLimit).toMatch(/time limit/i);
  });

  it('confirmar manda el time limit en UTC y omite lo vacío', () => {
    const r = construirCambioDeReserva(
      'CONFIRMADA',
      { ...VACIO, timeLimit: '2026-12-01T18:30', localizador: ' AB123 ' },
      BOGOTA,
    );
    expect(r).toEqual({
      ok: true,
      cambio: { estado: 'CONFIRMADA', localizador: 'AB123', timeLimit: '2026-12-01T23:30:00.000Z' },
    });
  });

  it('abonar exige la fecha de pago total', () => {
    const r = construirCambioDeReserva('ABONADA_AL_PROVEEDOR', VACIO, BOGOTA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.pagoTotal).toBeDefined();
  });

  it('caer exige motivo, y OTRO exige nota', () => {
    const sin = construirCambioDeReserva('CAIDA', VACIO, BOGOTA);
    expect(sin.ok).toBe(false);
    const otro = construirCambioDeReserva('CAIDA', { ...VACIO, motivoCaida: 'OTRO' }, BOGOTA);
    expect(otro.ok).toBe(false);
    if (!otro.ok) expect(otro.errores.nota).toBeDefined();
    const bien = construirCambioDeReserva('CAIDA', { ...VACIO, motivoCaida: 'SIN_CUPO' }, BOGOTA);
    expect(bien).toEqual({ ok: true, cambio: { estado: 'CAIDA', motivoCaida: 'SIN_CUPO' } });
  });
});

describe('mensajeDeErrorDelArchivo', () => {
  it('traduce los códigos del dominio a lenguaje claro', () => {
    expect(mensajeDeErrorDelArchivo({ code: 'TIME_LIMIT_REQUERIDO', status: 422 })).toMatch(
      /time limit/,
    );
    expect(mensajeDeErrorDelArchivo({ code: 'ARCHIVO_CON_RESERVA_PAGADA', status: 409 })).toMatch(
      /penalidad/,
    );
  });

  it('cae a un mensaje por estado HTTP sin exponer el texto crudo del servidor', () => {
    const m409 = mensajeDeErrorDelArchivo({
      code: 'NUEVO',
      status: 409,
      message: 'select * from x',
    });
    expect(m409).not.toMatch(/select/);
    expect(m409).toMatch(/Actualiza/);
    expect(mensajeDeErrorDelArchivo({ status: 422 })).toMatch(/dato/);
    expect(mensajeDeErrorDelArchivo({ status: 403 })).toMatch(/rol/);
    expect(mensajeDeErrorDelArchivo(new Error('boom'))).toMatch(/Reintenta/);
  });
});

describe('lista', () => {
  const archivos: ResumenDeArchivo[] = MOCK_DETALLES_ARCHIVOS;

  it('la reserva más urgente es la viva con el plazo más próximo', () => {
    expect(reservaMasUrgente(archivos[0]!)?.mayoristaNombre).toBe('Mayorista Caribe Tours');
    expect(reservaMasUrgente({ ...archivos[0]!, reservas: [] })).toBeNull();
  });

  it('filtra por número, destino y mayorista', () => {
    expect(filtrarArchivos(archivos, '1044')).toHaveLength(1);
    expect(filtrarArchivos(archivos, 'cartagena')).toHaveLength(1);
    expect(filtrarArchivos(archivos, 'aéreos del sur')).toHaveLength(1);
    expect(filtrarArchivos(archivos, 'zzz')).toHaveLength(0);
    expect(filtrarArchivos(archivos, '  ')).toHaveLength(2);
  });
});
