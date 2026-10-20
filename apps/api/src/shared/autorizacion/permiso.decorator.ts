/**
 * `@RequierePermiso('cotizacion.ver_neto_y_margen')` — ADR-0011, paso 6.
 *
 * Declara qué permiso exige una ruta (o todo un controlador). Lo hace cumplir `PermisoGuard`,
 * que lee los permisos del contexto de la petición: los que el middleware leyó de `roles` bajo
 * RLS. Varios permisos significan que hacen falta **todos**.
 */
import { SetMetadata } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';

export const CLAVE_PERMISOS_REQUERIDOS = 'viajapro:permisos-requeridos';

export const RequierePermiso = (...permisos: Permiso[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_PERMISOS_REQUERIDOS, permisos);
