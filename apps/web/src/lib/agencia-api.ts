import {
  AjustesDeAgencia,
  ActualizarAjustesDeAgencia,
  ErrorApi as EsquemaErrorApi,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { estaUsandoApiReal } from './crm-api';
import { MOCK_CONFIGURACION_AGENCIA } from './mock-configuracion';

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

/** Error de `GET/PATCH /api/v1/agencia/ajustes`; `codigo` es el de la API o `ERROR_CONEXION`/`ERROR_SERVIDOR`. */
export class ErrorAjustesAgenciaApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null = null,
  ) {
    super(mensaje);
    this.name = 'ErrorAjustesAgenciaApi';
  }
}

/** Estado del modo mock (demo/pruebas): sobrevive mientras viva la pestaña. */
let ajustesMock: AjustesDeAgencia = {
  nombre: MOCK_CONFIGURACION_AGENCIA.nombreComercial,
  paisIso: 'CO',
  monedaIso: MOCK_CONFIGURACION_AGENCIA.monedaBase,
  zonaHoraria: MOCK_CONFIGURACION_AGENCIA.zonaHoraria,
};

async function pedirAjustes(init: RequestInit): Promise<AjustesDeAgencia> {
  let res: Response;
  try {
    res = await fetch(`${obtenerBaseApi()}/api/v1/agencia/ajustes`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...cabecerasDeTenantDev(),
      },
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ErrorAjustesAgenciaApi('ERROR_CONEXION', 'No hay conexión con el servidor.');
  }
  const cuerpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = EsquemaErrorApi.safeParse(cuerpo);
    throw new ErrorAjustesAgenciaApi(
      e.success ? e.data.error.code : res.status === 403 ? 'PERMISO_DENEGADO' : 'ERROR_SERVIDOR',
      e.success ? e.data.error.message : `Error del servidor (${res.status}).`,
      res.status,
    );
  }
  const parseo = AjustesDeAgencia.safeParse(cuerpo);
  if (!parseo.success) {
    throw new ErrorAjustesAgenciaApi('ERROR_SERVIDOR', 'Respuesta inesperada del servidor.');
  }
  return parseo.data;
}

/** `GET /api/v1/agencia/ajustes` validado con el contrato; lanza `ErrorAjustesAgenciaApi`. */
export async function obtenerAjustesDeAgencia(): Promise<AjustesDeAgencia> {
  if (!estaUsandoApiReal()) return { ...ajustesMock };
  return pedirAjustes({ method: 'GET' });
}

/**
 * `PATCH /api/v1/agencia/ajustes` con `{ zonaHoraria }` (permiso `usuarios.administrar`).
 * 422 `ZONA_HORARIA_INVALIDA` si la zona no existe; 403 sin permiso.
 */
export async function actualizarZonaHorariaApi(zonaHoraria: string): Promise<AjustesDeAgencia> {
  const cuerpo = ActualizarAjustesDeAgencia.parse({ zonaHoraria });
  if (!estaUsandoApiReal()) {
    ajustesMock = { ...ajustesMock, zonaHoraria: cuerpo.zonaHoraria };
    return { ...ajustesMock };
  }
  return pedirAjustes({ method: 'PATCH', body: JSON.stringify(cuerpo) });
}
