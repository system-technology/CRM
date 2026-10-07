# ADR-0008 — Resolución de tenant en webhooks entrantes

- **Estado:** Propuesto — corregido tras auditoría de seguridad, pendiente de aprobación del propietario
- **Fecha:** 2026-10-07
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `whatsapp`, `datos`, `auditor-seguridad`

Extiende [ADR-0002](0002-whatsapp-cloud-api.md) y [ADR-0003](0003-multitenancy.md). No supersede nada.

> **Este documento fue auditado antes de aceptarse y corregido en consecuencia.** Informe completo:
> [`docs/_auditorias/2026-10-07-adr-0008-aislamiento-en-webhooks.md`](../_auditorias/2026-10-07-adr-0008-aislamiento-en-webhooks.md)
> — **dos pasadas**. La primera: 3 críticos, 8 altos, 13 medios, 5 bajos; diez bloqueantes y quince
> recomendados. La segunda, sobre el texto ya corregido: una regresión introducida por las propias
> correcciones y cinco debilidades en la capa de verificación, más nueve hallazgos no bloqueantes.
>
> El veredicto de fondo no cambió en ninguna de las dos: *«la dirección es correcta; lo que falla es la
> especificación»*. La opción A sigue siendo la elegida y los descartes de C y E se dieron por buenos
> sin reservas. **Están aplicados los diez bloqueantes, los quince recomendados y RV-1 a RV-15**; el
> detalle de qué cambió y por qué está en [§6](#6-qué-cambió-por-la-auditoría).
>
> Vale la pena registrar la lección de la segunda pasada, porque es generalizable: **dos correcciones
> correctas por separado pueden anularse entre sí** (RV-1), y **una protección sin aserción que la
> ponga en rojo no es una protección, aunque esté escrita en el ADR que fija esa regla**.
>
> Se corrige el borrador en vez de escribir un ADR nuevo porque **este nunca estuvo aceptado**: la
> inmutabilidad empieza con la aceptación. Y queda en **Propuesto**: lo aprueba el propietario del
> producto, no el arquitecto que lo escribe ni el auditor que lo revisa.

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
rojo automáticamente no cuenta como protección.** Por eso existe
[§5](#5-verificación-las-aserciones-que-tienen-que-existir), y por eso una nota en la documentación no
es una mitigación aceptable.

---

## Opciones consideradas — dónde vive el mapa `phone_number_id` → tenant

### A — Directorio global de enrutamiento, de solo lectura y por función (elegida)

Una tabla sin aislamiento por tenant, con **únicamente** las claves de ruteo, y esas claves guardadas
como HMAC. Ni tokens, ni nombres, ni fechas, ni nada de negocio. Ningún rol de aplicación tiene
privilegios directos sobre ella: se consulta por una función que devuelve **una fila a la vez**, y se
escribe por otra función que solo alcanza al rol del camino de alta.

- **Gana:** resuelve el ciclo con una sola lectura en el camino caliente; la superficie expuesta es
  una proyección mínima de ruteo; con la clave en HMAC y la pimienta fuera de la base, **un volcado de
  la base no revela ni un solo identificador**; la escritura queda acotada a un único camino HTTP en
  vez de a toda la API.
- **Cuesta:** cuatro tablas más en la lista de excepciones a R1, que es una lista que debe crecer muy
  despacio; seis funciones `SECURITY DEFINER` y cinco roles de base de datos que hay que crear,
  separar y vigilar; **el mecanismo de concesión de privilegios del proyecto hay que rehacerlo** (ver §1.2), lo
  que toca archivos que hoy funcionan; una pimienta más que custodiar y rotar.
- **Cierra:** nada. Si mañana el directorio se mueve a otro almacén, es una implementación detrás de
  la misma función de resolución.

**Superficie de ataque que abre, sin adornos.** Quien logre **escribir** en el directorio puede
repuntar el número de la agencia A hacia el tenant B y **desviarle las conversaciones completas**. Es
la peor primitiva del sistema después de `BYPASSRLS`.

Y quien logre **leerlo entero** obtiene bastante más de lo que el borrador de este ADR admitía —decía
"molesto, no fatal", y era una evaluación equivocada—; obtiene tres cosas:

1. **La lista de objetivos para nuestro token de plataforma.** Como Tech Provider tenemos un token de
   usuario de sistema con acceso a **todos** los WABA de clientes. Sin el directorio, quien robe ese
   token tiene que descubrir a quién atacar; con el directorio, tiene la lista hecha. La combinación
   permite **enviar mensajes suplantando a cualquier agencia**.
2. **La tabla de consulta de todos los `tenant_id`.** Conocer un `tenant_id` no es hoy una capacidad,
   porque `app.current_tenant` se fija desde la sesión verificada. Pero esta tabla convierte cualquier
   bug futuro de ese tipo —una inyección, un parámetro mal cableado, un uso indebido de
   `sinTenantPorqueEsPlataforma`— de "hay que adivinar un UUID" a "elija a quién suplantar". No es
   fatal por sí sola: **es un acelerador**, y así hay que describirla.
3. **El libro de clientes**: cuántas agencias somos y desde cuándo. Para un competidor, eso es todo.

De 1 y 3 salen dos decisiones del diseño final: las claves van en HMAC con pimienta fuera de la base,
y las fechas no viven aquí.

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

#### 1.1 Las tablas

Tablas globales, declaradas como excepción a R1 **en `excepciones_rls`, que es dato en la base**
(ver §1.2) y reflejadas en `docs/02-arquitectura/03-modelo-de-datos.md` §4:

```
enrutamiento_canales              -- cuatro columnas de ruteo, más la versión de pimienta
  clave_canal_hmac    bytea PRIMARY KEY   -- HMAC-SHA256(pimienta, '<tipo>:' || <id de Meta>)
  tenant_resuelto_id  uuid     NOT NULL
  canal_id            uuid     NULL       -- NULL en las filas de tipo WABA
  estado              ACTIVO | SUSPENDIDO | REVOCADO
  pimienta_version    smallint NOT NULL   -- con qué pimienta se calculó la clave

enrutamiento_historial            -- solo inserción, particionada por año (ver retenciones, §4)
  id · canal_id                   -- se indexa por el UUID del canal, NUNCA por el HMAC
  clave_canal_hmac · pimienta_version      -- atributos informativos, no clave de búsqueda
  tenant_anterior · tenant_nuevo
  estado_anterior · estado_nuevo
  actor_usuario_id · actor_tenant_id · motivo · ocurrido_en

recepciones_webhook               -- ver §4
recepciones_webhook_changes       -- ver §4: el grano real del procesamiento es el `change`
excepciones_rls                   -- ver §1.2: tabla de control, y se declara a sí misma
```

**Son cuatro tablas globales**, no tres: `excepciones_rls` también vive en `public` sin `tenant_id` y
también la crea este ADR. Contarla importa porque la regla de parada de Consecuencias se apoya en el
número, y una regla que nace incumplida es inoperante.

**El historial se indexa por `canal_id`, no por el HMAC.** El canal tiene UUID propio y estable; el
HMAC depende de un secreto rotable. Indexar la tabla cuya razón de existir es que un secuestro sea
demostrable por un valor que cambia al rotar la pimienta —en una tabla donde nadie puede
actualizar nada— dejaría la historia de cada número inconsultable para siempre después de la primera
rotación. El HMAC queda como atributo informativo, con su versión de pimienta al lado.

**Las claves van en HMAC, no en claro, y un hash simple no serviría.** `phone_number_id` es numérico y
de espacio pequeño: un SHA-256 se invierte por fuerza bruta en minutos. Con HMAC-SHA256 y una
**pimienta guardada en el almacén de secretos de la aplicación, nunca en la base**, un volcado de la
base, de una réplica, de un respaldo o de la consola del proveedor **no revela ni un solo
identificador**. El límite, dicho sin adornos: a quien comprometa el proceso de la aplicación esto no
le estorba, porque tiene la pimienta. Pero el escenario que crea una tabla sin RLS —acceso de solo
lectura a la base— queda neutralizado por el costo de dos líneas de código.

El tipo entra **dentro** del HMAC (`'pn:'` o `'waba:'`), lo que separa dominios sin necesidad de una
columna de tipo y hace imposible que un identificador de número colisione con uno de cuenta. Es
separación de dominios, no criptografía improvisada: la misma idea que el campo `info` de HKDF. Su
corrección depende de una sola condición, y por eso queda escrita: **el prefijo de dominio termina en
un carácter que el identificador no puede contener** —dos puntos, que un identificador numérico de
Meta nunca lleva—, de modo que el mensaje no es ambiguo. Si algún día el mensaje tuviera un tercer
campo variable, habría que prefijar longitudes; hoy no. Y la fortaleza viene de la pimienta, no del
prefijo: el prefijo separa, no oculta.

**Rotación de la pimienta y recuperación ante su pérdida.** El directorio es **derivado**, no es la
verdad. La verdad son `canales` (tenant-scoped, con los identificadores en claro bajo RLS) y el
historial. Rotar la pimienta es reconstruir el directorio recorriendo tenants, fijando el contexto de
cada uno: un trabajo de plataforma, no una migración de datos, que existe desde el día uno porque es
también el procedimiento de recuperación.

Pero la reconstrucción no es instantánea, y de ahí salen dos obligaciones que no son opcionales —sin
ellas, **una operación de mantenimiento de seguridad destruye mensajes de clientes**, porque un
directorio incompleto no responde "espera", responde "desconocido", y el caso desconocido borra el
contenido en el acto (§2):

1. **Ventana de dos pimientas**, igual que la que §2 define para el App Secret.
   `resolver_enrutamiento` acepta la clave calculada con la pimienta actual y, durante la ventana,
   también con la anterior. `pimienta_version` en cada fila es lo que permite saber qué está
   reconstruido y qué no. **La rotación termina cuando la reconstrucción acaba, no cuando se cambia
   el secreto.**
2. **Mientras haya una reconstrucción en curso, la rama "desconocido" retiene en vez de borrar.** Lo
   gobierna un indicador de plataforma explícito, y la métrica de resoluciones fallidas por minuto es
   la que debe disparar la alerta si alguien rota sin levantarlo.

**Dos claves de resolución, no una.** Verificado contra la documentación oficial
([integración, §4.1](../04-integraciones/01-whatsapp-cloud-api.md)): `metadata.phone_number_id` solo
está garantizado en eventos de `messages`; **los webhooks de plantillas y de cuenta no traen
`metadata` y únicamente llevan el WABA ID** en `entry[].id`. Un directorio con una sola clave deja los
eventos de gestión sin tenant. Por eso existen filas de tipo WABA, con `canal_id` nulo: un evento de
gestión apunta a la cuenta, no a un número. Invariante que la función de escritura hace cumplir: la
fila WABA y todas las filas de número de ese WABA apuntan al mismo tenant.

**Fuera las fechas.** `creado_en` y `revocado_en` no viven aquí: la cronología pertenece a `canales`
—tenant-scoped— y a `enrutamiento_historial`. En el directorio eran el libro de clientes servido a
quien lo leyera.

**Y fuera también el WABA cifrado.** El único camino que necesita ese identificador en claro es la
desuscripción, y el directorio **conoce el tenant** de la fila: ese camino fija el tenant y lo lee de
`canales`, que es donde está la verdad. Guardarlo aquí lo habría dejado cinco años bajo una clave
cuya rotación se diseñó para datos que viven minutos (§4) — es decir, ilegible justo el día que hace
falta, que es el día de responder a un incidente.

**El identificador de Meta no es la clave primaria del canal, y eso importa.** La misma fuente
verifica que un número borrado y vuelto a añadir **no conserva su `phone_number_id`**, y que migrar un
número entre WABAs cambia su WABA. El canal es una entidad nuestra con UUID propio en `canales`; estos
identificadores son atributos reasignables. Tratarlos como clave primaria convertiría la migración de
número de un cliente en una cirugía de claves foráneas.

**Ninguna columna se llama `tenant_id`, en ninguna de las cuatro tablas, y eso no es cosmético.** Si
alguna se llamara así, el aplicador de políticas le pondría RLS automáticamente y la tabla volvería a
ser ilegible sin contexto — el ciclo otra vez, descubierto en producción. El nombre incómodo es la
señal de que estas tablas **no están aisladas** y de que nadie debe asumir que lo están. La aserción
17 de §5 lo verifica.

**`canal_id` no puede apuntar al canal de otro tenant.** Son dos campos independientes y nada obliga a
que concuerden; `registrar_enrutamiento`, que por diseño no tiene privilegios sobre `canales`,
tampoco puede comprobarlo. Lo impone el motor: `UNIQUE (id, tenant_id)` en `canales` y clave foránea
compuesta `(canal_id, tenant_resuelto_id) REFERENCES canales(id, tenant_id)`. **Es el patrón que debe
aplicarse a toda referencia cruzada entre tablas con tenant**, y merece una línea propia en el modelo
de datos.

**Dependencia de orden, declarada porque hoy no se cumple:** `canales` **no existe** en
`schema.prisma`. Este ADR razona sobre ella —es donde viven los tokens cifrados de WhatsApp de
terceros— y coloca una clave foránea hacia una tabla que aún no está especificada. Por tanto: **la
migración del directorio no puede aplicarse antes que la de `canales`**, y `canales` debe
especificarse en `docs/02-arquitectura/03-modelo-de-datos.md` en la misma pasada. Lo que no es
aceptable es la ambigüedad.

#### 1.2 Los dos fallos silenciosos de los privilegios

Son dos, no uno, y ninguno produce error:

**(a) El `REVOKE` sobre tablas se deshace solo.** No es que se pueda olvidar: `001-aislamiento-tenant.sql`
§4 ejecuta `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO viajapro_app` **cada
vez que se regenera una migración de políticas**, y ese archivo se copia íntegro a cada migración — ya
ocurrió dos veces en este repositorio. `ON ALL TABLES` alcanza al directorio. Aunque alguien escriba
el `REVOKE` perfecto en la migración de ADR-0008, la siguiente corrección de una política RLS lo
revierte sin decir nada, y a partir de ese despliegue cualquier inyección SQL puede repuntar números.

> **La revocación debe sobrevivir a la reejecución del aplicador de políticas. Hoy no lo haría.**

Por eso **el `REVOKE` no puede vivir en una migración puntual: tiene que ser dirigido por datos y
ejecutarse en el mismo bloque que el `GRANT`**, igual que la política RLS:

```
excepciones_rls(tabla text, rol text, privilegios text[], motivo text NOT NULL,
                PRIMARY KEY (tabla, rol))
```

**Una fila por par `(tabla, rol)`, no una lista única.** Hay tres roles de login con privilegios
idénticos sobre las tablas de negocio, y el `GRANT ... ON ALL TABLES` los alcanza a los tres. Una
columna llamada `privilegios_app` induce a implementar el `REVOKE` para `viajapro_app` y olvidar los
otros dos — y el olvidado sería `viajapro_webhook`, el rol del proceso que más código ejecuta contra
el directorio. El nombre de la columna es parte del defecto, así que el nombre cambia.

`001` y `002`, después del `GRANT ... ON ALL TABLES`, recorren esa tabla y ejecutan
`REVOKE ALL ON <tabla> FROM <rol>` seguido del `GRANT` de exactamente los privilegios declarados para
ese par. Concesión y revocación pasan a ser el mismo mecanismo y **no pueden desincronizarse**. Las
cuatro tablas globales entran con `privilegios = '{}'` para los tres roles. El
`ALTER DEFAULT PRIVILEGES` se mantiene: su cobertura de tablas futuras es deseable, y el problema no
era él sino la ausencia de contrapeso declarativo.

**`excepciones_rls` se declara a sí misma, y es superficie de confianza, no un catálogo inocuo.** Si
no lo hiciera, el `GRANT ... ON ALL TABLES` le concedería `INSERT, UPDATE, DELETE` a los roles de
aplicación, y entonces el mecanismo que reemplazó al crítico 1 se convertiría en su vehículo: una
inyección SQL que escriba `privilegios = '{SELECT,INSERT,UPDATE}'` para `enrutamiento_canales` no
rompe nada ese día, pero **el siguiente despliegue concede esos privilegios por sí solo** —porque
`001` ahora aplica lo que esa tabla declara— y una comprobación que contrastara lo real contra lo
declarado los validaría como correctos. Con firma de legitimidad. De ahí que la aserción 11 fije las
tripletas `(tabla, rol, privilegios)` contra un literal escrito **en el archivo de prueba**, que vive
en el repositorio y no en la base.

**Esa misma tabla pasa a ser la única fuente de la lista de excepciones.** Hoy hay dos y ya
divergieron: la del SQL (`tenants`, `monedas`, `_prisma_migrations`) y la del documento de modelo de
datos (seis tablas, otros nombres, otro idioma). La que manda es la del SQL; la del documento es
decorativa, y este ADR se apoyaba en la decorativa como mecanismo de control. La vista
`tablas_sin_aislamiento` pasa a consultar `excepciones_rls` en vez de llevar una lista literal, y el
documento se corrige para coincidir. Importa porque **una tabla que entra en esa lista deja de estar
vigilada para siempre**, y este ADR está metiendo tres.

**(b) El `EXECUTE` sobre funciones nace concedido a `PUBLIC`.** PostgreSQL lo hace por omisión, sin
que nadie escriba un `GRANT`. En el instante de crearse, `registrar_enrutamiento` es ejecutable por
todos los roles de aplicación y por cualquier rol que se cree mañana para analítica o que añada el
proveedor gestionado. **Toda la separación de privilegios de §1.3 no vale nada si esto no se revoca.**
La migración que crea cada función revoca `ALL ON FUNCTION ... FROM PUBLIC` inmediatamente después
del `CREATE`, para **las seis** funciones de este ADR, y el proyecto añade
`ALTER DEFAULT PRIVILEGES FOR ROLE <rol de migraciones> IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC` para que la próxima función no repita el defecto.

**El `FOR ROLE` no es decorativo:** sin él, `ALTER DEFAULT PRIVILEGES` solo alcanza a los objetos
creados por el rol que ejecuta la sentencia. Si alguna vez las migraciones corrieran con otro rol, la
protección no aplicaría — sin error, que es el género de omisión de todo este apartado.

#### 1.3 Los roles: la frontera real es el rol de conexión

Cinco roles, ninguno con `BYPASSRLS`. **Esta tabla es normativa**: la aserción 20 la compara, entrada
por entrada y en ambos sentidos, contra los privilegios reales.

| Rol | Quién lo usa | Qué puede ejecutar de más |
|---|---|---|
| `viajapro_app` | `apps/api`, todo el resto de la API | `registrar_recepcion` |
| `viajapro_altas` | **solo** el caso de uso de Embedded Signup | `registrar_enrutamiento` |
| `viajapro_webhook` | `apps/worker` | `resolver_enrutamiento`, `tomar_recepcion`, `anular_payload`, `purgar_recepciones` |
| `viajapro_enrutador` | nadie: **`NOLOGIN`** | Propietario de `enrutamiento_canales`, `enrutamiento_historial` y sus dos funciones |
| `viajapro_staging` | nadie: **`NOLOGIN`** | Propietario de `recepciones_webhook`, su tabla hija y sus cuatro funciones. **Sin ningún privilegio sobre el directorio** |

Los tres de login tienen privilegios idénticos sobre las tablas de negocio y se diferencian
**únicamente** en qué funciones pueden ejecutar. Esa es toda la idea: **el rol de conexión es lo único
que una inyección SQL no puede falsear.**

**Dos propietarios y no uno**, porque `viajapro_app` sí puede ejecutar `registrar_recepcion`, y si esa
función perteneciera al dueño del directorio, su usuario efectivo tendría todos los privilegios sobre
`enrutamiento_canales`. Hoy su cuerpo solo inserta y el control declarado sería "toda ampliación pasa
por revisión" — una revisión humana, justo lo que este ADR no acepta como protección. Dentro de seis
meses alguien amplía esa función para "resolver el tenant de una vez y ahorrar un viaje", ningún
`GRANT` cambia, ninguna aserción se entera, y `viajapro_app` recupera el directorio a través de una
función que siempre pudo ejecutar. Con propietarios separados, **aunque amplíen el cuerpo, la función
no alcanza el directorio**. Es la misma lógica por la que el propietario no puede ser el del esquema.

**Cada proceso afirma al arrancar qué rol espera ser.** Con tres roles de login que no se distinguen
en nada salvo en qué funciones ejecutan, apuntar `DATABASE_APP_URL` a `viajapro_altas` —un error de
variable de entorno, un copiar y pegar entre entornos— devuelve a toda la API la capacidad de ejecutar
`registrar_enrutamiento`, y el guardia de arranque de `prisma.service.ts` no dice nada porque solo
comprueba `BYPASSRLS`: ninguno de los dos roles lo tiene. La aplicación arranca, todo funciona, y el
crítico 2 vuelve a estar abierto en producción. Por tanto la API aborta si `current_user` no es
`viajapro_app`, el trabajador si no es `viajapro_webhook`, y el caso de uso de alta verifica
`viajapro_altas` antes de su primera llamada. Es la línea de código que ya existe, con una comparación
más. **Sin esto, la separación de roles es una convención de despliegue.**

Porque la protección que parecía suficiente no lo es. `registrar_enrutamiento` comprueba
`app.current_tenant` y rechaza filas de otro tenant — pero **ese GUC lo fija el propio rol con
`set_config`, sin ninguna restricción**. Una función `SECURITY DEFINER` no puede distinguir un GUC
puesto por un token de sesión verificado de uno puesto por una inyección SQL. En RLS el motor compara
contra la fila; aquí se compara contra un valor que el atacante controla.

> **La comprobación de tenant dentro de la función es una comprobación de consistencia, no una
> frontera de seguridad.** La frontera es el `EXECUTE`, y por eso el rol general de la API no lo tiene.

**Los dos propietarios** se crean
`NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`, con el `REVOKE neon_superuser`
condicional que `002-rol-aplicacion.sql` ya aplica a `viajapro_app` — en el proveedor gestionado la
herencia por omisión reintroduce `BYPASSRLS` (ADR-0007), y el propietario de una función
`SECURITY DEFINER` con `BYPASSRLS` es una escalada silenciosa el día que alguien amplíe su cuerpo.
**Estos roles no tienen contraseña y nunca la tendrán: no son credenciales, son propietarios.** Con
`NOLOGIN`, "comprometer `viajapro_enrutador`" no existe como escenario independiente: para actuar como
él hay que ser ya propietario del esquema o superusuario, y ahí el aislamiento está perdido con o sin
este ADR. Con `LOGIN`, sería una contraseña en un `.env` cuya posesión concede el secuestro de
cualquier conversación.

Y el peor caso sigue acotado: aunque la función fallara, no puede leer ninguna tabla de negocio,
porque tienen `FORCE RLS` y nadie fijó el tenant.

#### 1.4 Cómo se escriben las funciones

Son **seis** funciones `SECURITY DEFINER`, no dos: `resolver_enrutamiento` y `registrar_enrutamiento`
en el directorio, y `registrar_recepcion`, `tomar_recepcion`, `anular_payload` y `purgar_recepciones`
en el staging (§4). Las reglas de abajo aplican a las seis, y el inventario importa: el control
declarado —"toda modificación de su cuerpo exige revisión"— enunciado sobre dos dejaría cuatro fuera
por un error de conteo, incluidas las dos que pueden borrar evidencia.

`SECURITY DEFINER` sin más es una vulnerabilidad conocida. Las cuatro reglas son parte de la decisión,
no del detalle de implementación:

1. **`search_path` vacío, con todos los objetos cualificados** (`public.enrutamiento_canales`,
   `pg_catalog.now()`). Decir "`search_path` fijado" admite implementaciones inseguras: fijarlo a
   `public` sigue siendo vulnerable si alguien puede crear objetos ahí. El vacío con cualificación es
   la única variante que no depende de quién puede crear qué. Como mitad complementaria, la migración
   revoca `CREATE ON SCHEMA public` a `PUBLIC` y a los roles de aplicación.
2. **Prohibido el SQL dinámico dentro de estas funciones.** Una función `SECURITY DEFINER` que compone
   SQL con un parámetro es una inyección con privilegios ajenos. El proyecto ya usa ese patrón en
   `aplicar_aislamiento_tenant`: **ahí es aceptable porque lo ejecuta una migración con el rol
   propietario y sin entrada de usuario; aquí no lo es.**
3. `resolver_enrutamiento` se declara `STABLE STRICT`; `registrar_enrutamiento`, `VOLATILE`. `STRICT`
   evita tener que razonar sobre la entrada nula.
4. **`resolver_enrutamiento` solo se invoca desde el trabajador de webhooks.** Ninguna ruta HTTP la
   alcanza con entrada de usuario.

**Sobre la enumeración, dicho con precisión.** El borrador afirmaba que "enumerar el directorio
completo deja de ser posible". Es falso: devolver una fila por llamada impide un **volcado**, no una
**enumeración**. La redacción correcta es: *un volcado del directorio deja de ser una sola consulta; la
enumeración sigue siendo posible a costa de N llamadas.* La función **es** un oráculo de pertenencia a
la plataforma; lo que cambia es el costo. Dos cosas lo acotan: con la clave en HMAC el oráculo deja de
aceptar números en claro —hay que tener la pimienta para preguntar, lo que lo cierra para todo el que
no esté ya dentro del proceso—, y lo que quede se vigila con la **métrica de resoluciones fallidas por
minuto, con alerta**.

#### 1.5 El alta: el `phone_number_id` jamás viene del cliente

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
   tenants. Sin esto, la regla "la fila no se borra" se convierte en una denegación de servicio:
   bastaría registrar los identificadores de veinte competidores para que no pudieran darse de alta.

**Quién puede hacerlo dentro de la agencia:** conectar o reconectar el canal de WhatsApp es la
operación más sensible del tenant después de facturar. Queda restringida a `DUENO` y `ADMINISTRADOR`;
ni `ASESOR` ni `SOLO_LECTURA`. Se cubre con una prueba de RBAC, no con una convención.

#### 1.6 Historial: que un secuestro sea detectable y demostrable

El directorio guarda el estado actual; sin historia, un cambio de titularidad no se detecta, no se
demuestra y la agencia afectada no puede verlo. **`registros_auditoria` no sirve para esto**: tiene
`tenant_id` y RLS forzada, de modo que el registro del ataque quedaría archivado bajo el **atacante** y
la víctima no podría verlo nunca. Por eso el historial es una tabla global más, fuera del alcance de
RLS, igual que el directorio al que acompaña.

`registrar_enrutamiento` escribe en `enrutamiento_historial` dentro de su misma transacción. **Ningún
rol tiene `UPDATE` ni `DELETE` sobre esa tabla, ni siquiera su propietario** — lo verifica la aserción
24, porque un `GRANT` sobrante la haría editable y el valor probatorio desaparecería sin ninguna
señal. Su retención de cinco años se ejecuta **soltando particiones anuales**, no borrando filas: así
el plazo es aplicable sin conceder a nadie el `DELETE` que lo invalidaría todo (§4, retenciones). Todo cambio de
`tenant_resuelto_id` sobre una fila existente **notifica a los dos tenants** y escribe además un
registro de auditoría bajo cada uno: un repunte legítimo no molesta a nadie, uno ilegítimo deja de ser
invisible para la víctima, que es el punto. Métrica: cambios de titularidad por día; en operación
normal es **cero**.

### 2. Lo que no reconocemos

Primero, la observación que reordena la pregunta: **la firma se valida con nuestro App Secret, que
solo nosotros tenemos.** Una petición con firma válida es tráfico de nuestra propia app de Meta, no de
un desconocido. "Alguien probando a ver qué pasa" no llega hasta aquí. Por eso son cuatro casos y
ninguno queda sin decidir:

| Caso | Respuesta | Por qué |
|---|---|---|
| **Firma inválida** | `403`; contador por IP y bloqueo temporal tras N; nada encolado, nada persistido. En el registro: longitud del cuerpo, los **ocho primeros bytes de su hash** e IP — **nunca el cuerpo ni la cabecera de firma** | No es tráfico de Meta. Un 200 enseñaría al que prueba que el endpoint existe. Y el cuerpo contiene mensajes de clientes: registrarlo está prohibido sin matices |
| **`SUSPENDIDO`** — impago o investigación | `200`; **se persiste** el mensaje bajo su tenant; **no** se emite por Socket.IO y **no** dispara automatización | El cliente vuelve y su historial debe estar completo. Lo peligroso no era procesarlos: era que **nadie lo hubiera decidido** |
| **`REVOCADO`** — agencia dada de baja | `200`; **el contenido se borra de `recepciones_webhook` en el acto** y el `recepcion_id` permanece; contador por clave | Devolver error haría que Meta degradara la entrega **para todos los tenants**. Y conservar contenido de un excliente no tiene base legal: sin contrato no hay finalidad (Ley 1581) |
| **Desconocido** — no hay fila | `200`; **el contenido se borra en el acto** —salvo que haya una reconstrucción del directorio en curso, y entonces **retiene**, ver §1.1—; cuarentena de metadatos 7 días; alerta | La causa real casi siempre es un alta a medio terminar: la suscripción al WABA quedó hecha y nuestra fila no |

**Borrar el contenido es el primer paso de las dos últimas ramas, antes de cualquier otra cosa.** No
es un matiz: el corte de §4 persiste el cuerpo **antes** de saber de quién es, y un evento que nunca
se procesa con éxito nunca pondría su payload a `NULL` — se quedaría los siete días completos. Un
mensaje con nombre, teléfono y a veces número de pasaporte, almacenado sin aislamiento, sin
responsable del tratamiento identificable y sin posibilidad de atender un derecho de supresión, porque
no hay tenant al que atribuirlo. Decir "se descarta sin persistir" sería falso: lo que el diseño puede
cumplir es **persistir y borrar en el acto**, y así queda escrito.

**La ventana de exposición de contenido de un tenant no identificado va desde la inserción hasta la
clasificación en el trabajador.** Presupuesto: segundos. Si se excede, hay alerta.

**La cuarentena queda cerrada por esquema, no por disciplina.** Guarda exactamente `phone_number_id`,
`waba_id`, tipo de evento, marca de tiempo y un contador. **Ninguna columna más. En particular no
guarda el número del remitente, ni el `wamid`, ni nada derivado del contenido.** La distinción es la
que decide la legalidad: el identificador de número **identifica a la agencia** y es riesgo bajo; el
teléfono del **remitente es dato personal de un ciudadano identificable**, y para él no tenemos ni
responsable del tratamiento ni finalidad. Si alguna vez hace falta investigar con más detalle, se hace
con una decisión documentada y un plazo, no ampliando el esquema.

**La cuarentena no se reproduce automáticamente.** Volcar después mensajes atribuidos a un tenant del
que no estábamos seguros es, literalmente, la operación que puede cruzar agencias.

**Desuscribir el WABA nunca es automático.** Cortar la suscripción deja a esa organización sin recibir
mensajes por nuestra app: como contención ante un compromiso tiene sentido, como respuesta automática
a un contador es un interruptor de apagado para un cliente, accionable por error — por ejemplo con una
agencia que renueva y cuyos mensajes entran contra una fila `REVOCADO` mientras se completa el alta.
El contador **propone**, una persona confirma, y queda excluido todo WABA con un alta en curso en las
últimas 72 horas. Si se quiere automatismo, que sea en el sentido inocuo: dejar de encolar y alertar.

Si el caso "desconocido" se repite para la misma clave por encima de un umbral y no hay ningún alta en
curso que lo explique, deja de ser un error de alta: se trata como posible compromiso del App Secret y
se escala a una persona.

**La fila del directorio no se borra al dar de baja: se marca `REVOCADO`.** Borrarla convierte a un
excliente conocido en un desconocido, pierde la capacidad de distinguir los casos de arriba, impide
restablecer el canal si la agencia vuelve, y borra la evidencia de en qué fecha dejamos de procesar
sus datos. Su retención es de **5 años** —ver §4, retenciones—, no "para siempre".

**Rotación del App Secret.** Todo este apartado descansa sobre él, así que no puede quedar sin
procedimiento: el verificador acepta **una lista de secretos** —actual y anterior— y valida contra
ambos en tiempo constante durante la ventana de rotación. Sin eso, rotar un lunes significa devolver
`403` a tráfico legítimo y que Meta degrade la entrega **para todos los tenants**, que es justo el daño
que este ADR intenta evitar. Ante sospecha de compromiso: **rotar primero, investigar después.**

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

El puerto **no lleva parámetro de tenant**: se apoya en el contexto ambiente de la transacción. Un
`tenant_id` como parámetro es un `tenant_id` que alguien puede pasar mal.

Cinco propiedades no negociables:

- **Idempotente** por `(tenant_id, telefono_e164)` — la restricción ya está en `contactos`.
- **Se ejecuta en la misma transacción** que la inserción del mensaje. O existen los dos, o ninguno.
- **No toca el consentimiento.** Que un viajero escriba abre la ventana de servicio; **no** autoriza
  iniciar conversaciones ni enviar marketing. `consentimiento_en` se llena con un acto explícito y
  auditable, nunca como efecto colateral de recibir un mensaje. *(Esta regla es más estricta que
  `docs/05-seguridad/02-proteccion-de-datos.md` §4, que sugiere lo contrario; lo que hay que corregir
  es ese documento, no esta decisión.)*
- **Marca el origen.** El contacto creado así lleva origen `WHATSAPP_ENTRANTE` y consentimiento nulo.
  Sin esa marca, dentro de seis meses nadie sabrá qué contactos pueden recibir marketing.
- **No sobrescribe `nombre`.** `nombrePerfil` es el nombre de perfil de WhatsApp, controlado al cien
  por cien por quien escribe. Un *upsert* que actualice `nombre` en cada mensaje permite que **un
  cliente se renombre a voluntad en la bandeja de la agencia** —por ejemplo a "ViajaPro Soporte —
  verificar pago en esta cuenta"— y sobrescriba lo que la agencia puso a mano. Es ingeniería social con
  nuestro producto como vector. El nombre de perfil va a columna propia `nombre_perfil_whatsapp`, la
  interfaz lo muestra como dato no verificado del remitente, y se persiste recortado a longitud máxima
  y sin caracteres de control ni marcas de dirección bidireccional. Las exportaciones a hoja de cálculo
  neutralizan la inyección de fórmulas.

**El evento.** Además, y en la misma transacción, se escribe `MensajeRecibido` en el `outbox`, para
`automation`, `analytics` y `audit`. El criterio general que queda fijado:

> **Si el usuario lo necesita en la misma pantalla y en el mismo instante, es un puerto. Si es una
> consecuencia que puede ocurrir un segundo después, es un evento.** Ante la duda, evento: el puerto
> acopla en el tiempo y hay que pagarlo a conciencia.

### 4. El corte entre recibir y procesar

**Síncrono en el endpoint** (presupuesto: 500 ms, objetivo 100 ms):

0. **Tope duro de cuerpo —1 MiB, holgado para Cloud API— aplicado en el servidor HTTP, con `413` antes
   de leer**, más límite de tasa por IP. El HMAC exige el cuerpo entero en memoria, así que **la
   validación de firma no puede protegernos de un cuerpo gigante**: cuando se sabe que la firma es
   inválida, ya se leyó todo. Sin este paso, cuerpos de 50 MB en paralelo degradan la API y con ella
   **la recepción de webhooks legítimos de todas las agencias**.
1. Leer el **cuerpo crudo**. El parseo de JSON está desactivado en esta ruta: parsear antes rompe la
   firma, y es el error número uno de esta integración.
2. HMAC-SHA256 sobre el cuerpo crudo, comparación en tiempo constante, contra la lista de secretos
   válidos. Inválida → `403` y se acaba.
3. `recepcion_id = sha256(cuerpo crudo)`.
4. Llamar a `registrar_recepcion(...)`, que inserta con `ON CONFLICT DO NOTHING` y devuelve si la fila
   era nueva. El payload va **cifrado desde el proceso de Node**, nunca con `pgcrypto` pasando la clave
   dentro del SQL: acabaría en `pg_stat_statements` y en los registros del proveedor. Prohibido
   explícitamente, porque es el atajo que alguien tomará.
5. Encolar en BullMQ **un trabajo por `change`**, no uno por POST, con
   `jobId = recepcion_id || ':' || <índice del change dentro del POST>`.
6. `200`.

**El invariante, que es lo único que hay que recordar de este apartado:**

> **No se devuelve 200 antes de que el evento esté en una tabla durable.**

De ahí se deduce qué pasa si el proceso muere en cada punto: antes del paso 4, no hubo 200 y Meta
reintenta; entre el 4 y el 5, la fila existe y el relay la recoge; después del 5, el trabajo ya está
en la cola. **No existe ninguna ventana en la que hayamos prometido un 200 y el evento se haya
perdido.** Encolar a secas, sin la tabla, sí la tiene: Redis no es un almacén transaccional y una
pérdida ahí es un mensaje de cliente que ningún asesor verá jamás.

**El trabajo transporta únicamente `recepcion_id`. El contenido nunca sale de PostgreSQL.** El atajo
natural —meter el payload en los datos del trabajo para ahorrarse una lectura— deja mensajes de todas
las agencias en Redis **en claro, sin RLS, sin cifrado**, con la retención que BullMQ tenga para
trabajos completados y visibles en cualquier panel de inspección de colas. Va acompañado de política
explícita de eliminación de trabajos completados y fallidos.

**El grano del trabajo, el del identificador y el del estado de proceso tienen que ser el mismo: el
`change`.** Es la lección más cara de esta revisión, porque dos correcciones correctas por separado
—encolar por `change`, y conservar el hash como identificador— **se anulan entre sí**. `recepcion_id`
es el `sha256` del cuerpo **entero** del POST; si ese POST trae tres `changes` de tres agencias
distintas —algo que la documentación oficial confirma como real—, se encolan tres trabajos con el
mismo identificador y BullMQ **descarta dos en silencio**. Se procesa el de la agencia A, se marca la
recepción como procesada, se anula el payload, y **los mensajes de B y de C no existieron nunca**: el
relay no los recupera porque su criterio ya está satisfecho, no hay payload del que reconstruirlos, y
Meta devolvió su 200. Es exactamente el fallo que este apartado existe para evitar, reintroducido por
su propia corrección. Por tanto:

- `recepciones_webhook_changes(recepcion_id, indice, estado, procesado_en)` es donde vive el estado
  de proceso. **`procesado_en` no puede estar en la fila de la recepción**, que es una sola para N
  `changes`. El índice es estable porque el cuerpo es el mismo que produjo el hash.
- El relay barre **`changes`** con `procesado_en` nulo y más de treinta segundos. Es la única señal
  que no depende del estado interno de Redis.
- **Al reencolar, el relay elimina antes el trabajo fallido.** Con el identificador por `change`,
  BullMQ seguiría rechazando en silencio un trabajo cuyo identificador ya existe en el conjunto de
  fallidos: un evento que agota sus reintentos quedaría fallido, el relay lo vería como "ya encolado",
  y el mensaje se perdería igual.
- **El payload se anula cuando todos los `changes` de esa recepción están procesados o clasificados**,
  nunca cuando termina el primero.
- Contador y alerta sobre `changes` con `procesado_en` nulo y más de cinco minutos. Esa métrica es lo
  que convierte el invariante en algo observable.
- **La purga nunca borra una recepción con algún `change` sin resolver.** Borrar un evento no
  procesado es destruir la evidencia del fallo.
- La aserción 16 **pasa por la cola real**, no solo contra la base: una prueba que inserte filas a
  mano no detecta nada de esto, porque el defecto vive en el deduplicador de la cola.

**`recepciones_webhook` y su tabla hija reciben la misma disciplina que el directorio**, porque son
las únicas con contenido de varios tenants sin RLS y el cifrado en reposo no protege de quien tiene la
clave. Las cuatro funciones son `SECURITY DEFINER` y su propietario es **`viajapro_staging`**, que no
tiene ningún privilegio sobre las tablas del directorio (§1.3):

| Función | Rol | Qué permite |
|---|---|---|
| `registrar_recepcion` | `viajapro_app` | Insertar la recepción y una fila hija por `change`. Nada más |
| `tomar_recepcion(recepcion_id, indice)` | `viajapro_webhook` | **Un `change`** por su identificador exacto. Un barrido masivo deja de existir como operación |
| `anular_payload`, `purgar_recepciones` | `viajapro_webhook` | Acotadas por identificador o por antigüedad, nunca con filtro libre |

Y la separación que cierra el agujero: **la clave de descifrado vive en el proceso del trabajador, no
en la API. El proceso que puede listar no es el que puede descifrar.**

**La clave de plataforma** es una clase nueva, distinta de la de tokens de tenant, y se registra como
entrada propia en `docs/05-seguridad/02-proteccion-de-datos.md` §5 con su custodio y su periodicidad,
igual que la pimienta del directorio:

- Columnas obligatorias en la fila: texto cifrado, **nonce de 96 bits aleatorio por fila**, etiqueta
  si la biblioteca no la concatena, y **versión de clave, no nula**.
- **AAD = `recepcion_id`**, y tras descifrar se verifica que el sha256 del texto claro coincide con
  `recepcion_id` antes de procesar. Es gratis y ata el texto cifrado a su fila: sustituirlo por el de
  otra recepción deja de pasar desapercibido.
- **Rotación sin recifrado**, aprovechando que el dato vive minutos: las filas nuevas se cifran con la
  versión siguiente; la anterior se conserva **solo para descifrar** hasta que la purga vacíe la última
  fila que la usa, y entonces se retira. Sin versión en la fila, rotar la clave un martes a mediodía
  haría ilegibles todas las recepciones en vuelo —los mensajes de los últimos minutos de todas las
  agencias— y el fallo aparecería como errores de descifrado dispersos que nadie relacionaría con el
  cambio de clave.

**Retenciones.** Cinco plazos nuevos, cada uno con su finalidad, y ninguno es "para siempre" — el
propio documento de protección de datos dice que *guardar todo para siempre no es una política de
retención: es una ausencia de política*. Las cinco filas se añaden a `02-proteccion-de-datos.md` §4 y
al trabajo programado de retención:

| Dato | Plazo | Finalidad |
|---|---|---|
| Contenido cifrado en `recepciones_webhook` | **Minutos**: se borra al procesar o al clasificar | Su finalidad se agota ahí. **Es el único plazo que decide la legalidad del apartado**: ahí están el teléfono del viajero, el texto y a veces un pasaporte |
| `recepcion_id` y marca de recepción | **30 días**, luego se borra la fila | Idempotencia frente a reintentos del proveedor. No es dato personal —es un `sha256` irreversible—, así que el número es una decisión técnica: cubre con holgura la ventana de reintentos de Meta, que hay que anclar al valor vigente de la documentación oficial. La garantía de corrección no depende de él, sino de `UNIQUE (tenant_id, provider_message_id)`, que es permanente |
| Cuarentena de metadatos | **7 días**, purga automática | Completar un alta a medias |
| Fila del directorio `REVOCADO` | **5 años** | Deber de prueba, alineado con la bitácora de auditoría |
| `enrutamiento_historial` | **5 años**, **por particiones anuales** | Guarda `actor_usuario_id`, dato personal de un empleado identificado. Y como nadie tiene `DELETE` sobre la tabla —es lo que la hace probatoria—, una retención por filas sería literalmente inaplicable: no hay rol que pueda ejecutarla. **Soltar una partición no es un `DELETE` sobre filas**: el invariante de inmutabilidad se conserva intacto y el plazo pasa a ser ejecutable |

Los 5 años sustituyen al "nunca se borra" del borrador: si la agencia es persona natural —habitual en
agencias pequeñas colombianas—, "para siempre" es insostenible frente a un derecho de supresión;
"5 años por deber de prueba" sí se sostiene.

**Idempotencia en dos capas, con responsabilidades distintas:**

| Capa | Clave | Qué garantiza |
|---|---|---|
| Recepción | `sha256(cuerpo)` | Mata las tormentas de reintento barato. **Es una optimización** |
| Mensaje | `UNIQUE (tenant_id, provider_message_id)` | **Es la garantía.** Si Meta reagrupa los mismos `wamid` en lotes distintos, el hash difiere y esta capa es la que sostiene la corrección |

**Asíncrono en el trabajador**, por cada `change`:

1. Resolver el tenant: por `metadata.phone_number_id` si viene; si no —eventos de gestión—, por el
   WABA de `entry[].id`. **El trabajador comprueba el resultado antes de fijar nada**: una resolución
   vacía entra por la rama correspondiente de §2, borrando el payload en el acto. Pasar un nulo a
   `set_config` dejaría el parámetro en cadena vacía, lo que es seguro —cero filas, y la inserción
   falla por `WITH CHECK`— pero se manifiesta como un error de RLS confuso en vez de como el caso
   "desconocido".
2. Abrir transacción y fijar `app.current_tenant`. **A partir de aquí todo corre bajo RLS**, incluida
   la inserción del mensaje. Como defensa en profundidad, antes de cada escritura se afirma que el
   tenant fijado en la sesión es igual al tenant resuelto para ese `change`.
3. `asegurarContacto` por el puerto, insertar el mensaje, actualizar los campos denormalizados de la
   conversación, reiniciar la ventana de 24 h, escribir el evento en el `outbox`. Una transacción.
4. Marcar `procesado_en` **de ese `change`**. Si era el último pendiente de su recepción, anular el
   payload.
5. Emitir por Socket.IO **después del commit**, a una sala con prefijo de tenant: Redis no está
   cubierto por RLS y su aislamiento es responsabilidad de la aplicación. No se emite para tenants
   `SUSPENDIDO`.

**La resolución no usa `sinTenantPorqueEsPlataforma`.** Esa vía de escape está documentada como
"deliberadamente incómoda de nombrar […] si aparece dentro de un módulo de negocio, es un defecto". Si
`inbox` la usara, el defecto que la revisión debía detectar pasaría a ser el funcionamiento normal del
módulo más activo del sistema, y el aviso que emite por cada mensaje obligaría a silenciarlo: **a
partir de ahí la señal se pierde para todo el proyecto.** En su lugar, un método propio y estrecho
—`resolverEnrutamiento(claveHmac)`— en un servicio de plataforma, que solo sabe llamar a la función y
no expone un cliente genérico sin tenant.

La zona sin protección de RLS queda acotada a una franja exacta y descriptible: **entre la validación
de la firma y la resolución del tenant.** En esa franja no se lee ni se escribe ninguna tabla de
negocio. Esa frase es la que hace compatible este diseño con ADR-0003.

**El tenant se resuelve por `change`, nunca por petición.** Confirmado contra la documentación
oficial: un POST puede traer varios `entry[]` y varios `changes[]` **de WABAs distintos**. Un diseño
que fije un solo tenant por petición funciona hasta el día que no, y ese día mezcla agencias. Es el
error más caro posible en este sistema y se evita con una decisión de estructura, no con una
comprobación — y con la aserción 16 de §5, que lo verifica.

### 5. Verificación: las aserciones que tienen que existir

Cada protección de este ADR que no se pueda poner en rojo automáticamente **no cuenta**. Estas
aserciones se añaden a `packages/database/tests/aislamiento.spec.ts`, numeradas a continuación de las
siete que ya existen, y son compuerta de integración:

| # | Aserción | Qué atrapa |
|---|---|---|
| 8 | Un `SELECT` sobre `enrutamiento_canales` lanza `42501` **para los tres roles de login** | El `REVOKE` olvidado **o revertido**. Es la prueba clave: es de comportamiento, no de catálogo, y falla sin importar cómo se concedió el privilegio |
| 9 | `INSERT`, `UPDATE` y `DELETE` directos sobre `enrutamiento_canales` lanzan `42501`, **para los tres roles** | La primitiva de secuestro al alcance de cualquier rol de la aplicación |
| 10 | Para todo par `(tabla, rol)` de `excepciones_rls` y todo privilegio, `has_table_privilege` coincide **exactamente** con lo declarado | Cualquier privilegio sobrante en cualquier tabla global y para cualquier rol. **Es la que sobrevive al paso del tiempo: no enumera tablas, compara contra una declaración** |
| 11 | El conjunto de tripletas `(tabla, rol, privilegios)` de `excepciones_rls` es exactamente el literal escrito **en el archivo de prueba** | Una declaración manipulada. Es lo único que la 10 no puede atrapar, porque la 10 confía en esa declaración y el literal vive en el repositorio |
| 12 | `has_function_privilege('public', …, 'EXECUTE')` es falso para **las seis** funciones | El `EXECUTE` a `PUBLIC` que PostgreSQL concede por omisión. Con `PUBLIC` reteniéndolo sobre `purgar_recepciones` o `anular_payload`, cualquier rol borra evidencia y mensajes sin procesar |
| 13 | El `proconfig` de las seis funciones contiene `search_path=` con **valor vacío**, y el `proowner` de cada una es el que le corresponde (`viajapro_enrutador` o `viajapro_staging`) | Un `search_path` fijado a `public`, que es la implementación que §1.4 rechaza por insegura y que una comprobación de mera presencia aprobaría. Y una función recreada sin `ALTER OWNER`, que la devolvería al propietario del esquema, con `BYPASSRLS` heredado en Neon |
| 14 | `rolcanlogin`, `rolbypassrls` y `rolsuper` son falsos para `viajapro_enrutador` y `viajapro_staging`, y ninguno es miembro de `neon_superuser` | Un propietario convertido en credencial, o con evasión heredada del proveedor |
| 15 | Con el tenant A fijado, `registrar_enrutamiento` sobre una clave de B lanza excepción **y la fila sigue apuntando a B** | La reimplementación de RLS dentro de la función |
| 16 | **A través de la cola real**: un POST con tres `changes` de tres tenants deja los tres mensajes, cada uno en el suyo, y ninguno ve los de los otros | RV-1: el deduplicador de la cola descartando `changes` con el mismo identificador, y el cruce por reutilización de la transacción |
| 17 | Ninguna de las **cuatro** tablas globales tiene columna llamada exactamente `tenant_id`, y las cuatro están declaradas en `excepciones_rls` —incluida ella misma— | Que alguien añada la columna "por coherencia" y el aplicador las vuelva ilegibles: el ciclo regresa. Y que `excepciones_rls` quede escribible, que convierte el remedio del crítico 1 en su vehículo |
| 18 | `purgar_recepciones` no borra ninguna recepción con algún `change` sin resolver | Destruir la evidencia de un fallo |
| 19 | Un evento clasificado como desconocido o revocado deja el payload en `NULL` y el `recepcion_id` intacto | La contradicción entre §2 y §4 |
| 20 | **La matriz completa rol × función** coincide exactamente con la tabla de §1.3, en ambos sentidos: ni falta ni sobra un `EXECUTE` | La frontera que sustituyó al crítico 2. Sin esta aserción, un `GRANT EXECUTE ON ALL FUNCTIONS ... TO viajapro_app` añadido para desatascar un despliegue reabre el crítico entero y las demás aserciones siguen en verde |
| 21 | Ningún rol de login tiene `CREATE` sobre el esquema `public` | La mitad complementaria del `search_path` vacío, que §1.4 promete y nada verificaba |
| 22 | **Tras reaplicar `001` y `002` completos**, las aserciones 8, 9, 10 y 20 siguen pasando | La regresión concreta ya conocida: el aplicador de políticas reconcediendo privilegios |
| 23 | **Tras aplicar la cadena completa de migraciones desde cero**, las aserciones 8, 9, 10 y 20 pasan | La **clase** de fallo, no el archivo: una tercera migración que escriba su propio `GRANT ... ON ALL TABLES` o `ON ALL FUNCTIONS` —que es el idioma de este repositorio— y que la 22 no vería |
| 24 | `UPDATE` y `DELETE` sobre `enrutamiento_historial` lanzan `42501` para los tres roles de login **y para los dos propietarios** | Un `GRANT` sobrante que haga editable la tabla probatoria. El valor probatorio desaparecería sin ninguna señal |
| 25 | Insertar en el directorio una fila que empareje el tenant A con un `canal_id` de B es rechazada por el motor | Una clave foránea escrita simple en vez de compuesta: sigue funcionando y nadie lo nota hasta que una fila cruza tenants |

Tres observaciones sobre el conjunto. La **8** falla en rojo ante cualquier regresión del privilegio,
venga de donde venga, porque es de comportamiento y no de catálogo. La **10** no hay que acordarse de
actualizarla cuando aparezca una tabla global nueva. Y la **22 y la 23 no se sustituyen**: la 22
atrapa la regresión que ya sabemos que existe; la 23 atrapa la que todavía no se ha escrito.

Cuatro métricas, porque un invariante sin observabilidad es una intención:

- `changes` con `procesado_en` nulo y más de cinco minutos. En operación normal: **cero**.
- Cambios de titularidad en el directorio por día. En operación normal: **cero**.
- Resoluciones fallidas por minuto, con alerta. Es lo que acota el oráculo de pertenencia.
- Tiempo desde la inserción en `recepciones_webhook` hasta la clasificación. Presupuesto en segundos.

### 6. Qué cambió por la auditoría

Para que nadie repita el razonamiento original creyendo que no se había pensado:

| Hallazgo | Qué decía el borrador | Qué dice ahora |
|---|---|---|
| CRÍTICO — reconcesión | "La migración tiene que revocar explícitamente", tratado como riesgo de olvido | El `GRANT ... ON ALL TABLES` de `001`/`002` **revierte el `REVOKE` en cada migración de políticas**. Se sustituye por `excepciones_rls` dirigida por datos, en el mismo bloque. Aserciones 8-10 |
| CRÍTICO — GUC | "La operación peligrosa no está al alcance del rol de la aplicación. No depende de que nadie recuerde nada" | Era **falso**: `app.current_tenant` lo fija el propio rol. La comprobación dentro de la función es de **consistencia, no una frontera**. La frontera es el `EXECUTE`, separado en `viajapro_altas` |
| CRÍTICO — titularidad | "Nadie puede reclamar un número para un tenant del que no tiene sesión" | Respondía a la pregunta equivocada. Se añade **"el `phone_number_id` jamás viene del cliente"** y la prueba de titularidad por canje del `code` (§1.5) |
| ALTO — `EXECUTE` a `PUBLIC` | No estaba | §1.2(b). **Son dos fallos silenciosos, no uno** |
| ALTO — `search_path` | "Ambas con `search_path` fijado" | §1.4: **vacío**, con objetos cualificados; prohibido el SQL dinámico; volatilidad declarada; `CREATE ON SCHEMA public` revocado |
| ALTO — `recepciones_webhook` | "El riesgo no es cero" | Funciones acotadas, sin privilegios directos, y la clave de descifrado solo en el trabajador |
| ALTO — payload del desconocido | §2 y §4 se contradecían | Borrado del contenido como primer paso, y ventana de exposición declarada |
| ALTO — `jobId` | "El relay barre lo no encolado" | `procesado_en`, eliminación del trabajo fallido antes de reencolar, métrica, y purga que respeta lo no procesado |
| ALTO — sin historial | No estaba | `enrutamiento_historial`, global y de solo inserción, con notificación a ambos tenants. `registros_auditoria` no servía: archivaría el ataque bajo el atacante |
| ALTO — `NOLOGIN` | Se callaba sobre `LOGIN` | Conjunto completo de atributos y la frase: no es una credencial, es un propietario |
| ALTO — clave de plataforma | "Cifrado con la clave de plataforma" | Versión por fila, nonce, AAD, rotación sin recifrado, prohibición de `pgcrypto` con la clave en el SQL |
| R-1, R-2, R-3 — superficie | Cuatro columnas más fechas, claves en claro; "enumerar deja de ser posible"; lectura "molesta, no fatal" | Claves en **HMAC con pimienta fuera de la base**, fechas movidas a `canales`, y la evaluación corregida: el directorio es la lista de objetivos del token de plataforma y el acelerador de cualquier bug futuro de suplantación. La enumeración sigue siendo posible y se vigila con métrica |
| R-4 a R-15 | `SUSPENDIDO` sin decidir; `canales` inexistente; `canal_id` sin integridad; retenciones ausentes; `nombrePerfil` sobrescribible; sin tope de cuerpo; sin rotación del App Secret; desuscripción automática; payload posible en Redis; `sinTenantPorqueEsPlataforma` en `inbox`; cuarentena sin cerrar; alta sin RBAC | Todos resueltos en §1 a §4, cada uno en su sitio |

Y lo que cambió en la **segunda pasada**, que fue de otra naturaleza: no faltaban decisiones, faltaban
pruebas que las sostuvieran — el criterio que este mismo ADR se había impuesto.

| Hallazgo | Qué decía la primera corrección | Qué dice ahora |
|---|---|---|
| RV-1 — regresión | "Un trabajo por `change`" **y** "el identificador sigue siendo el hash", aplicados por separado | **Se anulaban entre sí**: tres `changes` de tres agencias, tres trabajos con el mismo identificador, dos descartados en silencio y sus mensajes inexistentes. Identificador y estado bajan al grano del `change`; el payload se anula cuando todos están resueltos; la aserción 16 pasa por la cola real |
| RV-2 — la frontera sin prueba | La frontera del crítico 2 solo existía en el texto | Aserción 20: matriz rol × función exacta en ambos sentidos. Y el `EXECUTE` a `PUBLIC` se revoca sobre **seis** funciones, no dos |
| RV-3 — `search_path` | La aserción comprobaba la **presencia** de la clave | Comprueba el **valor vacío**, que es lo que §1.4 exige: una función con `search_path = public` habría pasado la prueba que debía impedirla. Más la aserción 21, el `CREATE` sobre `public` |
| RV-4 — un rol de tres | Aserciones y columna `privilegios_app` en singular | Tres roles de login en las aserciones 8, 9 y 10, y `excepciones_rls` con una fila por par `(tabla, rol)`. El nombre de la columna inducía el error |
| RV-5 — declaración escribible | `excepciones_rls` no se declaraba a sí misma | Se declara, entra en la 17, y la 11 fija las tripletas contra un literal del repositorio. Sin eso, el remedio del crítico 1 era su vehículo |
| RV-6 — rotación de la pimienta | "El directorio es derivado" sin seguir sus consecuencias | Ventana de dos pimientas, `pimienta_version` por fila, historial indexado por `canal_id`, y la rama "desconocido" **retiene** mientras haya reconstrucción. Sin esto, rotar destruía mensajes de clientes |
| RV-7 a RV-15 | `waba_cifrado`; historial sin retención; un solo propietario; guardia de arranque ciego a la identidad; reejecución en prosa; `ALTER DEFAULT PRIVILEGES` sin `FOR ROLE`; conteos de funciones y tablas | Columna eliminada —el claro se lee de `canales`—; historial a 5 años por particiones; `viajapro_staging` como segundo propietario; cada proceso afirma qué rol espera ser; aserciones 22 y 23; `FOR ROLE` explícito; seis funciones y cuatro tablas contadas |

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
- **Un volcado de la base no revela ningún identificador de Meta**: con la pimienta fuera de la base,
  el escenario que la tabla sin RLS crea —réplica, respaldo, consola del proveedor, acceso de solo
  lectura— queda neutralizado.
- Repuntar un número exige `EXECUTE` sobre `registrar_enrutamiento`, concedido **únicamente al rol del
  camino de alta**: la superficie HTTP que alcanza esa operación pasa de toda la API a un endpoint. Y
  si ocurre, queda en un historial que nadie puede modificar y que la víctima ve.
- Concesión y revocación de privilegios pasan a ser **el mismo mecanismo declarativo**, con una sola
  lista de excepciones. Esto corrige un defecto que ya existía en el repositorio, no solo en este ADR.
- Ningún 200 sin durabilidad, y el relay se guía por "no procesado": no hay pérdida silenciosa de
  mensajes de clientes, ni siquiera cuando un trabajo agota sus reintentos.
- Un tenant dado de baja o un alta a medias **no degradan la entrega de los demás**, y su contenido no
  se conserva ni un ciclo de procesamiento de más.
- El contacto existe desde el primer mensaje, y la bandeja no es un vector de suplantación.
- El patrón sirve igual para los webhooks de pasarelas de pago en la Fase 4. Esta discusión se tiene
  una vez.

### Negativas

- **Cuatro tablas globales sin RLS**, de las cuales **tres con datos de ruteo o de negocio** y una de
  control del propio mecanismo. Es una grieta en la propiedad número uno del producto y hay que
  tratarla como tal: declaradas en `excepciones_rls`, verificadas por las aserciones 10, 11 y 17, y
  revisadas en cada auditoría integral. **Si aparece una cuarta tabla global con datos de ruteo o de
  negocio, el patrón está mal** y hay que revisar la decisión, no añadirla a la lista. La regla se
  enuncia así a propósito: una regla de parada que nace incumplida no la invoca nadie.
- **Seis funciones `SECURITY DEFINER` son, por definición, una escalada de privilegios.** Están
  enumeradas en §1.4 y repartidas entre dos propietarios sin login y sin privilegios cruzados, pero
  existen. Toda modificación del cuerpo de cualquiera de las seis exige revisión de
  `auditor-seguridad`, igual que una política RLS — y el inventario tiene que estar bien, porque un
  control enunciado sobre dos deja cuatro fuera sin que nadie lo note.
- **Cinco roles y tres orígenes de conexión** donde hoy hay uno. Más configuración, más secretos que
  custodiar, más superficie de error en despliegue — y un modo de fallo nuevo, apuntar una variable de
  entorno al rol equivocado, que se cierra con la verificación de identidad al arrancar de §1.3. Es el
  precio de que la frontera sea el rol de conexión, que es lo único no falsificable desde SQL.
- **Dos secretos nuevos que custodiar y rotar**: la pimienta del directorio y la clave de plataforma.
  Perder la pimienta no pierde datos —el directorio se reconstruye desde `canales`—, pero es una
  operación de plataforma que hay que tener escrita antes de necesitarla.
- **Hay que rehacer el mecanismo de concesión de `001` y `002`**, que hoy funcionan, y especificar
  `canales` antes de que esta migración pueda aplicarse. Tocar lo que funciona tiene riesgo; no
  tocarlo garantiza el fallo.
- **El puerto acopla `inbox` a `crm` en el tiempo.** Si `crm` falla, no entran mensajes. Se reintenta,
  pero la bandeja se retrasa.
- **La enumeración del directorio sigue siendo posible** a costa de N llamadas y de tener la pimienta.
  Se vigila con una métrica; no se elimina.
- Contenido de varios tenants convive segundos en `recepciones_webhook`. Cifrado con AAD, acotado por
  funciones, borrado al clasificar y purgado, pero el riesgo no es cero y ahora al menos es medible.
- Una lectura más en el camino caliente del trabajador. Medible; la caché de la opción D existe si
  algún día la medición la justifica.

### Qué habría que cambiar para revertir

Poco y barato en lo estructural: el directorio es derivado y reconstruible desde `canales`, y la
resolución está detrás de una función; cambiar de almacén es reescribir su cuerpo. Lo caro de revertir
es el puerto síncrono: si `inbox` se extrae como servicio (ADR-0004), `asegurarContacto` pasa a ser
una llamada remota con su latencia y su modo de fallo. Está previsto: el puerto es exactamente la
línea de corte.

## Cuándo revisar esta decisión

- **Si el agente `whatsapp` encuentra que Meta cambió la forma del payload** o que alguno de los
  identificadores dejó de estar garantizado.
- **Cuando llegue el primer webhook de pasarela de pago** (Fase 4): o se reutiliza este patrón tal
  cual, o este ADR estaba mal generalizado y hace falta uno nuevo.
- **Si alguna de las dieciocho aserciones de §5 se desactiva o se marca como omitida**: la decisión queda
  suspendida hasta entender por qué, igual que ADR-0007 con la prueba de aislamiento. Las protecciones
  de este ADR **son** sus pruebas, y el texto corregido no es evidencia: la evidencia es verlas en
  verde contra una base real.
- **Si aparece una cuarta tabla global con datos de ruteo o de negocio.**
- **Si hay que rotar la pimienta del directorio**: la ventana de dos pimientas y el indicador de
  reconstrucción se ejercitan antes en un entorno no productivo. Una rotación sin ensayar destruye
  mensajes de clientes, y es una operación de seguridad, no de desarrollo.
- **Si la resolución del tenant aparece en el perfil de latencia del trabajador**: entonces, y solo
  entonces, la caché en Redis.
- **Si el criterio puerto/evento de §3 se invoca más de tres veces en otros módulos**: ha dejado de
  ser un detalle de esta decisión y merece su propio ADR.
- **Si alguna vez un webhook entrante se atribuye al tenant equivocado**: la decisión no se parchea,
  se revisa entera, empezando por el historial del directorio.
