/**
 * Cliente de la API del archivo de viaje (T-243, ADR-0024 §3.7). Conforme a
 * `@viajapro/contracts` (R3): las respuestas se validan con los esquemas, no con tipos a mano.
 *
 * Maqueta vs real: igual que el CRM, decide `estaUsandoApiReal()` (modo demo explícito,
 * NEXT_PUBLIC_USE_REAL_CRM). En demo se lee de `mock-archivos` y las mutaciones se rechazan con
 * `MODO_DEMO`: un cambio que no se guarda no debe parecer guardado.
 */
import {
  type ActualizarReserva,
  type CancelarArchivo,
  type DetalleDeArchivo,
  type ListarArchivos,
  type ReemplazarPasajeros,
  type ResumenDeArchivo,
  ActualizarReserva as EsquemaActualizarReserva,
  CancelarArchivo as EsquemaCancelarArchivo,
  DetalleDeArchivo as EsquemaDetalleDeArchivo,
  ErrorApi as EsquemaError,
  ListaDeArchivos as EsquemaListaDeArchivos,
  ReemplazarPasajeros as EsquemaReemplazarPasajeros,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { estaUsandoApiReal } from './crm-api';
import { MOCK_DETALLES_ARCHIVOS } from './mock-archivos';

export class ArchivosApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ArchivosApiError';
  }
}

async function pedirArchivos(ruta: string, opciones: RequestInit = {}): Promise<unknown> {
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
    throw new ArchivosApiError('ERROR_CONEXION', 'No se pudo conectar con el servidor.', 0);
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = EsquemaError.safeParse(json);
    if (e.success) throw new ArchivosApiError(e.data.error.code, e.data.error.message, res.status);
    throw new ArchivosApiError(
      res.status === 401 ? 'SIN_SESION' : 'ERROR_SERVIDOR_ARCHIVOS',
      `Error en la API de archivos de viaje (${res.status})`,
      res.status,
    );
  }
  return json;
}

function resumenDe(detalle: DetalleDeArchivo): ResumenDeArchivo {
  const { pasajeros: _pasajeros, avisos: _avisos, ...resumen } = detalle;
  return resumen;
}

function rechazarEnDemo(): never {
  throw new ArchivosApiError(
    'MODO_DEMO',
    'En modo demostración los cambios en reservas no se guardan.',
    0,
  );
}

/** `GET /api/v1/archivos` — por defecto los abiertos, ordenados por el plazo más próximo. */
export async function listarArchivos(
  estado: ListarArchivos['estado'] = 'ABIERTO',
): Promise<ResumenDeArchivo[]> {
  if (!estaUsandoApiReal()) {
    return MOCK_DETALLES_ARCHIVOS.filter((a) => estado === 'TODOS' || a.estado === estado).map(
      resumenDe,
    );
  }
  const json = await pedirArchivos(`/api/v1/archivos?estado=${estado}&limite=500`);
  return EsquemaListaDeArchivos.parse(json).datos;
}

/** `GET /api/v1/archivos/:id` */
export async function obtenerArchivo(id: string): Promise<DetalleDeArchivo> {
  if (!estaUsandoApiReal()) {
    const a = MOCK_DETALLES_ARCHIVOS.find((x) => x.id === id);
    if (!a) throw new ArchivosApiError('ARCHIVO_NO_ENCONTRADO', 'Archivo no encontrado', 404);
    return a;
  }
  return EsquemaDetalleDeArchivo.parse(await pedirArchivos(`/api/v1/archivos/${id}`));
}

/** `PUT /api/v1/archivos/:id/reservas/:reservaId` — devuelve el archivo completo ya actualizado. */
export async function actualizarReserva(
  archivoId: string,
  reservaId: string,
  cambio: ActualizarReserva,
): Promise<DetalleDeArchivo> {
  const cuerpo = EsquemaActualizarReserva.parse(cambio);
  if (!estaUsandoApiReal()) rechazarEnDemo();
  const json = await pedirArchivos(`/api/v1/archivos/${archivoId}/reservas/${reservaId}`, {
    method: 'PUT',
    body: JSON.stringify(cuerpo),
  });
  return EsquemaDetalleDeArchivo.parse(json);
}

/** `PUT /api/v1/archivos/:id/pasajeros` — la lista completa. */
export async function reemplazarPasajeros(
  archivoId: string,
  cambio: ReemplazarPasajeros,
): Promise<DetalleDeArchivo> {
  const cuerpo = EsquemaReemplazarPasajeros.parse(cambio);
  if (!estaUsandoApiReal()) rechazarEnDemo();
  const json = await pedirArchivos(`/api/v1/archivos/${archivoId}/pasajeros`, {
    method: 'PUT',
    body: JSON.stringify(cuerpo),
  });
  return EsquemaDetalleDeArchivo.parse(json);
}

/** `POST /api/v1/archivos/:id/cancelacion` */
export async function cancelarArchivo(
  archivoId: string,
  cancelacion: CancelarArchivo,
): Promise<DetalleDeArchivo> {
  const cuerpo = EsquemaCancelarArchivo.parse(cancelacion);
  if (!estaUsandoApiReal()) rechazarEnDemo();
  const json = await pedirArchivos(`/api/v1/archivos/${archivoId}/cancelacion`, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
  return EsquemaDetalleDeArchivo.parse(json);
}
