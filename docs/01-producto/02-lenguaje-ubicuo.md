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
| **TRM aplicada** | `exchangeRate` | Tasa de cambio congelada en la cotización, con su fecha. No se recalcula después. |
| **Itinerario** | `Itinerary` | Secuencia de días y servicios del viaje. |
| **Segmento** | `Segment` | Tramo dentro de un itinerario: un vuelo, una noche, un traslado. |

## Paquetes (la cabeza de playa)

Términos del producto que vende una agencia minorista. Ver
[cabeza de playa](07-cabeza-de-playa-paquetes.md).

| Término | Código | Qué es |
|---|---|---|
| **Paquete** | `TravelPackage` | Producto ya armado por un mayorista: destino, duración, inclusiones y precio. **Es el ítem de cotización de la primera rebanada.** |
| **Mayorista** | `Wholesaler` | Quien arma el paquete y se lo vende a la agencia. Un tipo de `Supplier` |
| **Inclusiones** | `inclusions` | Qué trae el paquete: vuelo, hotel, traslados, alimentación, tours, seguro |
| **Acomodación** | `Occupancy` | Cuántas personas por habitación: `SINGLE`, `DOUBLE`, `TRIPLE`, `QUADRUPLE`. **El precio por persona cambia con la acomodación**, y es un error clásico modelarlo como precio fijo por pasajero |
| **Plan de alimentación** | `MealPlan` | `ALL_INCLUSIVE`, `BREAKFAST`, `HALF_BOARD`, `FULL_BOARD`, `ROOM_ONLY` |
| **Temporada** | `Season` | Rango de fechas con precio propio: alta, baja, puente festivo. En Colombia los puentes son su propia temporada |
| **Cupo** | `Allotment` | Plazas que el mayorista tiene bloqueadas. Se agotan |
| **Tarifario** | `RateSheet` | El documento del mayorista con precios por temporada y acomodación. Hoy llega en Excel o PDF |
| **Salida** | `Departure` | Fecha concreta en que opera un paquete. Un paquete tiene muchas |

Dos cosas que un modelo hecho desde fuera del sector siempre olvida:

- **El precio depende de la acomodación, no solo del número de pasajeros.** Cuatro personas en dos
  habitaciones dobles no cuestan lo mismo que cuatro en una cuádruple.
- **Los niños tienen edad de corte y cupo por habitación.** «Niño gratis compartiendo habitación con
  dos adultos» es una condición comercial real que el modelo debe poder expresar.

## Reserva y operación

| Término | Código | Qué es |
|---|---|---|
| **Archivo de viaje** | `TravelFile` | El expediente completo. Lo que el sector llama "file". **Es el agregado central del dominio.** |
| **Reserva** | `Booking` | Confirmación con un proveedor específico dentro de un archivo. Un archivo tiene varias. |
| **Localizador** | `recordLocator` | Código de la reserva ante el proveedor (PNR en aéreo). |
| **Time limit** | `timeLimit` | Fecha y hora límite para emitir o pagar antes de que se libere el cupo. **Si se vence, se pierde la reserva.** Es el dato que más dinero cuesta cuando se olvida. |
| **Proveedor** | `Supplier` | Quien presta el servicio: aerolínea, hotel, operador, mayorista. |
| **Documento de viajero** | `TravelerDocument` | Pasaporte, cédula, visa, certificado de vacunación. **Dato personal sensible.** |
| **Voucher** | `Voucher` | Comprobante que el pasajero presenta al proveedor. |
| **Penalidad** | `Penalty` | Costo por cambio o cancelación. Varía según cuánto falte para el viaje. |

## Dinero

| Término | Código | Qué es |
|---|---|---|
| **Pago** | `Payment` | Dinero recibido del cliente. |
| **Anticipo** | `deposit` | Primer pago que confirma la reserva. |
| **Cuota** | `Installment` | Pago parcial programado. |
| **Plan de pagos** | `PaymentPlan` | Cronograma de cuotas de un archivo. |
| **Conciliación** | `Reconciliation` | Cruce entre lo que dice la pasarela y lo que dice el sistema. |
| **Cuenta por pagar** | `SupplierPayable` | Lo que la agencia le debe al proveedor. |
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
