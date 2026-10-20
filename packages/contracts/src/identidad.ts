/**
 * Identidad y permisos — ADR-0011.
 *
 * **El catálogo de permisos es código, no tabla.** Lo que el sistema sabe hacer es un
 * invariante del dominio; cómo lo agrupa cada agencia en roles es política (tabla `roles`,
 * R12). Este enum es la fuente de verdad, y la base lo refleja en el `CHECK
 * roles_permisos_del_catalogo` (migración `20261019230000`). Añadir un permiso es editar
 * los dos: un permiso que la base no admite no se puede asignar, y uno que el código no
 * conoce no autoriza nada.
 */

import { z } from 'zod';

export const PERMISOS = [
  /** Ver la tarifa neta del mayorista y el margen de una cotización. */
  'cotizacion.ver_neto_y_margen',
  /** Invitar, desactivar y cambiar de rol a los usuarios de la agencia. */
  'usuarios.administrar',
  /** Crear, renombrar y editar los permisos de los roles de la agencia. */
  'roles.administrar',
  /** Ver las conversaciones de toda la agencia, no solo las asignadas. */
  'conversaciones.ver_todas',
] as const;

export const Permiso = z.enum(PERMISOS);
export type Permiso = z.infer<typeof Permiso>;

/** Los tres roles que recibe toda agencia al darse de alta. La agencia puede renombrarlos. */
export const ClaveRolSembrado = z.enum(['DUENO', 'ASESOR', 'OPERACIONES']);
export type ClaveRolSembrado = z.infer<typeof ClaveRolSembrado>;

// =============================================================================
// Rutas de autenticación — ADR-0011, rebanada 2
//
//   POST /api/v1/auth/sign-in/email   iniciar sesión (cookie opaca; NUNCA devuelve el token)
//   POST /api/v1/auth/sign-out        cerrar sesión
//   GET  /api/v1/auth/session         quién soy, en qué agencias estoy y cuál es la activa
//   POST /api/v1/auth/tenant-activo   cambiar de agencia (comprueba la membresía bajo RLS)
//
// El token de sesión **no aparece en ningún contrato**: vive solo en la cookie `HttpOnly`. Una
// respuesta que lo devolviera le serviría a cualquier script inyectado.
// =============================================================================

/** Cuerpo de `POST /api/v1/auth/sign-in/email`. */
export const IniciarSesion = z.object({
  correo: z.string().trim().email().max(255),
  // Sin `min`: el largo mínimo se exige al CREAR la contraseña, no al comprobarla. Rechazar
  // aquí una contraseña corta distinguiría «no cumple el formato» de «es incorrecta».
  contrasena: z.string().min(1).max(256),
});
export type IniciarSesion = z.infer<typeof IniciarSesion>;

/** Una agencia en la que la identidad tiene acceso. Lo justo para el selector. */
export const AgenciaDeAcceso = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  slug: z.string(),
});
export type AgenciaDeAcceso = z.infer<typeof AgenciaDeAcceso>;

/** La persona que inició sesión. */
export const IdentidadDeSesion = z.object({
  id: z.string().uuid(),
  correo: z.string(),
  nombre: z.string(),
});
export type IdentidadDeSesion = z.infer<typeof IdentidadDeSesion>;

/** Lo que la agencia activa le da a esta persona. Nulo mientras no haya agencia activa. */
export const AccesoActivo = z.object({
  usuarioId: z.string().uuid(),
  rol: z.string(),
  permisos: z.array(Permiso),
});
export type AccesoActivo = z.infer<typeof AccesoActivo>;

/**
 * Respuesta de iniciar sesión y de `GET /api/v1/auth/session`.
 *
 * `tenantActivoId` es nulo cuando la persona tiene varias agencias y aún no eligió una: la web
 * muestra el selector con `agencias`. Con una sola agencia, ya viene fijada.
 */
export const SesionActual = z.object({
  identidad: IdentidadDeSesion,
  agencias: z.array(AgenciaDeAcceso),
  tenantActivoId: z.string().uuid().nullable(),
  acceso: AccesoActivo.nullable(),
});
export type SesionActual = z.infer<typeof SesionActual>;

/** Cuerpo de `POST /api/v1/auth/tenant-activo`. */
export const CambiarAgenciaActiva = z.object({
  tenantId: z.string().uuid(),
});
export type CambiarAgenciaActiva = z.infer<typeof CambiarAgenciaActiva>;

/**
 * Códigos de error estables de la autenticación. La web decide qué enseñar con ellos; los
 * mensajes pueden cambiar, estos no.
 */
export const CodigoDeErrorDeAcceso = z.enum([
  /** No hay cookie de sesión, o no corresponde a ninguna sesión viva. */
  'SIN_SESION',
  /** Hay sesión pero ninguna agencia activa: la web muestra el selector. */
  'SIN_AGENCIA_ACTIVA',
  /** La persona ya no pertenece a la agencia activa, o la dieron de baja. La sesión se revoca. */
  'ACCESO_REVOCADO',
  /** La agencia está suspendida o cancelada. La sesión se revoca. */
  'AGENCIA_SUSPENDIDA',
  /** Correo o contraseña incorrectos. Mismo código exista o no el correo. */
  'CREDENCIALES_INVALIDAS',
  'DEMASIADOS_INTENTOS',
  /** El `Origin` de una petición con cookie no es de confianza. */
  'ORIGEN_NO_CONFIABLE',
  /** Pidió una agencia a la que no pertenece (o que está suspendida). */
  'SIN_MEMBRESIA',
  /** Le falta un permiso del catálogo. */
  'PERMISO_DENEGADO',
]);
export type CodigoDeErrorDeAcceso = z.infer<typeof CodigoDeErrorDeAcceso>;
