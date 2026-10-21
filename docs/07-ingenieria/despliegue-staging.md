# Despliegue de staging en Render — pasos del propietario

Implementa el ADR-0013 solo para **staging**. Todo se hace en los paneles; ningún secreto pasa por
el chat ni entra al repositorio (R6). Cada paso termina con una comprobación.

Archivos que lo sostienen: `render.yaml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`,
`.github/workflows/deploy-staging.yml`.

## 1. Dominio

Comprar el dominio técnico neutro (ADR-0012). Staging usa `staging.<dominio>` (web) y
`api.staging.<dominio>` (API). Nunca los `*.onrender.com`: la cookie de sesión no llegaría en Safari.

*Comprobación:* el dominio resuelve en el panel de su registrador.

## 2. Neon: rama de staging solo con el esquema

1. En el proyecto de Neon, **Branches > Create branch**, nombre `staging`.
2. Elegir **Schema-only** (sin datos del padre). Staging nunca es copia de producción.
3. Copiar la cadena **directa** (sin `-pooler`) del rol propietario de esa rama. `rol:crear` se
   niega a correr contra el pooler.

*Comprobación:* en la consola SQL de la rama, `select count(*) from tenants;` devuelve 0 o
`relation does not exist` (aún sin migraciones). Nunca debe devolver agencias reales.

## 3. Migrar, crear los roles y sembrar (una vez, desde su máquina)

Con la cadena directa de la rama `staging` en la variable de entorno **de esa terminal**
(`DATABASE_URL` y `DIRECT_URL`, la misma; no la guarde en `.env`):

```bash
pnpm install
pnpm db:migrate:deploy                       # esquema, políticas RLS, roles sin contraseña
pnpm --filter @viajapro/domain build
pnpm db:seed                                 # agencia demo (datos sintéticos)
pnpm --filter @viajapro/database run rol:crear
```

`rol:crear` imprime **una sola vez** las contraseñas de `viajapro_app`, `viajapro_altas`,
`viajapro_identidad` y `viajapro_webhook`. Cópielas directo a un gestor de contraseñas.

*Comprobación:* `rol:crear` termina diciendo que ningún rol puede saltarse RLS.

A partir de aquí las migraciones las aplica GitHub Actions, no usted.

## 4. Render: crear el Blueprint

1. Crear la cuenta y el espacio **Pro**; registrar la tarjeta.
2. **New > Blueprint**, conectar el repositorio, rama `main`, archivo `render.yaml`.
3. Render pedirá los valores de las variables `sync: false`. **Cada servicio solo recibe las suyas**
   (matriz del ADR-0013 §4). Pegar cada cadena de rol solo donde se usa:

| Servicio | Variables a pegar |
|---|---|
| `viajapro-web-staging` | `NEXT_PUBLIC_API_URL` (`https://api.staging.<dominio>`) |
| `viajapro-api-staging` | `API_PUBLIC_URL`, `WEB_PUBLIC_URL` (`https://staging.<dominio>`), `API_TRUST_PROXY`, `MAIL_FROM`, `POSTMARK_MESSAGE_STREAM`, `DATABASE_APP_URL`, `DATABASE_ALTAS_URL`, `DATABASE_IDENTIDAD_URL`, `BETTER_AUTH_SECRET`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WEBHOOK_PAYLOAD_KEY`, `WEBHOOK_PAYLOAD_KEY_VERSION`, `CORREO_PAYLOAD_KEY`, `POSTMARK_SERVER_TOKEN` |
| `viajapro-worker-staging` | `MAIL_FROM`, `POSTMARK_MESSAGE_STREAM`, `DATABASE_WEBHOOK_URL`, `WEBHOOK_PAYLOAD_KEY`, `WEBHOOK_PAYLOAD_KEY_VERSION`, `CORREO_PAYLOAD_KEY`, `WHATSAPP_DIRECTORY_PEPPER`, `WHATSAPP_DIRECTORY_PEPPER_VERSION`, `POSTMARK_SERVER_TOKEN` |

`REDIS_URL` se enlaza sola desde el Key Value por la red privada. Generar los secretos propios con
`openssl rand -base64 32` (claves) y `openssl rand -hex 32` (pimienta), **distintos de producción**.
Las `*_VERSION` valen `1`. `API_TRUST_PROXY`: empezar en `1` y comprobar en el paso 7.

*Comprobación:* en cada servicio, **Settings** muestra región **Ohio** y **Auto-Deploy: Off**; en el
Key Value, **Maxmemory policy: noeviction** y la lista de IP externas vacía.

## 5. GitHub: Environment y secretos

1. **Settings > Environments > New environment**: `staging`.
2. **Deployment branches and tags > Selected branches**: solo `main`.
3. Secretos del Environment `staging`:

| Secreto | Qué es |
|---|---|
| `DIRECT_URL` | cadena directa del rol propietario de la rama `staging` |
| `RENDER_DEPLOY_HOOK_API` | deploy hook del servicio API (Settings > Deploy Hook) |
| `RENDER_DEPLOY_HOOK_WORKER` | deploy hook del trabajador |
| `RENDER_DEPLOY_HOOK_WEB` | deploy hook de la web |

4. Opcional, **variable** (no secreto) del repositorio: `STAGING_API_URL` = `https://api.staging.<dominio>`,
   para la sonda final. **No se guarda la clave de API de Render.**

*Comprobación:* tras el siguiente push a `main` con CI verde, el workflow **Deploy staging** aparece en
verde, con las migraciones aplicadas y tres despliegues solicitados. Sin secretos termina en verde con
un aviso `Faltan los secretos...`.

## 6. DNS

Crear los CNAME `staging` y `api.staging` hacia lo que indique Render en **Settings > Custom Domains**
de la web y de la API. Esperar a que emita los certificados.

*Comprobación:* `curl -fsS https://api.staging.<dominio>/salud/listo` devuelve `"estado":"ok"` y
`"aislamiento":"forzado"`; `curl -fsS https://staging.<dominio>/salud` devuelve `{"estado":"ok"}`.

## 7. Comprobaciones finales

- `/salud/listo` con `rol` distinto de `postgres` y del propietario.
- El trabajador arrancó: en sus logs, `Trabajador del inbox en marcha.`
- `API_TRUST_PROXY`: dos intentos de código fallidos desde dos redes distintas no se limitan entre sí.
- Staging **no** se suscribe al número real de WhatsApp. El Paso 2 de Meta (modo desarrollo) usa
  `https://api.staging.<dominio>/webhooks/whatsapp`.

## Cómo se ve un despliegue normal

`merge en main` -> CI verde -> `Deploy staging`: comprueba que el SHA es ancestro de `main`, corre
`prisma migrate deploy` -> llama los tres deploy hooks -> sondea `/salud/listo`. Las migraciones
corren **antes** y deben ser compatibles con el código anterior (expandir y después contraer).
Cada despliegue de la API corta los sockets de la bandeja; el cliente reconecta.

## Verificar al sincronizar (no confirmado en la documentación)

Verificado contra la documentación oficial el 2026-10-20: `autoDeployTrigger`, `keyvalue`,
`maxmemoryPolicy`, `fromService`/`connectionString`, `maxShutdownDelaySeconds`, región, plan y
build-args. Quedan dos que Render confirmará al crear el Blueprint:

- `dockerCommand` en un `worker` (inferido como admitido).
- `ipAllowList: []` en el Key Value.

**Comprobación tras el primer sync:** el Key Value no muestra URL externa (solo la interna), y los
logs del trabajador muestran `Trabajador del inbox en marcha.`, es decir, arrancó con
`node dist/worker.js`. Si Render rechaza alguno de los dos campos, ajustar el Blueprint antes de seguir.

Nota: la web aún no llama a la API de servidor a servidor, por eso el blueprint no define una URL
interna de la API; se añade con la reescritura del ADR-0011 §2.
