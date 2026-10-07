# ADR-0008 — Resolución de tenant en webhooks entrantes

- **Estado:** Propuesto — pendiente de revisión de `auditor-seguridad`
- **Fecha:** 2026-10-07
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `whatsapp`, `datos`, `auditor-seguridad` (pendiente)

Extiende [ADR-0002](0002-whatsapp-cloud-api.md) y [ADR-0003](0003-multitenancy.md). No supersede nada.

---

## Contexto

La fuerza es un choque directo entre dos decisiones ya cerradas, y aparece el día que se escribe la
primera línea del inbox.

Somos **Tech Provider con Cloud API directo** (ADR-0002): una sola app de Meta, un solo App Secret,
**un solo endpoint** que recibe los webhooks de **todas** las agencias. Meta no sabe nada de nuestros
tenants; manda un `phone_number_id` y espera un 200 rápido.

Nuestro aislamiento (ADR-0003, R1, R2) exige lo contrario: toda tabla de negocio lleva `tenant_id`,
RLS forzada, política contra `current_setting('app.current_tenant')`, y la aplicación entra con
`viajapro_app`, que **no puede saltarse RLS**. La política se aplica **dirigida por datos**: toda
tabla con columna `tenant_id` la recibe automáticamente
(`packages/database/prisma/policies/001-aislamiento-tenant.sql`).

El choque, en una frase: **para saber de qué agencia es el webhook hay que leer una tabla, y si esa
tabla está protegida por tenant, hay que saber la agencia para leerla.** Huevo y gallina.

El atajo obvio —un rol con `BYPASSRLS` solo para resolver el mapa— está prohibido por R2 y además
`prisma.service.ts` aborta el arranque si detecta ese atributo. Correcto: el día que exista ese rol,
alguien lo usará para "una consulta más".

Tres cosas más que presionan sobre la misma decisión y conviene resolver de una vez:

- **Latencia.** Si tardamos o devolvemos error, Meta reintenta y luego **degrada la entrega a nuestro
  endpoint para todos los tenants**. Un tenant que se dio de baja puede dañar la bandeja de los demás.
- **Durabilidad.** Un 200 es una promesa: Meta no vuelve a intentarlo. Si el evento se pierde después
  de ese 200, un asesor nunca ve el mensaje de un cliente y el producto falló en silencio.
- **Frontera de módulos.** `inbox` necesita un `Contacto`, que es de `crm`, y lo necesita **en el
  mismo instante**, no eventualmente. R4 prohíbe que los módulos se importen entre sí.

Esto no es un problema de WhatsApp: es el problema de **todo webhook de un tercero multi-tenant.**
Las pasarelas de pago (Fase 4) llegarán con la forma idéntica. Lo que se decida aquí es el patrón.

---

## Opciones consideradas — dónde vive el mapa `phone_number_id` → tenant

### A — Directorio global de enrutamiento, de solo lectura y por función (elegida)

Una tabla sin aislamiento por tenant, con **únicamente** las claves de ruteo: identificador de Meta,
WABA, tenant destino, canal, estado. Ni tokens, ni nombres, ni nada de negocio. `viajapro_app` no
tiene `SELECT` sobre ella: consulta a través de una función que devuelve **una fila a la vez**, y
escribe a través de otra función que exige contexto de tenant válido.

- **Gana:** resuelve el ciclo con una sola lectura en el camino caliente; la superficie expuesta es
  una proyección mínima y pública-ish (qué número pertenece a qué UUID), no datos de negocio;
  enumerar el directorio completo deja de ser posible; las escrituras quedan acotadas al tenant
  autenticado, que es la propiedad que de verdad importa.
- **Cuesta:** una tabla más en la lista de excepciones a R1, que es una lista que debe crecer muy
  despacio; dos funciones `SECURITY DEFINER` y un rol propietario dedicado que hay que crear y
  vigilar; el `ALTER DEFAULT PRIVILEGES` de `002-rol-aplicacion.sql` concede escritura sobre toda
  tabla futura, así que la migración **tiene que revocar explícitamente** o la protección nace rota.
- **Cierra:** nada. Si mañana el directorio se mueve a otro almacén, es una implementación detrás de
  la misma función de resolución.

**Superficie de ataque que abre, sin adornos:** quien logre **escribir** en el directorio puede
repuntar el número de la agencia A hacia el tenant B y **desviar sus conversaciones completas**. Es
la peor primitiva del sistema después de `BYPASSRLS`, y por eso la escritura no se concede al rol de
aplicación. Quien logre **leer** obtiene metadatos: qué teléfonos son de qué UUID. Molesto, no fatal:
conocer un `tenant_id` no es una capacidad, porque `app.current_tenant` se fija desde la sesión
verificada en el servidor y nunca desde la petición (ADR-0003 §5).

### B — Tabla de staging sin dueño y resolución posterior

El evento crudo aterriza en una tabla sin tenant y el tenant se resuelve más tarde.

- **Gana:** durabilidad real antes del 200.
- **Cuesta:** **no resuelve el problema, lo traslada.** Resolver "más tarde" sigue exigiendo leer un
  mapa, y ese mapa sigue estando o protegido por RLS (ilegible) o desprotegido (opción A). Además,
  por sí sola deja contenido de mensajes de todos los tenants en una tabla sin aislamiento durante
  un tiempo indefinido.
- **Cierra:** nada.

**No se descarta: se reubica.** El staging es la respuesta correcta a *dónde se corta entre recibir y
procesar*, no a *dónde vive el mapa*. Se adopta en la decisión §4, con su contenido cifrado y su
purga.

### C — URL de callback por WABA, con el tenant en la ruta

Meta permite configurar una URL de callback alternativa por WABA. En el alta se le daría a cada
agencia `/webhooks/whatsapp/<token-opaco>`.

- **Gana:** cero lecturas en el camino caliente; el tenant llega resuelto.
- **Cuesta:** **el tenant vendría de la petición**, que es exactamente lo que ADR-0003 §5 declara
  hallazgo crítico de auditoría. El secreto viviría en una URL: se filtra en registros, en proxies,
  en cualquier traza. Y si la configuración por WABA falla o Meta la revierte, el tráfico cae al
  endpoint de la app y hace falta la opción A de todas formas — es decir, se construyen dos caminos
  y el frágil es el principal.
- **Cierra:** la posibilidad de afirmar sin matices que el tenant nunca se deriva de la petición.
  Esa frase vale más que la latencia que ahorra.

**Descartada.** Queda escrita porque es la propuesta que alguien hará dentro de seis meses.

### D — El mapa fuera de PostgreSQL (Redis o configuración)

- **Gana:** resolución en microsegundos, sin tocar la base, sin rozar RLS.
- **Cuesta:** Redis no es la verdad y no está cubierto por RLS (ADR-0003, consecuencias). Hace falta
  un origen durable del que reconstruirlo, que vuelve a ser una tabla. Y una clave envenenada es el
  mismo secuestro de la opción A pero sin `GRANT`, sin función y sin rastro.
- **Cierra:** nada.

**Descartada como verdad, admitida como caché.** Caché de lectura delante de A, con TTL corto e
invalidación explícita en alta y desconexión — **cuando la medición lo pida, no antes.**

### E — Rol de base de datos con `BYPASSRLS` para la resolución

- **Gana:** una línea de código.
- **Cuesta:** viola R2; existe un rol que lo ve todo y nada impide que la segunda consulta que alguien
  escriba con él sea `SELECT * FROM mensajes`. ADR-0007 documenta que este fallo es **silencioso**.
- **Cierra:** la posibilidad de afirmar que el aislamiento lo garantiza el motor.

**Descartada sin discusión.**

---

## Opciones consideradas — la frontera `inbox` → `crm`

El mensaje entrante necesita un `Contacto`. Si el asesor abre la bandeja y ve un teléfono sin nombre
porque el evento aún no se procesó, el producto parece roto. La necesidad es **síncrona**.

### F — Evento de dominio `MensajeRecibido` y que `crm` cree el contacto

- **Gana:** acoplamiento mínimo, dirección del flujo idéntica al mapa de contextos.
- **Cuesta:** el contacto llega tarde. `inbox` tendría que guardar `contacto_id` nulo y rellenarlo
  después, y **todo camino de lectura cargaría para siempre con el estado "aún no hay contacto"**.
  Un retraso del relay se convierte en un defecto visible en la pantalla más usada del producto.
- **Cierra:** la posibilidad de mostrar el nombre del cliente desde el primer mensaje.

### G — Puerto explícito `RegistroDeContactos`, síncrono y en la misma transacción (elegida)

`inbox` declara qué necesita; `crm` lo implementa; el *composition root* los une.

- **Gana:** el contacto existe cuando el mensaje se persiste, en la misma transacción: no hay estado
  intermedio; la operación es idempotente por `(tenant_id, telefono_e164)`, restricción que el
  esquema ya tiene; `crm` sigue siendo el único dueño de `contactos`.
- **Cuesta:** acoplamiento temporal real — si `crm` falla, el mensaje no se persiste y el trabajo se
  reintenta. Es el comportamiento correcto, pero hay que asumirlo conscientemente.
- **Cierra:** extraer `inbox` como servicio sin convertir este puerto en una llamada remota. Dado que
  `inbox` es el primer candidato a extracción (ADR-0004), esto es un costo conocido, no una sorpresa:
  el puerto es precisamente la línea por la que se corta.

### H — Que `inbox` guarde el teléfono y nada más

- **Gana:** independencia total.
- **Cuesta:** dos conceptos de "persona" en el sistema y una reconciliación eterna.
- **Cierra:** el CRM.

---

## Decisión

**Opción A para el mapa, opción G para la frontera, y el staging de la opción B como mecanismo de
durabilidad.** En detalle:

### 1. El directorio de enrutamiento

Una tabla global, declarada como excepción a R1 en `docs/02-arquitectura/03-modelo-de-datos.md` §4:

```
enrutamiento_canales
  phone_number_id      text PRIMARY KEY     -- el identificador que manda Meta
  waba_id              text NOT NULL
  tenant_resuelto_id   uuid NOT NULL REFERENCES tenants(id)
  canal_id             uuid NOT NULL        -- fila en `canales`, que sí es tenant-scoped
  estado               ACTIVO | SUSPENDIDO | REVOCADO
  creado_en · revocado_en
```

**La columna no se llama `tenant_id`, y eso no es cosmético.** Si se llamara así, el aplicador de
políticas le pondría RLS automáticamente y la tabla volvería a ser ilegible sin contexto — el ciclo
otra vez, descubierto en producción. El nombre incómodo es la señal de que esta tabla **no está
aislada** y de que nadie debe asumir que lo está. La prueba de aislamiento debe verificar
explícitamente que esta tabla **no tiene** columna `tenant_id`.

Todo lo demás del canal —token cifrado, calidad del número, plantillas, estado visible en la
interfaz— vive en `canales`, con `tenant_id` y RLS. El directorio es una **proyección de ruteo**,
no el registro del canal.

**Permisos.** `viajapro_app` no tiene ningún privilegio directo sobre la tabla. La migración debe
revocar explícitamente lo que `ALTER DEFAULT PRIVILEGES` le concede por omisión; omitir ese `REVOKE`
deja la protección en nada y no produce ningún error. Dos funciones, ambas con `search_path` fijado:

| Función | Qué hace | Por qué así |
|---|---|---|
| `resolver_enrutamiento(phone_number_id)` | Devuelve **una** fila | Sin `SELECT` sobre la tabla, enumerar el directorio exige adivinar identificadores de Meta |
| `registrar_enrutamiento(...)` | Inserta o actualiza | Exige `app.current_tenant` no vacío y **rechaza tocar una fila de otro tenant**: reimplementa la semántica de RLS dentro de la función |

Ambas son `SECURITY DEFINER` y su propietario es un rol dedicado —`viajapro_enrutador`,
`NOBYPASSRLS NOSUPERUSER`— cuyo único privilegio en toda la base es esa tabla. **El propietario no
puede ser el rol propietario del esquema:** en un PostgreSQL gestionado ese rol hereda `BYPASSRLS`
(ADR-0007), y una función `SECURITY DEFINER` suya sería una escalada de privilegios silenciosa el día
que alguien amplíe su cuerpo. Con el rol dedicado, el peor caso de un error en la función es leer un
directorio de ruteo; las tablas de negocio siguen devolviendo cero filas porque tienen `FORCE RLS` y
nadie fijó el tenant.

**El alta solo puede ocurrir dentro de una sesión autenticada de la agencia.** El Embedded Signup lo
inicia un usuario de esa agencia: hay tenant en contexto, y `registrar_enrutamiento` lo exige. Nadie
puede reclamar un número para un tenant del que no tiene sesión.

### 2. Un `phone_number_id` que no reconocemos

Primero, la observación que reordena la pregunta: **la firma se valida con nuestro App Secret, que
solo nosotros tenemos.** Una petición con firma válida es tráfico de nuestra propia app de Meta, no de
un desconocido. "Alguien probando a ver qué pasa" no llega hasta aquí. Por eso son tres casos y no dos:

| Caso | Respuesta | Por qué |
|---|---|---|
| **Firma inválida** | `403`, contador por IP, nada encolado, nada persistido | No es tráfico de Meta. Un 200 enseñaría al que prueba que el endpoint existe y responde |
| **Conocido pero `REVOCADO`** — agencia dada de baja | `200`, se descarta sin persistir contenido, contador por `phone_number_id`; si el tráfico persiste, **se desuscribe la app de ese WABA** vía Graph API | Devolver error haría que Meta degradara la entrega **para todos los tenants**. Y procesar el contenido de un excliente no tiene ninguna base legal: sin contrato no hay finalidad (Ley 1581) |
| **Desconocido** — no hay fila | `200`, se descarta el contenido, se guardan **solo metadatos** (identificador, WABA, tipo de evento, hora) en cuarentena 7 días, y se alerta | La causa real casi siempre es un alta a medio terminar: la suscripción al WABA quedó hecha y nuestra fila no. La cuarentena permite decirle a la agencia "llegaron N mensajes antes de que terminara la conexión" |

**La fila no se borra nunca al dar de baja: se marca `REVOCADO`.** Borrarla convierte a un excliente
conocido en un desconocido, pierde la capacidad de distinguir los dos casos de arriba, impide
restablecer el canal si la agencia vuelve, y borra la evidencia de en qué fecha dejamos de procesar
sus datos — que es justo lo que habría que demostrar en una reclamación.

**La cuarentena guarda metadatos, nunca contenido, y no se reproduce automáticamente.** Volcar
después mensajes atribuidos a un tenant del que no estábamos seguros es, literalmente, la operación
que puede cruzar agencias. Si el caso "desconocido" se repite para el mismo identificador por encima
de un umbral y no hay ningún alta en curso que lo explique, deja de ser un error de alta: se trata
como posible compromiso del App Secret, se escala a una persona y se desuscribe el WABA.

### 3. `inbox` → `crm`: puerto para lo que hace falta ahora, evento para todo lo demás

No es una disyuntiva: son dos cosas distintas y se usan las dos.

**El puerto.** `inbox` declara la interfaz que necesita; no conoce a `crm`:

```
asegurarContacto({ telefonoE164, nombrePerfil }) → { contactoId }
```

Declaración e identificador de inyección en `apps/api/src/shared/puertos/`; implementación en
`crm/infrastructure/`; unión en el módulo raíz. Ninguno de los dos módulos importa al otro: ambos
dependen de una declaración compartida sin dueño, y el grafo sigue siendo acíclico. La regla de
ESLint y el hook que vigilan R4 deben admitir `shared/puertos` y **solo** eso.

Para que `shared/puertos` no se convierta en el basurero del sistema —riesgo real— un puerto entra
ahí si y solo si tiene **un único implementador**, y su archivo nombra en cabecera al módulo dueño.
Si `apps/worker` acaba necesitando los mismos puertos, se mueven a un paquete ese día; mover un
archivo de tipos es barato, un paquete prematuro no.

Tres propiedades no negociables del puerto:

- **Idempotente** por `(tenant_id, telefono_e164)` — la restricción ya está en `contactos`.
- **Se ejecuta en la misma transacción** que la inserción del mensaje. O existen los dos, o ninguno.
- **No toca el consentimiento.** Que un viajero escriba abre la ventana de servicio; **no** autoriza
  iniciar conversaciones ni enviar marketing. `consentimiento_en` se llena con un acto explícito y
  auditable, nunca como efecto colateral de recibir un mensaje.

**El evento.** Además, y en la misma transacción, se escribe `MensajeRecibido` en el `outbox`, para
`automation`, `analytics` y `audit`. El criterio general que queda fijado:

> **Si el usuario lo necesita en la misma pantalla y en el mismo instante, es un puerto. Si es una
> consecuencia que puede ocurrir un segundo después, es un evento.** Ante la duda, evento: el puerto
> acopla en el tiempo y hay que pagarlo a conciencia.

### 4. El corte entre recibir y procesar

**Síncrono en el endpoint** (presupuesto: 500 ms, objetivo 100 ms):

1. Leer el **cuerpo crudo**. El parseo de JSON está desactivado en esta ruta: parsear antes rompe la
   firma, y es el error número uno de esta integración.
2. HMAC-SHA256 sobre el cuerpo crudo, comparación en tiempo constante. Inválida → `403` y se acaba.
3. `recepcion_id = sha256(cuerpo crudo)`.
4. `INSERT ... ON CONFLICT DO NOTHING` en `recepciones_webhook` (tabla global, sin tenant: en este
   punto todavía no sabemos de quién es), con el payload **cifrado** con la clave de plataforma.
5. Encolar en BullMQ con `jobId = recepcion_id`.
6. `200`.

**El invariante, que es lo único que hay que recordar de este apartado:**

> **No se devuelve 200 antes de que el evento esté en una tabla durable.**

De ahí se deduce qué pasa si el proceso muere en cada punto: antes del paso 4, no hubo 200 y Meta
reintenta; entre el 4 y el 5, la fila existe y un relay barre lo no encolado pasados unos segundos
—el mismo patrón del `outbox`, en sentido contrario—; después del 5, el trabajo ya está en la cola.
**No existe ninguna ventana en la que hayamos prometido un 200 y el evento se haya perdido.** Encolar
a secas, sin la tabla, sí la tiene: Redis no es un almacén transaccional y una pérdida ahí es un
mensaje de cliente que ningún asesor verá jamás.

`recepciones_webhook` es la única tabla donde hay contenido de varios tenants sin RLS, y por eso
nace con su mitigación completa, no con una promesa: el payload se cifra en reposo (AES-256-GCM,
R6), se pone a `NULL` en cuanto el evento se procesa con éxito, y la fila se purga a los 7 días —
conserva solo su hash, que es lo que da la idempotencia.

**Idempotencia en dos capas, con responsabilidades distintas:**

| Capa | Clave | Qué garantiza |
|---|---|---|
| Recepción | `sha256(cuerpo)` | Mata las tormentas de reintento barato. **Es una optimización** |
| Mensaje | `UNIQUE (tenant_id, provider_message_id)` | **Es la garantía.** Si Meta reagrupa los mismos `wamid` en lotes distintos, el hash difiere y esta capa es la que sostiene la corrección |

**Asíncrono en el trabajador**, por cada `entry` del payload:

1. Resolver el tenant con `resolver_enrutamiento`. Desconocido o revocado → §2.
2. Abrir transacción y fijar `app.current_tenant`. **A partir de aquí todo corre bajo RLS**, incluida
   la inserción del mensaje.
3. `asegurarContacto` por el puerto, insertar el mensaje, actualizar los campos denormalizados de la
   conversación, reiniciar la ventana de 24 h, escribir el evento en el `outbox`. Una transacción.
4. Emitir por Socket.IO **después del commit**, a una sala con prefijo de tenant: Redis no está
   cubierto por RLS y su aislamiento es responsabilidad de la aplicación.

La zona sin protección de RLS queda acotada a una franja exacta y descriptible: **entre la validación
de la firma y la resolución del tenant.** En esa franja no se lee ni se escribe ninguna tabla de
negocio. Esa frase es la que hace compatible este diseño con ADR-0003.

**El tenant se resuelve por `entry`, nunca por petición.** El payload de Meta es un arreglo y nada
garantiza que todas sus entradas sean del mismo WABA. Un diseño que fije un solo tenant por petición
funciona hasta el día que no, y ese día mezcla agencias. Es el error más caro posible en este sistema
y se evita con una decisión de estructura, no con una comprobación.

### Supuestos, por si cambian

El agente `whatsapp` está verificando la forma exacta del payload contra la documentación oficial.
Esta decisión asume: (a) `phone_number_id` identifica al número de forma estable y aparece en todo
evento entrante; (b) la firma `X-Hub-Signature-256` cubre el cuerpo y se calcula con el App Secret de
la app, único para la plataforma; (c) `entry` es un arreglo que puede contener más de un WABA.

**Si (a) resultara falso** y el identificador estable fuera el WABA, cambia la clave del directorio y
nada más: la estructura, los permisos y el corte entre recibir y procesar se mantienen intactos.

---

## Consecuencias

### Positivas

- El ciclo se rompe en el único punto donde puede romperse, y queda **acotado y nombrado**: una tabla
  de ruteo sin datos de negocio y una franja del flujo donde no se toca ninguna tabla de negocio.
- La operación peligrosa —repuntar un número a otro tenant— no está al alcance del rol de la
  aplicación. No depende de que nadie recuerde nada.
- Ningún 200 sin durabilidad: no hay pérdida silenciosa de mensajes de clientes.
- Un tenant dado de baja o un alta a medias **no degradan la entrega de los demás**.
- El contacto existe desde el primer mensaje: la bandeja nunca muestra un teléfono huérfano.
- El patrón sirve igual para los webhooks de pasarelas de pago en la Fase 4. Esta discusión se tiene
  una vez.

### Negativas

- **Una segunda clase de tabla sin RLS.** Dos, contando el staging. Es una grieta en la propiedad
  número uno del producto y hay que tratarla como tal: ambas declaradas en el modelo de datos,
  ambas verificadas por la prueba de aislamiento, ambas con auditoría recurrente.
- **Una función `SECURITY DEFINER` es, por definición, una escalada de privilegios.** Acotada a un rol
  sin `BYPASSRLS` y sin privilegios sobre nada más, pero existe. Toda modificación de su cuerpo exige
  revisión de `auditor-seguridad`, igual que una política RLS.
- **Un `REVOKE` olvidado en la migración desactiva toda la protección del directorio sin producir
  ningún error.** Es el fallo silencioso de este ADR, equivalente al `BYPASSRLS` de ADR-0007. Debe ser
  una aserción de la prueba de aislamiento, no una nota.
- **El puerto acopla `inbox` a `crm` en el tiempo.** Si `crm` falla, no entran mensajes. Se reintenta,
  pero la bandeja se retrasa.
- Contenido de varios tenants convive unos minutos en `recepciones_webhook`. Cifrado, borrado al
  procesar y purgado a los 7 días, pero el riesgo no es cero.
- Una lectura más en el camino caliente del trabajador. Medible; la caché de la opción D existe si
  algún día la medición la justifica.

### Qué habría que cambiar para revertir

Poco y barato: el directorio es una tabla de dos columnas útiles reconstruible desde `canales`, y la
resolución está detrás de una función. Cambiar de almacén es reescribir el cuerpo de
`resolver_enrutamiento`. Lo caro de revertir no es esto, es el puerto síncrono: si `inbox` se extrae
como servicio (ADR-0004), `asegurarContacto` pasa a ser una llamada remota con su latencia y su modo
de fallo. Está previsto: el puerto es exactamente la línea de corte.

## Cuándo revisar esta decisión

- **Antes de implementar**, si el agente `whatsapp` desmiente alguno de los supuestos de arriba.
- **Cuando llegue el primer webhook de pasarela de pago** (Fase 4): o se reutiliza este patrón tal
  cual, o este ADR estaba mal generalizado y hace falta uno nuevo.
- **Si la resolución del tenant aparece en el perfil de latencia del trabajador**: entonces, y solo
  entonces, la caché en Redis.
- **Si el criterio puerto/evento de §3 se invoca más de tres veces en otros módulos**: ha dejado de
  ser un detalle de esta decisión y merece su propio ADR.
- **Si alguna vez un webhook entrante se atribuye al tenant equivocado**: la decisión no se parchea,
  se revisa entera. Sería la señal de que una de las dos tablas sin RLS se usó para algo que no debía.
