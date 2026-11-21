/**
 * D3 («el asesor ve lo suyo, el administrador todo») aplicada al parámetro `asesorId`: sin
 * `conversaciones.ver_todas` el servidor impone a la sesión y no revela nada.
 */
import { ForbiddenException } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { asesorDeConsulta } from './asesor-de-consulta.js';

const ANA = '01932000-0000-7000-8000-0000000000a1';
const BETO = '01932000-0000-7000-8000-0000000000b1';
const DUENO = '01932000-0000-7000-8000-0000000000d1';

const permisos = (...p: Permiso[]): ReadonlySet<Permiso> => new Set(p);
const asesor = { usuarioId: ANA, permisos: permisos('crm.escribir') };
const admin = { usuarioId: DUENO, permisos: permisos('conversaciones.ver_todas') };

describe('asesorDeConsulta, sin conversaciones.ver_todas', () => {
  it('impone al usuario de la sesión e ignora el asesor pedido', () => {
    expect(asesorDeConsulta(asesor, BETO, 'YO')).toBe(ANA);
    expect(asesorDeConsulta(asesor, BETO, 'TODOS')).toBe(ANA);
  });

  it('sin parámetro, con «yo» o con basura, devuelve lo mismo: la sesión', () => {
    for (const pedido of [undefined, 'yo', 'basura']) {
      expect(asesorDeConsulta(asesor, pedido, 'TODOS')).toBe(ANA);
      expect(asesorDeConsulta(asesor, pedido, 'YO')).toBe(ANA);
    }
  });

  it('nunca devuelve null (null sería «todos»): sin usuario, 403', () => {
    const sinUsuario = { usuarioId: null, permisos: permisos() };
    expect(() => asesorDeConsulta(sinUsuario, undefined, 'TODOS')).toThrow(ForbiddenException);
  });
});

describe('asesorDeConsulta, con conversaciones.ver_todas', () => {
  it('respeta el asesor pedido', () => {
    expect(asesorDeConsulta(admin, BETO, 'YO')).toBe(BETO);
    expect(asesorDeConsulta(admin, BETO, 'TODOS')).toBe(BETO);
  });

  it('«yo» es la sesión', () => {
    expect(asesorDeConsulta(admin, 'yo', 'TODOS')).toBe(DUENO);
  });

  it('sin parámetro aplica el valor por defecto de cada ruta', () => {
    expect(asesorDeConsulta(admin, undefined, 'YO')).toBe(DUENO);
    expect(asesorDeConsulta(admin, undefined, 'TODOS')).toBeNull();
  });
});
