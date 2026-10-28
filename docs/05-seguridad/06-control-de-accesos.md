# Control de accesos: contraseñas, sesiones y MFA

| Campo | Valor |
|---|---|
| Versión | 0.1, borrador |
| Fecha | 2026-10-27 |
| Estado | **Pendiente de aprobación del propietario** |
| Responsable | `backend` (implementación), `auditor-seguridad` (revisión), propietario (cuentas de infraestructura) |
| Decisión de diseño | [ADR-0011](../03-adr/0011-autenticacion-y-tenant-de-sesion.md). Esta política no la cambia: la hace exigible |

> La matriz de roles y permisos dentro de una agencia va en [04-rbac.md](04-rbac.md), que sigue
> siendo un marcador. Esta política cubre **cómo se entra**, no **qué se puede hacer dentro**.

## 1. Alcance

Dos superficies con reglas distintas:

- **A. Usuarios de las agencias** en la aplicación (web y API).
- **B. Personas y máquinas con acceso a la infraestructura:** GitHub, Render, Neon, Meta
  Business, Postmark, el gestor de secretos y las GitHub Apps.

## 2. Reglas: usuarios de las agencias (A)

| # | Regla | Cómo se comprueba | Hoy |
|---|---|---|---|
| A1 | No hay registro abierto. Una identidad nace solo por invitación o por script de plataforma | `disableSignUp: true` en `apps/api/src/modules/identity/infrastructure/crear-auth.ts`; `invitaciones.e2e-spec.ts` | **Cumple** |
| A2 | Contraseña de **12 a 128 caracteres**, hash scrypt. Sin reglas de composición ni caducidad periódica (NIST SP 800-63B) | `minPasswordLength: 12`, `maxPasswordLength: 128` en `crear-auth.ts` | **Cumple** la longitud. **No** se comprueba contra listas de contraseñas filtradas |
| A3 | Código de un solo uso por correo: 6 dígitos, 5 minutos, 3 intentos, guardado con hash | `emailOTP({ storeOTP: 'hashed', … })`; `invitaciones.e2e-spec.ts` «a los 3 intentos fallidos…» | **Cumple** |
| A4 | Límite de intentos en inicio de sesión y envío de códigos, sin confiar en `x-forwarded-for` | `rateLimit.customRules` en `crear-auth.ts`; `identity.e2e-spec.ts`, `limite-otp-redis.e2e-spec.ts` | **Parcial:** el de Better Auth vive en memoria; con más de una réplica hay que llevarlo a Redis |
| A5 | La misma respuesta para un correo inexistente y una contraseña errónea | `identity.e2e-spec.ts` «no distingue un correo inexistente…» | **Cumple** |
| A6 | Sesión en cookie opaca `HttpOnly; Secure; SameSite=Lax`, token guardado con hash, **sin caché de cookie** | `cookieCache: { enabled: false }`; `identity.e2e-spec.ts` «la fila de `sesiones` guarda el hash…» | **Cumple** |
| A7 | Duración de sesión: **7 días**, renovada cada 24 h de uso | `expiresIn`, `updateAge` en `crear-auth.ts` | **Cumple.** Sin caducidad por inactividad más corta |
| A8 | Una baja, revocación o suspensión de agencia corta el acceso en la petición siguiente; el socket en ≤ 60 s | `identity.e2e-spec.ts`; `inbox-tiempo-real.e2e-spec.ts` «identity.acceso_revocado cierra los sockets…» | **Cumple** |
| A9 | Cambiar la contraseña revoca las demás sesiones | `revokeSessionsOnPasswordReset: true` | **Cumple** en la configuración. El restablecimiento por correo **no está expuesto**; lo hace la plataforma por script |
| A10 | El tenant activo es dato de la sesión y se revalida bajo RLS en cada petición; uno manipulado revoca la sesión | `identity.e2e-spec.ts` «un tenant_activo_id manipulado… da 401 y revoca la sesión» | **Cumple** |
| A11 | Toda mutación con cookie exige `Origin` de confianza | T-001 integrado (ESTADO.md §1) | **Cumple** según ESTADO.md. El modelo de amenazas (R10) está desactualizado en este punto |
| A12 | **MFA** disponible para el rol Dueño antes de la primera agencia en producción; obligatorio si una agencia lo exige | — | **No existe.** ADR-0011 lo dejó fuera de v1. Ver §5 |
| A13 | Sesiones (`ip`, `agente_usuario`) se purgan 30 días después de caducar | — | **No implementado** (consecuencia de ADR-0011, sin trabajo programado) |

## 3. Reglas: acceso a infraestructura (B)

| # | Regla | Cómo se comprueba | Hoy |
|---|---|---|---|
| B1 | **MFA obligatorio** en GitHub, Render, Neon, Meta Business, Postmark y el correo del propietario | Revisión manual trimestral, anotada en `docs/_bitacora/` | **No verificado.** Decisión del propietario |
| B2 | Ninguna persona entra a la base de producción con el rol propietario salvo para una migración de emergencia, y queda anotado | Registro en `docs/_incidentes/` o `docs/_bitacora/` | No aplica todavía: **no hay producción** |
| B3 | Ningún servicio de Render tiene el rol propietario; las migraciones las aplica GitHub Actions desde `main` en un *Environment* | ADR-0013 §4 y §6 | **Diseño.** Sin despliegue verificado |
| B4 | Las GitHub Apps no tienen permisos de administración ni de workflows; sus claves viven fuera del repo | ADR-0016 §7; panel de cada App | **Declarado en ADR-0016; no verificado** en esta revisión |
| B5 | Revisión de accesos cada 3 meses: quién tiene cuenta en cada panel, qué Apps y *tokens* existen. Lo que no se usa, se revoca | Entrada en `docs/_bitacora/` con la lista | **No se hace todavía** |
| B6 | Una persona que deja el proyecto pierde todos sus accesos el mismo día y se rotan los secretos que pudo ver | [07-gestion-de-secretos-y-claves.md §3](07-gestion-de-secretos-y-claves.md) | No aplica: hay una sola persona |

## 4. Cómo se comprueba, en conjunto

- Las reglas A se comprueban en cada PR por el job `test` (e2e de `identity`, `invitaciones`,
  `inbox-tiempo-real`). Si una prueba citada se renombra, se actualiza esta tabla.
- Las reglas B se comprueban a mano: no hay automatización posible sobre paneles de terceros sin
  dar más privilegios a una máquina.

## 5. Lo que aún no se cumple

1. **A12 — MFA para usuarios de agencia.** No existe. Propuesta: TOTP (plugin `twoFactor` de Better
   Auth) para el rol Dueño antes de la primera agencia en producción. Es un cambio de alcance: lo
   decide `dueno-de-producto`, y probablemente requiere un ADR que superseda la línea «No hay MFA
   en v1» de ADR-0011.
2. **A13 — purga de sesiones caducadas.** Sin trabajo programado.
3. **A4 — límite de intentos en memoria.** Basta con una réplica; con dos, no.
4. **B1 y B5 — MFA y revisión de accesos de infraestructura:** dependen del propietario y no hay
   evidencia escrita.
5. **[04-rbac.md](04-rbac.md)** sigue sin escribirse, aunque los roles por agencia ya existen en el
   código (ADR-0011).
