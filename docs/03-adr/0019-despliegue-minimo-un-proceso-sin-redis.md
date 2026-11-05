# ADR-0019 — Despliegue mínimo: un solo proceso y la cola sobre Postgres, sin Redis

- **Estado:** Propuesto. **El propietario ya confirmó la dirección** (2026-11-04): un proceso, colas
  sobre Postgres, sin Redis y el host fiable más barato. Falta aprobar este documento.
  El punto 3.3 (varios roles en un proceso) toca el aislamiento entre agencias y por eso no se rige
  por la regla de una sola vuelta: pasa por `auditor-seguridad` las veces que haga falta (R13).
- **Fecha:** 2026-11-04
- **Decide:** el propietario
- **Consultados:** `arquitecto` (redacta). Pendientes: `auditor-seguridad` (§3.3, §3.5 y §6) y
  `devops` (§5 y §7)
- **Supersede parcialmente:** [ADR-0010](0010-webhook-tal-como-es-y-el-trabajador-en-apps-api.md) y
  [ADR-0013](0013-despliegue-staging-y-produccion.md), solo en los puntos que enumera §2. Lo que no se
  nombra ahí sigue vigente tal cual. Además precisa el mecanismo de la reserva de
  [ADR-0018](0018-envio-saliente-de-whatsapp.md) §3.2, que ese mismo ADR ya proponía.

---

## Contexto

**La fuerza es el costo.** El objetivo es un entorno de **producción real, pequeño y barato**, que
agencias pequeñas usen en su operación diaria. Se recortan el costo y la escala; la fiabilidad y las
garantías no se recortan. Si lo que se cobra a una agencia pequeña se va en infraestructura, no hay
margen. Lo robusto llega por disparadores escritos (§8) y no por adelantado.

Lo que cuesta hoy, según ADR-0013, son unos **USD 51 al mes solo por staging** en Render: web, API,
trabajador, Key Value y Neon despierto por el barrido de 30 s. Producción suma **142–177** más. Y
todo esto con **cero tráfico**: aún no hay agencia real.

La pieza que obliga a esa topología es Redis. Él exige un servicio aparte, un trabajador aparte y un
bus pub/sub entre los dos procesos. Pero **la verdad durable ya vive en Postgres**. Lo que sigue se
comprobó en el código (árbol de trabajo del 2026-11-04, basado en `a2dbc45`, que solo difiere de
`main` en `apps/web`).

### Qué hace hoy Redis (comprobado)

| Uso | Archivo | ¿Lo durable está en Postgres? |
|---|---|---|
| Cola `inbox-changes` | `inbox/infrastructure/cola-de-changes.bullmq.ts` | **Sí.** El trabajo solo lleva `{recepcionId, indice}`. El change vive en el staging (`PENDIENTE`) y el contador `intentos_barrido` está en la base (`listar_changes_pendientes`, `contar_reencolado_barrido`) |
| Barrido: `enCola`, `reencolar`, turno `SET NX` | `inbox/infrastructure/barrido.bullmq.ts` | Sí. El barrido le pregunta a Postgres qué falta. Redis solo responde si ya hay un trabajo vivo y quién tiene el turno |
| Cola `inbox-envios` | `inbox/infrastructure/cola-de-envios.bullmq.ts` | **Sí.** El mensaje queda `PENDIENTE`, sin `wamid`, y lo encola el relay del outbox (`relevar-outbox.ts`) |
| **Reserva de envío** (`SET NX`, 7 días) | Mismo archivo, `ReservaDeEnvioRedis` | **No.** Hoy solo vive en Redis. Es justo lo que ADR-0018 llamaba «vale lo que vale la cola» |
| Cola `correo-saliente` | `notifications/infrastructure/cola-de-correo.bullmq.ts` | **No.** El trabajo lleva el mensaje **entero y sellado**, porque un OTP o un token de invitación no se pueden reconstruir: en la base solo está su hash. Esto corrige lo que suponía el encargo |
| Bus de eventos trabajador → API (pub/sub) | `bus-de-eventos.redis.ts` | No hace falta: el outbox es lo durable |
| Aviso API → relay (pub/sub) | `aviso-al-relay.redis.ts` | No hace falta: es solo una pista. El relay además barre cada 15 s |
| Limitador de OTP | `identity/infrastructure/limitador-de-envios.redis.ts` | No. Ya existe `LIMITADOR_OTP=memoria` |

**Una precisión sobre `BUS_DE_EVENTOS=memoria`.** Existe, pero hoy solo sirve para pruebas.
`crearPublicadorDelTrabajador()` publica **siempre** por Redis, `crearAvisoAlRelay` devuelve un aviso
inerte («las pruebas vacían el outbox a mano») e `InboxWorkerModule` exige `REDIS_URL` en tres
fábricas. Un solo proceso real necesita que el bus en memoria se **comparta** entre la parte HTTP y la
del trabajador, y eso todavía no está construido.

**El trabajador** es `apps/api/src/worker.ts`. Monta `WorkerModule` sin HTTP, con `InboxWorkerModule`
y `NotificationsWorkerModule`, y se conecta como `viajapro_webhook`. Comparte la imagen
`apps/api/Dockerfile` y solo cambia el comando: `node dist/worker.js`.

**Lo que despierta hoy a la base:** el barrido de changes cada **30 s**
(`configuracion-del-barrido.ts`) y el barrido del relay cada **15 s** (`planificador-de-relay.ts`).
Con ese ritmo, Neon nunca baja a cero.

## 1. Decisión

**Modo `unico`:** un proceso Node por entorno, con API, Socket.IO, el webhook y el trabajo asíncrono.
No hay Redis. Las colas se implementan sobre Postgres detrás de **los mismos puertos** que hoy
implementa BullMQ. Los adaptadores de BullMQ y Redis **no se borran**: siguen siendo el modo
`escalado`, que se elige por configuración (§8).

### 1.1 Forma del proceso

- Un arranque nuevo, `main-unico.ts`, levanta **dos contextos de Nest en el mismo proceso**: el HTTP
  (`AppModule`) y el del trabajador (`WorkerModule`). Son dos contenedores de inyección separados, así
  que **ningún controlador HTTP puede inyectar `PrismaWebhookService`**. La condición 1 de ADR-0010
  Parte 2 se conserva.
- Los dos contextos comparten **una sola instancia** de `BusDeEventosEnMemoria` y de
  `AvisosDeOutboxEnMemoria`, que se les pasa por un módulo dinámico (`forRoot(bus)`). La API avisa al
  relay en el proceso y el relay publica al bus que lee la pasarela de Socket.IO.
- `main.ts` y `worker.ts` siguen existiendo sin cambios: son el modo `escalado`.

### 1.2 Las colas sobre Postgres

| Puerto | Adaptador nuevo | Fuente de verdad | Concurrencia |
|---|---|---|---|
| `PuertoColaDeChanges` | `ColaDeChangesEnProceso`: despacha `ProcesarChange` en el proceso, con 5 intentos y espera exponencial en memoria y como mucho N a la vez | El staging, `PENDIENTE`. **No hace falta tabla nueva** | Un `Set` de identificadores en curso evita duplicados dentro del proceso |
| `PuertoReencolador` y `PuertoCoordinacionDelBarrido` | `BarridoEnProceso`: `enCola` mira el `Set`; `adquirirTurno` usa `pg_try_advisory_xact_lock` dentro de la transacción del barrido | `intentos_barrido`, que ya existe | El candado de transacción funciona a través del *pooler* de Neon en modo transacción |
| `PuertoColaDeEnvios` | `ColaDeEnviosPostgres`: despacha en el proceso y deja el estado del intento en la fila del mensaje | `mensajes`: `PENDIENTE`, sin `wamid` | **`FOR UPDATE SKIP LOCKED`** para reclamar, por agencia y bajo RLS, más un arrendamiento (`envio_siguiente_en = now() + 2 min`) que se confirma **antes** de llamar a Meta. Nunca hay red dentro de una transacción |
| `PuertoReservaDeEnvio` | `ReservaDeEnvioPostgres`: `UPDATE mensajes SET envio_reservado_en = now() WHERE tenant_id = $1 AND id = $2 AND envio_reservado_en IS NULL AND wamid IS NULL RETURNING id` | Columna en `mensajes` | Atómica entre procesos. **Es más fuerte que el `SET NX`**: es durable y no caduca a los 7 días |
| `PuertoColaDeCorreo` | `ColaDeCorreoEnProceso`: reintentos con espera, deduplica por clave y **no es durable** | — | Ver 3.4 |
| Limitador de OTP | `LimitadorDeEnviosEnMemoria`, que ya existe | — | Un solo proceso: el contador es exacto |
| Bus y aviso | En memoria y compartidos (1.1) | El outbox | — |

**Por qué no hay tabla de trabajos genérica.** Cada cola guarda su estado en la fila de negocio que
ya existe, que ya tiene `tenant_id` y RLS. Una tabla `trabajos` común necesitaría `tenant_id` nulo
para el correo previo a la agencia, y por tanto una entrada en `excepciones_rls` (R1). Además
duplicaría un estado que ya está en la base.

**Por qué los changes no llevan `SKIP LOCKED`.** El staging solo se lee con funciones
`SECURITY DEFINER` (`tomar_recepcion`, `listar_changes_pendientes`). Reclamar con `SKIP LOCKED`
exigiría una **novena** función, con su auditoría. Con un solo proceso no hace falta: el `Set` evita
duplicados dentro del proceso y el procesamiento es idempotente, porque la unicidad
`(tenant_id, wamid)` y el `FOR UPDATE` de `anular_payload` lo protegen. **`qa` tiene que demostrarlo**
con dos `ProcesarChange` concurrentes sobre el mismo change, porque el solape de dos máquinas durante
un despliegue es real (paso 6). La función con `SKIP LOCKED` se escribe en cuanto haya dos
instancias, y para entonces ya habrá Redis (§8).

### 1.3 Cuándo se procesa: en el momento, y un barrido lento de seguridad

- **El camino normal no espera a ningún barrido.** El webhook guarda y despacha en el proceso. La API
  escribe en el outbox, avisa en el proceso, el relay vacía el outbox y despacha el envío.
- **El barrido de seguridad** reúne changes pendientes, outbox, envíos sin resolver y arrendamientos
  vencidos. Corre **una vez al arrancar** (recupera lo que dejó un reinicio) y después cada
  **60 minutos** (`BARRIDO_INTERVALO_MS=3600000`, dentro del rango que ya admite la configuración).
  `BARRIDO_ANTIGUEDAD_S` y el barrido del relay se alinean a ese mismo ciclo, y el relay deja de barrer
  cada 15 s en modo `unico`.
- **Por qué 60 minutos.** El plan Free de Neon suspende el cómputo tras **5 minutos** de inactividad, y
  eso no se puede desactivar (neon.com/pricing, consultado el 2026-11-04). Todo barrido con un periodo
  T mayor de 5 minutos despierta la base unos 5 minutos, así que la mantiene despierta una fracción
  5/T del tiempo. Con T = 60 son unas **39 h al mes fuera de horario, unas 10 CU-h** a 0,25 CU. Con
  T = 30 s nunca se duerme. El costo de esta cadencia: algo que se pierde por un fallo raro se recupera
  en ≤ 60 min. Lo normal, que es un reintento corto, se resuelve en memoria en segundos.
- **No verificado:** si una conexión abierta e inactiva del pool de Prisma impide que Neon se
  suspenda. La documentación de *scale to zero* no lo define. `devops` lo mide en la consola de Neon
  antes de dar por buena la cifra (paso 8). Si la impide, se fija un tiempo de inactividad del pool
  por debajo de 5 minutos.
- **Los chequeos de salud tampoco deben despertar la base:** la sonda de Fly y el monitor externo usan
  `/salud`, que no toca la base. `/salud/listo` se consulta como mucho una vez por hora (§5).

## 2. Qué queda superado y qué sigue vigente

### ADR-0010

| Punto | Estado |
|---|---|
| Parte 1 entera (1.1 a 1.5): lo que es el webhook, inventario de funciones y retención | **Sigue.** La fila 8 (`jobId` de BullMQ) describe el modo `escalado`; en modo `unico` la identidad del trabajo es `(recepcion_id, indice)` en el staging |
| §1.3, tabla de roles | **Sigue**, con la precisión de 3.3: en modo `unico`, «proceso» se lee como «pool del contexto» |
| §1.3, «**Condición para el primer despliegue**: cada proceso recibe solo su propia cadena» | **Superada en modo `unico`.** La sustituyen las condiciones de 3.3. Vuelve a regir en modo `escalado` |
| Parte 2, opción C («juntarlo con la API en un solo proceso», descartada) | **Superada:** se adopta en modo `unico`, con las condiciones de 1.1 y 3.3 |
| Parte 2, condición 1 (`AppModule` no importa `InboxWorkerModule` ni construye `PrismaWebhookService`) | **Sigue**, y se refuerza con dos contextos de inyección |
| Parte 2, condición 2 («proceso con su propio arranque y su propio entorno») | **Superada en modo `unico`** |
| Parte 2, criterio de salida hacia `apps/worker` | **Superado.** Lo sustituyen los disparadores de §8. Nota honesta: ese criterio ya no se cumplía, porque los consumidores de envíos y de correo nacieron en `apps/api` |
| Riesgos abiertos (contacto saneado, particiones, `purgar_directorio`…) | **Siguen**, salvo «relay de barrido», que ya existe (`barrer-pendientes.ts`) |

### ADR-0013

| Punto | Estado |
|---|---|
| Decisión A (Render, cuatro servicios por entorno) y Topología | **Superadas** para producción pequeña (§4) |
| Subdecisión 1: dominio y cookie (`app.`, `api.app.`, `Domain=app.<dominio>`, nunca dominios de plataforma) | **Sigue**, y se extiende: nunca `*.fly.dev` |
| Subdecisión 2: URL del webhook | **Sigue** |
| Subdecisión 3: Redis | **Superada en modo `unico`** |
| Subdecisión 4: secretos por servicio | **Sigue**, con dos cambios: las columnas API y Trabajador se funden en una sola (3.3) y `REDIS_URL` desaparece. Sigue en pie que ningún servicio tenga el rol propietario |
| Subdecisión 5: aserción de rol al arrancar | **Sigue**, por pool (3.3) |
| Subdecisión 6: migraciones desde GitHub Actions, solo `main`, el SHA es ancestro de `origin/main`, migrar antes de desplegar | **Sigue** sin cambios |
| Subdecisión 7: despliegue automático apagado y Environment con aprobación | **Sigue.** El *deploy hook* de Render pasa a ser un token de despliegue limitado a la app (§5) |
| Subdecisión 8: arranque del trabajador sin `tsx` | **Superada en modo `unico`** (`node dist/main-unico.js`) |
| Fuerza «el cómputo va junto a la base» | **Sigue como criterio.** Ver 4.2 |
| Tabla de costos | **Superada** por §4 |
| `render.yaml` | Este ADR no lo toca. Queda como referencia del modo `escalado`; `devops` lo retira o lo conserva en el paso 8 |

### ADR-0018 (Propuesto)

§3.2 pasa del `SET NX` en Redis a `mensajes.envio_reservado_en`, la columna que el propio ADR-0018
recomendaba en «El esquema». La semántica no cambia: una reserva existente **nunca** se reenvía y el
mensaje se marca `FALLIDO` «sin confirmar».

## 3. Garantías que no se pierden

1. **R5, idempotencia.** Cada cola conserva su clave: el change por `(recepcion_id, indice)`, el envío
   por `mensajeId` y el correo por su clave de idempotencia. Lo que entra dos veces no produce dos
   efectos, porque la unicidad vive en la base y no en la cola.
2. **Un mensaje jamás sale dos veces hacia Meta.** Se conservan las tres capas de ADR-0018: el
   mensaje (`wamid` o estado distinto de `PENDIENTE` → no se hace nada), la **reserva**, ahora
   **durable** en la fila, y el `wamid`. Si el proceso muere entre la reserva y la respuesta de Meta,
   el barrido encuentra «reservado sin `wamid`», **no reenvía** y marca `FALLIDO` «sin confirmar».
   Si Meta lo había aceptado, el webhook de estado lo corrige.
3. **Durabilidad de un change recibido.** El 200 a Meta sale después de `registrar_recepcion`, igual
   que hoy. Si el proceso muere antes de procesarlo, el barrido del arranque lo recupera. Si muere
   antes del 200, Meta reintenta. La duración exacta de los reintentos de Meta está **NO VERIFICADA**
   en este ADR.
4. **Correo (la excepción declarada).** OTP e invitaciones salen con reintentos y deduplicación, pero
   **un reinicio del proceso pierde el correo que estaba esperando reintento**. Se acepta porque los
   dos se piden de nuevo con un clic, y el OTP caduca en minutos de todas formas. A cambio, un secreto
   deja de vivir fuera de la base. Si el propietario no lo acepta, la alternativa es una tabla
   `correo_saliente` sellada, global y sin `tenant_id`. Eso exige una entrada en `excepciones_rls` y
   editar el literal de `aislamiento.spec.ts` (R1), con auditoría.
5. **R1 intacta.** No hay tabla nueva sin `tenant_id`. Las columnas nuevas van en `mensajes`, que ya
   tiene RLS. El reclamo de envíos se hace por agencia y bajo RLS (`conTenantResuelto`), igual que el
   relay.
6. **R2: varios roles en un proceso.** Es el punto delicado, y aquí va su análisis:
   - **Se mantiene:** los cuatro pools (`viajapro_app`, `viajapro_altas`, `viajapro_identidad`,
     `viajapro_webhook`) y la aserción de identidad de **cada pool** al arrancar (`guardia-de-rol.ts`).
     Si cualquiera falla, el proceso aborta. Ningún pool salta RLS y ninguno es el propietario.
     `viajapro_identidad` sigue sin privilegios de negocio. **Lo que protege contra el error de
     configuración, que es el riesgo que motivó la guardia, queda intacto.**
   - **Se pierde:** la separación por entorno ante un **compromiso del proceso** (ejecución remota de
     código). Hoy, quien compromete la API obtiene `viajapro_app`, `viajapro_altas` y
     `WEBHOOK_PAYLOAD_KEY`. Con un solo proceso obtiene además `viajapro_webhook`
     (`tomar_recepcion`, `resolver_enrutamiento`) y `WHATSAPP_DIRECTORY_PEPPER`.
   - **Cuánto vale lo que se pierde.** Con ejecución remota, `viajapro_app` ya puede fijar la variable
     de tenant y leer cualquier agencia, y `viajapro_altas`, que es la función más peligrosa
     (`registrar_enrutamiento`), ya vive en la API. Lo que se añade es el staging de todas las agencias
     (cifrado, pero con la clave en el mismo proceso, igual que hoy) y la pimienta del directorio. El
     daño marginal es **acotado, pero no es cero**. **Decide `auditor-seguridad`.**
   - **Condiciones**, que son invariantes y no intenciones:
     (a) dos contextos de inyección (1.1), comprobados por la compuerta `fronteras-entre-modulos`;
     (b) `PrismaWebhookService` solo se construye en el contexto del trabajador;
     (c) ningún endpoint HTTP alcanza las funciones del staging;
     (d) en modo `escalado`, la separación por proceso de ADR-0010 §1.3 vuelve a ser obligatoria.
   - **Alternativa** si el auditor no acepta: **dos procesos en la misma máquina**, cada uno con su
     entorno y su usuario del sistema operativo. El costo de cómputo es el mismo (unos 150 MB más), pero
     reabre el problema del bus entre procesos (`LISTEN/NOTIFY`), que necesita una conexión directa sin
     *pooler*. No está verificado si esa conexión impide que Neon se suspenda.
   - `CLAUDE.md` R2 dice «cada proceso aborta al arrancar si no es el rol que esperaba ser». En modo
     `unico` eso se cumple **por pool**. Corregir la redacción le toca al propietario, no a este agente.

## 4. Host: fiabilidad primero, dentro del presupuesto mínimo

Precios consultados el **2026-11-04** en docs.fly.io/about/pricing, neon.com/pricing,
neon.com/docs/introduction/plans y la página de Always Free de Oracle.

### 4.1 Candidatos

**A — Fly.io, dos máquinas siempre encendidas (recomendada para producción).**
- **Qué es:** web en `shared-cpu-1x` de 512 MB (USD 3,69/mes) y API en modo `unico` en `shared-cpu-1x`
  de 1 GB (USD 6,70). IPv4 compartida e IPv6 sin costo, los 10 primeros certificados gratis y salida
  en Norteamérica a USD 0,02/GB. **No tiene capa gratuita**: la prueba es de USD 1 durante 7 días.
- **Gana:** máquinas que no se recuperan por inactividad, reinicio automático ante una caída,
  despliegue por imagen Docker (las dos que ya existen) y secretos cifrados por app.
- **Cuesta:** unos USD 10,4/mes de cómputo. **No tiene región en Ohio** (ADR-0013); la más cercana es
  `iad` (Ashburn).
- **Cierra:** nada. Son contenedores estándar.

**B — Oracle Cloud Always Free (para ensayo o staging, no para producción).**
- **Qué es:** A1 Arm con **2 OCPU y 12 GB en total**, 200 GB de bloque y 10 TB de salida al mes.
  Ojo: ADR-0013 y la memoria común hablaban de 4 y 24; la página oficial dice hoy 2 y 12.
- **Gana:** USD 0.
- **Cuesta:** la página oficial dice que **«Idle Always Free compute instances may be reclaimed by
  Oracle»** cuando, durante 7 días, el percentil 95 de CPU, la red y (en A1) la memoria quedan por
  debajo del 20 %. **Una agencia pequeña con tráfico bajo cumple las tres condiciones.** Además el
  sistema operativo, TLS, Docker y los parches corren a nuestro cargo, sin nadie de guardia, y la
  capacidad A1 suele agotarse en las regiones populares (**NO VERIFICADO**).
- **Mitigaciones evaluadas:** pasar la cuenta a *Pay As You Go* (que la recuperación no aplique allí
  está **NO VERIFICADO**), dimensionar la instancia pequeña para superar el 20 % de memoria (la CPU
  seguiría por debajo) o meter carga artificial (frágil, y va contra el espíritu de la oferta).
  **Ninguna convierte una máquina que se puede recuperar sin aviso en producción fiable.**
- **Uso propuesto:** staging o ensayo gratuito, reconstruible por script, con Neon Free en un proyecto
  aparte.

**C — Render, la situación actual (ADR-0013).** Unos USD 51/mes solo por staging y 195–230 con
producción. El precio lo explican sobre todo los cuatro servicios por entorno y el Key Value. Se
descarta para esta etapa por costo, no por calidad.

**D — Una sola máquina Fly de 1 GB con web y API dentro (palanca, no se elige hoy).** Ahorra USD 3,69,
pero exige una imagen nueva con supervisor y acopla los reinicios y la memoria del SSR con los del
webhook. Se activa solo si el costo aprieta más que la fiabilidad.

### 4.2 Base de datos y región

- **Neon Free:** 100 CU-h por proyecto, 1 GB de almacenamiento, *scale to zero* fijo a 5 min,
  **restauración instantánea de 6 h** (hasta 1 GB de cambios), 1 instantánea manual y **sin respaldos
  programados**. Sirve hasta que entren datos reales.
- **Neon Launch:** USD 0,106/CU-h, USD 0,35/GB-mes, **restauración hasta 7 días** a USD 0,20/GB-mes,
  100 instantáneas manuales y **sin mínimo mensual**. **Es el plan para datos reales**: una ventana de
  restauración de 6 h no es fiabilidad.
- **Región.** Neon no permite cambiar la región de un proyecto, y hoy está en `aws-us-east-2` (Ohio).
  Neon ofrece `aws-us-east-1` (Virginia), junto a Fly `iad`. **Como todavía no hay datos reales,
  recrear el proyecto en `us-east-1` cuesta poco hoy y mucho después.** Así se cumple la fuerza de
  ADR-0013: cómputo junto a la base. Si se mantiene Ohio con Fly `iad`, cada consulta paga unos ms
  más por ida y vuelta (**NO MEDIDO**), multiplicados por las consultas en serie de cada caso de uso.
  La documentación actual de Neon lista también São Paulo, que es uno de los disparadores de revisión
  de ADR-0013. Se evalúa aparte, porque Fly tiene `gru` (**NO VERIFICADO**).

### 4.3 Costo mensual (USD)

| Partida | Actual: Render staging | Render staging + producción | **A: Fly + Neon Launch (recomendada)** | Fly + Neon Free (antes de datos reales) | B: Oracle + Neon Free |
|---|---|---|---|---|---|
| Cómputo | 21 (3 × 7) | 21 + 82 | **10,39** (3,69 + 6,70) | 10,39 | 0 |
| Redis / Key Value | 10 | 10 + 20 | **0** | 0 | 0 |
| Espacio de plataforma | — | 25 | 0 | 0 | 0 |
| Neon | ~20 (despierto) | ~20 + 40–60 | **~6–9** (50–80 CU-h × 0,106 + 0,35 de almacenamiento + historial) | 0 (cabe en 100 CU-h, con margen fino) | 0 |
| Dominio | — | — | ~1 (**NO VERIFICADO**, ~10–15/año) | ~1 | ~1 |
| **Total** | **~51** | **~195–230** | **~18–21** | **~11,4** | **~1** |

La estimación de Neon supone 0,25 CU con autoescalado acotado a ≤ 0,5, unas 260 h despierta en horario
laboral (10 h × 26 días) más ~39 h de barridos fuera de horario. Es una estimación, **no una
medida**. Fuera de la tabla quedan Postmark (su capa gratuita está **NO VERIFICADA**), el
almacenamiento de objetos (S3 sigue pendiente desde ADR-0013) y la IA.

### 4.4 Economía por agencia (costo fijo ÷ N agencias pequeñas activas)

| Host | Total/mes | N = 1 | N = 3 | N = 10 |
|---|---|---|---|---|
| Render staging + producción (ADR-0013) | 195–230 | 195–230 | 65–77 | 19,5–23 |
| Render solo staging (hoy, sin producción) | 51 | 51 | 17 | 5,1 |
| **Fly + Neon Launch** | 18–21 (1 agencia) / ~25–30 (10 agencias, **estimado**: más horas despierta y 0,5 CU) | **18–21** | **~6–7** | **~2,5–3** |
| Fly + Neon Free | ~11,4 | 11,4 | 3,8 | no cabe: 10 agencias superan las 100 CU-h o 1 GB (**estimado**) |
| Oracle + Neon Free | ~1 | 1 | 0,33 | 0,1 (y no es producción) |

**Lectura:** con la opción A, **una sola agencia que pague unos USD 21 al mes cubre la
infraestructura**. Desde la tercera, la infraestructura cuesta menos de USD 7 por agencia. El precio
del producto no lo decide este ADR: le toca a `jefe-de-producto`.

### 4.5 La web en el mismo host

`apps/web` necesita un servidor Node, por dos razones: el `middleware.ts` genera un *nonce* de CSP por
petición y hay páginas con `force-dynamic`. No se puede servir como estática. Va en Fly, como **app
propia en su máquina de 512 MB**, con la imagen `apps/web/Dockerfile`. Solo lleva `NEXT_PUBLIC_API_URL`
y la URL interna de la API (red privada de Fly, `.internal`). Los dominios siguen ADR-0013 §1:
`app.<dominio>` para la web y `api.app.<dominio>` para la API, Socket.IO y el webhook.

## 5. Lo que lo hace usable de verdad

- **Dominio y TLS.** Hace falta un dominio propio; no se usan nunca los dominios de plataforma
  (cookie, ADR-0013 §1). Certificados de Fly por nombre de host, los 10 primeros gratis.
- **Secretos (R6).** `fly secrets` por app. La matriz de ADR-0013 §4 se mantiene con las columnas API y
  Trabajador fundidas y sin `REDIS_URL`. La web no recibe ningún secreto. El rol propietario vive solo
  en el Environment de GitHub. Los secretos se generan en la máquina del propietario y **nunca pasan
  por el chat**.
- **Pipeline.** Se conserva la compuerta de ADR-0013 §6 y §7: el job se niega a correr si `github.ref`
  no es `main` o si el SHA no es ancestro de `origin/main`; después hace `prisma migrate deploy` con el
  rol propietario (migraciones de expansión, compatibles con el código anterior) y luego
  `flyctl deploy` de web y API, verificando `/salud`. El token de Fly es un **token de despliegue
  limitado a la app**, guardado en un Environment con aprobación del propietario (la existencia y el
  alcance de ese tipo de token están **NO VERIFICADOS**: lo confirma `devops`). La estrategia de
  despliegue debe admitir un breve solape de dos máquinas: por eso hacen falta el candado del barrido
  (1.2) y la prueba de concurrencia del paso 6.
- **Respaldos y restauración.** Primario: la restauración instantánea de Neon Launch, 7 días, con
  pérdida de datos (RPO) de segundos. Secundario: un volcado lógico semanal **cifrado con clave
  pública antes de salir** y guardado fuera de Neon. **Nunca como artefacto de Actions: el repositorio
  es público.** El destino del volcado es tarea en cola de `devops`. **Restauración probada:** antes
  de la primera agencia y después una vez al mes, se restaura a una rama de un instante dado, se
  apunta una copia de la API y se pasa la prueba de humo.
- **Alertas y salud.** Sonda de Fly sobre `/salud` (sin base) con reinicio automático. Monitor externo
  sobre `https://api.app.<dominio>/salud` cada 5 min, con aviso por correo o teléfono; la herramienta
  y su precio están **NO VERIFICADOS**. Una vez por hora, alineado con el barrido, `/salud/listo` y un
  conteo sin PII de lo abandonado o pendiente de más de una hora. El registro de «change abandonado
  por el barrido» y de «envío sin confirmar» también dispara aviso.
- **Tiempo de recuperación esperado.** Si el proceso cae, Fly lo reinicia en segundos y el barrido
  del arranque recupera lo pendiente. Si cae el host, se redespliega a mano en unos 15–30 minutos
  después de la alerta, sin pérdida: lo pendiente está en Postgres y Meta reintenta. Si se corrompen
  datos, se restaura a un instante en menos de una hora. **Objetivo: recuperación en ≤ 1 h en horario
  laboral, sin pérdida de mensajes ni de envíos.** No es alta disponibilidad, y queda dicho.
- **Runbook** (`docs/07-ingenieria/`, paso 9): desplegar; volver a la imagen anterior; restaurar la
  base a un instante; rotar un secreto; máquina caída; webhook de Meta que no llega; cola atascada
  (abandonados y «sin confirmar»); cambio de modo a `escalado`.

## 6. La puerta de datos reales (roadmap §2)

No se la salta nadie. El estado **hoy**, según el código leído y `ESTADO.md` del 2026-10-28:

| | Criterio | Estado hoy | Qué cambia con este ADR |
|---|---|---|---|
| C1 | 100 % de mutantes RLS muertos | **Abierto** según el roadmap («falta el 100 %»). No se corrió la suite para este ADR | Nada |
| C2 | Cero PII en claro | **Abierto:** no hay migración que cifre `mensajes.texto` (ADR-0014 aceptado, sin implementar) | Nada |
| C3 | Meta y Postmark reales | **Abierto:** recepción probada con la app de prueba por un túnel temporal; Postmark sin cuenta | **Se cierra en el entregable 1** |
| C4 | Protección de `main` | **En verde** (`ESTADO.md`: protección de servidor con los 8 checks) | — |
| C5 | Supresión en base, colas y caché | **Abierto:** no existe el servicio de supresión | **Se acorta:** sin Redis, las colas y la caché son filas de Postgres o memoria efímera. La prueba de «cero rastros» se reduce a Postgres (y a los registros) |

**Orden:** primero el entregable 1, que cierra C3. Después C2, porque el ADR ya está aceptado y es lo
que más pesa. Luego C5, que con este ADR sale más barato, y por último C1. **Hasta que C1, C2 y C5
estén en verde, el entregable 1 opera con el número de prueba de Meta y correos internos.** El número
real de la agencia y los datos de viajeros entran cuando la puerta esté en verde.

## 7. Plan de trabajo

**Entregable 1: el sistema completo corriendo en la nube en un solo proceso sin Redis, con Meta y
Postmark reales, usable por una agencia piloto** (con la restricción de datos de §6). Las
estimaciones son en días de agente.

| # | Paso | Dueño | Estimación | Ruta protegida |
|---|---|---|---|---|
| 0 | Revisión de §3.3 y §3.4, más la aprobación del ADR | `auditor-seguridad`, propietario | 0,5 | ADR |
| 1 | `main-unico.ts`: dos contextos de Nest, bus y aviso compartidos, `MODO_DESPLIEGUE=unico\|escalado` sin respaldo silencioso | `backend` | 1 | — |
| 2 | Adaptadores en proceso: `ColaDeChangesEnProceso`, `BarridoEnProceso` (candado de transacción), `ColaDeCorreoEnProceso` con reintentos; limitador en memoria | `backend` | 1–1,5 | — |
| 3 | Migración de expansión en `mensajes`: `envio_reservado_en`, `envio_intentos`, `envio_siguiente_en` e índice parcial de pendientes salientes. Sin tablas nuevas y con RLS intacta | `datos` | 0,5 | **Sí** |
| 4 | `ColaDeEnviosPostgres` (`SKIP LOCKED` y arrendamiento) y `ReservaDeEnvioPostgres` | `backend` | 1–1,5 | — |
| 5 | Barrido de seguridad unificado (arranque más 60 min); relay sin barrido de 15 s en modo `unico` | `backend` | 0,5 | — |
| 6 | Pruebas: job de CI sin `REDIS_URL`; webhook → conversación; un solo envío con reintento y con el proceso muerto tras la reserva; dos `ProcesarChange` concurrentes; recuperación al arrancar | `qa` | 1–1,5 | `.github/` sí |
| 7 | `docker compose` local: API `unico`, web, Postgres y Mailpit, sin Redis. Es la primera prueba completa antes de la nube | `devops` | 0,5 | `infra/` sí |
| 8 | Fly: dos apps, `fly.toml`, secretos, dominio y TLS, workflow de despliegue con la compuerta del ancestro, monitor externo; medir que Neon se suspende | `devops` | 1–1,5 | Sí |
| 9 | Restauración probada y runbook | `devops`, `qa` | 0,5 | — |
| 10 | Webhook de Meta hacia la nueva URL y Postmark real (C3) | `whatsapp`, `backend` | 0,5 | — |

**Total: unos 8–10 días de agente.** El orden es 1 → 2 → 3 ∥ 4 → 5 → 6 → 7 → 8 → 9 → 10. Los pasos 1 a
7 no dependen de ninguna cuenta. Después vienen C2, C5 y C1 (§6), que tienen sus propios dueños en el
roadmap.

**Del propietario:** comprar el dominio; crear la cuenta de Fly; decidir si se recrea Neon en
`us-east-1` y pasar a Launch cuando entren datos reales; cuentas de Postmark y Meta; generar los
secretos.

## 8. Mínimo suficiente y disparadores para robustecer

**Mínimo suficiente:** un proceso API `unico` siempre encendido, una máquina para la web, Neon Launch
desde el primer dato real, restauración de 7 días probada, monitor externo, runbook y la puerta C1–C5.

| Se pospone | Disparador (el primero que ocurra) | Qué se hace |
|---|---|---|
| Redis y BullMQ (modo `escalado`) | Hace falta **una segunda instancia** de la API (CPU con p95 > 70 % o memoria > 80 % sostenidas una semana); **más de 300 changes o envíos por minuto** sostenidos; un p95 de recepción → bandeja **> 5 s** durante un día; **más de 25 agencias activas** | Se reactivan los adaptadores de BullMQ y el bus por Redis, que ya existen. Las columnas de la reserva se quedan |
| Trabajador en proceso aparte | El trabajo asíncrono sube el p95 de la API por encima de 500 ms; llega la IA o los envíos masivos; o lo exige `auditor-seguridad` por §3.3 | Se separa `worker.ts` con su entorno, como en ADR-0010 §1.3 |
| Correo durable | Hay una queja real de un correo perdido, o el correo pasa a llevar algo que no se puede volver a pedir | Tabla sellada en `excepciones_rls`, con auditoría |
| Segunda máquina (alta disponibilidad) | Una agencia paga un acuerdo de nivel de servicio, o hay **10 agencias pagando** | Requiere antes Redis (bus entre instancias) |
| Neon de más capacidad | Más de 0,5 CU sostenidos, o una latencia de consulta que moleste | Ajustar el autoescalado. El plan ya es de pago |
| Staging de pago | Hay dos o más personas desplegando a la vez, o cambios de esquema arriesgados | Staging en Fly con Neon en una rama *schema-only* |

## Consecuencias

### Positivas
- La infraestructura baja de ~51 (solo staging) o ~195–230 (con producción) a **~18–21 USD al mes en
  producción**, y una sola agencia la cubre.
- **La reserva de envío deja de vivir en Redis y gana durabilidad.** «Nunca dos veces a Meta» deja de
  depender de un TTL de 7 días.
- Ningún secreto vive fuera de Postgres o de la memoria, y C5 se acorta.
- Un reinicio no pierde trabajo de WhatsApp: todo está en Postgres y el barrido del arranque lo
  recoge.
- Los puertos no cambian; volver a Redis es configuración y no reescritura.

### Negativas
- **No hay escala horizontal.** Una sola instancia es un punto único de falla, con recuperación de
  ≤ 1 h. No hay alta disponibilidad, y así queda dicho.
- **Se pierde la separación de entorno entre API y trabajador ante una ejecución remota de código**
  (§3.3). Es un costo de aislamiento, aunque acotado, y por eso lo revisa `auditor-seguridad`.
- El correo en vuelo se pierde si el proceso se reinicia (§3.4).
- Algo perdido por un fallo raro se recupera en ≤ 60 minutos y no en 30 segundos.
- El trabajo pesado compite con el webhook en el mismo bucle de eventos. Es justo la razón de ADR-0004
  para separar procesos, y la vigila un disparador.
- Hay dos modos de arranque que mantener, y el CI debe probar los dos.
- Fly no está en Ohio: o se recrea Neon en Virginia o se paga latencia.

### Qué habría que cambiar para revertir esto
- Volver a `MODO_DESPLIEGUE=escalado` con `REDIS_URL`, desplegar `worker.ts` aparte y restituir la
  separación de entornos de ADR-0010 §1.3. Las columnas de `mensajes` se quedan; no hay migración de
  vuelta.

## Cuándo revisar esta decisión
- Cuando se cumpla cualquier disparador de §8.
- Si Neon cambia el plan Free o Launch, o el umbral de *scale to zero*.
- Si Fly cambia sus precios más de un 50 %, o si una caída de host supera 1 h.
- Si `auditor-seguridad` no acepta §3.3: entonces se aplica la alternativa de dos procesos en una
  máquina, y este ADR se supersede en ese punto.

## Alternativas descartadas

- **Mantener Render, todo apagado hasta que haya tráfico.** No sirve para una agencia real: el
  webhook necesita un servicio siempre encendido.
- **Redis gratuito gestionado por comandos (Upstash o similar).** El trabajador de BullMQ sondea Redis
  sin parar y consume cuota aunque no haya tráfico; la persistencia y el desalojo dependen del plan.
  Es el mismo riesgo que ADR-0013 ya descartó, y sin el beneficio de quitar una pieza.
- **Funciones *serverless* y cron (Vercel u otro).** Socket.IO y el proceso continuo ya se descartaron
  en ADR-0013 D; nada ha cambiado.
- **Una tabla genérica de trabajos.** Duplica estado y obliga a una excepción de R1 para el correo
  previo a la agencia (1.2).
- **Barrido cada 30 s con Neon Free.** Nunca deja dormir la base: son unas 180 CU-h al mes a 0,25 CU,
  por encima de las 100 gratuitas, solo en barridos.
- **Oracle Always Free como producción.** Puede recuperar la instancia de una agencia con poco
  tráfico (4.1 B).
