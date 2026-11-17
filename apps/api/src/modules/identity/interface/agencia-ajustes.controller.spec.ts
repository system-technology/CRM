/**
 * `PATCH /api/v1/agencia/ajustes` exige `usuarios.administrar`; el GET lo lee cualquier miembro.
 * El atajo de desarrollo concede todos los permisos, así que el 403 se fija por metadata y no por
 * HTTP (el guard global lo prueba `permisos.spec.ts`).
 */
import 'reflect-metadata';

import { ActualizarAjustesDeAgencia } from '@viajapro/contracts';
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

describe('ActualizarAjustesDeAgencia', () => {
  it('acepta una zona IANA', () => {
    expect(ActualizarAjustesDeAgencia.safeParse({ zonaHoraria: 'America/Lima' }).success).toBe(
      true,
    );
  });
  it.each([
    {},
    { zonaHoraria: '' },
    { zonaHoraria: 'America/ Lima' },
    { zonaHoraria: 'a'.repeat(65) },
  ])('rechaza %j', (cuerpo) => {
    expect(ActualizarAjustesDeAgencia.safeParse(cuerpo).success).toBe(false);
  });
  it('rechaza campos ajenos (tenantId)', () => {
    expect(
      ActualizarAjustesDeAgencia.safeParse({ zonaHoraria: 'America/Lima', tenantId: 'x' }).success,
    ).toBe(false);
  });
});
