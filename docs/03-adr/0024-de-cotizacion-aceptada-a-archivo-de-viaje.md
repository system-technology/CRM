# ADR-0024 — De cotización aceptada a archivo de viaje: reserva, *time limit* y TRM congelada (MVP de `booking`)

- **Estado:** Propuesto
- **Fecha:** 2026-11-15
- **Decide:** propietario, a propuesta de `arquitecto`
- **Consultados:** `arquitecto`. Pendientes: `experto-turismo` (modelo de negocio),
  `auditor-seguridad` (tablas nuevas de tenant y consumidor de eventos), `dueno-de-producto` (alcance)
- **Tarea:** T-213 (hallazgo A17). Depende de T-191 (evento de aceptación) y se coordina con
  [ADR-0023](0023-comision-del-proveedor-como-ingreso-propio.md) (la versión congela la comisión)

---

## Contexto

Hoy el recorrido comercial termina en `ACEPTADA`. Después no hay nada: el asesor reserva con el
mayorista por WhatsApp o por correo, anota el *time limit* en una libreta o en su cabeza, y si se le
pasa, **el mayorista libera el cupo y la venta se cae**. El contexto `booking` está en el mapa
(`TravelFile`, `Booking`, `TimeLimit`, `TimeLimitApproaching`) pero no existe un solo archivo de
código ni una tabla. `Mayorista.diasTimeLimit` está en el esquema desde el catálogo y **nadie lo
lee**.

Dos huecos más, del mismo hallazgo:

- **TRM.** El lenguaje ubicuo define «TRM aplicada: tasa de cambio congelada en la cotización, con su
  fecha». `versiones_cotizacion` tiene **una sola** `moneda_iso` y ninguna tasa. Un paquete a Punta
  Cana tarifado en USD y conversado en pesos no tiene dónde guardar a qué tasa se le habló al
  cliente, y eso es lo primero que se discute cuando la TRM sube entre la cotización y el pago.
- **Evento.** El mapa dice `QuoteAccepted → booking`. El código de `quoting` no escribe ningún
  evento en el outbox; el único relay existente es de `inbox` y publica a tiempo real, no a
  consumidores de dominio. T-191 ya pide ese evento hacia `crm`.

**La fuerza es dinero y está nombrada en el propio dominio:** «`TimeLimitApproaching` es el evento
que más dinero salva del sistema» y ADR-0006 lo declara invariante («existe el *time limit* y se
vigila; una agencia no puede desactivarlo»). Pero **no hay agencia real todavía** y la tarea es P2 de
fase 2. Por eso la decisión es de **forma** y de **alcance mínimo**, no un archivo de viaje completo.

## Opciones consideradas

### A — Sin `booking`: estado `RESERVADA` y `time_limit` en la cotización
- **Gana:** una migración pequeña, ningún módulo nuevo.
- **Cuesta:** mezcla dos ciclos de vida (lo ofrecido, que es inmutable, y la operación, que cambia
  cada día). Un archivo con dos mayoristas no cabe. Contradice el mapa de contextos.
- **Cierra:** `TravelFile` como agregado central; cualquier cosa que cuelgue de él después
  (pasajeros, pagos, vouchers) obliga a deshacerlo con datos de producción.

### B — `booking` mínimo: `TravelFile` + `Booking` por mayorista, creado por el evento de aceptación
- **Gana:** la forma correcta desde el principio, con lo mínimo dentro; el *time limit* vigilado;
  cada pieza posterior (pasajeros, pagos) se añade sin migrar lo existente.
- **Cuesta:** un módulo nuevo, dos tablas con RLS, un consumidor de eventos y un trabajo programado.
- **Cierra:** nada que no se pueda abrir después.

### C — `booking` completo: archivo, pasajeros con documentos, pagos, vouchers, penalidades
- **Gana:** el producto entero.
- **Cuesta:** semanas, PII cifrada (R10, ADR-0015) y `payments` antes de tener una agencia que lo
  pida.
- **Cierra:** la oportunidad de aprender del piloto antes de modelar lo caro.

## Decisión

**B.** Un `booking` mínimo con la forma definitiva. Lo que entra y lo que no está escrito abajo, y
lo que no está en «entra» **no se construye en esta rebanada**.

### 1. El evento `quoting.cotizacion_aceptada` (v1)

- Lo escribe `quoting` en el outbox **en la misma transacción** que la transición
  `ENVIADA → ACEPTADA` y que la fila de `cotizacion_cambios_estado`.
- `agregado = 'cotizacion'`, `agregadoId = cotizacionId`.
- Payload, **solo identificadores** (el outbox no lleva datos personales ni importes):
  `{ v: 1, cotizacionId, version, contactoId, oportunidadId | null, aceptadaPorUsuarioId | null, aceptadaEn }`.
  `version` es `cotizaciones.version_enviada`: lo aceptado es **lo que vio el cliente**.
- Lo construye T-191, que además necesita **un despachador de eventos de dominio** en `shared/`
  (hoy el relay es de `inbox` y solo publica a tiempo real). Requisitos del despachador, que este
  ADR fija y T-191 implementa:
  - El tenant sale de la **fila** del outbox, nunca del payload.
  - Cada consumidor corre en su propia transacción con `viajapro_app` y `conTenant` (como
    `MiembrosPrisma.agregar`), no con el rol del relay.
  - Cada consumidor es idempotente por sí mismo (regla 5 de frontera). El fallo de uno no impide
    a los otros.

Consumidores: `crm` (mueve la oportunidad a ganada, T-191) y `booking` (abre el archivo, §3).

### 2. TRM congelada en la versión de cotización (`quoting`)

La TRM es un dato **de lo ofrecido**, así que vive en `versiones_cotizacion`, inmutable, y no en
`booking`. Columnas nuevas, todas nulas o todas presentes (CHECK):

| Columna | Tipo | Qué es |
|---|---|---|
| `trm_moneda_origen` | `char(3)` | Moneda de las tarifas (p. ej. `USD`) |
| `trm_moneda_destino` | `char(3)` | Moneda en que se le habla al cliente (la del tenant, p. ej. `COP`) |
| `trm_valor` | `numeric(18,6)` | Unidades de destino por 1 de origen. **Decimal exacto, nunca `float`** (R8 aplica al dinero; una tasa no es dinero, pero tampoco se aproxima) |
| `trm_fecha` | `date` | Día de la tasa |
| `trm_fuente` | enum `OFICIAL` · `AGENCIA` | La certificada por la Superfinanciera, o la que fija la agencia (muchas usan una propia, más alta) |

Reglas:

- Nulas cuando todas las líneas están en la moneda de la versión y esa es la del tenant (el caso de
  los pasadías y excursiones nacionales: hoy, todo el catálogo sembrado).
- **Una sola moneda extranjera por versión.** Mezclar USD y EUR en una versión se rechaza con error
  de dominio, coherente con T-189.
- Los importes de la versión siguen en la moneda de las tarifas (`moneda_iso`); el equivalente en la
  moneda del tenant es **presentación** calculada con la TRM congelada, igual que la zona horaria
  (R9). No se guardan dos juegos de importes.
- **Qué TRM se cobra al pagar** (la congelada o la del día de pago) es política de cada agencia
  (R12) y es de `payments`. Fuera de esta rebanada; la versión solo garantiza que el dato existe.
- La fuente de la tasa oficial (consultarla a un tercero) es un adaptador detrás de un puerto (CLAUDE
  §10) y **no entra**: en el MVP el asesor la escribe y el sistema la congela.

Esta migración se hace junto con la de ADR-0023 (comisión por línea) para tocar el disparador de
inmutabilidad de `versiones_cotizacion` **una sola vez**. En la misma migración, cada línea de
`lineas` congela también su `mayoristaId` (hoy solo lleva `tarifaId`; el mayorista de la tarifa
puede cambiar después).

### 3. El archivo de viaje (`booking`, módulo nuevo)

`apps/api/src/modules/booking/` con sus cuatro capas. Nombres de código según el lenguaje ubicuo:
`TravelFile` (archivo de viaje, «Reservas» en la interfaz) y `Booking` (reserva con un proveedor).

**Apertura.** El consumidor de `quoting.cotizacion_aceptada`:

1. Pide a `quoting` la versión aceptada por un puerto **declarado en `booking`**
   (`PuertoVersionAceptada`, en `shared/puertos/puertos-hacia-quoting.ts`, como los existentes). La
   versión es inmutable, así que leerla después del evento no tiene carrera. Devuelve: paquete y
   destino (nombres), `fechaSalida`, `noches`, pasajeros por tipo (conteos, sin nombres),
   `ventaUnidades`, `netoUnidades | null`, `monedaIso`, la TRM congelada, y por línea
   `{ mayoristaId | null, mayoristaNombre | null, netoUnidades | null }`.
2. Crea **un `TravelFile`** y **un `Booking` por mayorista distinto** de las líneas (una línea sin
   mayorista cae en un `Booking` «por definir»). Idempotente por `UNIQUE (tenant_id, cotizacion_id)`
   en el archivo: un evento repetido no crea nada.

**`travel_files`** (con `tenant_id`, RLS y foráneas compuestas con el tenant, como todo el esquema):

- `contacto_id`, `oportunidad_id | null`, `cotizacion_id`, `version_cotizacion` (copias de
  referencia, regla 2 de frontera);
- **copia** de lo vendido que `booking` necesita para operar sin leer a `quoting`: nombre del
  paquete, destino, `fecha_salida` (`date`), noches, conteo de pasajeros, `venta_unidades`,
  `moneda_iso`, TRM (las cinco columnas). Es una copia de una instantánea inmutable: no diverge;
- `estado`: `ABIERTO` → `CONFIRMADO` | `CANCELADO`. `CONFIRMADO` cuando **todas** sus reservas están
  `PAGADA_AL_PROVEEDOR` o `CANCELADA`, con al menos una pagada; lo decide el dominio, no un botón. `CANCELADO` es
  manual y no tiene penalidad en el MVP;
- auditoría estándar (`creado_por`, `actualizado_por`, fechas UTC).

**`bookings`**:

- `travel_file_id`, `mayorista_id | null` (y su nombre copiado), `neto_unidades | null`, `moneda_iso`;
- `localizador` (`recordLocator`) `varchar(64) | null`;
- `time_limit` `timestamptz | null` (UTC, R9);
- `estado`: `PENDIENTE` (aún no pedida) → `RESERVADA` → `PAGADA_AL_PROVEEDOR`; desde `PENDIENTE` o
  `RESERVADA` → `LIBERADA` (el cupo se perdió) o `CANCELADA`.
- **Invariante en la base (CHECK):** `estado = 'RESERVADA'` exige `time_limit IS NOT NULL`. Una
  reserva sin plazo no existe. Es lo que convierte «se vigila» en algo que no depende de que alguien
  se acuerde.

**El *time limit* y `diasTimeLimit`.** Al pasar a `RESERVADA`, el asesor **escribe** el *time limit*
que le dio el mayorista. La interfaz lo **sugiere** como «ahora + `diasTimeLimit` días, a las 18:00
en la zona del tenant» si el mayorista lo tiene; si no, el campo va vacío y es obligatorio. El
sugerido nunca se guarda sin que el asesor lo confirme: el plazo real es el que dice el mayorista, no
nuestro valor por defecto. Regla de dominio: el *time limit* no puede ser posterior a la
`fecha_salida`.

**Vigilancia.** Un trabajo programado en `apps/api` (ADR-0019: un proceso, sin Redis; mismo
mecanismo y candado que el que crea T-191 para vencer cotizaciones):

- Recorre los tenants con el mecanismo que ya usa el barrido (sin saltarse RLS: un `conTenant` por
  tenant).
- Para cada `Booking` `RESERVADA` con `time_limit` dentro de las próximas **24 h**, escribe una vez
  `booking.time_limit_proximo` en el outbox; con `time_limit` ya pasado, una vez
  `booking.time_limit_vencido`. «Una vez» = columnas `aviso_proximo_en` y `aviso_vencido_en` en la
  reserva, escritas en la misma transacción que el evento.
- **Nunca cambia el estado solo.** Que el cupo se liberó lo sabe el mayorista; el asesor marca
  `LIBERADA`. El sistema solo grita.
- El umbral de 24 h es constante en el MVP. Hacerlo política de la agencia (R12) requiere las dos
  agencias que pide ADR-0006.

**Lo que ve el asesor.** Una sola pantalla «Reservas»: archivos abiertos con sus reservas,
ordenadas por `time_limit` ascendente y un semáforo (vencido / menos de 24 h / resto). Esa lista
**es** la vigilancia visible del MVP; los eventos son para el aviso activo que llegará con
`notifications`.

**Permisos.** Dos permisos nuevos en el catálogo (migración del `CHECK
roles_permisos_del_catalogo`): `archivo.ver` y `archivo.operar`. Sembrados en `DUENO`, `ASESOR` y
`OPERACIONES` (operaciones es quien reserva en muchas agencias). Neto y margen del archivo siguen
exigiendo `cotizacion.ver_neto_y_margen`.

**Rutas** (contratos en `packages/contracts/src/archivos.ts`):

- `GET  /api/v1/archivos` — lista con semáforo (`archivo.ver`).
- `GET  /api/v1/archivos/:id` — detalle con reservas (`archivo.ver`).
- `PUT  /api/v1/archivos/:id/reservas/:reservaId` — fija estado, localizador y *time limit*
  (`archivo.operar`). `PUT` por idempotencia: fija el valor completo.
- `POST /api/v1/archivos/:id/cancelacion` (`archivo.operar`).

### 4. Alcance

**Entra en el MVP:** evento de aceptación (vía T-191), TRM y mayorista congelados en la versión,
`travel_files` y `bookings` con RLS, apertura automática idempotente, captura de localizador y *time
limit*, vigilancia con eventos, la pantalla «Reservas», dos permisos.

**Queda fuera, explícitamente:**

| Fuera | Por qué | Cuándo |
|---|---|---|
| Pasajeros (`Passenger`) y documentos (`TravelerDocument`) | PII sensible (R10, ADR-0015); el asesor ya manda nombres al mayorista por su canal | Cuando el piloto lo pida; con su propio ADR de PII |
| Pagos, anticipos, cuotas, conciliación | Contexto `payments`, que no existe | Fase de `payments` |
| Cuenta por pagar al proveedor y comisión por cobrar | `payments` (ADR-0023) | Idem |
| Política de TRM al cobrar (congelada o del día) | Política por agencia, de `payments` | Idem |
| Consulta automática de la TRM oficial | Tercero = puerto + adaptador + ADR | Cuando haya una agencia vendiendo en USD |
| Avisos activos (correo, WhatsApp al asesor) | Contexto `notifications` | Primer consumidor de `booking.time_limit_proximo` |
| Vouchers, penalidades, cambios de fecha | Operación avanzada | Fase 3 |
| Reservar contra el sistema del mayorista (API) | Ningún mayorista del segmento la tiene | Nunca, salvo evidencia |
| Número de file legible por agencia («file 1043») | Contador por tenant; útil pero no imprescindible | Primera petición del piloto |
| Abrir un archivo sin cotización (venta directa) | Un camino de alta más | Cuando aparezca el caso |

## Consecuencias

### Positivas
- El *time limit* deja de depender de la memoria del asesor, que es la promesa central del dominio.
- `TravelFile` nace con su forma definitiva; pasajeros y pagos se añaden sin migrar lo que hay.
- La TRM con la que se le habló al cliente queda congelada y resuelve la primera disputa típica.

### Negativas
- Dos tablas nuevas con RLS y un consumidor de eventos: superficie de aislamiento nueva que
  `auditor-seguridad` tiene que revisar (y que entra en `aislamiento.spec.ts`).
- Depende de T-191 y de un despachador de eventos que hoy no existe: si T-191 se retrasa, esto
  también.
- Copia de datos de la versión en el archivo: si un día la versión tuviera una corrección (hoy
  imposible por el disparador), el archivo no la vería.
- Sin pasajeros, el archivo no sirve todavía para emitir vouchers ni listas de rooming; el asesor
  sigue usando su hoja para eso.
- Tocar `versiones_cotizacion` (TRM, comisión, mayorista por línea) es tocar una tabla inmutable con
  disparador propio: migración delicada, ruta protegida (R11).

### Qué habría que cambiar para revertir esto
- Antes de datos reales: borrar el módulo y sus dos tablas; las columnas de TRM en la versión se
  pueden quedar nulas. Con datos reales, un archivo de viaje no se borra: se supersede este ADR.

## Cuándo revisar esta decisión

- Cuando el piloto venda su primer paquete en USD: validar con él la fuente y el momento de la TRM.
- Cuando el piloto pida pasajeros en el archivo: ADR de PII del pasajero.
- Si una agencia necesita un umbral distinto de 24 h, y aparece una segunda que lo pida igual.
- Si los archivos con más de un mayorista resultan raros en la práctica: simplificar a una reserva
  por archivo no exige migración, solo dejar de crear la segunda.
