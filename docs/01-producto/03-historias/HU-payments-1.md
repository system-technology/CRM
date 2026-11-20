# HU-payments-1 — Ver quién me pagó y quién me debe, viaje por viaje

| | |
|---|---|
| Tarea | T-327 (C0 del [roadmap JD Tours](../../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md), eje C) |
| Fecha | 2026-11-20 |
| Contexto | `payments` (diseñado, sin código). Lee el archivo de viaje de `booking` por puerto (R4) |
| Siguiente | T-328, ADR del contexto de pagos: decide **cómo**. Esta historia solo dice **qué** |
| Validación de dominio | `experto-turismo`, §«Validación de dominio» al final |

**Como** dueña de una agencia de turismo pequeña
**quiero** registrar a mano cada pago que me hace un cliente sobre su archivo de viaje y ver en una sola
pantalla qué archivos están al día, cuáles tienen saldo y cuáles están vencidos
**para** cobrar a tiempo lo que me deben, antes de tener que pagarle al mayorista, sin depender de
etiquetas de WhatsApp ni de una hoja de cálculo.

## Contexto

Hoy la agencia marca cada chat con las etiquetas «pagó» o «pago pendiente» de WhatsApp Business y lleva
las reservas en una hoja de Google. El estado de pago queda en la persona y no en el viaje, la etiqueta
no dice **cuánto** falta, y nadie avisa cuando un saldo se vence. En `main` el archivo de viaje tiene su
total (`travel_files.venta_unidades` + `moneda_iso`, copiado de la versión aceptada e inmutable), pero no
existe ningún registro de lo que pagó el viajero.

## Términos (no se mezclan)

| Término | Quién paga a quién | Dónde vive |
|---|---|---|
| **Pago** (`Payment`) | El **viajero** a la agencia | Esta historia |
| **Anticipo** (`deposit`) | El primer pago del viajero. No es un tipo aparte: es el primer pago. No confirma nada; la reserva la confirma el mayorista | Esta historia |
| **Devolución** | La agencia **al viajero** (reembolso) | Esta historia, solo el registro |
| **Reverso** | Nadie: anula un registro hecho por error | Esta historia |
| **Abono al mayorista** | La agencia al mayorista (`Booking` `ABONADA_AL_PROVEEDOR`, botón «Registrar abono» de `/viajes`) | Ya existe, `booking`. **No se toca** |
| **Comisión del proveedor** | El proveedor a la agencia | ADR-0023. No es un pago del viajero |

En la interfaz, lo del viajero se llama **«Registrar pago»**, nunca «abono»: la palabra ya es del
mayorista en el producto, aunque en la calle se diga «el cliente abonó». El criterio de aceptación de
T-283 que menciona «Registrar abono» junto a pagado y saldo debe leerse como «Registrar pago»
(T-330 absorbe esa mitad).

## Criterios de aceptación

Datos de ejemplo ficticios: agencia «Agencia Demo», file 1043, total 4.800.000 COP (unidades = pesos,
`decimales: 0`, R8), salida 2027-02-15, fecha límite de cobro 2027-01-16, zona horaria de la agencia
`America/Bogota`.

**Registrar y calcular**

- [ ] Dado el file 1043 sin pagos, cuando alguien con permiso de registrar pagos anota 1.500.000 COP,
  fecha 2026-11-20, medio «Transferencia», nota «Anticipo», entonces el archivo muestra **total
  4.800.000, pagado 1.500.000, saldo 3.300.000** y el estado **Saldo pendiente**; el pago aparece en el
  historial con autor e instante de registro.
- [ ] El saldo y el estado los calcula el **servidor** (total − pagos + devoluciones, sin contar los
  reversados). Si el cliente HTTP envía un saldo, un estado o un autor, se ignoran.
- [ ] Los montos viajan y se guardan como **entero en la unidad mínima** con su código ISO-4217. Un
  monto con decimales, cero, negativo o fuera de rango se rechaza con un error tipado; nada se guarda.
- [ ] Un pago en USD sobre un archivo en USD guarda `15000` para USD 150,00; en pantalla dice
  «USD 150,00». En COP, `1500000` se muestra «$ 1.500.000». (Regresión del error de dos órdenes de
  magnitud de R8.)

**Historial que no se edita**

- [ ] Ningún pago, reverso ni devolución se puede editar ni borrar por la API; la base lo impide también
  (la aplicación solo inserta y lee). Comprobable: un `UPDATE`/`DELETE` con el rol de la aplicación falla.
- [ ] Dado un pago de 1.500.000 registrado por error, cuando alguien con permiso de reversar lo
  **reversa** con motivo obligatorio, entonces se añade un movimiento de reverso que apunta al pago
  original, el saldo vuelve a 4.800.000 y el historial muestra ambos (el original tachado, no oculto).
- [ ] Un pago solo se reversa una vez, y un reverso no se reversa: el segundo intento devuelve un error
  tipado y no cambia nada. Para corregir un monto se reversa y se registra el correcto.

**Idempotencia (R5)**

- [ ] Dado un registro enviado con una clave de idempotencia, cuando se reenvía con la misma clave
  (doble clic, reintento de red), entonces existe **un solo** pago y la respuesta es la misma.
- [ ] La misma clave con otro contenido (otro monto, otra fecha) devuelve un conflicto y no crea nada.

**Vista «quién pagó y quién debe»**

- [ ] Una pantalla lista los archivos de viaje **abiertos** con: número de file, contacto, destino, fecha
  de salida, total, pagado, saldo, fecha límite de cobro y estado de cobro; se filtra por estado y por
  defecto ordena **Vencido** primero y luego por fecha límite.
- [ ] Estados, calculados en el servidor con la fecha de **hoy en la zona horaria de la agencia** (R9):
  - **Al día**: saldo ≤ 0.
  - **Saldo pendiente**: saldo > 0 y hoy ≤ fecha límite de cobro.
  - **Vencido**: saldo > 0 y hoy > fecha límite de cobro.
- [ ] Dado el file 1043 con saldo 3.300.000, cuando en Bogotá pasa la medianoche del 2027-01-16 al
  2027-01-17, entonces el archivo pasa a **Vencido** sin que nadie haga nada.
- [ ] Los totales de la vista se agrupan **por moneda**; nunca se suman COP y USD en una cifra.
- [ ] Con 2.000 archivos y 10.000 pagos en la agencia, la vista responde en menos de 500 ms (p95) en
  el entorno de pruebas de rendimiento.
- [ ] La vista no muestra neto ni margen.

**Permisos y aislamiento**

- [ ] Permisos propios en el catálogo de ADR-0011 (nombres finales en T-328; supuesto):
  `cobro.ver` (vista y saldo), `cobro.registrar` (registrar pagos) y `cobro.reversar` (reversos y
  devoluciones). Sin `cobro.ver` la vista no aparece en el menú y la API responde 403; sin
  `cobro.registrar` el botón «Registrar pago» no se muestra y la API responde 403.
- [ ] Un usuario de la agencia A no ve, registra ni reversa pagos de un archivo de la agencia B, ni
  adivinando el id: la API responde como si no existiera. La prueba de aislamiento cubre la tabla nueva
  (R1) y la pieza pasa auditoría de seguridad **sin recortar vueltas** (R13).
- [ ] Ni la nota, ni la referencia del comprobante, ni el nombre del contacto salen en logs, outbox ni
  auditoría: solo ids, montos y moneda.

## Casos borde

- **Pago en otra moneda.** El pago se registra **en la moneda del archivo**; otra moneda se rechaza con
  un error tipado que lo explica. Si el cliente pagó en pesos un archivo en USD, se registra el
  equivalente en USD y la nota dice cuántos pesos y a qué tasa. Guardar el monto recibido, su moneda y
  la tasa congelada en el pago es la cola de ADR-0024 («la tasa se congela en cada abono»): no entra.
  El piloto vende todo en COP.
- **Sobrepago.** Se permite, con confirmación explícita («El pago supera el saldo en $ 200.000.
  ¿Registrarlo igual?»). El saldo queda negativo, el estado es **Al día** y se muestra «Saldo a favor
  $ 200.000». No se genera devolución automática.
- **Anulación.** Es un reverso (arriba). No hay botón de borrar.
- **Devolución.** Se registra como movimiento propio (monto, fecha, medio, nota) y suma al saldo. No
  puede superar lo pagado neto del archivo. El cálculo de penalidades no entra.
- **Archivo cancelado.** No admite pagos nuevos (error tipado); sí reversos y devoluciones. Sale de los
  estados Al día / Saldo pendiente / Vencido y aparece solo con el filtro «Cancelados», con la etiqueta
  «Cancelado» y, si quedó dinero sin devolver, «Pagado sin devolver $ X». No se le marca como deudor.
- **Archivo sin pagos.** Estado Saldo pendiente (o Vencido) con pagado 0. Estado vacío de la vista:
  «No hay archivos de viaje abiertos».
- **Fecha del pago.** Es la fecha en que el dinero llegó (puede ser anterior al registro); no puede ser
  futura respecto de hoy en la zona de la agencia. Se guarda como fecha de calendario; el instante de
  registro, en UTC.
- **Fecha límite de cobro posterior al pago total del mayorista.** Se permite, con un aviso: «El
  mayorista cobra el total el 2027-01-10 y el cliente tiene hasta el 2027-01-16».
- **Total del archivo cambia.** Hoy no puede: el total es copia inmutable de la versión aceptada.
  Servicios adicionales tras la apertura no están modelados (cola, no esta historia).
- **Red caída al registrar.** El formulario conserva lo escrito y reintenta con la **misma** clave de
  idempotencia; no aparece «registrado» hasta que el servidor lo confirma.
- **Dos personas registran a la vez sobre el mismo archivo.** Ambos pagos quedan; el saldo es la suma de
  los dos, nunca el último que escribió.

## Fuera de alcance

- **Pasarela de pagos**, links de pago, conciliación bancaria y cobro con tarjeta en línea (otro ADR).
- **IA** que lea el comprobante o el chat y proponga el pago.
- **Recordatorios por WhatsApp** del saldo al cliente (si el dueño los quiere, es otra tarea de cola).
- **Plan de cuotas** con varias fechas (`PaymentPlan`, `Installment`): aquí hay una sola fecha límite.
- **Cobro por pasajero** (cada viajero de un grupo paga lo suyo).
- **Adjuntar el archivo del comprobante** (imagen o PDF): solo una referencia en texto.
- Recibos o facturas al cliente, IVA, contabilidad, cuentas por pagar al mayorista, caja diaria.
- Avisos en «Hoy», la campana y la bandeja (es T-333) y etiquetas de chat (eje B).
- Pantalla para editar la lista de medios de pago (se siembra; ver supuestos).
- Importar los pagos de la hoja actual (lo decide T-336).

## Supuestos para las preguntas del roadmap §4

El dueño de JD Tours aún no respondió. Cada supuesto deja avanzar T-328 y se revisa cuando responda;
si la respuesta lo contradice, se corrige en el ADR, no se reabre esta historia.

| Pregunta (§4) | Supuesto explícito | Si responde otra cosa |
|---|---|---|
| ¿Cobra por archivo o por pasajero? | **Por archivo.** Lo paga el titular o la familia; la nota dice quién pagó si importa | Por pasajero es una historia aparte (HU-payments-2): la unidad de saldo cambia, no el registro |
| ¿Pagos libres o plan de cuotas? | **Pagos libres** + **una** fecha límite de cobro por archivo. Por defecto = fecha de salida − N días, N por agencia (R12, sembrado 30); editable en cada archivo | Plan de cuotas = historia aparte; «Vencido» pasa a medirse por cuota |
| ¿Monedas? | **Moneda del archivo** (el piloto vende en COP). Otra moneda se rechaza; equivalente + nota | Monto recibido + moneda + tasa congelada en el pago (cola de ADR-0024) |
| ¿Medios de pago? | Lista **por agencia** (R12), sembrada con: Transferencia, Efectivo, Tarjeta, Consignación, Otro. Sin pantalla para editarla todavía | Se ajusta la semilla; editarla es una tarea de configuración |
| ¿Guarda comprobantes? | Campo opcional **referencia del comprobante** (texto: número de transacción). Sin archivo adjunto | Adjunto en S3 con su política de acceso y PII (R10): tarea propia |
| ¿Quién registra los pagos? | Roles sembrados: **dueño y asesores** con `cobro.ver` y `cobro.registrar`; **solo el dueño** con `cobro.reversar`. Cada agencia lo cambia en sus roles (ADR-0011) | Solo cambia la semilla de roles |
| ¿Recordatorio por WhatsApp? | **No** en este roadmap (§5) | Tarea de cola, con plantilla aprobada y ventana de 24 h |
| ¿Qué etiquetas usa y de qué color? | No aplica a esta historia (eje B, T-323). El estado de cobro del archivo **no** es una etiqueta | — |
| Su hoja: cuántas reservas y qué columnas | Volumen supuesto < 500 archivos al año; la vista lleva las columnas de arriba. Muestra **sin nombres ni teléfonos** (R10) | Las columnas de la vista se ajustan en T-334 |

## Cómo sabemos que funcionó

Línea base: hoy no hay dato; el estado de pago vive en etiquetas y en una hoja. Se mide desde la primera
semana con el piloto.

1. **Exactitud** (semana 2): en una conciliación con el dueño de 20 archivos al azar, el saldo del
   sistema coincide con lo que él sabe en **20 de 20**. Una sola diferencia es un defecto, no ruido.
2. **Adopción** (semana 4): ≥ 90 % de los archivos abiertos con salida futura tienen al menos un pago
   registrado o están en Saldo pendiente/Vencido a sabiendas, y el dueño **dejó de actualizar** la
   columna de pagos de su hoja (preguntado en la revisión semanal; criterio de salida del roadmap §3.5).
3. **Impacto** (semana 8): número de archivos **Vencido** y días promedio en ese estado, cada semana. Se
   espera que baje respecto de la semana 1; si no baja, la vista no cambia la conducta y los avisos de
   T-333 pasan a ser lo urgente.

## Prioridad

Impacto en la conversión × frecuencia ÷ costo:

- **Impacto alto**: es lo que el cliente pidió con sus palabras, y un saldo sin cobrar antes del pago
  total al mayorista es dinero propio en riesgo.
- **Frecuencia alta**: un pago por archivo al menos dos veces (anticipo y saldo); la vista se consulta a
  diario.
- **Costo medio**: tabla nueva insert-only con RLS, tres permisos, una API y dos pantallas (T-328 a
  T-332). El costo que no se recorta es la auditoría de aislamiento.

Por eso va en la Fase 2 en paralelo a etiquetas, y lo caro (pasarela, cuotas, adjuntos, otra moneda) se
queda fuera.

## Validación de dominio (`experto-turismo`)

- **Por archivo, no por persona**, coincide con el principio 2 del roadmap: un mismo cliente puede tener
  un viaje pagado y otro con saldo. En Colombia lo habitual en agencias pequeñas es que el titular pague
  por el grupo familiar; el cobro por pasajero aparece en **grupos** (excursiones, colegios, amigos) y
  justifica una historia aparte, no complicar esta.
- **Anticipo y saldo** es el patrón común: un anticipo al reservar y el saldo antes de la salida, con
  frecuencia alineado con el pago total al mayorista. Por eso la fecha límite de cobro es del archivo y
  se compara con `pago_total_vence_en` de sus reservas, sin atarla a ella.
- **El anticipo no confirma la reserva** (lenguaje ubicuo): «Al día» es estado de **cobro**, nunca de
  reserva; la pantalla no debe mezclar «Confirmada» con «Pagada».
- **Devolución ≠ reverso.** La devolución es dinero que salió de verdad (cancelación, cambio); el
  reverso corrige un error de digitación. Mezclarlos falsea la caja.
- **Abono al mayorista ≠ pago del viajero.** Son dos flujos de dinero opuestos sobre el mismo archivo;
  la agencia recauda del viajero para pagar a terceros (ADR-0023: el costo neto no es ingreso propio).
- **Generalización (riesgo §5):** pagos libres, una fecha límite y medios por agencia sirven también a
  agencias medianas; las que trabajan con cuotas o grupos quedan para historias posteriores sin
  rehacer el registro.
- **Términos nuevos** para que T-328 los lleve al lenguaje ubicuo: *Reverso*, *Devolución*, *Fecha
  límite de cobro*, *Estado de cobro* (Al día, Saldo pendiente, Vencido). Ninguno usa «abono».
