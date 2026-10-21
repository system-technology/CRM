# ADR-0013 — Despliegue de staging y producción: todo en Render (Ohio), junto a Neon

- **Estado:** Aceptado (2026-10-20) por el propietario, **empezando solo por staging**. Producción se
  monta cuando la piloto vaya a usarlo. `auditor-seguridad` lo aceptó con cambios, ya incorporados.
- **Fecha:** 2026-10-20
- **Decide:** el propietario
- **Consultados:** `arquitecto`, `devops`, `auditor-seguridad`

---

## Contexto

Hasta hoy nada corre fuera de un portátil. La agencia piloto y el Paso 2 de Meta (registrar la URL
del webhook) exigen una URL pública estable. Hay que desplegar cinco cosas, y no son iguales:

| Pieza | Naturaleza | Exigencia |
|---|---|---|
| Web (`apps/web`, Next.js 15) | HTTP con SSR | Reescribe `/api/v1/*` hacia la API (ADR-0011 §2) |
| API (`apps/api`, `main.ts`) | HTTP **y** Socket.IO | Conexiones largas de la bandeja en vivo; webhook de Meta; cookie de Better Auth |
| Trabajador (`apps/api`, `worker.ts`) | **Proceso continuo** sin HTTP | BullMQ, relay del outbox, barrido cada 30 s (ADR-0010) |
| Redis | Estado | BullMQ exige comandos bloqueantes y `maxmemory-policy noeviction` |
| PostgreSQL | Neon, ya en uso (ADR-0007), región AWS us-east-2 (Ohio) | Una rama para staging y otra para producción |

**La fuerza real es la latencia entre la API y la base, no la distancia al usuario.** Un caso de uso
hace varias consultas en serie bajo RLS (`SET LOCAL` + consultas + `COMMIT`); cada ida y vuelta
entre regiones suma 10–30 ms y se multiplica. La distancia Colombia–Ohio (unos 80–100 ms) se paga
una vez por petición. Por eso el cómputo va donde está Neon.

El propietario descartó Vercel el 2026-10-20. Queda abajo como opción descartada, con lo que se
comprobó, para que nadie lo reabra sin datos nuevos.

## Opciones consideradas

Fuentes consultadas el **2026-10-20**: render.com/pricing, render.com/docs/{websocket,key-value,
regions}; docs.fly.io/about/pricing y /reference/regions; docs.railway.com/reference/pricing/plans
y /deployment-regions; docs.bullmq.io/guide/going-to-production; vercel.com/docs/functions/
{websockets,limitations} y /limits/fair-use-guidelines; neon.com/pricing.

| | **A — Render** | **B — Fly.io** | **C — Railway** | **D — Vercel (descartada)** |
|---|---|---|---|---|
| Región junto a Neon us-east-2 | **Ohio**, exacta | No hay Ohio; `iad`/`ord`. **No hay Bogotá** en la lista de regiones | No hay Ohio; US East es Virginia | `iad1` por omisión |
| WebSockets largos | Sí, «no enforce a maximum duration»; se cierran al redesplegar (SIGTERM, 30 s, ampliable a 300 s) | Sí | Sí | Beta pública; se cortan a la duración máxima de la función: 300 s en Hobby, 800 s en Pro, 1800 s en beta |
| Proceso continuo sin HTTP | Sí: *background worker* | Sí: *process group* | Sí | **No**: las imágenes de contenedor «must open an HTTP server» y escalan a cero |
| Redis apto para BullMQ | **Key Value gestionado** (Valkey 8), `noeviction` seleccionable, persistencia en disco en planes pagos | No hay Redis propio: Upstash, que cobra por comando, o un Redis que operamos nosotros en una máquina con volumen | Plantilla de contenedor que operamos nosotros | Redis del Marketplace (Upstash) |
| Precio de cómputo | 512 MB: USD 7; 2 GB: USD 25; espacio Pro: USD 25 al mes | 512 MB: USD 3,69; 1 GB: USD 6,70; sin cuota de plataforma | USD 20/vCPU-mes + USD 10/GB-mes; Pro: USD 20 | Pro: USD 20 por asiento |
| Operación que exige | Baja: panel, `render.yaml`, grupos de entorno | Media: `fly.toml`, máquinas, certificados y Redis a cargo nuestro | Baja, pero el Redis es nuestro | — |

- **A — Render.** Gana: los cuatro procesos en un proveedor, en la misma región que la base, con red
  privada entre ellos y un Redis gestionado que cumple lo que BullMQ exige. Cuesta: más caro por
  megabyte que Fly, y el plan de 512 MB se queda corto para el SSR y la API en producción. Cierra:
  la región. En Render no se puede cambiar la región de un servicio existente.
- **B — Fly.io.** Gana: el cómputo más barato. Cuesta: no tiene región en Ohio ni en Bogotá, y el
  Redis queda a nuestro cargo: es justo la pieza cuya pérdida silenciosa (desalojo de claves) rompe
  las colas. Cierra: nada, pero suma un sistema más que operar sin nadie de guardia.
- **C — Railway.** Gana: cobro por consumo. Cuesta: no tiene Ohio, y el Redis también queda a
  nuestro cargo. Cierra: nada relevante.
- **D — Vercel para todo.** Exigiría rehacer dos piezas: Socket.IO por un servicio gestionado (Ably
  o Pusher, con autorización de canales por tenant reescrita, más o menos una semana) y el
  trabajador por colas *serverless* y cron (el outbox y el barrido de 30 s rediseñados, una o dos
  semanas). Además, el plan Hobby «restricted to non-commercial personal use only». **Descartada por
  el propietario.** La web sola en Vercel tampoco compensa: añade un proveedor y otro dominio sin
  resolver la pieza difícil.

## Decisión

**Opción A: todo en Render, región Ohio, espacio de trabajo Pro.** Cada entorno tiene cuatro servicios:
web (*web service*), API (*web service*), trabajador (*background worker*) y Key Value. Las piezas
quedan junto a la base y en un solo proveedor. Es el único candidato que cumple los requisitos de
BullMQ sin que operemos un Redis.

### Decisiones subordinadas

1. **Dominio y cookie.** Se usa el **dominio técnico neutro del ADR-0012**, anidado por entorno:

   | Entorno | Web | API (Socket.IO y webhook) |
   |---|---|---|
   | Producción | `app.<dominio>` | `api.app.<dominio>` |
   | Staging | `staging.<dominio>` | `api.staging.<dominio>` |

   El HTTP sigue entrando por la reescritura de Next (ADR-0011 §2). **Socket.IO no sigue ese
   camino**: que Next reenvíe el *upgrade* de WebSocket no está documentado como garantía, y
   añadiría un salto a cada mensaje y a cada conexión abierta. Se conecta directo a
   `api.app.<dominio>`. Para que la cookie llegue al *handshake*, Better Auth la emite con
   `Domain=app.<dominio>`, que alcanza a `api.app.` y no al resto del dominio. Así quedan fuera
   `notificaciones.<dominio>` y cualquier sitio futuro, y **la cookie de staging no choca con la de
   producción**, cosa que sí pasaría con `Domain=<dominio>`. Como `app.` y `api.app.` son
   *same-site*, `SameSite=Lax` basta. **No se usan nunca los dominios `*.onrender.com`**, porque
   están en la lista de sufijos públicos, son *cross-site* y Safari descartaría la cookie. Socket.IO
   lleva `cors.origin` exacto (`https://app.<dominio>`) con `credentials: true`, y **comprueba
   `Origin` en el *handshake*** para cerrar el secuestro de WebSocket entre sitios.
2. **Webhook de Meta (Paso 2):** `https://api.app.<dominio>/webhooks/whatsapp`. Staging no se
   suscribe al número real.
3. **Redis.** Key Value creado con `maxmemory-policy=noeviction`, en un plan pago, porque el gratuito
   no persiste. La **lista de IP externas permitidas queda vacía**: solo se entra por la red
   privada. El trabajador mantiene `maxRetriesPerRequest: null`.
4. **Secretos por proceso, no un grupo común.** Hay un grupo de entorno por servicio y por entorno,
   y cada variable va solo donde se lee:

   | Variable | Web | API | Trabajador | GitHub Actions |
   |---|---|---|---|---|
   | `NEXT_PUBLIC_*` (solo `NEXT_PUBLIC_API_URL`) y la URL interna de la API | Sí | No | No | No |
   | `DATABASE_APP_URL` | No | Sí | No | No |
   | `DATABASE_ALTAS_URL` | No | Sí | No | No |
   | `DATABASE_IDENTIDAD_URL` | No | Sí | No | No |
   | `DATABASE_WEBHOOK_URL` | No | No | Sí | No |
   | `DATABASE_URL` / `DIRECT_URL` (propietario) | No | No | No | Sí, solo para migrar |
   | `BETTER_AUTH_SECRET` | No | Sí | No | No |
   | `META_APP_SECRET` | No | Sí (firma del webhook) | No | No |
   | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | No | Sí | No | No |
   | `WEBHOOK_PAYLOAD_KEY` (+ `_VERSION`, `_PREVIOUS`) | No | Sí (sella) | Sí (abre) | No |
   | `CORREO_PAYLOAD_KEY` | No | Sí (sella) | Sí (abre) | No |
   | `WHATSAPP_DIRECTORY_PEPPER` (+ `_VERSION`, `_PREVIOUS`) | No | No | Sí | No |
   | `POSTMARK_SERVER_TOKEN` | No | Sí (aborta sin él) | Sí | No |
   | `REDIS_URL` (red privada) | No | Sí | Sí | No |
   | Deploy hook del servicio | No | No | No | Sí |

   `ENCRYPTION_MASTER_KEY` y `META_SYSTEM_USER_TOKEN` entran solo en la API, y solo cuando exista el
   código que los lee. **Ningún servicio de Render tiene el rol propietario.** En producción no
   existen `NEXT_PUBLIC_DEV_TENANT_ID`, `NEXT_PUBLIC_AUTH_MAQUETA` ni `IDENTIDAD_DEV_PASSWORD`.
   **No se registran cuerpos de petición**, ni del webhook ni de la API. Los logs no se envían a
   terceros sin un acuerdo de tratamiento de datos (DPA, R10).
5. **Roles (R2).** Cada proceso conserva su aserción al arrancar: la API con `viajapro_app`,
   `viajapro_altas` y `viajapro_identidad`, y el trabajador con `viajapro_webhook`. Las contraseñas
   se fijan una vez por rama de Neon con `rol:crear`, y las copia el propietario.
6. **Migraciones.** Las aplica **un trabajo de GitHub Actions, no Render**, con `prisma migrate
   deploy` y el **rol propietario por conexión directa**. Su cadena vive solo en el *Environment*
   de GitHub del entorno correspondiente. El trabajo **se niega a correr si `github.ref` no es
   `refs/heads/main` o si el SHA no es ancestro de `origin/main`**: hoy una rama sin integrar migró
   y rompió la compuerta. La migración corre **antes** del despliegue, y por eso tiene que ser
   compatible con el código anterior (expandir y después contraer).
7. **CI/CD.** El despliegue automático de Render queda **apagado**.

   ```
   integrador → merge en main → CI (las siete compuertas, ADR-0005)
     └─ verde → [staging]    migrate deploy (rama staging) → deploy hook de cada servicio → /salud
                [producción] workflow_dispatch desde main, Environment con aprobación
                             del propietario → migrate deploy (rama prod) → deploy hooks → /salud
   ```

   Los dos *Environments* de GitHub **solo admiten la rama `main`**. Se despliega con un **deploy
   hook por servicio**, no con la clave de API de Render: esa clave vale para toda la cuenta y
   probablemente lee las variables de todos los servicios. Si algún día hace falta, vive solo en un
   *Environment* con aprobación manual. La compuerta del integrador decide qué entra en `main`, y
   este flujo solo publica lo que ya entró.
8. **Arranque del trabajador.** Hoy `worker` corre con `tsx` y `dotenv -e ../../.env`. Hace falta
   `node dist/worker.js` sin archivo `.env`. Es tarea de `backend` y no cambia la forma del sistema.

## Topología

```
            navegador (Colombia)
              │ HTTPS                       │ WSS (cookie Domain=app.<dominio>)
              ▼                             ▼
   app.<dominio> ── Render web ──rewrite──▶ api.app.<dominio> ── Render API ◀── Meta (webhook)
   (Next.js, sin secretos)  red privada     (NestJS + Socket.IO)
                                               │        ▲ pub/sub
                                               ▼        │
                                      Render Key Value (noeviction) ◀── Render worker
                                               │                          │
                     ── región Ohio ───────────┴──────────────────────────┴───────
                                          Neon us-east-2 (rama prod / rama staging)
   GitHub Actions (solo main) ── migrate deploy, rol propietario ──▶ Neon
```

## Costo mensual estimado (USD, 50 agencias)

| Partida | Staging | Producción |
|---|---|---|
| Espacio Render Pro (uno solo para los dos entornos) | — | 25 |
| Web | 7 (512 MB) | 25 (2 GB) |
| API | 7 (512 MB) | 25 (2 GB) |
| Trabajador | 7 (512 MB) | 7 (512 MB) |
| Key Value | 10 (256 MB) | 20 (1 GB) |
| Ancho de banda sobre 25 GB (USD 0,15/GB) | — | 0–15 |
| Neon: el barrido de 30 s impide escalar a cero | ~20 (0,25 CU) | ~40–60 (0,5–0,75 CU) |
| **Total** | **~51** | **~142–177** |

**Unos USD 195–230 al mes en total, entre 4 y 4,6 por agencia.** No incluye Postmark (ADR-0012),
S3 ni la IA. Son estimaciones sobre precios de lista del 2026-10-20, no medidas.

## Consecuencias

### Positivas
- Un proveedor, una región y una factura. La latencia entre la API y la base es mínima.
- Ningún servicio en ejecución guarda la credencial que salta RLS.
- Desplegar a producción es un acto deliberado del propietario sobre un SHA ya integrado.

### Negativas
- Cada despliegue de la API corta las conexiones de Socket.IO. El cliente ya debe reconectarse y
  recargar, y el periodo de apagado se amplía para drenar.
- La cookie con `Domain` es más amplia que una *host-only*. Queda acotada a `app.<dominio>`, pero
  hay una regla nueva: **nada de terceros se sirve bajo `*.app.<dominio>`**.
- `req.ip` pasa por la web y por el balanceador de Render. Hay que fijar `API_TRUST_PROXY` con
  cuidado, o el límite de intentos limitará a la web en vez de al atacante.
- Render no ofrece almacenamiento de objetos. S3 sigue siendo una decisión pendiente.
- Dependemos de Render: las piezas son Docker y Node estándar, pero los grupos de entorno y la
  configuración se rehacen al migrar.

### Qué habría que cambiar para revertir esto
- Mover cuatro servicios a otro host en la misma región que Neon. El código no cambia, salvo el
  arranque del trabajador.

## Cuándo revisar esta decisión
- Si la latencia p95 Colombia–Ohio molesta en la bandeja (> 300 ms percibidos).
- Si la factura pasa de USD 10 por agencia, o si se llega a 3 réplicas de la API.
- Si Neon abre una región en São Paulo o en Bogotá y se mueve la base.

## Pasos del propietario

Todo se hace **en los paneles, nunca por el chat**. Ningún secreto pasa por aquí.

0. **Opción de arranque: solo staging (~USD 51 al mes).** Se monta primero staging y se valida
   con Meta en modo de desarrollo. Producción se monta cuando la piloto vaya a usarlo de verdad:
   los mismos pasos, la rama `production` y los registros DNS de `app`.
1. **Dominio.** Decidir y comprar el dominio técnico neutro (ADR-0012, paso 1).
2. **Render.** Crear la cuenta y el espacio Pro, registrar la tarjeta, conectar el repositorio de
   GitHub y crear los dos entornos en **Ohio** con el `render.yaml` que prepare `devops`.
3. **Neon.** Confirmar la rama `production`. Crear `staging` como rama **schema-only**: las ramas
   normales copian los datos de su padre, y **staging nunca es copia de producción**. Después,
   migrar y sembrar la agencia demo. Ejecutar `rol:crear` en cada rama y pegar cada cadena solo
   en el servicio que la usa, según la matriz de §4.
4. **Secretos.** Generar con `openssl rand` en la máquina propia la pimienta, `WEBHOOK_PAYLOAD_KEY`,
   `CORREO_PAYLOAD_KEY`, `ENCRYPTION_MASTER_KEY` y `BETTER_AUTH_SECRET`, **distintos por entorno**.
   Pegar además el token de Postmark y los de Meta.
5. **GitHub.** Crear los *Environments* `staging` y `production`, los dos limitados a la rama
   `main`. En `production`, exigir la aprobación del propietario. Guardar en cada uno su
   `DATABASE_URL` (propietario, directa) y los deploy hooks de sus servicios. La clave de API de
   Render no se guarda.
6. **DNS.** Crear los CNAME `app`, `api.app`, `staging` y `api.staging` hacia lo que indique Render, y
   esperar a que emita los certificados.
7. **Meta, Paso 2.** Registrar `https://api.app.<dominio>/webhooks/whatsapp` con el token de
   verificación.
