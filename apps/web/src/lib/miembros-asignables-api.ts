/**
 * Cliente de `GET /api/v1/identidad/miembros/asignables` (ADR-0022, T-186): a quién se puede
 * reasignar una conversación. Solo `id` y `nombre`, validado con el contrato (R3).
 *
 * En modo maqueta (el mismo criterio que la bandeja) devuelve los asesores del mock; en modo real
 * nunca cae al mock: lanza `ErrorMiembrosAsignablesApi`.
 */
import {
  ErrorApi as EsquemaErrorApi,
  ListaDeMiembrosAsignables as EsquemaListaDeMiembrosAsignables,
  type MiembroAsignable,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { estaUsandoApiRealInbox } from './inbox-api';
import { ASESORES } from './mock-inbox';

export class ErrorMiembrosAsignablesApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null = null,
  ) {
    super(mensaje);
    this.name = 'ErrorMiembrosAsignablesApi';
  }
}

export async function listarMiembrosAsignablesApi(): Promise<MiembroAsignable[]> {
  if (!estaUsandoApiRealInbox()) {
    return ASESORES.map((a) => ({ id: a.id, nombre: a.nombre }));
  }

  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}/api/v1/identidad/miembros/asignables`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...cabecerasDeTenantDev() },
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ErrorMiembrosAsignablesApi(
      'ERROR_CONEXION',
      'No fue posible conectar con el servidor de ViajaPro.',
    );
  }

  if (!res.ok) {
    const err = EsquemaErrorApi.safeParse(await res.json().catch(() => null));
    throw new ErrorMiembrosAsignablesApi(
      err.success
        ? err.data.error.code
        : res.status === 403
          ? 'PERMISO_DENEGADO'
          : 'ERROR_SERVIDOR',
      res.status === 403
        ? 'No tienes permiso para ver a quién asignar.'
        : err.success
          ? err.data.error.message
          : `El servidor respondió con error ${res.status}.`,
      res.status,
    );
  }

  const parseo = EsquemaListaDeMiembrosAsignables.safeParse(await res.json().catch(() => null));
  if (!parseo.success) {
    throw new ErrorMiembrosAsignablesApi(
      'RESPUESTA_INVALIDA',
      'El servidor devolvió una lista de miembros con un formato inesperado.',
      res.status,
    );
  }
  return parseo.data;
}
