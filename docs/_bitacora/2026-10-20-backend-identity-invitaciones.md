# 2026-10-20 — Invitaciones y código por correo (ADR-0011, rebanada 4)

Agente: `backend`. Rama `feat/identity-invitaciones`, desde `origin/main` (v0.34.1).

## Qué quedó

- **Invitar** `POST /api/v1/identidad/invitaciones` `{correo, rolId}` -> 202 `{ok:true}`. Exige
  `usuarios.administrar` (decorador + comprobación en el caso de uso, con los permisos leídos bajo RLS). El
  rol se busca bajo RLS: uno de otra agencia da 404. El tenant de la invitación sale del contexto.
- **Aceptar** `POST /api/v1/auth/invitaciones/aceptar` `{token, nombre, contrasena}` -> 200 `{ok:true}`, sin
  sesión. Consume el token (un solo uso, atómico), crea la identidad si no existe (correo VERIFICADO) y la
  membresía bajo RLS en el tenant de la invitación. Una identidad existente conserva su contraseña.
- **Sin revelar nada:** invitar y aceptar responden igual exista o no el correo (prueba que compara estado,
  cuerpo y cookies). Inexistente, usado, caducado o rol borrado: un solo error `INVITACION_INVALIDA` (400).
- **Código por correo:** plugin Email OTP con `storeOTP: 'hashed'`, 6 dígitos, 5 min, 3 intentos,
  `disableSignUp`. Rutas `POST /api/v1/auth/otp/enviar` y `.../otp/iniciar-sesion`; solo esas dos del plugin
  son alcanzables. Límite por dirección (3 envíos y 5 intentos por minuto).
- **Correo por cola y puerto (R5, §10):** `PuertoColaDeCorreo` (shared) lo implementa el módulo nuevo
  `notifications`: productor BullMQ `correo-saliente` (API) y consumidor (trabajador, `WorkerModule`).
  Adaptadores del puerto de envío: Mailpit (solo `APP_ENV=local`), `CorreoEnMemoria` (doble de pruebas/CI).
  `COLA_CORREO=memoria` entrega al instante sin Redis (pruebas). **Adaptador de producción: TODO declarado**,
  `crearCorreo` se niega con cualquier otro `MAIL_PROVIDER` hasta que haya ADR.
- **Contratos** (`packages/contracts/src/identidad.ts`): `InvitarMiembro`, `AceptarInvitacion`,
  `EnviarCodigo`, `IniciarSesionConCodigo`, `RespuestaOk`; códigos `CODIGO_INVALIDO`, `INVITACION_INVALIDA`.
  El enlace es `<WEB_PUBLIC_URL>/aceptar-invitacion?token=...` (la pantalla la hace el frontend).

## Esquema: no hizo falta tabla nueva

Las invitaciones viven en `verificaciones` (global, de un solo uso, con `expira_en`, solo de
`viajapro_identidad`): `identificador = invitacion:<sha256(token)>`, `valor = {tenantId, correo, rolId,
invitadoPorUsuarioId}`. El token no está en la base; el valor lo escribe el servidor tras comprobar el
permiso y el rol bajo RLS; el rol de la API no ve la tabla. **Lo que no da:** listar o revocar invitaciones
pendientes de una agencia (pide tabla por tenant con RLS). Va a la cola.

## Hallazgos

- Better Auth, al iniciar sesión por código con una identidad **sin verificar**, le BORRA la contraseña y
  las sesiones. Toda identidad creada por script o por invitación debe nacer `correo_verificado = true`. La
  invitación lo hace; `identidad:sembrar-dev` ahora también. Un script de plataforma futuro debe hacerlo.
- Un secreto (token, código) pasa por Redis en el trabajo de correo (no hay forma de reconstruirlo desde el
  hash). Mitigación: `removeOnComplete: true`, fallidos 1 h, nada en el registro, el error del consumidor no
  lleva mensaje. Riesgo residual: lo lee quien lea Redis mientras el trabajo esté pendiente.

## Dependencia nueva

`nodemailer` y `@types/nodemailer` (apps/api): cliente SMTP para el adaptador de Mailpit (desarrollo). No se
escribe SMTP a mano. No es un proveedor real de correo.

## Variables nuevas (sin valores)

`COLA_CORREO`, `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`; `MAIL_PROVIDER` cambia de valores (`mailpit` | `memoria`).
Las pruebas fijan `COLA_CORREO=memoria` y `MAIL_PROVIDER=memoria` en `vitest.config.ts`.

## Cola (no bloquea)

| Pendiente | Dueño |
|---|---|
| Adaptador de correo de producción + ADR (proveedor, dominio, SPF/DKIM) | `arquitecto`, `devops` |
| Listar y revocar invitaciones pendientes (tabla por tenant con RLS) | `datos`, `backend` |
| Límite de envíos de código por correo (hoy solo por dirección) | `backend` |
| Outbox para el correo: hoy se encola tras guardar; si Redis cae justo en medio, la invitación existe sin correo y el dueño reinvita | `backend` |
| Purga de filas caducadas de `verificaciones` | `datos` |
| Eventos de auditoría de invitar/aceptar | `backend` |
