/**
 * Identidad y permisos — ADR-0011.
 *
 * **El catálogo de permisos es código, no tabla.** Lo que el sistema sabe hacer es un
 * invariante del dominio; cómo lo agrupa cada agencia en roles es política (tabla `roles`,
 * R12). Este enum es la fuente de verdad, y la base lo refleja en el `CHECK
 * roles_permisos_del_catalogo` (migración `20261019230000`, ampliado en `20261026120000`). Añadir un permiso es editar
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
  /**
   * Crear, editar, desactivar e importar el catálogo; confirmar propuestas de la IA; cambiar la
   * política `promo_vencida` (ADR-0017 §5). Escribir o leer el neto exige ADEMÁS
   * `cotizacion.ver_neto_y_margen`. Migración `20261026120000`.
   */
  'catalogo.administrar',
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
  /** El código por correo no es válido, caducó o se agotaron sus intentos. */
  'CODIGO_INVALIDO',
  /** El token de invitación no existe, ya se usó o caducó. Mismo código en los tres casos. */
  'INVITACION_INVALIDA',
]);
export type CodigoDeErrorDeAcceso = z.infer<typeof CodigoDeErrorDeAcceso>;

// =============================================================================
// Invitaciones y código por correo — ADR-0011, rebanada 4
//
//   POST /api/v1/identidad/invitaciones       el dueño invita (permiso `usuarios.administrar`)
//   POST /api/v1/auth/invitaciones/aceptar    la persona invitada acepta, SIN sesión
//   POST /api/v1/auth/otp/enviar              pide un código de un solo uso por correo
//   POST /api/v1/auth/otp/iniciar-sesion      inicia sesión con ese código
//
// **Ninguna respuesta revela si un correo ya existe** (en esta agencia, en otra o en ninguna):
// invitar y pedir un código responden SIEMPRE lo mismo. El enlace de la invitación lo arma la
// web: `<WEB_PUBLIC_URL>/aceptar-invitacion?token=<token>`.
// =============================================================================

/** Cuerpo de `POST /api/v1/identidad/invitaciones`. El rol es de la agencia de quien invita. */
export const InvitarMiembro = z.object({
  correo: z.string().trim().toLowerCase().email().max(255),
  rolId: z.string().uuid(),
});
export type InvitarMiembro = z.infer<typeof InvitarMiembro>;

/** Cuerpo de `POST /api/v1/auth/invitaciones/aceptar`. */
export const AceptarInvitacion = z.object({
  token: z.string().min(20).max(200),
  nombre: z.string().trim().min(1).max(200),
  /** Solo se usa si la identidad no existía. Una identidad existente conserva la suya. */
  contrasena: z.string().min(12).max(128),
});
export type AceptarInvitacion = z.infer<typeof AceptarInvitacion>;

/** Cuerpo de `POST /api/v1/auth/otp/enviar`. */
export const EnviarCodigo = z.object({
  correo: z.string().trim().toLowerCase().email().max(255),
});
export type EnviarCodigo = z.infer<typeof EnviarCodigo>;

/** Cuerpo de `POST /api/v1/auth/otp/iniciar-sesion`. Responde con `SesionActual`. */
export const IniciarSesionConCodigo = z.object({
  correo: z.string().trim().toLowerCase().email().max(255),
  codigo: z.string().regex(/^\d{6}$/, 'son seis dígitos'),
});
export type IniciarSesionConCodigo = z.infer<typeof IniciarSesionConCodigo>;

/** La única respuesta de invitar, aceptar y pedir código: `{ ok: true }`. */
export const RespuestaOk = z.object({ ok: z.literal(true) });
export type RespuestaOk = z.infer<typeof RespuestaOk>;
