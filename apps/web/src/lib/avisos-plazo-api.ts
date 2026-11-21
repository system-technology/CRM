/**
 * Cliente de las notificaciones en la aplicación (T-255, contexto `notifications`).
 *
 *   GET  /api/v1/notificaciones?limite=         las del usuario de la sesión, no leídas primero
 *   POST /api/v1/notificaciones/:id/lectura     la marca leída (idempotente)
 *
 * Las respuestas se validan con los esquemas de `@viajapro/contracts` (R3). En demo
 * (`estaUsandoApiReal() === false`) se devuelven datos de ejemplo con la forma del contrato y
 * marcar leída es solo local (no hay servidor al que decírselo).
 */
import {
  type ListaDeNotificaciones,
  type Notificacion,
  ErrorApi as EsquemaError,
  ListaDeNotificaciones as EsquemaListaDeNotificaciones,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { estaUsandoApiReal } from './crm-api';
import { HORAS_HASTA_TIME_LIMIT_FILE_1043 } from './mock-archivos';

export class AvisosApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AvisosApiError';
  }
}

async function pedir(ruta: string, opciones: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}${ruta}`, {
      ...opciones,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...cabecerasDeTenantDev() },
      cache: 'no-store',
    });
  } catch {
    throw new AvisosApiError('ERROR_CONEXION', 'No se pudo conectar con el servidor.', 0);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = EsquemaError.safeParse(json);
    if (e.success) throw new AvisosApiError(e.data.error.code, e.data.error.message, res.status);
    throw new AvisosApiError(
      res.status === 401 ? 'SIN_SESION' : 'ERROR_SERVIDOR_AVISOS',
      `Error en la API de notificaciones (${res.status})`,
      res.status,
    );
  }
  return json;
}

/** Avisos de ejemplo del modo demostración, con la forma del contrato. Plazos relativos a «ahora».
 * Apuntan a los archivos que existen en `mock-archivos` (1043 y 1044): un aviso a un file inexistente
 * es justo lo que la campana no debe mostrar (T-322). */
export function crearAvisosDemo(ahoraMs: number = Date.now()): Notificacion[] {
  const h = 3_600_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  return [
    {
      id: '01932000-0000-7000-8000-0000000a0001',
      tipo: 'TIME_LIMIT_PROXIMO',
      archivoId: '00000000-0030-4000-8000-000000000001',
      reservaId: '01932000-0000-7000-8000-0000000c0001',
      archivoNumero: 1043,
      venceEn: iso(ahoraMs + HORAS_HASTA_TIME_LIMIT_FILE_1043 * h),
      leidaEn: null,
      creadaEn: iso(ahoraMs - h),
    },
    {
      id: '01932000-0000-7000-8000-0000000a0002',
      tipo: 'PAGO_TOTAL_PROXIMO',
      archivoId: '00000000-0030-4000-8000-000000000002',
      reservaId: '01932000-0000-7000-8000-0000000c0002',
      archivoNumero: 1044,
      venceEn: iso(ahoraMs + 6 * 24 * h),
      leidaEn: null,
      creadaEn: iso(ahoraMs - 4 * h),
    },
  ];
}

let leidasEnDemo = new Set<string>();

/** Solo para pruebas: olvida lo marcado en demo. */
export function reiniciarAvisosDemo(): void {
  leidasEnDemo = new Set();
}

export async function listarAvisos(limite = 50): Promise<ListaDeNotificaciones> {
  if (!estaUsandoApiReal()) {
    const ahora = new Date().toISOString();
    const datos = crearAvisosDemo().map((n) =>
      leidasEnDemo.has(n.id) ? { ...n, leidaEn: n.leidaEn ?? ahora } : n,
    );
    datos.sort((a, b) => Number(a.leidaEn !== null) - Number(b.leidaEn !== null));
    return { datos, noLeidas: datos.filter((n) => n.leidaEn === null).length };
  }
  const json = await pedir(`/api/v1/notificaciones?limite=${limite}`);
  const parseo = EsquemaListaDeNotificaciones.safeParse(json);
  if (!parseo.success) {
    throw new AvisosApiError('RESPUESTA_INVALIDA', 'La respuesta de notificaciones no es válida.');
  }
  return parseo.data;
}

/** Idempotente en el servidor. En demo solo recuerda localmente. */
export async function marcarAvisoLeido(id: string): Promise<void> {
  if (!estaUsandoApiReal()) {
    leidasEnDemo.add(id);
    return;
  }
  await pedir(`/api/v1/notificaciones/${encodeURIComponent(id)}/lectura`, { method: 'POST' });
}
