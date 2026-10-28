import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { obtenerBaseApi } from './api-base';
/**
 * Cliente de la API.
 *
 * Los tipos NO se declaran aquí: se importan de `@viajapro/contracts`, que es la fuente de
 * verdad (R3). Si esta capa inventara sus propios tipos, el día que cambie un contrato la web
 * compilaría igual y fallaría en ejecución.
 */

import { ErrorApi as EsquemaError, type Paquete } from '@viajapro/contracts';
import { cotizarSalidaApi } from './catalogo-api';

/**
 * Cabecera de desarrollo mientras no existe el módulo de autenticación.
 *
 * Cuando exista, esto desaparece y el tenant se deriva del token de sesión. Hoy el servidor
 * solo la acepta con `APP_ENV=local`, así que no hay forma de usarla en otro entorno.
 */

export class ErrorApi extends Error {
  constructor(
    readonly code: string,
    mensaje: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${obtenerBaseApi()}${ruta}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...cabecerasDeTenantDev(),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    // El sobre de error también es contrato: { error: { code, message, details } }. Se valida
    // con su esquema en vez de leerlo a tientas, porque la ruta de error es justamente la que
    // menos se ejercita — si el servidor cambiara su forma, nadie lo notaría hasta que algo
    // fallara en producción y el usuario viera "undefined".
    const analizado = EsquemaError.safeParse(cuerpo);
    if (analizado.success) {
      const { code, message, details } = analizado.data.error;
      throw new ErrorApi(code, message, details);
    }
    // Un error que no respeta el contrato: pasarela caída, 502 en HTML, tiempo agotado.
    throw new ErrorApi('RESPUESTA_NO_RECONOCIDA', `La API respondió ${res.status}`);
  }

  return cuerpo as T;
}

export interface PaginaPaquetes {
  datos: Paquete[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

export const api = {
  listarPaquetes: () => pedir<PaginaPaquetes>('/api/v1/paquetes'),
  cotizarSalida: cotizarSalidaApi,
};

export { cotizarSalidaApi } from './catalogo-api';

/**
 * Helpers únicos de formato es-CO (T-022).
 * Centralizados en ./formato para garantizar consistencia en todo el CRM.
 */
export {
  formatearDinero,
  formatearCOP,
  formatearDineroCifra,
  formatearFecha,
  formatearFechaHora,
  formatearTelefono,
  formatearCupo,
} from './formato';
