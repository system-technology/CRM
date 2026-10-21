import { obtenerBaseApi } from './api-base';
/**
 * Cliente de autenticación e identidad — ADR-0011 (0c.29).
 *
 * Conforme a R3, los tipos se importan directamente de `@viajapro/contracts`
 * y se validan con sus esquemas Zod (IniciarSesion, SesionActual, CambiarAgenciaActiva).
 *
 * La cookie de sesión es `HttpOnly`: viaja de forma transparente en el navegador
 * mediante `credentials: 'include'`.
 */

import {
  type IniciarSesion as IniciarSesionTipo,
  type SesionActual as SesionActualTipo,
  IniciarSesion as EsquemaIniciarSesion,
  SesionActual as EsquemaSesionActual,
  CambiarAgenciaActiva as EsquemaCambiarAgenciaActiva,
  ErrorApi as EsquemaErrorApi,
} from '@viajapro/contracts';

/**
 * Evalúa si la pantalla de autenticación está habilitada.
 * Si está apagada (por defecto), el servidor redirige a /bandeja.
 */
export function estaAuthHabilitada(envValue?: string): boolean {
  const valor =
    envValue !== undefined
      ? envValue
      : process.env['NEXT_PUBLIC_USE_REAL_AUTH'] || process.env['NEXT_PUBLIC_AUTH_MAQUETA'];
  return valor === 'true' || valor === '1';
}

/**
 * Evalúa si se debe conectar a la API real de autenticación.
 */
export function usaAuthReal(): boolean {
  return process.env['NEXT_PUBLIC_USE_REAL_AUTH'] === 'true';
}

export class AuthApiError extends Error {
  constructor(
    readonly code: string,
    mensaje: string,
    readonly statusHttp?: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'AuthApiError';
  }
}

/**
 * Mapea códigos de dominio de error de acceso (CodigoDeErrorDeAcceso) a mensajes
 * claros y accionables en español para el asesor.
 */
export function mapearErrorAcceso(codigo: string, mensajeFallback?: string): string {
  switch (codigo) {
    case 'CREDENCIALES_INVALIDAS':
      return 'Correo o contraseña incorrectos. Verifica tus credenciales o solicita acceso al administrador.';
    case 'DEMASIADOS_INTENTOS':
      return 'Demasiados intentos fallidos. Por seguridad, espera un momento antes de volver a intentar.';
    case 'SIN_SESION':
      return 'No hay una sesión activa. Por favor ingresa nuevamente.';
    case 'SIN_AGENCIA_ACTIVA':
      return 'Debes seleccionar una agencia para ingresar.';
    case 'ACCESO_REVOCADO':
      return 'Tu acceso a esta agencia ha sido revocado. Contacta al administrador.';
    case 'AGENCIA_SUSPENDIDA':
      return 'La agencia se encuentra suspendida o inactiva temporalmente.';
    case 'SIN_MEMBRESIA':
      return 'No perteneces a la agencia seleccionada o no tienes permisos de acceso.';
    case 'PERMISO_DENEGADO':
      return 'No tienes permisos suficientes para realizar esta acción.';
    case 'CODIGO_INVALIDO':
      return 'El código ingresado no es válido, ha caducado o agotó sus intentos.';
    case 'ORIGEN_NO_CONFIABLE':
      return 'Petición bloqueada por origen de navegación no seguro.';
    default:
      return (
        mensajeFallback || 'Ocurrió un error al verificar tus credenciales. Intenta nuevamente.'
      );
  }
}

// -----------------------------------------------------------------------------
// Sesión simulada offline (solo cuando usaAuthReal() es false)
// -----------------------------------------------------------------------------

const MOCK_AGENCIA_PRINCIPAL = {
  id: '01932000-0000-7000-8000-00000000000a',
  nombre: 'Viajes El Sol',
  slug: 'viajes-el-sol',
};

const MOCK_AGENCIA_SECUNDARIA = {
  id: '01932000-0000-7000-8000-00000000000b',
  nombre: 'Turismo Caribe SAS',
  slug: 'turismo-caribe',
};

export const MOCK_SESION_UNICA_AGENCIA: SesionActualTipo = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'asesor@viajapro.com',
    nombre: 'Asesor ViajaPro',
  },
  agencias: [MOCK_AGENCIA_PRINCIPAL],
  tenantActivoId: MOCK_AGENCIA_PRINCIPAL.id,
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000011',
    rol: 'Asesor Comercial',
    permisos: ['conversaciones.ver_todas'],
  },
};

export const MOCK_SESION_MULTI_AGENCIA: SesionActualTipo = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000002',
    correo: 'multi@viajapro.com',
    nombre: 'Ana Dueña Multiagencia',
  },
  agencias: [MOCK_AGENCIA_PRINCIPAL, MOCK_AGENCIA_SECUNDARIA],
  tenantActivoId: null,
  acceso: null,
};

export const MOCK_SESION_DUENO: SesionActualTipo = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000003',
    correo: 'dueno@viajapro.com',
    nombre: 'Dueña Agencia',
  },
  agencias: [MOCK_AGENCIA_PRINCIPAL],
  tenantActivoId: MOCK_AGENCIA_PRINCIPAL.id,
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000033',
    rol: 'Dueño',
    permisos: [
      'cotizacion.ver_neto_y_margen',
      'usuarios.administrar',
      'roles.administrar',
      'conversaciones.ver_todas',
    ],
  },
};

/**
 * Permite a los tests o al selector manual fijar la sesión mock en memoria.
 */
export function fijarSesionMock(sesion: SesionActualTipo | null): void {
  sesionEnMemoriaMock = sesion;
}

let sesionEnMemoriaMock: SesionActualTipo | null = null;

// -----------------------------------------------------------------------------
// Métodos de la API real
// -----------------------------------------------------------------------------

/**
 * Inicia sesión con correo y contraseña.
 * POST /api/v1/auth/sign-in/email
 */
export async function iniciarSesionApi(credenciales: IniciarSesionTipo): Promise<SesionActualTipo> {
  const datosValidados = EsquemaIniciarSesion.parse(credenciales);

  if (!usaAuthReal()) {
    // Modo mock offline (solo si el interruptor real está apagado)
    if (
      datosValidados.correo.toLowerCase().includes('error@') ||
      datosValidados.contrasena === 'incorrecta' ||
      datosValidados.contrasena === 'error123'
    ) {
      throw new AuthApiError(
        'CREDENCIALES_INVALIDAS',
        mapearErrorAcceso('CREDENCIALES_INVALIDAS'),
        401,
      );
    }
    if (
      datosValidados.correo.toLowerCase().includes('dueno@') ||
      datosValidados.correo.toLowerCase().includes('admin@')
    ) {
      sesionEnMemoriaMock = { ...MOCK_SESION_DUENO };
      return sesionEnMemoriaMock;
    }
    if (datosValidados.correo.toLowerCase().includes('multi@')) {
      sesionEnMemoriaMock = { ...MOCK_SESION_MULTI_AGENCIA };
      return sesionEnMemoriaMock;
    }
    sesionEnMemoriaMock = { ...MOCK_SESION_UNICA_AGENCIA };
    return sesionEnMemoriaMock;
  }

  const res = await fetch(`${obtenerBaseApi()}/api/v1/auth/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(datosValidados),
  });

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 429) {
      throw new AuthApiError('DEMASIADOS_INTENTOS', mapearErrorAcceso('DEMASIADOS_INTENTOS'), 429);
    }
    const analizado = EsquemaErrorApi.safeParse(cuerpo);
    if (analizado.success) {
      const { code, message, details } = analizado.data.error;
      throw new AuthApiError(code, mapearErrorAcceso(code, message), res.status, details);
    }
    if (res.status === 401) {
      throw new AuthApiError(
        'CREDENCIALES_INVALIDAS',
        mapearErrorAcceso('CREDENCIALES_INVALIDAS'),
        401,
      );
    }
    throw new AuthApiError(
      'ERROR_SERVIDOR',
      'No se pudo verificar el acceso en el servidor',
      res.status,
    );
  }

  // Regla R3 / 0c.34: Validar respuesta 200 estrictamente con contrato Zod
  return EsquemaSesionActual.parse(cuerpo);
}

/**
 * Cierra la sesión activa.
 * POST /api/v1/auth/sign-out
 */
export async function cerrarSesionApi(): Promise<void> {
  if (!usaAuthReal()) {
    sesionEnMemoriaMock = null;
    return;
  }

  const res = await fetch(`${obtenerBaseApi()}/api/v1/auth/sign-out`, {
    method: 'POST',
    credentials: 'include',
  });

  if (res.status === 403) {
    throw new AuthApiError('ORIGEN_NO_CONFIABLE', mapearErrorAcceso('ORIGEN_NO_CONFIABLE'), 403);
  }
}

/**
 * Consulta la sesión actual con la cookie activa.
 * GET /api/v1/auth/session
 */
export async function obtenerSesionActualApi(): Promise<SesionActualTipo> {
  if (!usaAuthReal()) {
    if (!sesionEnMemoriaMock) {
      sesionEnMemoriaMock = { ...MOCK_SESION_UNICA_AGENCIA };
    }
    return sesionEnMemoriaMock;
  }

  const res = await fetch(`${obtenerBaseApi()}/api/v1/auth/session`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401) {
      throw new AuthApiError('SIN_SESION', mapearErrorAcceso('SIN_SESION'), 401);
    }
    const analizado = EsquemaErrorApi.safeParse(cuerpo);
    if (analizado.success) {
      const { code, message, details } = analizado.data.error;
      throw new AuthApiError(code, mapearErrorAcceso(code, message), res.status, details);
    }
    throw new AuthApiError('ERROR_SERVIDOR', 'Error al consultar la sesión actual', res.status);
  }

  return EsquemaSesionActual.parse(cuerpo);
}

/**
 * Fija la agencia activa cuando la sesión tiene acceso a varias.
 * POST /api/v1/auth/tenant-activo
 */
export async function cambiarAgenciaActivaApi(tenantId: string): Promise<SesionActualTipo> {
  const payload = EsquemaCambiarAgenciaActiva.parse({ tenantId });

  if (!usaAuthReal()) {
    const agenciaElegida = [MOCK_AGENCIA_PRINCIPAL, MOCK_AGENCIA_SECUNDARIA].find(
      (a) => a.id === tenantId,
    );
    if (!agenciaElegida) {
      throw new AuthApiError('SIN_MEMBRESIA', mapearErrorAcceso('SIN_MEMBRESIA'), 403);
    }
    sesionEnMemoriaMock = {
      ...(sesionEnMemoriaMock || MOCK_SESION_MULTI_AGENCIA),
      tenantActivoId: tenantId,
      acceso: {
        usuarioId: '01932000-0000-7000-8000-000000000099',
        rol: 'Asesor',
        permisos: ['conversaciones.ver_todas'],
      },
    };
    return sesionEnMemoriaMock;
  }

  const res = await fetch(`${obtenerBaseApi()}/api/v1/auth/tenant-activo`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const cuerpo: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 403) {
      throw new AuthApiError('SIN_MEMBRESIA', mapearErrorAcceso('SIN_MEMBRESIA'), 403);
    }
    const analizado = EsquemaErrorApi.safeParse(cuerpo);
    if (analizado.success) {
      const { code, message, details } = analizado.data.error;
      throw new AuthApiError(code, mapearErrorAcceso(code, message), res.status, details);
    }
    throw new AuthApiError('ERROR_SERVIDOR', 'Error al cambiar de agencia activa', res.status);
  }

  return EsquemaSesionActual.parse(cuerpo);
}
