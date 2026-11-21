/**
 * ADR-0035 §1 y §4: el alcance de un reporte lo decide la SESIÓN, nunca el parámetro del cliente,
 * y pedir un asesor ajeno sin `reportes.ver_agencia` es 403, no un recorte en silencio.
 */
import { ForbiddenException } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { alcanceDeReporte } from './alcance-de-reporte.js';

const ANA = '01932000-0000-7000-8000-0000000000a1';
const BETO = '01932000-0000-7000-8000-0000000000b1';
const DUENA = '01932000-0000-7000-8000-0000000000d1';
const DE_OTRA_AGENCIA = '01932000-0000-7000-8000-0000000000f1';

const permisos = (...p: Permiso[]): ReadonlySet<Permiso> => new Set(p);
const asesora = { usuarioId: ANA, permisos: permisos('crm.escribir', 'conversaciones.ver_todas') };
const duena = { usuarioId: DUENA, permisos: permisos('reportes.ver_agencia') };

const negativa = (pedido: string): unknown => {
  try {
    alcanceDeReporte(asesora, pedido);
    return null;
  } catch (e) {
    return e instanceof ForbiddenException ? e.getResponse() : e;
  }
};

describe('alcanceDeReporte sin reportes.ver_agencia', () => {
  it('es PROPIO con el usuario de la sesión', () => {
    expect(alcanceDeReporte(asesora, undefined)).toEqual({ nivel: 'PROPIO', asesorId: ANA });
  });

  it('pedirse a uno mismo, por id o con «yo», está permitido y no amplía nada', () => {
    expect(alcanceDeReporte(asesora, 'yo')).toEqual({ nivel: 'PROPIO', asesorId: ANA });
    expect(alcanceDeReporte(asesora, ANA)).toEqual({ nivel: 'PROPIO', asesorId: ANA });
  });

  it('pedir a OTRO asesor es 403, aunque se tenga conversaciones.ver_todas', () => {
    expect(() => alcanceDeReporte(asesora, BETO)).toThrow(ForbiddenException);
  });

  it('el 403 no es un oráculo: idéntico con un companero, un inexistente y uno de otra agencia', () => {
    const companero = negativa(BETO);
    expect(companero).toMatchObject({ error: { code: 'PERMISO_DENEGADO' } });
    expect(negativa('01932000-0000-7000-8000-0000000fffff')).toEqual(companero);
    expect(negativa(DE_OTRA_AGENCIA)).toEqual(companero);
  });

  it('sin usuario de sesión no hay «lo propio»: 403 en vez de devolver toda la agencia', () => {
    const sinUsuario = { usuarioId: null, permisos: permisos() };
    expect(() => alcanceDeReporte(sinUsuario, undefined)).toThrow(ForbiddenException);
  });
});

describe('alcanceDeReporte con reportes.ver_agencia', () => {
  it('sin parámetro es toda la agencia', () => {
    expect(alcanceDeReporte(duena, undefined)).toEqual({ nivel: 'AGENCIA', asesorId: null });
  });

  it('con un asesor, filtra sin dejar de ser alcance de agencia', () => {
    expect(alcanceDeReporte(duena, BETO)).toEqual({ nivel: 'AGENCIA', asesorId: BETO });
  });

  it('«yo» es la sesión', () => {
    expect(alcanceDeReporte(duena, 'yo')).toEqual({ nivel: 'AGENCIA', asesorId: DUENA });
  });

  it('sin usuario de sesión, «yo» no se inventa: 403 en vez de no filtrar por nadie', () => {
    const sinUsuario = { usuarioId: null, permisos: permisos('reportes.ver_agencia') };
    expect(() => alcanceDeReporte(sinUsuario, 'yo')).toThrow(ForbiddenException);
  });
});
