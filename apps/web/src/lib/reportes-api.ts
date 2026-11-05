/**
 * Cliente de `GET /api/v1/reportes/resumen?desde=&hasta=` (instantes UTC; `desde` inclusivo,
 * `hasta` exclusivo). Valida la consulta y la respuesta con los esquemas de `@viajapro/contracts`.
 * Sin caída a datos simulados: un fallo se lanza como `ErrorReportesApi`.
 */
import {
  ConsultarResumenDeReportes,
  ErrorApi,
  ResumenDeReportes,
  type ResumenDeReportes as ResumenDeReportesTipo,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import type { RangoDeInstantes } from './reportes-periodo';

export class ErrorReportesApi extends Error {
  readonly codigo: string;
  readonly estado: number | null;

  constructor(codigo: string, mensaje: string, estado: number | null = null) {
    super(mensaje);
    this.name = 'ErrorReportesApi';
    this.codigo = codigo;
    this.estado = estado;
  }
}

export async function obtenerResumenDeReportesApi(
  rango: RangoDeInstantes,
  senal?: AbortSignal,
): Promise<ResumenDeReportesTipo> {
  const consulta = ConsultarResumenDeReportes.safeParse(rango);
  if (!consulta.success) {
    throw new ErrorReportesApi(
      'RANGO_INVALIDO',
      consulta.error.issues[0]?.message ?? 'El rango del reporte no es válido.',
    );
  }

  const params = new URLSearchParams({ desde: consulta.data.desde, hasta: consulta.data.hasta });
  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}/api/v1/reportes/resumen?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...cabecerasDeTenantDev() },
      credentials: 'include',
      ...(senal ? { signal: senal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ErrorReportesApi(
      'ERROR_CONEXION',
      'No fue posible conectar con el servidor de ViajaPro.',
    );
  }

  if (!res.ok) {
    const err = ErrorApi.safeParse(await res.json().catch(() => null));
    if (res.status === 403) {
      throw new ErrorReportesApi(
        err.success ? err.data.error.code : 'PERMISO_DENEGADO',
        'No tienes permiso para ver los reportes.',
        403,
      );
    }
    throw new ErrorReportesApi(
      err.success ? err.data.error.code : 'ERROR_SERVIDOR',
      err.success ? err.data.error.message : `El servidor respondió con error ${res.status}.`,
      res.status,
    );
  }

  const parseo = ResumenDeReportes.safeParse(await res.json().catch(() => null));
  if (!parseo.success) {
    throw new ErrorReportesApi(
      'RESPUESTA_INVALIDA',
      'El servidor devolvió un reporte con un formato inesperado.',
      res.status,
    );
  }
  return parseo.data;
}
