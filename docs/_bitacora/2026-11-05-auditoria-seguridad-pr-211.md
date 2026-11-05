# Auditoría de seguridad del PR #211: modo `unico` sin Redis (ADR-0019, pasos 1, 2 y 5)

- **Fecha:** 2026-11-05
- **Auditor:** `auditor-seguridad`
- **Objeto:** PR #211, rama `a/T-000-modo-unico-sin-redis`, commit `7ee9dd7`. Es una lectura del diff y
  del árbol de la rama: no se ejecutaron servicios, bases de datos ni pruebas.
- **Marco:** ADR-0019 entero (sobre todo §3, puntos 4 y 6, que el propio ADR deja pendientes de esta
  auditoría), ADR-0010 §1.3 y Parte 2, ADR-0008 §1.3 y §4, y ADR-0011. Toca el **aislamiento entre
  agencias**, así que la regla R13 no recorta y caben todas las vueltas que hagan falta. La
  clasificación sigue CLAUDE.md §3.1: **BLOQUEANTE** es lo que hoy está roto o es falso; **COLA** es
  lo que empieza por «el día que…».

Las rutas son relativas a la raíz del repositorio y las líneas, las del commit `7ee9dd7`.

## Veredicto

**Integrable cuando se corrija un bloqueante (B1).** Hoy no encontré ninguna fuga entre agencias. El
diseño de dos contenedores de inyección cumple lo que promete: el contexto HTTP no construye ni
inyecta el pool de `viajapro_webhook`. Pero esa invariante es lo único que reemplaza a la frontera de
proceso, y ninguna compuerta la verifica, aunque el ADR-0019 §3.6(a) afirma que sí. Sobre la decisión
de fondo del §3.6 (varios roles en un proceso), **la acepto** para el entregable 1, con un
disparador escrito para revisarla (C1).

---

## 1. R2: cuatro pools en un proceso con dos contextos de Nest

### Lo comprobado (sin hallazgo)

- **Dos contenedores reales.** `apps/api/src/proceso-unico/arrancar-unico.ts:47-57` crea el trabajador
  con `NestFactory.createApplicationContext(TrabajadorUnicoModule…)` y la API con
  `NestFactory.create(ApiUnicoModule…)`. Cada `NestFactory` tiene su propio `NestContainer`, así que un
  `@Global()` de un contexto no es visible desde el otro.
- **`PrismaWebhookService` solo se registra en el trabajador.** Aparece únicamente en
  `PROVEEDORES_COMUNES_DEL_TRABAJADOR` (`apps/api/src/modules/inbox/inbox-worker-comun.ts:34-35`), que
  solo importan `inbox-worker.module.ts` e `inbox-worker-unico.module.ts:44`. `AppModule`
  (`apps/api/src/app.module.ts:17-28`) no alcanza ninguno de los dos. Hice un `grep` de todo
  `apps/api/src`: fuera de los adaptadores del trabajador, solo lo nombran comentarios
  (`compartido-en-proceso.ts:6`).
- **Lo que cruza de un contexto al otro es `CompartidoDelInbox`**
  (`compartido-en-proceso.ts:17-21`): el bus, los avisos y la cola de changes. Ninguno lleva un pool
  ni un secreto. El bus y los avisos solo transportan `tenantId` y eventos ya validados con Zod
  (`bus-de-eventos.en-memoria.ts:47-51`).
- **Las aserciones de rol de cada pool siguen en pie y no dependen del modo.** `PrismaWebhookService`
  (`shared/prisma/prisma-webhook.service.ts:30-46`), `PrismaService` (`shared/prisma/prisma.service.ts:76`)
  y `PrismaIdentidadService` (`modules/identity/infrastructure/prisma-identidad.service.ts:56`) comparan
  `current_user`, `rolsuper` y `rolbypassrls` en `onModuleInit`. `resolverCadena` no tiene respaldo
  (`guardia-de-rol.ts:91-103`). En `arrancarUnico`, el trabajador se inicializa antes de que exista la
  API (`createApplicationContext` llama a `init()`), y la API antes de escuchar (`listen` llama a
  `init()`). Si falla cualquiera de las dos, el proceso termina con `exit(1)`: lo hacen
  `arrancar-unico.ts:60-63` y `main-unico.ts:33-40`.
  Nota: `viajapro_altas` no tiene hoy un pool en el código. Solo figura en `ROLES_DE_CONEXION`. El
  ADR-0019 §3.6 habla de «cuatro pools», pero hoy son tres. No es un defecto de este PR.
- **El barrido no se adelanta a la aserción.** `PlanificadorDeSeguridad` arranca en
  `onApplicationBootstrap` (`planificador-de-seguridad.ts:48-59`), después de todos los
  `onModuleInit`, incluida la verificación del rol. El relay y el consumidor se conectan en
  `onModuleInit`, pero a esa altura no tienen trabajo: la API todavía no existe y el barrido no ha
  corrido.

### Lo que se alcanza por referencia, no por inyección

`ColaDeChangesEnProceso` guarda en un campo privado (TypeScript, no `#privado`) el cierre que le
entrega el trabajador con `conectar` (`shared/cola-en-proceso/cola-en-proceso.ts:53,76-79`). Ese
cierre lleva a `ProcesarChange` y, de ahí, a `StagingPrisma` y a `PrismaWebhookService`. En el
contexto HTTP, cualquier proveedor puede inyectar `COMPARTIDO_DEL_INBOX`, porque
`CompartidoEnProcesoModule` es `@Global()` (`proceso-unico.module.ts:21-31`). Con eso puede:
(a) llamar a `colaDeChanges.conectar(otroProcesador)` y desviar todos los changes; o (b) recorrer
propiedades privadas hasta el pool. Para cualquiera de las dos hace falta **código** dentro del
proceso. Ninguna entrada HTTP lo permite: el único productor es `RegistrarRecepcion`, que encola
`(recepcionId, indice)`, y `recepcionId` es el SHA-256 del cuerpo firmado por Meta. Es la misma
capacidad que tenía la API en modo `escalado` al escribir en la cola de BullMQ. Va a la cola como
defensa en profundidad (C4).

### Qué gana un atacante con ejecución de código en el proceso

Comparé con `render.yaml:33-126`, que es la matriz de secretos por servicio del modo `escalado`.

| | API en `escalado` | Proceso `unico` |
|---|---|---|
| Datos de negocio de todas las agencias | Sí: `viajapro_app` fija `app.current_tenant` a cualquier agencia | Igual |
| Falsificar sesiones | Sí: `BETTER_AUTH_SECRET` | Igual |
| `WEBHOOK_PAYLOAD_KEY` | Sí (la actual) | Además `WEBHOOK_PAYLOAD_KEY_PREVIOUS` |
| Staging de todas las agencias (`tomar_recepcion`, `resolver_enrutamiento`) | No | **Sí**, por `viajapro_webhook` |
| `WHATSAPP_DIRECTORY_PEPPER` | No | **Sí** |
| `POSTMARK_SERVER_TOKEN` | No. Podía encolar correo en Redis con `CORREO_PAYLOAD_KEY`, y el trabajador lo enviaba | **Sí**: el token en crudo, usable fuera del sistema hasta que se rote |
| `META_SYSTEM_USER_TOKEN` | No. Podía crear mensajes `PENDIENTE` y el trabajador los enviaba, pero sujetos a la ventana de 24 h, al consentimiento y al canal activo (`enviar-mensaje-saliente.ts`) | **Sí**: el token en crudo, sin las comprobaciones de dominio |

**Lectura honesta.** La frontera de proceso protegía **credenciales**, no datos. En cuanto a datos de
agencias, el daño marginal es casi nulo: con ejecución de código en la API ya se leía y escribía todo.
Lo que se añade es la exfiltración de dos tokens de terceros (prioridad 2 de este agente). El
ADR-0019 §3.6 enumera el `viajapro_webhook` y la pimienta, pero **omite `POSTMARK_SERVER_TOKEN` y
`META_SYSTEM_USER_TOKEN`** (C2). Hoy el token de Meta solo sirve para el número de prueba: lo
garantiza `crearCredencialesWhatsapp`, que solo construye `CredencialesDePrueba`
(`crear-envio-whatsapp.ts:29-41`). Por eso hoy el daño está acotado. El día que entren tokens reales
por agencia (Embedded Signup) o un token de *system user* de proveedor tecnológico con acceso a
varias WABA, el daño deja de ser acotado.

**La alternativa: dos procesos en la misma máquina, con usuarios del sistema operativo distintos.**
Sí protege los tokens: el entorno y la memoria de un proceso (`/proc/<pid>/environ`, `ptrace`) quedan
vedados al otro usuario. A cambio, exige un supervisor en la imagen, un bus entre procesos
(`LISTEN/NOTIFY` con una conexión sin *pooler*, cuyo efecto sobre la suspensión de Neon no está
verificado) y que el contenedor no corra como root. Hoy compraría protección para un token de prueba
y un token de Postmark.

**Veredicto sobre §3.6:** **aceptado para el entregable 1**, con las condiciones (a) a (d) del ADR,
la corrección B1 y el disparador C1.

## 2. Colas y barrido en proceso

- **No mezclan agencias.** La cola de changes transporta `{recepcionId, indice}`
  (`cola-de-changes.en-proceso.ts:24-27`). El tenant lo resuelve **cada trabajo** desde el
  directorio (`procesar-change.ts`, `resolverRuta`) y lo fija con `conTenantResuelto`, que valida que
  sea un UUID, aplica `set_config` local a la transacción y lo relee antes de escribir
  (`prisma-webhook.service.ts:59-72`). La cola de envíos lleva `{tenantId, mensajeId}`, que el relay
  sacó de su `vaciar(tenantId)` bajo RLS (`outbox.prisma.ts:30-37`). Ningún adaptador del trabajador
  lee `ContextoTenant`: lo comprobé por `grep` en `bandeja`, `mensajes-salientes`, `outbox`,
  `pendientes`, `staging` y `puertos-de-crm`.
- **Una excepción no contamina al trabajo siguiente.** `correr` atrapa todo
  (`cola-en-proceso.ts:147-166`). El único estado compartido entre trabajos son `vivas`, `reintentos`
  y `recordadas`, y ninguno lleva tenant. El tenant de la base vive en una variable **local a la
  transacción**, así que la conexión vuelve limpia al pool aunque la transacción aborte.
- **El contexto asíncrono sí se hereda.** `bombear` arranca el trabajo en el contexto de quien llama:
  el `encolar`, o el `.finally` del trabajo anterior (`cola-en-proceso.ts:133-145`). El trabajo hereda
  el `AsyncLocalStorage` de ese llamador. Hoy no hace daño: los productores de changes y envíos
  (webhook, relay y barrido) no tienen tenant, y el procesador de correo no lee el contexto. Pero el
  motor es genérico y lo reutilizará el paso 4. Va a la cola como C3.
- **El candado asesor** (`barrido.en-proceso.ts:50-66`) es de transacción
  (`pg_try_advisory_xact_lock`), con una clave constante y global que no lleva datos. No puede filtrar
  nada entre agencias, porque solo decide **quién barre**, y el barrido trabaja con funciones
  `SECURITY DEFINER` que ya son globales. No bloquea indefinidamente: se suelta al terminar la
  transacción, y la transacción tiene un `timeout` igual al mayor entre 5 s y el intervalo, es decir,
  **hasta 1 h** con el intervalo por defecto (línea 58). Mientras dura, ocupa una conexión del pool de
  `viajapro_webhook`, y la tarea usa otras. Con `connection_limit=1` la tarea esperaría a la conexión
  retenida hasta el `pool_timeout`, y el barrido fallaría siempre (C8). Con ejecución de código, un
  atacante podría tomar el mismo candado desde `viajapro_app` y dejar sin barrido: es solo una
  denegación de servicio.

## 3. Idempotencia y no duplicación (R5)

- **Changes.** Una clave por `(recepcion_id, indice)` mientras el trabajo está vivo, más
  `YA_RESUELTO` y la unicidad `(tenant_id, wamid)` en la base. Dentro del proceso no puede haber un
  efecto doble. Entre dos máquinas sí hay un procesamiento doble real: durante el solape de un
  despliegue, el barrido del arranque usa `antiguedadMinimaS: 0` (`planificador-de-seguridad.ts:72`)
  y vuelve a encolar changes que la máquina vieja tiene en curso. `tomar_recepcion` no bloquea la fila
  (migración `20261007120300_directorio_de_enrutamiento_y_staging`). La corrección depende de la
  unicidad, y la prueba de dos `ProcesarChange` concurrentes es del paso 6 (`qa`). No cruza agencias,
  porque el tenant sale del directorio (C6).
- **Envíos, TEMPORAL-PASO-4.** `ReservaDeEnvioEnMemoriaTemporal`
  (`cola-de-envios.en-memoria-temporal.ts:77-90`) **no es durable**. Además, el relay encola **dentro**
  de la transacción del outbox (`relevar-outbox.ts:44`, `outbox.prisma.ts:30-55`) y la cola en memoria
  despacha en el acto, de modo que la llamada a Meta puede terminar antes del `COMMIT` que marca el
  evento como publicado. Si el proceso muere en ese hueco, al reiniciar el outbox sigue pendiente, la
  reserva se olvidó y **el mensaje sale dos veces**. Lo mismo pasa con dos máquinas en solape (cada
  una con su reserva). Hoy no es bloqueante, porque solo existen credenciales del número de prueba
  (`crear-envio-whatsapp.ts:29-41`) y el ADR-0019 §6 restringe el entregable 1 a ese número. El
  archivo lo declara. Va a la cola con una condición dura (C5). También se pierde lo que esperaba
  reintento: el mensaje queda `PENDIENTE` sin barrido de envíos hasta el paso 4.
- **Correo.** Se deduplica por clave mientras vive y durante 15 min después de terminar bien
  (`cola-de-correo.en-proceso.ts:27,50`). Las claves las genera el servidor (`otp-<uuid>` y
  `claveDeCorreoDeInvitacion(hash)`), así que un cliente no puede provocar una colisión para suprimir
  el correo de otro.

## 4. R10 y registros

No encontré texto de mensajes, teléfonos, correos, tokens ni OTP en los registros nuevos. Los
ganchos registran el prefijo de la clave, el número de intento y la clase o código del error
(`compartido-en-proceso.ts:38-46`, `inbox-worker-unico.module.ts:67-72`,
`cola-de-correo.en-proceso.ts:51-59`). Los prefijos son un hash (`recepcion_id`), `envio-<uuid>` u
`otp-`/`invitaci…`. El motor no registra nada (`cola-en-proceso.ts:11-12`). `main-unico.ts:35-38`
registra el `stack` de un fallo de arranque, igual que `main.ts`. Los mensajes de la guardia de rol
nombran roles, no cadenas de conexión.
Un defecto menor sin impacto de seguridad: `codigoSeguro` recibe un `ErrorDeTrabajo` ya saneado, que
lleva `codigo` y no `code`, así que solo registra «ErrorDeTrabajo» y pierde el diagnóstico (C9).

## 5. El correo en memoria con OTP e invitaciones

El mensaje en claro vive solo en la entrada de la cola: mientras espera turno o reintento (como mucho
unos 75 s con 5 intentos desde 5 s), y se suelta al terminar (`cola-en-proceso.ts:184-195`).
`recordadas` guarda solo claves. No se vuelca a registros. Solo podría aparecer en un volcado del
montón, y Node no lo escribe salvo con `--heapsnapshot-signal` o `--heapsnapshot-near-heap-limit`.
`devops` debe dejarlo así en `fly.toml` (C7). Al reiniciar se pierde lo que estaba en vuelo: es la
decisión aceptada en ADR-0019 §3.4, y desde el punto de vista de seguridad la acepto. Mejora frente a
BullMQ: el secreto ya no sale del proceso. Riesgo nuevo: el proceso que atiende HTTP tiene ahora
`POSTMARK_SERVER_TOKEN` (ver §1).

## 6. El limitador de OTP en memoria

`crear-limitador-de-envios.ts:11` lo elige siempre en modo `unico`.
- **Reinicio:** pone los contadores a cero. Un atacante no puede forzar un reinicio sin otro defecto.
  Los despliegues sí lo hacen. Es aceptable.
- **Varias instancias:** durante el solape de un despliegue, los límites se duplican por unos
  segundos. Una segunda instancia permanente ya es el disparador de Redis (ADR-0019 §8).
- **IP y `X-Forwarded-For`:** `configurar-api.ts:19` mantiene `trust proxy` desde `API_TRUST_PROXY`,
  sin confianza por omisión, así que la cabecera no se puede falsificar. Pero en Fly, sin
  `API_TRUST_PROXY`, `req.ip` es la IP del proxy de Fly para **todas** las peticiones. El límite «por
  IP» pasa a ser global, y un atacante agota la cuota de códigos de todas las agencias. Con un valor
  mayor que el número real de saltos, la IP se puede falsificar. Le toca a `devops` en el paso 8
  (C10).
- **Memoria sin tope:** el `Map` de `limitador-de-envios.en-memoria.ts:7-16` no expulsa entradas.
  Rotando IPv6 y correos crece sin límite. El comentario de la línea 4 («Solo para pruebas») ya no es
  cierto (C11).

## 7. ¿Se puede arrancar en modo `unico` sin las aserciones de rol?

No. Las aserciones viven en los `onModuleInit` de los pools y no dependen del modo. `main-unico.ts`
exige `MODO_DESPLIEGUE=unico` de forma estricta (`arrancar-unico.ts:42`,
`modo-de-despliegue.ts:28-42`). `main.ts` con `MODO_DESPLIEGUE=unico` no arranca
(`inbox.module.ts:96-102`). `worker.ts` con ese valor sigue exigiendo `REDIS_URL` y su rol. La
lectura permisiva de `esModoUnico` (`modo-de-despliegue.ts:45-49`) solo elige adaptadores, nunca
roles.

## 8. `apps/api/package.json`

`dev:unico` (línea 10) usa `dotenv -v MODO_DESPLIEGUE=unico -e ../../.env`. En `dotenv-cli` 7.4, `-v`
se aplica **después** de cargar el `.env` (`cli.js`, líneas 84-89), así que un
`MODO_DESPLIEGUE=escalado` en el `.env` no gana. El resto se comporta como `dev`: el `.env` de
desarrollo carga **todas** las cadenas, incluida `DATABASE_URL` (propietario), pero ningún pool la
lee porque `resolverCadena` no tiene respaldo. `start:unico` (línea 11) no fija el modo y lo deja al
entorno: correcto, y es estricto. Lo que hace falta en producción es que los secretos de Fly **no**
incluyan `DATABASE_URL`: va dentro de C10. El cambio de `.env.example` de CRLF a LF no altera nada más
que la nueva entrada comentada. El comentario de `.env.example:47` («`DATABASE_WEBHOOK_URL` … SOLO
apps/worker») ya no es cierto en modo `unico` (C11).

---

## Hallazgos

### BLOQUEANTE

### [ALTO] B1. La invariante «el contexto HTTP no alcanza el pool de `viajapro_webhook`» no la verifica ninguna compuerta
Archivo: `apps/api/src/proceso-unico/proceso-unico.module.ts:33-41`; `.github/workflows/ci.yml:305-341`; `scripts/verificar-fronteras.mjs`
Qué pasa: el ADR-0019 §3.6(a) dice que los dos contextos están «comprobados por la compuerta `fronteras-entre-modulos`», pero esa compuerta solo busca importaciones entre módulos y accesos a modelos de Prisma ajenos. Ninguna prueba del PR construye el contexto HTTP y comprueba que no resuelve `PrismaWebhookService` (`arranque-unico.spec.ts` y `contexto-http-unico.spec.ts` prueban el trabajador y las fábricas sueltas). Es una afirmación de aislamiento que el sistema no cumple, y en modo `unico` es la **única** barrera que sustituye a la frontera de proceso.
Cómo se explota: un cambio futuro, legítimo en apariencia (por ejemplo, que `InboxModule` importe `inbox-worker-comun.ts` para reutilizar un proveedor, o que alguien registre `PrismaWebhookService` en `SharedModule`), pasa el CI en verde. A partir de ahí, cualquier controlador puede inyectar el rol que ejecuta `tomar_recepcion` y `resolver_enrutamiento` sobre el staging de todas las agencias, sin que nadie lo vea.
Cómo se corrige: añadir una compuerta que corra en CI, de una de estas dos formas. (a) Una prueba unitaria que, con los servicios de Prisma simulados (como hace `arranque-unico.spec.ts:17-32`), cree `ApiUnicoModule.forRoot(crearCompartidoDelInbox())` y afirme que `ctx.get(PrismaWebhookService, { strict: false })` lanza. Y la recíproca: que `TrabajadorUnicoModule` no resuelve `PrismaService` ni `PrismaIdentidadService`. (b) Un recorrido estático del grafo de importaciones desde `apps/api/src/app.module.ts` que falle si alcanza `shared/prisma/prisma-webhook.service.ts`, `inbox-worker-comun.ts` o `inbox-worker*.module.ts`. Basta con una; la (a) prueba lo que de verdad importa, que es el contenedor.

### COLA

### [MEDIO] C1. Disparador para revisar §3.6: tokens reales de WhatsApp en el mismo proceso que HTTP
Archivo: `apps/api/src/modules/inbox/infrastructure/crear-envio-whatsapp.ts:29-41`
Qué pasa: en modo `unico`, una ejecución de código en la superficie HTTP obtiene `META_SYSTEM_USER_TOKEN` en crudo. Hoy es un token de prueba atado a un número.
Cómo se explota: el día que exista un token de proveedor tecnológico o tokens por agencia descifrables en el proceso, una ejecución de código en cualquier endpoint los exfiltra y permite enviar como cualquier agencia, sin ventana ni consentimiento. Meta puede castigar a todas las WABA.
Cómo se corrige: añadir al ADR-0019 §8 el disparador «antes de guardar en producción credenciales reales de WhatsApp (Embedded Signup o *system user* multi-WABA), se separa el trabajador en otro proceso con otro usuario del sistema operativo, o la clave de descifrado sale del proceso HTTP (KMS)». Dueños: `arquitecto` y `auditor-seguridad`.

### [MEDIO] C2. El ADR-0019 §3.6 omite dos secretos que el modo `unico` añade al proceso HTTP
Archivo: `docs/03-adr/0019-despliegue-minimo-un-proceso-sin-redis.md` (§3, punto 6, «Se pierde»)
Qué pasa: enumera `viajapro_webhook` y `WHATSAPP_DIRECTORY_PEPPER`, pero no `POSTMARK_SERVER_TOKEN` ni `META_SYSTEM_USER_TOKEN` (ni `WEBHOOK_PAYLOAD_KEY_PREVIOUS`). Quien apruebe decide sobre un inventario incompleto.
Cómo se explota: no hay explotación directa. Es un defecto del análisis de riesgo que el propietario va a firmar.
Cómo se corrige: corregir el inventario antes de aprobar el ADR (paso 0). Como un ADR no se edita una vez aceptado, hay que hacerlo ahora, mientras sigue «Propuesto». Dueño: `arquitecto`. No bloquea este PR.

### [MEDIO] C3. El motor de cola hereda el `AsyncLocalStorage` de quien encola o del trabajo anterior
Archivo: `apps/api/src/shared/cola-en-proceso/cola-en-proceso.ts:133-145`
Qué pasa: `bombear` arranca el trabajo dentro del contexto asíncrono de `encolar` o del `.finally` del trabajo previo, así que el `ContextoTenant` de una petición puede verse en el trabajo de otra agencia.
Cómo se explota: hoy no es explotable, porque ningún procesador lee `ContextoTenant`. El día que un procesador use `PrismaService.conTenant()` (que toma el tenant del contexto, `prisma.service.ts:96`), un trabajo de la agencia B que arranque tras uno de la A correrá bajo la RLS de A.
Cómo se corrige: ejecutar cada procesador fuera de cualquier contexto heredado. Se puede crear `procesar` con `AsyncResource.bind` en el constructor, o envolver la llamada de `correr` en un contexto vacío, de modo que `ContextoTenant.obtener()` lance dentro de un trabajo. Añadir una prueba: encolar dentro de `ContextoTenant.ejecutarCon(A)` y afirmar que el procesador ve `obtenerONulo() === null`. Dueño: `backend`, antes o junto con el paso 4.

### [MEDIO] C4. El contexto HTTP recibe el objeto compartido entero, con `conectar` y la referencia al procesador
Archivo: `apps/api/src/proceso-unico/proceso-unico.module.ts:21-31`; `apps/api/src/modules/inbox/infrastructure/cola-de-changes.en-proceso.ts:68-70`
Qué pasa: `COMPARTIDO_DEL_INBOX` es `@Global()` en la API y expone `colaDeChanges.conectar`, `avisos.tomarAvisos()` y, por campos privados de TypeScript, el cierre que llega a `PrismaWebhookService`.
Cómo se explota: hace falta código dentro del proceso: un proveedor HTTP llama a `conectar` y desvía todos los changes, o recorre las propiedades hasta el pool. No hay vía desde la entrada HTTP.
Cómo se corrige: dar al contexto HTTP solo fachadas estrechas, como `{ encolar }` para los changes y `{ avisar }` para los avisos, y quitar `@Global()`: se inyecta solo en `InboxModule`. Usar campos `#privados` en `ColaEnProceso`. `conectar` debería aceptar una sola llamada y lanzar en la segunda. Dueño: `backend`.

### [MEDIO] C5. TEMPORAL-PASO-4: duplicado posible al reiniciar o con dos máquinas
Archivo: `apps/api/src/modules/inbox/infrastructure/cola-de-envios.en-memoria-temporal.ts:77-90`; `apps/api/src/modules/inbox/application/relevar-outbox.ts:44`
Qué pasa: la reserva no es durable, y el envío arranca dentro de la transacción del outbox, antes de que el evento quede marcado como publicado.
Cómo se explota: (1) el proceso muere entre la aceptación de Meta y el `COMMIT` del outbox, el relay lo vuelve a encolar al reiniciar, la reserva se olvidó y el mensaje sale dos veces; (2) en un solape de despliegue, cada máquina tiene su propia reserva.
Cómo se corrige: el paso 4 (`ReservaDeEnvioPostgres`) y borrar este archivo. **Condición dura:** el paso 4 entra en `main` antes que cualquier adaptador de credenciales reales (`cuentas_whatsapp`). Mientras tanto, la única barrera es que `crearCredencialesWhatsapp` solo sabe construir `CredencialesDePrueba`. Dueño: `backend`.

### [BAJO] C6. Procesamiento doble de changes durante el solape de un despliegue
Archivo: `apps/api/src/modules/inbox/interface/planificador-de-seguridad.ts:72`
Qué pasa: el barrido del arranque, con antigüedad 0, vuelve a encolar changes que la máquina vieja sigue procesando. `tomar_recepcion` no bloquea la fila.
Cómo se explota: no cruza agencias. El riesgo es de duplicados si alguna escritura no está protegida por la unicidad.
Cómo se corrige: la prueba del paso 6 con dos `ProcesarChange` concurrentes sobre el mismo change, que el ADR ya asigna a `qa`. Si falla, usar una antigüedad mínima de unos segundos también al arrancar. Dueño: `qa`.

### [BAJO] C7. Volcados de montón con OTP en claro
Archivo: configuración de despliegue (paso 8)
Qué pasa: los correos en vuelo (OTP y enlaces de invitación) están en claro en el montón.
Cómo se explota: si se activan `--heapsnapshot-*` o se copia un volcado para depurar, los secretos salen de la máquina.
Cómo se corrige: en `fly.toml` y el Dockerfile, ninguna opción de volcado del montón, y anotarlo en el runbook. Dueño: `devops`.

### [BAJO] C8. El candado del barrido retiene una conexión hasta 1 h y se bloquea con `connection_limit=1`
Archivo: `apps/api/src/modules/inbox/infrastructure/barrido.en-proceso.ts:50-60`
Qué pasa: la transacción que sostiene el candado ocupa una conexión mientras la tarea pide otras, y su `timeout` es el intervalo (1 h).
Cómo se explota: no es explotable desde fuera. Con un pool de una conexión, el barrido falla siempre. Una base colgada deja una conexión «idle in transaction» hasta 1 h.
Cómo se corrige: documentar `connection_limit >= 2` para `DATABASE_WEBHOOK_URL`, o tomar el candado y correr la tarea en la misma transacción. Acotar el `timeout` a unos minutos, no al intervalo. Dueños: `backend` y `devops`.

### [BAJO] C9. `codigoSeguro` pierde el código de un `ErrorDeTrabajo`
Archivo: `apps/api/src/modules/inbox/infrastructure/compartido-en-proceso.ts:26-30`
Qué pasa: lee `code`, pero el error ya saneado lleva `codigo`, así que el registro solo dice «ErrorDeTrabajo».
Cómo se explota: no es explotable. Se pierde diagnóstico en una cola que ya no tiene panel.
Cómo se corrige: reutilizar `sanearError(error).codigo`. Dueño: `backend`.

### [BAJO] C10. Configuración de producción en Fly: `API_TRUST_PROXY` y secretos
Archivo: `apps/api/src/configurar-api.ts:19`; `apps/api/src/shared/red/proxy-de-confianza.ts`
Qué pasa: sin `API_TRUST_PROXY`, el límite de OTP por IP se vuelve global detrás del proxy de Fly. Con más saltos de los reales, la IP se puede falsificar.
Cómo se explota: un atacante agota la cuota de envío de códigos «por IP» de todos los usuarios, o la evade rotando `X-Forwarded-For`.
Cómo se corrige: verificar cuántos saltos añade Fly (`Fly-Client-IP` y `X-Forwarded-For`, **NO VERIFICADO**) y fijar exactamente ese número. Los secretos de la app de API en Fly no deben incluir `DATABASE_URL` (propietario) ni `REDIS_URL`. Dueño: `devops`, en el paso 8.

### [BAJO] C11. El limitador en memoria no tiene tope, y quedan comentarios desfasados
Archivo: `apps/api/src/modules/identity/infrastructure/limitador-de-envios.en-memoria.ts:4-16`; `.env.example:47`
Qué pasa: el `Map` no expulsa las claves vencidas que nadie vuelve a consultar. El comentario dice «solo para pruebas», pero ya es el limitador de producción en modo `unico`. `.env.example` dice que `DATABASE_WEBHOOK_URL` es «SOLO apps/worker».
Cómo se explota: rotando direcciones IPv6 y correos, la memoria crece sin límite: es una denegación de servicio lenta.
Cómo se corrige: purgar las entradas vencidas en cada `consumir` o con un temporizador, poner un tope de tamaño y actualizar los dos comentarios. Dueño: `backend`.

---

## Qué se revisó sin hallazgos

- R1: el PR no crea tablas ni migraciones.
- Secretos en el diff: ninguno. `.env.example` solo añade `MODO_DESPLIEGUE` comentado.
- Firma HMAC y cuerpo crudo del webhook: `configurarApi` mantiene `cuerpoCrudoDeWebhooks` en las dos
  formas de arranque (`configurar-api.ts:27`).
- Socket.IO con el bus compartido: los eventos llevan el `tenantId` que fijó el relay, y la pasarela
  lee con `ContextoTenant.ejecutarCon(evento.tenantId)` y emite a salas asignadas por el servidor
  (`emitir-eventos-en-vivo.ts`, `bandeja-en-vivo.gateway.ts:131-140`).
- El contexto HTTP ahora tiene el bus como publicador (antes `SinPublicador`), pero ningún proveedor
  HTTP inyecta `PuertoPublicadorDeEventos`: solo lo usa `RelevarOutbox`, del trabajador.

## Re-verificación

Cuando `backend` corrija B1, este agente comprueba que la compuerta corre en CI y que **falla** si se
añade `PrismaWebhookService` a un módulo de `AppModule`. Una compuerta que no se ha visto fallar no
cuenta como compuerta. Los puntos C1 a C11 van a `roadmap/tasks.yaml` con los dueños indicados.
