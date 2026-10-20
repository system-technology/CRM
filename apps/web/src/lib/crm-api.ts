/**
 * Cliente de API para el módulo CRM (Pipeline, Oportunidades, Contactos y Ficha Lateral).
 *
 * Conforme a @viajapro/contracts (TableroPipeline, MoverOportunidad, Oportunidad, FichaDeContacto, PaginaContactos).
 * Regla R3: Tipos estrictamente inferidos de contratos oficiales.
 * Soporta conexión real a NestJS (/api/v1/crm) con fallback resiliente para entornos desconectados
 * y reporte transparente de errores de configuración (0c.14).
 */

import {
  FichaDeContacto,
  MoverOportunidad,
  Oportunidad,
  PaginaContactos,
  TableroPipeline,
  ErrorApi as EsquemaError,
} from '@viajapro/contracts';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { moverOportunidadEnTablero } from './pipeline-logica';
import { obtenerMockFichaDeContacto } from './mock-crm';
import { obtenerMockPaginaContactos } from './mock-contactos';

export function obtenerBaseApi(): string {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';
}

export function obtenerTenantDemo(): string {
  return process.env['NEXT_PUBLIC_DEV_TENANT_ID'] ?? '';
}

export function estaUsandoApiReal(): boolean {
  return process.env['NEXT_PUBLIC_USE_REAL_CRM'] === 'true';
}

export class CrmApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CrmApiError';
  }
}

/**
 * Petición genérica con cabecera tenant y validación de errores del contrato.
 */
async function pedirCrm(
  ruta: string,
  opciones: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const tenant = obtenerTenantDemo().trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(tenant ? { 'x-dev-tenant-id': tenant } : {}),
    ...(opciones.headers as Record<string, string> | undefined),
  };

  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}${ruta}`, {
      ...opciones,
      headers,
      cache: 'no-store',
    });
  } catch (netErr) {
    throw new CrmApiError('ERROR_CONEXION', 'No se pudo conectar con el servidor CRM.', 0, {
      causa: netErr instanceof Error ? netErr.message : String(netErr),
    });
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorParsed = EsquemaError.safeParse(json);
    if (errorParsed.success) {
      throw new CrmApiError(
        errorParsed.data.error.code,
        errorParsed.data.error.message,
        res.status,
        errorParsed.data.error.details,
      );
    }
    throw new CrmApiError(
      'ERROR_SERVIDOR_CRM',
      `Error en API CRM (${res.status}): ${res.statusText}`,
      res.status,
    );
  }

  return { ok: true, status: res.status, data: json };
}

/**
 * Obtiene el tablero del pipeline Kanban con columnas y totales precalculados.
 * GET /api/v1/crm/tablero
 */
export async function obtenerTableroPipeline(): Promise<TableroPipeline> {
  if (estaUsandoApiReal()) {
    const tenant = obtenerTenantDemo().trim();
    if (!tenant) {
      throw new CrmApiError(
        'CONFIG_TENANT_FALTANTE',
        'El interruptor NEXT_PUBLIC_USE_REAL_CRM está activo, pero falta NEXT_PUBLIC_DEV_TENANT_ID en el archivo .env. Ejecuta "pnpm db:seed" para generar la agencia demo y añade su ID a .env.',
        401,
      );
    }

    try {
      const { data } = await pedirCrm('/api/v1/crm/tablero');
      return TableroPipeline.parse(data);
    } catch (err) {
      // Si la API respondió 401 o error controlado, relanzar para advertir configuración rota
      if (err instanceof CrmApiError) throw err;
      // Si fue fallo de red (servidor caído), fallback resiliente a mock
      console.warn('[CrmApi] Fallo de conexión a NestJS. Usando mock offline:', err);
    }
  }

  return obtenerMockTableroPipeline();
}

/**
 * Mueve una oportunidad a otra etapa, aplicando la regla de motivo de pérdida.
 * PATCH /api/v1/crm/oportunidades/:id/etapa
 */
export async function moverOportunidadDeEtapa(
  id: string,
  movimiento: MoverOportunidad,
): Promise<Oportunidad> {
  const validado = MoverOportunidad.parse(movimiento);

  if (estaUsandoApiReal()) {
    const { data } = await pedirCrm(`/api/v1/crm/oportunidades/${id}/etapa`, {
      method: 'PATCH',
      body: JSON.stringify(validado),
    });
    return Oportunidad.parse(data);
  }

  // Fallback local: mover en el tablero mock
  const tableroActual = obtenerMockTableroPipeline();
  const tableroNuevo = moverOportunidadEnTablero(tableroActual, id, validado);
  for (const col of tableroNuevo.columnas) {
    const op = col.oportunidades.find((o) => o.id === id);
    if (op) return op;
  }

  throw new CrmApiError('OPORTUNIDAD_NO_ENCONTRADA', `Oportunidad ${id} no encontrada`, 404);
}

/**
 * Obtiene la ficha completa del contacto para el panel lateral de la bandeja.
 * GET /api/v1/crm/contactos/:id/ficha
 */
export async function obtenerFichaDeContacto(contactoId: string): Promise<FichaDeContacto> {
  if (estaUsandoApiReal()) {
    try {
      const { data } = await pedirCrm(`/api/v1/crm/contactos/${contactoId}/ficha`);
      return FichaDeContacto.parse(data);
    } catch (err) {
      if (err instanceof CrmApiError) throw err;
      console.warn('[CrmApi] Fallo al consultar ficha en API. Usando mock:', err);
    }
  }

  return obtenerMockFichaDeContacto(contactoId);
}

/**
 * Lista contactos con filtro opcional de búsqueda por nombre o teléfono.
 * GET /api/v1/crm/contactos?buscar=...
 */
export async function listarContactos(buscar?: string): Promise<PaginaContactos> {
  if (estaUsandoApiReal()) {
    const qs = buscar?.trim() ? `?buscar=${encodeURIComponent(buscar.trim())}` : '';
    const { data } = await pedirCrm(`/api/v1/crm/contactos${qs}`);
    return PaginaContactos.parse(data);
  }

  const mock = obtenerMockPaginaContactos();
  if (buscar?.trim()) {
    const termino = buscar.trim().toLowerCase();
    const filtrados = mock.datos.filter(
      (c) => (c.nombre && c.nombre.toLowerCase().includes(termino)) || c.telefono.includes(termino),
    );
    return {
      datos: filtrados,
      pageInfo: { nextCursor: null, hasMore: false },
    };
  }

  return mock;
}
