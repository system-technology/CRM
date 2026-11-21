/**
 * Cliente de `GET /api/v1/reportes/resumen?desde=&hasta=` (instantes UTC; `desde` inclusivo,
 * `hasta` exclusivo). Valida la consulta y la respuesta con los esquemas de `@viajapro/contracts`.
 * Sin caída a datos simulados: un fallo se lanza como `ErrorReportesApi`.
 */
import {
  AjustesDeAgencia,
  ConsultarResumenDeReportes,
  ErrorApi,
  ResumenDeReportes,
  type ResumenDeReportes as ResumenDeReportesTipo,
} from '@viajapro/contracts';
import { TEXTO_REPORTES_SOLO_ADMINISTRACION } from './alcance-de-vista';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { estaUsandoApiReal } from './crm-api';
import { crearResumenDeReportesDemo } from './mock-reportes-resumen';
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

export interface OpcionesDeResumen {
  /** `yo` (Míos) o el id de un asesor. Sin `reportes.ver_agencia` el servidor responde 403 si es ajeno. */
  asesorId?: string;
  /** Solo en demostración (sin API real): qué alcance simular. Con la API real lo decide el servidor. */
  alcanceDemo?: 'PROPIO' | 'AGENCIA';
}

export async function obtenerResumenDeReportesApi(
  rango: RangoDeInstantes,
  senal?: AbortSignal,
  opciones: OpcionesDeResumen = {},
): Promise<ResumenDeReportesTipo> {
  const consulta = ConsultarResumenDeReportes.safeParse({
    ...rango,
    ...(opciones.asesorId ? { asesorId: opciones.asesorId } : {}),
  });
  if (!consulta.success) {
    throw new ErrorReportesApi(
      'RANGO_INVALIDO',
      consulta.error.issues[0]?.message ?? 'El rango del reporte no es válido.',
    );
  }

  // Demostración: datos de maqueta con la forma del contrato; con la API real nunca se simula.
  if (!estaUsandoApiReal()) {
    return crearResumenDeReportesDemo(consulta.data, opciones.alcanceDemo ?? 'AGENCIA');
  }

  const params = new URLSearchParams({ desde: consulta.data.desde, hasta: consulta.data.hasta });
  if (consulta.data.asesorId) params.set('asesorId', consulta.data.asesorId);
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
        TEXTO_REPORTES_SOLO_ADMINISTRACION.titulo,
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

/**
 * `GET /api/v1/agencia/ajustes`: zona horaria IANA de la agencia (R9). Si falla (red, 403,
 * formato) devuelve `null` y quien llama usa el respaldo; nunca rompe el reporte.
 */
export async function obtenerZonaHorariaAgenciaApi(senal?: AbortSignal): Promise<string | null> {
  if (!estaUsandoApiReal()) return 'America/Bogota';
  try {
    const res = await fetch(`${obtenerBaseApi()}/api/v1/agencia/ajustes`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...cabecerasDeTenantDev() },
      credentials: 'include',
      ...(senal ? { signal: senal } : {}),
    });
    if (!res.ok) return null;
    const parseo = AjustesDeAgencia.safeParse(await res.json().catch(() => null));
    if (!parseo.success) return null;
    // Una zona que Intl no reconoce haría lanzar RangeError al calcular el periodo.
    new Intl.DateTimeFormat('es-CO', { timeZone: parseo.data.zonaHoraria });
    return parseo.data.zonaHoraria;
  } catch {
    return null;
  }
}
