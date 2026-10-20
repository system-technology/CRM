import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permiso } from '@viajapro/contracts';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import { CLAVE_PERMISOS_REQUERIDOS } from './permiso.decorator.js';

/** Un 403 con el código estable `PERMISO_DENEGADO`. Lo comparten el guard y `autorizarMargen`. */
export function permisoDenegado(permiso: Permiso): ForbiddenException {
  return new ForbiddenException({
    error: {
      code: 'PERMISO_DENEGADO',
      message: 'Tu rol en esta agencia no permite esta operación.',
      details: { permiso },
    },
  });
}

/**
 * Global (APP_GUARD): se evalúa en toda ruta, y las que no declaran permiso pasan.
 *
 * Corre después del middleware de tenant, así que el contexto ya existe. Si no existiera, los
 * permisos serían vacíos y se negaría: ante la duda, 403.
 */
@Injectable()
export class PermisoGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndMerge<Permiso[]>(CLAVE_PERMISOS_REQUERIDOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    for (const permiso of requeridos ?? []) {
      if (!ContextoTenant.tienePermiso(permiso)) throw permisoDenegado(permiso);
    }
    return true;
  }
}
