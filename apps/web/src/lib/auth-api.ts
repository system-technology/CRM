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
 * Valida la entrada **en el cliente** y convierte un `ZodError` en `AuthApiError`.
 *
 * Sin esto, el `ZodError` sale tal cual hacia quien llamó, y `ZodError.message` **es el JSON de
 * los `issues`**. Eso fue justo lo que la pantalla de ingreso enseñó en staging: el formulario
 * hacía `setError(err.message)` creyendo que recibía un `AuthApiError`, y pintaba el volcado.
 */
function validarEntrada<T>(esquema: { parse: (v: unknown) => T }, valor: unknown): T {
  try {
    return esquema.parse(valor);
  } catch (error) {
    const issues = (error as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues;
    if (!Array.isArray(issues)) throw error;
    const detalles = Object.fromEntries(
      issues.map((i) => [Array.isArray(i.path) ? i.path.join('.') : '(raíz)', i.message ?? '']),
    );
    throw new AuthApiError(
      'ENTRADA_INVALIDA',
      mapearErrorAcceso('ENTRADA_INVALIDA', undefined, detalles),
      400,
      detalles,
    );
  }
}

/** Cómo se llama cada campo en la pantalla, no en el contrato. */
const NOMBRE_DEL_CAMPO: Record<string, string> = {
  identificador: 'tu correo o usuario',
  correo: 'tu correo',
  contrasena: 'tu contraseña',
  codigo: 'el código',
  agenciaId: 'la agencia',
};

/** Une nombres de campo como se unen en español: «a», «a y b», «a, b y c». */
function enumerar(nombres: readonly string[]): string {
  const [primero, ...resto] = nombres;
  if (primero === undefined) return '';
  if (resto.length === 0) return primero;
  const ultimo = resto[resto.length - 1] as string;
  return `${[primero, ...resto.slice(0, -1)].join(', ')} y ${ultimo}`;
}

/** `true` si el texto es una frase para una persona y no un volcado del servidor. */
function esFraseHumana(texto: string | undefined): texto is string {
  if (!texto) return false;
  const t = texto.trim();
  // Un JSON serializado (`[{"code":...}]`) empieza por corchete o llave. Eso llegó a verse en
  // pantalla en el staging de noviembre de 2026: el usuario leyó los `issues` de Zod en crudo.
  if (t.startsWith('[') || t.startsWith('{')) return false;
  if (t.includes('"code"') || t.includes('"path"') || t.includes('"validation"')) return false;
  return true;
}

/** El nombre de pantalla de un campo, o cadena vacía si no es un nombre que podamos enseñar. */
function nombreDeCampo(clave: string): string {
  return NOMBRE_DEL_CAMPO[clave] ?? (/^[A-Za-z_][A-Za-z0-9_.]{0,39}$/.test(clave) ? clave : '');
}

/**
 * «Falta» no es lo mismo que «está mal escrito», y decirlo igual no ayuda a nadie: con el campo
 * vacío, «Revisa tu contraseña» hace buscar un error que no existe. Lo que falta se pide
 * («Escribe tu contraseña»); lo que está mal escrito se manda revisar.
 *
 * Del lado del cliente sabemos el código del issue. Del lado del servidor solo llega el texto de
 * Zod, en inglés: de ahí la heurística, que si no acierta degrada al «revisa» de siempre.
 */
function pareceCampoVacio(detalle: unknown): boolean {
  return (
    typeof detalle === 'string' && /at least 1 character|too_small|required|vacío/i.test(detalle)
  );
}

/** El mensaje que ve quien rellena el formulario, separando lo que falta de lo que está mal. */
function mensajeDeCamposInvalidos(detalles: unknown): string {
  if (!detalles || typeof detalles !== 'object' || Array.isArray(detalles)) {
    return 'Revisa los datos del formulario e intenta de nuevo.';
  }
  const vacios: string[] = [];
  const malEscritos: string[] = [];
  for (const [clave, detalle] of Object.entries(detalles as Record<string, unknown>)) {
    const nombre = nombreDeCampo(clave);
    if (nombre === '') continue;
    (pareceCampoVacio(detalle) ? vacios : malEscritos).push(nombre);
  }
  if (vacios.length === 0 && malEscritos.length === 0) {
    return 'Revisa los datos del formulario e intenta de nuevo.';
  }
  if (malEscritos.length === 0) return `Escribe ${enumerar(vacios)} para entrar.`;
  if (vacios.length === 0) return `Revisa ${enumerar(malEscritos)}: no tiene el formato esperado.`;
  return `Escribe ${enumerar(vacios)} y revisa ${enumerar(malEscritos)}.`;
}

/**
 * Mapea códigos de dominio de error de acceso (CodigoDeErrorDeAcceso) a mensajes
 * claros y accionables en español para el asesor.
 *
 * **Nunca devuelve el `message` del servidor sin mirarlo.** Ese `default` permisivo fue el camino
 * por el que un volcado de Zod acabó en la pantalla de ingreso: la web pintaba lo que llegara.
 * Ahora el mensaje del servidor solo pasa si parece una frase; si no, se usa el genérico.
 */
export function mapearErrorAcceso(
  codigo: string,
  mensajeFallback?: string,
  detalles?: unknown,
): string {
  switch (codigo) {
    case 'CREDENCIALES_INVALIDAS':
      return 'Los datos no coinciden. Revisa tu correo o usuario y tu contraseña, o pide ayuda al administrador de tu agencia.';
    case 'DEMASIADOS_INTENTOS':
      return 'Demasiados intentos seguidos desde esta conexión. Espera un minuto y vuelve a intentarlo.';
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
    case 'ENTRADA_INVALIDA':
      // La API manda `details` campo por campo justo para esto: un «datos inválidos» a secas
      // obliga a adivinar cuál de los campos está mal.
      return mensajeDeCamposInvalidos(detalles);
    default:
      return esFraseHumana(mensajeFallback)
        ? mensajeFallback
        : 'Ocurrió un error al verificar tus credenciales. Intenta nuevamente.';
  }
}

/**
 * `true` si el rechazo es el limitador por IP (429). A diferencia de una clave mala, ese aviso no
 * dice nada sobre si la identidad existe, así que la pantalla puede distinguirlo con otro título
 * y decir que basta esperar (T-611). El tope por identidad NO pasa por aquí: responde igual que
 * una clave mala a propósito (ADR-0031 §4).
 */
export function esLimiteDeIntentos(error: unknown): boolean {
  return error instanceof AuthApiError && error.code === 'DEMASIADOS_INTENTOS';
}

/**
 * El texto que una pantalla puede enseñar ante CUALQUIER error, venga de donde venga.
 *
 * Defensa en profundidad: `auth-api` ya solo lanza `AuthApiError` con frases, pero un fallo de red
 * o un `TypeError` inesperado llegan igual al `catch` del formulario. Pintar `err.message` a ciegas
 * es lo que puso un volcado de Zod delante del usuario.
 */
export function mensajeDeErrorDeAcceso(error: unknown, generico?: string): string {
  const respaldo =
    generico ?? 'Ocurrió un error al verificar tus credenciales. Intenta nuevamente.';
  if (error instanceof AuthApiError) {
    return esFraseHumana(error.message) ? error.message : respaldo;
  }
  const mensaje = error instanceof Error ? error.message : undefined;
  return esFraseHumana(mensaje) ? mensaje : respaldo;
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
    permisos: [
      'conversaciones.ver_todas',
      'bandeja.operar',
      'crm.escribir',
      'cotizacion.escribir',
      'archivo.ver',
      'archivo.operar',
      // ADR-0034 §6: el ASESOR ve y registra pagos; corregir (`cobro.corregir`) es del dueño.
      'cobro.ver',
      'cobro.registrar',
    ],
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
      'catalogo.administrar',
      'bandeja.operar',
      'crm.escribir',
      'cotizacion.escribir',
      'archivo.ver',
      'archivo.operar',
    ],
  },
};

/** Operaciones: solo lectura salvo el archivo de viaje (misma concesión que la API, T-249). */
export const MOCK_SESION_OPERACIONES: SesionActualTipo = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000004',
    correo: 'operaciones@viajapro.com',
    nombre: 'Operaciones ViajaPro',
  },
  agencias: [MOCK_AGENCIA_PRINCIPAL],
  tenantActivoId: MOCK_AGENCIA_PRINCIPAL.id,
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000044',
    rol: 'Operaciones',
    permisos: ['conversaciones.ver_todas', 'archivo.ver', 'archivo.operar'],
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
  const datosValidados = validarEntrada(EsquemaIniciarSesion, credenciales);
  // Durante la transicion del contrato (ADR-0031) el cuerpo puede traer `correo` o `identificador`.
  const identificador = datosValidados.identificador ?? datosValidados.correo ?? '';

  if (!usaAuthReal()) {
    // Modo mock offline (solo si el interruptor real está apagado)
    if (
      identificador.toLowerCase().includes('error@') ||
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
      identificador.toLowerCase().includes('dueno@') ||
      identificador.toLowerCase().includes('admin@')
    ) {
      sesionEnMemoriaMock = { ...MOCK_SESION_DUENO };
      return sesionEnMemoriaMock;
    }
    if (identificador.toLowerCase().includes('multi@')) {
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
      throw new AuthApiError(code, mapearErrorAcceso(code, message, details), res.status, details);
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
  const sesionParseada = EsquemaSesionActual.parse(cuerpo);
  fijarSesionActiva(sesionParseada);
  return sesionParseada;
}

/**
 * Cierra la sesión activa.
 * POST /api/v1/auth/sign-out
 */
export async function cerrarSesionApi(): Promise<void> {
  if (!usaAuthReal()) {
    sesionEnMemoriaMock = null;
    fijarSesionActiva(null);
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
      throw new AuthApiError(code, mapearErrorAcceso(code, message, details), res.status, details);
    }
    throw new AuthApiError('ERROR_SERVIDOR', 'Error al consultar la sesión actual', res.status);
  }

  const sesionParseada = EsquemaSesionActual.parse(cuerpo);
  fijarSesionActiva(sesionParseada);
  return sesionParseada;
}

/**
 * Fija la agencia activa cuando la sesión tiene acceso a varias.
 * POST /api/v1/auth/tenant-activo
 */
export async function cambiarAgenciaActivaApi(tenantId: string): Promise<SesionActualTipo> {
  const payload = validarEntrada(EsquemaCambiarAgenciaActiva, { tenantId });

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
        permisos: [
          'conversaciones.ver_todas',
          'bandeja.operar',
          'crm.escribir',
          'cotizacion.escribir',
          'archivo.ver',
          'archivo.operar',
        ],
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
      throw new AuthApiError(code, mapearErrorAcceso(code, message, details), res.status, details);
    }
    throw new AuthApiError('ERROR_SERVIDOR', 'Error al cambiar de agencia activa', res.status);
  }

  const sesionParseada = EsquemaSesionActual.parse(cuerpo);
  fijarSesionActiva(sesionParseada);
  return sesionParseada;
}

let sesionActualEnMemoria: SesionActualTipo | null = null;

export function fijarSesionActiva(sesion: SesionActualTipo | null): void {
  sesionActualEnMemoria = sesion;
}

export function obtenerSesionActiva(): SesionActualTipo | null {
  return sesionActualEnMemoria;
}

export function haySesionActiva(): boolean {
  return Boolean(sesionActualEnMemoria?.tenantActivoId);
}
