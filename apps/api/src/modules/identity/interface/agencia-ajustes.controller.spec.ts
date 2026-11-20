/**
 * `PATCH /api/v1/agencia/ajustes` exige `usuarios.administrar`; el GET lo lee cualquier miembro.
 * El atajo de desarrollo concede todos los permisos, así que el 403 se fija por metadata y no por
 * HTTP (el guard global lo prueba `permisos.spec.ts`).
 */
import 'reflect-metadata';

import {
  ActualizarAjustesDeAgencia,
  AjustesDeAgencia,
  CambiarAjustesDeAgencia,
} from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { AgenciaAjustesController } from './agencia-ajustes.controller.js';

const proto = AgenciaAjustesController.prototype as unknown as Record<string, object>;

describe('AgenciaAjustesController', () => {
  it('el PATCH exige usuarios.administrar', () => {
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto['actualizar'] as object)).toEqual([
      'usuarios.administrar',
    ]);
  });

  it('el GET no exige permiso', () => {
    expect(
      Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto['obtener'] as object),
    ).toBeUndefined();
  });
});

describe('CambiarAjustesDeAgencia', () => {
  it('acepta una zona IANA, un RNT, las dos cosas, o borrar el RNT con null', () => {
    for (const cuerpo of [
      { zonaHoraria: 'America/Lima' },
      { rnt: '48213' },
      { rnt: '1' },
      { rnt: '4821300000' },
      { rnt: null },
      { zonaHoraria: 'America/Lima', rnt: '48213' },
    ]) {
      expect(CambiarAjustesDeAgencia.safeParse(cuerpo).success, JSON.stringify(cuerpo)).toBe(true);
    }
  });
  it.each([
    {},
    { zonaHoraria: '' },
    { zonaHoraria: 'America/ Lima' },
    { zonaHoraria: 'a'.repeat(65) },
    { rnt: '' },
    { rnt: 'ABC' },
    { rnt: '12 34' },
    { rnt: '48.213' },
    { rnt: '12345678901' },
    { rnt: 48213 },
  ])('rechaza %j', (cuerpo) => {
    expect(CambiarAjustesDeAgencia.safeParse(cuerpo).success).toBe(false);
  });
  it('rechaza campos ajenos (tenantId) y cualquier intento de fijar la verificación', () => {
    for (const ajeno of [
      { tenantId: 'x' },
      { rntVerificado: true },
      { verificadoEn: '2026-11-20T12:00:00Z' },
      { verificado_en: '2026-11-20T12:00:00Z' },
    ]) {
      expect(
        CambiarAjustesDeAgencia.safeParse({ zonaHoraria: 'America/Lima', ...ajeno }).success,
        JSON.stringify(ajeno),
      ).toBe(false);
      expect(
        CambiarAjustesDeAgencia.safeParse({ rnt: '48213', ...ajeno }).success,
        JSON.stringify(ajeno),
      ).toBe(false);
    }
  });
});

describe('AjustesDeAgencia (respuesta)', () => {
  const base = { nombre: 'A', paisIso: 'CO', monedaIso: 'COP', zonaHoraria: 'America/Bogota' };
  it('valida con y sin los campos del RNT (una respuesta anterior a T-261 sigue valiendo)', () => {
    expect(AjustesDeAgencia.safeParse(base).success).toBe(true);
    expect(AjustesDeAgencia.safeParse({ ...base, rnt: null, rntVerificado: false }).success).toBe(
      true,
    );
    expect(AjustesDeAgencia.safeParse({ ...base, rnt: '48213', rntVerificado: true }).success).toBe(
      true,
    );
  });
});

describe('ActualizarAjustesDeAgencia (legado, la web aún lo usa)', () => {
  it('sigue siendo solo la zona: obligatoria y sin campos ajenos, tampoco el RNT', () => {
    expect(ActualizarAjustesDeAgencia.safeParse({ zonaHoraria: 'America/Lima' }).success).toBe(
      true,
    );
    expect(ActualizarAjustesDeAgencia.safeParse({}).success).toBe(false);
    expect(
      ActualizarAjustesDeAgencia.safeParse({ zonaHoraria: 'America/Lima', rnt: '48213' }).success,
    ).toBe(false);
  });
});
