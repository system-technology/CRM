/**
 * Cliente de API para la Bandeja de Entrada de WhatsApp (/bandeja).
 *
 * Sigue el patrón estricto de la casa (api.ts):
 * - Los tipos e interfaces provienen exclusivamente de `@viajapro/contracts` (R3).
 * - Valida TANTO las peticiones COMO las respuestas con esquemas Zod (safeParse/parse).
 * - Soporta interruptor por variable de entorno `NEXT_PUBLIC_USE_REAL_INBOX` (o `NEXT_PUBLIC_USE_MOCK_INBOX`).
 * - Manejo especializado de errores del contrato (ej. `VENTANA_CERRADA`).
 */

import {
  ConversacionDetalle as EsquemaConversacionDetalle,
  ConversacionResumen as EsquemaConversacionResumen,
  ErrorApi as EsquemaError,
  Mensaje as EsquemaMensaje,
  PaginaBandeja as EsquemaPaginaBandeja,
  type AsignarConversacion,
  type CambiarEstadoConversacion,
  type ConsultarBandeja,
  type ConversacionDetalle,
  type ConversacionResumen,
  type CrearNota,
  type EnviarTexto,
  type Mensaje,
  type PaginaBandeja,
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

// Interruptor por variable de entorno: Si NEXT_PUBLIC_USE_REAL_INBOX === 'true', se conecta a la API NestJS real.
export function estaUsandoApiRealInbox(): boolean {
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

      // Traducción útil de errores de contrato de dominio
      if (code === 'VENTANA_CERRADA') {
        throw new InboxErrorApi(
          code,
          'Ventana de servicio de 24 horas expirada. No se pueden enviar mensajes de texto libre fuera de la ventana de servicio por políticas de Meta. Utilice una plantilla HSM aprobada.',
          details,
        );
      }

      throw new InboxErrorApi(code, message, details);
    }
    throw new InboxErrorApi('RESPUESTA_NO_RECONOCIDA', `La API de inbox respondió ${res.status}`);
  }

  return cuerpo as T;
}

export const inboxApi = {
  /**
   * Consulta las conversaciones de la bandeja con filtros, búsqueda y paginación por cursor.
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

    const bruto = await pedirInbox<unknown>(`/api/v1/inbox/conversaciones?${params.toString()}`);
    return EsquemaPaginaBandeja.parse(bruto);
  },

  /**
   * Obtiene el detalle completo de una conversación abierta con su historial y notas.
   */
  obtenerConversacionDetalle: async (id: string): Promise<ConversacionDetalle | null> => {
    if (!estaUsandoApiRealInbox()) {
      return obtenerConversacionDetalleMock(id);
    }

    const bruto = await pedirInbox<unknown>(`/api/v1/inbox/conversaciones/${id}`);
    if (!bruto) return null;
    return EsquemaConversacionDetalle.parse(bruto);
  },

  /**
   * Envía un mensaje de texto dentro de la conversación respetando la ventana de 24h y la clave de idempotencia (R5).
   */
  enviarTexto: async (entrada: EnviarTexto): Promise<Mensaje> => {
    if (!estaUsandoApiRealInbox()) {
      return enviarTextoMock(entrada);
    }

    const bruto = await pedirInbox<unknown>(
      `/api/v1/inbox/conversaciones/${entrada.conversacionId}/mensajes`,
      {
        method: 'POST',
        body: JSON.stringify(entrada),
      },
    );
    return EsquemaMensaje.parse(bruto);
  },

  /**
   * Asigna o desasigna una conversación a un asesor.
   */
  asignarConversacion: async (entrada: AsignarConversacion): Promise<ConversacionResumen> => {
    if (!estaUsandoApiRealInbox()) {
      return asignarConversacionMock(entrada);
    }

    const bruto = await pedirInbox<unknown>(
      `/api/v1/inbox/conversaciones/${entrada.conversacionId}/asignar`,
      {
        method: 'POST',
        body: JSON.stringify(entrada),
      },
    );
    return EsquemaConversacionResumen.parse(bruto);
  },

  /**
   * Cambia el estado de una conversación (ABIERTA, EN_ESPERA, CERRADA).
   */
  cambiarEstado: async (entrada: CambiarEstadoConversacion): Promise<ConversacionResumen> => {
    if (!estaUsandoApiRealInbox()) {
      return cambiarEstadoConversacionMock(entrada);
    }

    const bruto = await pedirInbox<unknown>(
      `/api/v1/inbox/conversaciones/${entrada.conversacionId}/estado`,
      {
        method: 'POST',
        body: JSON.stringify(entrada),
      },
    );
    return EsquemaConversacionResumen.parse(bruto);
  },

  /**
   * Crea una nota interna para el equipo.
   */
  crearNota: async (entrada: CrearNota): Promise<ConversacionDetalle['notas'][number]> => {
    if (!estaUsandoApiRealInbox()) {
      return crearNotaMock(entrada);
    }

    const bruto = await pedirInbox<unknown>(
      `/api/v1/inbox/conversaciones/${entrada.conversacionId}/notas`,
      {
        method: 'POST',
        body: JSON.stringify(entrada),
      },
    );
    return bruto as ConversacionDetalle['notas'][number];
  },

  /** Informa si la app está ejecutándose contra el cliente real o el simulado */
  isModoReal: (): boolean => estaUsandoApiRealInbox(),
};
