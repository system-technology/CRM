/**
 * El permiso «ver neto y margen» sobre `incluirMargen` (ADR-0011, paso 6).
 *
 * `incluirMargen=true` sin `cotizacion.ver_neto_y_margen` responde **403**. Ignorarlo en
 * silencio y devolver la cotización sin margen sería peor: le enseñaría al cliente de la API que
 * pedirlo es inocuo, y que lo que falta en la respuesta es una decisión suya y no de la agencia.
 *
 * Devuelve lo que el caso de uso debe hacer: incluir el margen o no. Con `false` explícito o
 * ausente no exige nada.
 */
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import { permisoDenegado } from './permiso.guard.js';

export function autorizarMargen(solicitado: boolean): boolean {
  if (!solicitado) return false;
  if (!ContextoTenant.tienePermiso('cotizacion.ver_neto_y_margen')) {
    throw permisoDenegado('cotizacion.ver_neto_y_margen');
  }
  return true;
}
