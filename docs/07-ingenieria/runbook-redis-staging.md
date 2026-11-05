# Runbook: Redis y trabajador en staging (T-079)

Objetivo: que un mensaje enviado desde la app de prueba de Meta aparezca como conversación en la
bandeja de staging. Sin Redis y sin trabajador el webhook guarda el mensaje pero nadie lo procesa
(ADR-0010).

Este runbook **no despliega nada por sí mismo**: lo ejecuta el propietario, que es quien tiene la
cuenta de Render. Complementa `despliegue-staging.md`; no lo sustituye.

## 0. Qué ya está en el repositorio (no hay que escribirlo)

`render.yaml` ya declara, desde el ADR-0013, todo lo que T-079 pide. Contrastado contra el código
(2026-11-04):

| Pieza | Dónde | Estado |
|---|---|---|
| Key Value `viajapro-redis-staging`, región `ohio`, `plan: starter`, `maxmemoryPolicy: noeviction`, `ipAllowList: []` | `render.yaml`, último bloque | Declarado |
| `REDIS_URL` en la API y en el trabajador, por `fromService` (`type: keyvalue`, `property: connectionString`) | `render.yaml` | Declarado |
| Trabajador `viajapro-worker-staging`, misma imagen que la API, `dockerCommand: node dist/worker.js` | `render.yaml` | Declarado; el CI comprueba que `dist/worker.js` existe en la imagen (`ci.yml`) |
| `COLA_CHANGES` **sin definir** en la API | `render.yaml` | Correcto: sin la variable, `InboxModule` usa BullMQ sobre `REDIS_URL`. Con `inerte` los mensajes se guardan y no se procesan |
| Cliente Redis con `maxRetriesPerRequest: null` (exigido por BullMQ) | `apps/api/src/modules/inbox/infrastructure/` | Hecho |

Conclusión: **T-079 no necesita cambios en `render.yaml`**. Lo que falta es acción del propietario
(sincronizar el Blueprint, cargar valores, registrar el canal de prueba) y resolver las dos marcas
`VERIFICAR-AL-SINCRONIZAR` que Render confirmará al crear el Blueprint.

### Dos campos sin confirmar en la documentación

1. `dockerCommand` en un servicio `type: worker` (inferido como admitido).
2. `ipAllowList: []` en el Key Value.

Si Render rechaza alguno al sincronizar, el cambio es de una línea en `render.yaml` (ruta
protegida: PR aparte con aprobación del propietario). No usar la versión gratuita del Key Value: no
persiste en disco, y perder la cola en un reinicio descartaría trabajos en silencio.

### Costo (NO verificado)

No se pudo consultar la página de precios de Render desde esta sesión (acceso a red denegado), y no
se cita una cifra de memoria. **Antes de aprobar**, el propietario lee el precio del plan `starter`
del Key Value en <https://render.com/pricing> (sección Key Value) y lo anota aquí con la fecha:

> Key Value `starter`: USD ______ / mes, leído el ____-__-__ en https://render.com/pricing

El trabajador (`plan: starter`) es un servicio adicional de pago: mismo procedimiento. Estos dos
importes suben el costo mensual de staging. Staging no tiene tenants activos, así que el costo por
tenant activo no es calculable todavía (es un costo fijo del entorno).

## 1. Lista de secretos y variables (sin valores, R6)

Ningún valor se pega en el chat, en un issue ni en el repositorio. Se escriben en el panel de Render
(el Blueprint los pide por `sync: false`).

**Trabajador `viajapro-worker-staging`** (lo que T-079 necesita):

| Variable | Qué es |
|---|---|
| `DATABASE_WEBHOOK_URL` | Cadena del rol `viajapro_webhook` (la imprime `rol:crear`, paso 3 de `despliegue-staging.md`) |
| `WEBHOOK_PAYLOAD_KEY` | Clave AES-256-GCM, **idéntica** a la de la API. `openssl rand -base64 32` |
| `WEBHOOK_PAYLOAD_KEY_VERSION` | `1` |
| `CORREO_PAYLOAD_KEY` | Idéntica a la de la API |
| `WHATSAPP_DIRECTORY_PEPPER` | `openssl rand -hex 32`. **Idéntica** a la que se use al registrar el canal (paso 3) |
| `WHATSAPP_DIRECTORY_PEPPER_VERSION` | `1` |
| `POSTMARK_SERVER_TOKEN`, `MAIL_FROM`, `POSTMARK_MESSAGE_STREAM` | Correo (el trabajador aborta sin el token con `MAIL_PROVIDER=postmark`) |
| `REDIS_URL` | **No se pega**: la enlaza `fromService` |

**API `viajapro-api-staging`**: `DATABASE_APP_URL`, `DATABASE_ALTAS_URL`, `DATABASE_IDENTIDAD_URL`,
`BETTER_AUTH_SECRET`, `META_APP_SECRET` (firma del webhook, de la app de prueba de Meta),
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` (cadena aleatoria, la misma que se pone en Meta),
`WEBHOOK_PAYLOAD_KEY` y `_VERSION`, `CORREO_PAYLOAD_KEY`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`,
`API_TRUST_PROXY`, `MAIL_FROM`, `POSTMARK_MESSAGE_STREAM`. Detalle en `despliegue-staging.md` §4.

**Opcional, solo para probar respuestas salientes (ADR-0018, no es parte de T-079):** en el
trabajador, `META_SYSTEM_USER_TOKEN`, `META_PHONE_NUMBER_ID_PRUEBA`, `META_TENANT_ID_PRUEBA`. Hoy
**no están en `render.yaml`**; sin ellas los envíos quedan `FALLIDO` con un aviso en el log. Añadirlas
es otro cambio de ruta protegida.

Cada servicio recibe solo las suyas (ADR-0013 §4): no pegar `DATABASE_WEBHOOK_URL` en la API ni las
cadenas de la API en el trabajador.

## 2. Crear o sincronizar el Blueprint en Render

Si el Blueprint de staging **aún no existe**, seguir `despliegue-staging.md` pasos 1 a 6 completos.
Si ya existe y solo falta Redis/trabajador:

1. Render > **Blueprints** > el Blueprint de ViajaPro > **Manual sync**.
2. Revisar el plan que Render muestra: debe crear `viajapro-redis-staging` (Key Value) y
   `viajapro-worker-staging` (Background Worker). Si propone borrar algo, **cancelar** y avisar.
3. Pegar los valores de la sección 1 cuando los pida.

*Comprobación:*
- Key Value: **Maxmemory policy: noeviction**; lista de IP externas **vacía**; solo URL interna.
- API y trabajador: **Environment** muestra `REDIS_URL` enlazada (valor oculto), y la API **no**
  tiene `COLA_CHANGES`.
- Logs del trabajador: `Trabajador del inbox en marcha.` Si muere con «Falta REDIS_URL» o con un
  mensaje de rol, el aborto es intencional (R2): revisar la variable que nombra.

## 3. Registrar el canal de prueba de Meta en la agencia de staging

El webhook decide a qué agencia pertenece un mensaje por el directorio de enrutamiento. Sin una fila
para el número de prueba, el change se cierra como no enrutado y **no aparece conversación**, aunque
Redis y el trabajador funcionen.

Desde la máquina del propietario, en una terminal con las variables **de esa terminal** (no en
`.env`), apuntando a la rama `staging` de Neon:

```bash
export APP_ENV=local                      # el script lo exige; la base remota se opta aparte
export CANAL_PRUEBA_PERMITIR_REMOTO=si    # solo permitido si no hay agencias ajenas a la semilla
export DATABASE_APP_URL=...               # rol viajapro_app de staging
export DATABASE_ALTAS_URL=...             # rol viajapro_altas de staging
export META_PHONE_NUMBER_ID_PRUEBA=...    # del número de prueba, panel de Meta
export META_WABA_ID_PRUEBA=...
export WHATSAPP_DIRECTORY_PEPPER=...      # el MISMO valor y versión que el trabajador
export WHATSAPP_DIRECTORY_PEPPER_VERSION=1
pnpm --filter @viajapro/api canal:registrar-prueba
```

*Comprobación:* el script termina sin error e imprime el hostname y el nombre de la agencia demo.
Se niega (con motivo) si staging ya tiene agencias ajenas a la semilla: es la guardia, no un fallo.
Cerrar la terminal al terminar para que las variables no queden.

## 4. Suscribir el webhook de la app de prueba de Meta

En el panel de Meta (app de prueba, modo desarrollo), WhatsApp > Configuración > Webhook:

- URL de devolución: `https://api.staging.<dominio>/webhooks/whatsapp`
- Token de verificación: el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN` de la API.
- Suscribir el campo `messages`.

Staging **no** se suscribe al número real (`despliegue-staging.md` §7).

## 5. Verificar de punta a punta

1. Desde un teléfono agregado como destinatario de prueba, enviar «hola staging» al número de prueba.
2. En unos segundos, abrir la bandeja de staging: debe aparecer la conversación con el mensaje.
3. En los logs del trabajador debe verse el change procesado (el contenido del mensaje nunca se
   registra). En los de la API, el POST al webhook con 200.
4. Si no aparece, en este orden:
   - La API responde 200 al webhook? Si no: `META_APP_SECRET` incorrecto (firma) o URL mal puesta.
   - El trabajador está en marcha, sin reinicios en bucle? Ver logs.
   - La API arrancó con `COLA_CHANGES=inerte`? Quitar la variable y redesplegar.
   - Falta el canal del paso 3 (el change queda cerrado sin conversación)?
   - La pimienta del trabajador difiere de la usada en el paso 3: el directorio no resuelve.
5. Cuando funcione: anotar fecha y resultado en `ESTADO.md` y avisar para cerrar T-079 con
   `scripts/cerrar-tarea.mjs`. Este PR no la cierra.

## 6. Revertir

- **Solo parar el procesamiento:** suspender `viajapro-worker-staging` (Settings > Suspend). Los
  mensajes siguen guardándose cifrados en la base y se procesan al reanudar. No se pierde nada.
- **Volver al modo sin Redis:** no soportado en staging (la API aborta sin `REDIS_URL` salvo
  `COLA_CHANGES=inerte`, que es solo para desarrollo).
- **Quitar el Key Value:** suspender primero el trabajador y la API, luego borrarlo. Se pierden los
  trabajos en cola; los changes siguen `PENDIENTE` en la base y se reprocesan al volver.
- **Rotar secretos:** cambiar el valor en el panel y redesplegar el servicio; las `_VERSION` solo
  suben con el procedimiento de rotación de claves.
- **Quitar el canal de prueba:** baja lógica del canal; nunca `DELETE` sobre el directorio
  (ADR-0010 §1.4).

## Fuentes

- ADR-0010 (trabajador en `apps/api`, roles por proceso), ADR-0013 (staging y matriz de secretos),
  ADR-0018 (envío saliente).
- Documentación oficial de Render consultada el 2026-10-20 por quien escribió `render.yaml`
  (`keyvalue`, `maxmemoryPolicy`, `fromService`); no vuelta a consultar en esta sesión.
