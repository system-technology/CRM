import { describe, expect, it } from 'vitest';
import { ListarNotificaciones, ListaDeNotificaciones, Notificacion } from './notificaciones.js';

const id = '0190a1b2-0000-7000-8000-000000000001';

describe('contratos de notificaciones', () => {
  it('el límite tiene un valor por defecto y un tope', () => {
    expect(ListarNotificaciones.parse({}).limite).toBe(50);
    expect(ListarNotificaciones.parse({ limite: '10' }).limite).toBe(10);
    expect(ListarNotificaciones.safeParse({ limite: '101' }).success).toBe(false);
    expect(ListarNotificaciones.safeParse({ limite: '0' }).success).toBe(false);
  });

  it('una notificación no lleva texto libre ni identifica al destinatario', () => {
    const n = Notificacion.parse({
      id,
      tipo: 'TIME_LIMIT_PROXIMO',
      archivoId: id,
      reservaId: id,
      archivoNumero: 1043,
      venceEn: '2026-12-01T15:00:00.000Z',
      leidaEn: null,
      creadaEn: '2026-11-30T15:00:00.000Z',
      usuarioId: id,
      tenantId: id,
    });
    expect(Object.keys(n).sort()).toEqual([
      'archivoId',
      'archivoNumero',
      'creadaEn',
      'id',
      'leidaEn',
      'reservaId',
      'tipo',
      'venceEn',
    ]);
  });

  it('rechaza un tipo desconocido y un número de file no positivo', () => {
    const base = {
      id,
      archivoId: id,
      reservaId: id,
      venceEn: '2026-12-01T15:00:00.000Z',
      leidaEn: null,
      creadaEn: '2026-11-30T15:00:00.000Z',
    };
    expect(Notificacion.safeParse({ ...base, tipo: 'OTRO', archivoNumero: 1 }).success).toBe(false);
    expect(
      Notificacion.safeParse({ ...base, tipo: 'TIME_LIMIT_VENCIDO', archivoNumero: 0 }).success,
    ).toBe(false);
  });

  it('la lista trae el contador de no leídas', () => {
    expect(ListaDeNotificaciones.parse({ datos: [], noLeidas: 0 })).toEqual({
      datos: [],
      noLeidas: 0,
    });
  });
});
