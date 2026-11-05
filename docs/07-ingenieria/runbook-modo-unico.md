# Runbook: modo `unico` (un proceso, sin Redis)

Cubre el paso 7 de [ADR-0019](../03-adr/0019-despliegue-minimo-un-proceso-sin-redis.md): el sistema
completo en local con `docker compose` (API en modo `unico`, web, Postgres 16 y Mailpit), y las
reglas de operación que valen también para la nube (§5 a §7). Al pasar a Fly, `devops` amplía este
documento con el despliegue (paso 8) y la restauración (paso 9).

> **Estado de la verificación.** Los archivos de este runbook se validaron solo de forma estática
> (YAML con un analizador, `node --check`, Prettier). **Nadie ha ejecutado `docker compose up`**:
> la máquina donde se escribió no tiene Docker. Lo que no se probó está en §8.

## 1. Levantar todo en local

Requisitos: Docker con Compose v2 y los puertos 3000, 3333 y 8025 libres. Si tienes arriba
`pnpm infra:up`, bájalo antes (`pnpm infra:down`): también usa el 8025.

```bash
pnpm infra:unico:up       # genera .env.unico, construye las imágenes y levanta; tarda en el primer build
pnpm infra:unico:down     # detiene; la base se conserva
pnpm infra:unico:reset    # borra la base (volumen) y vuelve a empezar
pnpm infra:unico:logs     # sigue el registro de la API
```

`pnpm infra:unico:up` hace, en orden:

1. Crea `.env.unico` si no existe: **secretos de desarrollo al azar**, permisos 0600, fuera de git
   (`.gitignore` ignora `.env.*`). Nada secreto vive en el repositorio (R6). Si lo borras, se genera
   otro y el siguiente `up` vuelve a fijar las contraseñas de los roles (`roles:dev`).
2. `postgres` (16) y `mailpit`.
3. `preparar` (una vez por `up`, idempotente, en la red de `postgres` para que sus guardias vean
   `localhost`): `db:migrate:deploy` → `roles:dev` → `db:seed` → `identidad:sembrar-dev`
   (`infra/docker/unico/preparar.sh`).
4. `api`: `node dist/main-unico.js` con `MODO_DESPLIEGUE=unico` y **sin `REDIS_URL`**. Un solo
   proceso con dos contextos de Nest; conecta con los roles de aplicación, nunca con el propietario.
5. `web` (Next.js `standalone`) apuntando a `http://localhost:3333`.

`--wait` espera a que `api` y `web` estén *healthy* y falla si `preparar` termina con error. Al final
imprime el usuario `dueno@agenciademo.test` y su clave de desarrollo (también en `.env.unico`).

| Qué | Dónde |
|---|---|
| Web | http://localhost:3000 |
| API (salud) | http://localhost:3333/salud/listo |
| Correo (OTP, invitaciones) | http://localhost:8025 |
| Postgres (propietario de desarrollo) | `127.0.0.1:5433`, usuario `viajapro` |

## 2. Cómo verificar la salud

- `GET /salud` → `{"estado":"ok"}`: el proceso está vivo. **No toca la base.** Es lo que usa la sonda
  del contenedor y lo que debe usar la sonda de Fly y el monitor externo, para no despertar a Neon.
- `GET /salud/listo` → `200` con `{"estado":"ok","baseDeDatos":"ok","rol":"viajapro_app","aislamiento":"forzado"}`.
  Comprueba la base **y** que el rol no pueda saltarse RLS; `503` si cualquiera falla. Consúltalo a
  mano o una vez por hora, nunca como sonda frecuente (ADR-0019 §1.3).
- El registro de arranque debe decir `API y trabajador en un solo proceso (modo unico)`. Si dice que
  falta `MODO_DESPLIEGUE`, `REDIS_URL` o un rol, el proceso aborta a propósito (R2).

```bash
curl -s http://localhost:3333/salud
curl -s -i http://localhost:3333/salud/listo
```

## 3. Variables que importan

| Variable | Valor / regla |
|---|---|
| `MODO_DESPLIEGUE` | `unico`. Sin valor por omisión: sin ella el arranque aborta |
| `REDIS_URL` | **No se define.** Si algo la pide en modo `unico`, es un defecto |
| `DATABASE_WEBHOOK_URL` | Debe llevar **`connection_limit` ≥ 2** (el compose usa 3). El candado del barrido retiene una conexión hasta que acaba la tarea y la tarea necesita otra; con `connection_limit=1` el barrido espera al `pool_timeout` y falla siempre (hallazgo C8 de la auditoría del PR #211). Aplica igual en Neon: `...-pooler.../viajapro?sslmode=require&connection_limit=3` |
| `API_TRUST_PROXY` | Saltos de proxy de confianza para `req.ip` (límite de intentos de ingreso y límite de tasa). Vacío = ninguno: `x-forwarded-for` se **ignora**. **Local: vacío.** **Detrás de Fly (un proxy): `1`.** Si se deja vacío detrás de un proxy, todas las peticiones parecen venir de la misma IP y el límite por IP castiga a todos; si se pone un número mayor que el real, un cliente puede falsificar su IP |
| `APP_ENV` | `local` solo en este compose. Los scripts de siembra se niegan a correr en otro valor |
| `API_PUBLIC_URL`, `WEB_PUBLIC_URL` | Origen de CORS, cookies y enlaces de invitación |

## 4. Probar que entra un mensaje firmado de WhatsApp

El webhook es `POST /webhooks/whatsapp` (sin `/api/v1`) y exige `x-hub-signature-256` = HMAC-SHA256
del cuerpo en crudo con `META_APP_SECRET`. `scripts/firmar-webhook-whatsapp.mjs` lo firma igual que
Meta (el mismo método que `apps/api/src/proceso-unico/proceso-unico.e2e-spec.ts`, que lo prueba en CI).

1. Liga el número de prueba a la agencia demo (una vez; ids ficticios, no son secretos):

   ```bash
   docker compose -f infra/docker/docker-compose.unico.yml --env-file .env.unico \
     run --rm preparar bash /preparar.sh canal
   ```

2. Envía un mensaje firmado:

   ```bash
   node scripts/firmar-webhook-whatsapp.mjs --texto "Hola, quiero cotizar Cartagena"
   # POST /webhooks/whatsapp -> 200   wamid=wamid.PRUEBA...
   ```

3. Entra en http://localhost:3000 como `dueno@agenciademo.test`: la conversación aparece en la
   bandeja **en segundos**, sin esperar al barrido (que es de 60 minutos).
4. Idempotencia (R5): repite con el mismo `--wamid wamid.PRUEBA...`. Responde 200 y **no** aparece un
   segundo mensaje.
5. Firma inválida: cambia un carácter del secreto o del cuerpo y el POST debe responder `403`
   `FIRMA_INVALIDA` (no `200`).

Limitaciones: el mensaje entrante se prueba de punta a punta; **enviar** a Meta real exige
`META_SYSTEM_USER_TOKEN`, `META_PHONE_NUMBER_ID_PRUEBA` reales y `META_TENANT_ID_PRUEBA` (ver
`.env.example`); sin ellos cada saliente queda `FALLIDO`, y es lo esperado en local.

## 5. PASO OBLIGATORIO antes del primer arranque en modo `unico` sobre una base que ya tiene historia

**Aplica** si la base corrió antes en modo `escalado` (BullMQ + Redis), o tiene mensajes salientes
`PENDIENTE` antiguos. **No aplica** a la base nueva de este compose ni a una recién creada.

**Por qué (hallazgo Q1).** En `escalado` la «reserva de envío» vivía en Redis (`SET NX`, 7 días). En
modo `unico` vive en `mensajes.envio_reservado_en`, que esas filas antiguas no tienen. El barrido del
arranque recoge los salientes `PENDIENTE` sin `wamid` y el consumidor, al ver que **no hay reserva**,
los **enviaría de nuevo**: si Meta ya había aceptado el mensaje (y la respuesta se perdió o el
`wamid` no llegó a registrarse), el viajero lo recibe dos veces; una plantilla se cobra dos veces. Un
mensaje jamás sale dos veces (ADR-0019 §3.2), así que antes del primer arranque se marcan como
`FALLIDO` «sin confirmar», igual que haría el sistema con una reserva huérfana. El asesor ve el aviso
y decide si reenvía.

**Antes de arrancar el proceso `unico`: detén API y trabajador antiguos** (`worker.ts` incluido), y
solo entonces ejecuta lo siguiente. **Este runbook no lo ejecuta: lo corre a mano quien opera la
base, con la base ya respaldada o con la restauración instantánea de Neon disponible.**

Las políticas RLS están en modo `FORCE`: **incluso el propietario de la tabla las respeta**, salvo
que su rol tenga `BYPASSRLS` (el propietario de Neon y el de este compose lo tienen). Comprueba cuál
es tu caso:

```sql
-- Conectado con el rol propietario (DATABASE_URL, conexión directa):
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

**Paso 0, siempre. Cuántas filas hay (solo lectura):**

```sql
SELECT tenant_id, count(*) AS pendientes, min(creado_en) AS la_mas_antigua
FROM mensajes
WHERE direccion = 'SALIENTE' AND estado = 'PENDIENTE' AND wamid IS NULL
GROUP BY tenant_id;
```

**Camino A: propietario con `BYPASSRLS` (o superusuario).** Una sola sentencia, en una transacción:

```sql
BEGIN;
UPDATE mensajes
SET estado = 'FALLIDO',
    motivo_fallo = 'Sin confirmar: quedó pendiente antes del cambio de modo de despliegue; no se reenvía automáticamente.',
    codigo_error_meta = NULL,
    envio_reservado_en = COALESCE(envio_reservado_en, now()),
    actualizado_en = now()
WHERE direccion = 'SALIENTE' AND estado = 'PENDIENTE' AND wamid IS NULL;
-- Debe coincidir con la suma del paso 0. Si no, ROLLBACK y revisa.
COMMIT;
```

`envio_reservado_en = now()` deja además la fila marcada como reservada, de modo que ningún barrido
posterior la tome por no enviada.

**Camino B: sin `BYPASSRLS`. Tenant por tenant, bajo RLS**, conectado con `viajapro_app` (la cadena
de `DATABASE_APP_URL`) y con la lista de `tenant_id` del paso 0 (obtenida con un rol que pueda
leerlos). Repite el bloque para cada UUID; `set_config(..., true)` vale solo dentro de la transacción:

```sql
BEGIN;
SELECT set_config('app.current_tenant', '<UUID-DE-LA-AGENCIA>', true);
UPDATE mensajes
SET estado = 'FALLIDO',
    motivo_fallo = 'Sin confirmar: quedó pendiente antes del cambio de modo de despliegue; no se reenvía automáticamente.',
    codigo_error_meta = NULL,
    envio_reservado_en = COALESCE(envio_reservado_en, now()),
    actualizado_en = now()
WHERE direccion = 'SALIENTE' AND estado = 'PENDIENTE' AND wamid IS NULL;
-- Compara el número de filas con el del paso 0 para ese tenant.
COMMIT;
```

(El `WHERE tenant_id` es innecesario: la política RLS ya lo impone. Si el conteo es 0 para una
agencia que el paso 0 listaba, la variable de tenant no se fijó: no sigas.)

**Verificación:** repite el paso 0; debe devolver cero filas. Solo entonces arranca el proceso `unico`.

Lo que **no** cubre: eventos pendientes del *outbox* y *changes* sin procesar del staging. Esos sí
los recupera el barrido del arranque, y son idempotentes (R5).

## 6. Detener sin perder trabajo (Q5)

Lo pendiente está en Postgres y el barrido del arranque lo recupera, así que un reinicio no pierde
mensajes. Lo que sí conviene evitar es matar una llamada a Meta **a mitad**: el mensaje queda
reservado sin `wamid` y pasa a `FALLIDO` «sin confirmar» aunque Meta lo haya aceptado (el webhook de
estado lo corrige si llega).

Hoy hay tres tiempos que no están alineados:

| Quién | Tiempo | Dónde |
|---|---|---|
| Tope de cierre del proceso | **25 s**, luego `exit(1)` | `apps/api/src/main-unico.ts`, `TOPE_DE_CIERRE_MS` |
| Una llamada a Meta | **10 s** por intento (`TIMEOUT_DE_GRAPH_MS`); hasta **~32 s** con reintentos (hallazgo Q5) | `envio-whatsapp.graph.ts` |
| Docker Compose (este compose) | **45 s** (`stop_grace_period`) | `docker-compose.unico.yml` |
| Fly.io | `kill_timeout` por omisión **5 s** | `fly.toml` (paso 8) |

Reglas:

- **Fly: `kill_timeout >= 45`** (segundos) en el `fly.toml` de la API, para que SIGTERM llegue y el
  cierre ordenado termine antes del SIGKILL. Con el valor por omisión de Fly, cada despliegue puede
  matar un envío en vuelo. Es una tarea de `devops` en el paso 8; queda anotada aquí para que no se
  olvide.
- **Tarea para `backend`** (no se cambia en este PR: toca el código de arranque): el tiempo de espera
  de cierre (25 s en `main-unico.ts`; la auditoría Q5 habla de 10 s para la parte del trabajador: que
  `backend` confirme cuál manda) es **menor** que lo que puede tardar una llamada a Meta
  (~32 s); además `arrancar-unico.ts` cierra la API y luego el trabajador sin plazo propio. Hay que
  (a) o bien subir `TOPE_DE_CIERRE_MS` a un valor mayor que el tiempo de espera de Meta más un
  margen (~40 s) y mantener `kill_timeout`/`stop_grace_period` por encima, o bien acotar el tiempo de
  espera de la llamada a Meta por debajo del tope; y (b) registrar «cierre incompleto» cuando el tope
  dispare, para que el barrido del arranque se vea como recuperación y no como sorpresa.
- Parada limpia en local: `pnpm infra:unico:down` (SIGTERM, hasta 45 s). No uses `docker kill`.
- Antes de un despliegue en la nube con dos máquinas solapadas: el barrido del arranque usa
  antigüedad 0 y puede recoger un change que la máquina vieja aún procesa. El procesamiento es
  idempotente (`(tenant_id, wamid)` único), pero conviene que el solape dure lo mínimo.

## 7. Volver al modo `escalado`

`MODO_DESPLIEGUE=escalado` con `REDIS_URL`, `node dist/main.js` y `node dist/worker.js` por separado
(ADR-0019, «Qué habría que cambiar para revertir esto»). Las columnas de `mensajes` se quedan. Para
ese modo sigue vigente `infra/docker/docker-compose.yml` (`pnpm infra:up`), que sí trae Redis.

## 8. Qué quedó sin probar (honesto)

No hay Docker en la máquina donde se escribió. **Sin probar, todo lo que implique ejecutar:**

- `docker compose up`: que el YAML construya, que las dependencias (`preparar` →
  `service_completed_successfully` → `api` → `web`) se resuelvan y que `--wait` acepte un servicio de
  una sola ejecución.
- `preparar.sh` en la imagen `build`: que `dotenv` acepte el `.env` vacío, que `prisma migrate
  deploy` y `tsx` funcionen allí, y que `roles:dev` y `identidad:sembrar-dev` vean `localhost` gracias
  a `network_mode: service:postgres`.
- Que `connection_limit=3` y `schema=public` convivan en la URL como los espera Prisma.
- La web con `NEXT_PUBLIC_USE_REAL_AUTH=true` y las cookies entre `:3000` y `:3333` en `http://localhost`
  (la API corre con `NODE_ENV=production`; si marcara la cookie como `Secure`, `localhost` la admite,
  pero **no está comprobado**).
- `scripts/firmar-webhook-whatsapp.mjs` contra una API viva y el registro del canal con ids ficticios.
- El SQL de §5: no se ejecutó contra ninguna base. Verifica el conteo antes y después.
- Que `stop_grace_period: 45s` baste: depende de la tarea de `backend` de §6.

Sí se verificó de forma estática: el YAML del compose con un analizador, `node --check` de los dos
scripts, `bash -n` de `preparar.sh` y Prettier.
