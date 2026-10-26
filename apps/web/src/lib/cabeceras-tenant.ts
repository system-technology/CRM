/**
 * Gestión de cabeceras de tenant de desarrollo (ADR-0011 / Tarea 0c.39).
 *
 * Con autenticación real (`usaAuthReal() === true`):
 * El tenant activo y la pertenencia a la agencia se resuelven exclusivamente
 * en el servidor a través de la cookie HttpOnly de sesión vía TenantMiddleware (ADR-0011 §2).
 * Por tanto, NUNCA se envía la cabecera 'x-dev-tenant-id' cuando la sesión real está activa.
 *
 * Sin autenticación real (modo desarrollo local con APP_ENV=local):
 * Se envía la cabecera 'x-dev-tenant-id' solo si NEXT_PUBLIC_DEV_TENANT_ID está configurada.
 */
import { usaAuthReal } from './auth-api';

export function cabecerasDeTenantDev(): Record<string, string> {
  if (usaAuthReal()) {
    return {};
  }
  const tenantId = process.env['NEXT_PUBLIC_DEV_TENANT_ID'];
  if (tenantId && tenantId.trim().length > 0) {
    return { 'x-dev-tenant-id': tenantId.trim() };
  }
  return {};
}
