# Modelo de datos

> El esquema es el activo más caro de cambiar del sistema. Este documento explica **por qué** está
> modelado así; el esquema ejecutable vive en `packages/database/schema.prisma`.

---

## 1. Reglas transversales

Aplican a **toda** tabla de negocio, sin excepción:

| Regla | Forma |
|---|---|
| Aislamiento | `tenant_id uuid NOT NULL` + política RLS con `USING` y `WITH CHECK`. Ver [ADR-0003](../03-adr/0003-multitenancy.md) |
| Clave primaria | `uuid` v7 — ordenable en el tiempo, buen comportamiento en índices, no filtra volumen de negocio como haría un entero autoincremental |
| Dinero | `amount_cents bigint` + `currency char(3)`. **Nunca** coma flotante |
| Fechas y horas | `timestamptz` en UTC |
| Fechas de viaje | `date` — un vuelo del 24 es del 24 sin importar el huso horario |
| Borrado | Lógico: `deleted_at timestamptz`. Toda consulta lo excluye por defecto |
| Auditoría | `created_at`, `updated_at`, `created_by`, `updated_by` |
| Índices | Compuestos con `tenant_id` **siempre en primera posición** |

### Por qué dinero en enteros

`0.1 + 0.2 !== 0.3` en coma flotante. En un cotizador que suma veinte ítems en tres monedas con
markup porcentual, ese error se acumula y aparece como una diferencia de centavos entre lo cotizado
y lo cobrado. Es pequeño y es imperdonable: destruye la confianza en el sistema.

Las conversiones guardan **además** la tasa aplicada y su fecha. La TRM de una cotización queda
congelada: si el dólar sube mañana, lo que el cliente vio no cambia.

---

## 2. El mapa

```mermaid
erDiagram
    TENANT ||--o{ USER : "tiene"
    TENANT ||--o{ CHANNEL : "conecta"
    TENANT ||--o{ CONTACT : "gestiona"

    CHANNEL ||--o{ CONVERSATION : "aloja"
    CONTACT ||--o{ CONVERSATION : "participa en"
    CONVERSATION ||--o{ MESSAGE : "contiene"

    CONTACT ||--o{ DEAL : "origina"
    CONVERSATION ||--o| DEAL : "da lugar a"
    DEAL ||--o{ QUOTE : "recibe"

    QUOTE ||--o{ QUOTE_OPTION : "ofrece"
    QUOTE_OPTION ||--o{ QUOTE_ITEM : "compone"
    QUOTE_ITEM }o--|| SUPPLIER : "proviene de"

    QUOTE ||--o| TRAVEL_FILE : "se convierte en"
    TRAVEL_FILE ||--o{ BOOKING : "agrupa"
    TRAVEL_FILE ||--o{ PASSENGER : "lleva"
    BOOKING }o--|| SUPPLIER : "con"

    TRAVELER ||--o{ PASSENGER : "es"
    TRAVELER ||--o{ TRAVELER_DOCUMENT : "porta"

    TRAVEL_FILE ||--o| PAYMENT_PLAN : "tiene"
    PAYMENT_PLAN ||--o{ INSTALLMENT : "divide en"
    INSTALLMENT ||--o{ PAYMENT : "se salda con"
```

### El mapa del enrutamiento entrante (ADR-0008)

Va aparte porque cruza la frontera del aislamiento, y conviene verlo de un vistazo: a la
izquierda, lo que está **bajo RLS**; a la derecha, lo que **no puede estarlo** y por qué.

```mermaid
erDiagram
    TENANT ||--o{ CUENTA_WHATSAPP : "conecta"
    CUENTA_WHATSAPP ||--o{ CANAL : "agrupa"
    CANAL ||--o{ ENRUTAMIENTO_CANALES : "se proyecta en"
    RECEPCIONES_WEBHOOK ||--o{ RECEPCIONES_WEBHOOK_CHANGES : "se parte en"
    EXCEPCIONES_RLS ||--o{ ENRUTAMIENTO_CANALES : "declara"
```

| Tabla | ¿RLS? | Qué guarda |
|---|---|---|
| `cuentas_whatsapp` | **Sí** | El WABA de la agencia y su token cifrado. Es la **verdad**: el directorio es derivado de aquí |
| `canales` | **Sí** | El número conectado, con `phone_number_id` **en claro** bajo aislamiento |
| `enrutamiento_canales` | **No** | Solo claves de ruteo en HMAC → `tenant_resuelto_id`, más `canal_id` **o** `cuenta_id`. Es lo que rompe el ciclo huevo-gallina |
| `enrutamiento_historial` | **No** | Bitácora del directorio, particionada por año. Global porque `registros_auditoria` archivaría el ataque bajo el atacante |
| `recepciones_webhook` (+ hija) | **No** | El cuerpo cifrado del webhook, durante segundos, antes de saber de quién es |
| `excepciones_rls` | **No** | La declaración que gobierna los privilegios. Se declara a sí misma |

El ciclo que esto rompe, en una frase: **para saber de qué agencia es el webhook hay que
leer una tabla, y si esa tabla está protegida por tenant, hay que saber la agencia para
leerla.** Meta manda todos los webhooks de todas las agencias al mismo endpoint.

**La zona sin RLS queda acotada a una franja exacta y descriptible: entre la validación de
la firma y la resolución del tenant. En esa franja no se lee ni se escribe ninguna tabla de
negocio.** Esa frase es la que hace compatible el diseño con ADR-0003.

### Referencias cruzadas entre tablas con tenant: clave foránea COMPUESTA

Una regla general que merece quedar escrita, y que ADR-0008 obliga a aplicar:

> Cuando una tabla referencia a otra que también tiene `tenant_id`, **la clave foránea
> incluye el tenant**: `UNIQUE (id, tenant_id)` en la referenciada y
> `FOREIGN KEY (otra_id, tenant_id) REFERENCES otra (id, tenant_id)`.

Escrita simple, la referencia puede apuntar a la fila de otro tenant y **nadie lo nota
hasta que una fila cruza agencias**: RLS no interviene, porque la comprobación de
integridad referencial se ejecuta por encima de las políticas. Lo verifican las aserciones
25 y 25bis. Está aplicada en `canales → cuentas_whatsapp`, en
`enrutamiento_canales → canales` y en `enrutamiento_canales → cuentas_whatsapp`.

**Y se aplica a TODAS las variantes de la referencia, no a la más visible.** La primera
versión solo la puso en `canal_id`, de modo que las filas de tipo WABA —`canal_id` nulo,
`cuenta_id` relleno, las que gobiernan todos los eventos de plantillas y de cuenta— se
quedaron sin respaldo del motor: entraban sin que nada comprobara de quién era la cuenta.
Un `CHECK (num_nonnulls(canal_id, cuenta_id) = 1)` cierra la figura: **toda fila es de una
de las dos clases, y las dos tienen clave foránea compuesta.**

**Desde el 2026-10-19 no queda ninguna simple, y lo vigila un barrido, no una lista.** Las tres
últimas venían de la migración inicial y las cerró `20261019220000_foraneas_con_tenant_en_el_modelo_antiguo`:

```
mayoristas (id, tenant_id) <── paquetes (mayorista_id, tenant_id)   SET NULL ("mayorista_id")
paquetes   (id, tenant_id) <── temporadas (paquete_id, tenant_id)   CASCADE
temporadas (id, tenant_id) <── precios (temporada_id, tenant_id)    CASCADE   [UNIQUE nuevo en temporadas]
```

La aserción 54 recorre `pg_constraint` entero: toda foránea entre dos tablas con `tenant_id` tiene
que emparejar el `tenant_id` de la hija con el del padre en la misma posición. La migración repite
la consulta y tumba el despliegue si encuentra alguna. `temporadas` y `precios` son del modelo
anterior a ADR-0009 pero siguen vivas: las leen `cotizar-paquete` y `listar-paquetes`.

**La aserción 17 juzga por el dato, no por el nombre.** Toda tabla fuera de `excepciones_rls` con
una columna que sea foránea hacia `tenants` o que se llame `tenant%` tiene que tener RLS habilitada
y forzada, y toda excepción tiene que tener `motivo` no vacío. A diferencia de la aserción 1, no
depende de la vista `tablas_sin_aislamiento`, que vive en la base y una migración puede reescribir.

---

## 3. Decisiones de modelado y su porqué

### `Contact` ≠ `Traveler` ≠ `Passenger`

La distinción que más confunde al llegar y la que más problemas evita después.

| Entidad | Qué es | Ejemplo |
|---|---|---|
| `Contact` | Con quien la agencia conversa | La mamá que escribe por WhatsApp |
| `Traveler` | Persona que viaja, con sus datos y documentos | Ella, su esposo y sus dos hijos |
| `Passenger` | Un `Traveler` **dentro de un archivo concreto**, con su tipo (ADT/CHD/INF) y su asiento | Cada uno, en ese viaje específico |

Fusionarlas parece una simplificación razonable hasta el primer viaje familiar, y entonces hay que
rehacer el modelo con datos en producción. El mismo `Traveler` es `Passenger` en varios archivos a
lo largo de los años: eso es lo que hace posible la recompra.

### `Quote` con versiones inmutables

Una cotización enviada **no se modifica**. Editarla crea una versión nueva; la anterior queda
congelada con su contenido y su fecha de envío.

Sin esto no hay forma de resolver un reclamo del tipo "ustedes me ofrecieron otro precio". Con
esto, se abre la versión que el cliente recibió y la conversación se acaba.

### `QuoteItem` — netos y venta en la misma fila

```
net_amount_cents      Lo que cobra el proveedor. NUNCA se muestra al cliente.
sell_amount_cents     Lo que paga el cliente.
markup_type           PERCENTAGE | FIXED
markup_value
commission_rate       Lo que el proveedor devuelve. NO lo paga el cliente.
tax_amount_cents
currency              Moneda del proveedor
exchange_rate         TRM congelada
exchange_rate_date
```

**Markup y comisión no son lo mismo.** El markup lo paga el cliente (va sobre la tarifa neta); la
comisión la paga el proveedor (sale de su tarifa). Se contabilizan distinto y se declaran distinto.
Un modelo con un solo campo "ganancia" no puede responder cuánto se facturó ni cuánto se ganó.

### `TravelFile` como agregado central

Todo converge aquí: pasajeros, reservas, documentos, pagos, itinerario, bitácora. Es lo que el
sector llama "el file", y es la unidad sobre la que se mide el margen.

### `Booking.time_limit` — el campo que salva dinero

Fecha y hora límite para emitir o pagar antes de que el proveedor libere el cupo. Vencido, se
pierde la reserva y probablemente la venta.

Por eso no es un campo más: tiene índice propio, un trabajo programado que lo vigila, y el evento
`TimeLimitApproaching`. Es, en términos de dinero salvado, probablemente la funcionalidad de mayor
retorno de todo el sistema.

### `Message` — la tabla que más crecerá

Crecerá más rápido que todas las demás juntas: decenas de miles de filas por tenant al mes.

- Restricción única `(tenant_id, provider_message_id)` → idempotencia garantizada por el motor.
- Índice `(tenant_id, conversation_id, created_at DESC)` → cargar el hilo es la consulta más
  frecuente del producto.
- El contenido se guarda como `jsonb` porque los tipos de mensaje de WhatsApp varían mucho y Meta
  agrega formatos nuevos. Los campos que se consultan (tipo, dirección, estado) son columnas.
- **Particionado por rango de fecha diseñado antes de los primeros 10 millones de filas.**
  Después es una migración con ventana de caída.

### `outbox` — eventos que no se pierden

```
id · tenant_id · aggregate_type · aggregate_id
event_type · event_version · payload jsonb
occurred_at · published_at
```

El evento se escribe en la **misma transacción** que el cambio de estado. Un relay lee los no
publicados y los envía a BullMQ.

Sin esto: publicas el evento, la transacción revierte, y acabas de notificar un hecho que nunca
ocurrió. Con esto: o pasan las dos cosas, o no pasa ninguna.

`event_version` existe desde el principio porque los eventos son contrato público, y cambiar la
forma de uno publicado rompe a sus consumidores igual que cambiar una API.

### Datos personales sensibles

`TravelerDocument` guarda pasaportes, cédulas, visas y fechas de nacimiento, a veces de menores.

- Los números de documento se cifran a nivel de aplicación (AES-256-GCM) antes de persistirse.
  Hoy ya se cifran así las cinco columnas de la tabla de alcance del ADR-0015 (ver «R10 — el texto
  de un mensaje es PII» más abajo); `Viajero` nacerá cifrado con la misma primitiva.
- Todo acceso queda en la bitácora de auditoría: quién, cuándo, a qué (`LECTURA_DATOS_SENSIBLES`).
- Política de retención definida: no se guardan para siempre "por si acaso".

Ver [protección de datos](../05-seguridad/02-proteccion-de-datos.md).

---

### Configuración y campos personalizados por tenant

Consecuencia directa de [ADR-0006](../03-adr/0006-parametrizacion-y-extensibilidad.md): el producto
se parametriza por agencia, y **eso hay que preverlo en el esquema desde la primera migración**.

**Nada de `enum` en el código para lo que cada agencia define distinto.** Las etapas del pipeline,
los motivos de pérdida, las reglas de markup y los tipos de proveedor son **tablas por tenant**,
no constantes de TypeScript. Convertir un `enum` en tabla cuando ya hay datos en producción es una
migración con reasignación de filas; nacer como tabla no cuesta nada.

**Campos personalizados.** Cada agencia tendrá siempre un dato que no previmos. El diseño:

```
custom_field_definitions          tenant_id · entidad · clave · etiqueta · tipo · obligatorio · orden
<entidad>.custom_fields jsonb     los valores, en la fila de la entidad
```

Las definiciones son relacionales (se consultan, se validan, se ordenan en la interfaz); los
valores van en una columna `jsonb` de la propia entidad, con índice GIN para poder filtrar por
ellos. Separarlo así evita la tabla genérica clave-valor, que degrada el rendimiento en cuanto hay
volumen.

Entidades que los llevan desde v1: `contacts`, `travelers`, `deals`, `travel_files`.

**Por qué ahora y no después.** Los campos personalizados están en la misma categoría que
`tenant_id`, el versionado de cotizaciones y los *time limits*: **añadirlos más tarde significa
migrar datos de producción.** La interfaz para gestionarlos puede llegar en la Fase 2; la columna
y la tabla de definiciones, no.

**Resolución de valores por defecto.** El alta de una agencia siembra configuración opinada que ya
sirve para operar —etapas, plantillas, roles, reglas de markup—. La agencia cambia solo lo que le
estorba. Un sistema que exige configurar cuarenta cosas antes del primer mensaje se abandona en la
semana dos.

### Preparar la agregación anónima entre tenants

El [norte del producto](../00-vision/05-norte-del-producto.md#27-el-horizonte-lejano-la-red-entre-agencias)
contempla, a largo plazo, benchmarking anónimo entre agencias y calificación compartida de
proveedores. Eso **no se construye ahora**, pero condiciona el esquema hoy:

- Los proveedores necesitan un **identificador canónico global** además del registro por tenant.
  Sin él, el «Hotel Las Américas» de una agencia y el de otra son entidades distintas para siempre,
  y la agregación se vuelve imposible sin un trabajo de reconciliación manual.
- Las métricas agregables (conversión, ticket promedio, margen) deben poder calcularse por tenant
  **sin depender de campos de configuración libre**, o no serán comparables entre agencias.
- El esquema debe permitir distinguir lo que es dato del tenant de lo que podría agregarse de
  forma anónima, para que la decisión de consentimiento sea posible después.

Costo hoy: una columna y una tabla de catálogo. Costo si se agrega más tarde: migrar datos de
producción y reconciliar proveedores a mano.

## 4. Tablas globales (las excepciones a RLS)

Solo estas. Cada una documentada aquí por obligación: una tabla sin `tenant_id` que no esté en esta
lista es un defecto bloqueante.

**Esta lista es la canónica, y desde ADR-0008 no es la fuente.** La fuente es la tabla
`excepciones_rls`, que vive **en la base** y que `001-aislamiento-tenant.sql` aplica
literalmente: la vista `tablas_sin_aislamiento` la consulta, y la aserción 11 de la prueba
de aislamiento compara su contenido contra un literal escrito en el archivo de prueba.
Antes había dos listas —una en el SQL y otra aquí— y **ya habían divergido**; el ADR se
apoyaba en la decorativa como mecanismo de control. Si este documento y `excepciones_rls`
discrepan, el defecto está en este documento.

Importa mantenerla corta porque **una tabla que entra en esta lista deja de estar vigilada
para siempre.**

| Tabla | ¿Existe hoy? | Por qué es global |
|---|---|---|
| `tenants` | Sí | Define los tenants: es la unidad de aislamiento y no puede estar aislada. La aplicación solo la lee |
| `monedas` | Sí | Dato de referencia universal, igual para todas las agencias |
| `_prisma_migrations` | Sí | Historial de migraciones de Prisma. Lo gestiona el rol propietario; ningún rol de aplicación tiene privilegios sobre ella |
| `excepciones_rls` | Sí — **ADR-0008** | La declaración que gobierna los privilegios de todas las demás. Se declara **a sí misma** con privilegios vacíos: si no lo hiciera, el `GRANT ... ON ALL TABLES` le daría `INSERT/UPDATE` a los roles de aplicación y el remedio del fallo crítico se convertiría en su vehículo — una fila manipulada se concedería sola en el siguiente despliegue, y una comprobación que contrastara lo real contra lo declarado la validaría como correcta |
| `enrutamiento_canales` | Sí — **ADR-0008** | El mapa `identificador de Meta → tenant`. Es lo que rompe el ciclo: leerlo es el paso previo a saber de qué agencia es el webhook. Claves en HMAC con pimienta fuera de la base; **ningún rol de login tiene un solo privilegio sobre ella** |
| `enrutamiento_historial` | Sí — **ADR-0008** | Bitácora del directorio, particionada por año. Es global porque `registros_auditoria` tiene `tenant_id` y RLS forzada: el registro de un secuestro quedaría archivado bajo el **atacante**, invisible para la víctima. Solo inserción, ni su propietario puede modificarla |
| `recepciones_webhook` y `recepciones_webhook_changes` | Sí — **ADR-0008** | El staging del webhook: contenido de varios tenants durante segundos, **antes** de saber de quién es. Cifrado con AAD, borrado al clasificar y purgado. Se cuentan como una: la hija existe porque el grano real del procesamiento es el `change` |
| `identidades`, `credenciales`, `sesiones`, `verificaciones` | Sí — **ADR-0011** | La persona y su autenticación (Better Auth). Existen antes de elegir agencia y el inicio de sesión corre sin `app.current_tenant`. **Solo `viajapro_identidad`** tiene privilegios (DML); los tres roles de siempre, cero, declarados fila por fila |
| `accesos_identidad` | Sí — **ADR-0011** | Índice `(identidad, agencia)` para el selector de agencia. `viajapro_identidad` solo la lee; la escribe únicamente el disparador `SECURITY DEFINER` de `usuarios` (dueño `viajapro_accesos`, NOLOGIN). No decide nada: lo que cuenta es leer `usuarios` bajo RLS |
| `aceptaciones_de_identidad`, `codigos_de_registro` | Sí — **ADR-0030** | Del registro de la persona, antes de que exista agencia: la evidencia de que aceptó términos y aviso de privacidad (solo `SELECT, INSERT` para `viajapro_identidad`) y el código de registro por correo (DML para `viajapro_identidad`). Los tres roles de siempre, cero |
| `codigos_de_acceso_al_registro`, `parametros_del_registro` | Sí — **ADR-0030** | El código de acceso del piloto y el tope global de altas por hora. **Ningún rol de login** tiene privilegios: las crea la plataforma y solo las leen o consumen `crear_agencia` y `codigo_de_acceso_vigente` (dueño `viajapro_registro`, `NOLOGIN`), por columnas |
| `plans` | Todavía no | Catálogo de planes del SaaS, igual para todos |
| `countries`, `timezones` | Todavía no | Datos de referencia universales |
| `system_message_templates` | Todavía no | Plantillas base sugeridas, que cada tenant copia y adapta |

**Regla de parada, y se enuncia sobre lo que de verdad importa:** tablas globales **con
datos de negocio o de ruteo**, tres (`enrutamiento_canales`, `enrutamiento_historial`,
`recepciones_webhook` con su hija). Si aparece una cuarta, **el patrón está mal** y hay que
revisar la decisión, no añadirla a la lista. Las tablas de control del propio mecanismo
—`excepciones_rls`— y los catálogos de referencia son otra categoría. **Las cinco de identidad
(ADR-0011) son una tercera**, decidida por ADR y no añadida a la lista: no guardan datos de
negocio ni de ruteo sino la autenticación de la persona, y tienen su propio rol de conexión,
que no ve ninguna tabla de negocio. La regla de parada sigue en tres.

**Ninguna de ellas tiene ni tendrá una columna llamada `tenant_id`**, y eso no es
cosmético: el aplicador de políticas es dirigido por datos y se la pondría RLS
automáticamente, devolviendo el ciclo huevo-gallina sin producir ningún error y en
producción. Por eso la columna del directorio se llama `tenant_resuelto_id`. Lo vigila la
aserción 17.

### Y las particiones cuentan como tablas

`enrutamiento_historial` está particionada por año, y una partición **es una tabla con su
propia lista de permisos y su propia configuración de RLS**. Dos consecuencias que no son
teóricas:

- Revocar sobre la tabla particionada **no** alcanza a sus particiones: hay que descender
  por `pg_inherits`. Lo hace `aplicar_privilegios_declarados()`, y la aserción 24 enumera
  todas las particiones en vez de preguntar solo por el padre — PostgreSQL comprueba los
  privilegios del padre cuando se accede a través de él y nunca los de la partición, así
  que un `UPDATE enrutamiento_historial_2028` habría pasado por encima de la bitácora con
  la aserción en verde.
- Una partición creada por el rol de migraciones **nace** con los privilegios que concede
  `ALTER DEFAULT PRIVILEGES`. Por eso no se crean a mano: `crear_particion_historial(año)`
  las crea, les pone el propietario, repite la revocación del dueño y reaplica los
  privilegios declarados. **Crear la del año siguiente es trabajo de plataforma con dueño
  y fecha**; hay particiones hasta 2030 y, si faltara, las escrituras fallan de forma
  ruidosa —ninguna agencia podría conectar su canal—, que es preferible a una partición por
  defecto que luego impide adjuntar el año nuevo sin mover filas.

Lo mismo vale para RLS el día que se particione una tabla de negocio —`mensajes` **no** se
particiona hoy, y si llega a hacerse será por HASH de `tenant_id`: ADR-0010 §1.5—:
la política va al padre **y a cada partición**, o un `SELECT` directo contra la partición
usa su propia configuración, que nadie habilitó. `aplicar_aislamiento_tenant` ya desciende,
y `tablas_sin_aislamiento` imputa cada partición a su tabla raíz.

### Lo que todavía no tiene camino, dicho aquí para que no se pierda

- **Borrar una fila del directorio no lo puede hacer nadie.** Ningún rol de login tiene
  `DELETE` sobre `enrutamiento_canales` y ninguna función lo ofrece; además, borrar un
  tenant cascadea a `canales` y choca con el `ON DELETE RESTRICT` del directorio. La
  retención de 5 años de las filas `REVOCADO` y un derecho de supresión no tienen hoy
  ejecutante que no sea el rol propietario, que es justo lo que ADR-0008 no acepta como
  control. **Decidido en ADR-0010 §1.4:** la baja de una agencia es lógica y el `RESTRICT`
  es intencional. La retención la ejecutará `purgar_directorio(p_anteriores_a)`, nunca el
  rol propietario a mano, y se construye antes de la fecha límite que fija ese ADR.
- **`canales.estado` → `enrutamiento_canales.estado`: lo ata un disparador desde el
  2026-10-19 (tarea 4f, migración `20261019120000_propagar_estado_de_canal_al_directorio`).**

  ```
  UPDATE canales SET estado = 'REVOCADO'          (viajapro_app, bajo RLS)
        │  AFTER UPDATE OF estado WHEN estado <> 'ACTIVO'
        ▼
  propagar_estado_canal()    SECURITY DEFINER, dueño viajapro_enrutador, sin EXECUTE para nadie
        ├─► enrutamiento_canales.estado := max(actual, NEW.estado)   (canal_id y tenant de NEW)
        └─► enrutamiento_historial       asiento ACTIVO → REVOCADO
  ```

  Por qué un disparador y no que `resolver_enrutamiento` lea `canales`: el resolvedor corre
  sin contexto de tenant y su dueño no tiene privilegios sobre `canales` por diseño; leerla
  desde ahí sería una lectura entre tenants nueva. El disparador recibe la fila en `NEW` y no
  necesita ninguno. Es **monótono**: restringe y nunca relaja, porque reactivar el ruteo es
  repuntar y eso queda solo en `registrar_enrutamiento`. Aserción 46.

  **Los cuatro huecos que dejaba, cerrados el 2026-10-19** (ADR-0010 punto 6, migración
  `20261020010000_huecos_del_disparador_y_tope_del_barrido`, aserciones 55 a 58). Estado
  **efectivo** de un canal o una cuenta = `REVOCADO` si tiene `eliminado_en`, si no su `estado`.

  ```
  INSERT o UPDATE OF estado, eliminado_en      (viajapro_app, bajo RLS)
        │                                   │
     canales                          cuentas_whatsapp
        ▼                                   ▼
  propagar_estado_canal()            propagar_estado_cuenta()      dueño viajapro_enrutador,
   filas de número (canal_id)         filas WABA (cuenta_id)        sin EXECUTE para nadie
        └──────────► directorio := max(actual, efectivo) + asiento ◄──────┘

  registrar_enrutamiento(..., p_estado)       (viajapro_altas, con tenant de sesión)
        │  lee canales / cuentas_whatsapp BAJO RLS: SELECT(id, tenant_id, estado, eliminado_en)
        └─► rechaza (55000) si p_estado < efectivo        → no hay re-alta sobre un REVOCADO
  ```

  | Hueco | Cómo se cerró |
  |---|---|
  | (a) baja de cuenta | Disparador gemelo sobre `cuentas_whatsapp`; solo filas WABA de esa cuenta y ese tenant. Las filas de **número** de una cuenta dada de baja siguen la verdad de `canales`: la baja de una cuenta tiene que dar de baja sus canales (caso de uso) |
  | (b) borrado lógico | Los dos disparadores escuchan `eliminado_en` y lo tratan como `REVOCADO`. Deshacer el borrado no relaja |
  | (c) re-alta | `registrar_enrutamiento` no escribe un estado más laxo que el efectivo. El re-alta legítimo existe: primero el canal vuelve a `ACTIVO`, luego se repunta |
  | (d) `INSERT` | Los dos disparadores escuchan `INSERT`. Hoy la clave foránea ya impide filas de un canal que no existe, así que el riesgo real era (c) |

  Por qué el dueño del directorio puede ahora leer cuatro columnas de `canales` y
  `cuentas_whatsapp`, cuando 4f lo rechazó para el resolvedor: el resolvedor corre **sin**
  contexto y sería una lectura entre tenants; `registrar_enrutamiento` exige que el tenant de
  la sesión sea el de la fila y la RLS forzada vale también para el dueño de la función. Sin
  contexto lee cero filas, y nunca el `phone_number_id` ni el token (aserción 57). Una baja
  concurrente con un alta se serializa con un bloqueo consultivo por canal o por cuenta
  (claves 7410100 y 7410101) que toman los dos lados antes de leer.

- **Los changes que se quedan `PENDIENTE` ya se pueden listar (2026-10-19, migración
  `20261019210000_listar_changes_pendientes_para_el_barrido`).** Es la mitad de base de datos
  del relay de barrido de ADR-0010 punto 9: si el POST guarda y el encolado falla, el change
  ya no depende solo del reintento de Meta.

  ```
  trabajo programado (viajapro_webhook)
        │  listar_changes_pendientes(antigüedad_mínima_s, límite 1..1000)
        ▼                                    SECURITY DEFINER, dueño viajapro_staging
  recepciones_webhook_changes  ⋈  recepciones_webhook
        WHERE estado = 'PENDIENTE' AND payload_cifrado IS NOT NULL AND recibido_en <= now() - N s
        ORDER BY recibido_en                 índice parcial ..._changes_pendientes_idx
        ▼
  (recepcion_id, indice, antiguedad_s)  ──►  reencolar con jobId <hex>-<indice> (R5)
  ```

  Por qué así: es la primera función que **lista** el staging, y el staging guarda contenido
  de varias agencias sin RLS. Por eso devuelve solo identificadores y antigüedad (ni payload
  ni tenant), el límite es obligatorio y nadie salvo el trabajador la ejecuta. Excluye las
  recepciones ya anuladas por `purgar_payloads`: sin contenido no hay qué procesar, y
  reencolarlas sería un bucle. Es la novena `SECURITY DEFINER`; aserciones 12, 13, 20 y 53.

  **Tope de reencolados en la base (2026-10-19, `20261020010000`, aserción 59).** Con más de
  500 changes abandonados el límite del barrido los devolvía siempre a ellos y tapaban a los
  nuevos. `recepciones_webhook_changes.intentos_barrido smallint NOT NULL DEFAULT 0` cuenta
  los reencolados; `contar_reencolado_barrido(recepcion_id, indice)` suma uno a un change
  `PENDIENTE` y devuelve el total (0 si ya se resolvió). `listar_changes_pendientes` gana un
  tercer argumento `p_max_intentos` (DEFAULT 10, el `maxReencolados` por defecto), excluye
  `intentos_barrido > tope` y ordena por `intentos_barrido` antes que por antigüedad.

- **Inventario de funciones `SECURITY DEFINER`** (ADR-0010 §1.2 es inmutable y se quedó en
  ocho; esta es la lista viva, y la matriz normativa es `MATRIZ_FUNCIONES` de la aserción 20).

  | Función | Dueño | `EXECUTE` |
  |---|---|---|
  | `resolver_enrutamiento` | `viajapro_enrutador` | `viajapro_webhook` |
  | `registrar_enrutamiento` | `viajapro_enrutador` | `viajapro_altas` |
  | `propagar_estado_canal` | `viajapro_enrutador` | nadie (disparador) |
  | `propagar_estado_cuenta` | `viajapro_enrutador` | nadie (disparador) |
  | `registrar_recepcion` | `viajapro_staging` | `viajapro_app` |
  | `tomar_recepcion` | `viajapro_staging` | `viajapro_webhook` |
  | `anular_payload` | `viajapro_staging` | `viajapro_webhook` |
  | `purgar_recepciones` | `viajapro_staging` | `viajapro_webhook` |
  | `purgar_payloads` | `viajapro_staging` | `viajapro_webhook` |
  | `listar_changes_pendientes` | `viajapro_staging` | `viajapro_webhook` |
  | `contar_reencolado_barrido` | `viajapro_staging` | `viajapro_webhook` |
  | `medir_cola_de_salida` (T-223) | `viajapro_metricas` | `viajapro_webhook` |

---

## 5. Rendimiento

**Consultas calientes** — se miden con `EXPLAIN ANALYZE` sobre datos sembrados a volumen realista
(100k conversaciones, 1M mensajes) antes de darlas por buenas:

| Consulta | Frecuencia | Índice que la sostiene |
|---|---|---|
| Bandeja: conversaciones con su último mensaje | Altísima | `(tenant_id, status, last_message_at DESC)` + denormalización del último mensaje |
| Hilo de una conversación, paginado hacia atrás | Altísima | `(tenant_id, conversation_id, created_at DESC)` |
| Búsqueda de contacto por nombre o teléfono | Alta | `pg_trgm` + `unaccent` |
| Pipeline por etapa | Alta | `(tenant_id, stage_id, updated_at DESC)` |
| *Time limits* próximos a vencer | Programada | `(tenant_id, time_limit) WHERE status = 'CONFIRMED'` — índice parcial |

**Denormalización deliberada:** `conversation.last_message_at`, `last_message_preview` y
`unread_count` se mantienen al día con cada mensaje. Calcularlos al vuelo haría de la bandeja —la
pantalla más usada del producto— la consulta más cara. Es una optimización consciente, con su costo
de consistencia asumido y documentado.

---

## 6. Evolución del esquema

- **Una migración por cambio lógico**, con nombre descriptivo.
- **Nunca se edita una migración ya aplicada.** Se corrige con una nueva.
- **Toda migración debe ser segura en caliente.** Cambios bloqueantes sobre tablas grandes, en dos
  pasos: agregar nullable → rellenar → imponer la restricción.
- Las migraciones corren **antes** del despliegue de la aplicación y deben ser compatibles con la
  versión anterior en ejecución. Sin eso, cada despliegue es una ventana de caída.
- Una migración irreversible se declara como tal, con su plan de reversión escrito.

---

## 7. CRM — contactos y oportunidades (2026-10-10)

Lo que hace que la pantalla de pipeline deje de ser una maqueta. Sirve los contratos de
`packages/contracts/src/crm.ts` sin cambiarlos.

```mermaid
erDiagram
    TENANT ||--o{ CONTACTO : "gestiona"
    TENANT ||--o{ ETAPA_PIPELINE : "configura"
    CONTACTO ||--o{ CONSENTIMIENTO_CONTACTO : "otorga y revoca"
    CONTACTO ||--o{ NOTA_INTERNA : "acumula"
    CONTACTO ||--o{ OPORTUNIDAD : "origina"
    ETAPA_PIPELINE ||--o{ OPORTUNIDAD : "clasifica"
    USUARIO ||--o{ OPORTUNIDAD : "asesora"
    PAQUETE ||--o{ OPORTUNIDAD : "se cotiza en"
```

### Por qué así

| Decisión | Porqué |
|---|---|
| **Etapas: tabla por tenant con columna `clave`** | Ya era tabla (R12). La `clave` —`NUEVO_LEAD`…`PERDIDA`— es el puente con el enum cerrado del contrato. Nullable a propósito: una agencia puede tener más etapas que las cinco del contrato, y una etapa sin clave existe pero hoy no es representable en la API. Forzar un valor metería dos etapas en la misma columna del tablero |
| **Consentimiento: tabla, no columnas** | La Ley 1581 de 2012 no pide saber *si* hay consentimiento: pide demostrar cuándo, con qué finalidad y por qué canal, y registrar la revocación. Tres columnas sobrescribibles no demuestran nada. Índice único **parcial**: una finalidad vigente por contacto, histórico completo de las revocadas |
| **Motivo de pérdida: enum del motor** *(superada por T-214, 2026-11-15: ver «Motivos de pérdida por agencia» al final; la taxonomía común sobrevive como `clave`)* | Al revés que las etapas, y no es incoherencia: la etapa es el proceso de venta de cada agencia; el motivo es la taxonomía con la que se compara el rendimiento entre agencias y se decide si tocar el markup o el SLA. Si cada una inventa la suya, esa comparación no existe. `OTRO` + explicación obligatoria es la válvula |
| **La regla de pérdida, partida entre base y contrato** | «`OTRO` exige explicación» y «no hay nota sin motivo» son comprobaciones de **la fila** y van en `CHECK`. «Perdida ⇒ hay motivo» y «hay motivo ⇒ está perdida» **no pueden** ser un `CHECK`: la etapa vive en otra tabla y un `CHECK` no mira otra tabla. Hacerlo con un disparador sería esconder una regla de negocio donde nadie la busca y pagarla en cada movimiento de tarjeta. Esas dos se quedan en el contrato, que las aplica a la web, a la API y a cualquier integración |
| **Próxima tarea: tres columnas, no tabla `tareas`** | El contrato expone UNA próxima tarea. Una tabla para una fila por oportunidad añade un join a la consulta más caliente a cambio de nada que hoy se use. `CHECK`: las tres o ninguna. El día que haga falta historial, es una tabla nueva |
| **Notas internas colgando del contacto** | `conversaciones` todavía no existe como tabla y el panel lateral las pide por contacto. Cuando el inbox la cree, `conversacion_id UUID NULL` con clave foránea compuesta es una migración aditiva de un minuto. Al revés habría forzado al inbox a existir antes que el pipeline |
| **Todas las claves foráneas, COMPUESTAS con el tenant** | Estaban escritas simples: la oportunidad de una agencia podía colgar del contacto, la etapa o el asesor de otra. RLS no lo impide —la integridad referencial se comprueba por encima de las políticas—. Mismo defecto que ADR-0008 cerró en el directorio. Aserciones 29 y 30 |
| **Búsqueda con `pg_trgm` + `unaccent` + `btree_gin`** | El filtro de tenant y el texto entran en el **mismo** índice. `preferencias` queda fuera a propósito (R10): indexar por trigramas un campo que puede contener una alergia convierte el buscador en una herramienta para minar datos de salud. Desde ADR-0015 además va cifrada |

### Enlace con el inbox

`contactos` y las futuras `conversaciones` se enlazan por **`contacto_id`**, nunca por teléfono.
El teléfono es único por tenant (`UNIQUE (tenant_id, telefono_e164)`) y es la llave natural para
*resolver* quién escribe, pero no es la clave de la relación: cambia, se reasigna, y una agencia
puede tener dos canales. `contactos` ya expone `UNIQUE (id, tenant_id)`, que es lo que permite a
`conversaciones` declarar `FOREIGN KEY (contacto_id, tenant_id)` el día que se cree.

---

## Inbox — conversaciones, mensajes, adjuntos y el espejo de plantillas

*Añadido en `20261011090000_inbox_conversaciones_mensajes_y_plantillas`. Sirve
`packages/contracts/src/inbox.ts` y `packages/contracts/src/plantillas.ts`.*

```mermaid
erDiagram
    CONTACTOS      ||--o{ CONVERSACIONES : "habla por"
    CANALES        ||--o{ CONVERSACIONES : "entra por"
    CONVERSACIONES ||--o{ MENSAJES       : "contiene"
    CONVERSACIONES ||--o{ NOTAS_INTERNAS : "ancla (opcional)"
    MENSAJES       ||--o{ ADJUNTOS       : "trae"
    CUENTAS_WHATSAPP ||--o{ PLANTILLAS_WHATSAPP : "registra en Meta"
    PLANTILLAS_WHATSAPP ||--o{ MENSAJES : "reabre con"
    USUARIOS       ||--o{ CONVERSACIONES : "asignada a"
    USUARIOS       ||--o{ MENSAJES       : "escribe"
```

**Todas las claves foráneas son compuestas con `tenant_id`.** Es el agujero que se cerró en
`oportunidades` y aquí había dos puertas: el contacto y el canal. RLS no interviene en la
integridad referencial —PostgreSQL la comprueba por encima de las políticas—, así que con una
clave simple el hilo de una agencia puede colgar del contacto de otra y la fila resultante es
invisible para las dos. Lo vigilan las aserciones 39 y la mutación M6.

### Las decisiones y su porqué

| Decisión | Por qué |
|---|---|
| **Un hilo por `(contacto, canal)`** | En WhatsApp el hilo es el que el cliente ve en su teléfono. Partirlo por «tema» crea dos verdades de la misma pantalla, y es lo que permite al webhook hacer `ON CONFLICT DO UPDATE` sin carreras. |
| **La ventana de 24 h es UNA columna** (`ultimo_mensaje_cliente_en`) | `abierta`, `expiraEn` y `minutosRestantes` son función de ese instante y de `now()`. Una columna `abierta` caduca sin que nadie escriba: a las 15:00 nadie manda un `UPDATE`, y desde ese segundo estaría mintiendo. |
| **`wamid` único por tenant, índice parcial** | La idempotencia de R5 en la base, no en el código. Meta reintenta hasta recibir 200, y también cuando el 200 se perdió de vuelta. Por tenant y no global: global sería un oráculo que le confirma a una agencia la actividad de otra. |
| **`clave_idempotencia` única por tenant** | La otra mitad: entre el clic del asesor y la respuesta de Meta no hay identificador. Un doble clic manda el mensaje dos veces, y si es plantilla **se cobra dos veces**. |
| **Dos ejes de tiempo** (`ocurrido_en` de Meta, `creado_en` nuestro) | Los webhooks llegan desordenados: un reintento trae un mensaje de ayer después de uno de ahora. El hilo ordena por el de Meta, con `id` (UUID v7) de desempate porque Meta solo da segundos. R9. |
| **`cotizacion_id` sin FK, por ahora** | La tabla `cotizaciones` no existe todavía. La columna se crea hoy porque el contrato ya la expone y porque añadirla a `mensajes` con millones de filas es caro. La FK compuesta entra con `ADD CONSTRAINT NOT VALID` + `VALIDATE`. |
| **`adjuntos` es tabla, no JSONB** | Ciclo de vida propio: se descarga después, falla, se reintenta, se purga. Y la clave de S3 es lo que hay que recorrer para borrar de verdad los datos de una agencia que se va — S3 **no** está cubierto por RLS (ADR-0003). |

### Las plantillas no son nuestras

`plantillas_whatsapp` es la única tabla del esquema cuyo dueño está fuera del sistema: es un
**espejo** de lo que Meta aprobó. De ahí tres formas que no se parecen al resto del modelo:

1. **La identidad es `(WABA, nombre, idioma)`**, no `(tenant, nombre)`. Una agencia con dos WABAs
   puede tener `recordatorio_pago` en los dos, y son dos plantillas con estados distintos; y la
   misma plantilla en `es_CO` y en `en_US` puede estar aprobada en una y rechazada en la otra.
2. **El tiempo se parte en tres.** `actualizada_en_meta` (lo que dice Meta, lo único que el
   contrato expone), `sincronizada_en` (cuándo lo oímos) y `estado_cambiado_en` (desde cuándo está
   así). La tercera parece redundante hasta que un asesor pregunta «¿desde cuándo está pausada?».
3. **`creado_por` y `actualizado_por` NULOS son el dato**, no un campo sin rellenar: significan que
   el cambio lo hizo Meta. Meta pausa sola una plantilla cuando la marcan como spam, sin avisar.
   Un CHECK exige que `RECHAZADA` y `PAUSADA` traigan motivo: una lista que esconde el porqué no
   explica por qué falta la plantilla que se usaba ayer.

### Por qué `mensajes` NO está particionada

Es la tabla que más crece. Aun así no se particiona hoy, y no por prudencia:

1. **No ayuda a la consulta caliente.** Abrir un hilo es una búsqueda por `(tenant_id,
   conversacion_id)`; un btree de tres niveles cubre un millón de filas igual que cien millones.
2. **Particionar por `ocurrido_en` rompería la idempotencia de R5.** PostgreSQL exige que toda
   restricción única contenga la clave de partición: `(tenant_id, wamid)` pasaría a
   `(tenant_id, wamid, ocurrido_en)`, y el mismo `wamid` reintentado con otro timestamp caería en
   otra partición y se insertaría dos veces. Sin ningún error.
3. **Cuando haga falta, la forma correcta es HASH por `tenant_id`**: mantiene `(tenant_id, wamid)`
   exigible, acota el vacuum por agencia y encaja con el aplicador de RLS, que ya desciende por
   `pg_inherits`.

Disparadores para revisarlo: más de ~50 M de filas, un vacuum que no termina en su ventana, o una
política de retención por fecha —único caso donde partir por tiempo gana, y entonces la
deduplicación de `wamid` se saca a una tabla aparte.

### R10 — el texto de un mensaje es PII: cifrado en reposo (ADR-0015, T-212, 2026-11-15)

> **Superado.** Hasta la migración `20261115130000_cifrar_columnas_con_pii_sensible` el texto vivía
> en claro bajo RLS, con búsqueda por trigramas. ADR-0015 (aceptado) lo cambió; esto es lo vigente.

Cinco columnas que pueden llevar PII sensible de viajeros dejan de existir en claro. Cada una pasa
a cuatro columnas que van juntas o no van (`CHECK num_nonnulls(...) IN (0, 4)` y un CHECK de
formato: nonce de 12 bytes, etiqueta de 16, versión >= 1):

```
mensajes.texto                       ─┐
conversaciones.ultimo_mensaje_texto  ─┤      <col>_cifrado        BYTEA     AES-256-GCM
contactos.preferencias               ─┼──▶   <col>_nonce          BYTEA     12 bytes, aleatorio
notas_internas.texto (NOT NULL)      ─┤      <col>_tag            BYTEA     16 bytes
adjuntos.nombre_archivo              ─┘      <col>_clave_version  SMALLINT  v<n> de CAMPOS_SENSIBLES_KEY

clave = HKDF-SHA256(CAMPOS_SENSIBLES_KEY v<n>, sal fija, "viajapro/<tabla>.<col>/v<n>/" ‖ tenant_id)
AAD   = "viajapro/<tabla>.<col>/v<n>/" ‖ tenant_id (16) ‖ id de la fila (16) ‖ código de columna (1)
```

**Por qué así.** RLS separa agencias, pero no protege de quien lee la base sin pasar por la API: una
`DATABASE_URL` filtrada, una rama de Neon o un volcado, o el rol propietario. Con la clave fuera de
la base (API y trabajador; la web nunca), ninguno de esos lectores ve el texto, y el AAD impide
trasplantar un criptograma a otra agencia, otra fila u otra columna. Por eso **todo id de una fila
cifrada lo genera la aplicación antes del INSERT** (UUID v7, `shared/cifrado/uuid-v7.ts`).

**Lo que se pierde.** La búsqueda por contenido: `mensajes_texto_trgm_idx` se retiró y
`ConsultarBandeja.buscar` busca por el nombre y el teléfono del contacto. No hay analítica SQL sobre
esas columnas.

**Lectura auditada (R10).** Toda respuesta de la API que le devuelve a una persona un valor
descifrado deja, en la misma transacción, una fila `LECTURA_DATOS_SENSIBLES` en
`registros_auditoria` (tabla existente, con `tenant_id` y RLS): quién (`usuario_id`), cuándo, a qué
entidad, y en `detalle` los nombres de las columnas y los ids de las filas, **nunca el valor**. Las
emisiones por socket que llevan texto (`MENSAJE_NUEVO`, `CONVERSACION_ACTUALIZADA`) dejan una fila
por emisión, antes de emitir, con la audiencia en `detalle.destinatarios`. No se audita el envío a
Meta del trabajador. Clave y AAD se derivan siempre con el tenant de la sesión (o del evento), nunca
con el `tenant_id` de la fila: una fila de otra agencia que llegue a un mapeador no se descifra.

**Filas existentes.** No había datos de producción: la migración elimina las columnas en claro y
borra las notas internas (una nota sin texto no es representable). Las semillas ya no siembran
estas columnas: la clave no vive en `packages/database`.

**Pruebas.** `aislamiento.spec.ts` 82–85 (columnas, CHECK validados, lista declarada de columnas de
texto con tenant —concreción 7— y bytes crudos con el rol de aplicación) y
`apps/api/src/modules/inbox/cifrado-en-reposo.e2e-spec.ts` (criterio C2: `$queryRaw` sobre lo que
escriben los adaptadores reales).

### El punto ciego que se cerró

`001-aislamiento-tenant.sql` solo miraba si `polwithcheck` era NULL. Quitar `WITH CHECK` dejando
`USING` no cambia el comportamiento —PostgreSQL reutiliza la expresión—, pero un `WITH CHECK`
**presente y distinto** (`WITH CHECK (true)`) pasaba todas las comprobaciones de catálogo mientras
dejaba a cualquier agencia insertar filas dentro de los datos de otra. `003-politica-canonica.sql`
compara ahora el texto de `USING` y de `WITH CHECK` contra una forma canónica, y exige además que la
política sea `PERMISSIVE FOR ALL`. Lo verifican la aserción 36 y las mutaciones M4 y M5.

### `SET NULL` sobre clave foránea COMPUESTA: la columna hay que nombrarla

`notas_internas.conversacion_id` es anulable y su foránea es compuesta —`(conversacion_id,
tenant_id)`—, porque toda referencia cruzada entre tablas con tenant lo es (§2). El `ON DELETE SET
NULL` a secas sobre una clave compuesta anula **todas** sus columnas, y `tenant_id` es `NOT NULL`:
PostgreSQL acepta el DDL y el borrado revienta en ejecución, en producción y no aquí. Peor: el
borrado en cascada de un tenant se atasca en medio.

La forma correcta nombra la columna, y existe desde PostgreSQL 15:

```sql
ON DELETE SET NULL ("conversacion_id") ON UPDATE RESTRICT
```

Está en la migración `20261011090200_notas_set_null_solo_la_conversacion`. **Prisma no sabe
expresar la lista de columnas**: `schema.prisma` dice `onDelete: SetNull` y `prisma format` avisa
con *«should not be set to SetNull when a referenced field is required»*. El aviso es correcto y la
base ya está corregida; lo que no hay que hacer es «arreglarlo» generando una migración nueva desde
el esquema, porque eso devolvería la forma rota. Si una foránea compuesta nueva necesita `SET NULL`,
se escribe el `ALTER TABLE` a mano. Por la misma razón `tarifas → mayoristas` quedó en `Restrict`.

## Catálogo (ADR-0009) e inbox: la unión, no la elección

El ADR-0009 y el inbox se construyeron en ramas hermanas desde el mismo punto, y las dos añadieron
tablas **distintas**. El esquema resultante es la unión:

| Lado | Tablas |
|---|---|
| ADR-0009 (catálogo) | `vigencias` (renombre de `salidas`, con `desde`/`hasta`/`publicada`), `tarifas`, `politicas_de_precio` |
| Inbox | `conversaciones`, `mensajes`, `adjuntos`, `plantillas_whatsapp` |

No se tocan: ninguna foránea cruza de un bloque al otro. Lo único que ambos lados modificaron fue
`usuarios`, y por motivos ajenos —el catálogo lo reformateó, el inbox le añadió dos relaciones
inversas (`conversacionesAsignadas`, `mensajesEnviados`)—, así que la unión también vale ahí.

Las tablas que el inbox tocó de pasada son todas relaciones inversas, salvo una columna:
`tenants`, `usuarios`, `contactos`, `canales` y `cuentas_whatsapp` solo ganan listas; `notas_internas`
gana `conversacion_id`, anulable y añadida en caliente.

La primera aserción del arnés de aislamiento está **dirigida por datos** —consulta la vista
`tablas_sin_aislamiento`—, así que las tres tablas del catálogo quedaron cubiertas sin tocar la
prueba. Es la propiedad que hace barata una mezcla como esta: no hay una lista de tablas que
alguien tenga que acordarse de actualizar.

## Cotizaciones: cabecera mutable, versiones inmutables (2026-10-19)

Migraciones `20261019200000_cotizaciones_con_versiones_inmutables` y
`20261019200100_margen_desconocido_es_nulo`. Tarea 6 de `ESTADO.md`. El invariante viene de
ADR-0006 («una cotización enviada es inmutable; editarla crea una versión») y de ADR-0009 («una
cotización congela sus números»).

```mermaid
erDiagram
    CONTACTO ||--o{ COTIZACION : "recibe"
    OPORTUNIDAD |o--o{ COTIZACION : "del mismo contacto"
    COTIZACION ||--|{ VERSION_COTIZACION : "numero 1, 2, 3"
    COTIZACION |o--o| VERSION_COTIZACION : "version_enviada (diferible)"
    PAQUETE ||--o{ VERSION_COTIZACION : "se cotizó"
    MENSAJE }o--o| COTIZACION : "cotizacion_id"
```

| Tabla | Qué guarda | ¿Mutable? |
|---|---|---|
| `cotizaciones` | Contacto, oportunidad opcional, título, `estado` (`BORRADOR`, `ENVIADA`, `ACEPTADA`, `RECHAZADA`, `VENCIDA`), qué versión vio el cliente y cuándo | Sí. Borrado en blando |
| `versiones_cotizacion` | La instantánea: paquete, fecha, vigencia resuelta, pasajeros, política de precio copiada, `lineas` (JSONB con la forma de `OpcionDePrecio`), venta, neto y margen en `bigint` + `moneda_iso`, `vigente_hasta` | **No.** Lo impone un disparador |

### Por qué así

- **La inmutabilidad la impone la base.** `versiones_cotizacion_inmutables` rechaza `UPDATE`,
  `DELETE` y `TRUNCATE`. La única salida es la purga de una agencia entera: tiene que borrar el
  **propietario** de la tabla y la transacción tiene que declarar
  `set_config('viajapro.purga_de_tenants', '<ids>', true)`. Ningún rol de aplicación es
  propietario. Lo usa `scripts/borrar-tenants.mjs`.
- **La versión no cuelga de la cabecera con `CASCADE`, cuelga con `RESTRICT`.** Una acción
  referencial corre con el rol propietario de la tabla afectada, no con el de quien borra. Con
  `CASCADE`, un `DELETE FROM cotizaciones` desde la API llegaría al disparador como propietario,
  y la variable de purga la puede fijar cualquier rol. La única cascada que llega a las versiones
  es la de `tenants`, que la aplicación no puede borrar.
- **Las líneas van en JSONB y no en una tabla hija.** Una tabla hija necesitaría su propio
  disparador y además una regla contra *añadir* líneas a una versión cerrada. Así la instantánea es
  una sola fila. El disparador de alta (`versiones_cotizacion_validar_alta`) exige que cada línea
  traiga `total` entero en la moneda de la versión y que las líneas sumen `venta_unidades`.
- **`vigencia_id` y los `tarifaId` de las líneas no tienen foránea.** El catálogo cambia y las
  vigencias se borran físicamente. Con `RESTRICT` la versión bloquearía el mantenimiento del
  catálogo, y con `CASCADE` se perdería la prueba. Un identificador suelto no filtra nada, porque
  lo que hay detrás está bajo RLS. El paquete sí tiene foránea: se borra en blando.
- **Todas las foráneas son compuestas con `tenant_id`.** La de la oportunidad tiene tres columnas,
  `(oportunidad_id, contacto_id, tenant_id)`, y obliga a que sea del mismo contacto. La de
  `version_enviada`, `(tenant_id, id, version_enviada)`, obliga a que sea una versión de **esta**
  cotización. Esta última es `DEFERRABLE INITIALLY DEFERRED` porque cabecera y versiones se
  referencian en los dos sentidos. Prisma no modela `DEFERRABLE`.
- **`mensajes.cotizacion_id` ya tiene foránea**, compuesta y con `SET NULL ("cotizacion_id")`. Se
  creó `NOT VALID` y se validó en la misma migración, como pedía la cola. Prisma aplica el archivo
  en una sola transacción, así que esa división no acorta el bloqueo. Hoy da igual, porque ninguna
  fila tenía la columna llena. Con millones de filas, el `VALIDATE` iría en una migración aparte.
- **Margen desconocido es `NULL`, nunca 0.** El CHECK de la primera migración se podía saltar con
  la lógica de tres valores (`0 = NULL` da NULL y el CHECK pasa). Lo detectó la aserción 50 y lo
  corrige la segunda migración con `IS NOT DISTINCT FROM`.

Aserciones 47 a 52 en `tests/aislamiento.spec.ts`, más las mutaciones M8 a M13 en
`scripts/mutaciones-aislamiento.mjs`.

## Identidad global, pertenencia por agencia y roles como tabla (ADR-0011, 2026-10-19)

Migración `20261019230000_identidad_global_y_roles_por_agencia`.

```
                 GLOBAL (excepciones_rls, solo viajapro_identidad)         |  POR TENANT (RLS forzada)
                                                                           |
  identidades ──< credenciales                                             |
      │  └────< sesiones ── tenant_activo_id ──> tenants                   |
      │                                                                    |
      ├────< accesos_identidad (identidad_id, tenant_acceso_id) <── disparador ── usuarios ──> roles
      │                                                                    |   │ (rol_id, tenant_id)
      └──────────────────────────────── identidad_id ──────────────────────────┘
  verificaciones (sin FK: códigos previos a la sesión)                     |
```

**Por qué así.**

- **La identidad es global y la pertenencia no.** Una persona existe antes de elegir agencia;
  qué es en cada agencia (rol, clientes asignados) es dato de negocio y vive en `usuarios`, con
  RLS. Las FK que ya apuntaban a `usuarios(id, tenant_id)` no se tocan.
- **Ninguna tabla de identidad tiene una columna `tenant_id`.** El ADR nombraba así la de
  `accesos_identidad`; se llama `tenant_acceso_id` porque el aplicador de `001` es dirigido por
  datos y le habría puesto RLS: el selector, que corre sin tenant, vería cero filas.
- **`viajapro_identidad` no está en `roles_de_aplicacion`.** No recibe el `GRANT ... ON ALL
  TABLES`: sus únicos privilegios son las filas de `excepciones_rls`. La aserción 62 enumera todas
  las tablas no de identidad y exige 42501 en cada una.
- **`accesos_identidad` la escribe un disparador**, `sincronizar_acceso_identidad()`,
  `SECURITY DEFINER`, `search_path` vacío, dueño `viajapro_accesos` (NOLOGIN, solo `SELECT,
  INSERT, DELETE` sobre esa tabla). Lo dispara quien escribe `usuarios` bajo RLS, así que solo
  puede apuntar el par de una fila que ya pasó el `WITH CHECK`. En `UPDATE`, si cambia la
  identidad o el tenant, borra el par viejo.
- **Roles: tabla por tenant, no `enum`** (R12). Se eliminó `rol_usuario`. El catálogo de permisos
  es invariante: `PERMISOS` en `packages/contracts/src/identidad.ts` y el `CHECK
  roles_permisos_del_catalogo`. Tres roles sembrados por agencia con `clave` DUENO, ASESOR y
  OPERACIONES. `usuarios.rol_id` es foránea **compuesta** con `tenant_id`, `NO ACTION` para que
  el borrado en cascada de un tenant no tropiece a mitad de sentencia.
- **Relleno**: una identidad por correo (sin distinguir mayúsculas); DUENO y ADMINISTRADOR
  pasaron al rol DUENO, ASESOR y SOLO_LECTURA a ASESOR. Se borraron `usuarios.rol` y
  `usuarios.hash_contrasena` (vacía). **No reversible** en esa parte.
- **Hash del token y del OTP**: el esquema no lo impone (columnas `text`). Es requisito de la
  rebanada 2 y condición del auditor.

## Catálogo gestionable por la agencia: M1 y M2 (ADR-0017, 2026-10-26)

Migraciones `20261026120000_permiso_catalogo_administrar` (M1) y
`20261026120100_catalogo_extendido_formatos_y_opciones_de_salida` (M2). M3 (claves de API) sigue
bloqueada y no existe.

```
  tenants ──< formatos_de_viaje (plantilla jsonb)
                    ▲ (formato_id, tenant_id)  NO ACTION
                    │
              paquetes (codigo, cargos_en_destino, campos_personalizados, plan_alimentacion NULL)
                    │ (paquete_id, tenant_id)  CASCADE        │ (paquete_id, tenant_id)
                    ▼                                          ▼
           opciones_de_salida ◄──────────────────────── vigencias ──< tarifas
           (etiqueta, hora_salida time,          (opcion_de_salida_id, tenant_id) NO ACTION
            hora_regreso time, punto_de_encuentro)        (lista_unidades, promo_hasta)

  politicas_de_precio.promo_vencida  OCULTAR | TACHAR   (NOT NULL DEFAULT 'OCULTAR')
  roles_permisos_del_catalogo        + 'catalogo.administrar'  (DUENO y OPERACIONES)
```

**Por qué así.**

- **Dos tablas nuevas, las dos de negocio.** `formatos_de_viaje` y `opciones_de_salida` llevan
  `tenant_id`, RLS forzada con `USING` y `WITH CHECK` por `aplicar_aislamiento_tenant`, y no
  están en `excepciones_rls`: el literal de `aislamiento.spec.ts` no cambia. Aserciones 67 a 70.
- **Opciones de salida como tabla, no dos columnas de hora en `paquetes`** (corrección de
  `experto-turismo`, ADR-0017 §3.1): un producto tiene varias (turnos, modalidades con punto de
  recogida, hoteles) y una tarifa referencia una. Una referencia dentro de un `jsonb` no tendría
  integridad. Las horas son `time` sin zona: hora local del punto de encuentro, como la fecha de
  viaje es `date`.
- **Foráneas compuestas en `NO ACTION`**, no `RESTRICT` ni `SET NULL`: la cascada de un tenant se
  lleva formatos, paquetes, opciones y tarifas en la misma sentencia (RESTRICT abortaría a mitad),
  y `SET NULL` sobre una compuesta pondría a NULL también `tenant_id`. Un formato o una opción en
  uso se desactiva, no se borra. Que la opción de una tarifa sea del mismo paquete que su vigencia
  lo valida el núcleo de `quoting`: es coherencia de dominio, no aislamiento.
- **`codigo` único parcial** `(tenant_id, codigo) WHERE codigo IS NOT NULL AND eliminado_en IS
  NULL`; Prisma no modela índices parciales, así que vive solo en la migración.
- **`lista_unidades` nunca entra en el cálculo**; un `CHECK` exige `lista > venta`. La venta no
  cambia sola al vencer `promo_hasta`; `promo_vencida` decide solo qué se muestra.
- **Relleno agencia por agencia con `app.current_tenant`**: tanto la concesión del permiso (M1)
  como los cuatro formatos de sistema (M2) entran por el `WITH CHECK` de su agencia, de modo que
  el resultado no depende de que el rol de migraciones tenga `BYPASSRLS`. M1 verifica al final
  que ningún DUENO u OPERACIONES quedó sin el permiso.
- **Seguras en caliente**: columnas nulables o con `DEFAULT` constante (sin reescritura), y
  tablas de catálogo pequeñas. **Reversibles** por una migración posterior salvo el valor
  `PAQUETE` de `entidad_personalizable`, que PostgreSQL no deja quitar con `ALTER TYPE`.
- **Deuda declarada:** `plan_alimentacion` ya admite nulo, pero el contrato `Paquete` y la web
  aún lo tratan como obligatorio; la semilla real sigue poniendo `SIN_ALIMENTACION` hasta que
  T-041 y la web acepten el nulo. Ninguna fila existente queda nula.

### La versión de cotización guarda la opción de salida (T-062, 2026-10-27)

Migración `20261027130000_opcion_de_salida_en_la_version`.

```
  opciones_de_salida ◄──────────── versiones_cotizacion.opcion_de_salida_id (NULL)
                       (opcion_de_salida_id, tenant_id)  NO ACTION, validada
```

**Por qué así.**

- **Sin ella la versión no era reproducible.** Desde M2 el cotizador exige la opción cuando el
  producto las tiene y elige las tarifas con ella; la versión guardada no la conservaba, así que
  releer una cotización no decía con qué opción se formó el total ni permitía recotizarla igual.
- **Se guarda la que usó el SERVIDOR**, no la que pidió el cliente (`armarVersion` la toma de
  `calculo.opcionDeSalida`): si el producto no tiene opciones queda `NULL` aunque viniera una.
- **Nula y sin relleno.** Las versiones son inmutables (disparador): las anteriores a T-062 quedan
  en `NULL` = «no registrada», y no se reescribe la prueba.
- **Compuesta y `NO ACTION`**, como `tarifas.opcion_de_salida_id`: una opción citada por una
  versión se desactiva, no se borra; `SET NULL` sería además un UPDATE que el disparador rechaza.
  Se crea `NOT VALID` y se valida en la misma migración (sin bloquear escrituras).
- **Contrato:** `VersionDeCotizacion.opcionDeSalidaId` (`Id | null`). La API lo envía siempre; es
  opcional en el esquema Zod solo para que una respuesta anterior siga validando.
- Aserción `T-062` de `aislamiento.spec.ts`: foránea compuesta validada, control propio, lectura
  cruzada en cero, 23503 al citar la opción ajena, 42501 al plantar con el tenant ajeno,
  inmutabilidad de la columna y la opción citada no se borra.

## Auditoría: quién actuó, usuario o clave de API (T-071, 2026-10-27)

Migración `20261027140000_actor_en_la_auditoria`.

```
  registros_auditoria
    usuario_id       uuid NULL
    tipo_de_actor    tipo_de_actor NULL DEFAULT 'USUARIO'   USUARIO | CLAVE_DE_API
    clave_de_api_id  uuid NULL   (sin foránea hasta M3; será COMPUESTA con tenant_id)
    CHECK registros_auditoria_actor_coherente:
      CLAVE_DE_API ⇔ clave_de_api_id NOT NULL, y entonces usuario_id NULL
```

**Por qué así.**

- **Antes de la primera clave.** La API pública (M3) dejará cambiar precios con una clave; sin la
  columna, ese cambio nacería con `usuario_id` nulo e indistinguible de un registro viejo.
- **NULL en lo existente, USUARIO en lo nuevo.** `ADD COLUMN` sin DEFAULT y luego `SET DEFAULT`:
  las filas anteriores quedan en NULL («sin la distinción») en vez de afirmar algo que nadie
  registró, y ningún escritor actual tiene que cambiar.
- **Enum y no tabla por tenant** (R12): quién puede escribir es invariante del sistema, no
  política de la agencia.
- **Sin datos personales.** Un tipo y un id opaco. El historial de precios devuelve
  `actor: { tipo, claveDeApiId } | null` (contrato `CambioDePrecio`), nunca nombre ni correo.
- **CHECK en dos pasos** (`NOT VALID` + `VALIDATE`): la bitácora es de escritura continua y la
  validación no bloquea inserciones.
- Aserción `T-071` de `aislamiento.spec.ts`: RLS forzada con `WITH CHECK`, `tenant_id NOT NULL`,
  CHECK validado, DEFAULT USUARIO, control propio, lectura cruzada en cero, `WITH CHECK` al
  plantar con el tenant ajeno y 23514 en las tres medias identidades.
- **Cola (no bloquea, preexistente):** `registros_auditoria` no tiene foránea a `tenants` y su
  clave es `BIGSERIAL`; no cambia con T-071.

## Permisos de mutación: RBAC en las escrituras (T-089, 2026-11-04)

Migración `20261104130000_permisos_de_mutacion_rbac`. Sin tabla nueva ni cambio de forma.

```
  roles_permisos_del_catalogo   + 'bandeja.operar', 'crm.escribir', 'cotizacion.escribir'

  rol sembrado    bandeja.operar   crm.escribir   cotizacion.escribir
  DUENO                 sí              sí                 sí
  ASESOR                sí              sí                 sí
  OPERACIONES           no              no                 no      (solo lectura fuera del catálogo)
  propios (sin clave)   sin cambio: los compone la agencia
```

**Por qué así.**

- **OPERACIONES es el rol de solo lectura sembrado.** No se añade `SOLO_LECTURA` ni se amplía
  `roles_clave_sembrada`: el rol de lectura ya existe, y un cuarto sembrado sería un rol inventado.
- **Relleno sin duplicar ni quitar.** Solo se añaden los permisos que faltan, agencia por agencia
  con `app.current_tenant` (RLS forzada alcanza al dueño); la migración aborta si queda un
  DUENO/ASESOR sin los tres, con repetidos, o un OPERACIONES con alguno.
- **CHECK en dos pasos** (`NOT VALID` + `VALIDATE`): solo amplía la lista, así que lo existente
  siempre valida.
- **Ojo:** el relleno de ADR-0011 (2026-10-19) pasó los usuarios `SOLO_LECTURA` antiguos a
  ASESOR, que ahora escribe. Sin agencia real todavía, no hay a quién afectar.
- Prueba: `packages/database/tests/permisos-de-mutacion.spec.ts` reejecuta el relleno sobre
  agencias sembradas como antes, dentro de una transacción que se deshace.

## Permisos del archivo de viaje (T-249, 2026-11-17)

Migración `20261118100000_permisos_del_archivo_de_viaje`. Sin tabla nueva ni cambio de forma.

```
  roles_permisos_del_catalogo   + 'archivo.ver', 'archivo.operar'      (diez en total)

  rol sembrado    archivo.ver   archivo.operar
  DUENO               sí             sí
  ASESOR              sí             sí
  OPERACIONES         sí             sí      (sigue sin bandeja.operar, crm.escribir, cotizacion.escribir)
  propios (sin clave) sin cambio: sin ellos, 403 en /api/v1/archivos
```

**Por qué así.**

- **ADR-0024 §3.7.** Antes de esto la lectura de archivos estaba abierta a todo miembro (nombres y
  edades de pasajeros, menores incluidos) y las mutaciones exigían `cotizacion.escribir`, así que
  OPERACIONES no podía operar reservas y cualquier asesor podía marcarlas pagadas. Era el hallazgo
  de la auditoría de T-242.
- **OPERACIONES recibe `archivo.operar`.** Deja de ser «solo lectura fuera del catálogo»: confirmar
  con el proveedor y pagarle es su oficio. Los tres permisos de escritura de T-089 siguen sin llegarle.
- **Mismo relleno que T-089:** agencia por agencia con `app.current_tenant`, solo lo que falta, sin
  duplicar, y la migración aborta si un rol sembrado queda sin los dos o con repetidos. CHECK en dos
  pasos (`NOT VALID` + `VALIDATE`), y al final se comprueba que quedó validado con los dos.
- Pruebas: `packages/database/tests/permisos-de-archivo.spec.ts` (relleno sobre roles «como eran»,
  rol propio con `archivo.ver` admitido, permiso inventado rechazado, siembra) y
  `booking-archivos.e2e-spec.ts` con sesiones reales (403 sin `archivo.ver` o sin `archivo.operar`,
  archivo intacto; OPERACIONES opera). `permisos-de-mutacion.spec.ts` ya no reejecuta el CHECK de ocho
  de T-089: con roles reales que tienen `archivo.*`, validarlo fallaría.

## Cola de salida medida entre agencias (T-223, 2026-11-15)

Migración `20261115140000_medir_cola_de_salida`. Sin tabla nueva: un rol propietario y una función.

```
  trabajador (viajapro_webhook), cada 30 s
        │  SELECT * FROM medir_cola_de_salida()          -> (mas_vieja_s int, pendientes int)
        ▼                                                SECURITY DEFINER, search_path vacío
  viajapro_metricas (NOLOGIN, NOBYPASSRLS)               dueño; SELECT solo de columnas:
        │  para cada tenant:                               mensajes(tenant_id, estado, wamid, creado_en)
        │    set_config('app.current_tenant', t, true)     tenants(id)
        │    min(creado_en), count(*) WHERE estado = 'PENDIENTE' AND wamid IS NULL
        │  restaura el app.current_tenant del llamador     (idx_mensajes_envios_pendientes)
        ▼
  Redis  viajapro:cola-salida:antiguedad  ->  /salud/listo  { colaDeSalida: { estado, masViejaS, pendientes } }
```

**Por qué así.**

- **RLS intacta.** Ningún rol se salta RLS (aserción 14) y la tabla no gana una segunda política ni
  una excepción: la función ve una agencia por consulta, fijando el contexto como lo hace la API.
- **La forma es la frontera.** Una fila, dos enteros: ni ids, ni tenant, ni texto, ni desglose por
  agencia. Sin argumentos que abusar.
- **Rol nuevo y no `viajapro_staging`.** El staging ya guarda criptogramas de todas las agencias;
  darle además `mensajes` juntaría dos superficies. `viajapro_metricas` solo tiene SELECT de cuatro
  columnas de `mensajes` y del `id` de `tenants` (no puede leer `texto_cifrado` aunque cambie el
  cuerpo). Ningún rol de login es miembro suyo.
- **Sin `SET app.current_tenant` en la cabecera de la función:** con un dueño sin superusuario,
  PostgreSQL ≥ 15 rechaza fijar un parámetro de marcador de posición en `proconfig`. La función
  guarda y restaura el valor del llamador a mano.
- **No degrada `/salud/listo`.** Igual que la de entrada: se informa en `colaDeSalida`, el HTTP y
  `estado` no cambian. Sin la migración, el trabajador publica nada y la API dice `sin_verificar`.
- Pruebas: aserciones 12, 13, 14 y 20 (matriz, dueño, propietarios) y `T-223` en el bloque del
  inbox de `aislamiento.spec.ts`; `antiguedad-de-cola.spec.ts` y `salud.controller.spec.ts` en la API.

## Motivos de pérdida por agencia (T-214, 2026-11-15)

Migración `20261115150000_motivos_de_perdida_por_agencia`. **Fase de compatibilidad**: la tabla y
la foránea existen, la API sigue escribiendo el enum.

```
  tenants 1──n motivos_de_perdida (id, tenant_id, clave?, etiqueta, orden, activo, exige_nota, auditoría)
                     ▲  UNIQUE (tenant_id, clave), (tenant_id, etiqueta), (id, tenant_id)
                     │  FK compuesta (motivo_perdida_id, tenant_id), NO ACTION
  oportunidades.motivo_perdida  (enum, lo escribe la API)
        │  BEFORE INSERT/UPDATE OF motivo_perdida, motivo_perdida_id  (SECURITY INVOKER, bajo RLS)
        └─► oportunidades.motivo_perdida_id = motivo de la agencia con clave = enum
            (si la agencia no lo tiene, lo crea con la etiqueta canónica)
        CHECK oportunidades_motivo_perdida_pareja: los dos nulos o los dos presentes
```

**Por qué así.**

- **R12.** Cada agencia pierde por motivos propios; un enum exigía una migración para cada uno.
- **La taxonomía común no se pierde.** Los siete sembrados llevan `clave` = valor del enum, y la
  comparación entre agencias se hace por `clave`; los motivos propios van con `clave` nula, como
  `roles.clave` y `etapas_pipeline.clave`. Retirar un motivo es `activo = false`.
- **Compatibilidad y no corte.** Contrato, casos de uso y web siguen con el enum; el disparador
  mantiene la foránea sin tocar ningún camino de escritura. Es SECURITY INVOKER a propósito: no
  puede colgar una oportunidad del motivo de otra agencia, porque busca y crea bajo la RLS de
  quien escribe.
- **Siembra:** la migración siembra los siete por agencia existente (con las etiquetas que hoy
  pinta la web); `sembrarMotivosDePerdida` (`siembra-de-tenant.ts`) los siembra en la demo y en las
  agencias de prospecto.
- **Lo que queda (backend + frontend):** contrato con `motivoPerdidaId` y listado de motivos por
  agencia, casos de uso que escriban el id y validen `exige_nota`, la web que pinte la lista; después,
  una migración que retire el enum, el disparador y la pareja. `oportunidad_cambios_etapa` (solo
  añadir) conserva su enum: no admite el UPDATE de un relleno.

### El id escrito manda (T-229, migración `20261115190000_motivo_de_perdida_respeta_id`)

El disparador de 20261115150000 recalculaba el id desde el enum en cada escritura: un motivo propio
(clave nula, sin valor de enum) acababa en «Otro», y la API tuvo que rechazarlo. Ahora:

```
  BEFORE INSERT/UPDATE OF motivo_perdida, motivo_perdida_id, nota_perdida  (SECURITY INVOKER, search_path '')
    a. llega un motivo_perdida_id no nulo NUEVO  → se respeta; debe ser de la agencia (si no, 23503)
                                                   enum := su clave, u OTRO si es propio
    b. si no, cambia el enum (o la pareja quedaría coja) → id desde el enum, como antes
    c. si no cambia ninguno (solo la nota, o el mismo enum) → el id se queda
    en los tres: motivo con exige_nota ⇒ nota_perdida no vacía (23514)
  CHECK oportunidades_nota_perdida_exige_motivo: nota ⇒ hay motivo
  (cae oportunidades_motivo_otro_exige_nota: «OTRO exige nota» pasa a ser el dato exige_nota)
```

**Por qué cae el CHECK de `OTRO`.** Un motivo propio se guarda con enum `OTRO`; el CHECK le
exigiría nota aunque la agencia no la pida. La regla es el dato `exige_nota` (R12): el `OTRO`
sembrado lo lleva, así que los clientes que solo escriben el enum no notan nada. El historial de
etapas sigue guardando el enum (`OTRO` para los propios). La creación del motivo canónico usa
`ON CONFLICT (tenant_id, clave)` (T-230): una etiqueta repetida falla con su índice en vez de
tragarse. La API (`mover-oportunidad.ts`) escribe el id cuando llega `motivoPerdidaId`.

### Motivo retirado y «Otro» con nota, en la base (T-230/T-232, migración `20261115200000_endurecer_metricas_y_motivos`)

```
  motivo_de_perdida_desde_enum (CREATE OR REPLACE, mismo dueño, INVOKER, search_path '')
    si el id CAMBIA (INSERT, camino a o b) y el motivo tiene activo = false → SQLSTATE VP001
       («MOTIVO_DE_PERDIDA_INACTIVO: …»; la API → 409 MOTIVO_DE_PERDIDA_INACTIVO)
    camino c (nota, mismo id, mismo enum): un motivo ya puesto y luego retirado se conserva
  CHECK motivos_de_perdida_otro_exige_nota: clave IS DISTINCT FROM 'OTRO' OR exige_nota
       (antes, reparación agencia por agencia; NOT VALID + VALIDATE; la API → 422 MOTIVO_OTRO_EXIGE_NOTA)
```

**Por qué.** La API comprobaba `activo` en una transacción y escribía en otra, y en el camino del
enum no lo miraba: un motivo retirado se podía asignar por SQL directo o por un cliente antiguo.
`VP001` es de una clase (`VP`) que PostgreSQL no usa. Sin `FOR SHARE` sobre el motivo: una
desactivación simultánea equivale a una que llega justo después, que también se permitiría.
«Otro» sin explicación es una pérdida que no se puede atribuir; por eso es CHECK y no solo regla
de la API. `medir_cola_de_salida` no se reescribe: un error a mitad aborta la (sub)transacción y
el motor deshace su `set_config` local; lo fija una prueba de comportamiento (T-230 en
`aislamiento.spec.ts`), junto con la superficie EXACTA de columnas de `viajapro_metricas`, que
también comprueba el cinturón de la migración.


## Archivo de viaje, reservas y pasajeros (ADR-0024 F1, T-240, migración `20261117120000_archivo_de_viaje_reservas_y_entregas`)

```
  tenants ─┬─< travel_files (numero único por agencia; UNIQUE (tenant_id, cotizacion_id))
           │     ├─ (contacto_id, tenant_id)                    → contactos
           │     ├─ (oportunidad_id, contacto_id, tenant_id)    → oportunidades   (nula)
           │     ├─ (cotizacion_id, tenant_id)                  → cotizaciones
           │     ├─ (tenant_id, cotizacion_id, version_cotizacion) → versiones_cotizacion (numero)
           │     ├─< bookings   (travel_file_id, tenant_id); (mayorista_id, tenant_id) → mayoristas
           │     │               ON DELETE SET NULL ("mayorista_id"): el nombre queda copiado
           │     └─< pasajeros  (travel_file_id, tenant_id); un solo titular (índice parcial)
           └─< entregas_de_eventos  PK (tenant_id, outbox_id, consumidor)
                 └─ (outbox_id, tenant_id) → outbox (id, tenant_id)  ON DELETE CASCADE
```

- **Estados como CHECK por paso.** `estado_reserva`: `SOLICITADA`+ exige `solicitada_en`;
  `CONFIRMADA`+ exige `confirmada_en` y `time_limit`; `ABONADA_AL_PROVEEDOR`+ exige `abonada_en` y
  `pago_total_vence_en`; `PAGADA_AL_PROVEEDOR` exige `pagada_en`; `CAIDA` y solo `CAIDA` lleva
  `motivo_caida`; `time_limit ≤ pago_total_vence_en`. El archivo guarda solo `ABIERTO`/`CANCELADO`
  (cancelado exige motivo, instante y autor, y nota si el motivo es `OTRO`); el avance lo deriva el
  dominio. La máquina de transiciones es del dominio (F3); los CHECK son la red.
- **Copia de lo vendido** (paquete, destino, `fecha_salida` `date`, noches, conteos, `venta_unidades`
  + `moneda_iso`, TRM completa o nula) desde una versión inmutable: no diverge.
- **Pasajero mínimo, sin PII sensible**: nombre, `tipo_pasajero` (ADT/CHD/INF), edad al viaje
  (obligatoria para CHD e INF), titular. Documento y fecha de nacimiento no existen (ADR de PII del
  pasajero, ADR-0015).
- **Sin DELETE ni `eliminado_en` en archivos, reservas y entregas**: se cancelan, se caen o se
  marcan. `pasajeros` sí admite DELETE: la lista se reemplaza entera.

**`privilegios_declarados`: amplía ADR-0008 §1.3.** Tabla global hermana de `excepciones_rls` (y
declarada en ella sin privilegios), para tablas CON RLS forzada cuyos privilegios son más estrechos
que la concesión general. `aplicar_privilegios_declarados()` gana un tercer paso (§5.3 de
`policies/001`): por cada tabla declarada × cada rol de login vigilado, `REVOKE ALL` y `GRANT` de lo
declarado; un par sin declarar se revoca entero. Lanza si una tabla está en las dos declaraciones,
si la declarada no tiene RLS forzada o si nombra un rol que existe y no está vigilado. Las cuatro
tablas son **solo de `viajapro_app`**; `viajapro_webhook`, `viajapro_altas` e `viajapro_identidad`
reciben 42501. Lo fijan el cinturón de la migración y `aislamiento.spec.ts` (literal
`PRIVILEGIOS_DECLARADOS`, reaplicado en las aserciones 22 y 23, y el bloque «T-240»).

**Por qué.** La agencia piloto pierde ventas cuando se le pasa el *time limit* o la fecha de pago
total del mayorista (ADR-0024, Contexto); el modelo los hace obligatorios en el paso en que existen.
Quedan para F2–F5: el despachador y el consumidor, el rol `viajapro_planificador` con sus dos
funciones, los permisos `archivo.*` y la guardia de arranque del trabajador.


## TRM y mayorista en la versión; eventos por entregar (ADR-0024 F2, T-241, migraciones `20261118090000_trm_y_mayorista_en_la_version` y `20261118090100_rol_planificador_y_eventos_por_entregar`)

```
  versiones_cotizacion  + trm_moneda_origen char(3), trm_moneda_destino char(3),
                          trm_valor numeric(18,6), trm_fecha date, trm_fuente fuente_trm   (nulables)
                          CHECK versiones_cotizacion_trm_valida: las cinco o ninguna, ISO en
                          mayúsculas, origen ≠ destino, trm_valor > 0
                          alta: trm_moneda_destino = tenants.moneda_iso
                          alta: lineas[].mayoristaId ausente, null o un mayorista de ESTA agencia
  travel_files          + CHECK travel_files_trm_valida (la misma regla)

  viajapro_planificador (NOLOGIN, NOBYPASSRLS, NOINHERIT)
    └─ dueño de tenants_con_eventos_por_entregar(p_consumidor text, p_tipo_evento text) → SETOF uuid
         SELECT de columnas: tenants (id, estado) · outbox (id, tenant_id, tipo_evento, ocurrido_en)
                             entregas_de_eventos (tenant_id, outbox_id, consumidor, entregado_en,
                             abandonado_en)
         EXECUTE: solo viajapro_app
```

- **La TRM es de lo ofrecido** y queda congelada con la versión (el disparador de inmutabilidad no
  cambia: rechaza todo UPDATE). Nulas = versión en la moneda de la agencia (todo el piloto, COP).
  No se exige TRM ni `mayoristaId` todavía: la API anterior a F2 escribe versiones sin ellas.
- **`mayoristaId` por línea** vive en el JSON `lineas`, que no admite foránea: el disparador de alta
  hace de foránea compuesta con el tenant. Sin él, una versión podría congelar el mayorista de otra
  agencia y el consumidor `booking.abrir_archivo` chocaría en bucle con la foránea de `bookings`.
- **`travel_files_trm_valida` corrige un hueco de F1**: en `travel_files_trm_completa`, con
  `trm_moneda_origen` NULL y las otras cuatro presentes, el CHECK evaluaba a NULL y pasaba. Se añade
  el correcto al lado; la migración aplicada no se edita.
- **`tenants_con_eventos_por_entregar`** (decimoquinta `SECURITY DEFINER`): agencias `ACTIVO` o
  `EN_PRUEBA` con algún evento de ese tipo de los últimos 7 días sin entrega hecha ni abandonada
  para ese consumidor; `LIMIT 500`, en orden de id. Recorre las agencias fijando
  `app.current_tenant` (RLS intacta) y devuelve el del llamador al terminar. Argumentos validados
  contra el formato `contexto.nombre` (22023). Las columnas de `bookings` que ADR-0024 §5.3 da al
  rol llegan con `reservas_con_plazo_por_avisar` en F5.

**Por qué.** El consumidor de F2 crea una reserva por mayorista sin leer el catálogo, y el
despachador necesita saber qué agencias tienen trabajo sin una vía de plataforma. Lo fijan los
cinturones de las dos migraciones y el bloque «T-241» de `aislamiento.spec.ts` (más las aserciones
12, 13, 14 y 20, que pasan de 14 a 15 funciones y de 5 a 6 propietarios).


## La reserva atada a su archivo; `ocurrido_en` lo pone la base (T-256, T-257, migración `20261120090000_reserva_atada_a_su_archivo_y_ocurrido_en_de_la_base`)

```
  bookings  + UNIQUE bookings_id_travel_file_id_tenant_id_key (id, travel_file_id, tenant_id)
     ▲
     ├── notificaciones          (reserva_id, archivo_id, tenant_id)  NO ACTION / ON UPDATE RESTRICT
     └── reserva_cambios_estado  (reserva_id, archivo_id, tenant_id)  NO ACTION / ON UPDATE RESTRICT
                                 BEFORE INSERT: ocurrido_en := now()  (fijar_ocurrido_en_de_la_base)
```

- **Una foránea de tres columnas en lugar de dos separadas.** Antes, `(reserva_id, tenant_id)` y
  `(archivo_id, tenant_id)` impedían apuntar a otra agencia, pero no que una fila nombrara la reserva
  de OTRO archivo de la misma agencia; solo lo impedía el puerto de `booking`. La foránea directa al
  archivo desaparece: la nueva exige que el archivo sea el de la reserva, y la de `bookings` a
  `travel_files` que exista. Como efecto, una reserva referenciada no puede cambiar de archivo.
  La migración aborta, con agencia, tabla y ejemplo, si alguna fila existente no casa.
- **`ocurrido_en` del historial de reservas no lo elige quien escribe.** Un disparador BEFORE INSERT
  lo fija al instante de la transacción. No se hizo con INSERT por columnas porque
  `privilegios_declarados` declara privilegios de tabla y `aplicar_privilegios_declarados()` revoca y
  vuelve a conceder en cada migración: un GRANT por columnas se perdería en la siguiente sin aviso.
  La inmutabilidad no cambia: `viajapro_app` sigue con SELECT e INSERT.

**Por qué.** Hallazgos BAJOS de las auditorías de T-254 y T-250/T-251. Lo fijan el cinturón de la
migración y `aislamiento.spec.ts` (N-2, N-5, H-2, H-6 y H-8).


## Registro autoservicio de agencias (ADR-0030 F1, T-268, migración `20261120140000_registro_de_agencias_rol_y_crear_agencia`)

```
  tenants  + origen_del_alta origen_del_alta NOT NULL DEFAULT 'PLATAFORMA'  (PLATAFORMA | AUTOSERVICIO)
           + creado_por_identidad_id uuid → identidades  RESTRICT
           + prueba_termina_en timestamptz · encargo_version varchar(40) · encargo_aceptado_en timestamptz
           CHECK tenants_encargo_completo (versión y fecha juntas) · tenants_autoservicio_completo
           excepciones_rls para viajapro_app: SIGUE {SELECT}

  perfiles_de_agencia (la creó T-261, 20261120130000: tenant_id PK, rnt, verificado_en, RLS,
                       solo viajapro_app {SELECT, INSERT, UPDATE})
     + nit text (1-15 dígitos) · digito_verificacion smallint (0-9, solo con nit) · razon_social text
     proteger_verificacion_del_perfil REEMPLAZADA: quien no es la plataforma no fija ni borra
       verificado_en; cambiar rnt, nit o digito_verificacion lo anula (salvo que la plataforma lo
       vuelva a fijar en el mismo UPDATE). razon_social no lo anula.

  GLOBALES (excepciones_rls, sin tenant_id)
     aceptaciones_de_identidad      → identidades RESTRICT   viajapro_identidad {SELECT, INSERT}
     codigos_de_registro            correo_hmac UNIQUE, intentos_restantes >= 0   viajapro_identidad DML
     codigos_de_acceso_al_registro  hash PK, correo_hmac NOT NULL   ningún rol de login
     parametros_del_registro        una fila, tope_por_hora 1..1000 (30)   ningún rol de login

  viajapro_registro (NOLOGIN, NOBYPASSRLS, NOINHERIT; el de migraciones: SET TRUE, INHERIT FALSE)
    ├─ dueño de crear_agencia(p_nombre, p_slug_base, p_pais_iso, p_moneda_iso, p_zona_horaria,
    │                         p_identidad_id, p_dias_de_prueba, p_version_encargo,
    │                         p_hash_codigo_de_acceso, p_correo_hmac) → uuid          VOLATILE
    └─ dueño de codigo_de_acceso_vigente(p_hash, p_correo_hmac) → boolean            STABLE
         columnas: tenants SELECT (id, slug, estado, origen_del_alta, creado_por_identidad_id, creado_en)
                   tenants INSERT (13 columnas de la fila nueva; ni UPDATE ni DELETE ni TRUNCATE)
                   monedas SELECT (codigo_iso) · parametros_del_registro SELECT (tope_por_hora)
                   codigos_de_acceso_al_registro SELECT (hash, usado_en, expira_en, correo_hmac),
                                                 UPDATE (usado_en, usado_por_identidad_id)
         EXECUTE: solo viajapro_app · proconfig exactamente {search_path=""}
```

- **`crear_agencia` es la única vía por la que un rol de aplicación crea una fila de `tenants`**, y
  solo inserta: el id lo elige la base (`gen_random_uuid()`), el slug choca con `ON CONFLICT (slug)
  DO NOTHING` (sin bloques `EXCEPTION`) y se reintenta con base + 4 hex hasta 5 veces, y los slugs
  reservados nunca se asignan tal cual. Aborta con `42501` si `app.current_tenant` no estaba vacío;
  `22023` si un dato no vale; `VPR01` si la identidad ya tiene una agencia de autoservicio en prueba
  (bajo `pg_advisory_xact_lock(7410102, hashtext(identidad))`); `VPR04` si el código de acceso no
  existe, está usado o caducado o es de otro correo (lo consume con un `UPDATE … WHERE usado_en IS
  NULL AND expira_en > now() AND correo_hmac = …`, que un `ROLLBACK` deshace); `VPR02` con el tope por
  hora; `VPR03` sin slug libre. Su última sentencia fija `app.current_tenant` a la agencia nueva, y
  ese valor sobrevive al volver (supuesto S1): la API no fija el tenant, lo hereda.
- **Tipos calificados por `pg_temp`.** Con `search_path = ''` los nombres de TIPO se siguen buscando
  primero en `pg_temp`: un dominio `pg_temp.text` con un CHECK trampa correría como
  `viajapro_registro`. Las dos funciones nombran todos sus tipos como `pg_catalog.*` y el cinturón de la
  migración aborta si aparece uno sin calificar (hallazgo B3; R-10 lo prueba con la trampa real).
- **El NIT no va en `tenants`** (la leen enteros tres roles de login, y el de una persona natural es
  su cédula): va en `perfiles_de_agencia`, bajo RLS y en claro (ADR-0030 «Negativas»). Lo declarado
  por el registrante no está verificado; el disparador de T-261, ampliado aquí al NIT y su DV, y no un
  `GRANT` por columnas, lo garantiza, porque `privilegios_declarados` no admite columnas.

**Por qué.** ADR-0030: una agencia puede darse de alta sola sin que la API pueda escribir `tenants`
ni tocar una agencia existente. Lo fijan el cinturón de la migración (aborta si la superficie de
`viajapro_registro` difiere de la declarada) y el bloque «T-268» de `aislamiento.spec.ts` (R-1 a R-9),
más las aserciones 10, 11, 12, 13, 14, 20, 62, 83, AUD-008 y P-1, que pasan a 17 funciones, 7
propietarios, 7 tablas de identidad y tres columnas de texto en `perfiles_de_agencia`.

## El RNT de la agencia: `perfiles_de_agencia` (T-261, ADR-0030 §3.3, migración `20261120130000_perfiles_de_agencia_con_rnt`)

```
  tenants
     ▲
     └── perfiles_de_agencia   (tenant_id PK = FK)   ON DELETE CASCADE
           rnt            text NULL      CHECK solo dígitos, 1 a 10
           verificado_en  timestamptz NULL   CHECK: verificado exige rnt
           BEFORE INSERT OR UPDATE: proteger_verificacion_del_perfil
```

- **Una fila por agencia, o ninguna.** La API la crea al guardar (upsert, bajo RLS). El RNT no va en
  `tenants`: esa tabla la leen enteros tres roles de login (ADR-0030).
- **Lo que declara la agencia no está verificado.** `verificado_en` solo lo conserva la plataforma,
  que aquí es el DUEÑO de la tabla (el rol de las migraciones). El disparador es SECURITY INVOKER y
  niega por defecto: para cualquier otro rol, al insertar queda en NULL; al actualizar, si cambia el
  RNT queda en NULL y si no cambia conserva el valor anterior. La plataforma sí puede fijarlo, pero
  si cambia el RNT sin tocar `verificado_en`, también queda en NULL.
- **Solo `viajapro_app`**, con SELECT, INSERT y UPDATE (sin DELETE), declarado en
  `privilegios_declarados`. Ningún rol de aplicación es miembro del dueño.
- **Ningún documento hacia el viajero imprime el RNT sin `verificado_en`.** La API lo expone como
  `rntVerificado` y la propuesta (`/cotizaciones/[id]/imprimir`) lo imprime solo si es `true`.
- **Lo que viene.** `nit`, `digito_verificacion` y `razon_social` llegan con T-268 como columnas
  añadidas, **pero T-268 también tiene que reemplazar el disparador** para que cambiar el `nit`
  anule la verificación. Quién marca `verificado_en` sin SQL a mano lo decide T-280.

**Por qué.** La propuesta al viajero debe llevar el RNT (Ley 300 de 1996) y un documento con peso
legal no puede imprimir el que cualquiera pudo escribir. Lo fijan el cinturón de la migración y
`aislamiento.spec.ts` (P-1 a P-6).

## Etiquetas de conversación por agencia (T-324, HU-inbox-1, migración `20261121110000_etiquetas_por_agencia`)

```
  tenants 1──n etiquetas (id, tenant_id, nombre varchar(30), color, orden, auditoría)
                 UNIQUE (tenant_id, lower(btrim(nombre)))      «Pagado» = «pagado »
                 UNIQUE (id, tenant_id)                        destino de la FK compuesta
                 CHECK color IN (gris, azul, turquesa, verde, ambar, naranja, rosa, dorado)
                 CHECK nombre: 1-30, sin espacios a los lados ni caracteres de control
                    ▲ (etiqueta_id, tenant_id)  ON DELETE CASCADE
                    │
  conversacion_etiquetas  PK (tenant_id, conversacion_id, etiqueta_id)   asignada_en, asignada_por?
                    │      INDEX (tenant_id, etiqueta_id, conversacion_id)   el filtro de la bandeja
                    ▼ (conversacion_id, tenant_id)  ON DELETE CASCADE
  conversaciones (id, tenant_id)          · (asignada_por, tenant_id) → usuarios, NO ACTION
```

- **A la conversación y solo a ella** (HU-inbox-1 §2): no al archivo (el estado de cobro lo calcula el
  servidor y no se duplica) ni al contacto (`contactos.etiquetas` sigue como está).
- **R12: tabla por agencia.** El color, en cambio, es **un CHECK contra la paleta fija** del sistema de
  diseño: es invariante de accesibilidad (contraste AA, sin rojo), no política de la agencia. No es
  `enum` de Postgres ni tabla global: ampliar la paleta es ampliar el CHECK (`NOT VALID` + `VALIDATE`),
  como `roles_permisos_del_catalogo`, sin una excepción nueva en `excepciones_rls`.
- **Aislamiento (R1).** Las dos tablas llevan `tenant_id`, RLS forzada y la política canónica; las
  tres foráneas hacia tablas de agencia son **compuestas con el tenant**, así que una asignación no
  cruza agencias ni con el rol propietario. Solo `viajapro_app` las toca (`privilegios_declarados`):
  `etiquetas` con SELECT/INSERT/UPDATE/DELETE, `conversacion_etiquetas` sin UPDATE (se pone o se
  quita). El trabajador del webhook, las altas e identidad, nada.
- **Borrado físico**, porque la historia lo fija («se quita de todas, no se puede deshacer»): sin PII
  sensible ni valor contable que conservar, y sin unicidades parciales ni filtros de `eliminado_en` en
  cada lectura de la bandeja.
- **Topes en la API, no en la base** (50 por agencia, 10 por conversación): son supuestos de producto
  que pueden moverse (HU-inbox-1 §7), no invariantes; T-325 los impone con error tipado serializando
  por agencia/conversación.
- **Siembra.** La migración da «Pagado» (verde), «Pago pendiente» (ámbar) y «Seguimiento» (azul) a
  toda agencia existente sin duplicar por nombre normalizado; `sembrarEtiquetas`
  (`siembra-de-tenant.ts`) lo hace en la demo y en las agencias de prospecto.
- **Datos actuales.** `conversaciones.etiquetas` (arreglo libre) se **copió** al catálogo de su agencia
  en gris, con sus asignaciones, normalizado como lo hará la API (control → espacio, recorte, 30
  caracteres, unión por nombre normalizado). La columna se queda, sin escritor, hasta que T-325 cambie
  el contrato; entonces una migración la retira.
- **Permiso `etiquetas.administrar`** (crear, renombrar, recolorear, ordenar, borrar): undécimo del
  CHECK `roles_permisos_del_catalogo`, concedido al `DUENO` de las agencias existentes y en
  `ROLES_SEMBRADOS`. Poner y quitar sigue siendo `bandeja.operar`.

**Lo fijan** el cinturón de la migración, `aislamiento.spec.ts` (bloque «T-324», E1 a E7, más los
literales `PRIVILEGIOS_DECLARADOS` y `COLUMNAS_DE_TEXTO_DECLARADAS`) y `etiquetas-por-agencia.spec.ts`
(los rellenos, reejecutados sobre agencias «como eran antes»).

## Libro de cobro del viajero: `pagos`, `plazos_de_cobro` y `parametros_de_cobro` (T-329, ADR-0034, migración `20261121140000_pagos_del_viajero_libro_de_cobro`)

```
  tenants 1──n pagos (id, tenant_id, travel_file_id, tipo, monto_unidades bigint, moneda_iso,
                      pagado_el, medio, pagador_id?, referencia?, nota?, nota_tachada_en?, motivo?,
                      reverso_de_id?, clave_idempotencia, registrado_por, registrado_en)
                 UNIQUE (tenant_id, clave_idempotencia)               R5
                 UNIQUE parcial (tenant_id, reverso_de_id)            un reverso por movimiento
                    │ (travel_file_id, tenant_id, moneda_iso) → travel_files       NO ACTION
                    │ (reverso_de_id, tenant_id, travel_file_id, monto_unidades, moneda_iso) → pagos
                    │ (pagador_id, tenant_id) → contactos · (registrado_por, tenant_id) → usuarios
  tenants 1──n plazos_de_cobro (id, tenant_id, travel_file_id, vence_el date, motivo?, registrado_por, registrado_en)
  tenants 1──1 parametros_de_cobro (tenant_id PK, dias_plazo_de_cobro 0..365, actualizado_por, actualizado_en)
  travel_files   UNIQUE (id, tenant_id, moneda_iso)  ·  BEFORE UPDATE travel_files_venta_inmutable
```

- **Es un libro, no un saldo.** Una fila por movimiento. El enum `tipo_movimiento_de_cobro` (`PAGO`,
  `DEVOLUCION`, `REVERSO`, `AJUSTE`, `PENALIDAD`) es invariante del dominio, no política de agencia
  (R12). El saldo y el estado de cobro **no son columnas**: los calcula `payments` al leer.
- **Dinero (R8).** `monto_unidades` es `bigint` en la unidad mínima de la moneda del archivo (en COP,
  el peso). CHECK: valor absoluto entre 1 y 10¹⁵ − 1; negativo solo en `AJUSTE` (descuento) y en el
  `REVERSO` que copia un descuento. `pagado_el` y `medio` solo en `PAGO` y `DEVOLUCION`; `pagador_id`
  solo en `PAGO`; `motivo` obligatorio en `AJUSTE`, `PENALIDAD` y `REVERSO`; `reverso_de_id` solo y
  siempre en `REVERSO`. `medio` es catálogo cerrado por CHECK (ocho valores).
- **Foráneas compuestas con el tenant.** Un movimiento no puede apuntar al archivo, al contacto
  pagador ni al usuario de otra agencia aunque se conozca el id, ni estar en otra moneda que la del
  archivo. El reverso queda atado por cinco columnas al mismo archivo, agencia, monto y moneda que el
  original. Por eso `travel_files` gana la clave `UNIQUE (id, tenant_id, moneda_iso)`: ninguna fila
  existente puede violarla, porque `id` ya es único.
- **Aislamiento (R1).** Las tres tablas con `tenant_id NOT NULL`, RLS habilitada y **forzada** por
  `aplicar_aislamiento_tenant`, ninguna en `excepciones_rls`.
- **Privilegios, solo `viajapro_app`** (`privilegios_declarados`): `pagos` y `plazos_de_cobro`
  `{SELECT,INSERT}`; `parametros_de_cobro` `{SELECT,INSERT,UPDATE}`. `viajapro_webhook`,
  `viajapro_altas` y `viajapro_identidad`, nada; nadie tiene `TRUNCATE`.
- **Disparadores** (los tres `SECURITY INVOKER`, `SET search_path = ''`, `REVOKE ALL … FROM PUBLIC`;
  ninguna función `SECURITY DEFINER` nueva):
  - `pagos_validar_alta` (`BEFORE INSERT`): un reverso no reversa a otro reverso (con candado
    consultivo por archivo, para que valga en carrera) y `registrado_en` es la hora de la sentencia,
    no la que mande el cliente.
  - `pagos_inmutables` (`BEFORE UPDATE OR DELETE`) y `pagos_sin_truncate` (`BEFORE TRUNCATE`): nadie
    edita ni borra el libro. Dos salidas, solo para el **dueño de la tabla** y declaradas en la
    transacción: la purga de una agencia (`viajapro.purga_de_tenants`) y el tachado de `nota` y
    `referencia` (`viajapro.tachado_de_notas`), que solo admite poner ambas en nulo y fijar
    `nota_tachada_en`. El tachado es procedimiento de operación, no ruta de la API.
  - `travel_files_venta_inmutable` (`BEFORE UPDATE`): `id`, `tenant_id`, `venta_unidades` y
    `moneda_iso` del archivo no cambian nunca, tampoco para el dueño. Lo que cambie el total va al
    libro como `AJUSTE`. Un `UPDATE` de `estado` sigue funcionando.
- **Por qué privilegio y disparador en `pagos`:** es dinero. El privilegio frena a la API; el
  disparador frena al dueño y sobrevive a una migración futura que amplíe privilegios por error.
  `plazos_de_cobro` se queda solo con el privilegio, como `reserva_cambios_estado`.
- **`tenants.id` es inmutable por diseño.** La cascada `ON UPDATE` de una agencia chocaría con los
  disparadores; se decidió no abrirles excepción (PUNTO B del encabezado de la migración).
- **Permisos** `cobro.ver`, `cobro.registrar` y `cobro.corregir`: del once al catorce en el CHECK
  `roles_permisos_del_catalogo`. Siembra con separación de funciones: `DUENO` los tres, `ASESOR`
  ver y registrar, `OPERACIONES` solo ver (supuesto del ADR, sin verificar con el dueño).
- **Sin datos de tarjeta.** `nota`, `referencia` y `motivo` van en claro bajo RLS, no son PII
  sensible según R10, y nunca salen a logs, outbox ni auditoría (lo cuida la API, T-330).
- **Sin fila, rige 30.** `parametros_de_cobro` no se siembra ni se toca en `crear_agencia`.

**Lo que la base no garantiza y queda a la API (T-330, en curso):** que un reintento con la misma
clave traiga el mismo contenido; el tipo permitido según el estado del archivo; que `pagado_el` no
sea futuro; que lo pagado y el total no queden negativos; el filtro Luhn sobre `nota` y `referencia`; y
quién puede qué.

**Lo fijan** el cinturón de la migración y el bloque «T-329» de `aislamiento.spec.ts`. Ambos solo
corren en el CI (job `aislamiento-tenants`): la migración no se ejecutó contra una base local.
Reversible con otra migración mientras no haya movimientos reales; después, el libro no se borra: se
supersede ADR-0034.

## El permiso `reportes.ver_agencia` (T-341, ADR-0035 §3, migración `20261121160000_permiso_reportes_ver_agencia`)

Sin tabla nueva ni cambio de forma: un permiso más en el catálogo cerrado y un relleno.

```
  roles_permisos_del_catalogo   + 'reportes.ver_agencia'      (quince en total)

  rol sembrado          reportes.ver_agencia
  DUENO                        sí
  ASESOR                       NO   → ve «lo propio», que es la AUSENCIA del permiso
  OPERACIONES                  NO   → igual (ADR-0035 §3, pregunta 2 [No])
  propios (sin clave)   sin cambio: los compone la agencia desde Ajustes
```

**Por qué así.**

- **Un solo permiso, y su ausencia es el nivel «propio».** «Propio» es el mínimo de cualquier
  miembro: un `reportes.ver_propio` sería superficie sin uso ni prueba. Tampoco hay nivel «equipo»
  (no hay tabla de equipos ni sedes): queda nombrado en el ADR y en T-491.
- **El nivel lo da un permiso, no la clave del rol.** Los roles son tabla por agencia (R12) y se
  renombran y se componen; un `if rol === 'DUENO'` se rompe con el primer rol propio.
- **Ni `ASESOR` ni `OPERACIONES`.** Entre asesores de una misma agencia esto es un requisito de
  seguridad, no de presentación (decisión D3 del propietario): la web no puede ser la que oculta.
- **Relleno sin duplicar ni quitar**, agencia por agencia con `app.current_tenant` (RLS forzada
  alcanza al dueño), solo sobre el rol con clave `DUENO`; ningún `UPDATE` sin filtro de agencia.
  Los roles que creó la agencia no se tocan. La migración aborta si un DUENO queda sin el permiso
  o con repetidos, **o si un ASESOR u OPERACIONES acaba teniéndolo**.
- **CHECK en dos pasos** (`NOT VALID` + `VALIDATE`, con aserción final de que quedó validado): solo
  amplía la lista, así que todo lo existente valida. El cinturón comprueba además que los catorce
  permisos anteriores siguen ahí.
- **El permiso nace inerte.** Nadie lo lee todavía: quien deriva el alcance de la sesión es T-342
  (`alcanceDeReporte`, contrato con unión discriminada, 403 con `asesorId` ajeno). El orden
  inverso —el alcance antes que el permiso— sí habría dejado un hueco.
- Reflejo exacto en `PERMISOS` (`packages/contracts/src/identidad.ts`, R3), en `ROLES_SEMBRADOS`
  (`packages/database/prisma/siembra-de-tenant.ts`, lo que reciben las agencias nuevas) y en la
  etiqueta legible de la web (`apps/web/src/lib/permisos.ts`).
- **`aislamiento.spec.ts` no cambia**: no hay tabla nueva ni excepción de RLS que declarar (R1).
- Pruebas: `packages/database/tests/permisos-de-reportes.spec.ts` (CHECK vigente con el permiso y
  con los catorce anteriores; relleno reejecutado sobre agencias «como eran antes», incluidas una
  que renombró su rol, una que ya lo tenía a mano y una sin `DUENO`; el relleno aborta si un
  `ASESOR` lo lleva; `reportes.ver_propio` rechazado con 23514; siembra) y
  `packages/contracts/src/identidad.spec.ts` (quince, sin repetidos).
