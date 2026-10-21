/**
 * Cliente de API para la Bandeja de Entrada de WhatsApp (/bandeja).
 * Conecta contra las rutas reales de NestJS en /api/v1/conversaciones (0c.35).
 *
 * Sigue el patrón estricto de la casa (api.ts):
 * - Tipos e interfaces provienen exclusivamente de `@viajapro/contracts` (R3).
 * - Valida TANTO las peticiones COMO las respuestas con esquemas Zod.
 * - Soporta interruptor por variable de entorno `NEXT_PUBLIC_USE_REAL_INBOX` / `NEXT_PUBLIC_USE_MOCK_INBOX`.
 * - Envía siempre la cookie de sesión con `credentials: 'include'`.
 * - Manejo especializado de errores del contrato (ej. `VENTANA_CERRADA`, `CONVERSACION_NO_ENCONTRADA`).
 */

import {
  ConversacionDetalle as EsquemaConversacionDetalle,
  ConversacionResumen as EsquemaConversacionResumen,
  ErrorApi as EsquemaError,
  Mensaje as EsquemaMensaje,
  PaginaBandeja as EsquemaPaginaBandeja,
  PaginaMensajes as EsquemaPaginaMensajes,
  ContadoresBandeja as EsquemaContadoresBandeja,
  NotaDeConversacion as EsquemaNotaDeConversacion,
  ListaDeNotas as EsquemaListaDeNotas,
  EnviarTextoCuerpo as EsquemaEnviarTextoCuerpo,
  AsignarConversacionCuerpo as EsquemaAsignarConversacionCuerpo,
  CambiarEstadoCuerpo as EsquemaCambiarEstadoCuerpo,
  CrearNotaCuerpo as EsquemaCrearNotaCuerpo,
  type AsignarConversacion,
  type CambiarEstadoConversacion,
  type ConsultarBandeja,
  type ConsultarMensajes,
  type ConversacionDetalle,
  type ConversacionResumen,
  type CrearNota,
  type EnviarTexto,
  type Mensaje,
  type PaginaBandeja,
  type PaginaMensajes,
  type ContadoresBandeja,
  type NotaDeConversacion,
} from '@viajapro/contracts';
import {
  asignarConversacionMock,
  cambiarEstadoConversacionMock,
  consultarBandejaMock,
  crearNotaMock,
  enviarTextoMock,
  obtenerConversacionDetalleMock,
} from './mock-inbox';

const BASE_API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';
const TENANT_DEMO = process.env['NEXT_PUBLIC_DEV_TENANT_ID'] ?? '';

/**
 * Determina si la bandeja consulta la API REST real de NestJS o el mock en memoria.
 */
export function estaUsandoApiRealInbox(): boolean {
  if (process.env['NEXT_PUBLIC_USE_MOCK_INBOX'] === 'true') {
    return false;
  }
  return process.env['NEXT_PUBLIC_USE_REAL_INBOX'] === 'true';
}

export class InboxErrorApi extends Error {
  constructor(
    readonly code: string,
    mensaje: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'InboxErrorApi';
  }
}

async function pedirInbox<T>(ruta: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API}${ruta}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(TENANT_DEMO ? { 'x-dev-tenant-id': TENANT_DEMO } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch (netErr) {
    throw new InboxErrorApi('ERROR_CONEXION', 'No se pudo conectar con el servidor de inbox.', {
      causa: netErr instanceof Error ? netErr.message : String(netErr),
    });
  }

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const analizado = EsquemaError.safeParse(cuerpo);
    if (analizado.success) {
      const { code, message, details } = analizado.data.error;

      if (code === 'VENTANA_CERRADA') {
        throw new InboxErrorApi(
          code,
          'Ventana de servicio de 24 horas expirada. No se pueden enviar mensajes de texto libre fuera de la ventana de servicio por políticas de Meta. Utilice una plantilla HSM aprobada.',
          details,
        );
      }

      if (code === 'CONVERSACION_NO_ENCONTRADA' || res.status === 404) {
        throw new InboxErrorApi(
          'CONVERSACION_NO_ENCONTRADA',
          'La conversación no existe o fue reasignada a otro asesor.',
          details,
        );
      }

      throw new InboxErrorApi(code, message, details);
    }

    if (res.status === 404) {
      throw new InboxErrorApi(
        'CONVERSACION_NO_ENCONTRADA',
        'La conversación no existe o fue reasignada a otro asesor.',
      );
    }

    throw new InboxErrorApi('RESPUESTA_NO_RECONOCIDA', `La API de inbox respondió ${res.status}`);
  }

  return cuerpo as T;
}

export const inboxApi = {
  /**
   * Consulta las conversaciones de la bandeja con filtros, búsqueda y paginación por cursor.
   * GET /api/v1/conversaciones
   */
  consultarBandeja: async (consulta: ConsultarBandeja): Promise<PaginaBandeja> => {
    if (!estaUsandoApiRealInbox()) {
      return consultarBandejaMock(consulta);
    }

    const params = new URLSearchParams();
    if (consulta.filtro) params.set('filtro', consulta.filtro);
    if (consulta.buscar) params.set('buscar', consulta.buscar);
    if (consulta.estado) params.set('estado', consulta.estado);
    if (consulta.cursor) params.set('cursor', consulta.cursor);
    if (consulta.limite) params.set('limite', consulta.limite.toString());

    const bruto = await pedirInbox<unknown>(`/api/v1/conversaciones?${params.toString()}`);
    return EsquemaPaginaBandeja.parse(bruto);
  },

  /**
   * Consulta contadores de la bandeja para el usuario activo bajo las reglas de visibilidad.
   * GET /api/v1/conversaciones/contadores
   */
  obtenerContadores: async (): Promise<ContadoresBandeja> => {
    if (!estaUsandoApiRealInbox()) {
      return {
        todas: 0,
        mias: 0,
        sinAsignar: 0,
        conversacionesSinLeer: 0,
        mensajesSinLeer: 0,
      };
    }
    const bruto = await pedirInbox<unknown>('/api/v1/conversaciones/contadores');
    return EsquemaContadoresBandeja.parse(bruto);
  },

  /**
   * Obtiene el detalle completo de una conversación abierta con su historial y notas.
   * GET /api/v1/conversaciones/:id
   */
  obtenerConversacionDetalle: async (id: string): Promise<ConversacionDetalle | null> => {
    if (!estaUsandoApiRealInbox()) {
      return obtenerConversacionDetalleMock(id);
    }

    try {
      const bruto = await pedirInbox<unknown>(`/api/v1/conversaciones/${id}`);
      if (!bruto) return null;
      return EsquemaConversacionDetalle.parse(bruto);
    } catch (err) {
      if (err instanceof InboxErrorApi && err.code === 'CONVERSACION_NO_ENCONTRADA') {
        return null;
      }
      throw err;
    }
  },

  /**
   * Consulta los mensajes paginados de un hilo.
   * GET /api/v1/conversaciones/:id/mensajes
   */
  obtenerMensajes: async (
    id: string,
    consulta?: Partial<ConsultarMensajes>,
  ): Promise<PaginaMensajes> => {
    if (!estaUsandoApiRealInbox()) {
      const detalle = await obtenerConversacionDetalleMock(id);
      return {
        datos: detalle?.mensajes ?? [],
        pageInfo: { nextCursor: null, hasMore: false },
      };
    }

    const params = new URLSearchParams();
    if (consulta?.cursor) params.set('cursor', consulta.cursor);
    if (consulta?.limite) params.set('limite', consulta.limite.toString());

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const bruto = await pedirInbox<unknown>(`/api/v1/conversaciones/${id}/mensajes${queryStr}`);
    return EsquemaPaginaMensajes.parse(bruto);
  },

  /**
   * Envía un mensaje de texto dentro de la conversación respetando la ventana de 24h y la clave de idempotencia (R5).
   * Responder autoasigna la conversación si estaba sin asignar.
   * POST /api/v1/conversaciones/:id/mensajes
   */
  enviarTexto: async (entrada: EnviarTexto): Promise<Mensaje> => {
    if (!estaUsandoApiRealInbox()) {
      return enviarTextoMock(entrada);
    }

    const cuerpo = EsquemaEnviarTextoCuerpo.parse({
      texto: entrada.texto,
      claveIdempotencia: entrada.claveIdempotencia,
    });

    const bruto = await pedirInbox<unknown>(
      `/api/v1/conversaciones/${entrada.conversacionId}/mensajes`,
      {
        method: 'POST',
        body: JSON.stringify(cuerpo),
      },
    );
    return EsquemaMensaje.parse(bruto);
  },

  /**
   * Asigna, reasigna o desasigna (soltar) una conversación a un asesor de la agencia.
   * PUT /api/v1/conversaciones/:id/asignacion
   */
  asignarConversacion: async (entrada: AsignarConversacion): Promise<ConversacionResumen> => {
    if (!estaUsandoApiRealInbox()) {
      return asignarConversacionMock(entrada);
    }

    const cuerpo = EsquemaAsignarConversacionCuerpo.parse({
      usuarioId: entrada.usuarioId,
    });

    const bruto = await pedirInbox<unknown>(
      `/api/v1/conversaciones/${entrada.conversacionId}/asignacion`,
      {
        method: 'PUT',
        body: JSON.stringify(cuerpo),
      },
    );
    return EsquemaConversacionResumen.parse(bruto);
  },

  /**
   * Cambia el estado de una conversación (ABIERTA, EN_ESPERA, CERRADA).
   * PATCH /api/v1/conversaciones/:id/estado
   */
  cambiarEstado: async (entrada: CambiarEstadoConversacion): Promise<ConversacionResumen> => {
    if (!estaUsandoApiRealInbox()) {
      return cambiarEstadoConversacionMock(entrada);
    }

    const cuerpo = EsquemaCambiarEstadoCuerpo.parse({
      estado: entrada.estado,
    });

    const bruto = await pedirInbox<unknown>(
      `/api/v1/conversaciones/${entrada.conversacionId}/estado`,
      {
        method: 'PATCH',
        body: JSON.stringify(cuerpo),
      },
    );
    return EsquemaConversacionResumen.parse(bruto);
  },

  /**
   * Crea una nota interna para el equipo.
   * POST /api/v1/conversaciones/:id/notas
   */
  crearNota: async (entrada: CrearNota): Promise<NotaDeConversacion> => {
    if (!estaUsandoApiRealInbox()) {
      return crearNotaMock(entrada);
    }

    const cuerpo = EsquemaCrearNotaCuerpo.parse({
      texto: entrada.texto,
    });

    const bruto = await pedirInbox<unknown>(
      `/api/v1/conversaciones/${entrada.conversacionId}/notas`,
      {
        method: 'POST',
        body: JSON.stringify(cuerpo),
      },
    );
    return EsquemaNotaDeConversacion.parse(bruto);
  },

  /**
   * Consulta las notas internas de una conversación.
   * GET /api/v1/conversaciones/:id/notas
   */
  obtenerNotas: async (id: string): Promise<NotaDeConversacion[]> => {
    if (!estaUsandoApiRealInbox()) {
      const detalle = await obtenerConversacionDetalleMock(id);
      return detalle?.notas ?? [];
    }

    const bruto = await pedirInbox<unknown>(`/api/v1/conversaciones/${id}/notas`);
    const lista = EsquemaListaDeNotas.parse(bruto);
    return lista.datos;
  },

  /**
   * Marca los mensajes de una conversación como leídos.
   * POST /api/v1/conversaciones/:id/leida
   */
  marcarLeida: async (id: string): Promise<void> => {
    if (!estaUsandoApiRealInbox()) {
      return;
    }

    await pedirInbox<unknown>(`/api/v1/conversaciones/${id}/leida`, {
      method: 'POST',
    });
  },

  /** Informa si la app está ejecutándose contra el cliente real o el simulado */
  isModoReal: (): boolean => estaUsandoApiRealInbox(),
};
