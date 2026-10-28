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
  Contacto,
  CrearContacto,
  CrearOportunidadDeConversacion,
  EditarContacto,
  FichaDeContacto,
  MoverOportunidad,
  Oportunidad,
  PaginaContactos,
  PendientesDelDia,
  Seguimiento,
  TableroPipeline,
  ErrorApi as EsquemaError,
} from '@viajapro/contracts';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { moverOportunidadEnTablero } from './pipeline-logica';
import {
  actualizarContactoMock,
  crearContactoMock,
  crearOportunidadDeConversacionMock,
  obtenerMockFichaDeContacto,
  obtenerMockPendientesDelDia,
  completarMockSeguimiento,
} from './mock-crm';
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

import { calcularResumenTrabajo, type ResumenTrabajoDelDia } from './inicio-logica';
export type { ResumenTrabajoDelDia };

/**
 * Consulta y agrega métricas clave del trabajo diario para la pantalla de Inicio (T-037).
 * Carga en paralelo contadores de WhatsApp, oportunidades de pipeline y cotizaciones.
 */
export async function obtenerResumenTrabajoDelDia(): Promise<ResumenTrabajoDelDia> {
  const [tableroResult, inboxResult, cotizacionesResult] = await Promise.allSettled([
    obtenerTableroPipeline(),
    (async () => {
      try {
        const { inboxApi } = await import('./inbox-api');
        return await inboxApi.obtenerContadores();
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { listarCotizacionesApi } = await import('./cotizaciones-api');
        return await listarCotizacionesApi({ limite: 20 });
      } catch {
        return null;
      }
    })(),
  ]);

  const tablero = tableroResult.status === 'fulfilled' ? tableroResult.value : null;
  const contadoresInbox = inboxResult.status === 'fulfilled' ? inboxResult.value : null;
  const cotizaciones = cotizacionesResult.status === 'fulfilled' ? cotizacionesResult.value : null;

  return calcularResumenTrabajo(contadoresInbox, tablero, cotizaciones);
}

/**
 * Crea una oportunidad asociada a una conversación desde la bandeja (T-076).
 * POST /api/v1/crm/conversaciones/:id/oportunidades
 */
export async function crearOportunidadDeConversacionApi(
  conversacionId: string,
  datos: CrearOportunidadDeConversacion,
): Promise<Oportunidad> {
  const validado = CrearOportunidadDeConversacion.parse(datos);

  if (estaUsandoApiReal()) {
    const { data } = await pedirCrm(`/api/v1/crm/conversaciones/${conversacionId}/oportunidades`, {
      method: 'POST',
      body: JSON.stringify(validado),
    });
    return Oportunidad.parse(data);
  }

  return crearOportunidadDeConversacionMock(conversacionId, validado);
}

/**
 * Edita un contacto existente (T-076).
 * PATCH /api/v1/crm/contactos/:id
 */
export async function editarContactoApi(
  contactoId: string,
  datos: EditarContacto,
): Promise<Contacto> {
  const validado = EditarContacto.parse(datos);

  if (estaUsandoApiReal()) {
    const { data } = await pedirCrm(`/api/v1/crm/contactos/${contactoId}`, {
      method: 'PATCH',
      body: JSON.stringify(validado),
    });
    return Contacto.parse(data);
  }

  return actualizarContactoMock(contactoId, validado);
}

/**
 * Crea un nuevo contacto (T-075, T-076).
 * POST /api/v1/crm/contactos
 */
export async function crearContactoApi(datos: CrearContacto): Promise<Contacto> {
  const validado = CrearContacto.parse(datos);

  if (estaUsandoApiReal()) {
    const { data } = await pedirCrm('/api/v1/crm/contactos', {
      method: 'POST',
      body: JSON.stringify(validado),
    });
    return Contacto.parse(data);
  }

  return crearContactoMock(validado);
}

/**
 * Consulta los seguimientos pendientes del día (vencidos y para hoy) para el asesor en sesión.
 * GET /api/v1/crm/seguimientos/pendientes-del-dia[?asesorId=] (T-020)
 */
export async function obtenerPendientesDelDiaApi(asesorId?: string): Promise<PendientesDelDia> {
  if (estaUsandoApiReal()) {
    const qs = asesorId ? `?asesorId=${encodeURIComponent(asesorId)}` : '';
    const { data } = await pedirCrm(`/api/v1/crm/seguimientos/pendientes-del-dia${qs}`);
    return PendientesDelDia.parse(data);
  }

  return obtenerMockPendientesDelDia();
}

/**
 * Marca un seguimiento como completado de inmediato.
 * POST /api/v1/crm/seguimientos/:id/completar (T-020)
 */
export async function completarSeguimientoApi(id: string): Promise<Seguimiento> {
  if (estaUsandoApiReal()) {
    const { data } = await pedirCrm(`/api/v1/crm/seguimientos/${id}/completar`, {
      method: 'POST',
    });
    return Seguimiento.parse(data);
  }

  return completarMockSeguimiento(id);
}
