import { inboxApi } from './inbox-api';
import { listarCotizacionesApi } from './cotizaciones-api';
import {
  agregarMetricasConversaciones,
  agregarMetricasPipeline,
  agregarMetricasCotizaciones,
  type MetricasConversacionesInicio,
  type MetricasPipelineInicio,
  type MetricasCotizacionesInicio,
} from './inicio-logica';
import { esModoDemo } from './modo-demo';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { usaAuthReal, haySesionActiva } from './auth-api';
import { obtenerBaseApi } from './api-base';
export { obtenerBaseApi };
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

// Re-exportado de api-base (ADR-0011 §2)

export function obtenerTenantDemo(): string {
  return process.env['NEXT_PUBLIC_DEV_TENANT_ID'] ?? '';
}

export function estaUsandoApiReal(): boolean {
  if (esModoDemo()) {
    return false;
  }
  if (process.env['NEXT_PUBLIC_USE_REAL_CRM'] === 'false') {
    return false;
  }
  if (process.env['NEXT_PUBLIC_USE_REAL_CRM'] === 'true') {
    return true;
  }
  // En pruebas unitarias Vitest sin servidor ni variable explícita, usar mock
  if (process.env['VITEST'] === 'true' && !haySesionActiva()) {
    return false;
  }
  // En ejecución real (browser o con sesión): API REAL POR DEFECTO
  return true;
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...cabecerasDeTenantDev(),
    ...(opciones.headers as Record<string, string> | undefined),
  };

  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}${ruta}`, {
      ...opciones,
      credentials: 'include',
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
    if (!usaAuthReal()) {
      const tenant = obtenerTenantDemo().trim();
      if (!tenant) {
        throw new CrmApiError(
          'CONFIG_TENANT_FALTANTE',
          'El interruptor NEXT_PUBLIC_USE_REAL_CRM está activo, pero falta NEXT_PUBLIC_DEV_TENANT_ID en el archivo .env. Ejecuta "pnpm db:seed" para generar la agencia demo y añade su ID a .env.',
          401,
        );
      }
    }

    const { data } = await pedirCrm('/api/v1/crm/tablero');
    return TableroPipeline.parse(data);
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
    const { data } = await pedirCrm(`/api/v1/crm/contactos/${contactoId}/ficha`);
    return FichaDeContacto.parse(data);
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

export interface ResumenInicioAsesor {
  conversaciones: MetricasConversacionesInicio;
  pipeline: MetricasPipelineInicio;
  cotizaciones: MetricasCotizacionesInicio;
}

/**
 * Consulta agregada para el panel de inicio del asesor comercial (T-020).
 * Consume en paralelo la bandeja de WhatsApp, el tablero CRM y el listado de cotizaciones.
 */
export async function consultarResumenInicioAsesor(): Promise<ResumenInicioAsesor> {
  const [resBandeja, contadores, tablero, cotizaciones] = await Promise.all([
    inboxApi.consultarBandeja({ filtro: 'TODAS', limite: 20 }),
    inboxApi.obtenerContadores().catch(() => undefined),
    obtenerTableroPipeline(),
    listarCotizacionesApi({ limite: 20 })
      .then((r) => r.datos)
      .catch(() => []),
  ]);

  return {
    conversaciones: agregarMetricasConversaciones(resBandeja.datos, contadores),
    pipeline: agregarMetricasPipeline(tablero),
    cotizaciones: agregarMetricasCotizaciones(cotizaciones),
  };
}
