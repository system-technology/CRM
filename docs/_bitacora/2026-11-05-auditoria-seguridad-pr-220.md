# Auditoría de seguridad del PR #220: envíos sobre Postgres (ADR-0019 paso 4)

- **Fecha:** 2026-11-05
- **Agente:** `auditor-seguridad`, en modo de solo lectura (no se tocó el código del PR)
- **Alcance:** lo que añade #220 (`a/T-000-envios-sobre-postgres`) sobre #211, es decir, el commit
  `ecd5d5c`. El merge `6fc61d0` no toca `apps/api/src/modules/inbox`, `shared` ni `proceso-unico`.
- **Contrato:** ADR-0019 §1.2, §3.2 y §7 (paso 4), ADR-0018 §3.2, la migración
  `20261104140000_envios_sin_redis_en_mensajes` y la condición C5 de la auditoría de #211
  (`docs/_bitacora/2026-11-05-auditoria-seguridad-pr-211.md`).
- **Método:** lectura línea a línea de cada sentencia SQL cruda nueva, análisis de carreras y
  revisión de las fixtures de la e2e. No se arrancaron servicios ni bases de datos: la e2e se revisó
  solo por lectura.
- **Regla aplicada:** aislamiento entre agencias y R5, así que R13 no recorta y se hacen todas las
  vueltas necesarias.

## Veredicto

**Integrable tal cual.** No encontré ningún hallazgo bloqueante. Las siete sentencias SQL crudas
nuevas llevan `tenant_id` explícito y corren dentro de `conTenantResuelto`, es decir, bajo RLS. No
encontré ningún camino, dentro del modo `unico`, por el que un mensaje salga dos veces hacia Meta.
C5 queda cerrada para el modo `unico`. C3 y C8 (la parte de código) quedan corregidas. Lo que sigue
abierto va a la cola. Dos de esos puntos son **precondiciones duras del paso 8** (desplegar): Q1 y
Q7.

## 1. Aislamiento: cada sentencia SQL cruda

La guardia `consultas-sin-filtro.spec.ts` no revisa SQL crudo, así que esta revisión es manual.

| # | Sentencia | Archivo:línea | `tenant_id` explícito | Bajo `conTenantResuelto` |
|---|---|---|---|---|
| 1 | Reclamo, CTE `candidato` (`SELECT … FOR UPDATE SKIP LOCKED`) | `cola-de-envios.postgres.ts:147-154` | Sí (149) | Sí (143) |
| 2 | Reclamo, `UPDATE mensajes m … FROM candidato` (la misma consulta que la 1) | `cola-de-envios.postgres.ts:155-161` | Sí (160) | Sí |
| 3 | Espera del reintento (`UPDATE`) | `cola-de-envios.postgres.ts:180-185` | Sí (184) | Sí (177) |
| 4 | `listarListos` (`SELECT`) | `cola-de-envios.postgres.ts:193-201` | Sí (195) | Sí (190) |
| 5 | `listarSinConfirmar` (`SELECT`) | `cola-de-envios.postgres.ts:210-218` | Sí (212) | Sí (207) |
| 6 | `reservar` (`UPDATE … RETURNING id`) | `reserva-de-envio.postgres.ts:39-45` | Sí (42) | Sí (36) |
| 7 | `liberar` (`UPDATE`) | `reserva-de-envio.postgres.ts:58-62` | Sí (61) | Sí (55) |

- **JOIN y subconsultas.** La única es la CTE del reclamo. Une `mensajes` consigo misma por `id`,
  y las dos ramas filtran por el mismo `tenant_id` (149 y 160) bajo la misma RLS. Ninguna sentencia
  toca otra tabla.
- **Cómo enumera agencias el barrido** (`recuperar-envios-sin-resolver.ts:42`). Llama a
  `PuertoOutbox.tenantsParaBarrer()` → `outbox.prisma.ts:60-67`, que hace
  `prisma.tenant.findMany({ where: { estado in [ACTIVO, EN_PRUEBA] }, select: { id } })` con el pool
  `PrismaWebhookService` (`viajapro_webhook`), fuera de cualquier contexto de tenant. `tenants` es
  global y está declarada en `excepciones_rls` con `viajapro_webhook → {SELECT}`
  (migraciones `20261007120100`, línea 67, y `20261007140000`, línea 74). Solo lee identificadores.
  Después, cada agencia se procesa por separado: `listarSinConfirmar`, `registrarFallo` (Prisma con
  `tenantId` en el `where`, `mensajes-salientes.prisma.ts:120-134`) y `listarListos` corren cada uno
  en su propia transacción `conTenantResuelto(tenantId)`. El barrido nunca lee `mensajes` sin
  tenant.
- **De dónde sale el `tenantId` del trabajo.** Del relay (`relevar-outbox.ts:44`, que usa el
  `e.tenantId` del outbox leído bajo RLS para ese tenant) o del barrido (lista de `tenants`). Nunca
  sale de un parámetro del cliente HTTP. `conTenantResuelto` exige formato UUID y relee el
  `app.current_tenant` antes de ejecutar (`prisma-webhook.service.ts:60-69`).
- **Rol.** El contexto del trabajador `unico` construye `ColaDeEnviosPostgres` y
  `ReservaDeEnvioPostgres` solo con `PrismaWebhookService`
  (`inbox-worker-unico.module.ts:67-82`). Ese servicio aborta al arrancar si no es
  `viajapro_webhook` o si el rol salta RLS (`prisma-webhook.service.ts:34-46`).

## 2. Inyección

Todas las sentencias son plantillas etiquetadas de `$queryRaw`, con parámetros enlazados. No hay
`$queryRawUnsafe` ni `$executeRawUnsafe`, ni concatenación. Los casts son correctos:

- `${tenantId}::uuid` y `${mensajeId}::uuid`;
- `${arrendamientoS}::int * interval '1 second'` (157);
- `${esperaS}::float8 * interval '1 second'` (182), que admite fracciones como 0,05 s en la e2e;
- `LIMIT ${limite}` sin cast: Postgres infiere `bigint`, el mismo patrón que `outbox.prisma.ts:36`.

Los literales `'PENDIENTE'` y `'SALIENTE'` son constantes del código, no entradas.

## 3. R5: por qué un mensaje no puede salir dos veces

**El orden** (`enviar-mensaje-saliente.ts`):

1. reclamo con arrendamiento, en su propia transacción ya confirmada (`cola-de-envios.postgres.ts:116`);
2. lectura (70);
3. comprobaciones;
4. credencial (95);
5. **reserva** (104), en su propia transacción confirmada;
6. **Meta** (111), fuera de toda transacción;
7. **registro del `wamid`** (117).

**La invariante.** Solo se llama a Meta si `reservar` devolvió una fila. `reservar` es un único
`UPDATE … WHERE envio_reservado_en IS NULL AND wamid IS NULL RETURNING id`
(`reserva-de-envio.postgres.ts:40-45`). En READ COMMITTED, dos `UPDATE` concurrentes sobre la misma
fila se serializan: el segundo espera, vuelve a evaluar el `WHERE` sobre la versión confirmada y
devuelve cero filas. La reserva **solo se borra** en `liberar` (54-64), y `liberar` solo se llama
cuando el adaptador lanza un error con `reintentable === true` (`enviar-mensaje-saliente.ts:121-123`).

`EnvioWhatsappGraph` solo lanza esos errores cuando la petición no salió (`ECONNREFUSED`, DNS…,
`envio-whatsapp.graph.ts:52,159`) o cuando Meta respondió con su sobre de error. Un timeout, una
conexión cortada a medias, un 2xx sin `wamid` legible o un 5xx sin `error.code` dan
`EnvioSinConfirmarError`, que no es reintentable (157-172). Además, los reintentos internos del
adaptador cortan en el primer error no reintentable (123). Ningún otro código pone
`envio_reservado_en` a NULL: `registrarFallo` y `registrarAceptado` no lo tocan.

**Las carreras, una a una:**

| Escenario | Qué pasa | ¿Duplica? |
|---|---|---|
| Dos consumidores en el mismo proceso | `ColaEnProceso` deduplica por `envio-<id>` mientras el trabajo está vivo | No |
| Dos procesos (solape de despliegue) reclaman a la vez | La CTE bloquea con `FOR UPDATE SKIP LOCKED`: uno toma la fila y el otro la salta. Si el segundo llega después del `COMMIT`, la recomprobación (EvalPlanQual) ve `envio_siguiente_en` en el futuro y la descarta. Lo demuestran la e2e (`envios-postgres.e2e-spec.ts:270-296`) y la unitaria (`envios-postgres.spec.ts:244`) | No |
| `SKIP LOCKED` frente al `UPDATE` de `reservar` | Si `reservar` tiene el candado, el reclamo lo salta. Si el reclamo lo tiene, `reservar` espera y vuelve a evaluar. Para entonces la fila sigue sin reservar, porque reclamar no reserva, así que reserva una sola vez | No |
| Muerte entre el reclamo y la reserva | Fila sin reserva y con arrendamiento. Al vencer los 2 min, el barrido la reencola y alguien la reclama y la reserva por primera vez. Meta nunca la vio | No |
| Muerte entre la reserva y la respuesta de Meta | Fila reservada y sin `wamid`. El reclamo la excluye (`envio_reservado_en IS NULL`, 152). El barrido, al vencer el arrendamiento, la marca `FALLIDO` «sin confirmar» (`recuperar-envios-sin-resolver.ts:64-74`) y no la reencola. La e2e lo cubre (308-327) | No |
| Meta aceptó y falla `registrarAceptado` (base caída) | El error sube y `esperarAntesDeReintentar` no toca la fila, porque exige `envio_reservado_en IS NULL` (185). El reintento en memoria no la reclama (152). El barrido la marca «sin confirmar». Si el webhook de estado llega, T-059 corrige el estado. **Un mensaje entregado puede verse «sin confirmar»: eso es la semántica acordada, no un duplicado** | No |
| Arrendamiento vencido durante la llamada a Meta | La llamada dura como mucho unos 32 s: 3 × 10 s más las esperas de 0,5 y 1,5 s (`envio-whatsapp.graph.ts:32,114-118`), frente a 120 s de arrendamiento. Si aun así vence (por bloqueo del bucle de eventos), nadie puede reservar la fila, el barrido la marca «sin confirmar» y `registrarAceptado` la revive con su `wamid` (`mensajes-salientes.prisma.ts:90-93`) | No |
| Arrendamiento vencido **antes** de `reservar` (más de 120 s entre el reclamo y la reserva) | B reclama de nuevo y A y B llegan a `reservar`. Gana uno. El perdedor llama a `fallar` y marca «sin confirmar» un mensaje que el ganador está enviando. Ver Q2 | **No** (el estado queda incorrecto un rato, pero no hay duplicado) |
| Reintentos del backoff | Tras `liberar` y lanzar el error, la fila espera el backoff en la base (182) y el temporizador en memoria espera lo mismo. La base fija su instante antes que el temporizador, así que el reintento en memoria nunca llega antes de tiempo. Si fallara la escritura del backoff, el reintento en memoria encuentra el arrendamiento, recibe `null` y lo recoge el barrido | No |
| Relay que encola dentro de su transacción y muere antes del `COMMIT` del outbox (el hueco de C5) | Al reiniciar, el relay vuelve a encolar. La fila ya tiene `wamid` (YA_RESUELTO, y el reclamo exige `wamid IS NULL`) o está reservada (el reclamo la excluye). **Es el agujero de C5 y queda cerrado** | No |

**Conclusión R5.** Dentro del modo `unico` no hay ninguna ventana de doble envío. La reserva es
durable, nunca caduca y solo se libera ante un «no lo acepté» explícito. Una fila «sin confirmar»
no vuelve a reclamarse por ningún camino: el reclamo y `listarListos` exigen
`envio_reservado_en IS NULL`, y no hay código que la reabra salvo `liberar`, que solo corre en el
propio intento que reservó. La excepción está **entre modos**: ver Q1.

## 4. El puerto con `tenantId` y el adaptador Redis

`ReservaDeEnvioRedis` (`cola-de-envios.bullmq.ts:86-99`) recibe `_tenantId` y lo ignora. La clave
sigue siendo `viajapro:envio-reservado:<mensajeId>`. No mezcla agencias: `mensajes.id` es la clave
primaria global (UUID v7, `model Mensaje` de `schema.prisma`), así que dos agencias no pueden
compartir clave, y la clave no guarda datos. La semántica del modo `escalado` no cambia. Que la
reserva Redis no escriba la columna sí tiene una consecuencia al cambiar de modo: ver Q1.

## 5. Privilegios y `actualizado_en`

- Corre como `viajapro_webhook`, que no salta RLS y no es propietario. Tiene `UPDATE` de tabla
  sobre `mensajes` (lo comprueba la migración 20261104140000 columna por columna). No necesita
  ningún privilegio nuevo, ni función `SECURITY DEFINER`, ni acceso a tablas fuera de `mensajes` y
  `tenants`.
- `actualizado_en = now()` se pone a mano en los cuatro `UPDATE` crudos: `cola-de-envios.postgres.ts:158`
  y `:183`, y `reserva-de-envio.postgres.ts:41` y `:60`. Las escrituras por Prisma
  (`registrarFallo` y `registrarAceptado`) lo ponen por `@updatedAt`.

## 6. R10: registros y errores

No hay texto del mensaje, teléfono, token ni cuerpo de Meta en ningún registro nuevo:

- `cola-de-envios.postgres.ts:128-131` registra 8 caracteres del id.
- `inbox-worker-unico.module.ts:73-75` registra la clave recortada y el `codigo` saneado.
- `recuperar-envios-sin-resolver.ts:49-57` registra solo recuentos y descarta el error de base.
- `enviar-mensaje-saliente.ts:106,143-145` registra la clase y el código.
- `motivo_fallo` lleva el mensaje fijo de la clase de error.
- El adaptador Graph descarta el error original de `fetch` (158) y de la respuesta solo lee
  `error.code` (89-93).

## 7. C3, C6 y C8

- **C3 (corregida).** `ColaEnProceso` fija con `AsyncResource.bind` el contexto de su construcción
  (`cola-en-proceso.ts:69-71`) y ejecuta cada intento dentro de él (150), también los reintentos,
  porque el temporizador vuelve a pasar por `bombear`. Las tres colas se construyen al arrancar:
  `crearCompartidoDelInbox` en `arrancar-unico.ts:44`, y las fábricas de proveedores singleton en
  `inbox-worker-unico.module.ts:67-79` y `notifications.module.ts:37-40`. No hay ningún proveedor
  `Scope.REQUEST` en `apps/api`. No veo fuga nueva. El riesgo que queda es el que el propio archivo
  declara: construir una cola dentro de una petición capturaría ese contexto. Ver Q6. La prueba
  (`cola-en-proceso.spec.ts`, «no hereda el AsyncLocalStorage…») usa un ALS genérico, que es el
  mismo mecanismo que `ContextoTenant`.
- **C8 (corregida en el código).** El `timeout` del candado queda acotado a
  `min(300 s, max(5 s, periodo))` (`barrido.en-proceso.ts:21,63-66`). Efecto lateral aceptable: si
  el barrido de changes durara más de 5 min, Prisma cerraría la transacción y soltaría el candado
  mientras `fn` sigue, y otra máquina podría barrer a la vez. Los changes son idempotentes por la
  unicidad (ADR-0019 §1.2). **Sigue abierta la mitad de `devops`:** documentar
  `connection_limit >= 2` en `DATABASE_WEBHOOK_URL`. Ver Q7.
- **C6 (sin cambios en este PR, y no le correspondía).** El arranque sigue barriendo con antigüedad
  0 (`planificador-de-seguridad.ts:75`). Es la prueba del paso 6 (`qa`). Los envíos no la necesitan,
  porque los protege el `SKIP LOCKED` con arrendamiento.

## 8. La e2e que el autor no pudo ejecutar (`envios-postgres.e2e-spec.ts`), revisada por lectura

No veo nada que vaya a fallar en CI:

- **Fixtures.** Son las mismas columnas y el mismo patrón que `inbox-barrido.e2e-spec.ts:201-215`
  (tenants, `cuentas_whatsapp`, `canales`). `contactos` y `conversaciones` solo omiten columnas con
  DEFAULT en base (`etiquetas`, `campos_personalizados`, `mensajes_sin_leer`, `estado`, `creado_en`).
  Las longitudes caben: `slug` 37/63, `waba_id` 22/32, `phone_number_id` 13/32. El tenant
  `01932000-0000-7000-8000-<12 hex>` pasa el regex de `conTenantResuelto`.
- **`INSERT INTO mensajes` (131-146).** `$5::int` y `$6::int` se usan dos veces con el mismo tipo.
  `CASE WHEN … IS NULL THEN NULL ELSE now() ± …` resuelve a `timestamptz`. `siguienteEnS: -300` y
  `-1` dan instantes pasados. Cumple `mensajes_envio_solo_saliente`, `mensajes_entrante_sin_autor`
  y `mensajes_plantilla_coherente`.
- **Expectativas.**
  - En la prueba 1 se espera `intentos: 1` con dos consumidores (el perdedor recibe `null`) y
    `estado: 'PENDIENTE'` después del `wamid` («aceptado» no es «enviado»).
  - En la prueba 3, `sinConfirmar` es 1: la fila de la prueba 2 (`deB`, reservada con
    `envio_siguiente_en` NULL) no entra en `listarSinConfirmar`, porque exige
    `envio_siguiente_en IS NOT NULL`.
  - La prueba 4 espera `intentos: 2` para la vencida.
  - `motivo` coincide con `EnvioSinConfirmarError` («No pudimos confirmar…»).
- **Riesgo menor, no de fallo.** Crea hasta cuatro pools de `PrismaWebhookService` que solo se
  cierran en `afterAll`. Junto con los demás archivos en paralelo, eso suma conexiones al Postgres
  de CI. Si algún día aparece `too many clients`, la causa está aquí. Ver Q9.
- **Lo que la e2e no demuestra.** La prueba «la reserva no alcanza el mensaje de otra agencia (RLS)»
  (298-306) pasaría igual sin RLS, porque el `WHERE tenant_id = A` ya excluye la fila de B. Prueba
  el filtro explícito, no la RLS. La RLS de `mensajes` ya la cubre `aislamiento.spec.ts`. Ver Q8.

## BLOQUEANTES

**Ninguno.**

## COLA (no bloquea; con dueño)

### [MEDIO] Q1. Al cambiar de modo contra la misma base, la reserva de un modo no la ve el otro, y el barrido reenvía lo antiguo
Archivo: `apps/api/src/modules/inbox/infrastructure/cola-de-envios.bullmq.ts:86-99`; `apps/api/src/modules/inbox/infrastructure/cola-de-envios.postgres.ts:189-204`
Qué pasa: la reserva Redis (`escalado`) no escribe `envio_reservado_en`, y `listarListos` reencola
**cualquier** saliente `PENDIENTE` sin `wamid` y sin reserva en columna, sin límite de antigüedad.
Eso incluye las filas anteriores a la migración y las de una base que corrió en `escalado`.
Cómo se explota: el día que el modo `unico` arranque contra una base que haya corrido en `escalado`
(o que tenga salientes `PENDIENTE` de pruebas con la cola `inerte`), el barrido del arranque los
reencola. Si uno de ellos llegó a Meta con la reserva en Redis y sin `wamid` registrado, sale dos
veces. Los demás salen tarde, días después si la ventana de 24 h vuelve a estar abierta.
Cómo se corrige:
- Antes del paso 8, una comprobación del runbook que cuente los salientes `PENDIENTE` sin `wamid`
  y con `envio_intentos = 0`, y que marque esas filas `FALLIDO` «sin confirmar» antes del primer
  arranque `unico`.
- En el código, un tope de antigüedad en `listarListos`: lo que tenga más de N minutos se marca
  `FALLIDO` en vez de enviarse, igual que BullMQ, que se rinde a los 90 s.
- El día que vuelva el modo `escalado` (ADR-0019 §8: «las columnas de la reserva se quedan»),
  `ReservaDeEnvioRedis` debe escribir también la columna, o delegar en `ReservaDeEnvioPostgres`.

Dueños: `devops` (runbook del paso 8) y `backend`. **Precondición dura del paso 8.**

### [BAJO] Q2. El perdedor de la reserva marca «sin confirmar» un envío que el ganador sigue haciendo
Archivo: `apps/api/src/modules/inbox/application/enviar-mensaje-saliente.ts:104-108`
Qué pasa: si pasan más de 120 s entre el reclamo y `reservar` (un bloqueo largo), un segundo
consumidor reclama y pierde la reserva. Entonces llama a `fallar`, aunque el ganador siga vivo.
Cómo se explota: no hay duplicado. El ganador puede recibir de Meta un rechazo pasajero (`liberar`
y luego relanzar), pero la fila ya está `FALLIDO` y no se reintenta. Si el rechazo es definitivo,
el código de Meta se pierde (`registrarFallo` exige `PENDIENTE`).
Cómo se corrige: hacer que el reclamo devuelva un testigo (el `envio_intentos` que devolvió) y que
`reservar` exija ese mismo `envio_intentos`. Un perdedor con un arrendamiento ajeno no marca nada.
Dueño: `backend`.

### [BAJO] Q3. `reservar` no comprueba `estado = 'PENDIENTE'` ni `eliminado_en IS NULL`
Archivo: `apps/api/src/modules/inbox/infrastructure/reserva-de-envio.postgres.ts:40-45`
Qué pasa: la lectura (`leerParaEnviar`) y la reserva son transacciones distintas.
Cómo se explota: el día que exista una forma de anular o borrar un saliente pendiente, un borrado
entre la lectura y la reserva no impediría el envío.
Cómo se corrige: añadir `AND estado = 'PENDIENTE' AND eliminado_en IS NULL` al `WHERE`. Cero
filas significaría «no se envía», que es seguro. Dueño: `backend`.

### [BAJO] Q4. Una fila reservada con `envio_siguiente_en` NULL no la resuelve nadie
Archivo: `apps/api/src/modules/inbox/infrastructure/cola-de-envios.postgres.ts:216`
Qué pasa: `listarSinConfirmar` exige `envio_siguiente_en IS NOT NULL`. El flujo normal nunca
produce esa fila, porque el reclamo siempre pone el arrendamiento. Sí la produce la e2e (`deB`), y
la produciría una reserva hecha fuera del reclamo.
Cómo se explota: no se duplica. El mensaje queda `PENDIENTE` para siempre.
Cómo se corrige: aceptar también `envio_siguiente_en IS NULL` en ese filtro. Dueño: `backend`.

### [BAJO] Q5. El cierre ordenado espera 10 s y la llamada a Meta puede durar unos 32 s
Archivo: `apps/api/src/modules/inbox/infrastructure/cola-de-envios.postgres.ts:100-106` (`cerrar` sin argumento espera 10 000 ms)
Qué pasa: un despliegue que corta el proceso en mitad de los reintentos internos deja filas
reservadas sin `wamid`.
Cómo se explota: no se duplica. Hay mensajes «sin confirmar» evitables, y el arrendamiento de 2 min
hace que el barrido del arranque no los vea: los marca el siguiente, hasta 60 min después.
Cómo se corrige: cerrar la cola de envíos con unos 40 s de espera y un `kill_timeout` de Fly de al
menos 45 s. Dueños: `backend` y `devops` (paso 8).

### [BAJO] Q6. C3 depende de que ninguna cola se construya dentro de una petición
Archivo: `apps/api/src/shared/cola-en-proceso/cola-en-proceso.ts:14-18,69-71`
Qué pasa: el contexto aislado es el de la construcción.
Cómo se explota: el día que alguien construya una `ColaEnProceso` de forma perezosa en una
petición, sus trabajos heredarán ese `ContextoTenant`.
Cómo se corrige: ejecutar cada intento en un contexto vacío y explícito (un `AsyncLocalStorage`
snapshot tomado al cargar el módulo) en vez del contexto de la construcción, o lanzar en el
constructor si `ContextoTenant` tiene valor. Dueño: `backend`.

### [BAJO] Q7. C8, la parte de `devops`: `connection_limit >= 2` en `DATABASE_WEBHOOK_URL`
Archivo: configuración del paso 8 (`fly.toml`, `.env.example`)
Qué pasa: con una sola conexión, la transacción del candado deja al barrido de changes sin
conexión, y el barrido falla siempre.
Cómo se corrige: documentarlo y fijarlo. Dueño: `devops`. **Precondición del paso 8.**

### [BAJO] Q8. La prueba de «RLS» de la reserva no prueba RLS
Archivo: `apps/api/src/modules/inbox/envios-postgres.e2e-spec.ts:298-306`; `apps/api/src/modules/inbox/infrastructure/envios-postgres.spec.ts:176`
Qué pasa: el `WHERE tenant_id` explícito basta para que la prueba pase.
Cómo se corrige: renombrarla a «filtro por tenant explícito», o añadir una aserción que abra
`conTenantResuelto` con A y ejecute un `UPDATE` de `mensajes` por el id de B **sin** `tenant_id`,
y compruebe que no toca filas. Dueño: `qa`.

### [BAJO] Q9. Pools de la e2e abiertos hasta `afterAll`
Archivo: `apps/api/src/modules/inbox/envios-postgres.e2e-spec.ts:187-217,250-254`
Qué pasa: hasta cuatro `PrismaWebhookService` vivos a la vez.
Cómo se corrige: cerrar cada instancia al final de su prueba, o reutilizar dos. Dueño: `qa`.

## Lo que se revisó y salió limpio

- **Aislamiento:** las siete sentencias, la CTE, la enumeración de agencias por `tenants` (global y
  de solo lectura) y el origen del `tenantId`.
- **Inyección.**
- **R5:** las diez carreras de la tabla.
- **El adaptador Redis con el nuevo puerto.**
- **Rol y `actualizado_en`.**
- **R10.**
- **C3 y C8.**
- **La e2e por lectura.**
- **El archivo `TEMPORAL-PASO-4`:** está borrado, y no queda ninguna referencia en código de
  producción. `ReservaDeEnvioEnMemoria` solo se usa en `enviar-mensaje-saliente.spec.ts`.

**La condición dura de C5** («el paso 4 entra en `main` antes que cualquier adaptador de
credenciales reales») queda cumplida al integrar este PR.
