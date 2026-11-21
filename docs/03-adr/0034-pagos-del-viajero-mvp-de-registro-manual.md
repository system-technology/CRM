# ADR-0034 — Pagos del viajero: MVP de registro manual, saldo calculado e historial inmutable

- **Estado:** Propuesto
- **Fecha:** 2026-11-21
- **Decide:** propietario, a propuesta de `arquitecto`
- **Consultados:** `analista-producto` y `experto-turismo` (a través de
  [HU-payments-1](../01-producto/03-historias/HU-payments-1.md), T-327); `auditor-seguridad` y
  `experto-turismo` (una vuelta sobre este ADR, 2026-11-21, aplicada aquí: ver «Historial de
  revisión»). Queda la auditoría de seguridad de la migración de T-329, sin recortar vueltas (R13)
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
de la versión aceptada), pero el contexto `payments` está «diseñado, sin código»: no existe ningún
registro de lo que pagó el viajero. La «Etiqueta» del chat («Pagado», «Pago pendiente») es ayuda
visual y **no calcula saldo** (lenguaje ubicuo).

La historia ([HU-payments-1](../01-producto/03-historias/HU-payments-1.md)) dice **qué** se construye y
deja supuestos explícitos para las preguntas al dueño (roadmap §4). Este ADR decide **cómo**, para que
T-329 y T-330 no improvisen.

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
- **Cuesta:** un módulo nuevo, tres tablas con RLS, dos disparadores, tres permisos, un puerto hacia
  `booking`.
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

Módulo nuevo `payments` en `apps/api/src/modules/`, con sus cuatro capas. Nombres de código según el
lenguaje ubicuo: `Payment` (pago), `Refund` (devolución), `Reversal` (reverso), `TotalAdjustment`
(ajuste del total), `Penalty` (penalidad), `CollectionStatus` (estado de cobro), `collectionDueDate`
(fecha límite de cobro).

- **Lo que `payments` necesita del archivo** lo pide por un puerto **declarado por él**, en
  `puertos-hacia-booking.ts` (nuevo, en `apps/api/src/shared/puertos/`), implementado en
  `booking-puertos.module.ts`, con la misma forma que `PuertoArchivoDeUnAviso` (recibe `tx` y
  `tenantId`, nunca abre otra transacción): `PuertoArchivoParaCobro.leer(tx, tenantId, travelFileId)`
  y `.listarAbiertos(tx, tenantId, filtros)` devuelven `{ id, numero, contactoId, destino,
  fechaSalida, estado, ventaUnidades, monedaIso, creadoEn }` o `null`. **Nunca neto ni margen**
  (siguen tras `cotizacion.ver_neto_y_margen`).
- **`booking` no se entera de nada en el MVP.** El estado de cobro no se guarda en el archivo: lo
  calcula `payments` al leer. Los estados `ABONADA_AL_PROVEEDOR`/`PAGADA_AL_PROVEEDOR` son del flujo
  opuesto (agencia → mayorista) y no se tocan.
- **No hay vista SQL que cruce módulos.** La vista «quién pagó y quién debe» (T-332) la sirve
  `payments`: archivos por el puerto + una consulta agrupada sobre `pagos` por `travel_file_id`.

### 2. El libro: tabla `pagos`

Una fila por movimiento. Cinco tipos, **invariantes del dominio** (enum de Postgres
`tipo_movimiento_de_cobro`, no política de agencia):

| Tipo | Qué es | Archivo | Signo del monto |
|---|---|---|---|
| `PAGO` | Dinero del viajero a la agencia. El anticipo es el primer pago, no un tipo aparte | `ABIERTO` | `> 0` |
| `DEVOLUCION` | Dinero que la agencia devolvió de verdad al viajero | cualquiera | `> 0` |
| `AJUSTE` | Cargo adicional (`> 0`) o descuento (`< 0`) sobre el total vendido, con motivo. No edita la venta | `ABIERTO` | `≠ 0` |
| `PENALIDAD` | Lo que la agencia retiene al cancelar, con motivo | `CANCELADO` | `> 0` |
| `REVERSO` | Anula otro movimiento registrado por error. No mueve dinero | cualquiera | igual al original |

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` | PK; `UNIQUE (id, tenant_id)` |
| `tenant_id` | `uuid NOT NULL` | FK a `tenants ON DELETE CASCADE` |
| `travel_file_id` | `uuid NOT NULL` | FK compuesta, §2.1 |
| `tipo` | `tipo_movimiento_de_cobro NOT NULL` | |
| `monto_unidades` | `bigint NOT NULL` | `CHECK` por tipo: valor absoluto entre 1 y 999999999999999; negativo solo en `AJUSTE` (y en el `REVERSO` de un descuento, que copia el monto) |
| `moneda_iso` | `char(3) NOT NULL` | Igual a la del archivo, por la FK |
| `pagado_el` | `date NULL` | Fecha de calendario en que el dinero llegó (o salió). Obligatoria en `PAGO` y `DEVOLUCION`, nula en el resto (CHECK) |
| `medio` | `varchar(20) NULL` | Catálogo cerrado (§2.3). Obligatorio en `PAGO` y `DEVOLUCION`, nulo en el resto (CHECK) |
| `pagador_id` | `uuid NULL` | Solo en `PAGO` (CHECK). Quién pagó, si no es el titular: FK `(pagador_id, tenant_id) → contactos (id, tenant_id)`, `NO ACTION` |
| `referencia` | `varchar(100) NULL` | Número de transacción o de comprobante. Texto, sin adjunto |
| `nota` | `varchar(500) NULL` | Texto libre de la agencia |
| `nota_tachada_en` | `timestamptz(3) NULL` | §2.4 |
| `motivo` | `varchar(500) NULL` | Obligatorio en `AJUSTE`, `PENALIDAD` y `REVERSO` (CHECK) |
| `reverso_de_id` | `uuid NULL` | Solo y siempre en `REVERSO` (CHECK); FK de §2.1 |
| `clave_idempotencia` | `uuid NOT NULL` | `UNIQUE (tenant_id, clave_idempotencia)` (§4) |
| `registrado_por` | `uuid NOT NULL` | FK `(registrado_por, tenant_id) → usuarios (id, tenant_id)` |
| `registrado_en` | `timestamptz(3) NOT NULL DEFAULT now()` | Instante de registro, UTC (R9) |

El monto es **lo que pagó el cliente**, no lo que llegó a la cuenta tras la comisión del medio
(tarjeta, PSE, link): esa comisión es gasto de la agencia y no cambia lo que el viajero debe.

Índice `(tenant_id, travel_file_id, registrado_en, id)`. Índice único parcial
`(tenant_id, reverso_de_id) WHERE reverso_de_id IS NOT NULL`: **un movimiento se reversa una sola vez**.

#### 2.1 Foráneas compuestas y el total del archivo

- `(travel_file_id, tenant_id, moneda_iso) → travel_files (id, tenant_id, moneda_iso)`, `NO ACTION`.
  Exige una clave nueva `UNIQUE (id, tenant_id, moneda_iso)` en `travel_files`. Es posible sin romper
  nada: `id` ya es único (PK y `travel_files_id_tenant_id_key`, de
  `20261117120000_archivo_de_viaje_reservas_y_entregas`), así que ninguna fila existente puede violar
  la clave nueva, y las foráneas actuales siguen apuntando a la de dos columnas. Así un movimiento
  **no puede** apuntar al archivo de otra agencia ni estar en otra moneda, aunque falle la aplicación.
- `(reverso_de_id, tenant_id, travel_file_id, monto_unidades, moneda_iso) → pagos (id, tenant_id,
  travel_file_id, monto_unidades, moneda_iso)`, `NO ACTION`, con su `UNIQUE` sobre esas cinco
  columnas. El reverso queda atado por la base al **mismo archivo, la misma agencia, el mismo monto y
  la misma moneda** que el original.
- Que un reverso no se reverse lo comprueba el disparador `BEFORE INSERT` `pagos_validar_alta`
  (patrón `versiones_cotizacion_validar_alta`): si `reverso_de_id` apunta a un `REVERSO`, rechaza.
- **El total vendido no cambia nunca.** Hoy ADR-0024 lo declara copia inmutable, pero en la base
  `viajapro_app` tiene `UPDATE` sobre `travel_files` y nada lo impide. Como el saldo se calcula sobre
  `venta_unidades` y la FK sobre `moneda_iso`, T-329 añade el disparador
  `travel_files_venta_inmutable` (`BEFORE UPDATE`, `SECURITY INVOKER`, `SET search_path = ''`,
  `REVOKE ALL … FROM PUBLIC`) que **rechaza** todo cambio de `id`, `tenant_id`, `venta_unidades` o
  `moneda_iso`. Ningún caso de uso actual los escribe. Lo que cambie el total va al libro como
  `AJUSTE`.

#### 2.2 Moneda y TRM (decidido)

**Una sola moneda por archivo; el movimiento va en ella y otra se rechaza** (FK de §2.1 y error de
dominio tipado antes). El piloto vende en COP. Si un día el viajero paga en pesos un archivo en USD, el
asesor registra el equivalente en USD y la nota dice cuántos pesos y a qué tasa. Guardar el monto
recibido, su moneda y la TRM congelada en el pago queda **fuera del MVP** (cola, depende de la respuesta
del dueño): columnas nulas nuevas, sin tocar `moneda_iso`, que seguirá siendo la del archivo.

#### 2.3 Medio de pago: catálogo cerrado por CHECK, no tabla por agencia

`medio ∈ {TRANSFERENCIA, EFECTIVO, TARJETA, CONSIGNACION, BILLETERA_DIGITAL, PSE, LINK_DE_PAGO,
OTRO}`, como `roles_permisos_del_catalogo` y los colores de `etiquetas` (ampliar es `DROP/ADD
CONSTRAINT … NOT VALID` + `VALIDATE`, sin reescribir). **Por qué no tabla por agencia (R12):** la
categoría del medio es igual en toda agencia y es lo que necesitarán caja y conciliación; lo que cada
agencia nombra distinto es la **cuenta** («Bancolombia ahorros», «Nequi»), y eso hoy cabe en
`referencia`. La tabla `medios_de_pago` por agencia, con su `categoria` de este catálogo, se añade
cuando una agencia pida sus cuentas (cola), sin migrar filas.

#### 2.4 Sin datos de tarjeta; `nota` y `referencia` sin cifrar (decidido)

- Ni PAN, ni vencimiento, ni CVV, ni nombre del tarjetahabiente: guardarlos metería al sistema en el
  alcance de PCI DSS sin necesidad; el registro manual solo anota que el dinero llegó.
- La API rechaza una `referencia` o `nota` que, **tras quitar espacios, guiones y puntos**, contenga
  13 a 19 dígitos seguidos que pasen Luhn. El error tipado **no repite el valor** ni se registra en
  logs. Es una red contra el asesor que pega la tarjeta, no una garantía.
- `nota` y `referencia` van **en claro bajo RLS**: no son PII sensible según R10 (pasaporte, fecha de
  nacimiento), y como `motivos_de_perdida.etiqueta` y `etiquetas.nombre` nunca salen a logs, outbox ni
  auditoría. La fila se conserva entera porque es **soporte contable** del cobro (plazo legal de
  conservación: supuesto, sin verificar con el contador).
- **Tachar una nota** que no debía estar ahí (un dato que se coló) no borra la fila ni toca el monto:
  es un procedimiento de operación, no una ruta de la API. El rol dueño de la tabla, con la variable de
  sesión `viajapro.tachado_de_notas` con los ids declarados, ejecuta un `UPDATE` que `pagos_inmutables`
  admite **solo** si pone `nota` y `referencia` en nulo, fija `nota_tachada_en` y deja todo lo demás
  igual (mismo patrón que la salida de purga de `versiones_cotizacion_inmutables`). La pantalla
  muestra «Nota tachada el …». Queda en la bitácora.

### 3. Saldo y estado de cobro: derivados, en el servidor

Funciones puras en `cobro.ts` (nuevo, en el paquete `domain`), sobre `Money` (enteros `bigint`, sin
`float`, sin redondeo: solo sumas y restas en la misma moneda):

```
vigente     = movimiento sin un REVERSO que lo apunte
pagado      = Σ PAGO vigentes − Σ DEVOLUCION vigentes
total       = archivo ABIERTO:    venta_unidades + Σ AJUSTE vigentes
              archivo CANCELADO:  Σ PENALIDAD vigentes   (la venta y sus ajustes dejan de exigirse)
saldo       = total − pagado
```

Un archivo cancelado cierra en cero cuando lo pagado menos lo devuelto es igual a la penalidad
retenida. Reglas: el total de un archivo abierto no queda negativo; una `PENALIDAD` no supera lo
pagado neto (no se cobra una penalidad que el cliente no ha pagado: supuesto, sin verificar con el
dueño, pregunta 6 del roadmap §4). Nada de esto es columna. El cliente HTTP no envía saldo, estado ni
autor; si los envía, el contrato los descarta.

**Situación del saldo** (cuánto; para el detalle del archivo), umbrales exactos en unidades:

| Situación | Condición |
|---|---|
| `SIN_PAGOS` | `pagado = 0` y `total > 0` |
| `PARCIAL` | `0 < pagado < total` |
| `PAGADO` | `saldo = 0` |
| `SALDO_A_FAVOR` | `saldo < 0` (se muestra «Saldo a favor $ X»; sin devolución automática) |

**Estado de cobro** (`CollectionStatus`; a tiempo; para la vista y los filtros de T-332), con «hoy» en
la zona horaria de la agencia (R9) y `d = fecha límite − hoy` en días:

| Estado | Condición |
|---|---|
| `AL_DIA` | `saldo ≤ 0` |
| `SALDO_PENDIENTE` | `saldo > 0` y `d > 7` |
| `POR_VENCER` | `saldo > 0` y `0 ≤ d ≤ 7` |
| `VENCIDO` | `saldo > 0` y `d < 0` |
| `CANCELADO` | archivo `CANCELADO`; no cuenta como deudor; muestra su saldo («Pagado sin devolver $ X» si es negativo) |

El umbral de 7 días es constante en el MVP. En la vista, `POR_VENCER` cae dentro del filtro «Saldo
pendiente» salvo que `diseno-ux` le dé filtro propio. El estado de cobro es **del archivo**, no del
contacto ni de la conversación. «Al día» nunca se muestra como «Confirmada»: confirmar es del mayorista.

**Fecha límite de cobro.**

- **Por defecto:** `max(fecha_salida − N días, fecha de creación del archivo en la zona de la
  agencia)`. Una venta con salida a menos de N días no nace `VENCIDO`: nace con fecha límite hoy.
- **N es política por agencia (R12)**, 30 si no se ha fijado: tabla `parametros_de_cobro (tenant_id
  PK, dias_plazo_de_cobro smallint NOT NULL CHECK (0..365), actualizado_por, actualizado_en)`. Sin fila
  rige 30, así que ni la siembra de tenant ni `crear_agencia` cambian. La edita quien tenga
  `cobro.corregir`.
- **Cambiarla en un archivo** es insertar en `plazos_de_cobro` (id, tenant_id, travel_file_id,
  `vence_el date`, `motivo varchar(200) NULL`, registrado_por, registrado_en), **insert-only**: rige la
  última fila del archivo; sin filas, la fecha por defecto. FK compuestas al archivo y al usuario.
  Solo con `cobro.corregir` (el asesor no se mueve su propio plazo).
- Si la fecha límite cae después del `pago_total_vence_en` de alguna reserva, la API avisa y no lo
  impide.

### 4. Reglas de registro e idempotencia (R5)

El cliente genera `claveIdempotencia` (uuid) al abrir el formulario y la reutiliza en cada reintento,
como en el envío de mensajes. Dentro de **una** transacción, en este orden:

1. **Candado** por archivo, en su propia sentencia: `SELECT pg_advisory_xact_lock(…)` sobre
   `(tenant_id, travel_file_id)`.
2. **Buscar** por `(tenant_id, clave_idempotencia)`. Si existe: comparar el contenido (tipo, archivo,
   monto, moneda, fecha, medio, pagador, `reverso_de_id`); igual → `200` con la fila existente;
   distinto → `409` tipado. No se crea nada.
3. **Si no existe:** validar las reglas de dominio con la suma ya serializada por el candado e
   insertar con `ON CONFLICT (tenant_id, clave_idempotencia) DO NOTHING` como red (no debería
   dispararse tras el paso 1; si no inserta, se vuelve al paso 2).

**Reglas de dominio**, con errores tipados: monto entero dentro del rango y con el signo de su tipo;
moneda del archivo; `pagado_el` no posterior a hoy en la zona de la agencia; tipo permitido por el
estado del archivo (tabla de §2); una `DEVOLUCION` o el `REVERSO` de un `PAGO` no dejan `pagado < 0`;
un `AJUSTE` no deja el total negativo; sobrepago permitido si la petición trae
`confirmarSobrepago: true`. **Corregir un error** = reversar y registrar el correcto. No hay `UPDATE`
ni `DELETE` en ninguna ruta.

### 5. Inmutabilidad: privilegio y disparadores

- `privilegios_declarados` (ADR-0024 §5.2), solo `viajapro_app`:
  `pagos` → `{SELECT,INSERT}`; `plazos_de_cobro` → `{SELECT,INSERT}`; `parametros_de_cobro` →
  `{SELECT,INSERT,UPDATE}`. `viajapro_webhook`, `viajapro_altas` y `viajapro_identidad` sin ningún
  privilegio; nadie tiene `TRUNCATE`. La guardia de arranque del trabajador añade las tres tablas.
- **Además** del privilegio, `pagos` lleva `pagos_inmutables` (`BEFORE UPDATE OR DELETE` y `BEFORE
  TRUNCATE`), calcado de `versiones_cotizacion_inmutables`, con dos únicas salidas para el dueño de la
  tabla: la purga de un tenant declarado (`viajapro.purga_de_tenants`) y el tachado de §2.4. Aquí van
  privilegio y disparador porque es dinero: el disparador sobrevive a una migración futura que amplíe
  privilegios por error. `plazos_de_cobro` se queda con el privilegio, como `reserva_cambios_estado`.
- `travel_files_venta_inmutable` (§2.1): el total y la moneda del archivo, fijos.

### 6. Permisos y auditoría

- Tres permisos nuevos en el catálogo cerrado (`roles_permisos_del_catalogo` y `PERMISOS` en
  `packages/contracts/src/identidad.ts`), con prefijo `cobro.*` (decidido: nombra el área «Cobros»):
  - **`cobro.ver`** — saldo, historial y vista.
  - **`cobro.registrar`** — **solo `PAGO`**.
  - **`cobro.corregir`** — `DEVOLUCION`, `AJUSTE`, `PENALIDAD`, `REVERSO`, el plazo de un archivo y los
    días por defecto. **Uno y no dos** porque los cuatro cambian lo que el cliente debe por fuera de un
    pago normal y en una agencia pequeña los decide la misma persona; partirlo después es ampliar el
    catálogo, sin migrar datos.
- **Separación de funciones.** Siembra (agencias existentes y `packages/database/prisma/siembra-de-tenant.ts`):
  `DUENO` los tres; `ASESOR` `cobro.ver` y `cobro.registrar`; `OPERACIONES` solo `cobro.ver`
  (supuesto, sin verificar). El asesor que registra un pago no puede borrarlo ni compensarlo con una
  devolución o un ajuste. Cada agencia cambia sus roles (ADR-0011).
- **Alcance de lo visible:** quien tiene `cobro.ver` ve los cobros de **toda** su agencia, igual que
  `archivo.ver` hoy. Que el asesor vea solo lo suyo es T-339.
- **Auditoría:** la fila es la auditoría (`registrado_por`, `registrado_en`, inmutable). Los
  `registros_auditoria`, logs y outbox llevan **solo ids, tipo, monto y moneda**: nunca `nota`,
  `referencia`, `motivo` ni nombre del contacto.

### 7. Eventos de dominio

En la misma transacción que el `INSERT`, al outbox, payload **solo con identificadores** (regla de
ADR-0024 §1; el consumidor relee bajo RLS):

- `payments.pago_registrado` (`PaymentRecorded`) — `{ v: 1, pagoId, travelFileId, tipo }` para todo
  tipo salvo `REVERSO`.
- `payments.pago_reversado` (`PaymentReversed`) — `{ v: 1, pagoId, reversoDeId, travelFileId }`
  (nombre decidido).

**Ningún consumidor en el MVP.** Se escriben ahora porque cuestan un `INSERT` y son el contrato de
T-333 («Hoy» y la campana) y de los recordatorios futuros. El `PaymentReceived` del mapa de contextos
queda para la confirmación de una pasarela.

### 8. Alcance

**Entra:** `pagos`, `plazos_de_cobro` y `parametros_de_cobro` con RLS; los cinco tipos de movimiento,
idempotentes; saldo, situación y estado de cobro calculados; fecha límite por defecto y por archivo;
el disparador del total del archivo; tres permisos; dos eventos; rutas con contratos en `cobros.ts`
(nuevo, en el paquete `contracts`):

- `POST /api/v1/archivos/:id/pagos` — `PAGO` (`cobro.registrar`); `DEVOLUCION`, `AJUSTE`, `PENALIDAD`
  (`cobro.corregir`).
- `POST /api/v1/archivos/:id/pagos/:pagoId/reverso` — con motivo (`cobro.corregir`).
- `POST /api/v1/archivos/:id/plazo-de-cobro` — nueva fecha límite (`cobro.corregir`).
- `PUT  /api/v1/cobros/parametros` — días por defecto de la agencia (`cobro.corregir`).
- `GET  /api/v1/archivos/:id/cobro` — total, pagado, saldo, situación, estado e historial (`cobro.ver`).
- `GET  /api/v1/cobros` — la vista de T-332, totales agrupados **por moneda** (`cobro.ver`).

**Fuera, explícitamente:**

| Fuera | Por qué |
|---|---|
| Pasarela de pagos, links de pago generados por el sistema, reembolsos a la pasarela | Tercero con webhooks, firma, alcance PCI: puerto + adaptador + ADR propio. El dueño no lo ha pedido |
| Recordatorios de saldo por WhatsApp | Plantilla *utility* aprobada, opt-in, coste por mensaje y la ventana de 24 h (ADR-0018): consumidor futuro de `payments.pago_*` |
| Plan de pagos y cuotas (`PaymentPlan`, `Installment`) | El supuesto es pagos libres + una fecha límite. Con cuotas, «Vencido» se mide por cuota: tabla nueva, el libro no cambia |
| Conciliación bancaria | Requiere extractos o integración con bancos; sin evidencia de necesidad |
| Facturación electrónica, recibos, IVA | Fiscal y ligado a ADR-0023 (Propuesto); otro ADR |
| Multimoneda con TRM automática | §2.2; consultar la TRM a un tercero es puerto + ADR (ADR-0024) |
| Adjuntar el comprobante (imagen o PDF) | S3, política de acceso y datos personales: tarea propia |
| Cobro por pasajero; un pago repartido entre archivos | Cambia la unidad de saldo, no el registro: historia aparte (pregunta 7 del roadmap §4) |

### 9. Términos para el lenguaje ubicuo

Este ADR usa, y `documentador` debe llevar al diccionario: **Devolución** (`Refund`), **Reverso**
(`Reversal`), **Ajuste del total** (`TotalAdjustment`), **Estado de cobro** (`CollectionStatus`),
**Fecha límite de cobro** (`collectionDueDate`), **Saldo** (`balance`) y **Saldo a favor**
(`creditBalance`). **Penalidad** (`Penalty`) ya existe. Y una aclaración: **«Abono»** es lo que la
agencia paga al mayorista; para el viajero se dice **«Registrar pago»**, aunque en la calle se diga
«el cliente abonó».

## Seguridad entre agencias

**Lo que T-329 debe probar en `aislamiento.spec.ts`** (ampliado, auditoría sin recortar vueltas, R13):

1. Las tres tablas con `tenant_id NOT NULL`, RLS habilitada y **forzada** por
   `aplicar_aislamiento_tenant`, en la lista de tablas de negocio esperadas, ninguna en
   `excepciones_rls`, `tablas_sin_aislamiento` vacío.
2. **Lectura cruzada:** con `app.current_tenant` = A, cero filas de B en las tres.
3. **Escritura cruzada:** `INSERT` con `tenant_id` = B estando en A falla por `WITH CHECK`.
4. **FK compuesta:** un movimiento de A hacia un archivo, un contacto pagador o un usuario de B falla
   aunque se conozca el id; un reverso no puede apuntar a un movimiento de otra agencia, archivo, monto
   o moneda; un movimiento en moneda distinta de la del archivo falla.
5. **Insert-only:** con `viajapro_app`, `UPDATE`, `DELETE` y `TRUNCATE` sobre `pagos` y
   `plazos_de_cobro` fallan por privilegio; como dueño de `pagos` fallan por el disparador, salvo la
   purga declarada y el tachado (que solo admite nulos en `nota`/`referencia`); los otros tres roles
   de login no tienen ningún privilegio sobre las tres tablas.
6. Un segundo reverso del mismo movimiento y el reverso de un reverso fallan en la base.
7. **Total del archivo:** un `UPDATE` de `venta_unidades`, `moneda_iso`, `tenant_id` o `id` en
   `travel_files` falla con `viajapro_app` y con el dueño; un `UPDATE` de `estado` sigue funcionando.
8. La matriz de privilegios coincide con §5 y la guardia del trabajador aborta si `viajapro_webhook`
   gana alguno.

**Dinero:** no hay redondeo (solo sumas y restas de enteros en una moneda). Desbordamiento: `bigint`
en la base, `bigint` en `Money`, texto (`Dinero.unidades`) en el contrato; el tope de `10¹⁵ − 1` por
movimiento deja margen de sobra antes de `2⁶³` en la suma de un archivo.

**Qué revisa `auditor-seguridad`:** las tres tablas y sus FK; la clave nueva en `travel_files`; las
filas de `privilegios_declarados`; los tres disparadores (`pagos_validar_alta`, `pagos_inmutables` con
sus dos salidas, `travel_files_venta_inmutable`), todos `SECURITY INVOKER`, `SET search_path = ''`,
`REVOKE ALL` a `PUBLIC`; la ampliación del catálogo de permisos y su siembra (separación de funciones
de §6); que el puerto hacia `booking` reciba el tenant de la sesión y no del cuerpo; que logs, errores
y outbox no lleven `nota`, `referencia` ni `motivo`. Ninguna función `SECURITY DEFINER` nueva.

## Plan de implementación

| PR | Contenido | Revisión |
|---|---|---|
| **T-329** — Migración | Enum, `pagos`, `plazos_de_cobro`, `parametros_de_cobro`, `UNIQUE (id, tenant_id, moneda_iso)` y `travel_files_venta_inmutable` en `travel_files`, FK, CHECK, índices, disparadores, `privilegios_declarados`, permisos `cobro.*` y su siembra, cinturón; `aislamiento.spec.ts` y guardia. Sin código de aplicación. Ruta protegida (R11) | `datos` + `auditor-seguridad` |
| **T-330** — Dominio y API | `cobro.ts` en el paquete `domain` (saldo, situación, estado, fecha límite) con pruebas de cada umbral; contratos; módulo `payments`; `PuertoArchivoParaCobro` en `booking`; las seis rutas; idempotencia en el orden de §4; eventos. Absorbe la mitad «abonos y saldo» de T-283 | `backend` |
| **T-331**, **T-332** — Web | Registrar y ver el saldo en el archivo; vista «quién pagó y quién debe» | `frontend` |

T-330 depende de T-329; las pantallas, de T-330. La meta de rendimiento de la vista (HU: 2.000
archivos, 10.000 pagos, p95 < 500 ms) se mide en T-332; el índice de §2 es el punto de partida.

## Cola (no bloquea)

| Hallazgo | Dueño |
|---|---|
| Dos hitos, anticipo y saldo, con fechas derivadas del `finalPaymentDue` del mayorista | `analista-producto` + `experto-turismo` |
| Saldo a favor trasladado a otro archivo del mismo cliente | `analista-producto` |
| Alerta de anticipo sin pagar cuando se acerca el *time limit* de la reserva | `backend` (con T-333) |
| TRM por pago (monto recibido, moneda recibida, `trm_*`) si el piloto vende en USD; depende de la respuesta del dueño | `arquitecto` + `datos` |
| Consignación sin identificar (dinero que llegó sin saber de qué archivo) | `analista-producto` |
| Aviso al `DUENO` por cada `PAGO` registrado, o filtro por autor en la vista (T-332) | `analista-producto` + `frontend` |
| Comprobar `pg_trigger.tgenabled = 'O'` en `pagos_inmutables` y `travel_files_venta_inmutable` (cinturón y `aislamiento.spec.ts`) | `datos` |
| «Desde dónde» se registró (IP o sesión), con el módulo `audit` | `arquitecto` |
| T-330: las sumas con `$queryRaw` se leen como `bigint`, nunca `Number` | `backend` |
| Tabla `medios_de_pago` por agencia con `categoria` del catálogo (§2.3) | `datos` |
| Umbral de `POR_VENCER` (7 días) como política por agencia, si una segunda lo pide | `analista-producto` |

## Consecuencias

### Positivas
- «Quién pagó y quién debe» sale de una suma que nadie puede editar, con autor e instante.
- El estado de pago vive en el viaje, no en la persona ni en una etiqueta.
- La base impide lo que más duele: movimientos cruzados entre agencias, en otra moneda, editados o
  borrados, reversos dobles o de otro monto, y un total del archivo que cambia por debajo del saldo.
- El asesor registra pagos; lo que los compensa lo decide otra persona.
- Un archivo cancelado cierra en cero con penalidad y devolución, sin borrar nada.
- Cuotas, otra moneda, cuentas por agencia y pasarela se añaden sin migrar el libro.

### Negativas
- Tres tablas más con RLS y tres disparadores: superficie que `auditor-seguridad` revisa.
- `payments` añade una clave y un disparador a `travel_files`: dependencia de esquema hacia `booking`.
- El saldo se calcula en cada lectura; si el volumen crece mucho más que el de la HU, hará falta un
  agregado materializado (caché, nunca fuente).
- Un error se corrige con dos filas más (reverso y movimiento correcto); la pantalla debe mostrarlo
  claro.
- El tachado de notas es manual y de operación: lento a propósito, pero depende de una persona.
- El medio de pago se aparta del supuesto de HU-payments-1 («lista por agencia»), justificado en §2.3.

### Qué habría que cambiar para revertir esto
- Antes de datos reales: borrar el módulo, las tres tablas, el enum, la clave y el disparador de
  `travel_files`, sus filas de `privilegios_declarados` y los permisos. Con movimientos reales, el
  libro no se borra: se supersede este ADR.

## Cuándo revisar esta decisión

- Cuando el dueño de JD Tours responda las siete preguntas de cobros del roadmap §4 y contradiga un
  supuesto (cuotas, monedas, quién registra, penalidad, pagos repartidos).
- Cuando el piloto venda su primer archivo en USD cobrado en pesos.
- Cuando una agencia pida cobrar en línea: ADR de pasarela.
- Si la vista de T-332 no cumple el p95 con el volumen de la HU.

## Historial de revisión

**2026-11-21 — Una vuelta de `auditor-seguridad` y `experto-turismo`, aplicada en sitio (sigue
Propuesto).** Seguridad: disparador que fija el total y la moneda de `travel_files`; separación de
funciones (`cobro.corregir` solo para `DUENO`); orden explícito de la idempotencia. Operación: tipos
`AJUSTE` y `PENALIDAD`; `pagador_id`; medios `BILLETERA_DIGITAL`, `PSE` y `LINK_DE_PAGO`; días del plazo
como política por agencia sin nacer vencido; `plazos_de_cobro` insert-only; estado `POR_VENCER`.
Confirmado sin cambio: prefijo `cobro.*`, evento `pago_reversado`, `nota` y `referencia` en claro con
filtro Luhn, una moneda por archivo (COP). Sin segunda ronda (R13).

## Enlaces

- [HU-payments-1](../01-producto/03-historias/HU-payments-1.md) — qué y supuestos.
- [Roadmap JD Tours](../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md) §4 — preguntas al dueño.
- [ADR-0024](0024-de-cotizacion-aceptada-a-archivo-de-viaje.md) — `TravelFile`, `privilegios_declarados`, eventos y puertos.
- [ADR-0003](0003-multitenancy.md), [ADR-0008](0008-resolucion-de-tenant-en-webhooks-entrantes.md) — RLS y roles.
- [ADR-0006](0006-parametrizacion-y-extensibilidad.md) — qué se parametriza.
- [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md) — catálogo de permisos y roles por agencia.

---

> Un ADR aceptado no se edita: si cambia, se escribe uno nuevo que lo supersede.
