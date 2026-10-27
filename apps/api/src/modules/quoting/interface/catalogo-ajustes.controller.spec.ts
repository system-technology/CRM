/**
 * `GET`/`PATCH /api/v1/catalogo/ajustes` exigen `catalogo.administrar`. El guard global lee esta
 * metadata; el atajo de desarrollo concede todos los permisos, por eso el 403 se fija aquí por
 * metadata y no por HTTP (el guard lo prueba `permisos.spec.ts`).
 */
import 'reflect-metadata';

import { describe, expect, it } from 'vitest';
import { ActualizarAjustesDeCatalogo, AjustesDeCatalogo } from '@viajapro/contracts';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { CatalogoAjustesController } from './catalogo-ajustes.controller.js';

describe('CatalogoAjustesController', () => {
  const proto = CatalogoAjustesController.prototype as unknown as Record<string, object>;

  it('vive en /api/v1/catalogo/ajustes', () => {
    expect(Reflect.getMetadata('path', CatalogoAjustesController)).toBe('api/v1/catalogo/ajustes');
  });

  it.each(['obtener', 'actualizar'])('%s declara @RequierePermiso(catalogo.administrar)', (m) => {
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto[m] as object)).toEqual([
      'catalogo.administrar',
    ]);
  });
});

describe('contratos de ajustes', () => {
  it('solo acepta OCULTAR o TACHAR', () => {
    expect(AjustesDeCatalogo.safeParse({ promoVencida: 'TACHAR' }).success).toBe(true);
    expect(AjustesDeCatalogo.safeParse({ promoVencida: 'MOSTRAR' }).success).toBe(false);
  });

  it('el PATCH rechaza campos ajenos (tenantId) y el cuerpo vacío', () => {
    expect(ActualizarAjustesDeCatalogo.safeParse({ promoVencida: 'OCULTAR' }).success).toBe(true);
    expect(
      ActualizarAjustesDeCatalogo.safeParse({ promoVencida: 'OCULTAR', tenantId: 'x' }).success,
    ).toBe(false);
    expect(ActualizarAjustesDeCatalogo.safeParse({}).success).toBe(false);
  });
});
