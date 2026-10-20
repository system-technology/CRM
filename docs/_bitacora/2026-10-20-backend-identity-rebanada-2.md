# 2026-10-20 — Módulo `identity`: Better Auth, sesión y tenant de sesión (ADR-0011, rebanada 2)

Agente: `backend`. Rama `feat/identity-modulo`, desde `origin/main` (v0.33.1, con la rebanada 1 integrada).

## Qué quedó

- **Módulo `identity`** (`apps/api/src/modules/identity/`): `domain` (puertos), `application` (casos de
  uso), `infrastructure` (Better Auth, pool, adaptadores), `interface` (las cuatro rutas).
- **Better Auth autoalojado, sin plugins**, con `modelName`/`fields` hacia nuestras tablas. No se monta
  `auth.handler` como ruta abierta: iniciar y cerrar sesión lo invocan por dentro (se conserva su límite
  de intentos y su comprobación de `Origin`); el resto de su superficie no es alcanzable. El token no sale
  nunca en un cuerpo de respuesta.
- **Pool propio** `PrismaIdentidadService` sobre `DATABASE_IDENTIDAD_URL`, con guardia de arranque (R2):
  aborta si el rol no es `viajapro_identidad`, si es superusuario, si tiene BYPASSRLS **o si puede leer
  `usuarios`, `roles`, `contactos`, `mensajes` o `cotizaciones`**. `ROLES_DE_CONEXION` ya lo incluye.
- **Sesión:** cookie opaca `__Secure-viajapro.session_token`, `HttpOnly; Secure; SameSite=Lax`,
  `session.cookieCache.enabled = false` (explícito), `emailAndPassword.disableSignUp = true`, 7 días con
  renovación diaria. Mínimo de contraseña: 12.
- **`TenantMiddleware`** (sigue en `shared/`) pregunta a `identity` por el puerto `ResolutorDeAcceso`
  (R4): pasos 3 y 4 del flujo. El paso 4 corre con `viajapro_app` bajo RLS; cero filas revoca la sesión.
  Agencia `SUSPENDIDO`/`CANCELADO` → 401 `AGENCIA_SUSPENDIDA` y revoca.
- **`RUTAS_SIN_TENANT`** pasa de `/api/v1/auth/` a cuatro rutas **exactas**; lo demás falla cerrado.
- **Cabecera de desarrollo:** solo con `APP_ENV=local` **y sin cookie de sesión** (una cookie revocada
  tampoco la rehabilita). Concede todos los permisos.
- **Permiso «ver neto y margen»:** `autorizarMargen()` en `cotizaciones.controller` (4 rutas) y
  `salidas.controller` (`POST /catalogo/cotizar`, cuerpo). Sin el permiso, 403 `PERMISO_DENEGADO`.
  `@RequierePermiso` + `PermisoGuard` (APP_GUARD) quedan listos para el resto.
- **Rutas:** `POST /api/v1/auth/sign-in/email`, `POST /api/v1/auth/sign-out`,
  `GET /api/v1/auth/session`, `POST /api/v1/auth/tenant-activo` (comprueba la membresía bajo RLS antes
  de escribir; `Origin` obligatorio; 403 `SIN_MEMBRESIA` no revoca la sesión).
- **Contratos** en `packages/contracts/src/identidad.ts`: `IniciarSesion`, `SesionActual`,
  `AgenciaDeAcceso`, `IdentidadDeSesion`, `AccesoActivo`, `CambiarAgenciaActiva`,
  `CodigoDeErrorDeAcceso`. **El frontend depende de esto.**
- **Errores tipados:** `NoAutenticadoError` (401), `ProhibidoError` (403), `DemasiadosIntentosError`
  (429) en `packages/domain`; el filtro global los traduce.
- **Socket:** Socket.IO NO existe en la API. Queda el contrato `RevalidarConexion` +
  `INTERVALO_DE_REVALIDACION_MS` (60 s), con su prueba unitaria, y cuatro `it.todo` en el e2e.

## El hash del token

Better Auth **no** hashea el token de sesión de forma nativa (solo el OTP del plugin Email OTP, con
`storeOTP: 'hashed'`, que no está instalado). Se resolvió en el adaptador: `conTokenDeSesionHasheado`
envuelve el adaptador de Prisma. Guarda `sha256:<hex>`; al crear devuelve el token en claro (la cookie se
firma con él); al buscar por token lo hashea y devuelve el token pedido (la renovación re-firma bien);
las filas pedidas por otra cosa salen con el hash. **No es idempotente a propósito:** presentar el hash
guardado no abre nada, y la contrapartida es que las sesiones se revocan por identidad o por id, nunca
por un token leído de la base. Pruebas: unitaria del adaptador, y e2e que lee la fila con SQL y comprueba
`^sha256:` y que ninguna columna contiene el token.

**OTP:** hoy no hay OTP que guardar. Cuando entre Email OTP (rebanada 4) **debe** llevar
`storeOTP: 'hashed'`; queda anotado en `crear-auth.ts`.

## Dependencia nueva (justificación)

`better-auth@^1.7.11` en `apps/api`. Es la opción B de ADR-0011 (sesión, hash scrypt, límite de intentos,
comprobación de origen, firma de cookies: seguridad probada que no se escribe a mano, opción D descartada
por el ADR). Licencia MIT. Trae su propio `zod` 4 anidado; el proyecto sigue en zod 3 sin conflicto.
Consultada la versión 1.7.11 instalada (tipos y fuentes en `node_modules`) y `pnpm view`; sin MCP de
documentación en esta sesión.

## Decisiones menores tomadas (con default, sin bloquear)

- `accountId` de `credenciales` se mapea a la **misma columna** que `userId` (`identidad_id`): la tabla
  no tiene `account_id`. Correcto mientras no haya proveedores sociales (no los hay). El día que los haya,
  `datos` añade la columna y se borra una línea en `crear-auth.ts`.
- `image` de la identidad no tiene columna: Better Auth nunca la escribe sin registro público.
- Una identidad con `eliminado_en` no inicia sesión (hook `session.create.before`, mismo error que una
  contraseña mala).
- `x-forwarded-for` se reenvía a Better Auth; si no viene, se usa la dirección del socket. Ver cola.
- `Secure` siempre, también en local: Chrome y Firefox lo aceptan en `http://localhost`; Safari no.

## Variables nuevas (sin valores)

`DATABASE_IDENTIDAD_URL`, `BETTER_AUTH_SECRET`, `IDENTIDAD_DEV_PASSWORD` (solo local, para el script de
credenciales de la semilla). En `.env.example`, vacías. CI: `BETTER_AUTH_SECRET` se genera por job;
`DATABASE_IDENTIDAD_URL` la exporta `roles-de-desarrollo.mjs` (ahora con cuatro roles). Las pruebas
fabrican un secreto efímero si falta (`apps/api/src/vitest.setup.ts`).

## Cola (no bloquea)

| Pendiente | Dueño |
|---|---|
| `POST /api/v1/catalogo/paquetes/cotizar` devuelve `margen` y neto SIEMPRE (el contrato `CotizacionCalculada` no tiene `incluirMargen`). Es la ruta del cotizador antiguo. Decidir: exigir el permiso (el asesor pierde el cotizador viejo), o añadir `incluirMargen` al contrato | `dueno-de-producto` + `backend` |
| Límite de intentos en memoria: con varias réplicas hay que llevarlo a Redis. Y fijar `trustedProxies` / confiar solo en el `x-forwarded-for` del balanceador propio (hoy un cliente puede falsearlo para esquivar el límite por IP) | `backend`, `devops` |
| No hay límite por correo, solo por IP | `backend` |
| Eventos de auditoría (inicio de sesión, fallo, cambio de agencia) al módulo `audit`, que no existe | `backend` |
| Evento por outbox para `disconnectSockets()` al dar de baja o revocar | `backend` (con el gateway) |
| La cookie caducada/revocada no se expira en el navegador (el 401 la deja ahí; Better Auth la limpiaría, pero `obtener` descarta sus cabeceras cuando no hay sesión) | `backend` |
| `eliminado_en` de la identidad no se comprueba en cada petición (el rol de la API no lee `identidades`); lo cubre el procedimiento de supresión, que debe borrar sesiones | `datos`, `backend` |
| Mapear `account_id` con columna propia si hay proveedores sociales | `datos` |
