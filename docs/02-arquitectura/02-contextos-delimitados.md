# Contextos delimitados

Cómo se parte el dominio y cómo se hablan las partes. Cada contexto es un módulo en
`apps/api/src/modules/<contexto>/`, con sus cuatro capas y su propia frontera.

**Criterio de partición:** un contexto delimitado tiene su propio lenguaje, su propio ciclo de vida
y podría, en teoría, ser un servicio separado. Si solo es "un grupo de pantallas", no es un contexto.

---

## 1. El mapa

```mermaid
flowchart TB
    subgraph Núcleo["Núcleo del negocio"]
        CRM["crm<br/>contactos · oportunidades · pipeline"]
        QUO["quoting<br/>catálogo y precio · cotizaciones · itinerarios"]
        BOO["booking<br/>archivos · reservas · pasajeros"]
    end

    subgraph Canal
        INB["inbox<br/>conversaciones · mensajes · plantillas"]
    end

    subgraph Soporte
        IDE["identity<br/>tenants · usuarios · roles · suscripción"]
        PAY["payments<br/>cobros · cuotas · conciliación"]
        AUT["automation<br/>reglas · secuencias · IA"]
        ANA["analytics<br/>métricas · reportes"]
        NOT["notifications<br/>correo · push · in-app"]
        AUD["audit<br/>bitácora · consentimientos"]
    end

    INB -- "MessageReceived" --> CRM
    INB -- "MessageReceived" --> AUT
    CRM -- "DealQualified" --> QUO
    QUO -- "QuoteAccepted" --> BOO
    BOO -- "TravelFileConfirmed" --> PAY
    BOO -- "TimeLimitApproaching" --> NOT
    PAY -- "PaymentReceived" --> BOO
    AUT -- "envía" --> INB
    IDE -. "contexto de tenant" .-> Núcleo
    IDE -. .-> Soporte
    Núcleo -. "eventos" .-> ANA
    Núcleo -. "eventos" .-> AUD
```

Las flechas continuas son eventos de dominio. Las punteadas son dependencias transversales.

---

## 2. Los diez contextos

### `identity` — plataforma

**Posee:** tenants, usuarios, roles, permisos, sesiones, suscripción al SaaS, credenciales cifradas
de integraciones.

**Lenguaje:** Tenant, User, Role, Permission, Subscription, Plan.

Es el único contexto del que **todos** dependen, y solo para una cosa: el `TenantContext`. Esa
dependencia es transversal por diseño; cualquier otra cosa que `identity` empiece a saber del
negocio es una señal de que se está convirtiendo en el basurero del sistema.

### `inbox` — conversaciones

**Posee:** canales, conversaciones, mensajes, plantillas, asignaciones, ventana de servicio, SLA.

**Lenguaje:** Conversation, Message, Channel, MessageTemplate, ServiceWindow, Assignment.

**Publica:** `MessageReceived`, `MessageSent`, `MessageStatusChanged`, `ConversationAssigned`,
`ServiceWindowClosing`.

Es el contexto con el perfil de carga más exigente: mayor volumen de escritura y el requisito más
duro de latencia. Se diseña pensando en que `messages` será la tabla más grande del sistema.

### `crm` — relación comercial

**Posee:** contactos, viajeros, empresas, oportunidades, etapas, actividades, tareas.

**Lenguaje:** Contact, Traveler, Company, Deal, Stage, Activity, Task, LossReason.

**Publica:** `DealCreated`, `DealStageChanged`, `DealWon`, `DealLost`.
**Consume:** `MessageReceived` (crea o actualiza el contacto), `TravelIntentExtracted`.

La distinción `Contact` / `Traveler` es deliberada y viene del negocio: **quien paga no siempre
viaja.** Un modelo que los fusiona se rompe en el primer viaje familiar.

### `quoting` — cotización

**Posee:** el catálogo y su precio —paquetes, vigencias, salidas, tarifas y la política de precio de
cada agencia—, proveedores, cotizaciones, versiones, opciones, ítems, itinerarios, cálculo de markup
y margen, generación de propuestas.

**Lenguaje:** Quote, QuoteOption, QuoteItem, TravelProduct, Supplier, Package, Vigencia, Departure,
Fare, PricingPolicy, Rate, Markup, Margin, Itinerary, Segment.

**Publica:** `QuoteCreated`, `QuoteSent`, `QuoteAccepted`, `QuoteExpired`. Previstos por
[ADR-0009](../03-adr/0009-salida-programada-como-unidad-de-venta.md) y **todavía sin implementar**:
`DepartureScheduled` y `DeparturePriced`.
**Consume:** `DealQualified`.

**Dónde termina el catálogo.** `quoting` posee `Package`, `Vigencia`, `Departure` y `Fare` porque son
catálogo y precio: se resuelven y se cotizan aquí. En el código viven en
`apps/api/src/modules/quoting/` (`GET /api/v1/catalogo/salidas`, `POST /api/v1/catalogo/cotizar`).
**Lo que ocurre después de vender una silla** —reservar contra el mayorista, su *time limit*, el
pasajero, el archivo— es de `booking`, que **referencia** la vigencia o la salida por identificador
(regla 2 de §3). ADR-0009 no crea un módulo `operations` ni un agregado de inventario: para quien
revende, la disponibilidad es del mayorista.

Es el contexto con la lógica más densa: multi-moneda, multi-pasajero, impuestos, markup contra
comisión, versionado. **La cotización que vio el cliente nunca cambia**: una modificación crea una
versión nueva. Sin eso, no hay forma de resolver una disputa sobre qué se ofreció.

### `booking` — operación del viaje

**Posee:** archivos de viaje, reservas por proveedor, pasajeros, documentos, *time limits*,
vouchers, cancelaciones y penalidades.

**Lenguaje:** TravelFile, Booking, Passenger, TravelerDocument, Supplier, TimeLimit, Voucher, Penalty.

**Publica:** `TravelFileCreated`, `TravelFileConfirmed`, `TimeLimitApproaching`, `TripStarting`,
`TripCompleted`.
**Consume:** `QuoteAccepted`, `PaymentReceived`.

`TravelFile` es **el agregado central del dominio**. Todo converge aquí.

`TimeLimitApproaching` es el evento que más dinero salva del sistema: una reserva con el plazo
vencido es un cupo perdido y una venta caída.

### `payments` — dinero de los viajeros

**Posee:** planes de pago, cuotas, transacciones, conciliación, cuentas por pagar a proveedores.

**Lenguaje:** Payment, Installment, PaymentPlan, Reconciliation, SupplierPayable.

**Publica:** `PaymentReceived`, `PaymentFailed`, `InstallmentOverdue`.
**Consume:** `TravelFileConfirmed`.

Separado de `identity` a propósito: una cosa es lo que el **viajero** le paga a la agencia, y otra
lo que la **agencia** nos paga a nosotros. Mezclarlos produce un modelo que nadie entiende en seis
meses.

**Idempotencia absoluta.** Un webhook de pago duplicado no puede cobrar dos veces.

### `automation` — reglas e IA del producto

**Posee:** automatizaciones, disparadores, secuencias, calificación de leads, extracción de
intención, respuestas sugeridas, resúmenes.

**Lenguaje:** Automation, Trigger, Condition, Action, Sequence, LeadScore, TravelIntent.

**Publica:** `TravelIntentExtracted`, `LeadScored`, `AutomationExecuted`.
**Consume:** prácticamente todos los eventos del sistema.

Es el contexto con más riesgo de convertirse en el basurero de la lógica que no encaja en ningún
lado. Regla: **`automation` orquesta, no decide reglas de negocio.** El cálculo de un markup vive
en `quoting`, siempre.

### `analytics` — medición

**Posee:** proyecciones de lectura, agregados, definiciones de métricas, reportes.

Consume eventos y construye vistas de lectura. **No escribe en el modelo transaccional.**

### `notifications` — avisos

**Posee:** plantillas de correo, preferencias, envíos, notificaciones en la aplicación.

Avisa a los **usuarios de la agencia**. No confundir con `inbox`, que habla con los **viajeros**.

### `audit` — rastro

**Posee:** bitácora de acciones, registro de consentimientos, acceso a datos sensibles.

**Solo escribe.** Nadie modifica ni borra registros de auditoría. Consume eventos de todos.

---

## 3. Reglas de frontera

1. **Ninguna importación directa entre módulos.** El hook `PostToolUse` avisa cuando aparece.
2. **Los datos de otro contexto se referencian por identificador**, no por objeto. `crm` guarda
   `conversationId`, no una entidad `Conversation`.
3. **Cada contexto posee sus tablas.** Nadie consulta las tablas de otro, ni "solo para leer".
   Si necesitas datos de otro contexto, es un puerto o una proyección de lectura propia.
4. **Los eventos son contrato público** y se versionan. Cambiar la forma de un evento publicado
   rompe a sus consumidores, igual que cambiar una API.
5. **Todo consumidor de evento es idempotente.** El mismo evento puede llegar dos veces.

---

## 4. Orden de construcción

Las dependencias mandan. Este orden es también el del [roadmap](../08-roadmap/01-roadmap.md):

```
identity → inbox → crm → quoting → booking → payments → automation → analytics
                    ↑                                         ↑
           notifications y audit se construyen en paralelo desde el inicio
```

`identity` primero porque todo depende del contexto de tenant. `inbox` segundo porque es el canal
y sin él no hay producto. `analytics` al final porque necesita que existan eventos que medir.
