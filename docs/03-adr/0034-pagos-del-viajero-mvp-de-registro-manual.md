# ADR-0034 — Pagos del viajero: MVP de registro manual, saldo calculado e historial inmutable

- **Estado:** Propuesto
- **Fecha:** 2026-11-21
- **Decide:** propietario, a propuesta de `arquitecto`
- **Consultados:** `analista-producto` y `experto-turismo` (a través de
  [HU-payments-1](../01-producto/03-historias/HU-payments-1.md), T-327). **Pendientes antes de
  aceptar:** `auditor-seguridad` (tablas de agencia, privilegios, disparador; sin recortar vueltas,
  R13) y `experto-turismo` (estados de cobro y fecha límite de cobro, §3)
- **Tarea:** T-328 (eje C del [roadmap JD Tours](../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md)).
  Habilita T-329 (migración), T-330 (API), T-331 y T-332 (pantallas)
- **Amplía:** [ADR-0024](0024-de-cotizacion-aceptada-a-archivo-de-viaje.md) (el `TravelFile` es el
  ancla; usa su `privilegios_declarados` y su patrón de puertos). No supersede nada.

---

## Contexto

**Fuerza: dinero propio en riesgo, nombrado por el cliente.** La agencia piloto pide sobre todo saber
«quién pagó y quién debe». Hoy lo resuelve con etiquetas de WhatsApp Business y una hoja de cálculo:
el estado de pago queda en la persona, no dice cuánto falta y nadie avisa del vencimiento. Mientras
tanto la agencia tiene que pagarle el total al mayorista en una fecha fija (ADR-0024 §3.4). Un saldo
sin cobrar antes de esa fecha lo financia la agencia.

En `main` el archivo de viaje ya tiene su total (`travel_files.venta_unidades` + `moneda_iso`, copia
inmutable de la versión aceptada), pero el contexto `payments` está «diseñado, sin código»: no existe
ningún registro de lo que pagó el viajero. La «Etiqueta» del chat («Pagado», «Pago pendiente») es ayuda
visual y **no calcula saldo** (lenguaje ubicuo).

La historia ([HU-payments-1](../01-producto/03-historias/HU-payments-1.md)) dice **qué** se construye y
deja supuestos explícitos para las preguntas al dueño. Este ADR decide **cómo**, para que T-329 y T-330
no improvisen.

## Opciones consideradas

### A — Columna `pagado_unidades` (o estado de pago) en `travel_files`
- **Gana:** una columna y un botón.
- **Cuesta:** el saldo se vuelve un valor editable que cualquiera sobrescribe; no hay historial, ni
  autor, ni forma de deshacer un error sin perder el rastro. `payments` escribiría una tabla de
  `booking` (R4).
- **Cierra:** la conciliación con el dueño («20 de 20», HU §Cómo sabemos), devoluciones, cuotas y
  pasarela. Deshacerlo después exige reconstruir pagos que nunca se guardaron.

### B — Libro de movimientos de cobro insert-only en `payments`; saldo derivado (elegida)
- **Gana:** el saldo es una suma, nunca un dato que alguien edita; el historial es la auditoría; un
  error se corrige con un reverso visible; cuotas, otra moneda y pasarela se añaden como columnas o
  tablas nuevas sin migrar lo que hay.
- **Cuesta:** un módulo nuevo, dos tablas con RLS, un disparador de inmutabilidad, tres permisos, un
  puerto hacia `booking`.
- **Cierra:** nada que no se pueda abrir después.

### C — `payments` completo: plan de pagos, cuotas, pasarela y conciliación
- **Gana:** el producto entero del mapa de contextos.
- **Cuesta:** semanas, un proveedor de pagos (puerto + adaptador + ADR), webhooks firmados, alcance
  PCI y decisiones que el dueño todavía no ha respondido (cuotas, monedas).
- **Cierra:** la oportunidad de aprender con el registro manual antes de modelar lo caro.

## Decisión

**B.** Un libro de movimientos que solo crece, por agencia, colgado del archivo de viaje; saldo y
estado de cobro calculados en el servidor en cada lectura. Lo que no está en §8 «entra» no se construye.

### 1. Módulo y fronteras (R4)

`payments` (carpeta nueva de módulos de la API; aún no existe) con sus cuatro capas. Nombres de código según el lenguaje ubicuo:
`Payment` (pago), `Refund` (devolución), `Reversal` (reverso), `CollectionStatus` (estado de cobro),
`collectionDueDate` (fecha límite de cobro).

- **Lo que `payments` necesita del archivo** lo pide por un puerto **declarado por él**, en
  `puertos-hacia-booking.ts` (en los puertos compartidos de la API), implementado en `booking-puertos.module.ts`,
  con la misma forma que `PuertoArchivoDeUnAviso` (recibe `tx` y `tenantId`, nunca abre otra
  transacción): `PuertoArchivoParaCobro.leer(tx, tenantId, travelFileId)` y `.listarAbiertos(tx,
  tenantId, filtros)` devuelven `{ id, numero, contactoId, destino, fechaSalida, estado,
  ventaUnidades, monedaIso }` o `null`. **Nunca neto ni margen** (siguen tras
  `cotizacion.ver_neto_y_margen`).
- **`booking` no se entera de nada en el MVP.** El estado de cobro no se guarda en el archivo: lo
  calcula `payments` al leer. Los estados `ABONADA_AL_PROVEEDOR`/`PAGADA_AL_PROVEEDOR` son del flujo
  opuesto (agencia → mayorista) y no se tocan.
- **No hay vista SQL que cruce módulos.** La vista «quién pagó y quién debe» (T-332) la sirve
  `payments`: archivos por el puerto + una consulta agrupada sobre `pagos` por `travel_file_id`.

### 2. El libro: tabla `pagos`

Una fila por movimiento. Tres tipos, **invariantes del dominio** (enum de Postgres
`tipo_movimiento_de_cobro`, no política de agencia):

| Tipo | Qué es | Efecto en el saldo |
|---|---|---|
| `PAGO` | Dinero del viajero a la agencia. El anticipo es el primer pago, no un tipo aparte | resta |
| `DEVOLUCION` | Dinero que la agencia devolvió de verdad al viajero | suma |
| `REVERSO` | Anula un `PAGO` o una `DEVOLUCION` registrado por error. No mueve dinero | neutraliza el original |

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` | PK; `UNIQUE (id, tenant_id)` |
| `tenant_id` | `uuid NOT NULL` | FK a `tenants ON DELETE CASCADE` |
| `travel_file_id` | `uuid NOT NULL` | FK compuesta, ver abajo |
| `tipo` | `tipo_movimiento_de_cobro NOT NULL` | |
| `monto_unidades` | `bigint NOT NULL` | `CHECK (monto_unidades BETWEEN 1 AND 999999999999999)`. Siempre positivo: el signo lo da el tipo |
| `moneda_iso` | `char(3) NOT NULL` | Igual a la del archivo, por la FK |
| `pagado_el` | `date NULL` | Fecha de calendario en que el dinero llegó (o salió). Nula solo en `REVERSO` (CHECK) |
| `medio` | `varchar(20) NULL` | Catálogo cerrado por CHECK (§2.3). Nulo solo en `REVERSO` (CHECK) |
| `referencia` | `varchar(100) NULL` | Número de transacción o de comprobante. Texto, sin adjunto |
| `nota` | `varchar(500) NULL` | Texto libre de la agencia |
| `reverso_de_id` | `uuid NULL` | Solo y siempre en `REVERSO` (CHECK); FK de abajo |
| `motivo_reverso` | `varchar(500) NULL` | Obligatorio en `REVERSO` (CHECK) |
| `clave_idempotencia` | `uuid NOT NULL` | `UNIQUE (tenant_id, clave_idempotencia)` (§4) |
| `registrado_por` | `uuid NOT NULL` | FK `(registrado_por, tenant_id) → usuarios (id, tenant_id)` |
| `registrado_en` | `timestamptz(3) NOT NULL DEFAULT now()` | Instante de registro, UTC (R9) |

Índice `(tenant_id, travel_file_id, registrado_en, id)`. Índice único parcial
`(tenant_id, reverso_de_id) WHERE reverso_de_id IS NOT NULL`: **un movimiento se reversa una sola vez**.

#### 2.1 Foráneas compuestas

- `(travel_file_id, tenant_id, moneda_iso) → travel_files (id, tenant_id, moneda_iso)`, `NO ACTION`.
  Exige una clave nueva `UNIQUE (id, tenant_id, moneda_iso)` en `travel_files` (redundante con su PK,
  barata). Así un pago **no puede** apuntar al archivo de otra agencia ni estar en otra moneda, aunque
  falle la aplicación.
- `(reverso_de_id, tenant_id, travel_file_id, monto_unidades, moneda_iso) → pagos (id, tenant_id,
  travel_file_id, monto_unidades, moneda_iso)`, `NO ACTION`, con su `UNIQUE` sobre esas cinco
  columnas. El reverso queda atado por la base al **mismo archivo, la misma agencia, el mismo monto y
  la misma moneda** que el original.
- Que un reverso no se reverse lo comprueba un disparador `BEFORE INSERT` (`pagos_validar_alta`,
  patrón `versiones_cotizacion_validar_alta`): si `reverso_de_id` apunta a un `REVERSO`, rechaza.

#### 2.2 Moneda y TRM

**El movimiento va en la moneda del archivo; otra moneda se rechaza** (FK de §2.1 y error de dominio
tipado antes). Si el viajero pagó en pesos un archivo en USD, el asesor registra el equivalente en USD
y la nota dice cuántos pesos y a qué tasa. **Fuera del MVP**: guardar el monto recibido, su moneda y la
TRM congelada en el pago (`monto_recibido_unidades`, `moneda_recibida`, `trm_*` como en
`versiones_cotizacion`), que es la cola de ADR-0024 («la tasa se congela en cada abono»). Se añaden
como columnas nulas sin tocar `moneda_iso`, que seguirá siendo la del archivo. El piloto vende en COP.

#### 2.3 Medio de pago: catálogo cerrado por CHECK, no tabla por agencia

`medio ∈ {TRANSFERENCIA, EFECTIVO, TARJETA, CONSIGNACION, OTRO}`, como `roles_permisos_del_catalogo`
y los colores de `etiquetas` (ampliar es `DROP/ADD CONSTRAINT … NOT VALID` + `VALIDATE`, sin
reescribir). **Por qué no tabla por agencia (R12):** la categoría del medio es igual en toda agencia y
es lo que necesitarán caja y conciliación (efectivo frente a banco); lo que cada agencia nombra
distinto es la **cuenta** («Bancolombia ahorros», «Nequi»), y eso hoy cabe en `referencia`. La tabla
`medios_de_pago` por agencia, con su `categoria` de este catálogo, se añade cuando una agencia pida
sus cuentas (cola), sin migrar filas. Se aparta del supuesto de HU-payments-1 («lista por agencia»)
porque la historia tampoco tiene pantalla para editarla: una tabla sembrada e inmutable es un enum
con más superficie de RLS.

#### 2.4 Sin datos de tarjeta

Ni PAN, ni vencimiento, ni CVV, ni nombre del tarjetahabiente. Guardarlos metería al sistema en el
alcance de PCI DSS sin ninguna necesidad: el registro manual solo anota que el dinero llegó. La API
rechaza (error tipado) una `referencia` o `nota` que contenga una secuencia de 13 a 19 dígitos que pase
Luhn. Es una red contra el asesor que pega el número de la tarjeta, no una garantía.

### 3. Saldo y estado de cobro: derivados, en el servidor

Funciones puras en `cobro.ts` (nuevo, en el paquete `domain`), sobre `Money` (enteros `bigint`, sin `float`, sin
redondeo: solo sumas y restas en la misma moneda):

```
vigentes = movimientos PAGO y DEVOLUCION sin un REVERSO que los apunte
pagado   = Σ PAGO vigentes − Σ DEVOLUCION vigentes
saldo    = total del archivo − pagado
```

Nada de esto es columna. El cliente HTTP no envía saldo, estado ni autor; si los envía, el contrato
los descarta.

**Situación del saldo** (cuánto; para el detalle del archivo), umbrales exactos en unidades:

| Situación | Condición |
|---|---|
| `SIN_PAGOS` | `pagado = 0` |
| `PARCIAL` | `0 < pagado < total` |
| `PAGADO` | `saldo = 0` |
| `SALDO_A_FAVOR` | `saldo < 0` (sobrepago; se muestra «Saldo a favor $ X»; sin devolución automática) |

**Estado de cobro** (`CollectionStatus`; a tiempo; para la vista y los filtros de T-332), con «hoy» en
la zona horaria de la agencia (R9):

| Estado | Condición |
|---|---|
| `AL_DIA` | `saldo ≤ 0` |
| `SALDO_PENDIENTE` | `saldo > 0` y `hoy ≤ fecha límite de cobro` |
| `VENCIDO` | `saldo > 0` y `hoy > fecha límite de cobro` |
| `CANCELADO` | el archivo está `CANCELADO`; no cuenta como deudor; si `pagado > 0`, «Pagado sin devolver $ X» |

El estado de cobro es **del archivo**, no del contacto ni de la conversación. «Al día» nunca se
muestra como «Confirmada»: confirmar es del mayorista.

**Fecha límite de cobro.** Por defecto, `fecha_salida − 30 días`. Editable por archivo en una segunda
tabla, `plazos_de_cobro (tenant_id, travel_file_id, vence_el date, actualizado_por, actualizado_en)`,
PK `(tenant_id, travel_file_id)`, FK compuesta al archivo y al usuario; sin fila, rige el valor por
defecto. Los 30 días son **constante** en el MVP: hacerlos política por agencia (R12) espera a una
segunda agencia que lo pida, como el umbral de 24 h de ADR-0024 §3.6 (se aparta del supuesto «N por
agencia» de la historia por ese motivo). Si la fecha límite cae después del `pago_total_vence_en` de
alguna reserva, la API avisa y no lo impide.

### 4. Reglas de registro e idempotencia (R5)

- **Idempotencia.** El cliente genera `claveIdempotencia` (uuid) al abrir el formulario y la reutiliza
  en cada reintento, como en el envío de mensajes. `INSERT … ON CONFLICT (tenant_id,
  clave_idempotencia) DO NOTHING`; si no insertó, relee la fila: mismo contenido (tipo, archivo, monto,
  moneda, fecha, medio, `reverso_de_id`) → misma respuesta `200`; contenido distinto → `409` tipado,
  nada se crea. Doble clic y reintento de red producen **un** movimiento.
- **Serialización por archivo.** Toda escritura en `pagos` de un archivo toma
  `pg_advisory_xact_lock` sobre `(tenant_id, travel_file_id)` antes de validar. Dos pagos simultáneos
  quedan los dos; la regla que depende de la suma (abajo) no tiene carrera.
- **Reglas de dominio**, con errores tipados: monto entero positivo dentro del rango; moneda del
  archivo; `pagado_el` no posterior a hoy en la zona de la agencia; archivo `CANCELADO` no admite
  `PAGO` (sí `DEVOLUCION` y `REVERSO`); una `DEVOLUCION` no deja `pagado < 0`; un `REVERSO` de un
  `PAGO` tampoco (hay que reversar antes la devolución); sobrepago permitido si la petición trae
  `confirmarSobrepago: true`.
- **Corregir un error** = reversar y registrar el correcto. No hay `UPDATE` ni `DELETE` en ninguna
  ruta.

### 5. Inmutabilidad: privilegio y disparador

- `privilegios_declarados` (ADR-0024 §5.2): `pagos` → **solo `viajapro_app`, `{SELECT,INSERT}`**;
  `plazos_de_cobro` → solo `viajapro_app`, `{SELECT,INSERT,UPDATE}`. `viajapro_webhook`,
  `viajapro_altas` y `viajapro_identidad` sin ningún privilegio; nadie tiene `TRUNCATE`. La guardia
  de arranque del trabajador añade las dos tablas a su lista.
- **Además** del privilegio, `pagos` lleva el disparador `pagos_inmutables` `BEFORE UPDATE OR DELETE`
  y `BEFORE TRUNCATE`, calcado de `versiones_cotizacion_inmutables` (incluida la única salida: el
  dueño de la tabla purgando un tenant declarado en `viajapro.purga_de_tenants`). A diferencia de
  `reserva_cambios_estado`, aquí van los dos: es dinero, y el disparador sobrevive a una migración
  futura que amplíe privilegios por error o a un script que corra como dueño.

### 6. Permisos y auditoría

- Tres permisos nuevos en el catálogo cerrado (`roles_permisos_del_catalogo` y `PERMISOS` en
  `packages/contracts/src/identidad.ts`): **`cobro.ver`** (saldo, historial y vista), **`cobro.registrar`**
  (pagos, devoluciones y fecha límite de cobro) y **`cobro.reversar`** (reversos). Se usa `cobro.*` y
  no `pagos.*` porque nombra el área («Cobros» en el menú) y cubre devoluciones y plazos.
- Siembra (en las agencias existentes y en `packages/database/prisma/siembra-de-tenant.ts`):
  `DUENO` los tres; `ASESOR` `cobro.ver` y `cobro.registrar`; `OPERACIONES` solo `cobro.ver`
  (supuesto, sin verificar). Cada agencia lo cambia en sus roles (ADR-0011).
- **Alcance de lo visible:** en el MVP, quien tiene `cobro.ver` ve los cobros de **toda** su agencia,
  igual que `archivo.ver` hoy. Que el asesor vea solo lo suyo es el eje de niveles de acceso (T-339) y
  se aplicará igual a archivos y cobros.
- **Auditoría:** la fila es la auditoría (`registrado_por`, `registrado_en`, inmutable). Los
  `registros_auditoria`, logs y outbox llevan **solo ids, tipo, monto y moneda**: nunca `nota`,
  `referencia` ni nombre del contacto.

### 7. Eventos de dominio

En la misma transacción que el `INSERT`, al outbox, payload **solo con identificadores** (regla de
ADR-0024 §1; el consumidor relee bajo RLS):

- `payments.pago_registrado` (`PaymentRecorded`) — `{ v: 1, pagoId, travelFileId, tipo }` para
  `PAGO` y `DEVOLUCION`.
- `payments.pago_reversado` (`PaymentReversed`) — `{ v: 1, pagoId, reversoDeId, travelFileId }`.

**Ningún consumidor en el MVP.** Se escriben ahora porque cuestan un `INSERT` y son el contrato de
T-333 («Hoy» y la campana) y de los recordatorios futuros, sin reabrir el caso de uso. El
`PaymentReceived` del mapa de contextos queda para la confirmación de una pasarela.

### 8. Alcance

**Entra:** `pagos` y `plazos_de_cobro` con RLS; registrar pago, devolución y reverso, idempotentes;
saldo, situación y estado de cobro calculados; fecha límite por defecto y editable; tres permisos; dos
eventos; rutas en `cobros.ts` (nuevo, en el paquete `contracts`):

- `POST /api/v1/archivos/:id/pagos` — pago o devolución (`cobro.registrar`).
- `POST /api/v1/archivos/:id/pagos/:pagoId/reverso` — con motivo (`cobro.reversar`).
- `PUT  /api/v1/archivos/:id/plazo-de-cobro` — fija la fecha límite (`cobro.registrar`).
- `GET  /api/v1/archivos/:id/cobro` — total, pagado, saldo, situación, estado e historial (`cobro.ver`).
- `GET  /api/v1/cobros` — la vista de T-332, totales agrupados **por moneda** (`cobro.ver`).

**Fuera, explícitamente:**

| Fuera | Por qué |
|---|---|
| Pasarela de pagos, links de pago, reembolsos a la pasarela | Tercero con webhooks, firma, alcance PCI: puerto + adaptador + ADR propio. El dueño no lo ha pedido |
| Recordatorios de saldo por WhatsApp | Plantilla *utility* aprobada, opt-in, coste por mensaje y la ventana de 24 h (ADR-0018): tarea de cola, consumidor de `payments.pago_*` |
| Plan de pagos y cuotas (`PaymentPlan`, `Installment`) | El supuesto del dueño es pagos libres + una fecha límite. Con cuotas, «Vencido» se mide por cuota: tabla nueva, el libro no cambia |
| Conciliación bancaria | Requiere extractos o integración con bancos; sin evidencia de necesidad |
| Facturación electrónica, recibos, IVA | Fiscal y ligado a ADR-0023 (comisión como ingreso propio, Propuesto); otro ADR |
| Multimoneda con TRM automática | §2.2; consultar la TRM a un tercero es puerto + ADR (ADR-0024) |
| Adjuntar el comprobante (imagen o PDF) | S3, política de acceso y datos personales: tarea propia |
| Cobro por pasajero | Cambia la unidad de saldo, no el registro: historia aparte |

## Seguridad entre agencias

**Lo que T-329 debe probar en `aislamiento.spec.ts`** (ampliado, auditoría sin recortar vueltas, R13):

1. `pagos` y `plazos_de_cobro` con `tenant_id NOT NULL`, RLS habilitada y **forzada** por
   `aplicar_aislamiento_tenant`, en la lista de tablas de negocio esperadas, ninguna en
   `excepciones_rls`, `tablas_sin_aislamiento` vacío.
2. **Lectura cruzada:** con `app.current_tenant` = A, cero filas de B en las dos tablas.
3. **Escritura cruzada:** `INSERT` con `tenant_id` = B estando en A falla por `WITH CHECK`.
4. **FK compuesta:** un pago de A hacia un archivo de B falla aunque se fije `tenant_id` = B (la
   política lo rechaza) y aunque se conozca el id; un reverso de A no puede apuntar a un pago de B
   ni a uno de otro archivo, monto o moneda; un pago en moneda distinta de la del archivo falla.
5. **Insert-only:** con `viajapro_app`, `UPDATE`, `DELETE` y `TRUNCATE` sobre `pagos` fallan por
   privilegio; como dueño de la tabla fallan por el disparador (salvo la purga declarada); los otros
   tres roles de login no tienen ningún privilegio sobre las dos tablas.
6. Un segundo reverso del mismo movimiento y el reverso de un reverso fallan en la base.
7. La matriz de privilegios de las dos tablas coincide con §5 y la guardia del trabajador aborta si
   `viajapro_webhook` gana alguno.

**Dinero:** no hay redondeo (solo sumas y restas de enteros en una moneda). Desbordamiento: `bigint`
en la base, `bigint` en `Money`, texto (`Dinero.unidades`) en el contrato; el tope de `10¹⁵ − 1` por
movimiento deja margen de sobra para que la suma de un archivo no se acerque a `2⁶³`.

**Qué revisa `auditor-seguridad`:** las dos tablas y sus FK; la nueva clave en `travel_files`; las
filas de `privilegios_declarados`; los dos disparadores (`SET search_path = ''`, `REVOKE` a `PUBLIC`);
la ampliación del catálogo de permisos y su siembra; que el puerto hacia `booking` reciba el tenant de
la sesión y no del cuerpo; que logs y outbox no lleven `nota` ni `referencia`. Ninguna función
`SECURITY DEFINER` nueva.

## Plan de implementación

| PR | Contenido | Revisión |
|---|---|---|
| **T-329** — Migración | Enum, `pagos`, `plazos_de_cobro`, `UNIQUE (id, tenant_id, moneda_iso)` en `travel_files`, FK, CHECK, índices, disparadores, `privilegios_declarados`, permisos `cobro.*` y su siembra, cinturón; `aislamiento.spec.ts` y guardia. Sin código de aplicación. Ruta protegida (R11) | `datos` + `auditor-seguridad` |
| **T-330** — Dominio y API | `cobro.ts` (nuevo, en el paquete `domain`) (saldo, situación, estado, fecha límite) con pruebas de los umbrales; contratos `cobros.ts`; módulo `payments`; `PuertoArchivoParaCobro` en `booking`; las cinco rutas; idempotencia; eventos. Absorbe la mitad «abonos y saldo» de T-283 | `backend` |
| **T-331**, **T-332** — Web | Registrar y ver el saldo en el archivo; vista «quién pagó y quién debe» | `frontend` |

T-330 depende de T-329; las pantallas, de T-330. La vista de T-332 tiene una meta de rendimiento
(HU: 2.000 archivos, 10.000 pagos, p95 < 500 ms) que se mide allí; el índice de §2 es el punto de
partida.

## Cola (no bloquea)

| Hallazgo | Dueño |
|---|---|
| Monto recibido, moneda recibida y TRM congelada en el pago (§2.2) | `arquitecto` + `datos` |
| Tabla `medios_de_pago` por agencia con `categoria` del catálogo (§2.3) | `datos` |
| Días de la fecha límite por defecto como política por agencia (§3) | `analista-producto` |
| Historial de cambios de la fecha límite de cobro (hoy solo el último autor) | `datos` |
| ¿Cifrar `nota` y `referencia`? Hoy no son PII sensible según R10, pero son texto libre | `auditor-seguridad` |
| Primer consumidor de `payments.pago_*`: «Hoy» y la campana (T-333) | `backend` |

## Consecuencias

### Positivas
- «Quién pagó y quién debe» sale de una suma que nadie puede editar, con autor e instante.
- El estado de pago vive en el viaje, no en la persona ni en una etiqueta.
- La base impide lo que más duele: pagos cruzados entre agencias, en otra moneda, editados o
  borrados, reversos dobles o de otro monto.
- Cuotas, otra moneda, cuentas por agencia y pasarela se añaden sin migrar el libro.

### Negativas
- Dos tablas más con RLS y un disparador: superficie que `auditor-seguridad` revisa.
- El saldo se calcula en cada lectura; si el volumen crece mucho más que el de la HU, hará falta un
  agregado materializado (que sería caché, nunca fuente).
- Un error se corrige con dos filas más (reverso y pago correcto): el historial crece y la pantalla
  debe mostrarlo claro.
- Dos desviaciones de los supuestos de HU-payments-1 (medio de pago y días por defecto), justificadas
  en §2.3 y §3, que el propietario puede revertir sin migrar el libro.
- `payments` añade una clave a `travel_files`: una dependencia de esquema hacia `booking`.

### Qué habría que cambiar para revertir esto
- Antes de datos reales: borrar el módulo, las dos tablas, el enum, la clave de `travel_files`, sus
  filas de `privilegios_declarados` y los permisos. Con pagos reales registrados, el libro no se
  borra: se supersede este ADR.

## Cuándo revisar esta decisión

- Cuando el dueño de JD Tours responda las preguntas del roadmap §4 y contradiga un supuesto
  (cuotas, monedas, quién registra).
- Cuando el piloto venda su primer archivo en USD cobrado en pesos.
- Cuando una agencia pida cobrar en línea: ADR de pasarela.
- Si la vista de T-332 no cumple el p95 con el volumen de la HU.

## Enlaces

- [HU-payments-1](../01-producto/03-historias/HU-payments-1.md) — qué y supuestos.
- [ADR-0024](0024-de-cotizacion-aceptada-a-archivo-de-viaje.md) — `TravelFile`, `privilegios_declarados`, eventos y puertos.
- [ADR-0003](0003-multitenancy.md), [ADR-0008](0008-resolucion-de-tenant-en-webhooks-entrantes.md) — RLS y roles.
- [ADR-0006](0006-parametrizacion-y-extensibilidad.md) — qué se parametriza.
- [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md) — catálogo de permisos y roles por agencia.

---

> Un ADR aceptado no se edita: si cambia, se escribe uno nuevo que lo supersede.
