# Auditoría de seguridad — ADR-0008, la **implementación** (tarea 4a)

- **Fecha:** 2026-10-07 · **Auditor:** `auditor-seguridad`
- **Objeto:** rama `feat/inbox-esquema`, commit `bbf83e4`.
- **Perímetro leído, archivo por archivo y no por nombre de prueba:** las cuatro migraciones de
  ADR-0008 y las tres anteriores, `prisma/policies/001` y `002`, `prisma/schema.prisma`,
  `packages/database/tests/aislamiento.spec.ts` completo,
  `packages/database/scripts/crear-rol-aplicacion.mjs`, `.github/workflows/ci.yml`,
  `infra/docker/docker-compose.yml`, `infra/docker/postgres/init/01-extensions.sql`,
  `.env.example`, `docs/02-arquitectura/03-modelo-de-datos.md`, `ESTADO.md`.
- **Hallazgos:** 2 críticos, 6 altos, 8 medios, 5 bajos.

## Veredicto

**No puede entrar en `main` tal como está. Puede entrar con las seis correcciones bloqueantes del
final.**

El trabajo es bueno y las dos trampas del motor son hallazgos reales de la clase correcta. Pero las
25 en verde no cubren lo que sigue, y dos cosas lo explican:

1. **La compuerta nunca ha corrido.** En CI, `aislamiento-tenants` solo define `DATABASE_URL`, y la
   prueba cae al rol propietario por un `??`. Las 25 se verificaron a mano contra Neon. Lo que
   protege `main` hoy es una persona, no un trabajo.
2. **Una de las aserciones se adapta al conjunto degradado en vez de ponerse en rojo.** La 20
   construye su expectativa filtrándola por los roles que la vista enumera: un rol que desaparece de
   la vista desaparece también del lado esperado.

Y sobre lo que `datos` declaró verificado: **C-3 no está cumplido.** Plegar `procesado_en` dentro de
`anular_payload` cerró la carrera entre dos sentencias del trabajador y dejó intacta la carrera
entre dos transacciones, que es la que el ADR describe.

---

## Hallazgos

### [CRÍTICO] La compuerta de aislamiento corre en CI con el rol propietario, y nunca ha estado en verde

**Dónde:** `.github/workflows/ci.yml:153-158`; `packages/database/tests/aislamiento.spec.ts:27`

**Qué pasa:** el job define únicamente `DATABASE_URL`, y la prueba hace
`const URL_APP = process.env['DATABASE_APP_URL'] ?? process.env['DATABASE_URL'] ?? ''`, así que la
conexión «de aplicación» es el usuario `viajapro` del contenedor, que es **superusuario**; la única
comprobación que lo vigila (`:90-96`) mira `rolbypassrls`, que en un superusuario es `false`.

**Cómo se explota:** no hace falta atacante. Hoy el job o se pone rojo por la razón equivocada —el
tenant B ve el contacto de A, `:98-117`— o, si alguien silencia esas dos pruebas, las 25 pasan contra
un rol que no prueba nada. En ninguno de los dos estados hay verificación automática de las 18
aserciones: las corrió una persona y el resultado vive en un mensaje de commit. Cualquier regresión
futura de privilegios entra en `main` sin ponerse en rojo — la clase de fallo para la que se escribió
este ADR. Segundo filo: para hacerlo verde de verdad hacen falta las contraseñas de los tres roles,
que ninguna migración fija y que `rol:crear` genera al azar; no hay paso de CI que las genere. **No
es que la compuerta esté roja: es que no se puede poner en verde con lo que hay en este commit.**

**Corrección:** (1) quitar el `??` de `:27` — si falta `DATABASE_APP_URL`, abortar; (2) en
`beforeAll`, afirmar `current_user = 'viajapro_app'` **y** `rolsuper = false` **y**
`rolbypassrls = false`; (3) paso de CI entre `db:migrate` y `test:aislamiento` que fije contraseñas
deterministas de prueba y exporte las tres cadenas.

### [CRÍTICO] Un atributo de rol apaga en silencio el mecanismo de revocación y seis aserciones a la vez

**Dónde:** `packages/database/prisma/policies/001-aislamiento-tenant.sql:209-217`, `:254`,
`:292-299`; `tests/aislamiento.spec.ts:256-259, 325-326, 386, 410, 421-436, 831, 901`

**Qué pasa:** `roles_de_login_vigilados` excluye por atributo `rolsuper`, `rolbypassrls`,
**`rolcreaterole`** y **`rolcreatedb`**. Esa vista gobierna el bucle de revocación y las aserciones
8, 9, 10, 20, 21 y 24. Pero la **concesión** no sale de la vista: sale del literal
`roles_de_aplicacion` de `:254`. Los dos conjuntos pueden divergir, y la dirección que importa es
concesión sin revocación.

**Cómo se explota:** un operador ejecuta `ALTER ROLE viajapro_app CREATEDB` —para un arnés de
pruebas, por un script de aprovisionamiento, desde la consola del proveedor—. Desde ese instante
`aplicar_privilegios_declarados()` sigue ejecutando
`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO viajapro_app` (`:265`) y
**deja de revocarle nada** sobre las cuatro tablas globales. La siguiente migración de políticas le
concede DML completo sobre `enrutamiento_canales`: cualquier inyección SQL en la API repunta el
número de la agencia A hacia el tenant del atacante. Es el crítico 1 del informe de diseño, reabierto
por el otro eje. Las aserciones 8, 9, 10, 21 y 24 no preguntan por ese rol. **Y la 20 se pone verde
activamente:** en `:434` construye la matriz esperada con
`[...r].filter((rol) => roles.includes(rol))`, así que si `viajapro_altas` sale de la vista, lo
esperado para `registrar_enrutamiento` pasa a `[]` y lo real también. **25/25 en verde, aislamiento
perdido.** El guardia de `:326` no ayuda: el conjunto no queda vacío, queda incompleto.

**Corrección:** (1) el filtro excluye **solo** `rolsuper OR rolbypassrls` y `pg_%`; el rol de
migraciones se excluye por identidad declarada, no por atributo —`CREATEDB` es ortogonal a «es un rol
de aplicación» y a esos sí los arregla un `REVOKE`—; (2) `aplicar_privilegios_declarados()` lanza
excepción si algún elemento de `roles_de_aplicacion` no está vigilado; (3) aserción nueva: el
conjunto vigilado **contiene** los tres roles declarados en un literal del archivo de prueba, como la
11 hace con `excepciones_rls`; y la 20 deja de recalcular su expectativa desde el estado que audita.

> **Dictamen sobre la reinterpretación que el ADR no decidía:** la dirección es correcta —filtrar por
> atributo y nunca por lista de nombres— y el predicado es el equivocado. Deja fuera a roles que sí
> deberían vigilarse, y lo hace de forma que las aserciones se vuelven huecas sin quedar vacías.

### [ALTO] `anular_payload` no cierra la carrera que C-3 pedía cerrar: solo cambió de capa

**Dónde:** `.../20261007120300_directorio_de_enrutamiento_y_staging/migration.sql:534-554`; aserción
16 en `tests/aislamiento.spec.ts:676-726`

**Qué pasa:** la función marca el `change` y después anula el payload «donde no exista ningún
`change` pendiente». Eso elimina el comprobar-y-decidir **dentro de una transacción**. La carrera del
ADR es entre **dos transacciones**, y `READ COMMITTED` la deja intacta: el `NOT EXISTS` se evalúa con
la instantánea de la sentencia, que **no ve** el `PROCESADO` aún sin confirmar del otro trabajador.
Como el predicado es falso, el `UPDATE` no toca ninguna fila, no toma bloqueo y no hay reevaluación
EvalPlanQual.

**Cómo se explota:** dos trabajadores terminan los dos últimos `changes` de la misma recepción a la
vez. W1 marca el suyo (sin confirmar) y ve el de W2 como `PENDIENTE` → no anula. W2 hace lo mismo →
no anula. Ambos confirman. **El contenido —teléfono del viajero, texto, a veces un pasaporte, de
varias agencias, en una tabla sin RLS— sobrevive hasta `purgar_recepciones`**, es decir hasta los 30
días en vez de los minutos que el ADR llama «el único plazo que decide la legalidad del apartado».
Sin error ni métrica que lo distinga. La aserción 16 no puede verlo: procesa los tres `changes` **en
secuencia, en un solo proceso** (`:676`), el orden exacto bajo el que la carrera no existe.

**Corrección:** serializar sobre la fila padre como primera sentencia —
`PERFORM 1 FROM public.recepciones_webhook WHERE recepcion_id = p_recepcion_id FOR UPDATE;`. Con eso
W2 espera a que W1 confirme y su siguiente sentencia, con instantánea nueva, ve el `PROCESADO`. Y la
aserción 16 necesita una variante con dos conexiones concurrentes y confirmación entrelazada.

### [ALTO] Un `change` que nunca se resuelve conserva el contenido para siempre

**Dónde:** `migration.sql:541-551` y `:576-581`; aserción 18 en `tests/aislamiento.spec.ts:760-794`

**Qué pasa:** el contenido se anula **solo** cuando no queda ningún `change` `PENDIENTE`, y la purga
se niega a borrar una recepción con algún `PENDIENTE` —correctamente, porque destruiría la
evidencia—. Las dos juntas producen un tercer comportamiento que nadie decidió: **si un `change`
queda permanentemente sin resolver, el payload no se anula nunca y la fila no se borra nunca.**

**Cómo se explota:** un POST trae dos `changes`; el primero se procesa, el segundo agota reintentos
por un error de deserialización. El cuerpo entero —datos personales de viajeros de dos agencias—
queda indefinidamente en una tabla sin RLS, sin responsable del tratamiento identificable para la
parte no resuelta y sin forma de atender un derecho de supresión. La métrica de «`changes` con
`procesado_en` nulo» avisa del atasco, no de la retención.

**Corrección:** separar borrar contenido de borrar fila. Séptima función
`purgar_payloads(p_anteriores_a timestamptz)`, propiedad de `viajapro_staging`, que ponga a `NULL` el
contenido de toda recepción anterior a un plazo **corto** con independencia del estado de sus hijos,
conservando fila, `recepcion_id` y `changes`. El invariante de la 18 queda intacto. Añadirla a la
tabla normativa de §1.3 y a la matriz de la 20.

### [ALTO] La corrección de las particiones está hecha para las dos que existen, no para la clase

**Dónde:** `migration.sql:108-111`, `:600-604`; `001-aislamiento-tenant.sql:271-276`; aserción 24 en
`tests/aislamiento.spec.ts:898-916`

**Qué pasa:** el hallazgo de `datos` es correcto y la corrección cubre padre, `_2026` y `_2027`. La
partición de 2028 la creará «trabajo programado de plataforma» (`:105-107`), un trabajo que **no
existe**. Cuando exista y la cree el rol de migraciones: el
`ALTER DEFAULT PRIVILEGES FOR ROLE <migraciones> ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES`
está vigente, así que la partición **nace** con `UPDATE` y `DELETE` para los tres roles de login; su
propietario será el rol de migraciones, de modo que el `REVOKE` del dueño de `:600-604` no la
alcanza; y nadie reejecuta `aplicar_privilegios_declarados()`.

**Cómo se explota:** el 1 de enero de 2028,
`UPDATE enrutamiento_historial_2028 SET tenant_nuevo = '<tenant del atacante>'` desde `viajapro_app`
reescribe la bitácora que existe para que un secuestro sea demostrable. La aserción 24 no lo ve:
comprueba `UPDATE` sobre el **padre**, y PostgreSQL verifica privilegios sobre la tabla particionada
cuando se accede a través de ella, nunca sobre la partición. La aserción 10 **sí** descendería por
`pg_inherits` (`:370-377`), pero solo contra una base donde esa partición exista: en CI nunca
existirá. Segundo filo, ruidoso pero sin dueño: si en 2028 falta la partición,
`registrar_enrutamiento` falla y **ninguna agencia puede conectar ni reconectar su canal**, porque el
asiento del historial va en la misma transacción.

**Corrección:** (1) las particiones las crea una función `SECURITY DEFINER` propiedad de
`viajapro_enrutador` que en la misma transacción traspasa propiedad, repite el
`REVOKE UPDATE, DELETE, TRUNCATE` del dueño y llama a `aplicar_privilegios_declarados()` —o un *event
trigger* sobre `CREATE TABLE ... PARTITION OF`—; (2) la aserción 24 enumera **todas** las particiones
por `pg_inherits`, también para los dos propietarios; (3) el trabajo anual entra en `ESTADO.md` con
dueño y fecha.

### [ALTO] `registrar_recepcion` es `STRICT`: un argumento nulo es pérdida silenciosa de mensajes después de un 200

**Dónde:** `migration.sql:436-438`, `:520-522`, `:567-569`

**Qué pasa:** una función `STRICT` **devuelve `NULL` sin ejecutar su cuerpo** si cualquier argumento
es nulo. En una función de lectura es lo que §1.4 quería; en una de escritura convierte un error de
programación en un no-op indistinguible del éxito. `registrar_enrutamiento` lo hizo bien —valida y
lanza `22023` (`:340-352`)—; las otras cinco heredaron `STRICT`.

**Cómo se explota:** el implementador del endpoint usa GCM y concatena la etiqueta al texto cifrado,
como el propio ADR permite, y pasa `p_payload_tag = NULL`. Desde ese despliegue **todas** las
llamadas a `registrar_recepcion` devuelven `NULL`, no insertan nada y el endpoint responde `200`.
Meta no reintenta. Se pierden los mensajes de **todas** las agencias, sin una sola excepción en los
registros, y el invariante central del ADR —«no se devuelve 200 antes de que el evento esté en una
tabla durable»— se incumple en silencio. Variante en `anular_payload` con `p_indice` nulo: contenido
sin anular, `change` sin marcar, retorno `NULL`.

**Corrección:** quitar `STRICT` de `registrar_recepcion` y `anular_payload`; validar con
`RAISE EXCEPTION ... USING ERRCODE = '22023'`. Que el llamador trate `NULL` como error, nunca como
`false`.

### [ALTO] Las filas WABA no tienen respaldo del motor: la clave foránea compuesta se aplicó a la mitad del problema

**Dónde:** `migration.sql:45-53`, `:187`, `:380-393`;
`20261007120000_canales_y_cuentas_whatsapp/migration.sql:64`; aserción 25 en
`tests/aislamiento.spec.ts:918-936`

**Qué pasa:** el ADR declara como regla general que **toda referencia cruzada entre tablas con tenant
se impone con clave foránea compuesta**. Se impuso para `canal_id`. Para las filas WABA —`canal_id`
nulo, las que gobiernan todos los eventos de gestión— no hay nada: el directorio ni siquiera guarda
`cuenta_id`, y la única defensa es una comprobación dentro de `registrar_enrutamiento` contra el
**último asiento del historial** de esa cuenta, asiento que no existe la primera vez. Y el orden que
lo elige (`ORDER BY h.ocurrido_en DESC LIMIT 1`, `:384`) usa una columna cuyo valor por omisión es
`CURRENT_TIMESTAMP`, constante dentro de una transacción: todas las filas de un mismo alta empatan y
«la última» es arbitraria. Lo llamativo: la desviación de `datos` **creó el índice que haría posible
la corrección** —`cuentas_whatsapp (id, tenant_id)`— y no lo usó.

**Cómo se explota:** un defecto en el caso de uso de alta —único control declarado para «el `waba_id`
jamás viene del cliente», cuya prueba de extremo a extremo es la tarea 4c, que no existe— escribe una
fila WABA con el tenant propio. Para filas de número el motor lo rechaza con `23503`; la fila WABA
entra sin protestar, y desde el siguiente webhook de plantilla o de cuenta los eventos de gestión de
la agencia ajena se atribuyen al atacante. La aserción 25 solo cubre `canal_id`.

**Corrección:** columna `cuenta_id uuid` en `enrutamiento_canales`, foránea
`(cuenta_id, tenant_resuelto_id) REFERENCES cuentas_whatsapp(id, tenant_id)`, `CHECK` de que
exactamente uno de los dos no es nulo, aserción 25bis simétrica, y `clock_timestamp()` o desempate
monótono en `ocurrido_en`. **Más barato ahora que nunca: la tabla está vacía.**

### [ALTO] `viajapro_altas` existe con `LOGIN` sin contraseña y el repositorio ya publica cuál ponerle

**Dónde:** `.env.example:49-51`; `infra/docker/postgres/init/01-extensions.sql:10-13`;
`20261007120200_roles_de_conexion_y_propietarios/migration.sql:62-69`;
`packages/database/scripts/crear-rol-aplicacion.mjs:71-78`

**Qué pasa:** la migración crea los tres roles sin contraseña a propósito —decisión correcta, un
`LOGIN` sin contraseña no se conecta—. Pero el entorno local documentado la contradice:
`.env.example` muestra `postgresql://viajapro_altas:viajapro_altas@localhost:5432/...` y el init de
Docker **ya hace exactamente eso** para `viajapro_app`
(`CREATE ROLE viajapro_app LOGIN PASSWORD 'viajapro_app'`). `viajapro_altas` y `viajapro_webhook` no
están en ese script, así que el camino documentado no funciona.

**Cómo se explota:** el primer desarrollador que choca con «autentificación fallida» hace lo que el
repositorio le enseña: `ALTER ROLE viajapro_altas PASSWORD 'viajapro_altas'`. `viajapro_altas` es el
**único** rol que puede repuntar el número de cualquier agencia. Contraseña igual al nombre del rol,
publicada en el repositorio, sobre la peor primitiva del sistema después de `BYPASSRLS`. Y como
`rol:crear` rota también la de `viajapro_app`, ejecutarlo rompe el `.env` que el init dejó
funcionando: la fricción empuja en la dirección insegura.

**Corrección:** una sola fuente para el entorno local —o el init crea los tres roles con contraseñas
de desarrollo y `.env.example` las refleja, o `.env.example` deja de mostrar credenciales
inexistentes y `pnpm infra:up` encadena `rol:crear`—, y el guardia de arranque de §1.3 se niega a
arrancar con `APP_ENV != local` si la contraseña coincide con el nombre del rol.

### [MEDIO] `RESET ROLE` dentro de `aplicar_privilegios_declarados()` es código muerto

**Dónde:** `packages/database/prisma/policies/001-aislamiento-tenant.sql:330-341`

Tras `SET LOCAL ROLE %I`, `current_user` **es** `objetivo.dueno`, así que la condición
`IF objetivo.dueno <> current_user` es siempre falsa y el `RESET ROLE` no se ejecuta nunca. El bucle
se autocorrige y los privilegios quedan bien. Lo que queda mal es que la función **retorna con el rol
puesto**: `SET LOCAL` sin cláusula `SET` en la función dura hasta el fin de la transacción. Hoy es
inocuo por casualidad; la próxima migración que añada algo después de la llamada lo ejecutará como
`viajapro_enrutador`. **Corrección:** capturar `session_user` antes del bucle, comparar contra ella,
y `RESET ROLE` **incondicional** al final de cada iteración.

### [MEDIO] El aplicador de RLS y la vista de detección ignoran particiones; el de privilegios no

**Dónde:** `001-aislamiento-tenant.sql:137` y `:184` (`AND NOT c.relispartition`) frente a `:314-327`

Este commit introduce la primera tabla particionada del proyecto. La asimetría es correcta hoy y es
una mina el día que se particione una tabla de negocio, que es inevitable en `mensajes`: la política
iría al padre, `tablas_sin_aislamiento` no reportaría nada, y un `SELECT` directo contra la partición
usaría su propia configuración de RLS, que nadie habilitó. **Fuga completa entre agencias, sin
error.** **Corrección:** que `aplicar_aislamiento_tenant` descienda por `pg_inherits` igual que el
bucle de privilegios. Hacerlo ahora, mientras la única particionada es global.

### [MEDIO] No existe la pimienta, ni la clave de plataforma, ni el trabajo que reconstruye el directorio

**Dónde:** `.env.example` completo; `migration.sql:50` (`pimienta_version SMALLINT NOT NULL`), `:145`
(`clave_version SMALLINT NOT NULL`); `docs/05-seguridad/02-proteccion-de-datos.md` §5

El esquema ya **compromete** al sistema con dos secretos versionados que no existen en ningún sitio.
Sin el trabajo de reconstrucción y sin el indicador de reconstrucción en curso, la rama «desconocido»
de §2 **borra el contenido en el acto** en vez de retener: la primera rotación de pimienta destruye
mensajes de clientes, que es exactamente el daño que RV-6 existe para evitar. **Corrección:**
variables en `.env.example`, entradas en `02-proteccion-de-datos.md` §5 con custodio y periodicidad,
y el trabajo de reconstrucción especificado **antes** de la primera fila real.

### [MEDIO] Nada mantiene el directorio en sincronía con la verdad, y §2 decide a partir del directorio

**Dónde:** `migration.sql:49` frente a `20261007120000_.../migration.sql:49` y `:25`

Tres columnas de estado independientes y ninguna restricción que las ate. Una agencia se da de baja,
el camino de baja marca `canales.estado = 'REVOCADO'` y no llama a `registrar_enrutamiento`:
`resolver_enrutamiento` sigue devolviendo `ACTIVO` y los mensajes de una agencia sin contrato **se
siguen persistiendo, emitiendo y disparando automatizaciones**. Sin contrato no hay finalidad
(Ley 1581), y nada lo pone en rojo. **Corrección:** el camino de baja llama a
`registrar_enrutamiento` en la misma transacción, más una aserción o métrica de reconciliación.

### [MEDIO] Ningún camino de código puede borrar una fila del directorio

**Dónde:** `migration.sql:187` (`ON DELETE RESTRICT`) frente a `20261007120000_.../migration.sql:85`
(`ON DELETE CASCADE`); `migration.sql:200-211`

Borrar un tenant cascadea a `canales` y choca con el `RESTRICT`: falla con `23503`. Y quitar la fila
exige `DELETE` sobre `enrutamiento_canales`, que no tiene ningún rol de login y que ninguna función
ofrece. No es un ataque: es una obligación legal sin camino. La retención de 5 años no tiene quién la
ejecute, y el derecho de supresión de una agencia no se puede atender sin el rol propietario — justo
lo que este ADR no acepta como control. **Corrección:** `purgar_directorio(p_anteriores_a)` acotada a
filas `REVOCADO` de más de cinco años, con asiento en el historial; o decidir que es manual y
escribirlo.

### [MEDIO] `cuentas_whatsapp` admite un token cifrado a medias

**Dónde:** `20261007120000_canales_y_cuentas_whatsapp/migration.sql:26-29`;
`packages/database/prisma/schema.prisma:608-611`

`token_cifrado`, `token_nonce`, `token_tag` y `clave_version` son los cuatro anulables y nada los
ata. Para el payload del staging el ADR exigió versión de clave no nula y se cumplió; para los tokens
de WhatsApp de terceros no se exigió nada. Tampoco hay AAD que ate el texto cifrado a su fila. Nada
distingue un `BYTEA` cifrado de uno con el token en claro: un atajo de depuración no rompe ninguna
restricción y R6 se incumple en silencio. **Corrección:**
`CHECK (num_nonnulls(token_cifrado, token_nonce, token_tag, clave_version) IN (0, 4))`, longitud del
nonce, AAD `id || ':' || tenant_id`, y aserción propia.

### [MEDIO] Dictamen sobre `cuentas_whatsapp`: la desviación es correcta y deja el ADR diciendo algo falso

**Dónde:** `docs/03-adr/0008-...md:338-343` frente a
`20261007120000_canales_y_cuentas_whatsapp/migration.sql:20-38`

**Técnicamente es correcta.** El token del canje se emite sobre el WABA, no sobre un número;
guardarlo en `canales` lo habría duplicado una vez por número. Y resuelve lo que C-2 del informe de
diseño dejó a medias. **No cambia el modelo de amenaza y no deja ningún token fuera del alcance de
RLS:** `cuentas_whatsapp` lleva `tenant_id`, recibe la política explícitamente, queda cubierta por el
bucle dirigido por datos, **no** está en `excepciones_rls`, y `tablas_sin_aislamiento` la vigila.
Tampoco cuenta como quinta tabla global.

**Lo que sí queda roto:** el ADR es inmutable desde su aceptación y ahora afirma algo que el sistema
no cumple. Según R7 y §9 de `CLAUDE.md`, esto necesita un ADR que enmiende §1.1. **Lo discutible no
era la tabla: era que nadie la decidiera.** **Corrección:** ADR-0009 de una página.

### [MEDIO] La aserción 16 está incompleta y no está marcada como omitida donde la regla la vigila

**Dónde:** `tests/aislamiento.spec.ts:632-642`; `docs/03-adr/0008-...md:893-898`

El comentario de la prueba es honesto y explícito. Pero §5 dice que la aprobación caduca «si alguna
de las dieciocho se desactiva **o se marca como omitida**». Media aserción ausente no está ni
desactivada ni marcada: está en verde con un comentario, y un informe de 25/25 no la distingue de las
24 completas.

**Dictamen — tolerable, con tres condiciones y no con una:** (1) el nombre de la prueba dice
`16 (mitad de base de datos)`; (2) `ESTADO.md` 4b lleva la otra mitad como bloqueante nominal; (3) la
mitad de base de datos tampoco cubre la carrera de `anular_payload`, así que la variante concurrente
hace falta igual. Sin las tres, la regla de caducidad del ADR está formalmente incumplida desde este
commit.

### [BAJO] Las aserciones de comportamiento cubren una de las cuatro tablas globales

`tests/aislamiento.spec.ts:323-365` — las 8 y 9, las que el ADR llama clave por ser de
comportamiento, solo prueban `enrutamiento_canales`. `recepciones_webhook`, que contiene PII de
viajeros de varias agencias, está cubierta solo por la comparación de catálogo de la 10.
Parametrizar por `TABLAS_GLOBALES_ADR_0008`.

### [BAJO] `anular_payload` devuelve el `ROW_COUNT` equivocado

`migration.sql:553-554` — `GET DIAGNOSTICS` lee el resultado del **segundo** `UPDATE` y descarta el
del primero. Un `p_indice` inexistente no marca nada y devuelve `true` o `false` según una condición
ajena a lo que se pidió.

### [BAJO] `ocurrido_en` empata dentro de una transacción

`migration.sql:97` y `:384` — `DEFAULT CURRENT_TIMESTAMP` es constante dentro de la transacción;
`ORDER BY ocurrido_en DESC LIMIT 1` desempata arbitrariamente. `clock_timestamp()` o contador
monótono.

### [BAJO] Dos enumerados con los mismos valores y nada que los ate

`20261007120000_.../migration.sql:17` y `20261007120300_.../migration.sql:25`. La duplicación es
defendible; falta la reconciliación.

### [BAJO] `rol:crear` y el init local se pisan

`scripts/crear-rol-aplicacion.mjs:71-78`; `infra/docker/postgres/init/01-extensions.sql:12` —
ejecutar `rol:crear` rota la contraseña de `viajapro_app` y rompe el `.env` que el init dejó
funcionando, sin avisar.

---

## Qué se revisó y no produjo hallazgos

- **Las dos trampas del motor, en lo que cubren.** El orden
  `CREATE → REVOKE PUBLIC → GRANT EXECUTE → ALTER OWNER` de las seis funciones es el único que
  funciona, tal como afirma el comentario. El `SET ROLE viajapro_enrutador` para revocar al propio
  dueño es correcto. Lo incompleto es la cobertura de particiones futuras — hallazgo propio.
- **`search_path` vacío y objetos cualificados** en las seis, verificado uno a uno en el SQL y no solo
  por la aserción 13. **No hay SQL dinámico en ninguna de las seis.**
- **`REVOKE CREATE ON SCHEMA public`** a `PUBLIC` y a los cinco roles, con la concesión temporal a los
  dos propietarios abierta y cerrada dentro de la misma migración.
- **Ninguna de las cuatro tablas globales tiene columna `tenant_id`**, verificado en el DDL.
- **`excepciones_rls` se declara a sí misma** con `'{}'` para los tres roles, y la validación de
  `privilegios` contra un literal antes de componer SQL cierra correctamente la inyección a través de
  la tabla de control.
- **`GRANT %I TO current_user WITH SET TRUE, INHERIT FALSE`** es la elección correcta y no amplía la
  superficie del rol de migraciones, que ya es dueño del esquema.
- **Compatibilidad con PostgreSQL 16.** Revisada sentencia por sentencia. **No hay ninguna
  divergencia de sintaxis entre 16 y 18 que afecte a estas migraciones.** La diferencia real entre
  entornos no es el motor: es que en local y en CI el rol de migraciones es superusuario y en Neon no.
- **Secretos en el repositorio:** revisado el diff completo y `.env.example`. No hay secretos nuevos.
- **Aserción 24 «no puede ser absoluta»:** de acuerdo, y **no es un hallazgo**. Es una propiedad de
  PostgreSQL. Lo que falta son las particiones, que sí lo es.
- **Fuera de alcance de 4a, declarado para que no se confunda con «limpio»:** verificación HMAC del
  webhook, replay, tope de cuerpo, límite de tasa, segmentación en S3, namespacing de Redis, RBAC del
  alta, rotación de tokens de refresco, registro de consentimiento, ventana de 24 h y opt-in. Nada de
  eso existe como código y nada de eso se revisó.

---

## Las tres verificaciones que no son de base de datos: ¿alguna se volvió urgente?

**Sí. Dos de las tres cambiaron de rango, y por razones distintas.**

**1. Prueba de arranque por proceso — pasó de pendiente a urgente, y es la más urgente de las tres.**
Antes de este commit el error no existía: solo había un rol. Ahora hay tres roles de login reales,
`.env.example` documenta cinco cadenas y los tres se diferencian **únicamente** en qué funciones
ejecutan. Apuntar `DATABASE_APP_URL` a `viajapro_altas` es un copiar y pegar entre bloques contiguos
del mismo archivo, y devuelve a toda la API la capacidad de repuntar el número de cualquier agencia.
Ninguna de las 25 aserciones puede detectarlo: todas comprueban privilegios *por rol*, y los
privilegios estarían bien; lo que estaría mal es qué rol se conectó. **Entra en 4b como primera
tarea, no como última.**

**2. Prueba de extremo a extremo del alta — más urgente, y además ya no es sustituible por el
esquema.** Para las filas de **número**, el motor ahora sí da respaldo. Para las filas **WABA** no hay
ninguno. Hasta que se añada `cuenta_id` con su foránea compuesta, esta prueba es el **único** control
existente sobre precisamente las filas que gobiernan todos los eventos de gestión. Precondición dura
de 4b.

**3. Ensayo de rotación de la pimienta — más urgente que antes, pero no por la razón que el ADR
daba.** Lo que cambió es anterior al ensayo: **el esquema ya se comprometió con dos secretos
versionados que no existen.** Y sobre todo **no existe el trabajo de reconstrucción del directorio**,
que el ADR declara que «existe desde el día uno». **Dictamen: el ensayo no es urgente; lo urgente es
que la pimienta exista, tenga custodio y tenga trabajo de reconstrucción antes de la primera fila
real.**

**Y una cuarta verificación que no está en la lista y que este commit acaba de crear:** el **trabajo
de creación de particiones anuales**. No es una prueba, es una pieza de operación, y hoy no tiene
dueño ni fecha. De ella dependen dos cosas: que el historial siga siendo escribible después de 2027
—si falta la partición, ninguna agencia puede conectar su canal— y que la partición nueva no nazca
con `UPDATE` y `DELETE` para los tres roles de login.

---

## Dictamen final

**No entra en `main` tal como está. Seis bloqueantes, todos de la misma clase: el sistema sigue
funcionando y la protección no está.**

1. **CI.** Quitar el `??` de `aislamiento.spec.ts:27`, afirmar identidad y `rolsuper` de la conexión
   de aplicación, y añadir el paso que fija contraseñas y exporta las tres cadenas. Sin esto las 25
   aserciones no son una compuerta.
2. **El filtro de roles.** Excluir solo `rolsuper`/`rolbypassrls`/`pg_%`; excepción al rol de
   migraciones por identidad declarada; `aplicar_privilegios_declarados()` lanza si algún rol de
   aplicación no está vigilado; aserción nueva contra un literal del repositorio; y la 20 deja de
   filtrar su expectativa por el conjunto que audita.
3. **La carrera de `anular_payload`.** `FOR UPDATE` sobre la fila padre, y variante concurrente de la
   aserción 16.
4. **`STRICT` en las funciones de escritura.** Quitarlo de `registrar_recepcion` y `anular_payload`;
   validar con `RAISE EXCEPTION`.
5. **Las filas WABA.** `cuenta_id` con foránea compuesta, `CHECK` de exclusividad y aserción 25bis.
   Barato hoy, caro para siempre tras la primera fila real.
6. **Particiones.** La aserción 24 enumera particiones y propietarios; la creación futura pasa por
   una función que reaplica propiedad y privilegios; el trabajo anual entra en `ESTADO.md` con dueño.

**Antes de 4b, no de `main`:** la séptima función de purga de payloads, las contraseñas y el entorno
local, el `RESET ROLE` muerto, las particiones en el aplicador de RLS, la pimienta y su trabajo de
reconstrucción, la sincronía directorio/verdad, el camino de supresión del directorio, las
restricciones de `cuentas_whatsapp`, el ADR-0009 que enmiende §1.1, y el renombre de la aserción 16.

**Lo que esta auditoría sí certifica:** las cuatro migraciones implementan fielmente lo que el ADR
decidió salvo en los puntos de arriba; las dos trampas del motor son reales y están bien corregidas
para el alcance en que se probaron; y la desviación de `cuentas_whatsapp` es técnicamente acertada y
no deja ningún token fuera de RLS.

**Lo que no certifica:** que estas protecciones estén vivas. Hoy no hay ninguna corrida automática
que las ponga en rojo. Mientras la compuerta no corra sola, **este commit describe un sistema
aislado; no demuestra que lo esté.** Es la misma frase que cerró el informe de diseño, un piso más
abajo.
