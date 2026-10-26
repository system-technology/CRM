/**
 * El guard de permisos y el control de `incluirMargen`, sin Nest ni base de datos.
 */
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import { autorizarMargen } from './margen.js';
import { CLAVE_PERMISOS_REQUERIDOS, RequierePermiso } from './permiso.decorator.js';
import { PermisoGuard } from './permiso.guard.js';

const conPermisos = <T>(permisos: Permiso[], fn: () => T): T =>
  ContextoTenant.ejecutarCon(
    { tenantId: 't', usuarioId: 'u', identidadId: 'i', permisos: new Set(permisos), trazaId: 'x' },
    fn,
  );

describe('autorizarMargen', () => {
  it('sin pedir el margen no exige nada, ni siquiera contexto', () => {
    expect(autorizarMargen(false)).toBe(false);
  });

  it('pedirlo sin el permiso es 403 con PERMISO_DENEGADO', () => {
    try {
      conPermisos([], () => autorizarMargen(true));
      expect.unreachable('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        error: { code: 'PERMISO_DENEGADO', details: { permiso: 'cotizacion.ver_neto_y_margen' } },
      });
    }
  });

  it('otro permiso no sirve', () => {
    expect(() => conPermisos(['usuarios.administrar'], () => autorizarMargen(true))).toThrow(
      ForbiddenException,
    );
  });

  it('con el permiso, lo concede', () => {
    expect(conPermisos(['cotizacion.ver_neto_y_margen'], () => autorizarMargen(true))).toBe(true);
  });

  it('sin contexto de petición, se niega (ante la duda, 403)', () => {
    expect(() => autorizarMargen(true)).toThrow(ForbiddenException);
  });
});

describe('PermisoGuard', () => {
  class Ruta {
    @RequierePermiso('usuarios.administrar', 'roles.administrar')
    administrar(): void {}
    libre(): void {}
  }
  const contexto = (metodo: keyof Ruta): ExecutionContext =>
    ({
      // eslint-disable-next-line @typescript-eslint/unbound-method -- solo se pasa como valor
      getHandler: () => Ruta.prototype[metodo],
      getClass: () => Ruta,
    }) as unknown as ExecutionContext;
  const guard = new PermisoGuard(new Reflector());

  it('una ruta sin decorador pasa', () => {
    expect(guard.canActivate(contexto('libre'))).toBe(true);
  });

  it('exige TODOS los permisos declarados', () => {
    expect(() =>
      conPermisos(['usuarios.administrar'], () => guard.canActivate(contexto('administrar'))),
    ).toThrow(ForbiddenException);
    expect(
      conPermisos(['usuarios.administrar', 'roles.administrar'], () =>
        guard.canActivate(contexto('administrar')),
      ),
    ).toBe(true);
  });

  it('catalogo.administrar (ADR-0017 M1): con él pasa; sin él, PERMISO_DENEGADO', () => {
    class RutaDeCatalogo {
      @RequierePermiso('catalogo.administrar')
      crear(): void {}
    }
    const ctx = {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- solo se pasa como valor
      getHandler: () => RutaDeCatalogo.prototype.crear,
      getClass: () => RutaDeCatalogo,
    } as unknown as ExecutionContext;

    expect(conPermisos(['catalogo.administrar'], () => guard.canActivate(ctx))).toBe(true);
    try {
      conPermisos(['conversaciones.ver_todas'], () => guard.canActivate(ctx));
      expect.unreachable('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        error: { code: 'PERMISO_DENEGADO' },
      });
    }
  });

  it('guarda los permisos en los metadatos con su clave', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- los metadatos cuelgan de la función
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, Ruta.prototype.administrar)).toEqual([
      'usuarios.administrar',
      'roles.administrar',
    ]);
  });
});
