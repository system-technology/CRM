/**
 * Identidad y permisos — ADR-0011.
 *
 * **El catálogo de permisos es código, no tabla.** Lo que el sistema sabe hacer es un
 * invariante del dominio; cómo lo agrupa cada agencia en roles es política (tabla `roles`,
 * R12). Este enum es la fuente de verdad, y la base lo refleja en el `CHECK
 * roles_permisos_del_catalogo` (migración `20261019230000`, ampliado en `20261026120000`,
 * `20261104130000` y `20261118100000`). Añadir un permiso es editar los dos: un permiso que la base no admite no
 * se puede asignar, y uno que el código no conoce no autoriza nada.
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
  /**
   * Operar la bandeja: las mutaciones sobre conversaciones y mensajes (T-089). Ver las
   * conversaciones ajenas sigue exigiendo `conversaciones.ver_todas`. Migración `20261104130000`.
   */
  'bandeja.operar',
  /** Las mutaciones del CRM: contactos, oportunidades, seguimientos (T-089). */
  'crm.escribir',
  /**
   * Crear cotizaciones y sus versiones (T-089). Ver el neto y el margen sigue exigiendo
   * `cotizacion.ver_neto_y_margen`.
   */
  'cotizacion.escribir',
  /**
   * Leer los archivos de viaje: lista, detalle, reservas y pasajeros (nombres y edades, menores
   * incluidos). El neto sigue exigiendo `cotizacion.ver_neto_y_margen`. ADR-0024 §3.7, T-249,
   * migración `20261118100000`.
   */
  'archivo.ver',
  /**
   * Operar los archivos de viaje: avanzar reservas (confirmar, abonar, pagar al proveedor), editar
   * pasajeros y cancelar el archivo. ADR-0024 §3.7, T-249.
   */
  'archivo.operar',
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

/**
 * Un miembro de la agencia, tal como lo lista `GET /api/v1/identidad/miembros` (T-121).
 *
 * `id` es el de `usuarios` (la pertenencia a ESTA agencia, el mismo que usa
 * `POST /miembros/:id/baja`), nunca el de la identidad global. `rol.clave` es `null` en un rol
 * personalizado. `estado` es `INACTIVO` para quien está dado de baja. Las invitaciones aun no
 * aceptadas no se listan (se guardan por hash del token, sin correo recuperable) y no hay
 * telefono: la tabla `usuarios` no lo tiene.
 */
export const MiembroDeAgencia = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  correo: z.string(),
  rol: z.object({
    id: z.string().uuid(),
    clave: z.string().nullable(),
    nombre: z.string(),
  }),
  estado: z.enum(['ACTIVO', 'INACTIVO']),
  /** ISO 8601 UTC. */
  creadoEn: z.string().datetime(),
  ultimoAccesoEn: z.string().datetime().nullable(),
});
export type MiembroDeAgencia = z.infer<typeof MiembroDeAgencia>;

/** Respuesta de `GET /api/v1/identidad/miembros`: activos primero, luego por nombre. */
export const ListaDeMiembros = z.array(MiembroDeAgencia);
export type ListaDeMiembros = z.infer<typeof ListaDeMiembros>;

/**
 * Un miembro al que se puede asignar una conversación (ADR-0022). Solo id y nombre: es lo que
 * el modal de reasignar necesita, y nada más (minimización, Ley 1581). `id` es el de `usuarios`,
 * el mismo que acepta `PUT /api/v1/conversaciones/:id/asignacion`.
 */
export const MiembroAsignable = z
  .object({
    id: z.string().uuid(),
    nombre: z.string(),
  })
  .strict();
export type MiembroAsignable = z.infer<typeof MiembroAsignable>;

/** Respuesta de `GET /api/v1/identidad/miembros/asignables`: ordenada por nombre (`es`). */
export const ListaDeMiembrosAsignables = z.array(MiembroAsignable);
export type ListaDeMiembrosAsignables = z.infer<typeof ListaDeMiembrosAsignables>;

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

/**
 * Respuesta de `GET /api/v1/agencia/ajustes`: lo que la web necesita de la agencia activa para
 * presentar (zona horaria para formatear fechas, moneda y país por defecto). Lee de `tenants`.
 *
 * La zona y el nombre se leen de `tenants`; la zona se cambia con `PATCH` (`CambiarAjustesDeAgencia`),
 * que pasa por la función `actualizar_zona_horaria_de_la_agencia` y no por un UPDATE (ADR-0027). El RNT
 * se lee y se escribe en `perfiles_de_agencia` (T-261).
 * Las fechas siguen en UTC en la base (R9); esto solo gobierna la presentación.
 */
export const AjustesDeAgencia = z.object({
  nombre: z.string(),
  paisIso: z.string().length(2),
  monedaIso: z.string().length(3),
  /** Nombre IANA, p. ej. `America/Bogota`. */
  zonaHoraria: z.string(),
  /**
   * T-261. El RNT que declaró la agencia; `null` si no lo ha escrito. Lee de `perfiles_de_agencia`.
   * La API lo envía siempre; es opcional en el esquema solo para que una respuesta anterior a T-261
   * siga validando.
   */
  rnt: z.string().nullable().optional(),
  /**
   * T-261. `true` solo si la plataforma verificó ESE RNT. Lo que declara la agencia no está
   * verificado, y ningún documento hacia el viajero imprime un RNT sin verificar (ADR-0030 §3.3).
   * Ningún cuerpo de `PATCH` puede fijarlo: lo conserva o lo anula la base. Opcional por la misma
   * razón que `rnt`.
   */
  rntVerificado: z.boolean().optional(),
});
export type AjustesDeAgencia = z.infer<typeof AjustesDeAgencia>;

/**
 * El RNT (Registro Nacional de Turismo): solo dígitos, de 1 a 10. Es la misma regla del CHECK
 * `perfiles_de_agencia_rnt_formato`; el formato exacto del registro oficial no está verificado.
 */
export const RntDeAgencia = z.string().regex(/^[0-9]{1,10}$/, 'El RNT son solo dígitos, de 1 a 10');
export type RntDeAgencia = z.infer<typeof RntDeAgencia>;

/**
 * Cuerpo de `PATCH /api/v1/agencia/ajustes` (permiso `usuarios.administrar`): la zona horaria y/o el
 * RNT, al menos uno. `rnt: null` borra el RNT. Cambiar el RNT lo deja sin verificar. La forma la
 * valida aquí; que la zona sea un nombre IANA real lo decide la base (422 si no).
 * `.strict()`: ni `tenantId` ni `rntVerificado` ni `verificadoEn` se aceptan en el cuerpo.
 */
export const CambiarAjustesDeAgencia = z
  .object({
    zonaHoraria: z.string().min(1).max(64).regex(/^\S+$/, 'Sin espacios').optional(),
    rnt: RntDeAgencia.nullable().optional(),
  })
  .strict()
  .refine((c) => c.zonaHoraria !== undefined || c.rnt !== undefined, {
    message: 'No hay nada que cambiar',
  });
export type CambiarAjustesDeAgencia = z.infer<typeof CambiarAjustesDeAgencia>;
