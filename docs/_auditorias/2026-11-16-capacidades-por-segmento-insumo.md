# Mapa de capacidades por segmento del sector turismo (insumo)

**Fecha:** 2026-11-16 · **Autor:** `experto-turismo` · **Tipo:** insumo para `jefe-de-producto` y
`dueno-de-producto`. No es una decisión de alcance ni un ADR.

**Fuentes internas leídas:** `CLAUDE.md`, `docs/01-producto/01-alcance-mvp.md`,
`02-lenguaje-ubicuo.md`, `07-cabeza-de-playa-paquetes.md`, `11-dictamen-del-catalogo-real.md` (por
referencia), `docs/02-arquitectura/02-contextos-delimitados.md`, `docs/05-seguridad/02-proteccion-de-datos.md`
(por referencia). No existe un documento de *personas* en `docs/01-producto/`; las personas de este
insumo salen de la operación del sector, no de un documento del repositorio.

**Lo normativo NO está verificado con fuente** salvo lo que ya cita el repositorio (Ley 1581/2012,
Leyes 679/2001 y 1336/2009, RNT). Todo lo marcado **[verificar]** debe pasar por `investigador`
antes de convertirse en requisito. Ver §6.

---

## 0. Los cinco segmentos y por qué no son el mismo producto

| # | Segmento | Qué vende | Dueño del inventario | Su cliente | Dolor central |
|---|---|---|---|---|---|
| S1 | **Agencia minorista** | Paquetes de mayorista, vuelos, hoteles, seguros | **Otro** (mayorista, aerolínea, hotel) | Viajero final | Convertir chats en ventas sin perder *time limits* ni margen |
| S2 | **Mayorista / operador** | Paquetes armados, tarifas netas, bloqueos aéreos y hoteleros | **Propio** (contratado con *allotment* y *release*) | Agencias minoristas (B2B) | Publicar tarifas a cientos de agencias, controlar cupo y cartera |
| S3 | **Receptivo / DMC / turismo local** | Pasadías, excursiones, salidas con cupo, traslados, guianza | **Propio** (bus, lancha, guía) + proveedores locales | Viajero directo **y** agencias/mayoristas | Que la salida se llene, se opere y se liquide a guías y transportadores |
| S4 | **Operador de actividades con venta directa** | Tours por horario, entradas, experiencias | **Propio**, por turno y aforo | Viajero directo, OTAs (Viator, GetYourGuide, Civitatis) | Aforo en tiempo real por horario, cobro anticipado, check-in, no-show |
| S5 | **Corporativo / MICE / grupos** | Viajes de empresa, eventos, incentivos, grupos | Otro (hoteles, aerolíneas, venues) | Empresa (compra) ≠ participantes (viajan) | Cotizar y operar 30-300 personas con cambios constantes y cobro fraccionado |

**Lo que cambia de fondo entre segmentos, y que el modelo actual debe saber:**

1. **¿De quién es el cupo?** En S1 la disponibilidad se pregunta (ADR-0009: cupo informativo). En
   S2, S3 y S4 **el cupo es de la agencia** y se descuenta al vender. Es la diferencia más grande del
   mapa y hoy el modelo la resuelve solo para S1.
2. **¿Quién es el cliente?** En S2 y en parte de S3 el cliente es **otra agencia**: precio neto,
   comisión, crédito, estado de cuenta. En S5 es una **empresa** con aprobador y centro de costo.
3. **¿Cuál es la unidad que se opera?** En S1 es el *archivo*. En S3/S4 es la **salida o el turno**
   (manifiesto, guía, vehículo, punto de encuentro). En S5 es el **grupo/evento** (rooming list,
   participantes, agenda).

---

## 1. Matriz de capacidades

Leyenda: **I** = IMPRESCINDIBLE (sin esto el segmento no compra o no puede operar) · **D** =
DIFERENCIAL (gana ventas frente a la competencia) · **O** = OPCIONAL · **—** = no aplica.
Columna **Hoy** = estado en ViajaPro según `CLAUDE.md`/`ESTADO.md` a la fecha: ✔ existe, ◐ parcial,
✘ no existe. (Sin emojis: se usan los caracteres ✔ ◐ ✘ como marca de tabla.)

### 1.1 Captación y canal

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Bandeja compartida de WhatsApp (Cloud API), multiasesor, asignación, ventana 24 h | I | I | I | I | D | ✔ |
| Plantillas aprobadas + reactivación **segmentada** (no difusión masiva) | I | D | D | D | O | ◐ |
| Instagram DM / Messenger en la misma bandeja | D | O | D | **I** | O | ✘ |
| Correo en la bandeja (las agencias piden reservas por correo; las empresas mandan RFP por correo) | O | **I** | D | O | **I** | ✘ |
| Formulario web / landing que crea contacto + oportunidad con origen | D | O | D | I | I | ✘ |
| Motor de reservas web con pago (checkout B2C) | O | D | D | **I** | — | ✘ |
| Extranet / portal B2B para agencias revendedoras (consultar tarifa neta, reservar, ver estado de cuenta) | — | **I** | D | O | — | ✘ |
| Atribución de origen (anuncio *click-to-WhatsApp*, campaña, referido) | D | O | D | D | O | ✘ |
| Botón/enlace de WhatsApp desde catálogo público | D | O | D | D | — | ✘ |

### 1.2 CRM y embudo

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Contacto ≠ Viajero (quien paga no viaja) | I | I | I | I | I | ✔ |
| Embudo con etapas configurables y motivo de pérdida obligatorio | I | D | I | O | I | ✔ |
| SLA de primera respuesta y tareas con recordatorio | I | D | I | D | D | ✔ |
| Cuenta B2B (agencia cliente) con condiciones: comisión, crédito, cupo de crédito, RNT de la agencia | O | **I** | I | D | — | ✘ |
| Cuenta corporativa con política de viaje, aprobador, centro de costo | — | — | — | — | **I** | ✘ (`Company` solo nombrada) |
| Historial de viajes del cliente y preferencias (asiento, dieta, alergias, fecha de cumpleaños) | D | O | D | O | D | ◐ |
| Deduplicación por teléfono / documento | I | I | I | I | I | ◐ |

### 1.3 Catálogo y producto

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Paquete como plantilla + vigencia + salida + tarifa (ADR-0009) | I | I | I | D | O | ✔ |
| Temporadas y puentes festivos como vigencias | I | I | I | D | D | ✔ |
| Acomodación SGL/DBL/TPL/CUAD y reparto de habitaciones | I | I | D | — | I | ◐ |
| Edad **al momento del viaje** con rangos por proveedor (CHD 2-11, INF 0-1, que varían por mayorista) | I | I | I | I | D | ◐ |
| Suplementos y opcionales (sencilla, aéreo desde otra ciudad, traslado nocturno, cena de fin de año) | I | I | I | D | D | ◐ |
| Tarifa por grupo (promo pareja) y **mínimo de pasajeros para operar** | D | I | **I** | D | I | ◐ (sin mínimo) |
| Producto armado ítem a ítem (vuelo + hotel + traslado + tour + seguro) | I | I | D | — | I | ✘ (fase 3) |
| Ingesta de tarifario del mayorista (Excel/PDF) | D | — | D | — | — | ✘ |
| Publicación de tarifas a agencias: neto, comisionable, markup por agencia o por canal | — | **I** | I | D | — | ✘ |
| Turnos/horarios por actividad (09:00, 14:00) con aforo propio | — | — | I | **I** | — | ✘ |
| Recursos operativos con capacidad: guía, vehículo, embarcación, idioma del guía | — | D | **I** | I | D | ✘ |
| Catálogo multiidioma (nombre, incluye/no incluye) | O | D | I | I | O | ◐ (ADR-0020) |
| Fotos/galería y ficha pública del producto | D | I | D | I | — | ✘ |

### 1.4 Cotizador e itinerario

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Cotización multi-opción con margen visible al asesor | I | D | I | — | I | ◐ (paquetes) |
| Versionado inmutable de lo que vio el cliente | I | I | I | O | I | ✔ |
| Pieza para WhatsApp + PDF/vista web con marca, **RNT y código ESCNNA** | I | I | I | D | I | ◐ |
| Itinerario día a día visual (con horarios, punto de encuentro) | D | D | I | O | I | ✘ |
| Validez de la cotización y recordatorio de vencimiento | I | D | I | — | I | ◐ |
| Cotizador B2B: la agencia revendedora cotiza con **su** markup y **su** marca sobre el neto del mayorista | — | **I** | D | — | — | ✘ |
| Cotización de grupo por escala de pax (20-29, 30-39…) y **liberados** (1 gratis cada N) | O | D | D | — | **I** | ✘ |
| Cotización de evento: salones, A/V, alimentos y bebidas por persona/día, agenda | — | — | — | — | **I** | ✘ |
| Calculadora rápida «cuánto sale para 2 ADT + 1 CHD el 15 de diciembre» desde el chat | **I** | D | I | I | O | ✔ |

### 1.5 Reservas y archivo de viaje

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Archivo con N reservas por proveedor y **confirmación parcial** (vuelo OK, hotel en espera) | I | I | I | O | I | ✘ |
| *Time limit* por reserva con alerta antes de vencer | **I** | I | I | — | I | ✘ |
| Pasajeros con tipo, edad al viaje, documentos cifrados y acceso auditado | I | I | I | D | I | ✘ (ADR-0015 sin hacer) |
| Vouchers por servicio y envío por WhatsApp | I | I | I | — | I | ✘ |
| Ticket/QR de entrada por reserva | — | — | D | **I** | O | ✘ |
| Cambios y cancelaciones con penalidad por tramo de días, por proveedor | I | I | I | I | I | ✘ |
| *Rooming list* exportable y versionada (el hotel la pide en su formato, cambia hasta el último día) | D | I | I | — | **I** | ✘ |
| Manifiesto de pasajeros por salida (transportador, seguro, parque nacional, capitanía) | — | D | **I** | I | D | ✘ |
| Operación diaria: hora y lugar de recogida por hotel, asignación de guía/vehículo, hoja de ruta | — | O | **I** | I | D | ✘ |
| Check-in en sitio, no-show, lista de espera | — | — | D | **I** | D | ✘ |
| Exoneración/consentimiento de riesgo firmado (aventura) | — | — | D | I | O | ✘ |
| Registro de participantes de un grupo (cada uno carga sus datos) | D | O | O | — | **I** | ✘ |

### 1.6 Proveedores y costos/netos

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Ficha de proveedor: RNT, contactos, política de cancelación, forma de pago | I | I | I | D | I | ◐ |
| Neto por ítem y margen por archivo, **estimado vs real** | I | I | I | D | I | ◐ (neto ausente = margen desconocido, bien) |
| Cuentas por pagar al proveedor con fecha (el mayorista exige el pago total X días antes) | D | **I** | I | D | I | ✘ |
| Estado de cuenta por proveedor (lo que le debo, lo que le pagué, saldos a favor) | D | I | I | O | I | ✘ |
| Liquidación a guías, transportadores y proveedores locales por servicio prestado | — | D | **I** | I | O | ✘ |

### 1.7 Inventario y cupos

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Cupo informativo en la salida | D | — | — | — | — | ✔ (ADR-0009) |
| **Cupo propio que se descuenta al vender**, con bloqueo temporal mientras se paga | — | **I** | **I** | **I** | D | ✘ |
| *Allotment* hotelero con fecha de *release* y bloqueo aéreo con fecha de nombres | — | **I** | D | — | I | ✘ |
| Aforo por turno en tiempo real, sobreventa controlada, cierre de venta X horas antes | — | — | I | **I** | — | ✘ |
| Mínimo para operar y cancelación/fusión de salida que no se llena | — | I | **I** | D | — | ✘ |
| Bloqueo de habitaciones de grupo con *attrition* (penalidad por no usar) | — | D | — | — | **I** | ✘ |
| Sincronía de cupo con OTAs/channel manager | — | D | D | **I** | — | ✘ |

### 1.8 Pagos, abonos, plan de pagos y conciliación

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Plan de pagos: anticipo + cuotas con fecha final **antes** del pago al proveedor | **I** | I | I | O | I | ✘ |
| Registro manual de abono por transferencia/Nequi/Daviplata con foto del soporte recibida por WhatsApp | **I** | I | I | D | I | ✘ |
| Enlace de pago por WhatsApp (Wompi, PayU, ePayco, Bold, Mercado Pago) | I | D | I | I | D | ✘ |
| Checkout con pago total o anticipo obligatorio | — | — | D | **I** | — | ✘ |
| Conciliación pasarela/banco contra sistema | D | **I** | I | I | I | ✘ |
| Pago fraccionado por participante (cada uno paga su parte del archivo) | D | — | O | — | **I** | ✘ |
| Crédito y cartera de agencias B2B (cupo de crédito, mora, bloqueo de venta por mora) | — | **I** | I | D | — | ✘ |
| Reembolsos, saldos a favor y bonos (el cliente que canceló y «queda con saldo») | I | I | I | I | I | ✘ |

### 1.9 Facturación electrónica

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Separar **ingreso propio** (markup/comisión) de **ingreso para terceros** en el archivo **[verificar tratamiento DIAN]** | **I** | I | I | D | I | ◐ (ADR-0023) |
| Emitir/encolar factura electrónica DIAN vía ERP o proveedor tecnológico (Siigo, Alegra, World Office…) | D | **I** | I | I | I | ✘ (fuera de v1) |
| Documento soporte por compras a no obligados a facturar (guías y transportadores informales) **[verificar]** | — | O | I | D | — | ✘ |
| Factura en USD a extranjeros / exención por exportación de servicios turísticos **[verificar]** | — | D | I | D | — | ✘ |
| Notas crédito por cancelación ligadas a la penalidad | D | I | I | I | I | ✘ |
| Otros países: CFDI (MX), SII (CL), ARCA/AFIP (AR), SUNAT (PE) vía proveedor por país | O | O | O | O | O | ✘ |

### 1.10 Comisiones

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Comisión de asesoras **sobre margen**, liquidada **al cobro** (no a la venta), con reversa por cancelación | **I** | I | I | D | I | ✘ (fuera de v1) |
| Asesoras externas / *freelance* desde casa con su propia comisión y sin ver netos de otros | D | — | D | — | — | ✘ |
| Comisión que paga el proveedor (override por volumen, incentivos) registrada como ingreso | D | D | O | — | D | ◐ (ADR-0023) |
| Comisión a agencias revendedoras y su liquidación (neto vs comisionable) | — | **I** | I | D | — | ✘ |
| Comisión a referidores (recepcionistas de hotel, conserjes, *influencers*) | O | — | D | I | — | ✘ |

### 1.11 Postventa

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Recordatorios pre-viaje por plantilla (documentos, check-in, punto y hora de encuentro) | I | O | **I** | **I** | I | ✘ |
| Contacto de emergencia durante el viaje y registro de incidencias | D | D | I | D | I | ✘ |
| Encuesta post-viaje / NPS | D | D | D | D | D | ✘ |
| Solicitud de reseña en Google/TripAdvisor | O | — | D | **I** | — | ✘ |
| Fidelización: cumpleaños, aniversario de viaje, recompra por temporada | D | O | O | O | D | ✘ |
| PQR (peticiones, quejas, reclamos) con plazos **[verificar plazos Estatuto del Consumidor]** | I | I | I | I | I | ✘ |

### 1.12 Portal / app del viajero

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Enlace único del archivo sin contraseña: itinerario, vouchers, saldo, botón de pago | D | — | D | I | I | ✘ |
| Formulario para que el titular cargue los datos de sus acompañantes (en vez de 4 fotos de cédula por WhatsApp) | D | — | D | D | **I** | ✘ |
| Autogestión de la reserva: cambiar horario, cancelar dentro de política | — | — | O | **I** | — | ✘ |
| Portal B2B (ver 1.1) | — | I | D | — | — | ✘ |
| App nativa | O | O | O | O | O | ✘ |

### 1.13 Automatizaciones

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Alertas de sistema: *time limit*, cuota vencida, cotización por vencer, chat sin respuesta | **I** | I | I | I | I | ◐ |
| Seguimiento automático de cotización enviada sin respuesta (plantilla a las 24/72 h) | I | O | I | D | D | ✘ |
| Secuencias pre/post viaje por tipo de producto | D | O | I | I | D | ✘ |
| Reglas configurables disparador → condición → acción | D | D | D | D | D | ✘ |
| Liberación automática del bloqueo de cupo si no se paga el anticipo | — | I | I | **I** | — | ✘ |

### 1.14 Reportes / BI

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Ventas y **margen** por asesor, destino, proveedor, mes | I | I | I | D | I | ◐ |
| Embudo, motivo de pérdida, tiempo de respuesta | I | D | I | O | D | ✔ |
| Cartera por cobrar y por pagar (flujo de caja a 30/60/90 días) | I | I | I | D | I | ✘ |
| Ocupación por salida/turno y punto de equilibrio | — | I | **I** | **I** | — | ✘ |
| Ventas por agencia revendedora / por canal (OTA, directo, B2B) | — | I | I | I | — | ✘ |
| Reportes estadísticos a la autoridad de turismo **[verificar obligación y formato]** | O | O | O | O | O | ✘ |
| Benchmark anónimo entre agencias | O | O | O | O | O | ✘ (horizonte) |

### 1.15 IA

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Extracción de intención («Cartagena en diciembre, somos 4 con dos niños») → borrador de cotización | **D** (el diferencial) | O | D | D | D | ✘ |
| Respuesta sugerida y resumen de conversación | D | O | D | D | D | ✘ |
| Ingesta de tarifario Excel/PDF a vigencias y tarifas | D | — | D | — | — | ✘ (diseñada) |
| Lectura de cédula/pasaporte desde foto a ficha de pasajero (con PII cifrada) | D | O | D | O | D | ✘ |
| Agente de autoatención de disponibilidad y reserva por WhatsApp | O | O | D | D | — | ✘ (fuera de v1, correcto) |

### 1.16 Multi-moneda / TRM

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| Moneda por ítem y TRM de la agencia congelada en la cotización | **I** (internacional) | I | I | D | I | ◐ (dinero R8 sí; paquete en una moneda) |
| Política de diferencia cambiaria en abonos (cotizado en USD, abonos en COP: ¿TRM congelada o del día del abono?) | **I** | I | D | — | I | ✘ |
| Costo en USD al proveedor vs cobro en COP: margen cambiario visible | D | I | D | — | D | ✘ |
| Precio en USD para extranjeros y en COP para nacionales del mismo producto | — | D | **I** | I | — | ✘ |

### 1.17 Cumplimiento

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| RNT vigente de la agencia en cotización, contrato y pieza; alerta de renovación **[verificar periodicidad]** | I | I | I | I | I | ◐ |
| Código de conducta ESCNNA (Leyes 679/2001 y 1336/2009) exhibido y aceptado por el cliente en el flujo | **I** | I | **I** | I | I | ◐ (páginas legales) |
| Menores que viajan: dato de con quién viajan y aviso de permiso de salida del país **[verificar requisitos de Migración]** | I | D | D | O | O | ✘ |
| Habeas data (Ley 1581/2012): autorización previa registrada, finalidades, derechos del titular, PII cifrada | I | I | I | I | I | ◐ (ADR-0015 pendiente) |
| Contrato / condiciones del servicio con aceptación registrada (versión que aceptó y cuándo) | I | I | I | I | I | ✘ |
| Seguro de asistencia: registrar que **se ofreció** y si se aceptó o rechazó; requisito por destino (Schengen, otros) **[verificar]** | **I** | D | O | — | I | ✘ |
| Pólizas y normas técnicas para turismo de aventura **[verificar NTS aplicables]** | — | — | D | I | — | ✘ |
| Contribución parafiscal al turismo: base calculable desde el sistema **[verificar base y tarifa]** | D | D | D | D | D | ✘ |
| Retención y supresión de datos de viajeros al terminar la finalidad | I | I | I | I | I | ✘ |

### 1.18 Integraciones

| Capacidad | S1 | S2 | S3 | S4 | S5 | Hoy |
|---|---|---|---|---|---|---|
| WhatsApp Cloud API (oficial, ADR-0002) | I | I | I | I | I | ✔ |
| Pasarelas colombianas (Wompi, PayU, ePayco, Bold, Mercado Pago) | I | D | I | **I** | D | ✘ |
| ERP contable / facturación electrónica (Siigo, Alegra, World Office) | D | **I** | I | D | I | ✘ |
| GDS (Amadeus, Sabre, Travelport) o consolidador aéreo: importar PNR | O (D si vende aéreo) | D | O | — | **I** | ✘ |
| Bancos de camas (Hotelbeds, WebBeds, Expedia TAAP) y sistemas de mayoristas (Juniper y similares) | D | I | D | — | D | ✘ |
| OTAs de actividades y channel manager (Viator, GetYourGuide, Civitatis) | — | O | I | **I** | — | ✘ |
| Calendario (Google) para guías y recursos | — | — | D | D | O | ✘ |
| Meta Ads (*click-to-WhatsApp* y API de conversiones) | D | O | D | D | — | ✘ |
| Correo transaccional | I | I | I | I | I | ◐ |

---

## 2. Lo que la matriz no dice y el operador sí sabe (casos reales)

1. **S1 — Diferencia cambiaria en abonos.** Paquete a Punta Cana cotizado en USD 1.200 a TRM
   4.100 el 1 de agosto. La cliente abona COP 1.000.000 cada mes. En noviembre la TRM está en 4.350.
   ¿Debe USD o debe COP? Cada agencia lo resuelve distinto (congela en el anticipo, recalcula el
   saldo, o vende en COP y asume el riesgo). Es **política por tenant** (R12) y si el sistema no la
   tiene, el saldo que ve el asesor está mal. Severidad para S1: **importante**.
2. **S1 — El abono llega como foto.** El 80 % de los pagos de una agencia pequeña no pasan por
   pasarela: son una transferencia y un pantallazo por WhatsApp. Si el único camino para registrar
   un pago es la pasarela, el plan de pagos queda vacío. **Bloqueante** para el bloque de pagos.
3. **S1 — Comisión de asesora sobre venta.** Si se liquida sobre venta, la asesora que regala el
   margen para cerrar gana más que la que vende bien. Y si se liquida al vender y el cliente cancela,
   hay que reversar. Hoy está fuera de v1; dolerá en el mes dos: **importante**.
4. **S3 — El cupo informativo no sirve.** ADR-0009 dice que la disponibilidad es del mayorista. Para
   un receptivo de Buenaventura o de Santa Marta, **la lancha es suya**: 40 sillas, y la silla 41 es
   un problema en el muelle. Si S3 es foco, el cupo propio que se descuenta es **bloqueante**. Esto
   contradice el supuesto de ADR-0009 para S3, no para S1; la decisión es de `arquitecto`.
5. **S3 — Mínimo para operar.** Salida a Piangüita con mínimo de 15 pax. El jueves hay 9. ¿Se
   cancela, se fusiona con otra fecha, se opera a pérdida? Si el sistema no muestra «faltan 6 para
   el mínimo, decide antes del miércoles 18:00», el operador lo lleva en un cuaderno.
6. **S3 — La operación del día.** A las 05:30 el guía necesita la lista: nombre, hotel, hora de
   recogida, edad (chaleco infantil), quién pagó saldo y quién debe cobrarse en sitio. Sin
   **manifiesto** y **hoja de ruta**, el receptivo no puede usar el sistema el día que más lo necesita.
7. **S5 — La rooming list cambia hasta la víspera.** 120 personas, 60 habitaciones, el hotel cobra
   *attrition* si se liberan más del 10 % después de la fecha de corte. Sin versiones de rooming list
   y sin fecha de corte visible, el costo aparece en la factura del hotel después del evento.
8. **S2 — Mora de una agencia.** El mayorista que sigue vendiéndole a crédito a una agencia con 60
   días de mora pierde dinero. El sistema debe bloquear la venta B2B por mora, no solo reportarla.
9. **Todos — Menores.** Una abuela viaja con dos nietos a Miami. El sistema debe preguntar con quién
   viajan los menores y recordar el permiso de salida. No es solo cumplimiento migratorio: es la
   parte operativa del compromiso ESCNNA. Requisitos exactos **[verificar]**.

---

## 3. Mínimo para competir en S1 + S3 (agencias colombianas pequeñas y medianas)

Criterio: lo que, si falta, hace que una agencia de 3-15 personas **no cambie** su combinación actual
de WhatsApp Business + Excel + cuaderno.

| # | Capacidad mínima | S1 | S3 | Estado | Severidad si falta |
|---|---|---|---|---|---|
| M1 | Bandeja WhatsApp compartida, asignación, plantillas, SLA | ✔ | ✔ | ✔ | — |
| M2 | Contacto ≠ viajero, embudo, motivo de pérdida | ✔ | ✔ | ✔ | — |
| M3 | Catálogo paquete/vigencia/salida/tarifa con edades, suplementos, tarifa por grupo, acomodación opcional | ✔ | ✔ | ◐ | importante |
| M4 | Cotización rápida desde el chat + pieza para WhatsApp/PDF con RNT y ESCNNA, versionada | ✔ | ✔ | ◐ | importante |
| M5 | Archivo de viaje con pasajeros, reservas por proveedor, confirmación parcial, vouchers | ✔ | ✔ | ✘ | **bloqueante** |
| M6 | *Time limit* con alerta | ✔ | ✔ | ✘ | **bloqueante** (S1) |
| M7 | **Cupo propio** por salida que se descuenta al vender, con bloqueo mientras se paga | — | ✔ | ✘ | **bloqueante** (S3) |
| M8 | Mínimo para operar y estado de la salida (confirmada / en riesgo / cancelada) | — | ✔ | ✘ | importante |
| M9 | Manifiesto por salida + punto/hora de recogida | — | ✔ | ✘ | **bloqueante** (S3) |
| M10 | Plan de pagos con anticipo, cuotas y **registro manual de abono con soporte** | ✔ | ✔ | ✘ | **bloqueante** |
| M11 | Enlace de pago por pasarela colombiana | ✔ | ✔ | ✘ | importante |
| M12 | Neto, margen por archivo y cuentas por pagar al proveedor con fecha | ✔ | ✔ | ◐ | importante |
| M13 | Penalidades y saldos a favor | ✔ | ✔ | ✘ | importante |
| M14 | TRM congelada y política de abonos en moneda distinta | ✔ | ◐ (precio USD/COP) | ◐ | importante |
| M15 | Comisión de asesora sobre margen, al cobro | ✔ | ✔ | ✘ | importante |
| M16 | Recordatorios pre-viaje y encuesta post-viaje por plantilla | ✔ | ✔ | ✘ | importante |
| M17 | Cumplimiento: habeas data con PII cifrada (ADR-0015), ESCNNA aceptado, contrato aceptado, oferta de seguro registrada | ✔ | ✔ | ◐ | **bloqueante** (PII de pasajeros sin cifrar = no se puede abrir el archivo de viaje) |
| M18 | Reportes: margen por asesor/destino, cartera por cobrar y por pagar, ocupación por salida | ✔ | ✔ | ◐ | importante |
| M19 | Separación ingreso propio / de terceros + exportación al ERP para facturar | ✔ | ✔ | ◐ | importante (la FE la emite el ERP de la agencia) |

**Diferenciales que nos separan de la competencia en S1+S3** (no mínimos, pero son la razón de
elegirnos): extracción de intención desde el chat (IA), ingesta de tarifario del mayorista, margen
por archivo en tiempo real, enlace del archivo para el viajero, formulario de datos de acompañantes,
lectura de cédula/pasaporte por foto.

**Lo que se puede dejar fuera sin perder la venta en S1+S3:** GDS, bancos de camas, app nativa,
reglas de automatización configurables, Instagram (S3 lo pedirá pronto), benchmark, facturación en
otros países.

---

## 4. Qué hace falta para abrir los otros segmentos

### S2 — Mayorista / operador (salto grande: cambia el cliente y el dueño del inventario)
1. **Cuenta B2B** (agencia cliente) con comisión, crédito, cartera y bloqueo por mora.
2. **Publicación de tarifas** neto/comisionable por agencia o canal; cotizador B2B con marca de la
   agencia revendedora.
3. **Extranet B2B**: consultar, bloquear, reservar y ver estado de cuenta sin escribir por WhatsApp.
4. **Allotment** con *release* y bloqueos aéreos con fecha de nombres.
5. Conciliación y **facturación electrónica integrada** (no opcional: factura a cientos de agencias).
6. Integración con bancos de camas / proveedores contratados; correo en la bandeja.

### S4 — Actividades con venta directa (salto de canal: el cliente se atiende solo)
1. **Turnos con aforo** en tiempo real y cierre de venta.
2. **Motor de reservas web con checkout** y pago obligatorio; autogestión de cambio/cancelación.
3. **Ticket/QR, check-in, no-show**, lista de espera.
4. **Channel manager / OTAs** (Viator, GetYourGuide, Civitatis) con sincronía de cupo: sin esto hay
   sobreventa.
5. Instagram en la bandeja, solicitud de reseñas, exoneración de riesgo firmada.

### S5 — Corporativo / MICE / grupos (salto de comprador: la empresa compra, otros viajan)
1. **Cuenta corporativa** con política de viaje, aprobador y centro de costo.
2. **Cotización de grupo** por escalas de pax y liberados; **cotización de evento** (salones, A/V,
   A&B por persona/día, agenda).
3. **Registro de participantes** (cada uno carga sus datos) y **pago fraccionado por participante**.
4. **Rooming list** versionada, fecha de corte y *attrition*.
5. GDS/consolidador para aéreo de grupo; correo en la bandeja; factura a la empresa con centro de
   costo.
6. Es «otro producto, otro comprador» como dice `01-alcance-mvp.md` (v3): coincido. Grupos de ocio
   (excursión de colegio, peregrinación, quinceañera) sí cabe antes, con rooming list + participantes
   + pago fraccionado, sin la parte corporativa.

---

## 5. Términos nuevos propuestos para el lenguaje ubicuo

No se editó `docs/01-producto/02-lenguaje-ubicuo.md` porque el encargo limitó la escritura a este
archivo. Propuesta para que `documentador` o `analista-producto` los incorpore cuando entren al
alcance:

| Término | Código | Definición |
|---|---|---|
| Lista de habitaciones | `RoomingList` | Reparto de pasajeros por habitación que se envía al hotel. Versionada: cambia hasta la fecha de corte |
| Manifiesto | `PassengerManifest` | Lista de pasajeros de una salida o turno para el transportador, el guía o la autoridad |
| Mínimo para operar | `MinimumToOperate` | Pasajeros mínimos para que una salida se realice; con fecha de decisión |
| Liberación de cupo | `release` | Fecha en que el cupo bloqueado no vendido vuelve al proveedor sin penalidad |
| Liberado | `complimentary` (FOC) | Plaza gratuita que el proveedor concede por cada N pasajeros pagos en un grupo |
| *Attrition* | `attrition` | Penalidad por usar menos habitaciones de las bloqueadas para un grupo |
| Agencia revendedora | `ResellerAgency` | Agencia cliente de un mayorista o receptivo (B2B). Tiene comisión, crédito y estado de cuenta |
| Recurso operativo | `OperatingResource` | Guía, vehículo o embarcación con capacidad asignada a una salida o turno |
| Turno | `TimeSlot` | Horario concreto de una actividad con aforo propio |
| Punto de encuentro | `MeetingPoint` | Lugar y hora de recogida de un pasajero para una salida |
| Abono | `deposit` / `Payment` | Uso coloquial de «pago parcial»; hoy `Anticipo` es solo el primero. Precisar si «abono» es sinónimo de `Payment` sobre un plan |
| Saldo a favor | `CustomerCredit` | Dinero del cliente que queda en la agencia tras una cancelación, aplicable a otro viaje |
| Liquidación de comisiones | `CommissionSettlement` | Cálculo y pago periódico de comisiones a asesoras o agencias |

---

## 6. Verificaciones normativas pendientes (para `investigador`; registrar en `ESTADO.md`)

| # | Qué verificar | Por qué importa |
|---|---|---|
| V1 | Tratamiento DIAN de la agencia como intermediaria: ingreso propio vs ingreso para terceros, mandato, qué factura la agencia | Define qué datos debe exportar el archivo al ERP (ADR-0023) |
| V2 | Documento soporte en compras a no obligados a facturar (guías, transportadores informales) | Receptivos (S3) lo viven a diario |
| V3 | Exención de IVA / exportación de servicios turísticos a no residentes y requisitos | Precio USD a extranjeros en S3 |
| V4 | Periodicidad y fecha de renovación del RNT; si debe exhibirse en piezas publicitarias y cotizaciones | Alerta de vencimiento y pieza (ya pendiente desde ADR-0009) |
| V5 | Alcance exacto de la obligación ESCNNA para la agencia: exhibir, hacer aceptar, capacitar, reportar | Ya pendiente en ADR-0009 y dictamen del catálogo |
| V6 | Permiso de salida del país para menores (Migración Colombia) y qué debe advertir la agencia | Flujo de pasajeros menores |
| V7 | Si el seguro de asistencia es obligatorio para algún producto o destino vendido desde Colombia, y la obligación de ofrecerlo | Registro de oferta/rechazo |
| V8 | Normas técnicas sectoriales de turismo de aventura y pólizas exigidas | S4 y parte de S3 |
| V9 | Contribución parafiscal al turismo (FONTUR): base para agencias (¿comisión o venta?) y tarifa | Reporte calculable |
| V10 | Plazos de respuesta a PQR y derecho de retracto en servicios turísticos (Estatuto del Consumidor) | Postventa y cancelaciones |
| V11 | Reportes estadísticos obligatorios de prestadores de servicios turísticos | BI regulatorio |
