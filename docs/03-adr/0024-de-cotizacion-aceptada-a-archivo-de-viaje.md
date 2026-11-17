# ADR-0024 — De cotización aceptada a archivo de viaje: reserva, *time limit* y TRM congelada (MVP de `booking`)

- **Estado:** Aceptado (2026-11-17, por delegación expresa del propietario; ver `docs/_contexto/DIARIO.md`,
  entrada 2026-11-17, que adopta este ADR como dirección de la Fase 1)
- **Fecha:** 2026-11-15 (revisado en sitio el 2026-11-17 mientras estaba Propuesto; ver «Historial de revisión»)
- **Decide:** propietario (delegado), a propuesta de `arquitecto`
- **Consultados:** `experto-turismo` (modelo de negocio, 2026-11-17), `auditor-seguridad` (tablas de
  tenant, consumidor de eventos, funciones entre agencias, 2026-11-17). Pendiente: `dueno-de-producto`
  (orden de las fases, no la forma)
- **Tarea:** T-213 (hallazgo A17). Depende de T-191 (evento de aceptación), que este ADR redefine en
  su despachador (§1)
- **Amplía:** [ADR-0008](0008-resolucion-de-tenant-en-webhooks-entrantes.md) §1.3 (los tres roles de
  login dejan de tener privilegios *siempre* idénticos: §5.2) y su inventario de funciones `SECURITY
  DEFINER` (§5.3), por la misma vía que [ADR-0026](0026-rol-viajapro-metricas-y-medir-cola-de-salida.md).
  No supersede nada.

---

## Contexto

La agencia piloto **revende paquetes de mayoristas y no opera**
(`docs/01-producto/11-dictamen-del-catalogo-real.md`). Su riesgo diario no es el inventario: es el
**plazo del mayorista**. Hoy el recorrido comercial termina en `ACEPTADA`. Después no hay nada: el
asesor pide el cupo al mayorista por WhatsApp o correo, espera la confirmación, anota el *time limit*
del abono y la fecha de pago total en una libreta, y si se le pasa uno de los dos **el mayorista
deja caer la reserva y la venta se pierde**. El contexto `booking` está en el mapa (`TravelFile`,
`Booking`, `TimeLimit`, `TimeLimitApproaching`) pero no existe un archivo de código ni una tabla.
`Mayorista.diasTimeLimit` está en el esquema desde el catálogo y **nadie lo lee**.

Dos huecos más, del mismo hallazgo:

- **TRM.** El lenguaje ubicuo define «TRM aplicada» (`exchangeRate`). `versiones_cotizacion` tiene
  **una sola** `moneda_iso` y ninguna tasa. Un paquete tarifado en USD y conversado en pesos no tiene
  dónde guardar a qué tasa se le habló al cliente.
- **Evento.** El mapa dice `QuoteAccepted → booking`. `quoting` no escribe ningún evento en el
  outbox; el único relay existente es de `inbox`, corre con `viajapro_webhook`, publica a tiempo real
  y **marca `outbox.publicado_en` en toda fila que lee, sea del tipo que sea**
  (`apps/api/src/modules/inbox/infrastructure/outbox.prisma.ts`). Esa columna no sirve para saber si
  un consumidor de dominio recibió un evento.

**La fuerza es dinero y está nombrada en el dominio:** «`TimeLimitApproaching` es el evento que más
dinero salva del sistema», y ADR-0006 lo declara invariante («existe el *time limit* y se vigila;
una agencia no puede desactivarlo»). Por eso la decisión es de **forma** y de **alcance mínimo**.

## Opciones consideradas

### A — Sin `booking`: estado `RESERVADA` y `time_limit` en la cotización
- **Gana:** una migración pequeña, ningún módulo nuevo.
- **Cuesta:** mezcla dos ciclos de vida (lo ofrecido, inmutable, y la operación, que cambia cada
  día). Un archivo con dos mayoristas no cabe. Contradice el mapa de contextos.
- **Cierra:** `TravelFile` como agregado central; lo que cuelgue de él después obliga a deshacerlo
  con datos de producción.

### B — `booking` mínimo: `TravelFile` + `Booking` por mayorista, creado por el evento de aceptación
- **Gana:** la forma correcta desde el principio, con lo mínimo dentro; los dos plazos del mayorista
  vigilados; lo posterior (documentos, pagos, vouchers) se añade sin migrar lo existente.
- **Cuesta:** un módulo nuevo, cuatro tablas con RLS, un despachador de eventos con registro de
  entrega, dos funciones `SECURITY DEFINER` acotadas y un trabajo programado.
- **Cierra:** nada que no se pueda abrir después.

### C — `booking` completo: pasajeros con documentos, pagos, vouchers, penalidades
- **Gana:** el producto entero.
- **Cuesta:** semanas, PII cifrada (R10, ADR-0015) y `payments` antes de tener una agencia que lo pida.
- **Cierra:** la oportunidad de aprender del piloto antes de modelar lo caro.

## Decisión

**B.** Lo que no está en «entra» **no se construye en esta rebanada**.

### 1. El evento `quoting.cotizacion_aceptada` (v1) y su despachador

**El evento.**

- Lo escribe `quoting` en el outbox **en la misma transacción** que la transición
  `ENVIADA → ACEPTADA` y que la fila de `cotizacion_cambios_estado`.
- `agregado = 'cotizacion'`, `agregadoId = cotizacionId`, `version_evento = 1`.
- Payload, **solo identificadores** (sin datos personales ni importes):
  `{ v: 1, cotizacionId, version, contactoId, oportunidadId | null, aceptadaPorUsuarioId | null, aceptadaEn }`.
  `version` es `cotizaciones.version_enviada`: lo aceptado es **lo que vio el cliente**.

**Registro de entrega por consumidor (`entregas_de_eventos`).** `outbox.publicado_en` conserva su
único significado actual: «el relay de `inbox` lo publicó a tiempo real». La entrega a consumidores
de dominio se registra aparte, una fila por par `(evento, consumidor)`:

| Columna | Tipo | Qué es |
|---|---|---|
| `tenant_id` | `uuid NOT NULL` | Igual al de la fila del outbox (lo garantiza la foránea compuesta) |
| `outbox_id` | `bigint NOT NULL` | El evento |
| `consumidor` | `varchar(80) NOT NULL` | Nombre estable, `CHECK (consumidor ~ '^[a-z]+\.[a-z_]+$')`: `booking.abrir_archivo`, `crm.ganar_oportunidad` |
| `entregado_en` | `timestamptz(3) NULL` | Escrito en la **misma transacción** que el efecto del consumidor |
| `intentos` | `smallint NOT NULL DEFAULT 0` | Fallos acumulados |
| `ultimo_error` | `varchar(200) NULL` | **Solo** la clase o código del error; nunca payload, mensaje libre ni dato personal |
| `abandonado_en` | `timestamptz(3) NULL` | Tras 10 intentos; deja de reintentarse y se registra en el log de errores |
| `creado_en`, `actualizado_en` | `timestamptz(3)` | |

- `PRIMARY KEY (tenant_id, outbox_id, consumidor)`.
- Foránea `(outbox_id, tenant_id) → outbox (id, tenant_id) ON DELETE CASCADE`. Para eso `outbox`
  gana `UNIQUE (id, tenant_id)` (hoy solo tiene `PRIMARY KEY (id)`). El borrado de una fila del
  outbox se lleva sus entregas; no hay `SET NULL` posible porque todas las columnas son `NOT NULL`.
- `CHECK (NOT (entregado_en IS NOT NULL AND abandonado_en IS NOT NULL))`.
- RLS por `aplicar_aislamiento_tenant('entregas_de_eventos')`. No es excepción global.
- Índice `outbox (tenant_id, tipo_evento, id)` para que cada consumidor encuentre lo suyo.

**Cómo entrega el despachador, evento por evento** (en `apps/api/src/shared/eventos/`):

1. El tenant **sale de la columna `outbox.tenant_id`**, nunca del payload.
2. Abre `ContextoTenant.ejecutarCon({ tenantId: fila.tenant_id, usuarioId: null, identidadId: null,
   permisos: ∅, trazaId })` y dentro **una** transacción `prisma.conTenant(tx => …)` con
   `PrismaService` (`viajapro_app`).
3. En esa transacción reclama la entrega:
   `INSERT INTO entregas_de_eventos (…) VALUES (…) ON CONFLICT (tenant_id, outbox_id, consumidor)
   DO UPDATE SET entregado_en = now(), actualizado_en = now() WHERE entregas_de_eventos.entregado_en
   IS NULL AND entregas_de_eventos.abandonado_en IS NULL RETURNING outbox_id`. Sin fila devuelta =
   ya entregado o abandonado: no hace nada. Con fila, ejecuta el consumidor **con el mismo `tx`**.
4. Si el consumidor lanza, la transacción entera revierte (efecto y `entregado_en` juntos). En otra
   transacción corta, también con `conTenant`, suma `intentos` y escribe `ultimo_error`.
5. El fallo de un consumidor no toca la fila del otro: cada par `(evento, consumidor)` es una fila y
   una transacción. **Ahora sí** «el fallo de uno no impide a los otros» es verdad, y es comprobable.
6. Idempotencia doble: la fila de entrega, y además cada consumidor es idempotente por sí mismo
   (regla 5 de frontera; para `booking`, `UNIQUE (tenant_id, cotizacion_id)` en `travel_files`).
7. Varias réplicas de la API pueden correrlo a la vez sin duplicar nada: el reclamo es atómico. El
   candado de T-191 es una optimización, no la garantía.

**Qué tenants tienen eventos pendientes** — sin recorrer las agencias a ciegas y sin vía de
plataforma: la función `tenants_con_eventos_por_entregar` de §5.3, que devuelve **solo** ids de
agencia. Además, cuando `quoting` escribe el evento, avisa en memoria al despachador del mismo
proceso (pista, como `PuertoAvisoDeOutbox`), que despacha ese tenant enseguida; el barrido con la
función es la red.

**En qué proceso vive.** El trabajador **no puede** construir `PrismaService`
(`inbox-worker.module.ts`; ADR-0010), y los consumidores necesitan `viajapro_app`. Por tanto:

| Modo | Dónde corre el despachador, los consumidores y la vigilancia de §3 |
|---|---|
| `unico` (ADR-0019, ADR-0028) | En el contenedor `ApiUnicoModule` (`AppModule`), **no** en `TrabajadorUnicoModule` |
| `escalado` | En el proceso de la API (`main.ts`), **no** en `worker.ts` |

Ningún consumidor de dominio se registra en un módulo que cargue `PrismaWebhookService`.

Consumidores: `crm.ganar_oportunidad` (T-191) y `booking.abrir_archivo` (§3).

### 2. TRM y mayorista congelados en la versión de cotización (`quoting`)

La TRM es un dato **de lo ofrecido** y vive en `versiones_cotizacion`, inmutable. En el código es el
value object `ExchangeRate` (`exchangeRate`); en la base, columnas `trm_*`. Todas nulas o todas
presentes (CHECK):

| Columna | Tipo | Qué es |
|---|---|---|
| `trm_moneda_origen` | `char(3)` | Moneda de las tarifas (p. ej. `USD`) |
| `trm_moneda_destino` | `char(3)` | Moneda en que se le habla al cliente |
| `trm_valor` | `numeric(18,6)` | Unidades de destino por 1 de origen. Decimal exacto, nunca `float` |
| `trm_fecha` | `date` | Día de la tasa |
| `trm_fuente` | enum `OFICIAL` · `AGENCIA` | Certificada por la Superfinanciera, o la propia de la agencia |

Reglas:

- Nulas cuando todas las líneas están en la moneda de la versión y esa es la del tenant: **hoy, todo
  el catálogo del piloto (COP)**.
- Una sola moneda extranjera por versión (error de dominio, coherente con T-189).
- Los importes siguen en la moneda de las tarifas; el equivalente es presentación (como R9).
- **En la cotización la TRM es referencial.** La tasa que se paga se congela en cada abono, y es de
  `payments` (cola, abajo). En el MVP el asesor escribe la tasa; consultarla a un tercero es un
  puerto + adaptador + ADR y no entra.

**Mayorista por línea.** Cada elemento de `lineas` congela también su `mayoristaId` (hoy solo lleva
`tarifaId`, y el mayorista de la tarifa puede cambiar). Es lo que permite al consumidor crear una
reserva por mayorista sin leer el catálogo.

Las dos cosas van en **una** migración de `quoting` que toca el disparador de inmutabilidad. Ya no
espera a la comisión de ADR-0023 (que sigue Propuesto, pendiente del contador): si ADR-0023 se
acepta, su migración vuelve a tocar el disparador. Es un coste menor que atar la Fase 1 a una
decisión fiscal abierta.

### 3. El archivo de viaje (`booking`, módulo nuevo)

`apps/api/src/modules/booking/` con sus cuatro capas. Nombres de código según el lenguaje ubicuo:
`TravelFile` (archivo de viaje, «Reservas» en la interfaz), `Booking` (reserva con un mayorista),
`Passenger` (pasajero dentro del archivo).

#### 3.1 Apertura

El consumidor `booking.abrir_archivo`, dentro del `tx` del despachador:

1. Pide la versión aceptada a `quoting` por un puerto **declarado en `booking`**:
   `PuertoVersionAceptada.leer(tx, tenantId, cotizacionId, version)` en
   `shared/puertos/puertos-hacia-quoting.ts`, con la misma forma que `PuertoExistenciaDePaquete`:
   recibe la **transacción del despachador** (ya con `app.current_tenant` = `outbox.tenant_id`) y el
   `tenantId` **de la fila del outbox** como defensa en profundidad. Nunca abre otra transacción ni
   toma el tenant del payload. Si la cotización no es de ese tenant, RLS no la devuelve, el puerto
   responde `null` y el consumidor lanza un error de dominio tipado (se reintenta y se abandona).
   Devuelve: paquete y destino (nombres), `fechaSalida`, `noches`, conteos y edades por tipo,
   `ventaUnidades`, `netoUnidades | null`, `monedaIso`, la TRM y por línea
   `{ mayoristaId | null, mayoristaNombre | null, netoUnidades | null }`.
2. Crea **un `TravelFile`** con el siguiente número de file de la agencia y **un `Booking` por
   mayorista distinto** (una línea sin mayorista cae en un `Booking` «por definir»). Idempotente por
   `UNIQUE (tenant_id, cotizacion_id)`.

#### 3.2 Esquema, aislamiento y foráneas

Patrón de referencia: `20261115150000_motivos_de_perdida_por_agencia`. Las cuatro tablas
(`travel_files`, `bookings`, `pasajeros`, `entregas_de_eventos`) llevan `tenant_id uuid NOT NULL`
con foránea a `tenants ON DELETE CASCADE`, `SELECT aplicar_aislamiento_tenant('<tabla>')` (RLS
habilitada y **forzada**, política canónica con `USING` y `WITH CHECK`), y `UNIQUE (id, tenant_id)`
las tres primeras. **Ninguna es excepción global**: no entran en `excepciones_rls` y
`aislamiento.spec.ts` las nombra explícitamente en su lista de tablas de negocio esperadas y en la
matriz de privilegios de §5.2.

Toda foránea entre tablas de agencia es **compuesta con `tenant_id`**. `NO ACTION` y no `RESTRICT`
donde la cascada del tenant se lleva las dos filas en la misma sentencia (mismo motivo que en
20261115150000). `SET NULL` solo con columna nombrada: `SET NULL` a secas sobre una clave compuesta
anula también `tenant_id` (20261013230000 §4).

| Tabla | Foránea | Destino | Al borrar |
|---|---|---|---|
| `travel_files` | `(contacto_id, tenant_id)` | `contactos (id, tenant_id)` | `NO ACTION` (contactos se borran en blando) |
| `travel_files` | `(oportunidad_id, contacto_id, tenant_id)` | `oportunidades (id, contacto_id, tenant_id)` — clave que ya existe | `NO ACTION` |
| `travel_files` | `(cotizacion_id, tenant_id)` | `cotizaciones (id, tenant_id)` | `NO ACTION` |
| `travel_files` | `(tenant_id, cotizacion_id, version_cotizacion)` | `versiones_cotizacion (tenant_id, cotizacion_id, numero)` | `NO ACTION` |
| `travel_files` | `(creado_por, tenant_id)`, `(actualizado_por, tenant_id)`, `(cancelado_por, tenant_id)` | `usuarios (id, tenant_id)` | `NO ACTION` |
| `bookings` | `(travel_file_id, tenant_id)` | `travel_files (id, tenant_id)` | `NO ACTION` |
| `bookings` | `(mayorista_id, tenant_id)` | `mayoristas (id, tenant_id)` | `SET NULL ("mayorista_id")` (el nombre queda copiado) |
| `bookings` | `(actualizado_por, tenant_id)` | `usuarios (id, tenant_id)` | `NO ACTION` |
| `pasajeros` | `(travel_file_id, tenant_id)` | `travel_files (id, tenant_id)` | `NO ACTION` |
| `entregas_de_eventos` | `(outbox_id, tenant_id)` | `outbox (id, tenant_id)` (clave nueva) | `CASCADE` |

**La versión de la cotización.** No hace falta clave nueva: `versiones_cotizacion` ya tiene
`UNIQUE (tenant_id, cotizacion_id, numero)` y `UNIQUE (id, tenant_id)`. `travel_files` guarda
`version_cotizacion smallint` y la referencia por la terna, exactamente como
`cotizaciones_version_enviada_fkey`. El tenant forma parte de la clave, así que no puede apuntar a la
versión de otra agencia.

El cinturón de la migración comprueba, como 20261115150000 §6 y 20261013230000 §5: RLS habilitada y
forzada en las cuatro, ninguna en `excepciones_rls`, `tablas_sin_aislamiento` vacío, toda foránea de
estas tablas incluye `tenant_id`, y la matriz de privilegios de §5.2.

#### 3.3 `travel_files`

- `numero integer NOT NULL`, `UNIQUE (tenant_id, numero)`: el **número de file legible** («file
  1043»), consecutivo por agencia. Se asigna como `max(numero) + 1` del tenant dentro de la
  transacción de apertura; una carrera choca con el `UNIQUE`, la transacción revierte y el
  despachador reintenta. Sin tabla de contadores.
- `contacto_id`, `oportunidad_id | null`, `cotizacion_id`, `version_cotizacion` (referencias, regla
  2 de frontera).
- **Copia** de lo vendido: nombre del paquete, destino, `fecha_salida` (`date`), noches, `adultos`,
  `ninos`, `infantes`, `venta_unidades`, `moneda_iso`, las cinco columnas `trm_*`. Copia de una
  instantánea inmutable: no diverge.
- `estado`: **`ABIERTO` | `CANCELADO`**. Es el único eje que alguien fija con un botón.
  `CANCELADO` exige `motivo_cancelacion` (enum `CLIENTE_DESISTIO`, `SIN_DISPONIBILIDAD`,
  `CAMBIO_DE_FECHA`, `OTRO`), `cancelado_en`, `cancelado_por`, y `nota_cancelacion varchar(500)`
  obligatoria si el motivo es `OTRO` (CHECK). Sin penalidad en el MVP.
- **El avance no se guarda: lo deriva el dominio** de sus reservas vivas (las que no están `CAIDA`
  ni `CANCELADA`), y lo devuelve la API:
  - `POR_CONFIRMAR` — alguna viva en `PENDIENTE`, `SOLICITADA` o `EN_ESPERA`;
  - `CONFIRMADO` — todas las vivas **confirmadas por el mayorista** o más allá;
  - `PAGADO_A_PROVEEDORES` — todas las vivas `PAGADA_AL_PROVEEDOR`;
  - `SIN_RESERVAS_VIVAS` — se cayeron o cancelaron todas; el archivo sigue `ABIERTO` y la pantalla
    lo marca en rojo hasta que el asesor pida otro cupo o cancele el archivo.

  Así «confirmado» significa lo mismo que en la agencia: el mayorista confirmó. Pagar es otra cosa y
  tiene otro nombre.
- Auditoría estándar (`creado_por`, `actualizado_por`, fechas UTC).

#### 3.4 `bookings`

- `travel_file_id`, `mayorista_id | null` y `mayorista_nombre` copiado, `neto_unidades | null`,
  `moneda_iso`.
- `localizador` (`recordLocator`) `varchar(64) | null`.
- Fechas de cada paso, todas `timestamptz` UTC (R9): `solicitada_en`, `confirmada_en`,
  `abonada_en`, `pagada_en`.
- **Los dos plazos del mayorista**, `timestamptz` UTC:
  - `time_limit` (`timeLimit`) — hasta cuándo sostiene la reserva sin abono;
  - `pago_total_vence_en` (`finalPaymentDue`) — hasta cuándo hay que pagarle el total.
- `motivo_caida` (enum `TIME_LIMIT_VENCIDO`, `PAGO_TOTAL_VENCIDO`, `SIN_CUPO`, `NEGADA_EN_ESPERA`,
  `OTRO`) y `nota` `varchar(500) | null`.
- Marcas de aviso (§3.6): `aviso_time_limit_proximo_en`, `aviso_time_limit_vencido_en`,
  `aviso_pago_total_proximo_en`, `aviso_pago_total_vencido_en`.

**Estados** (`BookingStatus`; enum de base `estado_reserva`):

```
PENDIENTE → SOLICITADA → [EN_ESPERA] → CONFIRMADA → ABONADA_AL_PROVEEDOR → PAGADA_AL_PROVEEDOR
CANCELADA: desde PENDIENTE … ABONADA_AL_PROVEEDOR
CAIDA:     desde SOLICITADA … ABONADA_AL_PROVEEDOR
```

| Estado | Qué significa para la agencia | Exige (CHECK en la base) |
|---|---|---|
| `PENDIENTE` | Aún no se ha pedido el cupo | — |
| `SOLICITADA` | Se pidió el cupo al mayorista | `solicitada_en` |
| `EN_ESPERA` | Opcional: el mayorista lo tiene «en solicitud» (típico de hotel) | `solicitada_en` |
| `CONFIRMADA` | **El mayorista confirmó** | `solicitada_en`, `confirmada_en`, `time_limit` |
| `ABONADA_AL_PROVEEDOR` | La agencia abonó; queda el saldo | lo anterior + `abonada_en`, `pago_total_vence_en` |
| `PAGADA_AL_PROVEEDOR` | Pagado el total al mayorista | lo anterior + `pagada_en` |
| `CAIDA` | El mayorista no la sostuvo: venció un plazo, no hubo cupo o negó la espera | `motivo_caida` |
| `CANCELADA` | La agencia o el cliente desistió | — |

- `CANCELADA` es alcanzable desde `PENDIENTE` … `ABONADA_AL_PROVEEDOR`; `CAIDA` desde `SOLICITADA` …
  `ABONADA_AL_PROVEEDOR` (lo que no se pidió no se puede caer). Ninguna de las dos después del pago
  total: eso es penalidad, y está fuera.
- Se evita `LIBERADA` a propósito: «liberar» es lo que hace el mayorista con su **cupo** (`release`);
  la reserva no se libera, **se cae**.
- `VOUCHER_RECIBIDO` es mejora posterior (`ALTER TYPE … ADD VALUE`, barato); no entra.
- La máquina de transiciones vive en el dominio (`Booking`), con errores de dominio tipados; los
  CHECK de la tabla son la red: una reserva confirmada sin *time limit* **no puede existir**, y
  una abonada sin fecha de pago total tampoco. Eso convierte «se vigila» en algo que no depende de
  que alguien se acuerde.
- Reglas de dominio: `time_limit ≤ pago_total_vence_en` cuando existen los dos, y ninguno posterior
  a la `fecha_salida` (comparada en la zona del tenant). Cambiar un plazo borra su par de marcas de
  aviso en la misma escritura.
- `ABONADA_AL_PROVEEDOR` y `PAGADA_AL_PROVEEDOR` los marca el asesor a mano en el MVP; cuando exista
  `payments`, los fijará el registro del pago al proveedor.

**Lo que sugiere la interfaz.** Al confirmar, sugiere el *time limit* como «ahora + `diasTimeLimit`
días, a las 18:00 en la zona del tenant» si el mayorista lo tiene; si no, el campo va vacío y es
obligatorio. El sugerido nunca se guarda sin que el asesor lo confirme: el plazo real es el que dice
el mayorista.

#### 3.5 `pasajeros` (mínimo, sin PII sensible)

- `nombre varchar(200) NOT NULL`, `tipo` enum `ADT` · `CHD` · `INF`, `edad_al_viaje smallint | null`
  (`CHECK 0..120`; obligatoria para `CHD` e `INF` por CHECK), `es_titular boolean`, `orden smallint`.
- **Titular** (`leadPassenger`): a nombre de quien va la reserva ante el mayorista. Exactamente uno
  por archivo cuando hay pasajeros: índice único parcial `(tenant_id, travel_file_id) WHERE
  es_titular`.
- Sin rangos de edad por tipo en la base: la edad de corte es política del mayorista (R12). El
  dominio avisa si los pasajeros no cuadran con los conteos de la versión; no lo impide.
- **Nombre y edad no son PII sensible según R10**, pero son datos personales (Ley 1581): no viajan
  al outbox, a `registros_auditoria.detalle` ni a los logs.
- Documento, fecha de nacimiento y el vínculo con `Traveler` quedan para un ADR posterior, con el
  cifrado de ADR-0015.

#### 3.6 Vigilancia de los dos plazos

Un trabajo programado en `apps/api`, en el proceso de la tabla de §1:

1. Llama `SELECT tenant_id, booking_id FROM public.reservas_con_plazo_por_avisar()` (§5.3) con
   `$queryRaw`, **fuera** de cualquier transacción de tenant, como `medir_cola_de_salida`. Recibe
   solo pares de ids.
2. Agrupa por `tenant_id` y, por cada uno, `ContextoTenant.ejecutarCon(contexto de sistema del
   tenant)` + `prisma.conTenant(tx => …)`. Dentro, **relee cada reserva bajo RLS** con
   `FOR UPDATE SKIP LOCKED` y reevalúa la condición: la lista de la función es una pista, no una
   autoridad.
3. Para cada `CONFIRMADA` con `time_limit` en las próximas **24 h** escribe una vez
   `booking.time_limit_proximo`; con `time_limit` pasado, `booking.time_limit_vencido`. Para cada
   `ABONADA_AL_PROVEEDOR`, lo mismo con `pago_total_vence_en`: `booking.pago_total_proximo` y
   `booking.pago_total_vencido`. «Una vez» = la marca `aviso_*` correspondiente, escrita con
   `WHERE aviso_… IS NULL` en la misma transacción que el evento. Payload: solo ids y el instante del
   plazo.
4. **Prohibido** usar `sinTenantPorqueEsPlataforma`, `sinTenantDeclarado` o cualquier vía «de
   plataforma» para leer o escribir `bookings`, `travel_files` u `outbox`; no se declara ninguna
   operación nueva en `operaciones-de-plataforma.ts`. Una prueba lo fija (grep del módulo `booking`
   y de `shared/eventos`).
5. **Nunca cambia el estado solo.** Que la reserva se cayó lo sabe el mayorista; el asesor la marca
   `CAIDA`. El sistema solo grita.
6. El umbral de 24 h es constante. Hacerlo política de la agencia (R12) requiere las dos agencias que
   pide ADR-0006.

#### 3.7 Lo que ve el asesor, permisos y rutas

**Pantalla «Reservas».** Archivos abiertos con su número de file, su avance y sus reservas,
ordenadas por el plazo vigente más próximo (*time limit* si está `CONFIRMADA`, pago total si está
`ABONADA_AL_PROVEEDOR`) y un semáforo (vencido / menos de 24 h / resto). Esa lista **es** la
vigilancia visible del MVP; los eventos son para el aviso activo que llegará con `notifications`.

**Permisos.** `archivo.ver` y `archivo.operar` (migración del `CHECK roles_permisos_del_catalogo`),
sembrados en `DUENO`, `ASESOR` y `OPERACIONES`. Neto y margen siguen exigiendo
`cotizacion.ver_neto_y_margen`.

**Rutas** (contratos en `packages/contracts/src/archivos.ts`):

- `GET  /api/v1/archivos` — lista con avance y semáforo (`archivo.ver`).
- `GET  /api/v1/archivos/:id` — detalle con reservas y pasajeros (`archivo.ver`).
- `PUT  /api/v1/archivos/:id/reservas/:reservaId` — fija estado y datos del paso (localizador,
  plazos, motivo de caída) (`archivo.operar`). `PUT` porque fija el valor completo: repetirlo no
  cambia nada; una transición inválida es un error de dominio.
- `PUT  /api/v1/archivos/:id/pasajeros` — reemplaza la lista completa (`archivo.operar`).
- `POST /api/v1/archivos/:id/cancelacion` — con `motivo` y `nota` (`archivo.operar`).

### 4. Alcance

**Entra en el MVP:** evento de aceptación con registro de entrega por consumidor; TRM y mayorista
congelados en la versión; `travel_files`, `bookings`, `pasajeros` (mínimo) y `entregas_de_eventos`
con RLS; apertura automática idempotente con número de file; estados de reserva de §3.4; avance
derivado del archivo; cancelación con motivo; vigilancia de los dos plazos con eventos; la pantalla
«Reservas»; dos permisos.

**Queda fuera, explícitamente:**

| Fuera | Por qué | Cuándo |
|---|---|---|
| Documento y fecha de nacimiento del pasajero; vínculo con `Traveler` | PII sensible (R10, ADR-0015) | ADR propio, con el cifrado de ADR-0015 |
| Pagos del cliente, anticipos, cuotas, conciliación | Contexto `payments` | Fase de `payments` |
| Cuenta por pagar al proveedor y comisión por cobrar | `payments` (ADR-0023) | Idem |
| Consulta automática de la TRM oficial | Tercero = puerto + adaptador + ADR | Cuando el piloto venda en USD |
| Avisos activos (correo, WhatsApp) | Contexto `notifications` | Primer consumidor de `booking.time_limit_proximo` |
| Vouchers (`VOUCHER_RECIBIDO`), penalidades, cambios de fecha | Operación avanzada | Fase 3 |
| Reservar contra el sistema del mayorista | Ningún mayorista del segmento tiene API | Nunca, salvo evidencia |
| Abrir un archivo sin cotización (venta directa) | Un camino de alta más | Cuando aparezca el caso |

### 5. Seguridad entre agencias

#### 5.1 Qué rol toca qué

Solo `viajapro_app` lee y escribe las tablas de este ADR. `viajapro_webhook` (trabajador, relay),
`viajapro_altas` e `viajapro_identidad` no tienen **ningún** privilegio sobre ellas.

#### 5.2 `privilegios_declarados`: la declaración que lo hace cumplir

Hoy `aplicar_privilegios_declarados()` concede `SELECT, INSERT, UPDATE, DELETE` sobre **todas** las
tablas a los tres roles de login, y la única revocación declarativa es `excepciones_rls`, que es para
tablas **fuera** de RLS (meter ahí una tabla de negocio la sacaría de `tablas_sin_aislamiento`). Un
`REVOKE` suelto en la migración duraría hasta la siguiente llamada a la función, sin avisar.

Se añade, por tanto, una declaración de datos hermana de `excepciones_rls`:

- Tabla global **`privilegios_declarados (tabla text, rol text, privilegios text[])`**, `PRIMARY
  KEY (tabla, rol)`: tablas **con** RLS cuyos privilegios son más estrechos que la concesión
  general. Ella misma se declara en `excepciones_rls` sin privilegio para ningún rol de login (como
  la propia `excepciones_rls`), y por eso se edita el literal de `aislamiento.spec.ts` (R1).
- `aplicar_privilegios_declarados()`, tras la concesión general (§5.1 de la función) y la
  revocación de `excepciones_rls` (§5.2), hace un tercer paso con el mismo bucle y las mismas
  salvaguardas (validación de `privilegios` contra la lista válida, `SET LOCAL ROLE` al dueño,
  descenso por particiones): por cada tabla de `privilegios_declarados` × cada rol de
  `roles_de_login_vigilados`, `REVOKE ALL` y `GRANT` de lo declarado. **Un par sin declarar se
  revoca entero.** Lanza si una tabla está a la vez en `excepciones_rls` y en
  `privilegios_declarados`, o si una tabla de `privilegios_declarados` no tiene RLS forzada.
- Filas de este ADR (ningún `DELETE`: un archivo o una reserva no se borran, se cancelan; la cascada
  del tenant corre como dueño de la tabla):

| `tabla` | `rol` | `privilegios` |
|---|---|---|
| `travel_files` | `viajapro_app` | `{SELECT,INSERT,UPDATE}` |
| `bookings` | `viajapro_app` | `{SELECT,INSERT,UPDATE}` |
| `pasajeros` | `viajapro_app` | `{SELECT,INSERT,UPDATE,DELETE}` |
| `entregas_de_eventos` | `viajapro_app` | `{SELECT,INSERT,UPDATE}` |

- La guardia de arranque del trabajador (`guardia-de-rol.ts`) añade: `viajapro_webhook` no tiene
  privilegio alguno sobre esas cuatro tablas; si lo tiene, el proceso aborta.
- **Esto amplía ADR-0008 §1.3**: los tres roles de login siguen distinguiéndose en qué funciones
  ejecutan, y **además**, por excepción declarada como dato, en qué tablas tocan. Es la misma
  propiedad que defiende ADR-0008 (el rol de conexión es lo único que una inyección no falsea), con
  menos superficie.

#### 5.3 Dos funciones `SECURITY DEFINER` acotadas y su dueño

Patrón de ADR-0026 (`medir_cola_de_salida`): dueño `NOLOGIN` con privilegios **por columna**, que
recorre las agencias fijando `app.current_tenant` con `set_config(…, true)` y devuelve solo ids.

- **Rol nuevo `viajapro_planificador`**: `NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT`; `USAGE` sobre `public`; `SELECT` solo de columnas: `tenants (id, estado)`,
  `outbox (id, tenant_id, tipo_evento, ocurrido_en)`, `entregas_de_eventos (tenant_id, outbox_id,
  consumidor, entregado_en, abandonado_en)`, `bookings (id, tenant_id, estado, time_limit,
  pago_total_vence_en, aviso_time_limit_proximo_en, aviso_time_limit_vencido_en,
  aviso_pago_total_proximo_en, aviso_pago_total_vencido_en)`. Ningún privilegio de tabla, ninguna
  escritura. `CREATE` prestado y retirado en la misma migración. Ningún rol de login de aplicación
  es miembro; el de migraciones, con `SET TRUE, INHERIT FALSE`. No se reutiliza `viajapro_metricas`:
  su salida es agregada y la de estas es por fila (ADR-0026, «Cuándo revisar»).
- **`tenants_con_eventos_por_entregar(p_consumidor text, p_tipo_evento text) RETURNS SETOF uuid`**:
  agencias `ACTIVO`/`EN_PRUEBA` con alguna fila de outbox de ese tipo en los últimos 7 días sin
  entrega hecha ni abandonada para ese consumidor. Valida el formato de los dos argumentos (lanza si
  no casan), sin SQL dinámico, `LIMIT 500`.
- **`reservas_con_plazo_por_avisar() RETURNS TABLE (tenant_id uuid, booking_id uuid)`**: reservas
  `CONFIRMADA` o `ABONADA_AL_PROVEEDOR` cuyo plazo vigente cae en las próximas 24 h o ya pasó, con
  la marca correspondiente nula. Sin argumentos (el umbral es constante), `LIMIT 1000`.
- Las dos: `LANGUAGE plpgsql`, `VOLATILE`, `SET search_path = ''`, todo cualificado; guardan y
  restauran el `app.current_tenant` del llamador; creadas bajo `SET ROLE viajapro_planificador`;
  `EXECUTE` revocado a `PUBLIC` y concedido **solo a `viajapro_app`**. Entran en el inventario de
  ADR-0008/ADR-0010 y en las aserciones 12, 13, 14 y 20 de `aislamiento.spec.ts` (matriz de
  `EXECUTE` y dueño esperado). Todo cambio de cuerpo pasa por `auditor-seguridad`.
- **Ni ids de otra cosa, ni datos**: la forma de la salida es la frontera. Todo lo demás se lee
  después, por agencia, bajo RLS (§1 y §3.6).

### 6. Fases de implementación

Cada fase es un PR pequeño; las que tocan rutas protegidas esperan al propietario (R11) y las
marcadas pasan por `auditor-seguridad`.

| Fase | Contenido | Revisión |
|---|---|---|
| **F1** — Migración y RLS | `travel_files`, `bookings`, `pasajeros`, `entregas_de_eventos`; `UNIQUE (id, tenant_id)` e índice en `outbox`; `privilegios_declarados` y el tercer paso de `aplicar_privilegios_declarados()`; permisos `archivo.*`; cinturón; `aislamiento.spec.ts` y guardia de arranque. Sin código de aplicación | `datos` + `auditor-seguridad` |
| **F2** — Evento, despachador y apertura | Migración de `quoting` (TRM y `mayoristaId` por línea en la versión); evento en `ENVIADA → ACEPTADA`; despachador con `entregas_de_eventos` y `tenants_con_eventos_por_entregar` (rol `viajapro_planificador`); `PuertoVersionAceptada`; consumidor `booking.abrir_archivo` con número de file. Coordina con T-191 (`crm.ganar_oportunidad` usa el mismo despachador) | `backend` + `auditor-seguridad` (función) |
| **F3** — API y estados | Dominio `Booking` (máquina de estados, plazos), avance derivado del archivo, pasajeros, cancelación con motivo; contratos en `packages/contracts/src/archivos.ts`; las cinco rutas | `backend` |
| **F4** — Pantalla «Reservas» | Lista con semáforo y avance, detalle, formularios de cada paso con el *time limit* sugerido | `frontend` |
| **F5** — Vigilancia de plazos | `reservas_con_plazo_por_avisar` y el trabajo de §3.6 con los cuatro eventos | `backend` + `auditor-seguridad` (función) |

F1 no depende de nada; F2 de F1; F3 de F1 (puede probarse con archivos sembrados antes de F2); F4 de
F3; F5 de F1 y F3.

## Cola (no bloquea)

Va a `roadmap/tasks.yaml` con su dueño.

| Hallazgo | Dueño |
|---|---|
| El contrato de `GET /archivos` y `GET /archivos/:id` **omite** neto y margen (no los manda en nulo) cuando falta `cotizacion.ver_neto_y_margen` | `backend` |
| El `PUT` de reserva filtra por `id AND travel_file_id` (además de RLS), para que una reserva no se opere desde la URL de otro archivo de la misma agencia | `backend` |
| Avisos por WhatsApp de plazos: plantilla de categoría *utility*, opt-in del destinatario, por cola (R5), idempotencia por `(booking_id, tipo_de_aviso)` | `whatsapp` + `backend` |
| `CHECK (trm_valor > 0)` y moneda destino = moneda del tenant | `datos` |
| TRM: la de la cotización es referencial; la tasa se congela **en cada abono**, con `trm_fuente` ampliada con `MAYORISTA`. Para el piloto (todo en COP) no corre prisa | `arquitecto` (con `payments`) |
| Registro manual del abono al mayorista con importe y soporte (comprobante adjunto) | `analista-producto` |
| Aceptación del contrato de servicios y de la cláusula ESCNNA ligada al archivo | `analista-producto` + `experto-turismo` |
| Vouchers (`VOUCHER_RECIBIDO`) y penalidades por cancelación tras el pago | `analista-producto` |
| El relay de `inbox` publica a tiempo real toda fila del outbox, también las de `quoting` y `booking` (solo ids, misma agencia): filtrar por prefijo `inbox.` | `backend` |
| Motivos de cancelación del archivo como tabla por agencia (R12, como T-214) si el piloto pide los suyos | `datos` |
| Número de file inicial configurable (la agencia que ya va por el 1043) | `analista-producto` |

## Consecuencias

### Positivas
- Los dos plazos del mayorista dejan de depender de la memoria del asesor.
- «Confirmado» significa lo que significa en la agencia; «pagado» tiene su propio nombre.
- `TravelFile` nace con su forma definitiva; documentos y pagos se añaden sin migrar lo que hay.
- El outbox gana un registro de entrega por consumidor que sirve para todo consumidor futuro.
- Las tablas del archivo quedan fuera del alcance del rol que más código ejecuta
  (`viajapro_webhook`), por declaración y no por disciplina.

### Negativas
- Cuatro tablas nuevas con RLS, un rol `NOLOGIN` y dos funciones `SECURITY DEFINER` más: superficie
  de aislamiento que `auditor-seguridad` revisa en F1, F2 y F5.
- `aplicar_privilegios_declarados()` gana un paso: la función que gobierna todos los privilegios es
  un poco más compleja.
- Depende de T-191 y del despachador: si F2 se retrasa, no se abren archivos (F3 y F4 pueden avanzar
  con datos sembrados).
- Copia de la versión en el archivo: si un día la versión admitiera correcciones (hoy imposible), el
  archivo no las vería.
- Los pasajeros mínimos no sirven aún para emitir vouchers con documento.
- Tocar `versiones_cotizacion` es tocar una tabla inmutable con disparador propio, y ADR-0023 lo
  volverá a tocar.

### Qué habría que cambiar para revertir esto
- Antes de datos reales: borrar el módulo, sus cuatro tablas, las filas de `privilegios_declarados`,
  las dos funciones y el rol; las columnas de TRM y `mayoristaId` en la versión pueden quedarse
  nulas. Con datos reales, un archivo de viaje no se borra: se supersede este ADR.

## Cuándo revisar esta decisión

- Cuando el piloto venda su primer paquete en USD: validar la fuente y el momento de la TRM.
- Cuando el piloto pida documento o fecha de nacimiento del pasajero: ADR de PII del pasajero.
- Si una agencia necesita un umbral distinto de 24 h, y aparece una segunda que lo pida igual.
- Si los archivos con más de un mayorista resultan raros: simplificar a una reserva por archivo no
  exige migración, solo dejar de crear la segunda.
- Si una tercera tabla necesita `privilegios_declarados`: confirmar que la declaración sigue siendo
  la excepción y no la norma.

## Historial de revisión

**2026-11-17 — Revisión en sitio (estado Propuesto → Aceptado).** Dos revisiones encontraron
bloqueantes; todos se resuelven aquí.

- **Dominio (`experto-turismo`).** B1: el estado `RESERVADA` mezclaba «pedí el cupo» con «el
  mayorista confirmó»; se sustituye por `PENDIENTE → SOLICITADA → [EN_ESPERA] → CONFIRMADA →
  ABONADA_AL_PROVEEDOR → PAGADA_AL_PROVEEDOR`, con CHECK por paso (el *time limit* se exige al
  confirmar, la fecha de pago total al abonar), y `LIBERADA` pasa a `CAIDA` con motivo para no
  chocar con el `release` de cupo. B2: el archivo ya no llama `CONFIRMADO` a «todo pagado»; su
  `estado` guardado es solo `ABIERTO`/`CANCELADO` y el avance (`POR_CONFIRMAR`, `CONFIRMADO`,
  `PAGADO_A_PROVEEDORES`, `SIN_RESERVAS_VIVAS`) lo deriva el dominio. Además: se vigilan los dos
  plazos del mayorista, el archivo tiene motivo de cancelación y número de file legible, y entran
  pasajeros mínimos (nombre, tipo, edad al viaje, titular) sin PII sensible.
- **Seguridad (`auditor-seguridad`).** S1: §3.2 fija `tenant_id NOT NULL`, RLS forzada, `UNIQUE (id,
  tenant_id)` y todas las foráneas compuestas, con `SET NULL ("mayorista_id")`; la versión se
  referencia por la clave `(tenant_id, cotizacion_id, numero)` que ya existe, sin clave nueva. S2:
  la vigilancia y el despachador encuentran sus agencias con dos funciones `SECURITY DEFINER`
  acotadas de un dueño `NOLOGIN` nuevo (`viajapro_planificador`) y operan por agencia con
  `ejecutarCon` + `conTenant`; la vía de plataforma queda prohibida. S3: el despachador vive en el
  contenedor de la API en los dos modos, nunca en el trabajador; las tablas nuevas se conceden solo
  a `viajapro_app` mediante `privilegios_declarados`, lo que amplía ADR-0008 §1.3. S4: la entrega se
  registra por consumidor en `entregas_de_eventos` con RLS, en la misma transacción que el efecto, y
  el tenant del puerto `PuertoVersionAceptada` sale de la fila del outbox y viaja en esa transacción.
- **Otros cambios.** La migración de TRM y mayorista por línea ya no espera a ADR-0023, que sigue
  Propuesto. Se añaden las fases F1–F5 y la sección «Cola (no bloquea)» con dueño.
- **Por qué Aceptado.** Ningún bloqueante necesita decisión del propietario; la ampliación de
  ADR-0008 es la que pidió la propia auditoría. Queda la revisión de `auditor-seguridad` de las
  migraciones de F1, F2 y F5, como toda función `SECURITY DEFINER`.

---

> Este ADR ya está aceptado: no se edita. Si cambia, se escribe uno nuevo que lo supersede.
