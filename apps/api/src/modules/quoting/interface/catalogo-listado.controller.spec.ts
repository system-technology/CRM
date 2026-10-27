/**
 * `GET /api/v1/catalogo/paquetes` exige `catalogo.administrar`. El guard global lee esta metadata;
 * sin el permiso la respuesta es 403 (`permisos.spec.ts` prueba el guard). El atajo de desarrollo
 * concede todos los permisos, por eso el 403 se fija aquí por metadata y no por HTTP.
 */
import 'reflect-metadata';

import { describe, expect, it } from 'vitest';
import { ParametrosListadoGestion } from '@viajapro/contracts';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { CatalogoListadoController } from './catalogo-listado.controller.js';

describe('CatalogoListadoController', () => {
  const proto = CatalogoListadoController.prototype as unknown as Record<string, object>;

  it('es GET en la raíz de /api/v1/catalogo/paquetes', () => {
    expect(Reflect.getMetadata('path', CatalogoListadoController)).toBe('api/v1/catalogo/paquetes');
    expect(Reflect.getMetadata('path', proto['listar'] as object)).toBe('/');
  });

  it('declara @RequierePermiso(catalogo.administrar)', () => {
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto['listar'] as object)).toEqual([
      'catalogo.administrar',
    ]);
  });
});

describe('ParametrosListadoGestion', () => {
  it('coacciona el límite de la cadena de consulta y por defecto no incluye inactivos', () => {
    expect(ParametrosListadoGestion.parse({})).toEqual({ limite: 25, incluirInactivos: false });
    expect(ParametrosListadoGestion.parse({ limite: '10', incluirInactivos: 'true' })).toEqual({
      limite: 10,
      incluirInactivos: true,
    });
  });

  it('rechaza un límite fuera de rango y un incluirInactivos que no es true/false', () => {
    expect(ParametrosListadoGestion.safeParse({ limite: '101' }).success).toBe(false);
    expect(ParametrosListadoGestion.safeParse({ incluirInactivos: '1' }).success).toBe(false);
  });
});
