/**
 * Cliente del estado del canal de WhatsApp: `GET /api/v1/canales/whatsapp/estado`.
 * Tipos y validación de @viajapro/contracts (R3). Nunca recibe ni muestra token alguno.
 */
import { EstadoCanalWhatsapp, type CanalWhatsappEstado } from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';

export type { CanalWhatsappEstado, EstadoCanalWhatsapp };

export async function obtenerEstadoCanalWhatsapp(): Promise<EstadoCanalWhatsapp> {
  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}/api/v1/canales/whatsapp/estado`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { ...cabecerasDeTenantDev() },
    });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'No tienes permiso para ver el estado del canal.'
        : `El servidor no pudo informar el estado del canal (código ${res.status}).`,
    );
  }
  const cuerpo: unknown = await res.json().catch(() => null);
  const analizado = EstadoCanalWhatsapp.safeParse(cuerpo);
  if (!analizado.success) {
    throw new Error('La respuesta del servidor no tiene el formato esperado.');
  }
  return analizado.data;
}

const HORA_MS = 60 * 60 * 1000;

export interface VentanaDe24h {
  abierta: boolean;
  /** Frase lista para mostrar. */
  texto: string;
}

/** Estado de la ventana de 24 h según el último mensaje ENTRANTE del canal. */
export function ventanaDesdeUltimaRecepcion(
  ultimaRecepcionEn: string | null,
  ahora: number = Date.now(),
): VentanaDe24h {
  if (!ultimaRecepcionEn) {
    return {
      abierta: false,
      texto: 'Aún no ha llegado ningún mensaje de clientes a este número.',
    };
  }
  const restante = new Date(ultimaRecepcionEn).getTime() + 24 * HORA_MS - ahora;
  if (restante <= 0) {
    return {
      abierta: false,
      texto:
        'El último mensaje de un cliente llegó hace más de 24 horas. A quien no haya escrito antes solo puedes enviarle plantillas aprobadas.',
    };
  }
  const h = Math.floor(restante / HORA_MS);
  const m = Math.floor((restante % HORA_MS) / 60000);
  return {
    abierta: true,
    texto: `Un cliente escribió hace poco: puedes responderle con texto libre durante ${h} h ${m} min más.`,
  };
}

export function etiquetaEstado(e: CanalWhatsappEstado['estado']): string {
  return e === 'ACTIVO' ? 'Activo' : e === 'SUSPENDIDO' ? 'Suspendido' : 'Revocado';
}

export function formatearInstante(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}
