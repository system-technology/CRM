import { obtenerBaseApi } from './api-base';
export { obtenerBaseApi };
/**
 * Cliente de API para cotizaciones guardadas y sus versiones inmutables (0c.22).
 *
 * Conforme a @viajapro/contracts (GuardarCotizacion, AnadirVersionACotizacion, CotizacionGuardada).
 * Regla R3: Tipos estrictamente inferidos de contratos oficiales.
 * Regla R10: NUNCA se solicita ?incluirMargen=true desde el navegador (neto y margen son internos).
 * Soporta conexión real a NestJS (/api/v1/cotizaciones) con fallback resiliente offline y
 * reporte transparente de errores de configuración (0c.14 y 0c.22).
 */

import {
  type AnadirVersionACotizacion,
  type CotizacionGuardada,
  type GuardarCotizacion,
  type VersionDeCotizacion,
  type ListarCotizaciones,
  type PaginaDeCotizaciones,
  AnadirVersionACotizacion as EsquemaAnadirVersionACotizacion,
  CotizacionGuardada as EsquemaCotizacionGuardada,
  GuardarCotizacion as EsquemaGuardarCotizacion,
  PaginaDeCotizaciones as EsquemaPaginaDeCotizaciones,
  ErrorApi as EsquemaError,
} from '@viajapro/contracts';
import { cotizacionGuardadaAFila, paginarPorCursor } from './cotizaciones-listado-logica';
import {
  guardarMockCotizacion,
  obtenerMockCotizacionPorId,
  obtenerMockCotizaciones,
} from './mock-cotizaciones';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';

// Re-exportado de api-base (ADR-0011 §2)

export function obtenerTenantDemo(): string {
  return process.env['NEXT_PUBLIC_DEV_TENANT_ID'] ?? '';
}

export function estaUsandoApiReal(): boolean {
  return process.env['NEXT_PUBLIC_USE_REAL_CRM'] === 'true';
}

export class CotizacionesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CotizacionesApiError';
  }
}

/**
 * Petición genérica con cabecera tenant y validación de errores del contrato.
 * NUNCA se incluye ?incluirMargen=true (R10).
 */
async function pedirCotizaciones<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const base = obtenerBaseApi();
  const tenant = obtenerTenantDemo().trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(tenant ? { 'x-dev-tenant-id': tenant } : {}),
    ...(opciones.headers as Record<string, string> | undefined),
  };

  let res: Response;
  try {
    res = await fetch(`${base}${ruta}`, {
      ...opciones,
      credentials: 'include',
      headers,
      cache: 'no-store',
    });
  } catch (netErr) {
    throw new CotizacionesApiError(
      'ERROR_CONEXION',
      'No se pudo conectar con el servidor de cotizaciones.',
      0,
      { causa: netErr instanceof Error ? netErr.message : String(netErr) },
    );
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorParsed = EsquemaError.safeParse(json);
    if (errorParsed.success) {
      const { code, message, details } = errorParsed.data.error;
      throw new CotizacionesApiError(code, message, res.status, details);
    }

    if (res.status === 404) {
      throw new CotizacionesApiError(
        'COTIZACION_NO_ENCONTRADA',
        'La cotización solicitada no existe o fue eliminada.',
        404,
      );
    }

    if (res.status === 401) {
      throw new CotizacionesApiError(
        'SIN_SESION',
        'Falta identificar la agencia (x-dev-tenant-id). Verifique su configuración de desarrollo.',
        401,
      );
    }

    throw new CotizacionesApiError(
      'ERROR_SERVIDOR_COTIZACIONES',
      `Error en API de cotizaciones (${res.status})`,
      res.status,
    );
  }

  return json as T;
}

/**
 * Crea una cotización guardada con su versión 1.
 * POST /api/v1/cotizaciones
 */
export async function guardarCotizacionApi(cuerpo: GuardarCotizacion): Promise<CotizacionGuardada> {
  const validado = EsquemaGuardarCotizacion.parse(cuerpo);

  if (estaUsandoApiReal()) {
    const respuesta = await pedirCotizaciones<unknown>('/api/v1/cotizaciones', {
      method: 'POST',
      body: JSON.stringify(validado),
    });
    return EsquemaCotizacionGuardada.parse(respuesta);
  }

  // Fallback simulado offline
  const ahora = new Date().toISOString();
  const sufijoUnico = Date.now().toString(16).padStart(12, '0');
  const idNuevo = `01932000-0000-7000-8000-${sufijoUnico}`;
  const versionId = `01932000-0000-7000-8000-${(Date.now() + 1).toString(16).padStart(12, '0')}`;

  const paquete =
    MOCK_PAQUETES_CATALOGO.find((p) => p.id === validado.version.paqueteId) ??
    MOCK_PAQUETES_CATALOGO[0]!;
  const adultos = validado.version.adultos ?? 2;
  const ninos = validado.version.ninos ?? 0;
  const infantes = validado.version.infantes ?? 0;
  const precioUnitarioNum = 2450000;
  const totalVentaNum = precioUnitarioNum * adultos + Math.round(precioUnitarioNum * 0.7) * ninos;

  const version1: VersionDeCotizacion = {
    id: versionId,
    numero: 1,
    creadaEn: ahora,
    paqueteId: paquete.id,
    paqueteNombre: paquete.nombre,
    destino: paquete.destino,
    noches: paquete.dias - 1,
    fechaSalida: validado.version.fecha,
    vigenciaId: '01932000-0000-7000-8000-000000000001',
    vigenciaDesde: '2026-10-01',
    vigenciaHasta: '2026-10-31',
    deSalidaProgramada: true,
    adultos,
    ninos,
    infantes,
    acomodacion: validado.version.acomodacion ?? 'DOBLE',
    politica: {
      porcentaje: 15,
      base: 'SOBRE_EL_NETO',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
    },
    lineas: [
      {
        tarifaId: '01932000-0000-7000-8000-000000000011',
        nombre: `Adulto en acomodación ${validado.version.acomodacion ?? 'DOBLE'}`,
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        veces: adultos,
        precioUnitario: { unidades: String(precioUnitarioNum), moneda: 'COP' as const },
        total: { unidades: String(precioUnitarioNum * adultos), moneda: 'COP' as const },
        masBarata: false,
      },
      ...(ninos > 0
        ? [
            {
              tarifaId: '01932000-0000-7000-8000-000000000012',
              nombre: 'Niño (2-11 años)',
              unidad: 'POR_PERSONA' as const,
              cubrePasajeros: 1,
              veces: ninos,
              precioUnitario: {
                unidades: String(Math.round(precioUnitarioNum * 0.7)),
                moneda: 'COP' as const,
              },
              total: {
                unidades: String(Math.round(precioUnitarioNum * 0.7 * ninos)),
                moneda: 'COP' as const,
              },
              masBarata: false,
            },
          ]
        : []),
    ],
    venta: { unidades: String(Math.round(totalVentaNum)), moneda: 'COP' as const },
    vigenteHasta: validado.version.vigenteHasta ?? null,
  };

  const nuevaCotizacion: CotizacionGuardada = {
    id: idNuevo,
    contactoId: validado.contactoId,
    oportunidadId: validado.oportunidadId ?? null,
    titulo: validado.titulo,
    estado: 'BORRADOR',
    versionEnviada: null,
    enviadaEn: null,
    creadaEn: ahora,
    actualizadaEn: ahora,
    versiones: [version1],
  };

  guardarMockCotizacion(nuevaCotizacion);
  return EsquemaCotizacionGuardada.parse(nuevaCotizacion);
}

/**
 * Añade la versión siguiente a una cotización existente.
 * POST /api/v1/cotizaciones/:id/versiones
 */
export async function anadirVersionCotizacionApi(
  cotizacionId: string,
  cuerpo: AnadirVersionACotizacion,
): Promise<CotizacionGuardada> {
  const validado = EsquemaAnadirVersionACotizacion.parse(cuerpo);

  if (estaUsandoApiReal()) {
    const respuesta = await pedirCotizaciones<unknown>(
      `/api/v1/cotizaciones/${cotizacionId}/versiones`,
      {
        method: 'POST',
        body: JSON.stringify(validado),
      },
    );
    return EsquemaCotizacionGuardada.parse(respuesta);
  }

  // Fallback simulado offline
  const cotizacion = obtenerMockCotizacionPorId(cotizacionId);
  if (!cotizacion) {
    throw new CotizacionesApiError(
      'COTIZACION_NO_ENCONTRADA',
      `Cotización ${cotizacionId} no encontrada.`,
      404,
    );
  }

  const ahora = new Date().toISOString();
  const siguienteNumero = Math.max(...cotizacion.versiones.map((v) => v.numero)) + 1;
  const versionId = `01932000-0000-7000-8000-${(Date.now() + siguienteNumero).toString(16).padStart(12, '0')}`;

  const paquete =
    MOCK_PAQUETES_CATALOGO.find((p) => p.id === validado.paqueteId) ?? MOCK_PAQUETES_CATALOGO[0]!;
  const adultos = validado.adultos ?? 2;
  const ninos = validado.ninos ?? 0;
  const infantes = validado.infantes ?? 0;
  const precioUnitarioNum = 2300000;
  const totalVentaNum = precioUnitarioNum * adultos + Math.round(precioUnitarioNum * 0.7) * ninos;

  const nuevaVersion: VersionDeCotizacion = {
    id: versionId,
    numero: siguienteNumero,
    creadaEn: ahora,
    paqueteId: paquete.id,
    paqueteNombre: paquete.nombre,
    destino: paquete.destino,
    noches: paquete.dias - 1,
    fechaSalida: validado.fecha,
    vigenciaId: '01932000-0000-7000-8000-000000000001',
    vigenciaDesde: '2026-10-01',
    vigenciaHasta: '2026-10-31',
    deSalidaProgramada: true,
    adultos,
    ninos,
    infantes,
    acomodacion: validado.acomodacion ?? 'DOBLE',
    politica: {
      porcentaje: 15,
      base: 'SOBRE_EL_NETO',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
    },
    lineas: [
      {
        tarifaId: '01932000-0000-7000-8000-000000000011',
        nombre: `Adulto en acomodación ${validado.acomodacion ?? 'DOBLE'} (v${siguienteNumero})`,
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        veces: adultos,
        precioUnitario: { unidades: String(precioUnitarioNum), moneda: 'COP' as const },
        total: { unidades: String(precioUnitarioNum * adultos), moneda: 'COP' as const },
        masBarata: false,
      },
      ...(ninos > 0
        ? [
            {
              tarifaId: '01932000-0000-7000-8000-000000000012',
              nombre: 'Niño (2-11 años)',
              unidad: 'POR_PERSONA' as const,
              cubrePasajeros: 1,
              veces: ninos,
              precioUnitario: {
                unidades: String(Math.round(precioUnitarioNum * 0.7)),
                moneda: 'COP' as const,
              },
              total: {
                unidades: String(Math.round(precioUnitarioNum * 0.7 * ninos)),
                moneda: 'COP' as const,
              },
              masBarata: false,
            },
          ]
        : []),
    ],
    venta: { unidades: String(Math.round(totalVentaNum)), moneda: 'COP' as const },
    vigenteHasta: validado.vigenteHasta ?? null,
  };

  const cotizacionActualizada: CotizacionGuardada = {
    ...cotizacion,
    actualizadaEn: ahora,
    versiones: [...cotizacion.versiones, nuevaVersion],
  };

  guardarMockCotizacion(cotizacionActualizada);
  return EsquemaCotizacionGuardada.parse(cotizacionActualizada);
}

/**
 * Obtiene una cotización guardada con todas sus versiones.
 * GET /api/v1/cotizaciones/:id
 */
export async function obtenerCotizacionGuardadaApi(
  cotizacionId: string,
): Promise<CotizacionGuardada> {
  if (estaUsandoApiReal()) {
    const respuesta = await pedirCotizaciones<unknown>(`/api/v1/cotizaciones/${cotizacionId}`);
    return EsquemaCotizacionGuardada.parse(respuesta);
  }

  const cotizacion = obtenerMockCotizacionPorId(cotizacionId);
  if (!cotizacion) {
    throw new CotizacionesApiError(
      'COTIZACION_NO_ENCONTRADA',
      `La cotización ${cotizacionId} no existe o fue eliminada.`,
      404,
    );
  }

  return EsquemaCotizacionGuardada.parse(cotizacion);
}

/**
 * Obtiene el listado de cotizaciones guardadas.
 * - Si NEXT_PUBLIC_USE_REAL_CRM está activo: consulta GET /api/v1/cotizaciones.
 * - Si falla o está inactivo: recurre al almacén simulado en memoria.
 */
/**
 * Obtiene el listado de cotizaciones guardadas paginado por cursor (0c.28).
 * - Si NEXT_PUBLIC_USE_REAL_CRM está activo: consulta GET /api/v1/cotizaciones con los filtros Zod.
 * - Si falla o está inactivo: recurre al almacén simulado en memoria tipado con PaginaDeCotizaciones.
 */
export async function listarCotizacionesApi(
  params?: ListarCotizaciones,
): Promise<PaginaDeCotizaciones> {
  if (estaUsandoApiReal()) {
    const q = new URLSearchParams();
    if (params?.cursor) q.set('cursor', params.cursor);
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.estado) q.set('estado', params.estado);
    if (params?.contactoId) q.set('contactoId', params.contactoId);
    if (params?.desde) q.set('desde', params.desde);
    if (params?.hasta) q.set('hasta', params.hasta);

    const qs = q.toString();
    const ruta = qs ? `/api/v1/cotizaciones?${qs}` : '/api/v1/cotizaciones';
    const respuesta = await pedirCotizaciones<unknown>(ruta);
    return EsquemaPaginaDeCotizaciones.parse(respuesta);
  }

  // Simulación de latencia de red para renderizado de esqueleto
  await new Promise((resolve) => setTimeout(resolve, 300));

  const todas = obtenerMockCotizaciones();
  let filas = todas.map(cotizacionGuardadaAFila);

  if (params?.estado) {
    filas = filas.filter((f) => f.estado === params.estado);
  }
  if (params?.contactoId) {
    filas = filas.filter((f) => f.contactoId === params.contactoId);
  }

  filas.sort(
    (a, b) => new Date(b.ultimaVersionEn).getTime() - new Date(a.ultimaVersionEn).getTime(),
  );

  return paginarPorCursor(filas, params?.cursor, params?.limite ?? 25);
}
