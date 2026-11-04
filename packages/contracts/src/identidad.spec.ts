import { describe, expect, it } from 'vitest';
import { ClaveRolSembrado, PERMISOS, Permiso } from './identidad.js';

describe('catálogo de permisos', () => {
  it('incluye los permisos de escritura de T-089', () => {
    expect(PERMISOS).toEqual(
      expect.arrayContaining(['bandeja.operar', 'crm.escribir', 'cotizacion.escribir']),
    );
  });

  it('es el reflejo exacto del CHECK de la migración 20261104130000 (ocho, sin repetidos)', () => {
    expect([...PERMISOS].sort()).toEqual(
      [
        'bandeja.operar',
        'catalogo.administrar',
        'conversaciones.ver_todas',
        'cotizacion.escribir',
        'cotizacion.ver_neto_y_margen',
        'crm.escribir',
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
