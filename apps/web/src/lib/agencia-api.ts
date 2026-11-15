import { AjustesDeAgencia } from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';

/**
 * `GET /api/v1/agencia/ajustes`: datos de la agencia activa. Devuelve `null` si falla
 * (red, 403, formato) para que quien llama omita el dato en vez de inventarlo.
 */
export async function obtenerAjustesAgenciaApi(
  senal?: AbortSignal,
): Promise<AjustesDeAgencia | null> {
  try {
    const res = await fetch(`${obtenerBaseApi()}/api/v1/agencia/ajustes`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...cabecerasDeTenantDev() },
      credentials: 'include',
      ...(senal ? { signal: senal } : {}),
    });
    if (!res.ok) return null;
    const parseo = AjustesDeAgencia.safeParse(await res.json().catch(() => null));
    return parseo.success ? parseo.data : null;
  } catch {
    return null;
  }
}
