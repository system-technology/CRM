/**
 * Cliente de API para Equipo, Miembros e Invitaciones (ADR-0011, T-027).
 *
 * Conforme a @viajapro/contracts (InvitarMiembro, RespuestaOk, CodigoDeErrorDeAcceso, ClaveRolSembrado).
 * Regla R3: Tipos estrictamente inferidos de contratos oficiales.
 */

import {
  type InvitarMiembro as InvitarMiembroTipo,
  InvitarMiembro as EsquemaInvitarMiembro,
  ErrorApi as EsquemaErrorApi,
  ListaDeMiembros as EsquemaListaDeMiembros,
  type MiembroDeAgencia,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { esModoDemo } from './modo-demo';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import {
  MOCK_MIEMBROS_EQUIPO,
  type MiembroEquipo as MiembroMock,
  type RolMiembro,
} from './mock-configuracion';

export type { RolMiembro };

/**
 * Miembro tal como lo muestra la pantalla. En modo real viene de `MiembroDeAgencia`
 * (sin teléfono: la tabla `usuarios` no lo tiene). `INVITADO` solo existe en modo demo:
 * las invitaciones pendientes no son listables en la API.
 */
export interface MiembroEquipo {
  id: string;
  nombre: string;
  email: string;
  /** Solo en modo demo. */
  telefono?: string;
  /** Clave del rol sembrado; `null` en un rol propio de la agencia. */
  rolClave: string | null;
  rolNombre: string;
  estado: 'ACTIVO' | 'INACTIVO' | 'INVITADO';
  /** Fecha ISO (UTC en real: `creadoEn`; presentación en la pantalla). */
  fechaIngreso: string;
  avatarIniciales: string;
}

/** Iniciales (máx. 2) derivadas del nombre; cae al correo si el nombre está vacío. */
export function inicialesDeNombre(nombre: string, correo = ''): string {
  const base = nombre.trim() || correo.split('@')[0] || '';
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  const letras = partes
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('')
    .toUpperCase();
  return letras || '?';
}

/** Fecha de alta legible (es-CO). `creadoEn` (instante UTC) se muestra en la zona del navegador. */
export function formatearFechaIngreso(iso: string): string {
  const soloFecha = iso.length === 10;
  const d = new Date(soloFecha ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    ...(soloFecha ? { timeZone: 'UTC' } : {}),
  }).format(d);
}

/** Adapta el contrato de la API a lo que pinta la pantalla. */
export function miembroDesdeApi(m: MiembroDeAgencia): MiembroEquipo {
  return {
    id: m.id,
    nombre: m.nombre,
    email: m.correo,
    rolClave: m.rol.clave,
    rolNombre: m.rol.nombre,
    estado: m.estado,
    fechaIngreso: m.creadoEn,
    avatarIniciales: inicialesDeNombre(m.nombre, m.correo),
  };
}

function miembroDesdeMock(m: MiembroMock): MiembroEquipo {
  return {
    id: m.id,
    nombre: m.nombre,
    email: m.email,
    telefono: m.telefono,
    rolClave: m.rol,
    rolNombre: m.rol === 'DUENO' ? 'Dueño / Administrador' : 'Asesor Comercial',
    estado: m.estado,
    fechaIngreso: m.fechaIngreso,
    avatarIniciales: m.avatarIniciales,
  };
}

/** Error al leer o modificar miembros; `codigo` es el de la API o `ERROR_CONEXION`/`ERROR_SERVIDOR`. */
export class ErrorMiembrosApi extends Error {
  readonly codigo: string;
  readonly estado: number | null;

  constructor(codigo: string, mensaje: string, estado: number | null = null) {
    super(mensaje);
    this.name = 'ErrorMiembrosApi';
    this.codigo = codigo;
    this.estado = estado;
  }
}

export interface RolAgencia {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string;
}

export class ErrorInvitacionApi extends Error {
  readonly codigo: string;
  readonly queHacer: string;

  constructor(codigo: string, mensaje: string, queHacer: string) {
    super(mensaje);
    this.name = 'ErrorInvitacionApi';
    this.codigo = codigo;
    this.queHacer = queHacer;
  }
}

export interface ErrorInvitacion {
  codigo: string;
  mensaje: string;
  queHacer: string;
}

export const ROLES_PREDEFINIDOS_AGENCIA: RolAgencia[] = [
  {
    id: '01932000-0000-7000-8000-000000000001',
    clave: 'DUENO',
    nombre: 'Dueño / Administrador',
    descripcion: 'Control total de la agencia, configuración general y tarifas.',
  },
  {
    id: '01932000-0000-7000-8000-000000000002',
    clave: 'ASESOR',
    nombre: 'Asesor Comercial',
    descripcion: 'Atención de chats por WhatsApp, cotizaciones y seguimiento de clientes.',
  },
  {
    id: '01932000-0000-7000-8000-000000000003',
    clave: 'OPERACIONES',
    nombre: 'Operaciones y Logística',
    descripcion: 'Gestión de cupos, confirmación de salidas y relación con mayoristas.',
  },
];

const CLAVE_STORAGE_EQUIPO = 'viajapro_miembros_equipo_cache';

/**
 * Interpreta errores de la API o excepciones de red traduciéndolos a mensajes
 * claros en español con la acción recomendada (Criterio T-027).
 */
export function interpretarErrorInvitacion(error: unknown): ErrorInvitacion {
  if (typeof error === 'object' && error !== null && 'codigo' in error) {
    const cod = (error as { codigo: string }).codigo;

    switch (cod) {
      case 'CODIGO_INVALIDO':
        return {
          codigo: cod,
          mensaje: 'El código de invitación o activación ya fue utilizado o ha caducado.',
          queHacer: 'Genera una nueva invitación por correo para este asesor.',
        };
      case 'DEMASIADOS_INTENTOS':
        return {
          codigo: cod,
          mensaje: 'Se ha excedido el límite de envíos de invitaciones permitidas.',
          queHacer:
            'Espera 10 minutos antes de intentar invitar nuevamente para proteger tu reputación.',
        };
      case 'INVITACION_INVALIDA':
        return {
          codigo: cod,
          mensaje: 'El enlace o token de invitación no es válido o ya fue aceptado.',
          queHacer: 'Verifica la dirección de correo ingresada y reenvía la invitación.',
        };
      case 'PERMISO_DENEGADO':
        return {
          codigo: cod,
          mensaje: 'No tienes permisos de administrador («usuarios.administrar») en esta agencia.',
          queHacer: 'Pide a un Dueño de la agencia que actualice tus permisos en Miembros y Roles.',
        };
      case 'SIN_SESION':
        return {
          codigo: cod,
          mensaje: 'Tu sesión ha caducado por inactividad.',
          queHacer: 'Inicia sesión de nuevo con tu correo y contraseña.',
        };
      default:
        break;
    }
  }

  const rawMsg = error instanceof Error ? error.message : String(error);
  return {
    codigo: 'ERROR_DESCONOCIDO',
    mensaje: rawMsg || 'Ocurrió un error inesperado al procesar la invitación.',
    queHacer: 'Revisa la conexión a internet e inténtalo nuevamente.',
  };
}

/**
 * Consulta los roles disponibles para asignar en la agencia.
 */
export function listarRolesAgenciaApi(): Promise<RolAgencia[]> {
  return Promise.resolve(ROLES_PREDEFINIDOS_AGENCIA);
}

/**
 * Lista los miembros del equipo (`GET /api/v1/identidad/miembros`, requiere `usuarios.administrar`).
 * En modo real no cae a localStorage ni a datos simulados: lanza `ErrorMiembrosApi`.
 */
export async function listarMiembrosEquipoApi(): Promise<MiembroEquipo[]> {
  if (esModoDemo()) {
    return obtenerMiembrosCache().map(miembroDesdeMock);
  }

  const base = obtenerBaseApi();
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/identidad/miembros`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...cabecerasDeTenantDev(),
      },
      credentials: 'include',
    });
  } catch {
    throw new ErrorMiembrosApi(
      'ERROR_CONEXION',
      'No fue posible conectar con el servidor de ViajaPro.',
    );
  }

  if (!res.ok) {
    const raw = (await res.json().catch(() => null)) as unknown;
    const err = EsquemaErrorApi.safeParse(raw);
    if (res.status === 403) {
      throw new ErrorMiembrosApi(
        err.success ? err.data.error.code : 'PERMISO_DENEGADO',
        'No tienes permiso para ver el equipo.',
        403,
      );
    }
    throw new ErrorMiembrosApi(
      err.success ? err.data.error.code : 'ERROR_SERVIDOR',
      err.success ? err.data.error.message : `El servidor respondió con error ${res.status}.`,
      res.status,
    );
  }

  const parseo = EsquemaListaDeMiembros.safeParse(await res.json().catch(() => null));
  if (!parseo.success) {
    throw new ErrorMiembrosApi(
      'RESPUESTA_INVALIDA',
      'El servidor devolvió una lista de miembros con un formato inesperado.',
      res.status,
    );
  }
  return parseo.data.map(miembroDesdeApi);
}

/**
 * Da de baja a un miembro (`POST /api/v1/identidad/miembros/:id/baja`, mismo id de la lista).
 */
export async function darDeBajaMiembroApi(id: string): Promise<void> {
  if (esModoDemo()) {
    const restantes = obtenerMiembrosCache().map((m) =>
      m.id === id ? { ...m, estado: 'INACTIVO' as const } : m,
    );
    try {
      localStorage.setItem(CLAVE_STORAGE_EQUIPO, JSON.stringify(restantes));
    } catch {
      // cuota de storage llena: la baja demo es solo ilustrativa
    }
    return;
  }

  const base = obtenerBaseApi();
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/identidad/miembros/${encodeURIComponent(id)}/baja`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...cabecerasDeTenantDev() },
      credentials: 'include',
    });
  } catch {
    throw new ErrorMiembrosApi(
      'ERROR_CONEXION',
      'No fue posible conectar con el servidor de ViajaPro.',
    );
  }
  if (res.ok) return;

  const err = EsquemaErrorApi.safeParse(await res.json().catch(() => null));
  throw new ErrorMiembrosApi(
    res.status === 403 ? 'PERMISO_DENEGADO' : err.success ? err.data.error.code : 'ERROR_SERVIDOR',
    res.status === 403
      ? 'No tienes permiso para dar de baja miembros.'
      : err.success
        ? err.data.error.message
        : `El servidor respondió con error ${res.status}.`,
    res.status,
  );
}

/**
 * Envía una invitación por correo con rol asignado (POST /api/v1/identidad/invitaciones).
 */
export async function invitarMiembroApi(datos: {
  correo: string;
  rolId: string;
  nombre?: string;
  telefono?: string;
}): Promise<{ ok: boolean }> {
  // 1. Validar con Zod según contrato oficial (R3)
  const validacion = EsquemaInvitarMiembro.safeParse({
    correo: datos.correo,
    rolId: datos.rolId,
  });

  if (!validacion.success) {
    const primerError = validacion.error.errors[0]?.message ?? 'Datos de invitación inválidos.';
    throw new ErrorInvitacionApi(
      'DATOS_INVALIDOS',
      primerError,
      'Ingresa un correo electrónico con formato válido (ej: asesor@agencia.com).',
    );
  }

  const payload: InvitarMiembroTipo = validacion.data;

  if (esModoDemo()) {
    guardarMiembroInvitadoEnCache(datos);
    return { ok: true };
  }

  const base = obtenerBaseApi();
  let respuesta: Response;

  try {
    respuesta = await fetch(`${base}/api/v1/identidad/invitaciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...cabecerasDeTenantDev(),
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  } catch (_err) {
    throw new ErrorInvitacionApi(
      'ERROR_CONEXION',
      'No fue posible conectar con el servidor de ViajaPro.',
      'Comprueba tu conexión de red o contacta a soporte técnico.',
    );
  }

  // 202 Accepted según contrato NestJS
  if (respuesta.status === 202 || respuesta.status === 200 || respuesta.status === 201) {
    return { ok: true };
  }

  const errRaw = (await respuesta.json().catch(() => ({}))) as unknown;
  const parseErr = EsquemaErrorApi.safeParse(errRaw);

  if (parseErr.success) {
    throw new ErrorInvitacionApi(
      parseErr.data.error.code,
      parseErr.data.error.message,
      'Verifica los datos e intenta nuevamente.',
    );
  }

  if (respuesta.status === 403) {
    throw new ErrorInvitacionApi(
      'PERMISO_DENEGADO',
      'Acceso denegado: requieres permiso «usuarios.administrar».',
      'Solicita al dueño de la agencia que te habilite el permiso.',
    );
  }

  if (respuesta.status === 429) {
    throw new ErrorInvitacionApi(
      'DEMASIADOS_INTENTOS',
      'Demasiadas solicitudes de invitación enviadas recientemente.',
      'Espera unos minutos antes de intentar de nuevo.',
    );
  }

  throw new ErrorInvitacionApi(
    'ERROR_SERVIDOR',
    `El servidor respondió con error ${respuesta.status}.`,
    'Intenta nuevamente en unos instantes.',
  );
}

function obtenerMiembrosCache(): MiembroMock[] {
  if (typeof window === 'undefined') return MOCK_MIEMBROS_EQUIPO;
  try {
    const raw = localStorage.getItem(CLAVE_STORAGE_EQUIPO);
    if (!raw) return MOCK_MIEMBROS_EQUIPO;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as MiembroMock[];
    return MOCK_MIEMBROS_EQUIPO;
  } catch {
    return MOCK_MIEMBROS_EQUIPO;
  }
}

function guardarMiembroInvitadoEnCache(datos: {
  correo: string;
  rolId: string;
  nombre?: string;
  telefono?: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const actual = obtenerMiembrosCache();
    const iniciales = (datos.nombre || datos.correo)
      .trim()
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const rolEncontrado = ROLES_PREDEFINIDOS_AGENCIA.find((r) => r.id === datos.rolId);
    const rolKey: RolMiembro = rolEncontrado?.clave === 'DUENO' ? 'DUENO' : 'ASESOR';

    const nuevo: MiembroMock = {
      id: `01932000-0000-7000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`,
      nombre: datos.nombre?.trim() || datos.correo.split('@')[0] || 'Asesor Invitado',
      email: datos.correo.trim().toLowerCase(),
      telefono: datos.telefono?.trim() || '+573000000000',
      rol: rolKey,
      estado: 'INVITADO',
      fechaIngreso: new Date().toISOString().split('T')[0] ?? '2026-10-26',
      avatarIniciales: iniciales || 'AI',
    };

    const actualizados = [...actual, nuevo];
    localStorage.setItem(CLAVE_STORAGE_EQUIPO, JSON.stringify(actualizados));
  } catch {
    // Ignorar si cuota de storage está llena
  }
}
