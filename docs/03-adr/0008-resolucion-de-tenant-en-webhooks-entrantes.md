# ADR-0008 — Resolución de tenant en webhooks entrantes

- **Estado:** Propuesto — corregido tras auditoría de seguridad, pendiente de aprobación del propietario
- **Fecha:** 2026-10-07
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `whatsapp`, `datos`, `auditor-seguridad`

Extiende [ADR-0002](0002-whatsapp-cloud-api.md) y [ADR-0003](0003-multitenancy.md). No supersede nada.

> **Este documento fue auditado antes de aceptarse y corregido en consecuencia.** Informe completo:
> [`docs/_auditorias/2026-10-07-adr-0008-aislamiento-en-webhooks.md`](../_auditorias/2026-10-07-adr-0008-aislamiento-en-webhooks.md)
> — 3 críticos, 8 altos. El veredicto fue *«la dirección es correcta; lo que falla es la
> especificación»*: la opción A sigue siendo la elegida, y los descartes de C y E se dieron por
> buenos. Lo que cambió está listado en [§6](#6-qué-cambió-por-la-auditoría), con nombre y motivo.
> Se corrige el borrador en vez de escribir un ADR nuevo porque **este nunca estuvo aceptado**; la
> inmutabilidad empieza con la aceptación.

---

## Contexto

La fuerza es un choque directo entre dos decisiones ya cerradas, y aparece el día que se escribe la
primera línea del inbox.

Somos **Tech Provider con Cloud API directo** (ADR-0002): una sola app de Meta, un solo App Secret,
**un solo endpoint** que recibe los webhooks de **todas** las agencias. Meta no sabe nada de nuestros
tenants; manda un identificador suyo y espera un 200 rápido.

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

### La clase de fallo que domina esta decisión

Los tres hallazgos críticos de la auditoría tienen la misma firma, y es la misma del `BYPASSRLS` de
ADR-0007: **dejan el sistema funcionando, con el aislamiento roto, sin producir ningún error.**
Nadie ve una excepción, ninguna prueba se pone en rojo, la aplicación arranca igual.

De ahí la regla que ordena todo lo que sigue: **en este ADR, cada protección que no se pueda poner en
rojo automáticamente no cuenta como protección.** Por eso existe [§5](#5-verificación-las-pruebas-que-tienen-que-existir),
y por eso una nota en la documentación no es una mitigación aceptable.

---

## Opciones consideradas — dónde vive el mapa `phone_number_id` → tenant

### A — Directorio global de enrutamiento, de solo lectura y por función (elegida)

Una tabla sin aislamiento por tenant, con **únicamente** las claves de ruteo: identificador de Meta,
tenant destino, canal, estado. Ni tokens, ni nombres, ni nada de negocio. Ningún rol de aplicación
tiene privilegios directos sobre ella: se consulta por una función que devuelve **una fila a la vez**,
y se escribe por otra función que solo alcanza al rol del camino de alta.

- **Gana:** resuelve el ciclo con una sola lectura en el camino caliente; la superficie expuesta es
  una proyección mínima de ruteo, no datos de negocio; enumerar el directorio deja de ser posible;
  la escritura queda acotada a un único camino HTTP en vez de a toda la API.
- **Cuesta:** dos tablas más en la lista de excepciones a R1, que es una lista que debe crecer muy
  despacio; funciones `SECURITY DEFINER` y cuatro roles de base de datos que hay que crear, separar y
  vigilar; **el mecanismo de concesión de privilegios del proyecto hay que rehacerlo** (ver §1), lo
  que toca archivos que hoy funcionan.
- **Cierra:** nada. Si mañana el directorio se mueve a otro almacén, es una implementación detrás de
  la misma función de resolución.

**Superficie de ataque que abre, sin adornos:** quien logre **escribir** en el directorio puede
repuntar el número de la agencia A hacia el tenant B y **desviarle las conversaciones completas**. Es
la peor primitiva del sistema después de `BYPASSRLS`. Quien logre **leer** obtiene metadatos: qué
teléfonos son de qué UUID. Molesto, no fatal: conocer un `tenant_id` no es una capacidad, porque
`app.current_tenant` se fija desde la sesión verificada en el servidor y nunca desde la petición
(ADR-0003 §5).

### B — Tabla de staging sin dueño y resolución posterior

El evento crudo aterriza en una tabla sin tenant y el tenant se resuelve más tarde.

- **Gana:** durabilidad real antes del 200.
- **Cuesta:** **no resuelve el problema, lo traslada.** Resolver "después" sigue exigiendo leer un
  mapa, y ese mapa sigue estando o protegido por RLS (ilegible) o desprotegido (opción A). Además,
  por sí sola deja contenido de mensajes de todos los tenants en una tabla sin aislamiento durante
  un tiempo indefinido.
- **Cierra:** nada.

**No se descarta: se reubica.** El staging es la respuesta correcta a *dónde se corta entre recibir y
procesar*, no a *dónde vive el mapa*. Se adopta en §4, con sus funciones, su cifrado y su purga.

### C — URL de callback por WABA, con el tenant en la ruta

Meta permite configurar una URL de callback alternativa por WABA. En el alta se le daría a cada
agencia `/webhooks/whatsapp/<token-opaco>`.

- **Gana:** cero lecturas en el camino caliente; el tenant llega resuelto.
- **Cuesta:** **el tenant vendría de la petición**, que es exactamente lo que ADR-0003 §5 declara
  hallazgo crítico. El secreto viviría en una URL: se filtra en registros, en proxies, en cualquier
  traza. Y si la configuración por WABA falla o Meta la revierte, el tráfico cae al endpoint de la app
  y hace falta la opción A de todas formas — se construyen dos caminos y el frágil es el principal.
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

#### 1.1 La tabla

Dos tablas globales, declaradas como excepción a R1 en `docs/02-arquitectura/03-modelo-de-datos.md` §4:

```
enrutamiento_canales
  id                  uuid PRIMARY KEY
  tipo_clave          NUMERO | WABA
  clave_externa       text NOT NULL        -- phone_number_id, o WABA ID
  tenant_resuelto_id  uuid NOT NULL REFERENCES tenants(id)
  canal_id            uuid NULL            -- NULL cuando tipo_clave = WABA
  estado              ACTIVO | SUSPENDIDO | REVOCADO
  creado_en · actualizado_en · revocado_en
  UNIQUE (tipo_clave, clave_externa)

enrutamiento_historial            -- solo inserción; nadie tiene UPDATE ni DELETE
  id · clave_canal
  tenant_anterior · tenant_nuevo
  estado_anterior · estado_nuevo
  actor_usuario_id · actor_tenant_id · motivo · ocurrido_en
```

**Dos claves de resolución, no una.** Verificado contra la documentación oficial
([integración, §4.1](../04-integraciones/01-whatsapp-cloud-api.md)): `metadata.phone_number_id` solo
está garantizado en eventos de `messages`; **los webhooks de plantillas y de cuenta no traen
`metadata` y únicamente llevan el WABA ID** en `entry[].id`. Un directorio con una sola clave deja
los eventos de gestión sin tenant. Por eso las filas `WABA` existen, con `canal_id` nulo: un evento
de gestión apunta a la cuenta, no a un número. Invariante que la función de escritura hace cumplir:
la fila `WABA` y todas las filas `NUMERO` de ese WABA apuntan al mismo tenant.

**`clave_externa` no es la clave primaria del canal, y eso importa.** La misma fuente verifica que un
número borrado y vuelto a añadir **no conserva su `phone_number_id`**, y que migrar un número entre
WABAs cambia su WABA. El canal es una entidad nuestra con UUID propio en `canales`; estos
identificadores son atributos reasignables. Tratarlos como clave primaria convertiría la migración de
número de un cliente en una cirugía de claves foráneas.

**La columna no se llama `tenant_id`, y eso tampoco es cosmético.** Si se llamara así, el aplicador
de políticas le pondría RLS automáticamente y la tabla volvería a ser ilegible sin contexto — el ciclo
otra vez, descubierto en producción. El nombre incómodo es la señal de que esta tabla **no está
aislada** y de que nadie debe asumir que lo está.

Todo lo demás del canal —token cifrado, calidad del número, plantillas, estado visible en la
interfaz— vive en `canales`, con `tenant_id` y RLS. El directorio es una **proyección de ruteo**,
no el registro del canal.

#### 1.2 Los dos fallos silenciosos de los privilegios

Son dos, no uno, y ninguno produce error:

**(a) El `REVOKE` sobre tablas se deshace solo.** No es que se pueda olvidar: `001-aislamiento-tenant.sql`
§4 ejecuta `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO viajapro_app` **cada
vez que se regenera una migración de políticas**, y ese archivo se copia íntegro a cada migración — ya
ocurrió dos veces en este repositorio. `ON ALL TABLES` alcanza al directorio. Aunque alguien escriba
el `REVOKE` perfecto en la migración de ADR-0008, la siguiente corrección de una política RLS lo
revierte sin decir nada, y a partir de ese despliegue cualquier inyección SQL puede repuntar números.

Por eso **el `REVOKE` no puede vivir en una migración puntual: tiene que ser dirigido por datos y
ejecutarse en el mismo bloque que el `GRANT`**, igual que la política RLS:

```
excepciones_rls(tabla text PRIMARY KEY, motivo text NOT NULL, privilegios_app text[] NOT NULL)
```

`001` y `002`, después del `GRANT ... ON ALL TABLES`, recorren esa tabla y ejecutan
`REVOKE ALL ON <tabla> FROM <roles de aplicación>` seguido del `GRANT` de exactamente los privilegios
declarados. Concesión y revocación pasan a ser el mismo mecanismo y **no pueden desincronizarse**.
`enrutamiento_canales`, `enrutamiento_historial` y `recepciones_webhook` entran con
`privilegios_app = '{}'`. El `ALTER DEFAULT PRIVILEGES` se mantiene: su cobertura de tablas futuras
es deseable, y el problema no era él sino la ausencia de contrapeso declarativo.

**(b) El `EXECUTE` sobre funciones nace concedido a `PUBLIC`.** PostgreSQL lo hace por omisión, sin
que nadie escriba un `GRANT`. En el instante de crearse, `registrar_enrutamiento` es ejecutable por
todos los roles de aplicación y por cualquier rol que se cree mañana para analítica o que añada el
proveedor gestionado. **Toda la separación de privilegios de §1.3 no vale nada si esto no se revoca.**
La migración que crea cada función revoca `ALL ON FUNCTION ... FROM PUBLIC` inmediatamente después
del `CREATE`, y el proyecto añade
`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` para que la
próxima función no repita el defecto.

#### 1.3 Los roles: la frontera real es el rol de conexión

Cuatro roles, ninguno con `BYPASSRLS`:

| Rol | Quién lo usa | Qué puede ejecutar de más |
|---|---|---|
| `viajapro_app` | `apps/api`, todo el resto de la API | `registrar_recepcion` |
| `viajapro_altas` | **solo** el caso de uso de Embedded Signup | `registrar_enrutamiento` |
| `viajapro_webhook` | `apps/worker` | `resolver_enrutamiento`, `tomar_recepcion`, purga |
| `viajapro_enrutador` | nadie: **`NOLOGIN`** | Es el propietario de las funciones y de las tablas globales |

Los tres primeros tienen privilegios idénticos sobre las tablas de negocio y se diferencian
**únicamente** en qué funciones pueden ejecutar. Esa es toda la idea: **el rol de conexión es lo único
que una inyección SQL no puede falsear.**

Porque la protección que parecía suficiente no lo es. `registrar_enrutamiento` comprueba
`app.current_tenant` y rechaza filas de otro tenant — pero **ese GUC lo fija el propio rol con
`set_config`, sin ninguna restricción**. Una función `SECURITY DEFINER` no puede distinguir un GUC
puesto por un token de sesión verificado de uno puesto por una inyección SQL. En RLS el motor compara
contra la fila; aquí se compara contra un valor que el atacante controla.

> **La comprobación de tenant dentro de la función es una comprobación de consistencia, no una
> frontera de seguridad.** La frontera es el `EXECUTE`, y por eso el rol general de la API no lo tiene.

`viajapro_enrutador` se crea
`NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`, con el
`REVOKE neon_superuser` condicional que `002-rol-aplicacion.sql` ya aplica a `viajapro_app` — en el
proveedor gestionado la herencia por omisión reintroduce `BYPASSRLS` (ADR-0007), y el propietario de
una función `SECURITY DEFINER` con `BYPASSRLS` es una escalada silenciosa el día que alguien amplíe su
cuerpo. **Este rol no tiene contraseña y nunca la tendrá: no es una credencial, es un propietario.**
Con `NOLOGIN`, "comprometer `viajapro_enrutador`" exige ya ser propietario del esquema o
superusuario, y en ese escenario el aislamiento está perdido de todos modos. Con `LOGIN`, sería una
contraseña en un `.env` cuya posesión concede el secuestro de cualquier conversación.

Y el peor caso sigue acotado: aunque la función fallara, no puede leer ninguna tabla de negocio,
porque tienen `FORCE RLS` y nadie fijó el tenant.

#### 1.4 El alta: el `phone_number_id` jamás viene del cliente

El diseño anterior verificaba de qué tenant era la sesión y **no verificaba de quién era el número**.
Responde a la pregunta equivocada: el ataque no es reclamar un número *para otro tenant*, es reclamar
**el número de otro para el tenant propio**. Es ADR-0003 §5 otra vez, trasplantado de `tenant_id` a
`phone_number_id` — un dato nada secreto, que aparece en integraciones y soportes.

> **Frase simétrica a ADR-0003 §5, y con el mismo rango: el `phone_number_id` y el `waba_id` jamás
> vienen del cliente.** Un identificador de Meta tomado del cuerpo de la petición y escrito en el
> directorio es un hallazgo crítico de auditoría.

De dónde salen entonces:

1. El cliente envía **solo** el `code` del Embedded Signup. Lo que venga además en el cuerpo se ignora:
   sirve para telemetría, nunca para escribir.
2. El servidor lo canjea por el token de negocio y **pide a Meta los números de ese WABA con ese
   token**. Esa respuesta es la prueba de titularidad: el token se emitió sobre el WABA que ese
   usuario administra.
3. `registrar_enrutamiento` se invoca únicamente con identificadores salidos de esa respuesta.
4. Si una fila existe y pertenece a otro tenant, la función rechaza **y emite un evento de seguridad**,
   no un error de usuario: intentar reclamar un número ajeno es una señal.
5. Una fila `REVOCADO` cuyo número Meta reasignó a otra agencia **puede reasignarse, pero solo con la
   prueba de titularidad del punto 2**, y la reasignación queda en `enrutamiento_historial` con ambos
   tenants. Sin esto, la regla "la fila no se borra nunca" se convierte en una denegación de servicio:
   bastaría registrar los identificadores de veinte competidores para que no pudieran darse de alta
   jamás.

#### 1.5 Historial: que un repunte sea demostrable y visible para la víctima

El directorio guarda el estado actual; sin historia, un cambio de titularidad no se detecta, no se
demuestra y la agencia afectada no puede verlo. `registros_auditoria` no sirve: tiene `tenant_id` y
RLS forzada, de modo que el registro quedaría bajo el tenant **atacante**.

`registrar_enrutamiento` escribe en `enrutamiento_historial` dentro de su misma transacción. Ningún
rol tiene `UPDATE` ni `DELETE` sobre esa tabla, ni siquiera su propietario. Todo cambio de
`tenant_resuelto_id` sobre una fila existente **notifica a los dos tenants** y escribe además un
registro de auditoría bajo cada uno: un repunte legítimo no molesta a nadie, uno ilegítimo deja de ser
invisible para la víctima, que es el punto. Métrica: cambios de titularidad por día; en operación
normal es **cero**.

### 2. Un `phone_number_id` que no reconocemos

Primero, la observación que reordena la pregunta: **la firma se valida con nuestro App Secret, que
solo nosotros tenemos.** Una petición con firma válida es tráfico de nuestra propia app de Meta, no de
un desconocido. "Alguien probando a ver qué pasa" no llega hasta aquí. Por eso son tres casos y no dos:

| Caso | Respuesta | Por qué |
|---|---|---|
| **Firma inválida** | `403`, contador por IP, nada encolado, nada persistido | No es tráfico de Meta. Un 200 enseñaría al que prueba que el endpoint existe y responde |
| **Conocido pero `REVOCADO`** — agencia dada de baja | `200`; **el contenido se borra de `recepciones_webhook` en el acto** y el hash permanece; contador por clave; si el tráfico persiste, se desuscribe la app de ese WABA | Devolver error haría que Meta degradara la entrega **para todos los tenants**. Y conservar el contenido de un excliente no tiene base legal: sin contrato no hay finalidad (Ley 1581) |
| **Desconocido** — no hay fila | `200`; **el contenido se borra en el acto**; se conservan solo metadatos (clave, WABA, tipo de evento, hora) en cuarentena 7 días; se alerta | La causa real casi siempre es un alta a medio terminar: la suscripción al WABA quedó hecha y nuestra fila no |

**Borrar el contenido es el primer paso de ambas ramas, antes de cualquier otra cosa.** No es un
matiz: el corte de §4 persiste el cuerpo **antes** de saber de quién es, y un evento que nunca se
procesa con éxito nunca pondría su payload a `NULL` — se quedaría los siete días completos. Un mensaje
con nombre, teléfono y a veces número de pasaporte, almacenado sin aislamiento, sin responsable del
tratamiento identificable y sin posibilidad de atender un derecho de supresión, porque no hay tenant
al que atribuirlo. Decir "se descarta sin persistir" sería falso: lo que el diseño puede cumplir es
**persistir y borrar en el acto**, y así queda escrito.

**La ventana de exposición de contenido de un tenant no identificado va desde la inserción hasta la
clasificación en el trabajador.** Presupuesto: segundos. Si se excede, hay alerta. Es una magnitud
declarada y medible, no una esperanza.

**La fila del directorio no se borra nunca al dar de baja: se marca `REVOCADO`.** Borrarla convierte a
un excliente conocido en un desconocido, pierde la capacidad de distinguir los dos casos de arriba,
impide restablecer el canal si la agencia vuelve, y borra la evidencia de en qué fecha dejamos de
procesar sus datos — que es justo lo que habría que demostrar en una reclamación.

**La cuarentena guarda metadatos, nunca contenido, y no se reproduce automáticamente.** Volcar después
mensajes atribuidos a un tenant del que no estábamos seguros es, literalmente, la operación que puede
cruzar agencias. Si el caso "desconocido" se repite para la misma clave por encima de un umbral y no
hay ningún alta en curso que lo explique, deja de ser un error de alta: se trata como posible
compromiso del App Secret, se escala a una persona y se desuscribe el WABA.

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
4. Llamar a `registrar_recepcion(...)`, que inserta con `ON CONFLICT DO NOTHING` y devuelve si la fila
   era nueva. El payload va **cifrado desde el proceso de Node**, nunca con `pgcrypto` pasando la clave
   dentro del SQL: acabaría en `pg_stat_statements` y en los registros del proveedor. Prohibido
   explícitamente, porque es el atajo que alguien tomará.
5. Encolar en BullMQ **un trabajo por `change`**, no uno por POST.
6. `200`.

**El invariante, que es lo único que hay que recordar de este apartado:**

> **No se devuelve 200 antes de que el evento esté en una tabla durable.**

De ahí se deduce qué pasa si el proceso muere en cada punto: antes del paso 4, no hubo 200 y Meta
reintenta; entre el 4 y el 5, la fila existe y el relay la recoge; después del 5, el trabajo ya está
en la cola. **No existe ninguna ventana en la que hayamos prometido un 200 y el evento se haya
perdido.** Encolar a secas, sin la tabla, sí la tiene: Redis no es un almacén transaccional y una
pérdida ahí es un mensaje de cliente que ningún asesor verá jamás.

**El criterio del relay es "no procesado", no "no encolado".** La diferencia decide si el invariante
es real: con `jobId = recepcion_id`, BullMQ **rechaza en silencio** un trabajo cuyo identificador ya
existe, incluidos los del conjunto de fallidos. Un evento que agota sus reintentos quedaría como
fallido, el relay lo vería como "ya encolado", y Meta ya devolvió su 200: el mensaje se pierde y nadie
se entera — exactamente el modo de fallo que este ADR declara inaceptable. Por tanto:

- `recepciones_webhook` lleva `procesado_en timestamptz NULL`, y el relay barre las filas con
  `procesado_en` nulo y más de treinta segundos. Es la única señal que no depende del estado interno
  de Redis.
- Al reencolar, **el relay elimina antes el trabajo fallido**; el identificador sigue siendo el hash.
- Contador y alerta sobre filas con `procesado_en` nulo y más de cinco minutos. Esa métrica es lo que
  convierte el invariante en algo observable.
- **La purga nunca borra una fila sin procesar.** Borrar un evento no procesado es destruir la
  evidencia del fallo.

**`recepciones_webhook` recibe la misma disciplina que el directorio**, porque es la única tabla con
contenido de varios tenants sin RLS y el cifrado en reposo no la protege de quien tiene la clave:

| Función | Rol | Qué permite |
|---|---|---|
| `registrar_recepcion` | `viajapro_app` | Insertar. Nada más |
| `tomar_recepcion(recepcion_id)` | `viajapro_webhook` | **Una** fila por su identificador exacto. Un barrido masivo deja de existir como operación |
| `anular_payload`, `purgar_recepciones` | `viajapro_webhook` | Acotadas por identificador o por antigüedad, nunca con filtro libre |

Y la separación que cierra el agujero: **la clave de descifrado vive en el proceso del trabajador, no
en la API. El proceso que puede listar no es el que puede descifrar.**

**La clave de plataforma** es una clase nueva, distinta de la de tokens de tenant, y se registra como
entrada propia en `docs/05-seguridad/02-proteccion-de-datos.md` §5 con su custodio y su periodicidad:

- Columnas obligatorias en la fila: texto cifrado, **nonce de 96 bits aleatorio por fila**, etiqueta
  si la biblioteca no la concatena, y **versión de clave, no nula**.
- **AAD = `recepcion_id`**, y tras descifrar se verifica que el sha256 del texto claro coincide con
  `recepcion_id` antes de procesar. Es gratis y ata el texto cifrado a su fila: sustituirlo por el de
  otra recepción deja de pasar desapercibido.
- **Rotación sin recifrado**, aprovechando que el dato vive siete días o menos: las filas nuevas se
  cifran con la versión siguiente; la anterior se conserva **solo para descifrar** hasta que la purga
  vacíe la última fila que la usa, y entonces se retira. Sin versión en la fila, rotar la clave un
  martes a mediodía haría ilegibles todas las recepciones en vuelo —los mensajes de los últimos
  minutos de todas las agencias— y el fallo aparecería como errores de descifrado dispersos que nadie
  relacionaría con el cambio de clave.

**Idempotencia en dos capas, con responsabilidades distintas:**

| Capa | Clave | Qué garantiza |
|---|---|---|
| Recepción | `sha256(cuerpo)` | Mata las tormentas de reintento barato. **Es una optimización** |
| Mensaje | `UNIQUE (tenant_id, provider_message_id)` | **Es la garantía.** Si Meta reagrupa los mismos `wamid` en lotes distintos, el hash difiere y esta capa es la que sostiene la corrección |

**Asíncrono en el trabajador**, por cada `change`:

1. Resolver el tenant: por `metadata.phone_number_id` si viene; si no —eventos de gestión—, por el
   WABA de `entry[].id`. Desconocido o revocado → §2, **borrando el payload en el acto**.
2. Abrir transacción y fijar `app.current_tenant`. **A partir de aquí todo corre bajo RLS**, incluida
   la inserción del mensaje.
3. `asegurarContacto` por el puerto, insertar el mensaje, actualizar los campos denormalizados de la
   conversación, reiniciar la ventana de 24 h, escribir el evento en el `outbox`. Una transacción.
4. Marcar `procesado_en` y anular el payload.
5. Emitir por Socket.IO **después del commit**, a una sala con prefijo de tenant: Redis no está
   cubierto por RLS y su aislamiento es responsabilidad de la aplicación.

La zona sin protección de RLS queda acotada a una franja exacta y descriptible: **entre la validación
de la firma y la resolución del tenant.** En esa franja no se lee ni se escribe ninguna tabla de
negocio. Esa frase es la que hace compatible este diseño con ADR-0003.

**El tenant se resuelve por `change`, nunca por petición.** Confirmado contra la documentación
oficial: un POST puede traer varios `entry[]` y varios `changes[]` **de WABAs distintos**. Un diseño
que fije un solo tenant por petición funciona hasta el día que no, y ese día mezcla agencias. Es el
error más caro posible en este sistema y se evita con una decisión de estructura, no con una
comprobación.

### 5. Verificación: las pruebas que tienen que existir

Cada protección de este ADR que no se pueda poner en rojo automáticamente **no cuenta**. Estas
aserciones se añaden a `packages/database/tests/aislamiento.spec.ts` y son compuerta de integración:

| # | Qué comprueba | Qué fallo atrapa |
|---|---|---|
| 1 | Ninguna de las tres tablas globales tiene columna `tenant_id` | Alguien la añade "por coherencia" y el aplicador las vuelve ilegibles: el ciclo regresa |
| 2 | Las tres están declaradas en `excepciones_rls` con motivo y privilegios | Una tabla sin RLS que nadie justificó |
| 3 | `has_table_privilege` es **falso** para los cuatro verbos, para los tres roles de aplicación, sobre las tres tablas | El `REVOKE` que no se escribió |
| 4 | **Lo mismo, después de volver a aplicar `001` y `002` completos** | El crítico de este ADR: la reconcesión silenciosa en cada migración de políticas. Es la única prueba que la detecta |
| 5 | `has_function_privilege('public', …)` es falso para ambas funciones | El `EXECUTE` que PostgreSQL concede solo |
| 6 | `viajapro_app` **no** puede ejecutar `registrar_enrutamiento`; `viajapro_altas` sí | La separación por camino, que es la frontera real |
| 7 | `viajapro_enrutador`: `rolcanlogin`, `rolbypassrls`, `rolsuper` falsos; no miembro de `neon_superuser` | El propietario convertido en credencial, o con `BYPASSRLS` heredado |
| 8 | El propietario de ambas funciones **es** `viajapro_enrutador` y `prosecdef` es verdadero | Recrear la función sin `ALTER OWNER`: pasaría a ser del propietario del esquema, que en Neon hereda `BYPASSRLS` |
| 9 | Con sesión de T1, registrar una clave que pertenece a T2 → excepción tipada, cero filas modificadas, una fila en `enrutamiento_historial` | El repunte |
| 10 | `purgar_recepciones` no borra ninguna fila con `procesado_en` nulo | Destruir la evidencia de un fallo |
| 11 | Un evento clasificado como desconocido o revocado deja el payload en `NULL` y el hash intacto | La contradicción entre §2 y §4 |

Y tres métricas, porque un invariante sin observabilidad es una intención:

- Filas con `procesado_en` nulo y más de cinco minutos. En operación normal: **cero**.
- Cambios de titularidad en el directorio por día. En operación normal: **cero**.
- Tiempo desde la inserción en `recepciones_webhook` hasta la clasificación. Presupuesto en segundos.

### 6. Qué cambió por la auditoría

Para que nadie repita el razonamiento original creyendo que no se había pensado:

| Hallazgo | Qué decía el borrador | Qué dice ahora |
|---|---|---|
| CRÍTICO — reconcesión | "La migración tiene que revocar explícitamente", tratado como riesgo de olvido | El `GRANT ... ON ALL TABLES` de `001`/`002` **revierte el `REVOKE` en cada migración de políticas**. Se sustituye por `excepciones_rls` dirigida por datos, en el mismo bloque. Prueba 4 |
| CRÍTICO — GUC | "La operación peligrosa no está al alcance del rol de la aplicación. No depende de que nadie recuerde nada" | Era **falso**: `app.current_tenant` lo fija el propio rol. La comprobación dentro de la función es de **consistencia, no una frontera**. La frontera es el `EXECUTE`, separado en `viajapro_altas` |
| CRÍTICO — titularidad | "Nadie puede reclamar un número para un tenant del que no tiene sesión" | Respondía a la pregunta equivocada. Se añade **"el `phone_number_id` jamás viene del cliente"** y la prueba de titularidad por canje del `code` (§1.4) |
| ALTO — `EXECUTE` a `PUBLIC` | No estaba | §1.2(b). **Son dos fallos silenciosos, no uno** |
| ALTO — `recepciones_webhook` | "El riesgo no es cero" | Funciones acotadas, sin privilegios directos, y la clave de descifrado solo en el trabajador |
| ALTO — payload del desconocido | §2 y §4 se contradecían | Borrado del contenido como primer paso, y ventana de exposición declarada |
| ALTO — `jobId` | "El relay barre lo no encolado" | `procesado_en`, eliminación del trabajo fallido antes de reencolar, métrica y purga que respeta lo no procesado |
| ALTO — sin historial | No estaba | `enrutamiento_historial`, solo inserción, con notificación a ambos tenants |
| ALTO — `NOLOGIN` | Se callaba sobre `LOGIN` | Conjunto completo de atributos y la frase: no es una credencial, es un propietario |
| ALTO — clave de plataforma | "Cifrado con la clave de plataforma" | Versión por fila, nonce, AAD, rotación sin recifrado, prohibición de `pgcrypto` con la clave en el SQL |

### Hechos verificados y lo que sigue abierto

Lo que en el borrador eran supuestos ya está verificado contra la documentación oficial por el agente
`whatsapp` ([integración, §4](../04-integraciones/01-whatsapp-cloud-api.md)): un POST puede traer
varios `entry[]` de WABAs distintos; `metadata.phone_number_id` solo está garantizado en eventos de
`messages`; los eventos de gestión únicamente traen el WABA ID; y `phone_number_id` **no** es estable
ante borrado y realta del número.

Sigue abierto, y está mitigado por diseño: Meta no documenta garantías de inmutabilidad de ninguno de
los dos identificadores. Por eso el canal tiene UUID propio y el directorio los trata como atributos
reasignables con historial.

---

## Consecuencias

### Positivas

- El ciclo se rompe en el único punto donde puede romperse, y queda **acotado y nombrado**: tablas de
  ruteo y staging sin datos de negocio, y una franja del flujo donde no se toca ninguna tabla de
  negocio.
- Repuntar un número exige `EXECUTE` sobre `registrar_enrutamiento`, concedido **únicamente al rol del
  camino de alta**: la superficie HTTP que alcanza esa operación pasa de toda la API a un endpoint.
  Y si ocurre, queda en un historial que nadie puede modificar y que la víctima ve.
- Concesión y revocación de privilegios pasan a ser **el mismo mecanismo declarativo**, de modo que no
  pueden desincronizarse. Esto corrige un defecto que ya existía en el repositorio, no solo en este ADR.
- Ningún 200 sin durabilidad, y el relay se guía por "no procesado": no hay pérdida silenciosa de
  mensajes de clientes, ni siquiera cuando un trabajo agota sus reintentos.
- Un tenant dado de baja o un alta a medias **no degradan la entrega de los demás**, y su contenido no
  se conserva ni un ciclo de procesamiento de más.
- El contacto existe desde el primer mensaje: la bandeja nunca muestra un teléfono huérfano.
- El patrón sirve igual para los webhooks de pasarelas de pago en la Fase 4. Esta discusión se tiene
  una vez.

### Negativas

- **Tres tablas sin RLS.** Es una grieta en la propiedad número uno del producto y hay que tratarla
  como tal: declaradas en el modelo de datos, verificadas por la prueba de aislamiento, revisadas en
  cada auditoría integral.
- **Una función `SECURITY DEFINER` es, por definición, una escalada de privilegios.** Acotada a un
  propietario sin login y sin privilegios sobre nada más, pero existe. Toda modificación de su cuerpo
  exige revisión de `auditor-seguridad`, igual que una política RLS.
- **Cuatro roles y tres orígenes de conexión** donde hoy hay uno. Más configuración, más secretos que
  custodiar, más superficie de error en despliegue. Es el precio de que la frontera sea el rol de
  conexión, que es lo único no falsificable desde SQL.
- **Hay que rehacer el mecanismo de concesión de `001` y `002`**, que hoy funcionan. Tocar lo que
  funciona tiene riesgo; no tocarlo garantiza el fallo.
- **El puerto acopla `inbox` a `crm` en el tiempo.** Si `crm` falla, no entran mensajes. Se reintenta,
  pero la bandeja se retrasa.
- Contenido de varios tenants convive segundos en `recepciones_webhook`. Cifrado, acotado por
  funciones, borrado al clasificar y purgado, pero el riesgo no es cero y ahora al menos es medible.
- Una lectura más en el camino caliente del trabajador. Medible; la caché de la opción D existe si
  algún día la medición la justifica.

### Qué habría que cambiar para revertir

Poco y barato en lo estructural: el directorio es reconstruible desde `canales` y la resolución está
detrás de una función; cambiar de almacén es reescribir su cuerpo. Lo caro de revertir es el puerto
síncrono: si `inbox` se extrae como servicio (ADR-0004), `asegurarContacto` pasa a ser una llamada
remota con su latencia y su modo de fallo. Está previsto: el puerto es exactamente la línea de corte.

## Cuándo revisar esta decisión

- **Si el agente `whatsapp` encuentra que Meta cambió la forma del payload** o que alguno de los
  identificadores dejó de estar garantizado.
- **Cuando llegue el primer webhook de pasarela de pago** (Fase 4): o se reutiliza este patrón tal
  cual, o este ADR estaba mal generalizado y hace falta uno nuevo.
- **Si alguna de las once pruebas de §5 se desactiva o se marca como omitida**: la decisión queda
  suspendida hasta entender por qué, igual que ADR-0007 con la prueba de aislamiento. Las protecciones
  de este ADR **son** sus pruebas.
- **Si la resolución del tenant aparece en el perfil de latencia del trabajador**: entonces, y solo
  entonces, la caché en Redis.
- **Si el criterio puerto/evento de §3 se invoca más de tres veces en otros módulos**: ha dejado de
  ser un detalle de esta decisión y merece su propio ADR.
- **Si alguna vez un webhook entrante se atribuye al tenant equivocado**: la decisión no se parchea,
  se revisa entera, empezando por el historial del directorio.
