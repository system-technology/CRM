# Despliegue de staging: Neon + web en Vercel + API en un solo proceso en Render

Implementa la decisión del propietario del 2026-11-17 (ADR-0028) solo para **staging**. Sustituye a
[despliegue-staging.md](despliegue-staging.md) (cuatro piezas en Render). Todo se hace en los paneles;
ningún secreto pasa por el chat ni entra al repositorio (R6). Cada paso termina con una comprobación.

```
navegador ── https://staging.<dominio> ──▶ Vercel (Next.js)
    │
    └──────── https://api.staging.<dominio> ──▶ Render: UN servicio, `node dist/main-unico.js`
                                                (HTTP + Socket.IO + webhook + trabajo en proceso, sin Redis)
                                                      │ cadena directa, cuatro roles de aplicación
                                                      ▼
                                                Neon, rama `staging` (us-east-2, Ohio)
```

Archivos que lo sostienen: `render.yaml`, `apps/api/Dockerfile`, `apps/web/vercel.json`,
`.github/workflows/deploy-staging.yml`. Qué es el modo único y cómo se opera:
[runbook-modo-unico.md](runbook-modo-unico.md) y ADR-0019.

## 1. Dominio

Comprar el dominio técnico neutro (ADR-0012). Staging usa `staging.<dominio>` (web) y
`api.staging.<dominio>` (API). Nunca los `*.onrender.com` ni `*.vercel.app`: las dos mitades deben
compartir dominio registrable para que la cookie de sesión (`SameSite=Lax`) viaje entre ellas.

_Comprobación:_ el dominio resuelve en el panel de su registrador.

## 2. Neon: un proyecto nuevo, vacío, solo para staging

Una rama _schema-only_ del proyecto existente **no sirve**: Neon la rechaza («project with a legacy
web access role do not support schema-only branches»), porque nuestras migraciones crean roles por
SQL (`viajapro_enrutador` y los demás). Copiar datos de otro proyecto o rama está prohibido.

1. **New Project**: nombre `viajapro-staging`, Postgres **16**, región **AWS US East 2 (Ohio)**,
   plan **Free** (basta para la demo).
2. **Connect**: con _Connection pooling_ desactivado, copiar la cadena **directa** (sin `-pooler`)
   del rol propietario que crea Neon (`neondb_owner`). `rol:crear` se niega a correr contra el pooler.

_Comprobación:_ en la consola SQL del proyecto, `select count(*) from tenants;` devuelve
`relation does not exist` (aún sin migraciones). Nunca debe devolver agencias reales.

## 3. Migrar, crear los roles y sembrar (una vez, desde su máquina)

Con la cadena directa de la rama `staging` en las variables **de esa terminal** (`DATABASE_URL` y
`DIRECT_URL`, la misma; no la guarde en `.env`):

```bash
pnpm install
pnpm db:migrate:deploy                       # esquema, políticas RLS, roles sin contraseña
pnpm --filter @viajapro/domain build
pnpm db:seed                                 # agencia demo (datos sintéticos)
pnpm --filter @viajapro/database run rol:crear
```

`rol:crear` imprime **una sola vez** las contraseñas de `viajapro_app`, `viajapro_altas`,
`viajapro_identidad` y `viajapro_webhook`. Cópielas directo a un gestor de contraseñas y arme con
ellas **cuatro cadenas** (host directo de Neon, base y `sslmode=require` iguales a la del propietario;
solo cambian usuario y contraseña). A la del `viajapro_webhook` agréguele **`&connection_limit=3`**
(con 1 el barrido de 30 s falla siempre; runbook-modo-unico §3).

_Comprobación:_ `rol:crear` termina diciendo que ningún rol puede saltarse RLS.

A partir de aquí las migraciones las aplica GitHub Actions, no usted.

## 4. Render: una sola pieza

1. Crear la cuenta. Para la demo basta el espacio **Hobby** (gratis): `render.yaml` pide la
   instancia **Free**. Se duerme tras 15 min sin tráfico y tarda ~1 min en despertar: antes de una
   demo, abra `https://api.staging.<dominio>/salud` uno o dos minutos antes.
2. **New > Blueprint**, conectar el repositorio, rama `main`, archivo `render.yaml`. Debe proponer
   **un solo servicio**, `viajapro-api-staging` (sin web, sin worker, sin Key Value).
3. Pegar los valores de las variables `sync: false`:

| Variable                            | Valor / cómo generarlo                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `API_PUBLIC_URL`                    | `https://api.staging.<dominio>`                                                                                            |
| `WEB_PUBLIC_URL`                    | `https://staging.<dominio>` (exacto, sin barra final: es el origen de CORS, de Socket.IO y de la comprobación de `Origin`) |
| `API_TRUST_PROXY`                   | `1` para empezar; se mide en el paso 8                                                                                     |
| `MAIL_FROM`                         | remitente verificado en Postmark, p. ej. `ViajaPro <no-reply@<dominio>>`                                                   |
| `POSTMARK_MESSAGE_STREAM`           | `outbound` (o el flujo que haya creado)                                                                                    |
| `POSTMARK_SERVER_TOKEN`             | token del servidor de Postmark                                                                                             |
| `DATABASE_APP_URL`                  | cadena de `viajapro_app` (paso 3)                                                                                          |
| `DATABASE_ALTAS_URL`                | cadena de `viajapro_altas`                                                                                                 |
| `DATABASE_IDENTIDAD_URL`            | cadena de `viajapro_identidad`                                                                                             |
| `DATABASE_WEBHOOK_URL`              | cadena de `viajapro_webhook` **con `&connection_limit=3`**                                                                 |
| `BETTER_AUTH_SECRET`                | `openssl rand -base64 32`                                                                                                  |
| `CAMPOS_SENSIBLES_KEY`              | `openssl rand -base64 32`                                                                                                  |
| `CAMPOS_SENSIBLES_KEY_VERSION`      | `1`                                                                                                                        |
| `CAMPOS_SENSIBLES_KEY_PREVIOUS`     | **vacía** (solo se rellena en una rotación; [runbook](../06-operacion/rotacion-de-claves.md))                              |
| `WEBHOOK_PAYLOAD_KEY`               | `openssl rand -base64 32`                                                                                                  |
| `WEBHOOK_PAYLOAD_KEY_VERSION`       | `1`                                                                                                                        |
| `CORREO_PAYLOAD_KEY`                | `openssl rand -base64 32`                                                                                                  |
| `WHATSAPP_DIRECTORY_PEPPER`         | `openssl rand -hex 32`                                                                                                     |
| `WHATSAPP_DIRECTORY_PEPPER_VERSION` | `1`                                                                                                                        |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`     | `openssl rand -hex 32` (el mismo que pondrá en Meta)                                                                       |
| `META_APP_SECRET`                   | el de la app de Meta de **desarrollo** (nunca el de producción)                                                            |

Ya vienen fijas en el Blueprint, no se pegan: `NODE_ENV=production`, `APP_ENV=staging`,
`MODO_DESPLIEGUE=unico`, `API_PORT=10000`, `MAIL_PROVIDER=postmark`. **No defina `REDIS_URL`**: en
modo único, si algo la pide es un defecto. Todos los secretos, **distintos de producción**.

Guarde **`CAMPOS_SENSIBLES_KEY` en un gestor de contraseñas, fuera de Render**: sin ella lo cifrado
no se recupera (ADR-0015).

4. Esperar el primer despliegue. Después, **Settings > Deploy Hook**: copiar la URL (va al paso 6).

_Comprobación:_ **Settings** muestra región **Ohio**, instancia Free, **Auto-Deploy: Off**. En los
logs del primer arranque aparece `API y trabajador en un solo proceso (modo unico)`. Si el log
muestra `Nest application successfully started` sin esa frase, Render ignoró `dockerCommand`: el
servicio arrancó `main.js` y falló por falta de `REDIS_URL`; fije el **Docker Command** a mano en
**Settings** como `node dist/main-unico.js` y reinicie.

## 5. Vercel: la web

1. Plan **Hobby** (gratis) para la demo. Sus condiciones lo limitan a uso personal y no comercial:
   cuando una agencia pague, se pasa a **Pro** (decisión del propietario, 2026-11-18; T-239).
2. **Add New > Project**, importar el repositorio. **Root Directory: `apps/web`** y dejar activada
   _Include source files outside of the Root Directory_ (la opción por omisión; la necesitan los
   paquetes del workspace). Framework: Next.js (lo fija `apps/web/vercel.json`, que también define
   install y build desde la raíz del monorepo y compila antes `@viajapro/contracts` y `@viajapro/domain`).
3. **Environment Variables** (entorno _Production_; el proyecto solo se usa para staging):

| Variable                    | Valor                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`       | `https://api.staging.<dominio>` (se incrusta al construir: cambiarla exige redesplegar)   |
| `API_INTERNAL_URL`          | `https://api.staging.<dominio>` (destino del rewrite y de las llamadas desde el servidor) |
| `NEXT_PUBLIC_USE_REAL_AUTH` | `true`                                                                                    |

No defina `NEXT_PUBLIC_DEV_TENANT_ID`, `NEXT_PUBLIC_AUTH_MAQUETA` ni `IDENTIDAD_DEV_PASSWORD`. 4. **Deploy** una vez. Luego **Settings > Git**: confirmar que el despliegue por git está
desactivado (`apps/web/vercel.json` ya trae `git.deploymentEnabled: false`; si el panel lo muestra
activo, apáguelo). Despliega el workflow, no cada push. 5. **Settings > Git > Deploy Hooks**: crear uno (nombre `staging`, rama `main`) y copiar la URL
(paso 6). 6. **Settings > Domains**: agregar `staging.<dominio>` y anotar el registro que pide (paso 7).

_Comprobación:_ el primer despliegue termina en verde; `https://<proyecto>.vercel.app/salud` devuelve
`{"estado":"ok"}`. Un push a una rama **no** crea despliegues nuevos.

## 6. GitHub: Environment, secretos y variable

1. **Settings > Environments > New environment**: `staging`.
2. **Deployment branches and tags > Selected branches**: solo `main`.
3. Secretos del Environment `staging`:

| Secreto                  | Qué es                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `DIRECT_URL`             | cadena directa del rol **propietario** de la rama `staging` |
| `RENDER_DEPLOY_HOOK_API` | deploy hook del servicio `viajapro-api-staging` (paso 4)    |
| `VERCEL_DEPLOY_HOOK_WEB` | deploy hook de Vercel (paso 5)                              |

4. **Variable** (no secreto) del repositorio: `STAGING_API_URL` = `https://api.staging.<dominio>`.
   Es obligatoria: el workflow espera esa sonda entre la API y la web. **No se guarda la clave de API
   de Render ni el token de Vercel.**
5. Borrar, si existen, `RENDER_DEPLOY_HOOK_WORKER` y `RENDER_DEPLOY_HOOK_WEB`.

_Comprobación:_ tras el siguiente push a `main` con CI verde, **Deploy staging** aparece en verde con
las migraciones aplicadas y, en este orden: despliegue de la API, sonda, despliegue de la web. Sin
secretos termina en rojo (o en verde con «OMITIDO» si `STAGING_DESPLIEGUE=desactivado`).

## 7. DNS

En el registrador:

| Registro | Nombre        | Destino                                                                                                     |
| -------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| CNAME    | `staging`     | el que muestre Vercel en **Settings > Domains** (suele ser `cname.vercel-dns.com`)                          |
| CNAME    | `api.staging` | el `*.onrender.com` del servicio (Render > **Settings > Custom Domains** > agregar `api.staging.<dominio>`) |

Esperar a que Vercel y Render emitan los certificados.

_Comprobación:_ `curl -fsS https://api.staging.<dominio>/salud/listo` devuelve `"estado":"ok"` y
`"aislamiento":"forzado"`; `curl -fsS https://staging.<dominio>/salud` devuelve `{"estado":"ok"}`.

## 8. Comprobaciones finales

- `/salud/listo` con `rol` distinto de `postgres` y del propietario.
- **Login real** en `https://staging.<dominio>` con la agencia demo (el usuario se crea con el script
  de identidad de la guía de siembra o por invitación): la sesión persiste al recargar. En las
  herramientas del navegador, la cookie `viajapro…session_token` aparece en el host
  `api.staging.<dominio>` con `Secure`, `HttpOnly` y `SameSite=Lax`.
- **Socket conectado:** abrir la bandeja; la barra de módulos muestra «conectado» y en la pestaña
  Network hay una conexión `wss://api.staging.<dominio>/...` con estado 101. Si queda en
  «reconectando», revisar `WEB_PUBLIC_URL` (debe ser exacto) y `NEXT_PUBLIC_API_URL` en Vercel
  (CSP `connect-src` y destino del socket salen de ahí).
- **`API_TRUST_PROXY`** (T-088). El navegador llama a la API **directo** (`NEXT_PUBLIC_API_URL` no
  vacío), así que el único salto propio entre cliente y API es el balanceador de Render: el valor
  esperado es `1`. Medirlo: (1) desde la red A y desde la red B (wifi y datos móviles) haga seis
  `POST https://api.staging.<dominio>/api/v1/auth/sign-in/email` fallidos con el mismo correo
  inexistente. (2) Si B recibe 429 por los intentos de A, el valor está de menos. (3) Si una
  cabecera `x-forwarded-for: 1.2.3.4` escrita a mano cambia la cuota, está de más. (4) Repetir una
  vez por la ruta `https://staging.<dominio>/api/v1/...` (rewrite de Vercel): si el rewrite llega a
  usarse en algún flujo de servidor, cuenta un salto más. Anotar aquí el valor medido y la fecha.
  **Valor medido: pendiente de la primera ejecución en staging.**
- Staging **no** se suscribe al número real de WhatsApp. El Paso 2 de Meta (modo desarrollo) usa
  `https://api.staging.<dominio>/webhooks/whatsapp`.

## Cookie de sesión y socket entre `staging.<dominio>` y `api.staging.<dominio>`

Lo que dice el código hoy (revisado, sin cambios necesarios):

- La cookie la fija Better Auth en la API: `cookiePrefix: viajapro`, `Secure`, `HttpOnly`,
  `SameSite=Lax`, **sin atributo `Domain`** (cookie de host: solo `api.staging.<dominio>`). Web y API
  son _same-site_ (mismo dominio registrable), así que el navegador la envía en las peticiones con
  `credentials: 'include'` (que la web ya usa) y en el handshake del socket (`withCredentials: true`).
  Safari incluido: no es un tercero.
- CORS de la API y de Socket.IO, la comprobación de `Origin` y `trustedOrigins` de Better Auth salen
  todos de **`WEB_PUBLIC_URL`**; `baseURL` de Better Auth sale de **`API_PUBLIC_URL`**. Deben ser
  exactos y con `https`.
- El socket **no puede** pasar por el rewrite de Vercel (no proxea WebSocket): conecta directo a
  `NEXT_PUBLIC_API_URL`. El CSP de la web (`connect-src`) toma de la misma variable el origen HTTP y
  su equivalente `wss://`.
- Consecuencia: con `NEXT_PUBLIC_API_URL` puesta, el navegador no usa el rewrite de
  `next.config.mjs` (que solo actúa con la variable vacía o en el servidor). Hoy conviene así.

Riesgo y qué haría falta si falla (no escrito): si en la práctica algún navegador bloquea la cookie
de host de la API, la salida sin código es servir la API bajo el mismo origen; la otra es fijar
`advanced.crossSubDomainCookies` en `crear-auth.ts` (`domain: '.staging.<dominio>'`), un cambio en
código de identidad que pasaría por `auditor-seguridad`. No hace falta para empezar.

## Modo demo sin dominio (opción C)

Decisión del propietario (2026-11-18): para la demo no se compra dominio. El navegador habla **solo**
con `https://<proyecto>.vercel.app`; Vercel reenvía (`rewrite` de `next.config.mjs`) `/api/v1/*`,
incluido el socket, a `https://viajapro-api-staging.onrender.com`. La cookie de sesión queda de
**primera parte** en el host de Vercel (host-only, `Secure`, `HttpOnly`, `SameSite=Lax`). No cambia
ningún código de identidad. **No es la configuración de producción** (producción: opción A, secciones
1 a 8).

```
navegador ── https://<proyecto>.vercel.app/api/v1/* ──▶ Vercel (rewrite) ──▶ https://viajapro-api-staging.onrender.com
```

Variables (lo que cambia frente a la opción A está en negrita):

| Dónde             | Variable                    | Opción A                        | **Opción C (demo)**                                                                               |
| ----------------- | --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Vercel            | `NEXT_PUBLIC_API_URL`       | `https://api.staging.<dominio>` | **No definirla** (borrarla; Vercel no admite valor vacío y la web trata «sin definir» como vacía) |
| Vercel            | `API_INTERNAL_URL`          | `https://api.staging.<dominio>` | **`https://viajapro-api-staging.onrender.com`**                                                   |
| Vercel            | `NEXT_PUBLIC_USE_REAL_AUTH` | `true`                          | `true`                                                                                            |
| Render            | `WEB_PUBLIC_URL`            | `https://staging.<dominio>`     | **`https://<proyecto>.vercel.app`** (exacto, sin barra final)                                     |
| Render            | `API_PUBLIC_URL`            | `https://api.staging.<dominio>` | **`https://viajapro-api-staging.onrender.com`**                                                   |
| Render            | `API_TRUST_PROXY`           | `1`                             | **`2` (a medir, ver abajo; si el límite queda compartido, `1`)**                                  |
| GitHub (variable) | `STAGING_API_URL`           | `https://api.staging.<dominio>` | **`https://viajapro-api-staging.onrender.com`** (la sonda va directa a Render)                    |

Por qué esos valores (leído en el código):

- `WEB_PUBLIC_URL` alimenta `trustedOrigins` de Better Auth, el CORS y la comprobación de `Origin`
  (`origen.ts`, `configurar-api.ts`). Con el rewrite el `Origin` que llega es el de vercel.app, no el
  de Render. Un valor distinto da `ORIGEN_NO_CONFIABLE` al iniciar sesión.
- `API_PUBLIC_URL` es el `baseURL` de Better Auth. La cookie no lleva `Domain`, así que el navegador
  la guarda en el host que le respondió (vercel.app); el valor solo debe ser `https` y real.
- Los fetch del navegador usan `obtenerBaseApi()` (`''` con la variable sin definir): todos relativos.
- CSP (`csp.ts`): con la variable sin definir, `connect-src` queda `'self'` más
  `http://localhost:3333` y `ws://localhost:3333` (inocuos en el navegador de la demo); `'self'` cubre
  el polling.

**Tiempo real.** Vercel no reenvía WebSocket en un rewrite externo. Con la variable sin definir el
cliente (`inbox-socket.ts`) usa solo long-polling por el mismo origen y sin barra final
(`addTrailingSlash: false`); `next.config.mjs` repone la barra en el destino porque engine.io solo
atiende `/api/v1/tiempo-real/`. Funciona como «tiempo real con latencia de polling». Si el socket
no conecta, la bandeja sigue siendo usable pero **no se refresca sola** (solo recarga manual y al
reconectar): el indicador muestra «reconectando». Límite de tiempo de una petición proxeada por
Vercel: **sin verificar** (el polling de Socket.IO mantiene cada petición abierta hasta ~25 s).

**`API_TRUST_PROXY`.** Cadena: cliente -> Vercel -> balanceador de Render -> API. Vercel fija
`x-forwarded-for` con la IP real del cliente; el balanceador de Render añade al final la IP que le
conecta (Vercel). Con `1`, `req.ip` es la de Vercel: todos los usuarios comparten el límite de
intentos (no es esquivable, pero un usuario puede bloquear a los demás). Con `2`, `req.ip` es la del
cliente, y no es falsificable mientras Vercel sobrescriba la cabecera. **Sin verificar**: si en
realidad hay un salto más o menos, `2` sería incorrecto. Medir con la receta de la sección 8
(seis `POST /api/v1/auth/sign-in/email` fallidos desde dos redes, ahora contra
`https://<proyecto>.vercel.app`); anotar el valor. Para una demo se acepta con esta nota; producción
va por la opción A.

Pasos:

1. Vercel: borrar `NEXT_PUBLIC_API_URL`, poner `API_INTERNAL_URL` y redesplegar (se incrusta al
   construir).
2. Render: cambiar `WEB_PUBLIC_URL`, `API_PUBLIC_URL` y `API_TRUST_PROXY`; reiniciar.
3. GitHub: `STAGING_API_URL` = URL directa de Render.

Comprobaciones:

- `curl -fsS https://<proyecto>.vercel.app/api/v1/auth/session` responde desde la API (401 o JSON de
  sesión vacía, no un 404 de Next).
- Login (OTP o correo y contraseña) en `https://<proyecto>.vercel.app`; recargar mantiene la sesión.
  En las herramientas del navegador, `viajapro…session_token` aparece en el host
  `<proyecto>.vercel.app` con `Secure`, `HttpOnly`, `SameSite=Lax`. Si aparece en `onrender.com`, el
  navegador está llamando directo: `NEXT_PUBLIC_API_URL` sigue definida.
- Bandeja: en Network, peticiones `/api/v1/tiempo-real?EIO=4&transport=polling` con 200 al mismo
  origen y la barra de módulos en «conectado». Enviar un mensaje de prueba y ver que aparece sin
  recargar. Si no, anotar el estado y seguir con recarga manual.
- El primer acceso tras inactividad tarda (Render Free duerme): es normal.

Paso a la opción A: seguir las secciones 1 y 7 (dominio y DNS), y volver a la tabla de la sección 5
y 6: `NEXT_PUBLIC_API_URL` y `API_INTERNAL_URL` = `https://api.staging.<dominio>`, `WEB_PUBLIC_URL` y
`API_PUBLIC_URL` a las URL del dominio, `API_TRUST_PROXY=1`, `STAGING_API_URL` a la URL con dominio.
Redesplegar la web. Cierra el uso de cookies de primera parte vía rewrite.

## Cómo se ve un despliegue normal

`merge en main` -> CI verde -> `Deploy staging`: comprueba que el SHA es ancestro de `main`, corre
`prisma migrate deploy` -> deploy hook de la API (Render) -> espera `/salud/listo` -> deploy hook de
la web (Vercel) -> sonda final. Las migraciones corren **antes** y deben ser compatibles con el código
anterior (expandir y después contraer). Cada despliegue de la API corta los sockets de la bandeja y
el cliente reconecta.

## No verificado (comprobar al sincronizar)

- Que Render aplique `dockerCommand` a un web service Docker (paso 4 lo comprueba en los logs).
- Que Vercel construya el monorepo con `installCommand`/`buildCommand` de `apps/web/vercel.json`
  (ejecutan `cd ../..`) y que el rewrite y el middleware con CSP funcionen en su runtime.
- Que el deploy hook de Vercel despliegue con `git.deploymentEnabled: false`; si lo rechazara,
  desactivar el despliegue automático desde **Settings > Git** y dejar solo el hook.
- Igual que antes: un deploy hook despliega la cabeza de la rama, no el SHA migrado (cola, dueño
  `devops`; mitigado por la concurrencia del workflow y las migraciones compatibles hacia atrás).
- Nada de esto se ha ejecutado: la máquina de redacción no tiene acceso a Render, Vercel ni Neon.
