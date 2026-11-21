/**
 * De quién son los datos que una PANTALLA OPERATIVA puede pedir dentro de una agencia (decisión
 * D3 del propietario: «el asesor ve lo suyo, el administrador todo»).
 *
 * Seguimientos y pendientes del día no son reportes: son trabajo por hacer, y supervisarlo ajeno
 * es exactamente lo que `conversaciones.ver_todas` concede (ADR-0035 §4). Por eso siguen
 * gobernados por ese permiso y no por `reportes.ver_agencia`; para los agregados de reportes está
 * `alcanceDeReporte`.
 *
 *   · Con `conversaciones.ver_todas`: el parámetro `asesorId` se respeta (`yo` = la sesión).
 *   · Sin él, sin parámetro o pidiéndose a uno mismo (por id o con `yo`): el servidor impone al
 *     usuario de la sesión.
 *   · Sin él y con OTRO asesor: **403 PERMISO_DENEGADO** (T-342, ADR-0035 §4). Antes se ignoraba
 *     en silencio (#395); se cambió porque una pantalla titulada «Beto» con los datos de
 *     Valentina miente, y porque un cliente de la API que ve el parámetro ignorado aprende que
 *     pedirlo es inocuo. El 403 no revela si el asesor existe: es idéntico con un id inexistente
 *     o de otra agencia, porque se decide sin mirar la base.
 *
 * No es aislamiento entre agencias —eso es RLS—, es política de negocio dentro de una.
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
    if (pedido !== undefined && pedido !== 'yo' && pedido !== contexto.usuarioId) {
      throw permisoDenegado(PERMISO_VER_TODAS);
    }
    return contexto.usuarioId;
  }
  if (pedido === undefined) return porDefecto === 'YO' ? contexto.usuarioId : null;
  return pedido === 'yo' ? contexto.usuarioId : pedido;
}
