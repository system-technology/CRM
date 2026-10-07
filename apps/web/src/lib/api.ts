/**
 * Cliente de la API.
 *
 * Los tipos NO se declaran aquí: se importan de `@viajapro/contracts`, que es la fuente de
 * verdad (R3). Si esta capa inventara sus propios tipos, el día que cambie un contrato la web
 * compilaría igual y fallaría en ejecución.
 */

import {
  type CotizacionCalculada,
  type CotizarPaquete,
  CotizacionCalculada as EsquemaCotizacion,
  type Paquete,
} from '@viajapro/contracts';

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333';

/**
 * Cabecera de desarrollo mientras no existe el módulo de autenticación.
 *
 * Cuando exista, esto desaparece y el tenant se deriva del token de sesión. Hoy el servidor
 * solo la acepta con `APP_ENV=local`, así que no hay forma de usarla en otro entorno.
 */
const TENANT_DEMO = process.env['NEXT_PUBLIC_DEV_TENANT_ID'] ?? '';

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
  const res = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(TENANT_DEMO ? { 'x-dev-tenant-id': TENANT_DEMO } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const cuerpo = await res.json().catch(() => null);

  if (!res.ok) {
    // El servidor responde siempre con la forma { error: { code, message, details } }.
    // Se conserva el `code`: es contrato estable y la interfaz decide qué mostrar según él.
    const e = cuerpo?.error;
    throw new ErrorApi(
      e?.code ?? 'ERROR_DESCONOCIDO',
      e?.message ?? `La API respondió ${res.status}`,
      e?.details,
    );
  }

  return cuerpo as T;
}

export interface PaginaPaquetes {
  datos: Paquete[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

export const api = {
  listarPaquetes: () => pedir<PaginaPaquetes>('/api/v1/paquetes'),

  cotizar: async (entrada: CotizarPaquete): Promise<CotizacionCalculada> => {
    const bruto = await pedir<unknown>('/api/v1/paquetes/cotizar', {
      method: 'POST',
      body: JSON.stringify(entrada),
    });
    // Se valida la RESPUESTA, no solo la petición. Si el servidor cambia la forma de un campo,
    // el fallo aparece aquí con el nombre del campo, y no diez componentes más abajo como un
    // "undefined is not an object" sin pista de dónde vino.
    return EsquemaCotizacion.parse(bruto);
  },
};

/** Formatea dinero para mostrar. Nunca se usa para calcular: eso es del servidor. */
export function formatearDinero(d: { unidades: string; moneda: string }): string {
  const decimales = d.moneda === 'COP' ? 0 : 2;
  const valor = Number(d.unidades) / 10 ** decimales;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: d.moneda,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}
