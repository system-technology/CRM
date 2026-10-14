/**
 * Cliente de API para el catálogo real y cotización de salidas (ADR-0009).
 *
 * Conforme a @viajapro/contracts (SalidaPublicada, CotizacionDeSalida, CotizarSalida).
 * Regla R3: Tipos estrictamente inferidos de contratos oficiales Zod.
 * Soporta conexión real a NestJS (/api/v1/catalogo) con reporte transparente de errores (0c.14 y 0c.16).
 */

import {
  type CotizacionDeSalida,
  type CotizarSalida,
  type SalidaPublicada,
  CotizacionDeSalida as EsquemaCotizacionDeSalida,
  SalidaPublicada as EsquemaSalidaPublicada,
  ErrorApi as EsquemaError,
} from '@viajapro/contracts';
import { z } from 'zod';

export function obtenerBaseApi(): string {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';
}

export function obtenerTenantDemo(): string {
  return process.env['NEXT_PUBLIC_DEV_TENANT_ID'] ?? '';
}

export function estaUsandoCatalogoReal(): boolean {
  return process.env['NEXT_PUBLIC_USE_REAL_CRM'] === 'true';
}

export class CatalogoApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CatalogoApiError';
  }
}

/** Esquema para respuesta del listado de salidas */
const EsquemaRespuestaSalidas = z.object({
  salidas: z.array(EsquemaSalidaPublicada),
});

/**
 * Petición genérica con cabecera tenant y validación de errores de dominio.
 */
async function pedirCatalogo<T>(ruta: string, init?: RequestInit): Promise<T> {
  const base = obtenerBaseApi();
  const tenantId = obtenerTenantDemo();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  if (tenantId) {
    headers['x-dev-tenant-id'] = tenantId;
  }

  const res = await fetch(`${base}${ruta}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorAnalizado = EsquemaError.safeParse(cuerpo);
    if (errorAnalizado.success) {
      const { code, message, details } = errorAnalizado.data.error;
      throw new CatalogoApiError(code, message, res.status, details);
    }
    // Errores HTTP estándar o sin sobre de dominio
    if (res.status === 401) {
      throw new CatalogoApiError(
        'SIN_SESION',
        'Falta identificar la agencia (x-dev-tenant-id). Verifique su configuración de desarrollo.',
        401,
      );
    }
    throw new CatalogoApiError(
      'ERROR_SERVIDOR',
      `La API de catálogo respondió con error HTTP ${res.status}`,
      res.status,
    );
  }

  return cuerpo as T;
}

export interface FiltroListarSalidas {
  desde: string; // AAAA-MM-DD
  hasta?: string;
  paqueteId?: string;
  limite?: number;
}

/**
 * Obtiene las salidas publicadas de la agencia a partir de una fecha.
 * GET /api/v1/catalogo/salidas
 */
export async function listarSalidasApi(filtro: FiltroListarSalidas): Promise<SalidaPublicada[]> {
  const params = new URLSearchParams();
  params.set('desde', filtro.desde);
  if (filtro.hasta) params.set('hasta', filtro.hasta);
  if (filtro.paqueteId) params.set('paqueteId', filtro.paqueteId);
  if (filtro.limite) params.set('limite', filtro.limite.toString());

  const bruto = await pedirCatalogo<unknown>(`/api/v1/catalogo/salidas?${params.toString()}`);
  const validado = EsquemaRespuestaSalidas.parse(bruto);
  return validado.salidas;
}

/**
 * Cotiza una salida o vigencia para un grupo de pasajeros.
 * POST /api/v1/catalogo/cotizar
 */
export type PeticionCotizarSalida = z.input<typeof CotizarSalida>;

export async function cotizarSalidaApi(
  peticion: PeticionCotizarSalida,
): Promise<CotizacionDeSalida> {
  const bruto = await pedirCatalogo<unknown>('/api/v1/catalogo/cotizar', {
    method: 'POST',
    body: JSON.stringify(peticion),
  });
  return EsquemaCotizacionDeSalida.parse(bruto);
}
