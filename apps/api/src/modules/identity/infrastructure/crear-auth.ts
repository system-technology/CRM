/**
 * Better Auth, autoalojado, configurado como pide ADR-0011.
 *
 * Cada opción de abajo es una decisión del ADR o una condición del auditor de seguridad, y el
 * comentario dice cuál. **Lo que NO está aquí también es una decisión:**
 *

 *   · Un solo plugin: *Email OTP*, con `storeOTP: 'hashed'` (condición del auditor). No se usa
 *     *Organization* (ADR-0011 §4: sus tablas serían globales).
 *   · No se monta `auth.handler` como ruta abierta. `identity` expone solo sus rutas
 *     del contrato (ver `auth.controller.ts`); el resto de la superficie de Better Auth
 *     (listar sesiones, cambiar correo, restablecer contraseña…) no es alcanzable.
 *
 * **El mapeo a nuestras tablas** (`modelName` y `fields`) es la razón de que no haya una
 * migración de Better Auth: las tablas las escribió `datos` con nombres en español, y aquí se le
 * explica a la biblioteca cómo se llaman. Dos huecos conocidos, ver los comentarios en línea:
 * `image` (no hay foto de perfil) y `accountId` (se apunta a la misma columna que `userId`).
 */
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { Auth } from 'better-auth/types';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '@prisma/client';
import { conTokenDeSesionHasheado } from './adaptador-con-token-hasheado.js';

export interface OpcionesDeAuth {
  /** El cliente con el rol `viajapro_identidad`. Ningún otro. */
  prisma: PrismaClient;
  /** `BETTER_AUTH_SECRET`. Firma las cookies. Mínimo 32 caracteres. */
  secreto: string;
  /** Origen público de la API: `API_PUBLIC_URL`. */
  baseUrl: string;
  /** Orígenes desde los que un navegador puede llamar con cookie: la web. */
  origenesDeConfianza: string[];
  /** Duración de la sesión, en segundos. */
  sesionDuraSegundos?: number;
  /** Cada cuánto se renueva la fecha de expiración mientras se usa, en segundos. */
  sesionSeRenuevaCadaSegundos?: number;
  /**
   * Entrega un código de un solo uso. Encola el correo (R5): NO lo envía. No debe lanzar ni
   * hacer esperar según el correo exista o no, para no revelarlo; este módulo no la espera.
   */
  enviarCodigo: (correo: string, codigo: string) => Promise<void>;
}

/** Longitud, vigencia e intentos del código por correo. Corto y de pocos intentos a propósito. */
export const CODIGO_DE_CORREO = { longitud: 6, vigenciaSegundos: 5 * 60, intentos: 3 } as const;

/** Cuántos intentos de inicio de sesión por minuto y dirección IP. */
export const INTENTOS_DE_INICIO_POR_MINUTO = 5;

export const RUTA_BASE_DE_AUTENTICACION = '/api/v1/auth';

export function leerSecretoDeAutenticacion(entorno: Record<string, string | undefined>): string {
  const secreto = entorno['BETTER_AUTH_SECRET'];
  if (!secreto || secreto.length < 32) {
    throw new Error(
      'Falta BETTER_AUTH_SECRET o tiene menos de 32 caracteres. Firma las cookies de sesión: ' +
        'no hay valor por omisión a propósito, porque uno conocido permitiría falsificarlas. ' +
        'Genera uno con `openssl rand -base64 48` y guárdalo en el gestor de secretos (R6).',
    );
  }
  return secreto;
}

export function crearAuth(opciones: OpcionesDeAuth): Auth {
  const { prisma } = opciones;
  const base = prismaAdapter(prisma, { provider: 'postgresql' });

  const auth = betterAuth({
    appName: 'viajapro',
    secret: opciones.secreto,
    baseURL: opciones.baseUrl,
    basePath: RUTA_BASE_DE_AUTENTICACION,
    trustedOrigins: opciones.origenesDeConfianza,
    telemetry: { enabled: false },

    // El token de sesión se guarda hasheado (condición del auditor, bloqueante). Ver
    // `token-de-sesion.ts`.
    database: (opcionesDeBetterAuth: Parameters<typeof base>[0]) =>
      conTokenDeSesionHasheado(base(opcionesDeBetterAuth)),

    // --- Nuestras tablas -------------------------------------------------------------------
    user: {
      modelName: 'identidad',
      fields: {
        name: 'nombre',
        email: 'correo',
        emailVerified: 'correoVerificado',
        createdAt: 'creadoEn',
        updatedAt: 'actualizadoEn',
        // `image` no tiene columna: no hay foto de perfil. Better Auth no la escribe nunca
        // (no hay registro público), y al leer, una columna ausente sale como `undefined`.
      },
    },
    account: {
      modelName: 'credencial',
      fields: {
        userId: 'identidadId',
        // La tabla `credenciales` no tiene `account_id`. Para el proveedor `credential`,
        // Better Auth pone `accountId = userId`, así que se apunta a la MISMA columna. Es
        // correcto mientras no haya proveedores sociales (ADR-0011 §5: no los hay); el día
        // que se añadan, `datos` añade la columna y esta línea se borra.
        accountId: 'identidadId',
        providerId: 'proveedor',
        password: 'hashContrasena',
        createdAt: 'creadoEn',
        updatedAt: 'actualizadoEn',
      },
      accountLinking: { enabled: false },
    },
    session: {
      modelName: 'sesion',
      fields: {
        userId: 'identidadId',
        expiresAt: 'expiraEn',
        ipAddress: 'ip',
        userAgent: 'agenteUsuario',
        createdAt: 'creadoEn',
        updatedAt: 'actualizadoEn',
      },
      additionalFields: {
        // Nulo hasta elegir agencia. NO autoriza nada: el paso 4 del flujo lo revalida bajo RLS.
        tenantActivoId: { type: 'string', required: false, input: false },
      },
      expiresIn: opciones.sesionDuraSegundos ?? 60 * 60 * 24 * 7,
      updateAge: opciones.sesionSeRenuevaCadaSegundos ?? 60 * 60 * 24,
      // **Desactivada, de forma explícita** (ADR-0011 §1). Con la caché de cookie la sesión se
      // validaría contra la cookie firmada y no contra la base: una baja tardaría lo que dure
      // la caché en surtir efecto. Cada petición lee la tabla; con 300 usuarios no importa.
      cookieCache: { enabled: false },
    },
    verification: {
      modelName: 'verificacion',
      fields: {
        identifier: 'identificador',
        value: 'valor',
        expiresAt: 'expiraEn',
        createdAt: 'creadoEn',
        updatedAt: 'actualizadoEn',
      },
    },

    // --- Acceso ----------------------------------------------------------------------------
    // Código de un solo uso por correo (ADR-0011 §5), solo para INICIAR SESIÓN.
    //   · `storeOTP: 'hashed'`: el código se guarda hasheado (condición del auditor, bloqueante).
    //   · `disableSignUp`: un código nunca crea una identidad; solo se entra por invitación.
    //   · Caduca en 5 minutos y se invalida a los 3 intentos fallidos.
    // Las demás rutas del plugin (verificar correo, restablecer contraseña, cambiar correo) no son
    // alcanzables: `auth.controller.ts` solo expone las dos que necesita.
    plugins: [
      emailOTP({
        otpLength: CODIGO_DE_CORREO.longitud,
        expiresIn: CODIGO_DE_CORREO.vigenciaSegundos,
        allowedAttempts: CODIGO_DE_CORREO.intentos,
        storeOTP: 'hashed',
        disableSignUp: true,
        sendVerificationOTP: ({ email, otp }) => {
          // Sin `await` ni errores hacia fuera: tardar o fallar distinto según el correo existiera
          // revelaría quién tiene cuenta. El plugin ni siquiera llama aquí si no existe.
          void opciones.enviarCodigo(email, otp).catch(() => undefined);
          return Promise.resolve();
        },
      }),
    ],

    emailAndPassword: {
      enabled: true,
      // Solo se entra por invitación o por script de plataforma (ADR-0011): no hay registro.
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },

    // --- Cookie ----------------------------------------------------------------------------
    advanced: {
      cookiePrefix: 'viajapro',
      // `Secure` siempre, también en local: Chrome y Firefox lo aceptan en http://localhost.
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      database: {
        // Las ids las genera Prisma (`@default(uuid(7))`), como en el resto del esquema.
        generateId: false,
        // Sin joins nativos: Better Auth pide las relaciones con consultas separadas, y no
        // depende de cómo se llamen los campos de relación del esquema de Prisma.
        joins: false,
      },
    },

    // Límite de intentos (ADR-0011, consecuencias). En memoria: sirve con una réplica; con
    // varias hay que llevarlo a Redis (cola de ESTADO.md). Ver `INTENTOS_DE_INICIO_POR_MINUTO`.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: INTENTOS_DE_INICIO_POR_MINUTO },
        '/sign-in/email-otp': { window: 60, max: INTENTOS_DE_INICIO_POR_MINUTO },
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
      },
    },

    databaseHooks: {
      session: {
        create: {
          // Paso 2 del flujo: con una sola agencia, queda fijada; con varias, nula y elige la
          // persona. El índice `accesos_identidad` solo informa; el paso 4 decide.
          before: async (sesion) => {
            // Una identidad dada de baja (Ley 1581: suprimir una identidad la marca) no inicia
            // sesión aunque su contraseña siga en la tabla. Mismo error que una contraseña
            // errónea: no se revela que la cuenta existió.
            const identidad = await prisma.identidad.findUnique({
              where: { id: sesion.userId },
              select: { eliminadoEn: true },
            });
            if (!identidad || identidad.eliminadoEn !== null) {
              throw new APIError('UNAUTHORIZED', { message: 'INVALID_EMAIL_OR_PASSWORD' });
            }

            const accesos = await prisma.accesoIdentidad.findMany({
              where: { identidadId: sesion.userId },
              select: { tenantAccesoId: true },
              take: 2,
            });
            const unica = accesos.length === 1 ? accesos[0]?.tenantAccesoId : undefined;
            return { data: { ...sesion, tenantActivoId: unica ?? null } };
          },
        },
      },
    },
  });
  // Anotación explícita: el tipo inferido arrastra tipos internos de zod 4 que no son portables.
  return auth as unknown as Auth;
}

export type AuthDeViajaPro = Auth;
