import { describe, expect, it } from 'vitest';
import { ClaveRolSembrado, IniciarSesion, PERMISOS, Permiso } from './identidad.js';

describe('catálogo de permisos', () => {
  it('incluye los permisos de escritura de T-089', () => {
    expect(PERMISOS).toEqual(
      expect.arrayContaining(['bandeja.operar', 'crm.escribir', 'cotizacion.escribir']),
    );
  });

  it('es el reflejo exacto del CHECK de la migración 20261121160000 (quince, sin repetidos)', () => {
    expect([...PERMISOS].sort()).toEqual(
      [
        'archivo.operar',
        'archivo.ver',
        'bandeja.operar',
        'catalogo.administrar',
        'cobro.corregir',
        'cobro.registrar',
        'cobro.ver',
        'conversaciones.ver_todas',
        'cotizacion.escribir',
        'cotizacion.ver_neto_y_margen',
        'crm.escribir',
        'etiquetas.administrar',
        'reportes.ver_agencia',
        'roles.administrar',
        'usuarios.administrar',
      ].sort(),
    );
    expect(new Set(PERMISOS).size).toBe(PERMISOS.length);
  });

  it('rechaza un permiso que no está en el catálogo', () => {
    expect(Permiso.safeParse('bandeja.escribir').success).toBe(false);
    expect(Permiso.safeParse('crm.escribir').success).toBe(true);
  });

  it('no inventa roles sembrados: siguen siendo tres', () => {
    expect(ClaveRolSembrado.options).toEqual(['DUENO', 'ASESOR', 'OPERACIONES']);
  });
});

describe('IniciarSesion (ADR-0031 §3)', () => {
  it('acepta `identificador`, correo o apodo', () => {
    expect(IniciarSesion.safeParse({ identificador: 'ialvear', contrasena: 'x' }).success).toBe(
      true,
    );
    expect(IniciarSesion.safeParse({ identificador: 'a@b.co', contrasena: 'x' }).success).toBe(
      true,
    );
  });

  it('acepta durante una versión la clave `correo`', () => {
    expect(IniciarSesion.safeParse({ correo: 'a@b.co', contrasena: 'x' }).success).toBe(true);
  });

  it('rechaza por forma las dos claves a la vez, o ninguna', () => {
    expect(
      IniciarSesion.safeParse({ identificador: 'a@b.co', correo: 'a@b.co', contrasena: 'x' })
        .success,
    ).toBe(false);
    expect(IniciarSesion.safeParse({ contrasena: 'x' }).success).toBe(false);
  });

  it('no exige formato de correo ni de apodo: un identificador mal formado llega a la API', () => {
    expect(IniciarSesion.safeParse({ identificador: 'Ñandú!!', contrasena: 'x' }).success).toBe(
      true,
    );
  });

  it('acota el largo y exige contraseña', () => {
    expect(
      IniciarSesion.safeParse({ identificador: 'a'.repeat(256), contrasena: 'x' }).success,
    ).toBe(false);
    expect(IniciarSesion.safeParse({ identificador: '   ', contrasena: 'x' }).success).toBe(false);
    expect(IniciarSesion.safeParse({ identificador: 'ialvear', contrasena: '' }).success).toBe(
      false,
    );
  });
});
