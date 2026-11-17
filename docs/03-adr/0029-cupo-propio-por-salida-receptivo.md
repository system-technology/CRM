# ADR-0029 — Cupo propio por salida (receptivo)

- **Estado:** Propuesto
- **Fecha:** 2026-11-17
- **Decide:** propietario, a propuesta de `arquitecto`
- **Consultados:** `arquitecto` (autor). Pendientes: `experto-turismo` (modelo de negocio: bloqueo,
  mínimo, manifiesto), `auditor-seguridad` (tres tablas nuevas con tenant, disparador bajo RLS y PII
  del manifiesto), `datos` (migración y disparador), `dueno-de-producto` (alcance de la Fase 1)
- **Supersede parcialmente:** [ADR-0009](0009-salida-programada-como-unidad-de-venta.md), **solo**
  en lo que dice del cupo de las salidas que la agencia opera con recurso propio: §1 («cupo
  informativo y opcional»), §1 último párrafo («no se crea un agregado de inventario propio») y el
  bloque «Fuera de alcance» en lo que toca a cupo propio, mínimo de operación y salida en riesgo.
  **El resto de ADR-0009 sigue en pie**, incluido el cupo informativo de las salidas de terceros,
  la función única de resolución de tarifa y `DepartureCost`, que sigue aplazado. Al aceptarse este
  ADR, la línea de estado de ADR-0009 se anota «Superseded parcialmente por ADR-0029 (cupo de
  salidas propias)» sin tocar su contenido.
- **Depende de:** [ADR-0024](0024-de-cotizacion-aceptada-a-archivo-de-viaje.md) (archivo de viaje y
  evento `quoting.cotizacion_aceptada`, dirección adoptada para la Fase 1) y, para la segunda mitad
  del manifiesto, de la primitiva de [ADR-0015](0015-cifrado-de-campos-sensibles.md)
- **Origen:** decisión D1 del 2026-11-17 (`docs/_contexto/DIARIO.md`), auditoría competitiva
  (`docs/_auditorias/2026-11-16-auditoria-competitiva.md`, capacidades M7, M8 y M9 del insumo
  `2026-11-16-capacidades-por-segmento-insumo.md`)

---

## Contexto

ADR-0009 decidió que el cupo de una salida es **informativo**: «para quien revende, el inventario
de sillas es del mayorista; la disponibilidad se pregunta, no se calcula». Era verdad para el
piloto que teníamos delante y sigue siéndolo para el segmento S1 (agencia minorista).

**La fuerza que lo cambia es de alcance de producto, y viene con dinero y con un muelle.** D1 mete
en el foco al receptivo (S3), y en S3 el cupo **es de la agencia**: su lancha de 40 sillas, su bus,
su guía. La silla 41 no es un dato mal capturado: es un pasajero que se queda en el muelle con el
anticipo pagado. La auditoría lo marca bloqueante (M7 y M9) e importante (M8), y el propio ADR-0009
lo dejó previsto en «Cuándo revisar»: «cuando llegue un tenant que opere salidas propias, se escribe
su ADR — cupo propio, mínimo de operación, salida en riesgo y reubicación». Este es ese ADR.

Cuatro hechos que fijan la forma:

1. **La misma agencia hace las dos cosas.** Un receptivo opera su pasadía en lancha y revende el
   paquete a Punta Cana de un mayorista. Una bandera por agencia («esta agencia tiene cupo propio»)
   sería falsa la mitad del tiempo para la misma agencia. El dueño del inventario es un **dato de
   la salida**, no una política del tenant (R12).
2. **Dos asesoras venden la última silla a la vez.** Ocurre por WhatsApp un sábado a las 10 de la
   mañana. El invariante «vendidas + bloqueadas ≤ capacidad» tiene que sostenerse en la base bajo
   concurrencia; si depende de que el código lea y luego escriba con cuidado, se rompe.
3. **La silla se aparta antes de pagarse.** «Te la aparto hasta mañana, me consignas». Hay un
   bloqueo con vencimiento, una confirmación al pagar y una liberación si no paga. `payments` no
   existe (D3: se elige pasarela en la Fase 2), así que la confirmación del MVP es manual.
4. **El día de la salida la unidad que se opera es la salida, no el archivo.** A las 05:30 el guía
   necesita la lista: nombre, tipo de pasajero, punto y hora de recogida. Eso es PII de viajeros, y
   ADR-0024 dejó a los pasajeros fuera «con su propio ADR de PII».

**El momento importa igual que en ADR-0009:** no hay datos de producción. El esquema es el activo
más caro de cambiar, y hoy cuesta una migración.

**Lo que no motiva este ADR:** volumen. Una salida tiene decenas de sillas, no miles; ninguna
decisión de abajo se justifica por rendimiento.

## Opciones consideradas

Hay dos decisiones encadenadas: **dónde vive el cupo** y **cómo se impide la sobreventa**.

### Dónde vive el cupo

#### A — En `quoting`: columnas de capacidad en `vigencias` y bloqueos en el catálogo

- **Gana:** una tabla menos; la disponibilidad se lee en la misma consulta que el precio.
- **Cuesta:** `quoting` pasa a guardar bloqueos atados a archivos de viaje, estados de operación y,
  con el manifiesto, pasajeros. El contexto más denso del sistema absorbe la operación y la PII.
  `booking` y `quoting` se referenciarían en los dos sentidos.
- **Cierra:** extraer `booking` limpio después; contradice la frontera que ADR-0009 §1 trazó
  («lo que ocurre después de vender una silla es de `booking`»).

#### B — En `booking`: un agregado de operación de salida con sus bloqueos (elegida)

`booking` posee la capacidad, el mínimo, el estado operativo, los bloqueos y el manifiesto de cada
salida propia. `quoting` conserva lo que es catálogo: que la salida existe, su precio y **quién es
dueño de su inventario**.

- **Gana:** capacidad y bloqueos en el mismo contexto y en la misma transacción, que es lo que
  permite el invariante en la base. Los pasajeros quedan donde el mapa de contextos ya los pone.
- **Cuesta:** la disponibilidad que muestra el cotizador se lee por un puerto hacia `booking`; el
  alta de una salida propia toca dos contextos (catálogo y operación).
- **Cierra:** nada que no se pueda abrir después.

#### C — Contexto nuevo `inventory` / `operations`

- **Gana:** sitio natural para el *allotment* de S2 y el aforo por turno de S4.
- **Cuesta:** un undécimo contexto, con su módulo, su despachador y su superficie de aislamiento,
  antes de tener una agencia S3 vendiendo. ADR-0009 ya lo descartó por la misma razón.
- **Cierra:** nada formalmente; es prematuro. Si llega S2 con *allotments* hoteleros, se revisa.

### Cómo se impide la sobreventa

#### 1 — Contador en la salida con `UPDATE` condicional

`UPDATE … SET bloqueadas = bloqueadas + n WHERE vendidas + bloqueadas + n <= capacidad`, más un
`CHECK` en la fila. Correcto bajo concurrencia en `READ COMMITTED`.

- **Cuesta:** **dos fuentes de verdad** (el contador y la lista de bloqueos) que deben coincidir
  siempre. Vencer un bloqueo exige un trabajo que decremente el contador a tiempo: si el barrido se
  cae, la salida queda llena de sillas fantasma. Si alguien escribe un camino que crea el bloqueo
  sin tocar el contador, el `CHECK` no lo ve y hay sobreventa.

#### 2 — Una fila por silla con `UNIQUE`

Cuarenta filas por salida; bloquear es asignar filas libres.

- **Cuesta:** cambiar la capacidad inserta o borra filas; la numeración de sillas no significa nada
  en una lancha. Modela un asiento asignado que nadie pidió.

#### 3 — Aislamiento `SERIALIZABLE`

- **Cuesta:** reintentos por fallo de serialización en todo camino que toque bloqueos, con Prisma,
  que no los gestiona, y con el resto del sistema en `READ COMMITTED`. Un camino que olvide
  reintentar falla en producción, no en las pruebas.

#### 4 — Disparador que bloquea la fila de la salida y suma (elegida)

Un disparador `BEFORE INSERT OR UPDATE` en la tabla de bloqueos toma `SELECT … FOR UPDATE` sobre la
fila de la salida y **después** suma las sillas que cuentan. Si no caben, aborta con un `SQLSTATE`
propio. La fila de la salida es el candado; la suma es la verdad.

- **Gana:** una sola fuente de verdad (los bloqueos); ningún camino de la aplicación puede
  esquivarlo porque vive en la tabla; vencer no exige que nada corra a tiempo (ver §3).
- **Cuesta:** una suma por bloqueo sobre, como mucho, unas decenas de filas, con índice parcial.
  Un disparador es código en la base: ruta protegida (R11) y prueba específica.
- **Cierra:** la sobreventa intencional (*overbooking* controlado). Si una agencia la pide, sube la
  capacidad: no hay un umbral blando.

## Decisión

**B + 4.** El cupo propio vive en `booking`, y el invariante lo garantiza un disparador que
serializa por salida con un bloqueo de fila y suma los bloqueos vigentes.

### 1. El dato que distingue: `vigencias.origen_del_cupo`

Columna nueva en `vigencias` (`quoting`), enum `origen_del_cupo`: `TERCERO` (por defecto) y
`PROPIO`.

- **Es enum y no tabla por tenant, a propósito.** No es vocabulario de la agencia: decide si un
  invariante se aplica o no, igual que `UnidadDeCobro` decide un denominador. Dos valores, dos
  semánticas, ninguna más.
- **Es dato de la salida, no política del tenant.** No hay bandera global. La misma agencia tiene
  salidas `PROPIO` y `TERCERO`.
- **CHECK:** `origen_del_cupo = 'PROPIO'` exige `desde = hasta`, `publicada` y `cupo_total IS
  NULL`. Una vigencia abierta no tiene sillas, y una salida propia no tiene dos capacidades: la
  suya vive en `booking`. `cupo_total` sigue siendo el cupo informativo de las salidas `TERCERO`,
  sin cambios.
- **Inmutable tras el alta.** Una salida no cambia de dueño de inventario; si cambia, se crea
  otra. Lo aplica el caso de uso de `quoting` (el contrato de edición no expone el campo).
- **No toca el precio.** La resolución de tarifa de ADR-0009 sigue siendo una sola función y no
  ramifica sobre `origen_del_cupo`. Lo que ramifica es **la disponibilidad**, que no es cálculo de
  precio. Si algún día una ruta de cálculo de precio ramifica sobre este campo, se ha violado
  ADR-0009 y hay que decirlo.

### 2. El modelo en `booking`

Tres tablas nuevas, todas con `tenant_id`, RLS forzada, foráneas **compuestas** con el tenant y
fechas en UTC (R1, R9). Ninguna es excepción de `excepciones_rls`; las tres entran en
`aislamiento.spec.ts`. Las referencias a `quoting` son identificadores sin foránea, con copia de lo
necesario (regla 2 de frontera), igual que `travel_files` en ADR-0024.

**`operaciones_de_salida`** (`DepartureOperation`, «Operación de la salida»). Una por salida
propia: `UNIQUE (tenant_id, vigencia_id)`.

| Columna | Tipo | Qué es |
|---|---|---|
| `vigencia_id` | `uuid` | La salida de `quoting`. Sin foránea |
| `paquete_nombre`, `fecha_salida` | copia | Para operar sin leer a `quoting`. `fecha_salida` es `date` |
| `capacidad` | `smallint`, `CHECK > 0` | Sillas físicas del recurso (la lancha de 40) |
| `minimo_para_operar` | `smallint` nulo, `CHECK <= capacidad` | Nulo = sale con los que haya |
| `decidir_antes_de` | `timestamptz` nulo | Fecha de decisión del mínimo. Exige `minimo_para_operar` (CHECK) |
| `estado` | enum | `ABIERTA` · `CONFIRMADA` · `CERRADA` · `CANCELADA` (§4) |
| `motivo_cancelacion` | `varchar(200)` nulo | Exigido si `CANCELADA` (CHECK) |
| auditoría | | `creado_por`, `actualizado_por`, fechas |

La capacidad **se escribe en `booking`**. El formulario de alta de una salida propia en la web hace
dos llamadas: crea la vigencia `PROPIO` en `quoting` y luego `PUT /api/v1/operaciones-de-salida/
:vigenciaId` en `booking`, que valida por un puerto **declarado en `booking`** que la vigencia
existe, es de esta agencia y es `PROPIO`, y copia sus datos. `PUT` porque es idempotente. Si la
segunda llamada falla, queda una salida propia **sin capacidad declarada**, y eso **falla cerrado**:
no se le puede bloquear ni una silla (§3) y el catálogo la muestra como «capacidad sin declarar».

**`bloqueos_de_cupo`** (`SeatHold`, «Bloqueo de cupo»). Las sillas que un archivo tiene en una
salida.

| Columna | Tipo | Qué es |
|---|---|---|
| `operacion_id` | `uuid` | Foránea compuesta a `operaciones_de_salida` |
| `travel_file_id` | `uuid` | Foránea compuesta a `travel_files` (ADR-0024) |
| `sillas` | `smallint`, `CHECK > 0` | Las que ocupa este archivo (§3, pregunta 4) |
| `estado` | enum | `BLOQUEADA` · `CONFIRMADA` · `LIBERADA` · `SIN_CUPO` |
| `vence_en` | `timestamptz` | Exigido si `BLOQUEADA` (CHECK). No posterior a la salida (dominio) |
| `motivo_liberacion` | enum nulo | `VENCIDA` · `CANCELADA_POR_CLIENTE` · `SALIDA_CANCELADA` · `REUBICADA`. Exigido si `LIBERADA` (CHECK) |
| `punto_de_recogida` | `varchar(300)` nulo | Copiado de `OpcionDeSalida.puntoDeEncuentro`, editable (hotel del grupo) |
| `hora_de_recogida` | `time` nulo | Hora local del punto, sin zona, como `OpcionDeSalida` (R9) |
| `confirmado_en`, `confirmado_por` | | Quién marcó el pago y cuándo |

`UNIQUE (tenant_id, travel_file_id, operacion_id)`: un archivo tiene **una** fila por salida, que
cambia de estado. Es la llave de idempotencia del consumidor (§3).

**`pasajeros`** (`Passenger`): §5.

### 3. Bloqueo, confirmación y liberación — y cómo no se vende la silla 41

**Qué cuenta.** Una fila ocupa cupo si `estado = 'CONFIRMADA'`, o si `estado = 'BLOQUEADA' AND
vence_en > now()`. `LIBERADA` y `SIN_CUPO` no cuentan.

**El disparador `verificar_cupo_de_salida`**, `BEFORE INSERT OR UPDATE OF estado, sillas, vence_en`
en `bloqueos_de_cupo`, `SECURITY INVOKER`, corre con `viajapro_app` bajo RLS:

1. Si la fila resultante no cuenta, termina sin hacer nada (liberar nunca se bloquea).
2. `SELECT capacidad, estado FROM operaciones_de_salida WHERE id = NEW.operacion_id AND tenant_id
   = NEW.tenant_id FOR UPDATE`. **Este es el candado:** dos transacciones que bloquean en la misma
   salida se ponen en fila aquí.
3. Si la fila **empieza** a contar (alta, `SIN_CUPO → BLOQUEADA`, revivir un bloqueo vencido o
   ampliar `vence_en` de uno vencido), la salida debe estar `ABIERTA` o `CONFIRMADA`. Confirmar un
   bloqueo **vigente** se admite también en `CERRADA`.
4. Suma `sillas` de las filas de esa operación que cuentan, **excluida la propia** (`id <> NEW.id`),
   y aborta con `SQLSTATE` propio si la suma más `NEW.sillas` supera `capacidad`.

Un segundo disparador en `operaciones_de_salida` rechaza bajar `capacidad` por debajo de lo que
cuenta (la fila ya está bloqueada por el propio `UPDATE`).

**Por qué es correcto bajo concurrencia.** En `READ COMMITTED`, la segunda asesora espera en el
`FOR UPDATE` hasta que la primera confirma; su `SUM`, que es una sentencia posterior dentro de una
función volátil, toma instantánea nueva y **ve** la silla de la primera. No hay ventana entre leer y
escribir porque leer ocurre con el candado en la mano. La suma ve solo filas del tenant (RLS), y eso
basta: la foránea compuesta impide que un bloqueo de otra agencia cuelgue de esta operación.

**Por qué `SECURITY INVOKER` y no un rol dueño.** El disparador no escribe en ninguna columna que el
rol de aplicación no pueda escribir; solo lee y aborta. No hace falta un rol `NOLOGIN` nuevo y R2
no cambia. Si alguna vez el disparador escribiera, se revisa esto.

**`now()` dentro de la suma es deliberado.** Un bloqueo vencido deja de contar **en el instante en
que vence**, aunque nadie lo haya barrido. La liberación no depende de que un trabajo corra a
tiempo; el barrido (abajo) es para avisar y para dejar el estado legible, no para la corrección.

**El ciclo:**

- **Nace al aceptar.** El consumidor de `quoting.cotizacion_aceptada` en `booking` (ADR-0024 §3) lee
  la versión por `PuertoVersionAceptada`, que añade `vigenciaId` y `opcionDeSalidaId` a lo que
  devuelve. Si `booking` tiene una `operacion_de_salida` para esa `vigencia_id`, inserta el bloqueo
  `BLOQUEADA` con `vence_en = ahora + 24 h` (sin pasar de la salida) y sillas según la pregunta 4.
  Si el disparador lo rechaza, en una transacción nueva inserta la misma fila como `SIN_CUPO`, que
  no cuenta, y escribe `booking.cupo_insuficiente`. `ON CONFLICT DO NOTHING` sobre la llave única
  hace que el evento repetido no cree nada (regla 5 de frontera).
- **Aviso antes de aceptar.** El caso de uso de aceptación en `quoting` consulta la disponibilidad
  por un puerto **declarado en `quoting`** (`PuertoDisponibilidadDeCupo`, en
  `shared/puertos/puertos-hacia-booking.ts`) y rechaza con `SalidaSinCupo` si ya no caben. **No es
  la garantía**, es la cortesía: la garantía es el disparador. La ventana que queda (segundos entre
  aceptar y el consumidor) termina en `SIN_CUPO` con aviso, nunca en la silla 41.
- **El plazo** de 24 h es constante en el MVP, como el umbral de ADR-0024. La asesora puede
  **ampliarlo o acortarlo** en el bloqueo, como escribe el *time limit*. Hacerlo política por
  agencia (R12) espera a la segunda agencia que lo pida igual (ADR-0006).
- **Confirmación.** `BLOQUEADA → CONFIRMADA`, manual en el MVP con `archivo.operar` («pago
  recibido»), porque `payments` no existe. Cuando exista, `PaymentReceived` dispara la misma
  transición por el mismo caso de uso. Confirmar un bloqueo ya vencido pasa por el disparador como
  uno nuevo: si la silla se vendió en el intervalo, no se confirma.
- **Liberación.** Cancelar el archivo (ADR-0024 `POST …/cancelacion`) libera sus bloqueos en la
  misma transacción (`CANCELADA_POR_CLIENTE`). Un barrido en el mismo trabajo programado de ADR-0024
  (un `conTenant` por tenant, sin saltarse RLS) marca `LIBERADA`/`VENCIDA` lo que venció y escribe
  `booking.bloqueo_de_cupo_vencido` una vez. Liberar una silla `CONFIRMADA` la devuelve al cupo; la
  penalidad y el reembolso son de `payments`, fuera.
- **Archivo y reservas de ADR-0024.** Las líneas de una salida propia **no** crean un `Booking` con
  mayorista: la agencia no se reserva a sí misma. El bloqueo de cupo es su reserva. El archivo pasa
  a `CONFIRMADO` cuando todas sus reservas y sus bloqueos están confirmados o cancelados/liberados,
  con al menos uno confirmado; la regla de ADR-0024 se extiende, no cambia.

### 4. Estado de la salida y mínimo para operar

| Estado | Vende | Qué significa |
|---|---|---|
| `ABIERTA` | Sí | Publicada; aún no se decidió si sale |
| `CONFIRMADA` | Sí, hasta la capacidad | La agencia decidió que sale. Puede ser bajo el mínimo: es su decisión |
| `CERRADA` | No (solo confirmar bloqueos vigentes) | Cierre de venta. El manifiesto queda final |
| `CANCELADA` | No | No sale. Terminal |

Transiciones: `ABIERTA → CONFIRMADA | CERRADA | CANCELADA`, `CONFIRMADA → CERRADA | CANCELADA`,
`CERRADA → CANCELADA`. Todas **manuales** con el permiso nuevo `salida.operar`.

**«En riesgo» no es un estado: se deriva.** Una salida `ABIERTA` con `minimo_para_operar`, con
sillas confirmadas por debajo del mínimo y a menos de 48 h de `decidir_antes_de`, se pinta en riesgo
y el barrido escribe una vez `booking.salida_en_riesgo`. Guardarlo sería una columna que miente en
cuanto entra un pago.

**El sistema nunca cancela ni confirma solo.** Como con el *time limit*: el operador decide si la
lancha sale con nueve; el sistema grita a tiempo. Llegar al mínimo tampoco confirma sola la salida
(pregunta 5).

**Si no se llega al mínimo y la agencia cancela:** en la misma transacción, la operación pasa a
`CANCELADA` y todos sus bloqueos `BLOQUEADA`/`CONFIRMADA` a `LIBERADA` con `SALIDA_CANCELADA`.
Se escribe `booking.salida_cancelada` (`{ v: 1, operacionId, vigenciaId }`, sin pasajeros), que
consumen `quoting` (despublica la vigencia: deja de ofrecerse) y, cuando existan, `notifications` y
`payments`. Los archivos afectados quedan `ABIERTO` y aparecen en «Reservas» con la marca **«salida
cancelada: reubicar o devolver»**. En el MVP la asesora gestiona cada uno: cancela el archivo o
crea uno nuevo desde una cotización a otra fecha. La **reubicación** en un paso (liberar aquí y
bloquear allá en una transacción, tomando los candados de las dos salidas en orden de `id` para no
cruzarse) y el saldo a favor van después.

### 5. Manifiesto y pasajeros

El manifiesto (`PassengerManifest`) **no es una tabla**: es una lectura de `booking` sobre una
operación — bloqueos `CONFIRMADA` (y `BLOQUEADA` vigentes, marcados «sin pagar») → archivos →
pasajeros, con punto y hora de recogida del bloqueo, el estado de pago y el nombre del contacto que
compró. Se ordena por hora de recogida.

**`pasajeros`** (`Passenger`, el «viajero dentro de un archivo» del lenguaje ubicuo), en dos mitades
para que la segunda no frene a la primera:

| Columna | Mitad | Cifrada | Por qué |
|---|---|---|---|
| `travel_file_id` | 1 | No | Foránea compuesta |
| `nombre_completo` | 1 | No | PII ordinaria, como `contactos.nombre` (ADR-0015). Es lo que lee el guía |
| `tipo` | 1 | No | `ADT`/`CHD`/`INF`: el chaleco infantil. Ya está en claro en la cotización |
| `punto_de_recogida`, `hora_de_recogida` | 1 | No | Nulos = los del bloqueo. Solo si un pasajero sube en otro hotel |
| `documento_tipo` + `documento_numero` | 2 | **Sí**, ADR-0015 | R10. Etiqueta `viajapro/pasajeros.documento/v1/` |
| `fecha_nacimiento` | 2 | **Sí**, ADR-0015 | R10, nombrada expresamente. Etiqueta `viajapro/pasajeros.fecha_nacimiento/v1/` |

Las columnas cifradas siguen las ocho concreciones de ADR-0015 (cuatro columnas por campo,
`CHECK num_nonnulls IN (0, 4)`, id generado en la aplicación, AAD con tenant e id de fila) y se
añaden a su inventario de columnas declaradas, para que su prueba no envejezca. **Salud, alergias y
contacto de emergencia no entran**: si la pregunta 4 dice que el manifiesto los exige, se amplía con
otro ADR. El teléfono se toma del contacto, no se copia.

**Acceso auditado (R10).** Ver o exportar el manifiesto exige el permiso nuevo `manifiesto.ver`
(sembrado en `DUENO` y `OPERACIONES`) y escribe un `registros_auditoria` con quién, qué operación y
cuántas filas, **sin contenido**. La exportación (CSV en el MVP, PDF después) se audita igual. El
outbox y los eventos nunca llevan nombres ni documentos: solo identificadores.

### 6. Frontera y eventos (R4)

**Dueño:** `booking` posee operaciones, bloqueos, pasajeros y manifiesto. `quoting` posee la
salida como catálogo, su precio y `origen_del_cupo`. Ningún módulo importa al otro.

| Dirección | Mecanismo | Qué |
|---|---|---|
| `quoting → booking` | evento (existe por ADR-0024) | `quoting.cotizacion_aceptada` → abre archivo y bloquea |
| `booking → quoting` | puerto declarado en `booking` | `PuertoVersionAceptada` (+ `vigenciaId`, `opcionDeSalidaId`); `PuertoSalidaPublicada` para validar el alta de la operación |
| `quoting → booking` | puerto declarado en `quoting` | `PuertoDisponibilidadDeCupo`: capacidad y sillas ocupadas por `vigenciaId`, solo lectura |
| `booking →` | eventos nuevos (v1, solo identificadores) | `booking.cupo_bloqueado`, `booking.cupo_confirmado`, `booking.cupo_liberado` (con motivo), `booking.cupo_insuficiente`, `booking.bloqueo_de_cupo_vencido`, `booking.salida_en_riesgo`, `booking.salida_confirmada`, `booking.salida_cancelada` |
| `booking → quoting` | evento | `booking.salida_cancelada` → `quoting` despublica la vigencia |
| `payments → booking` | evento (futuro) | `PaymentReceived` → `BLOQUEADA → CONFIRMADA` |

Los puertos en las dos direcciones son un olor conocido y aceptado: los dos son de solo lectura y
están declarados por el consumidor. Si `quoting` empezara a **escribir** en `booking` por puerto, se
habría cruzado la línea.

### 7. Orden de implementación

Rebanadas de 1 a 3 días, cada una integrable sola. Todas van detrás de ADR-0024 F1 (T-191 y el
archivo).

| Fase | Qué | Entra en el MVP de la Fase 1 |
|---|---|---|
| **C1** | Migración: `vigencias.origen_del_cupo` con su CHECK; `operaciones_de_salida` y `bloqueos_de_cupo` con RLS; los dos disparadores. **Prueba de concurrencia** (dos conexiones, la última silla, exactamente una gana) vista en rojo sin el `FOR UPDATE`; aislamiento de las tablas nuevas | Sí |
| **C2** | Alta de salida propia con capacidad (dos llamadas), `PUT` de la operación, disponibilidad en el catálogo y el cotizador por puerto, aviso `SalidaSinCupo` al aceptar | Sí |
| **C3** | Bloqueo automático al aceptar, `SIN_CUPO`, confirmación manual, liberación por cancelación, barrido y eventos de bloqueo; columna de cupo en «Reservas» | Sí |
| **C4** | Estados de la salida, mínimo y fecha de decisión, «en riesgo» derivado, cancelación con liberación y `booking.salida_cancelada`; pantalla «Salidas» con ocupación | Sí |
| **C5** | `pasajeros` mitad 1, manifiesto en pantalla y CSV, punto y hora de recogida, `manifiesto.ver` auditado | Sí |
| **C6** | `pasajeros` mitad 2: documento y fecha de nacimiento cifrados | Después, cuando la pregunta 4 lo confirme y la primitiva de ADR-0015 esté en `main` |
| — | Reubicación en un paso; confirmación por `PaymentReceived`; plazo de bloqueo como política por agencia; cierre de venta X horas antes; turnos con aforo; venta B2B a otras agencias con cupo asignado; `DepartureCost` y margen por punto de equilibrio; recursos (guía, vehículo); sincronía con OTAs; PDF del manifiesto | Después. Cada uno con su caso real |

C1 es la que no se recorta: es la garantía. Si hay que recortar la Fase 1, se recorta de C4 hacia
abajo, nunca la prueba de concurrencia.

## Consecuencias

### Positivas
- La silla 41 no se puede vender por ningún camino, incluida una consulta escrita a mano con el rol
  de aplicación: la garantía está en la tabla, no en el código que la usa.
- Una sola fuente de verdad para la ocupación; vencer un bloqueo no depende de un trabajo.
- S1 no cambia: las salidas `TERCERO` siguen con cupo informativo y sin bloqueo. La misma agencia
  convive con los dos.
- La resolución de precio de ADR-0009 queda intacta.
- `Passenger` nace con su forma definitiva y con la PII separada en una mitad cifrable.

### Negativas
- **Lógica de negocio en un disparador.** Es código en la base, en ruta protegida, más difícil de
  leer y de probar que un caso de uso. Se acepta porque es la única forma de que el invariante no
  dependa de quién escribe.
- **Contención por salida.** Todas las escrituras de bloqueos de una salida se serializan en su
  fila. Con decenas de sillas es irrelevante; con un aforo de miles por turno (S4) habría que revisarlo.
- **Tres tablas nuevas con tenant** y un disparador bajo RLS: superficie nueva que
  `auditor-seguridad` tiene que revisar y que entra en `aislamiento.spec.ts`.
- **El alta de una salida propia toca dos contextos** sin atomicidad: puede quedar una salida sin
  capacidad. Falla cerrado, pero es una pantalla de error más.
- **La aceptación no garantiza la silla** en el mismo instante: entre aceptar y el consumidor hay
  segundos en los que otra asesora puede llevársela. Termina en `SIN_CUPO` con aviso, no en
  sobreventa, pero la asesora tendrá que llamar al cliente.
- **Confirmación manual** hasta que exista `payments`: la marca «pago recibido» es tan fiable como
  quien la pone.
- Puertos de lectura en los dos sentidos entre `quoting` y `booking`.

### Qué habría que cambiar para revertir esto
- Antes de datos reales: borrar las tres tablas, los disparadores y la columna `origen_del_cupo`;
  ADR-0009 vuelve a regir entero. Con datos reales, un bloqueo confirmado es una venta: no se borra,
  se supersede este ADR.
- Pasar a contador (opción 1) no exige migrar datos: se añade la columna, se rellena con la suma y
  se cambia el disparador.

## Cuándo revisar esta decisión

- Si aparece un aforo por turno de cientos o miles (S4) y la contención en la fila de la salida se
  nota: contador o particionado del candado.
- Si llega S2 con *allotments* hoteleros o bloqueos aéreos con *release*: probablemente es el
  momento del contexto `inventory` (opción C).
- Si una agencia pide sobreventa controlada de verdad, con cifras, y no le basta subir la capacidad.
- Si una ruta de **cálculo de precio** necesita ramificar sobre `origen_del_cupo`.
- Si el bloqueo tiene que nacer antes de aceptar la cotización (pregunta 2).

---

## Preguntas abiertas

| # | Pregunta | Dueño |
|---|---|---|
| 1 | **¿Hay una agencia real que opere salidas propias?** El propietario dijo el 2026-10-11 que el piloto «revende, no opera», y el catálogo de JD Tours no trae cupos. D1 se apoya en la **forma** del catálogo. Sin una agencia S3 real, C1–C5 se construyen contra semilla: ¿cuál es, y cuál de sus salidas es propia? | propietario, `experto-turismo` |
| 2 | **¿Cuándo se aparta la silla y por cuánto?** Este ADR la bloquea al aceptar la cotización, 24 h. ¿El receptivo aparta antes («guárdamela mientras lo hablo con mi esposa»)? ¿Es 24 h el plazo típico, o depende de cuánto falta para la salida? | `experto-turismo` |
| 3 | **¿Qué confirma la silla?** ¿El anticipo, el pago total, o la palabra de una agencia B2B con crédito? Fija qué evento de `payments` disparará la confirmación | propietario, `experto-turismo` |
| 4 | **¿Qué cuenta como silla y qué exige el manifiesto?** ¿El infante en brazos ocupa cupo en la lancha (capitanía cuenta personas)? Este ADR los cuenta a todos por defecto. ¿Capitanía, el parque o la póliza exigen documento, fecha de nacimiento o contacto de emergencia? Decide si C6 entra en el MVP | `experto-turismo`, `investigador` |
| 5 | **¿Qué hace hoy el operador cuando no llega al mínimo?** ¿Cancela, fusiona con otra salida, opera a pérdida, mueve a otra fecha? ¿Con cuánta antelación y cómo avisa al viajero? ¿Llegar al mínimo debería confirmar la salida sola? | `experto-turismo` |

## Entradas propuestas al lenguaje ubicuo

No se edita el diccionario en este ADR. Se proponen, para aprobación: **Origen del cupo**
(`origen_del_cupo`: `TERCERO`/`PROPIO`), **Operación de la salida** (`DepartureOperation`),
**Bloqueo de cupo** (`SeatHold`), **Mínimo para operar** (`MinimumToOperate`), **Manifiesto**
(`PassengerManifest`) y **Punto de recogida** (`MeetingPoint`). Las entradas **Salida** y **Cupo**
deben aclarar que el cupo es informativo solo cuando el origen es `TERCERO`.
