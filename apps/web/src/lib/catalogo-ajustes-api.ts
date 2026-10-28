/**
 * Cliente de API para los ajustes de catálogo de la agencia (T-028).
 *
 * Endpoints conforme a ADR-0017 §9 (D3) y @viajapro/contracts:
 * - `GET   /api/v1/catalogo/ajustes`: Obtiene la configuración activa (promoVencida).
 * - `PATCH /api/v1/catalogo/ajustes`: Actualiza la política promoVencida ('OCULTAR' | 'TACHAR').
 */

import {
  AjustesDeCatalogo,
  type ActualizarAjustesDeCatalogo,
  ErrorApi as EsquemaError,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';

const AJUSTES_POR_DEFECTO: AjustesDeCatalogo = {
  promoVencida: 'OCULTAR',
};

async function pedirApi<T>(ruta: string, init?: RequestInit): Promise<T> {
  const base = obtenerBaseApi();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...cabecerasDeTenantDev(),
    ...(init?.headers as Record<string, string>),
  };

  const res = await fetch(`${base}${ruta}`, {
    ...init,
    credentials: 'include',
    headers,
    cache: 'no-store',
  });

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorAnalizado = EsquemaError.safeParse(cuerpo);
    if (errorAnalizado.success) {
      throw new Error(`${errorAnalizado.data.error.code}: ${errorAnalizado.data.error.message}`);
    }
    throw new Error(`Error en API (${res.status}): ${ruta}`);
  }

  return cuerpo as T;
}

/**
 * Consulta la política promo_vencida configurada para el tenant.
 * GET /api/v1/catalogo/ajustes
 */
export async function obtenerAjustesCatalogoApi(): Promise<AjustesDeCatalogo> {
  try {
    const datos = await pedirApi<unknown>('/api/v1/catalogo/ajustes');
    return AjustesDeCatalogo.parse(datos);
  } catch {
    // Si la API no está disponible en modo offline/mock, retorna los valores por defecto del sistema (OCULTAR)
    return AJUSTES_POR_DEFECTO;
  }
}

/**
 * Actualiza la política promo_vencida para el tenant.
 * PATCH /api/v1/catalogo/ajustes
 */
export async function actualizarAjustesCatalogoApi(
  cambios: ActualizarAjustesDeCatalogo,
): Promise<AjustesDeCatalogo> {
  const datos = await pedirApi<unknown>('/api/v1/catalogo/ajustes', {
    method: 'PATCH',
    body: JSON.stringify(cambios),
  });
  return AjustesDeCatalogo.parse(datos);
}
