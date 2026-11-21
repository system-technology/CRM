/**
 * De quién son los datos que una consulta puede pedir DENTRO de una agencia (decisión D3 del
 * propietario: «el asesor ve lo suyo, el administrador todo»).
 *
 *   · Con `conversaciones.ver_todas`: el parámetro `asesorId` se respeta (`yo` = la sesión).
 *   · Sin él: el servidor IMPONE al usuario de la sesión e IGNORA el parámetro, sin error, para que
 *     la respuesta no revele si el asesor pedido existe ni cuántos seguimientos tiene.
 *
 * PROVISIONAL: reutiliza `conversaciones.ver_todas` hasta que exista `reportes.ver_agencia`
 * (T-341); entonces `alcanceDeReporte` (T-342) sustituye esta función. No es aislamiento entre
 * agencias —eso es RLS—, es política de negocio dentro de una.
 */
import type { ContextoPeticion } from '../tenant/contexto-tenant.js';
import { PERMISO_VER_TODAS } from './visibilidad-de-conversaciones.js';
import { permisoDenegado } from './permiso.guard.js';

/** Qué se consulta cuando quien puede ver todo no pasa `asesorId`. */
export type PorDefecto = 'YO' | 'TODOS';

/**
 * El asesor por el que hay que filtrar; `null` significa «sin filtro de asesor» y solo sale para
 * quien tiene `ver_todas`.
 */
export function asesorDeConsulta(
  contexto: Pick<ContextoPeticion, 'usuarioId' | 'permisos'>,
  pedido: string | undefined,
  porDefecto: PorDefecto,
): string | null {
  if (!contexto.permisos.has(PERMISO_VER_TODAS)) {
    // Sin usuario no hay «lo suyo»: devolver `null` sería devolver todo. Ante la duda, 403.
    if (contexto.usuarioId === null) throw permisoDenegado(PERMISO_VER_TODAS);
    return contexto.usuarioId;
  }
  if (pedido === undefined) return porDefecto === 'YO' ? contexto.usuarioId : null;
  return pedido === 'yo' ? contexto.usuarioId : pedido;
}
