# Lenguaje ubicuo

> **El diccionario del dominio.** Un término, un significado, un nombre en el código.
> Si este documento dice `Archivo de viaje` → `TravelFile`, el código no dice `Booking`,
> ni `Order`, ni `Reservation`.

Por qué importa: cuando el mismo concepto tiene tres nombres, cada persona —y cada agente— modela
una cosa distinta, y la divergencia no se nota hasta que es cara de arreglar.

**Convención:** la documentación va en español, el código en inglés. Este documento es el puente.
Término nuevo del dominio → entrada nueva aquí, antes de escribir la primera línea.

---

## Comercial

| Término (negocio) | Código | Qué es, exactamente |
|---|---|---|
| **Agencia / Tenant** | `Tenant` | La agencia de turismo cliente del SaaS. Unidad de aislamiento de datos. |
| **Asesor** | `Agent` | Usuario que atiende clientes y vende. **No confundir con los agentes de IA del desarrollo.** |
| **Contacto** | `Contact` | Persona con la que la agencia conversa. Puede o no viajar. |
| **Viajero** | `Traveler` | Persona que efectivamente viaja. Puede no ser el contacto. |
| **Pasajero** | `Passenger` | Un viajero **dentro de un archivo concreto**, con su tipo (ADT/CHD/INF) y sus documentos. El mismo viajero es pasajero en varios archivos. |
| **Cuenta corporativa** | `Company` | Empresa cliente, cuando la agencia vende a corporativo. |
| **Oportunidad** | `Deal` | Una intención de compra en el embudo. Nace de una conversación, muere ganada o perdida. |
| **Etapa** | `Stage` | Posición de la oportunidad en el embudo. Configurable por agencia. |
| **Motivo de pérdida** | `LossReason` | Por qué se perdió. Obligatorio al marcar perdida: sin esto no hay aprendizaje. |

## Conversación

| Término | Código | Qué es |
|---|---|---|
| **Conversación** | `Conversation` | Hilo continuo con un contacto por un canal. |
| **Canal** | `Channel` | Medio de comunicación. En v1: WhatsApp. |
| **Mensaje** | `Message` | Unidad de comunicación. Entrante o saliente. |
| **Ventana de servicio** | `ServiceWindow` | Las 24 horas desde el último mensaje del cliente en que se puede responder con texto libre. Fuera de ella, solo plantillas. |
| **Plantilla** | `MessageTemplate` | Mensaje preaprobado por Meta. Tiene categoría, variables y estado de aprobación. |
| **Nota interna** | `InternalNote` | Comentario del equipo sobre una conversación. **Nunca se envía al cliente.** |
| **Asignación** | `Assignment` | Qué asesor es responsable de una conversación. |
| **Etiqueta** | `Label` | Marca con nombre y color que **cada agencia** define (tabla por agencia, R12) y que se pone y se quita en una conversación («Pagado», «Pago pendiente», «Seguimiento»). Es ayuda visual del chat: **ningún saldo ni estado de cobro se calcula con ella**. No es la etiqueta del contacto (`Contacto.etiquetas`, atributo duradero). En pantalla, «Etiqueta», nunca «tag». Tablas `etiquetas` y `conversacion_etiquetas` (T-324, HU-inbox-1). |
| **Cola común** | `UnassignedQueue` | Las conversaciones sin asignar. Las ve todo miembro de la agencia. Ver `12-visibilidad-de-conversaciones.md`. |
| **Tomar una conversación** | `ClaimConversation` | Asignársela uno mismo desde la cola común. Responder la primera vez también la toma. |
| **SLA de primera respuesta** | `FirstResponseSla` | Tiempo máximo comprometido para responder. Si se vence, se ve en la bandeja. |

## Cotización

| Término | Código | Qué es |
|---|---|---|
| **Cotización** | `Quote` | Propuesta comercial enviada al cliente. Tiene versiones: la que vio el cliente no cambia. |
| **Opción** | `QuoteOption` | Una alternativa dentro de la cotización (económica / estándar / premium). El cliente elige una. |
| **Ítem** | `QuoteItem` | Un servicio dentro de una opción: un vuelo, una noche de hotel, un traslado. |
| **Producto turístico** | `TravelProduct` | Tipo de servicio: `FLIGHT`, `HOTEL`, `TRANSFER`, `TOUR`, `INSURANCE`, `CRUISE`, `CAR_RENTAL`, `TICKET`, `PACKAGE`. |
| **Tarifa neta** | `netRate` | Lo que cobra el proveedor. **Nunca se muestra al cliente.** |
| **Tarifa de venta** | `sellRate` | Lo que paga el cliente. |
| **Markup** | `markup` | Lo que la agencia agrega sobre la neta. Lo paga el cliente. |
| **Comisión** | `commission` | Lo que el proveedor devuelve a la agencia. **Lo paga el proveedor, no el cliente.** No es lo mismo que markup y no se contabiliza igual. |
| **Margen** | `margin` | Venta − costo neto. La métrica que de verdad importa. |
| **TRM aplicada** | `exchangeRate` | Tasa de cambio congelada en la cotización, con su fecha. No se recalcula después. En el código es `exchangeRate` (value object `ExchangeRate`), nunca `trm`; solo las columnas de la base se llaman `trm_*`. ADR-0024 §2. |
| **Itinerario** | `Itinerary` | Secuencia de días y servicios del viaje. |
| **Segmento** | `Segment` | Tramo dentro de un itinerario: un vuelo, una noche, un traslado. |

## Paquetes (la cabeza de playa)

Términos del producto que vende una agencia minorista. Ver
[cabeza de playa](07-cabeza-de-playa-paquetes.md).

| Término | Código | Qué es |
|---|---|---|
| **Paquete** | `TravelPackage` | Producto ya armado por un mayorista: destino, duración e inclusiones. **Es plantilla: no lleva precio.** El precio cuelga de una [`Vigencia`](#vigencia-y-salida-adr-0009) (ADR-0009). Es el ítem de cotización de la primera rebanada. En el código hoy se llama `Paquete` |
| **Mayorista** | `Wholesaler` | Quien arma el paquete y se lo vende a la agencia. Un tipo de `Supplier` |
| **Inclusiones** | `inclusions` | Qué trae el paquete: vuelo, hotel, traslados, alimentación, tours, seguro |
| **Acomodación** | `Occupancy` | Cuántas personas por habitación: `SINGLE`, `DOUBLE`, `TRIPLE`, `QUADRUPLE`. En productos con noche, **el precio por persona cambia con la acomodación**, y es un error clásico modelarlo como precio fijo por pasajero. En pasadías y excursiones no existe: es una condición **opcional** de la tarifa, y si el tarifario no la trae el cotizador no la pregunta |
| **Plan de alimentación** | `MealPlan` | `ALL_INCLUSIVE`, `BREAKFAST`, `HALF_BOARD`, `FULL_BOARD`, `ROOM_ONLY` |
| **Temporada** | `Season` | Rango de fechas con precio propio: alta, baja, puente festivo. En Colombia los puentes son su propia temporada. **Desde ADR-0009 es un caso de [`Vigencia`](#vigencia-y-salida-adr-0009): no se retira, se generaliza.** |
| **Cupo** | `Allotment` | Plazas que el mayorista tiene bloqueadas. Se agotan |
| **Tarifario** | `RateSheet` | El documento del mayorista con los precios netos por vigencia y, cuando el producto tiene noche, por acomodación. Hoy llega en Excel o PDF |

`Salida` (`Departure`) tenía aquí una entrada propia, «fecha en que opera un paquete». Se redefinió y
se movió al bloque [Vigencia y salida](#vigencia-y-salida-adr-0009): ya no es una tabla aparte, es
una vigencia.

Dos cosas que un modelo hecho desde fuera del sector siempre olvida:

- **El precio depende de la acomodación, no solo del número de pasajeros.** Cuatro personas en dos
  habitaciones dobles no cuestan lo mismo que cuatro en una cuádruple.
- **Los niños tienen edad de corte y cupo por habitación.** «Niño gratis compartiendo habitación con
  dos adultos» es una condición comercial real que el modelo debe poder expresar.

### Vigencia y salida (ADR-0009)

Cómo se ata el precio a una fecha. Lo decide
[ADR-0009](../03-adr/0009-salida-programada-como-unidad-de-venta.md); este bloque es el diccionario
y el razonamiento vive allí. **Hoy el esquema y los contratos usan nombres en español**
(`Vigencia`, `Tarifa`, `UnidadDeCobro`, `PoliticaDePrecio`). La columna «Código» recoge el nombre que
fija el ADR; la distancia entre ambos está sin resolver.

| Término | Código | Qué es |
|---|---|---|
| **Vigencia** (ventana de vigencia) | `Vigencia` | Rango de **fechas de salida**, ambos extremos incluidos, al que cuelga el precio de un paquete. Generaliza a `Temporada`. **Un precio sin vigencia no existe.** Si dos vigencias abiertas se solapan gana la más corta; si empatan en longitud es un error de datos y se devuelve como tal, no se elige en silencio |
| **Salida** | `Departure` | La vigencia de **un solo día**, **publicada**: una fecha concreta que el cliente ve en la pieza de WhatsApp. No es una tabla aparte. Puede llevar cupo, pero **informativo y opcional**: para quien revende, el inventario es del mayorista y la disponibilidad se pregunta, no se calcula. Una salida publicada vence a una vigencia abierta que contenga su fecha |
| **Tarifa** | `Fare` | El precio de una vigencia: nombre, monto, unidad de cobro, condición de aplicación y mayorista al que se compra. Lleva `neto` y `venta`. Una vigencia tiene varias («Adulto», «Menor de 2 a 11», «Promo pareja», «Suplemento de sencilla»). Un `neto` ausente cotiza igual y reporta margen desconocido (`null`, no cero). **No confundir con `Rate`**, la tarifa de un ítem en la cotización general |
| **Unidad de cobro** | `PricingUnit` | El **denominador** de una tarifa: `PER_PERSON`, o `PER_GROUP` con `cubrePasajeros: n`. «Promo pareja» es `PER_GROUP` con `cubrePasajeros = 2`. Es aritmética, no política: no se parametriza. El monto de grupo se guarda íntegro; el per cápita es presentación |
| **Política de precio** | `PricingPolicy` | Cómo forma **esta agencia** el precio de venta; una fila por tenant: `porcentaje` (por defecto 20), `base`, `origenDeLaVenta`, `redondeoVenta` (por defecto 1.000) y `modoDeCatalogo`. Cambiarla **nunca altera una cotización ya enviada** |
| **Formato de viaje** | `TripFormat` | Etiqueta comercial: pasadía, pasanoche, excursión, mini-excursión, super excursión. **Tabla por tenant**, no `enum` (R12): la propia hoja las solapa. El invariante es el número de noches; ninguna ruta de cotización ramifica sobre la etiqueta. *Aún no existe como tabla: la semilla del catálogo real la trata como etiqueta* |

Dos precisiones que ahorran un error caro:

- **«Margen del 20 %» tiene dos lecturas.** `SOBRE_EL_NETO` (markup, «le subo el 20 %») da
  $1.200.000 sobre un neto de $1.000.000; `SOBRE_LA_VENTA` (comisión, «me deja el 20 %») da
  $1.250.000. Por defecto rige la primera. Ver `Markup` y `Comisión` en [Cotización](#cotización).
- **La venta se redondea; el neto nunca.** El neto es lo que cobra el mayorista.

## Reserva y operación

| Término | Código | Qué es |
|---|---|---|
| **Archivo de viaje** | `TravelFile` | El expediente completo. Lo que el sector llama "file". **Es el agregado central del dominio.** |
| **Reserva** | `Booking` | Confirmación con un proveedor específico dentro de un archivo. Un archivo tiene varias. |
| **Localizador** | `recordLocator` | Código de la reserva ante el proveedor (PNR en aéreo). |
| **Time limit** | `timeLimit` | Fecha y hora límite para emitir o pagar antes de que se libere el cupo. **Si se vence, se pierde la reserva.** Es el dato que más dinero cuesta cuando se olvida. |
| **Solicitada** | `BookingStatus` `SOLICITADA` | La agencia **pidió** el cupo al mayorista, con su fecha de solicitud. Todavía no hay nada confirmado. ADR-0024 §3.4 |
| **En espera** | `BookingStatus` `EN_ESPERA` | Opcional: el mayorista dejó la reserva «en solicitud» (típico de hotel) y aún no la confirma |
| **Confirmada** (por el mayorista) | `BookingStatus` `CONFIRMADA` | **El mayorista confirmó** la reserva. En la agencia «confirmado» significa esto, no «pagado». Exige el *time limit* que dio el mayorista |
| **Fecha de pago total** | `finalPaymentDue` | Segundo plazo del mayorista: hasta cuándo hay que pagarle el total tras el abono. Se vigila igual que el *time limit*. En la base, `pago_total_vence_en` |
| **Reserva caída** | `BookingStatus` `CAIDA` | El mayorista no sostuvo la reserva: venció un plazo, no hubo cupo o negó la espera. **No se dice «liberada»**: lo que el mayorista libera es su cupo (`release`), no la reserva |
| **Titular** | `leadPassenger` | El pasajero a cuyo nombre va la reserva ante el mayorista. Uno por archivo |
| **Proveedor** | `Supplier` | Quien presta el servicio: aerolínea, hotel, operador, mayorista. |
| **Documento de viajero** | `TravelerDocument` | Pasaporte, cédula, visa, certificado de vacunación. **Dato personal sensible.** |
| **Voucher** | `Voucher` | Comprobante que el pasajero presenta al proveedor. |
| **Penalidad** | `Penalty` | Costo por cambio o cancelación. Varía según cuánto falte para el viaje. En el libro de cobro es un movimiento `PENALIDAD`: lo que la agencia retiene al cancelar el archivo, con motivo y sin superar lo pagado neto. |

## Dinero

| Término | Código | Qué es |
|---|---|---|
| **Unidad mínima de la moneda** | `unidades` (en `Money`) | Cómo se guarda todo monto (R8): entero en la unidad más pequeña **que esa moneda usa**, no en «centavos». En USD son centavos; **en COP es el peso** (`decimales: 0`). Confundirlas produce un error de dos órdenes de magnitud, y ya llegó una vez a la pantalla. Va siempre con el código ISO-4217 |
| **Pago** | `Payment` | Dinero recibido del cliente. Es un movimiento del libro de cobro (tabla `pagos`, ADR-0034); el anticipo es el primer pago, no un tipo aparte. En pantalla, el verbo es **«Registrar pago»**, no «abonar» (ver *Abono*) |
| **Anticipo** | `deposit` | Primer pago del cliente a la agencia. **No confirma la reserva: la confirma el mayorista** (ver *Confirmada*). Suele ser lo que permite a la agencia hacer el abono al mayorista antes del *time limit*. |
| **Cuota** | `Installment` | Pago parcial programado. |
| **Plan de pagos** | `PaymentPlan` | Cronograma de cuotas de un archivo. |
| **Devolución** | `Refund` | Dinero que la agencia devolvió de verdad al viajero. Resta de lo pagado. ADR-0034 §2 |
| **Reverso** | `Reversal` | Anula un movimiento del libro registrado por error: no mueve dinero y copia archivo, monto y moneda del original. **Un movimiento se reversa una sola vez y un reverso no se reversa.** El libro nunca se edita ni se borra: corregir es reversar y registrar el correcto |
| **Ajuste del total** | `TotalAdjustment` | Cargo (`> 0`) o descuento (`< 0`) sobre el total vendido, con motivo. No edita la venta: el total del archivo no cambia nunca |
| **Estado de cobro** | `CollectionStatus` | Si el archivo va a tiempo: `AL_DIA`, `SALDO_PENDIENTE`, `POR_VENCER` (vence en 7 días o menos), `VENCIDO` o `CANCELADO`. Lo calcula el servidor en cada lectura; es **del archivo**, no del contacto ni de la conversación. No es la *Etiqueta* del chat ni la *Situación del saldo*. «Al día» nunca se muestra como «Confirmada»: confirmar es del mayorista |
| **Fecha límite de cobro** | `collectionDueDate` | Hasta cuándo debe estar cobrado el archivo. Por defecto, la salida menos N días (30 si la agencia no fijó otro número), sin nacer vencida; se puede fijar a mano por archivo. Tablas `parametros_de_cobro` y `plazos_de_cobro` |
| **Saldo** | `balance` | Lo que el viajero aún debe: total menos lo pagado neto de devoluciones. **Se calcula, nunca se guarda ni se edita.** Su situación es `SIN_PAGOS`, `PARCIAL`, `PAGADO` o `SALDO_A_FAVOR` |
| **Saldo a favor** | `creditBalance` | Saldo negativo: el viajero pagó más de lo que debe. Se muestra «Saldo a favor $ X»; no se devuelve solo |
| **Conciliación** | `Reconciliation` | Cruce entre lo que dice la pasarela y lo que dice el sistema. |
| **Cuenta por pagar** | `SupplierPayable` | Lo que la agencia le debe al proveedor. |
| **Abono** | (sin término de código propio) | Lo que la **agencia** paga al mayorista (estados `ABONADA_AL_PROVEEDOR` y `PAGADA_AL_PROVEEDOR`). Para lo que paga el **viajero** se dice **«Registrar pago»**, aunque en la calle se diga «el cliente abonó». ADR-0034 §9 |
| **Suscripción** | `Subscription` | Lo que la **agencia** nos paga a nosotros. No confundir con los pagos de sus clientes. |

## Automatización

| Término | Código | Qué es |
|---|---|---|
| **Automatización** | `Automation` | Regla disparador → condición → acción. |
| **Disparador** | `Trigger` | Evento que inicia una automatización. |
| **Secuencia** | `Sequence` | Serie de mensajes programados en el tiempo. |
| **Calificación de lead** | `LeadScore` | Puntaje de intención de compra, **con su justificación visible**. Un puntaje sin explicación no se usa. |
| **Intención de viaje** | `TravelIntent` | Datos estructurados extraídos del chat: destino, fechas, pasajeros, presupuesto. |

---

## Nombres en la interfaz

**Propuesta, no decisión cerrada.** Los nombres de módulo vienen del material de inspiración
([`brochure-de-inspiracion.jpeg`](../_assets/brochure-de-inspiracion.jpeg)) y son un buen punto de partida porque están
en el lenguaje que una agencia ya usa. Se adoptan como propuesta de navegación hasta que el piloto
diga otra cosa. El código, en cualquier caso, sigue usando los nombres de dominio en inglés.

| Módulo en la interfaz | Contexto delimitado | Entidad principal |
|---|---|---|
| Conversaciones | `inbox` | `Conversation` |
| Clientes | `crm` | `Contact`, `Traveler` |
| Oportunidades | `crm` | `Deal` |
| Cotizaciones | `quoting` | `Quote` |
| Reservas | `booking` | `TravelFile`, `Booking` |
| Campañas | `automation` | `Campaign` |
| Reportes | `analytics` | — |
| Equipo | `identity` | `User`, `Role` |
| Configuración | `identity` | `Tenant` |

Dos observaciones sobre esta lista:

- **«Reservas» en la interfaz corresponde a `TravelFile`**, no a `Booking`. Para el usuario, "la
  reserva" es el viaje completo; en el modelo, `Booking` es cada confirmación con un proveedor
  dentro de ese archivo. La interfaz no expone esa distinción, pero el modelo la necesita.
- **«Campañas» está pendiente de decisión de alcance.** Si entra, entra como reactivación
  segmentada, no como difusión masiva: una herramienta de envío masivo mal diseñada es la vía más
  rápida para que un cliente queme su número de WhatsApp. Ver
  [el norte de producto](../00-vision/05-norte-del-producto.md#22-campañas-mal-entendida-es-spam-bien-entendida-es-reactivación).

## Términos prohibidos

Nombres que **no** se usan, porque significan otra cosa o generan ambigüedad:

| No usar | Usar | Por qué |
|---|---|---|
| `Order` | `TravelFile` | Un archivo de viaje no es una orden de compra |
| `Customer` | `Contact` o `Traveler` | Son cosas distintas y la diferencia importa |
| `Ticket` (soporte) | `Conversation` | `Ticket` ya significa entrada o boleto en este dominio |
| `Agent` (IA) | `Agent` = asesor humano | Los agentes de IA son del proceso de desarrollo, no del dominio |
| `Price` sin calificar | `netRate` / `sellRate` | Un precio sin decir cuál es ambiguo y se presta a errores de margen |
| `Reservation` | `Booking` | Un solo nombre para el concepto |

---

## Cómo se agrega un término

1. ¿Existe ya con otro nombre? Si sí, **se usa el existente**. No se agrega sinónimo.
2. Entrada aquí: término en español, nombre en código, definición en una frase precisa.
3. Si genera confusión con uno existente, se documenta la diferencia explícitamente.
4. El agente `experto-turismo` valida que el término sea el que usa el sector, no uno inventado.
