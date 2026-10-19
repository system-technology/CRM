# ADR-0010 — El webhook entrante tal como es, y dónde vive su trabajador

- **Estado:** Aceptado (2026-10-19), tras la revisión de `auditor-seguridad`, y ratificado por
  el propietario el mismo día. Ninguno de los
  huecos del punto 6 es una fuga posible hoy: están en cola.
- **Fecha:** 2026-10-19
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta). Pendiente: `auditor-seguridad`
- **Supersede parcialmente:** [ADR-0008](0008-resolucion-de-tenant-en-webhooks-entrantes.md), solo en
  los puntos que enumera la Parte 1. Lo que este documento no nombra sigue vigente tal cual. Precisa
  [ADR-0004](0004-monolito-modular.md) sin contradecirlo (Parte 2).

---

## Contexto

**Fuerza: cumplimiento y aislamiento.** El ADR-0008 es la especificación de la frontera entre
agencias, y el próximo auditor va a auditar ese texto. Entre su aceptación (2026-10-07) y `main` en
v0.21.2 (`59c8004`) entraron cuatro migraciones (`20261007140000`, `20261007140100`,
`20261011090000`, `20261019120000`) y el trabajador del inbox. El texto quedó afirmando cosas que el
sistema no hace. Un ADR que describe otro sistema es peor que no tener ADR, porque se le cree.

Hay una segunda fuerza, más pequeña: el trabajador vive en `apps/api` y el mapa de `CLAUDE.md` §5 lo
pone en `apps/worker`. Eso es una afirmación falsa sobre la forma del código, y hay que decidir cuál
de los dos cambia.

Todo lo que sigue se contrastó contra las migraciones y el código de `main` en `59c8004`.

## Parte 1 — Lo que es

### 1.1 Las diferencias, una por una

| # | ADR-0008 decía | Lo que es | Dónde |
|---|---|---|---|
| 1 | §1.1: los tokens cifrados de WhatsApp viven en `canales` | Viven en **`cuentas_whatsapp`**, porque el token del canje se emite sobre el WABA y no sobre un número. `canales` guarda `phone_number_id` y `numero_e164` en claro, bajo RLS. Las cuatro columnas del token van todas o ninguna (`cuentas_whatsapp_token_completo`) y el nonce mide 12 bytes. El WABA en claro que necesita la desuscripción se lee de `cuentas_whatsapp.waba_id` | `20261007120000`, `20261007140100` §3 |
| 2 | §1.1: el directorio tiene «cuatro columnas de ruteo» y `canal_id` nulo en las filas WABA | Tiene **cinco más la versión de pimienta**: se añadió `cuenta_id`. Cada fila lleva **exactamente una** de las dos (`CHECK num_nonnulls(canal_id, cuenta_id) = 1`), y cada una con clave foránea compuesta contra su tabla con tenant (`canales` o `cuentas_whatsapp`, `RESTRICT`). Sin la de cuenta, una fila WABA podía apuntar a la cuenta de otra agencia | `20261007140100` §1 |
| 3 | §1.2(b), §1.4, §5: «**seis** funciones `SECURITY DEFINER`» | Son **ocho**. Ver 1.2. Las reglas de §1.4, la revocación a `PUBLIC` y la obligación de auditar cualquier cambio de cuerpo valen para las ocho. Las aserciones 12, 13 y 20 ya las enumeran (`aislamiento.spec.ts`) | `20261007140100` §4, `20261019120000` |
| 4 | No mencionaba `crear_particion_historial` | Existe. **No** es `SECURITY DEFINER`, compone SQL dinámico y solo la ejecuta el rol de migraciones (`EXECUTE` revocado a `PUBLIC`). Es del mismo género que `aplicar_aislamiento_tenant`: sin entrada de usuario, por eso se le permite el SQL dinámico. Queda **fuera** del inventario de 1.2 y de la matriz de la aserción 20, a propósito, y aun así todo cambio de su cuerpo pasa por `auditor-seguridad`. Hay particiones de 2026 a 2030 | `20261007140100` §5 |
| 5 | §2 y §4: la fila `REVOCADO` se conserva 5 años y luego se borra | **Ningún camino puede borrar una fila del directorio.** Ningún rol de login tiene `DELETE` y ninguna función lo ofrece. Borrar un tenant con canales falla con `23503` por el `RESTRICT`. Tampoco existe la función que suelte una partición vencida del historial: la retención de 5 años de §1.6 no tiene quién la ejecute. Ver la decisión en 1.4 | — |
| 6 | §2 suponía que la baja de un canal llegaba al directorio | Llega por un **disparador**: `canales_propagar_estado` (`AFTER UPDATE OF estado WHEN estado <> 'ACTIVO'`) llama a `propagar_estado_canal()`. Es **monótono**, solo restringe y nunca relaja. Alcanza solo las filas de número de ese canal y de ese tenant, y deja un asiento en el historial. No actúa en `INSERT`: un canal que nace `REVOCADO` no se propaga. **No cubre** tres casos más: la baja de una cuenta (`cuentas_whatsapp.estado` no toca las filas WABA), el borrado lógico (`canales.eliminado_en`) y un re-alta (`registrar_enrutamiento` puede escribir `ACTIVO` sobre un canal que sigue `REVOCADO`) | `20261019120000` |
| 7 | No estaba | **La escritura exige la conjunción: el directorio y `canales` en `ACTIVO`** (`procesar-change.ts:95`). Ninguno basta solo, porque `viajapro_app` puede devolver `canales.estado` a `ACTIVO`. `BandejaPrisma` lee el canal con `FOR SHARE`, en la misma transacción y bajo RLS, antes de escribir. Si está revocado o borrado, el change se cierra como `CLASIFICADO` y se anula su contenido. Una revocación concurrente espera a que la escritura termine, o la escritura espera a la revocación. El directorio decide a qué agencia va el change; los dos juntos deciden si se escribe. Por eso los tres huecos del punto 6 no dejan entrar mensajes de números (sí dejan sin resolver los eventos de gestión, que hoy no se procesan: punto 10) | `bandeja.prisma.ts` |
| 8 | §4 paso 5: `jobId = recepcion_id \|\| ':' \|\| índice` | Es `<recepcion_id en hex>-<índice>`, porque BullMQ reserva `:`. El grano y el orden aplanado son los de 0008. El POST encola **también** cuando la recepción ya existía, y así el reintento de Meta cierra el hueco entre guardar y encolar. El trabajo lleva solo `{ recepcionId, indice }`, con 5 intentos, `removeOnComplete` de 1 h y `removeOnFail` de 7 días | `registrar-recepcion.ts`, `cola-de-changes.bullmq.ts` |
| 9 | §4: un relay barre los changes pendientes de más de 30 s, y antes de reencolar borra el trabajo fallido | **El relay de barrido no existe.** Lo único que recupera un change es el reintento de Meta. Y queda abierto justo el fallo que 0008 previó: un change que agota sus 5 intentos deja su trabajo fallido 7 días con el mismo `jobId`, y BullMQ descarta en silencio el reencolado del reintento de Meta. Lo mismo pasa con `RETENIDO`: el trabajo termina bien, el change sigue `PENDIENTE` y solo lo recupera un reintento de Meta que llegue pasada 1 h. `purgar_payloads` acota cuánto vive ese contenido, pero no lo recupera | `procesar-change.ts` |
| 10 | §1.1: filas WABA para los eventos de plantillas y de cuenta | El trabajador cierra todo campo distinto de `messages` como `CAMPO_NO_SOPORTADO` y anula su contenido. **Ningún código resuelve hoy por WABA**: las filas existen en el esquema y nadie las consulta | `procesar-change.ts` |
| 11 | §3: puerto `asegurarContacto`; `nombre_perfil_whatsapp` en columna propia; origen `WHATSAPP_ENTRANTE`; saneo de caracteres de control y bidi | **No existe.** `inbox` hace `upsert` directo sobre `contactos`, que es de `crm` (R4). Crea el contacto con `nombre := nombrePerfil`, sin marca de origen y sin sanear. Lo único que se cumple es que no sobrescribe (`update: {}`). **Esto no se acepta:** §3 sigue vigente, y es deuda con dueño (ver Riesgos) | `bandeja.prisma.ts` |
| 12 | §4: «la clave de descifrado vive en el proceso del trabajador, no en la API» | **Falso.** AES-256-GCM es simétrica y la API cifra, así que los dos procesos tienen `WEBHOOK_PAYLOAD_KEY`. Además en local los dos leen el mismo `.env`, con las tres cadenas de rol. Lo que sí separa hoy es el **rol**: `viajapro_app` no puede ejecutar `tomar_recepcion`, así que la API tiene la clave pero no tiene acceso a las filas. Ver la condición de despliegue en 1.3 | `registrar-recepcion.ts`, `apps/api/package.json` |
| 13 | §4 paso 4 (C-3): la carrera al anular se resuelve «dentro de una sola sentencia» | Se resuelve con `FOR UPDATE` sobre la fila de la recepción como primera sentencia de `anular_payload`. Una sola sentencia bajo `READ COMMITTED` no cerraba la carrera entre dos transacciones. La propiedad que se pedía, que alguien siempre anula, se cumple | `20261007140100` §4.2 |

### 1.2 Inventario de funciones `SECURITY DEFINER` (sustituye a §1.4 y a la tabla de §4)

| Función | Dueño | `EXECUTE` | Nota |
|---|---|---|---|
| `resolver_enrutamiento` | `viajapro_enrutador` | `viajapro_webhook` | `STABLE STRICT` |
| `registrar_enrutamiento` | `viajapro_enrutador` | `viajapro_altas` | Rehecha en `140100` para guardar `cuenta_id` |
| `propagar_estado_canal` | `viajapro_enrutador` | **nadie** | Es función de disparador: PostgreSQL no comprueba `EXECUTE` al dispararla |
| `registrar_recepcion` | `viajapro_staging` | `viajapro_app` | Sin `STRICT` desde `140100`: un nulo lanza en vez de responder 200 sin haber escrito |
| `tomar_recepcion` | `viajapro_staging` | `viajapro_webhook` | Un `change` por identificador exacto |
| `anular_payload(id, índice, estado)` | `viajapro_staging` | `viajapro_webhook` | Marca el change y anula cuando no queda ninguno pendiente |
| `purgar_recepciones` | `viajapro_staging` | `viajapro_webhook` | Nunca borra una recepción con algún change sin resolver (aserción 18) |
| `purgar_payloads` | `viajapro_staging` | `viajapro_webhook` | Anula el **contenido** antiguo aunque queden changes pendientes y conserva la fila. Sin ella, un change que nunca se resolvía conservaba el contenido para siempre |

### 1.3 Roles (sustituye a la columna «quién lo usa» de §1.3)

| Rol | Proceso | Qué ejecuta además |
|---|---|---|
| `viajapro_app` | API: `apps/api/src/main.ts` | `registrar_recepcion` |
| `viajapro_altas` | Caso de uso de Embedded Signup: **todavía no existe** | `registrar_enrutamiento` |
| `viajapro_webhook` | Trabajador: `apps/api/src/worker.ts` (Parte 2) | Las cinco de la tabla anterior |

Cada proceso aborta al arrancar si no es su rol (`guardia-de-rol.ts`, `PrismaWebhookService`).

**Condición para el primer despliegue, y no se negocia:** cada proceso recibe **solo** su propia
cadena de conexión. Con un `.env` común, quien compromete la API tiene la clave del staging y además
la cadena de `viajapro_webhook`, y la separación de roles se queda en convención de despliegue, que
es lo que 0008 §1.3 rechaza. Para que vuelva a ser cierta la frase «el que lista no es el que
descifra» haría falta cifrado asimétrico: la API sellaría con una clave pública. Esa decisión le
toca a `auditor-seguridad`; aquí no se toma.

### 1.4 Borrar filas del directorio: la decisión sobre el hueco

- **La baja de una agencia es lógica** (`REVOCADO` y `eliminado_en`). En un entorno con canales
  reales nunca se ejecuta `DELETE FROM tenants`. El `RESTRICT` que hoy lo impide se queda, y desde
  ahora es intencional.
- **El ejecutante de la retención no será el rol propietario a mano**, que es justo lo que 0008
  rechaza como control. Será `purgar_directorio(p_anteriores_a)`, `SECURITY DEFINER` de
  `viajapro_enrutador`, acotada a filas `REVOCADO` cuyo último asiento en el historial tenga más de
  5 años, con asiento propio. Lo acompañará la que suelte particiones vencidas del historial.
- **No se construye hoy.** La primera fila que podría cumplir el plazo no existe antes de 2031, y
  pedir la supresión dentro de esos 5 años no obliga a borrar, porque el deber de prueba es una base
  legítima para conservar. **Fecha límite:** lo que llegue primero de dos cosas, que la primera fila
  `REVOCADO` real cumpla 4 años o que llegue una solicitud de supresión que el deber de prueba no
  cubra.

### 1.5 `mensajes` no se particiona

Hoy no, por tres razones. La primera: particionar no acelera la consulta caliente (el hilo por
`tenant_id` y `conversacion_id`), porque un btree resuelve eso igual con 1 M que con 100 M de filas.
La segunda: particionar por fecha **rompería R5**. PostgreSQL exige que la clave de partición esté en
toda restricción única, así que `(tenant_id, wamid)` pasaría a incluir la fecha, y el mismo
reintento de Meta con otra marca de tiempo entraría dos veces. La tercera: cuando haga falta, la
forma correcta es **HASH por `tenant_id`**, que conserva la unicidad. Hay que revisarlo en
cualquiera de estos tres casos: más de ~50 M de filas, que el vacuum no termine dentro de su
ventana, o que aparezca una retención por fecha. En ese último caso se diseña con una tabla de
deduplicación de `wamid` aparte. El razonamiento completo está en el encabezado de la migración
`20261011090000`.

## Parte 2 — Dónde vive el trabajador

Hoy `apps/api/src/worker.ts` arranca un contexto de Nest **sin HTTP**, con `InboxWorkerModule`,
`PrismaWebhookService` y el rol `viajapro_webhook`. Se lanza con `pnpm --filter @viajapro/api
worker`, que es otro proceso desde el mismo paquete. `apps/worker` sigue vacío. ADR-0004 habla de
tres **procesos** por perfil de carga, y eso se cumple. Lo que no se cumple es el **mapa** de
`CLAUDE.md` §5.

### A — Aceptarlo en `apps/api` mientras sea un solo consumidor, con criterio de salida (elegida)
- **Gana:** cero trabajo hoy. El trabajador reutiliza el dominio de `inbox` sin publicar un paquete
  prematuro. El aislamiento no cambia, porque la frontera es el rol de conexión y no la carpeta.
- **Cuesta:** dos hogares para el trabajo asíncrono si nadie vigila el criterio, y un mapa que hay
  que corregir.
- **Cierra:** nada que no se reabra moviendo una carpeta y un `package.json`.

### B — Moverlo ya a `apps/worker`
- **Gana:** el mapa vuelve a ser cierto sin nota al pie.
- **Cuesta:** `apps/worker` tendría que importar de `apps/api` (de una app a otra, que es peor que lo
  que arregla) o sacar hoy a paquetes el dominio de `inbox`, `guardia-de-rol` y `PrismaWebhookService`.
  Es una extracción sin ninguna fuerza que la pida, con una agencia piloto esperando la bandeja.
- **Cierra:** nada, pero cuesta días que el producto necesita.

### C — Juntarlo con la API en un solo proceso
- **Descartada:** la API necesitaría el rol `viajapro_webhook` y el trabajo pesado competiría con el
  webhook, que es la razón de ser de los tres procesos de ADR-0004 y de los roles de ADR-0008 §1.3.

### Decisión

**A.** Las condiciones mientras dure, que son invariantes y no intenciones:

1. `worker.ts` monta **solo** `InboxWorkerModule`. `AppModule` no importa ese módulo ni construye
   `PrismaWebhookService`, y el trabajador no construye `PrismaService`.
2. En despliegue es un proceso con su propio arranque y su propio entorno (1.3). Hoy no tiene script
   de producción: `worker` corre con `tsx`.

**El criterio de salida.** Se muda a `apps/worker` en cuanto aparece el **segundo consumidor de cola
o el primer trabajo programado**: el relay de barrido (punto 9), el relay del `outbox`, la retención,
las particiones (4h), los envíos o la IA. **Ese segundo consumidor no se escribe en `apps/api`.**
Nace en `apps/worker`, y en la misma rama se muda `ProcesarChange`. **La condición de la mudanza es
que `apps/worker` no importe nada de `apps/api`.** Lo que compartan se extrae primero a paquetes: el
dominio puro de `inbox`, la guardia de rol y la conexión por rol a `packages/database`.

## Consecuencias

### Positivas
- El ADR-0008 vuelve a ser auditable: sus diferencias con el sistema están enumeradas y tienen
  dueño.
- Queda escrito cuál es la garantía de verdad: **la conjunción**. Se escribe solo si el
  directorio **y** `canales` (leído con `FOR SHARE`) dicen `ACTIVO` (`procesar-change.ts:95`).
  Ninguno de los dos basta solo: `viajapro_app` puede devolver `canales.estado` a `ACTIVO`.
- La mudanza del trabajador tiene un disparador que no depende de que alguien se acuerde.

### Negativas
- **Se registran tres incumplimientos sin corregirlos:** el puerto de §3, el relay de barrido y la
  separación de la clave. Escribirlos no los arregla. Lo único que cambia es que ahora tienen fecha
  y dueño.
- Mientras dure A, `CLAUDE.md` §5 necesita una nota, y `CLAUDE.md` no lo edita este agente.
- Con dos ADR para leer, entender el webhook cuesta más. 0008 lleva arriba una línea que manda aquí.

### Qué habría que cambiar para revertir
- Parte 1: nada. Describe lo que es, y si el sistema cambia se escribe otro ADR.
- Parte 2: mover `worker.ts` e `InboxWorkerModule` cuando se cumpla el criterio. No hay migraciones.

## Riesgos que quedan abiertos (cola, con dueño)

| Riesgo | Dueño | Límite |
|---|---|---|
| Relay de barrido y borrado del trabajo fallido antes de reencolar (punto 9) | `backend` + `datos` | **Antes del primer despliegue**: sin él, un change que falla 5 veces se pierde |
| Puerto `asegurarContacto`, `nombre_perfil_whatsapp`, origen y saneo (punto 11) | `backend` | **Antes del primer mensaje real de producción**: el nombre de perfil sin sanear es el vector de suplantación que 0008 §3 describe |
| Entorno separado por proceso; decidir si el staging pasa a cifrado asimétrico (1.3) | `devops` / `auditor-seguridad` | Primer despliegue |
| Baja de cuenta hacia filas WABA, `eliminado_en` y re-alta sobre un canal `REVOCADO` (punto 6) | `datos` | Antes de procesar eventos de gestión (punto 10) |
| `purgar_directorio` y soltar particiones (1.4) | `datos` | Fecha de 1.4 |
| Trabajo anual de particiones (4h) | `devops` | Antes de 2030-07 |

## Cuándo revisar esta decisión

- **Parte 2:** cuando exista el segundo consumidor (es la regla de salida, no una revisión), o si
  el trabajador necesita una dependencia que la API no deba cargar.
- **Parte 1:** cada migración que toque `enrutamiento_*`, `recepciones_*`, `canales` o
  `cuentas_whatsapp` comprueba esta tabla. Si la deja falsa, escribe el ADR que la supersede, en la
  misma rama.
