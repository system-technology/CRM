/**
 * Cliente de API para el módulo CRM (Pipeline, Oportunidades, Contactos y Ficha Lateral).
 *
 * Conforme a @viajapro/contracts (TableroPipeline, MoverOportunidad, Oportunidad, FichaDeContacto, PaginaContactos).
 * Regla R3: Tipos estrictamente inferidos de contratos oficiales.
 * Soporta conexión real a NestJS (/api/v1/crm) con fallback resiliente para entornos desconectados.
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

const BASE_API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';
const TENANT_DEMO = process.env['NEXT_PUBLIC_DEV_TENANT_ID'] ?? '';
const USAR_API_REAL = process.env['NEXT_PUBLIC_USE_REAL_CRM'] === 'true';

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(TENANT_DEMO ? { 'x-dev-tenant-id': TENANT_DEMO } : {}),
    ...(opciones.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_API}${ruta}`, {
    ...opciones,
    headers,
    cache: 'no-store',
  });

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
  if (USAR_API_REAL) {
    try {
      const { data } = await pedirCrm('/api/v1/crm/tablero');
      return TableroPipeline.parse(data);
    } catch (err) {
      // Si falla por red o la API no está levantada, fallback transparente a mock
      if (err instanceof CrmApiError) throw err;
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

  if (USAR_API_REAL) {
    try {
      const { data } = await pedirCrm(`/api/v1/crm/oportunidades/${id}/etapa`, {
        method: 'PATCH',
        body: JSON.stringify(validado),
      });
      return Oportunidad.parse(data);
    } catch (err) {
      if (err instanceof CrmApiError) throw err;
      console.warn('[CrmApi] Fallo al mover oportunidad en API. Usando cálculo local:', err);
    }
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
  if (USAR_API_REAL) {
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
  if (USAR_API_REAL) {
    try {
      const qs = buscar?.trim() ? `?buscar=${encodeURIComponent(buscar.trim())}` : '';
      const { data } = await pedirCrm(`/api/v1/crm/contactos${qs}`);
      return PaginaContactos.parse(data);
    } catch (err) {
      if (err instanceof CrmApiError) throw err;
      console.warn('[CrmApi] Fallo al listar contactos en API. Usando mock:', err);
    }
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
