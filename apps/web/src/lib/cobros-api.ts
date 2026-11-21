/**
 * Cliente de la API de cobros del viajero (T-331, ADR-0034 §8). Conforme a `@viajapro/contracts`
 * (R3): las respuestas se validan con los esquemas, no con tipos a mano.
 *
 * **El saldo se pide, no se calcula.** `GET /api/v1/archivos/:id/cobro` devuelve total, pagado,
 * saldo, situación, estado e historial ya derivados de los movimientos; esta capa no suma nada.
 * Lo mismo tras registrar: la respuesta trae el cobro recalculado y es ese el que se pinta.
 *
 * Maqueta vs real: igual que el resto de la web (`estaUsandoApiReal()`). En demo se lee de
 * `mock-cobros` y registrar se rechaza con `MODO_DEMO`: un pago que no se guarda no debe parecer
 * guardado.
 */
import {
  CobroDelArchivo as EsquemaCobroDelArchivo,
  ErrorApi as EsquemaError,
  RegistrarPago as EsquemaRegistrarPago,
  ResultadoDeMovimiento as EsquemaResultadoDeMovimiento,
  VistaDeCobros as EsquemaVistaDeCobros,
  type CobroDelArchivo,
  type ListarCobros,
  type RegistrarPago,
  type VistaDeCobros,
  type ResultadoDeMovimiento,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { estaUsandoApiReal } from './crm-api';
import { crearVistaDeCobrosDemo } from './dashboard-admin-api';
import { cobroDemoDe } from './mock-cobros';

export class CobrosApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'CobrosApiError';
  }
}

async function pedirCobros(ruta: string, opciones: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}${ruta}`, {
      ...opciones,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...cabecerasDeTenantDev(),
      },
      cache: 'no-store',
    });
  } catch {
    throw new CobrosApiError('ERROR_CONEXION', 'No se pudo conectar con el servidor.', 0);
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = EsquemaError.safeParse(json);
    if (e.success) throw new CobrosApiError(e.data.error.code, e.data.error.message, res.status);
    throw new CobrosApiError(
      res.status === 401 ? 'SIN_SESION' : 'ERROR_SERVIDOR_COBROS',
      `Error en la API de cobros (${res.status})`,
      res.status,
    );
  }
  return json;
}

/** `GET /api/v1/archivos/:id/cobro` — total, pagado, saldo, situación, estado e historial. */
export async function obtenerCobroDelArchivo(archivoId: string): Promise<CobroDelArchivo> {
  if (!estaUsandoApiReal()) {
    const demo = cobroDemoDe(archivoId);
    if (!demo) {
      throw new CobrosApiError('ARCHIVO_NO_ENCONTRADO', 'Archivo no encontrado', 404);
    }
    return demo;
  }
  return EsquemaCobroDelArchivo.parse(await pedirCobros(`/api/v1/archivos/${archivoId}/cobro`));
}

/**
 * `POST /api/v1/archivos/:id/pagos` con `tipo: 'PAGO'` — lo único que registra esta pantalla
 * (ADR-0034 §6: DEVOLUCION, AJUSTE, PENALIDAD y REVERSO son de `cobro.corregir`).
 *
 * La `claveIdempotencia` la pone quien llama y **se mantiene entre reintentos del mismo pago**
 * (R5): si la red se cae después de que el servidor lo guardó, reintentar devuelve la misma fila
 * en vez de cobrar dos veces.
 */
export async function registrarPago(
  archivoId: string,
  pago: RegistrarPago,
): Promise<ResultadoDeMovimiento> {
  const cuerpo = EsquemaRegistrarPago.parse(pago);
  if (!estaUsandoApiReal()) {
    throw new CobrosApiError('MODO_DEMO', 'En modo demostración los pagos no se guardan.', 0);
  }
  const json = await pedirCobros(`/api/v1/archivos/${archivoId}/pagos`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
  return EsquemaResultadoDeMovimiento.parse(json);
}

/**
 * `GET /api/v1/cobros?estadoDeCobro=` — la vista «quién pagó y quién debe». El filtro y el alcance
 * (lo propio o toda la agencia) los aplica el servidor; esta capa no recorta nada por su cuenta.
 * En demostración se filtra la maqueta, que no tiene servidor.
 */
export async function listarCobros(
  estadoDeCobro?: ListarCobros['estadoDeCobro'],
  senal?: AbortSignal,
): Promise<VistaDeCobros> {
  if (!estaUsandoApiReal()) {
    const vista = crearVistaDeCobrosDemo(new Date());
    if (!estadoDeCobro) return vista;
    return { ...vista, datos: vista.datos.filter((f) => f.estadoDeCobro === estadoDeCobro) };
  }
  const consulta = new URLSearchParams({ limite: '500' });
  if (estadoDeCobro) consulta.set('estadoDeCobro', estadoDeCobro);
  return EsquemaVistaDeCobros.parse(
    await pedirCobros(`/api/v1/cobros?${consulta.toString()}`, senal ? { signal: senal } : {}),
  );
}
