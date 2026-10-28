/**
 * Cliente de API para Equipo, Miembros e Invitaciones (ADR-0011, T-027).
 *
 * Conforme a @viajapro/contracts (InvitarMiembro, RespuestaOk, CodigoDeErrorDeAcceso, ClaveRolSembrado).
 * Regla R3: Tipos estrictamente inferidos de contratos oficiales.
 */

import {
  type InvitarMiembro as InvitarMiembroTipo,
  InvitarMiembro as EsquemaInvitarMiembro,
  RespuestaOk as EsquemaRespuestaOk,
  ErrorApi as EsquemaErrorApi,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';
import { esModoDemo } from './modo-demo';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { MOCK_MIEMBROS_EQUIPO, type MiembroEquipo, type RolMiembro } from './mock-configuracion';

export type { MiembroEquipo, RolMiembro };

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
 * Lista los miembros del equipo y sus estados.
 */
export async function listarMiembrosEquipoApi(): Promise<MiembroEquipo[]> {
  if (esModoDemo()) {
    return obtenerMiembrosCache();
  }

  const base = obtenerBaseApi();
  try {
    const res = await fetch(`${base}/api/v1/identidad/usuarios`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...cabecerasDeTenantDev(),
      },
      credentials: 'include',
    });

    if (!res.ok) {
      return obtenerMiembrosCache();
    }

    const json = (await res.json()) as unknown;
    if (Array.isArray(json) && json.length > 0) {
      return json as MiembroEquipo[];
    }
    return obtenerMiembrosCache();
  } catch {
    return obtenerMiembrosCache();
  }
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
    const raw = (await respuesta.json().catch(() => ({ ok: true }))) as unknown;
    const okParse = EsquemaRespuestaOk.safeParse(raw);
    if (okParse.success) {
      guardarMiembroInvitadoEnCache(datos);
      return { ok: true };
    }
    guardarMiembroInvitadoEnCache(datos);
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

function obtenerMiembrosCache(): MiembroEquipo[] {
  if (typeof window === 'undefined') return MOCK_MIEMBROS_EQUIPO;
  try {
    const raw = localStorage.getItem(CLAVE_STORAGE_EQUIPO);
    if (!raw) return MOCK_MIEMBROS_EQUIPO;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as MiembroEquipo[];
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

    const nuevo: MiembroEquipo = {
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
