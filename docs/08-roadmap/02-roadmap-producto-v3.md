# Roadmap de producto v3: HubSpot como norte, el turismo como ventaja

| Campo | Valor |
|---|---|
| Versión | 3 (de producto). **Propuesta**, pendiente de aprobación del propietario |
| Fecha | 2026-10-26 |
| Autor | `jefe-de-producto` |
| Decisión que la origina | Propietario, 2026-10-26: usar HubSpot como norte de producto, adaptado al turismo, «y lleguemos ahí» |
| Relación con el roadmap v2 | **No lo sustituye.** `01-roadmap.md` es técnico (endurecimiento, M1–M6, criterios C1–C5) y sigue mandando sobre cuándo entra una agencia real con datos de viajeros. Este documento ocupa el hueco que su §5 dejó abierto: **qué producto** se construye encima y en qué orden |
| Fuentes | Inventario verificado de HubSpot (`docs/_investigacion/2026-10-26-hubspot.md`, rama `docs/investigacion-hubspot`), ADR-0017, `roadmap/tasks.yaml` (T-016 a T-031), `ESTADO.md`, y el código de `main` en `140b1ac` |

> **Convención de este documento.** Una cifra de HubSpot lleva la marca del inventario: **V**
> (verificada en página oficial), **T** (solo tercero), **I** (inferencia). Lo que no está en el
> inventario ni en el repositorio se marca **supuesto**. El estado de ViajaPro se verificó contra el
> código, no contra la memoria: ver la columna «evidencia» del §2.

---

## 1. Visión y posicionamiento

**Qué somos.** El CRM de una agencia de turismo colombiana que vende por WhatsApp: la conversación,
la cotización por pasajero, la salida y el archivo de viaje en un solo lugar, en pesos, desde el
plan de entrada.

**Contra quién se mide.** HubSpot es el norte porque fija lo que un asesor espera encontrar en un
CRM. Pero **el rival que más clientes nos quita no es HubSpot: es Excel con el WhatsApp personal del
asesor**, que es gratis y ya lo saben usar. HubSpot nos dice qué es «lo mínimo»; Excel nos dice que
lo mínimo tiene que ser más cómodo que no tener nada.

### Dónde igualamos (requisito de entrada, no diferenciador)

Lo que HubSpot da **gratis** (V: 2 usuarios, 1.000 contactos, pipeline, bandeja, formularios,
reuniones, móvil) no se puede vender como lujo. Contactos con historial, pipeline visual, tareas de
seguimiento, bandeja compartida, plantillas de mensaje, reportes básicos, permisos por rol e
importar desde una hoja. Si falta uno de estos, la agencia no compara: se queda en Excel.

### Dónde superamos (la razón de existir)

| Ventaja | Por qué HubSpot no la tiene | Evidencia |
|---|---|---|
| **WhatsApp desde el plan base** | En HubSpot exige Marketing Hub o Service Hub **Professional+**, con incorporación obligatoria de USD 1.500–3.000 y un tope de 1.000 mensajes de plantilla al mes | V [inventario §3] |
| **Cotización por pasajero con neto y margen** | Cotizaciones con líneas de producto, sin lógica por tipo de pasajero; el margen se arma con propiedades calculadas (Pro+) | I sobre V |
| **Salidas, opciones de salida y cupos** | No hay inventario; haría falta objetos personalizados, **solo Enterprise** | V (objetos personalizados) + I |
| **Archivo de viaje con PII cifrada** | Sin objeto equivalente; los casos de viajes reales usan tickets o integraciones a medida | T (casos) + I |
| **COP, TRM y pagos locales** | HubSpot Payments nativo: solo EE. UU., Reino Unido y Canadá; COP **no verificado** con Stripe | T |
| **Precio en pesos, sin cuota de incorporación** | No publica precios en COP; la incorporación aparece al pagar (quejas recurrentes) | V (USD) + T (quejas) |
| **Catálogo que la agencia carga sola** (pantalla, hoja, API, IA) | No hay app de turismo en el marketplace; el turismo se resuelve con integraciones a medida | T + I; ADR-0017 |

### Lo que NO haremos

| No haremos | Razón | Tipo |
|---|---|---|
| Marketing Hub: correo masivo, landing pages, SEO, anuncios, contactos de marketing | Una agencia pequeña vende 1:1 por WhatsApp; es otro producto y otro comprador | No aplica |
| CMS / sitio web | La agencia ya tiene web (JD Tours la tiene); competir con Wix/WordPress no defiende nada | No aplica |
| Llamadas con minutos y números telefónicos | Uso bajo en Colombia (I del inventario); integración con operador = deuda permanente | Costo |
| Objetos personalizados genéricos y workflows ilimitados | Es el camino a ser un CRM genérico peor que HubSpot (ADR-0006, R12). Nuestros objetos de turismo vienen hechos; la agencia parametriza política, no el dominio | Complejidad |
| Help desk con tickets y base de conocimiento | La posventa de una agencia vive en el archivo de viaje y en la conversación | No aplica |
| Marketplace de miles de integraciones | Cada integración es deuda para siempre. Haremos API pública + las 3–5 que pida la piloto | Costo |
| Créditos de IA por uso como modelo de cobro | Factura impredecible: lo que las reseñas de HubSpot castigan («costos opacos», T) | Costo |
| Cuota de incorporación obligatoria | Es la queja más citada de HubSpot (T). La carga inicial la resuelve el producto (ADR-0017), no una factura | Costo |
| Ser procesador de pagos | Integramos una pasarela local; no custodiamos dinero | Costo, riesgo |
| GDS, contabilidad, facturación DIAN propia | Ya decidido fuera de v1 (`01-roadmap.md` §6) | Complejidad |

---

## 2. Mapa de paridad

**Estado de ViajaPro verificado el 2026-10-26 contra `main` (`140b1ac`).** Leyenda: **real** = existe
en la API y/o la web contra datos reales; **maqueta** = pantalla con datos de `lib/mock-*`;
**diseñado** = esquema, contrato o ADR sin ruta de uso; **no existe**. Nada está desplegado: según
`ESTADO.md` (cabecera del 2026-10-20) no hay staging funcionando.

> **Hallazgo que reordena la fase 1.** La bandeja recibe mensajes reales por el webhook, pero
> **no hay ningún adaptador que entregue a Meta lo que el asesor escribe**: en `apps/` no aparece
> `graph.facebook.com`, ni `axios`/`undici`, y el único `fetch(` productivo es el de Postmark
> (`notifications/infrastructure/correo.postmark.ts:57`). `POST conversaciones/:id/mensajes` guarda
> el mensaje y su evento de outbox; el mensaje no sale del sistema. Hoy un asesor **no puede
> contestar a un cliente desde ViajaPro**.

| Capacidad | HubSpot (plan) | ViajaPro hoy | Evidencia | Nuestra versión para turismo | Prioridad |
|---|---|---|---|---|---|
| Contactos | Gratis (V) | **Real, solo lectura.** Se crean al entrar un WhatsApp; no hay alta ni edición por API | `crm.controller.ts`: `GET contactos`, `GET contactos/:id/ficha`; ningún `POST`/`PATCH` | Contacto = cliente/viajero con teléfono E.164, consentimiento (Ley 1581) y su historial de conversaciones y cotizaciones | **P0** |
| Empresas | Gratis (V) | **No existe** | Sin modelo en `schema.prisma` | Solo como «grupo / empresa que paga» de un archivo de viaje; el B2B corporativo es v3 | P2 |
| Pipeline de negocios | Gratis (V) | **Real parcial:** tablero y mover etapa. Sin alta de oportunidad; etapas configurables en maqueta | `GET tablero`, `PATCH oportunidades/:id/etapa`; `configuracion/page.tsx` usa `MOCK_ETAPAS_CONFIGURADAS`; T-025 | Oportunidad nace de la conversación con pax y fecha tentativa; etapas por agencia (T-025) | **P0** |
| Bandeja compartida | Gratis con marca (V) | **Real:** lista, hilo, notas, asignación, estados, tiempo real, visibilidad por asignación | `conversaciones.controller.ts` (10 rutas), `lib/inbox-socket.ts`, CA1–CA17 | Bandeja de WhatsApp como pantalla principal, con la cotización al lado | **P0** |
| WhatsApp | Marketing/Service **Pro+**, incorporación 1.500–3.000, 1.000 plantillas/mes (V) | **Entrada real, salida no existe.** Webhook firmado e idempotente; sin envío a Meta | Ver hallazgo arriba | Enviar y recibir texto, media y plantillas desde el plan base; ventana de 24 h visible y aplicada | **P0** |
| Plantillas de mensaje | Gratis: 3 de correo; Starter 10.000 (V). WhatsApp: se sincronizan de Meta (T) | **Diseñado:** modelo `PlantillaWhatsapp` y contrato; sin ruta | `schema.prisma:1655`, `contracts/src/plantillas.ts`; ningún controlador | Plantillas de WhatsApp aprobadas por Meta + respuestas rápidas con variables de la cotización (precio, fecha, punto de encuentro) | **P0** (respuestas rápidas y 1 plantilla de reapertura) |
| Correo y seguimiento | Gratis (V) | **No existe para clientes.** Postmark solo envía correo transaccional (OTP, invitaciones) | `notifications/` | Correo para enviar la cotización/voucher a quien lo pida. No es el canal principal | P2 |
| Tareas y recordatorios | Gratis (I: el inventario lo pone en «primer día») | **No existe** | Grep `tarea\|recordatorio` en `apps/api/src`: solo pruebas de inbox | «Seguimiento» con fecha sobre la oportunidad o la conversación; aparece en el inicio del asesor (T-020) | **P0** (mínimo) |
| Cotizaciones | Revenue Hub o Sales Pro+ — **contradicción en el inventario** | **Real:** calcular, guardar, versiones inmutables, estados, listar. **Sin PDF ni enlace público ni envío** | `cotizaciones.controller.ts` (5 rutas), `salidas.controller.ts` `POST cotizar`; ADR-0017 tabla «no existe PDF ni enlace» | Cotización por pasajero (adulto/niño/infante), opción de salida, cargos en destino aparte, neto y margen ocultos al asesor sin permiso; **se comparte por WhatsApp como texto (F1) y como enlace con marca (F2)** | **P0** (texto) / P1 (enlace, PDF) |
| Catálogo de productos | Gratis, 100 productos (V) | **Real solo lectura** (API); la gestión no existe; la pantalla de catálogo usa maqueta | `catalogo.controller.ts` (2 `GET`); `catalogo/page.tsx` importa `MOCK_PAQUETES_CATALOGO`; ADR-0017 aceptado, M1/M2 autorizadas | Catálogo de excursiones, pasadías y paquetes con vigencias, tarifas por tipo de pasajero, promo y opciones de salida, cargado por 4 canales (ADR-0017) | **P0** (pantalla) / P1 (hoja, API, IA) |
| Salidas y cupos | No existe; requeriría objetos personalizados Enterprise (V+I) | **Diseñado, informativo:** `vigencias.cupo_total` nulable, «la disponibilidad se pregunta, no se calcula» | `schema.prisma:765-767`; ADR-0009 | Cupo por salida que descuenta al confirmar (para quien opera); informativo para quien revende. **Requiere ADR** | P1 |
| Archivo de viaje | No existe (I) | **Maqueta** | `viajes/page.tsx` importa `MOCK_ARCHIVOS_VIAJE`; no hay modelo `ArchivoViaje` ni `Viajero` | Cotización aceptada → archivo con viajeros (PII cifrada, ADR-0015, R10), pagos, documentos y voucher | P1 |
| Reportes | Gratis con límites (V) | **Maqueta** | `reportes/page.tsx` usa `mock-reportes`; T-021 | Tiempo de primera respuesta, conversaciones → cotizaciones → ventas por asesor, ventas por producto y salida | P1 |
| Automatizaciones y secuencias | Sales/Service **Pro+** (V; contradicción sobre Starter) | **No existe** | — | Pocas reglas fijas de turismo sobre WhatsApp: cotización sin respuesta, recordatorio D-1 con punto de encuentro, saldo pendiente. No un motor de workflows | P1 |
| Formularios y captación | Gratis (V) | **No existe** | — | Enlace click-to-WhatsApp por producto y formulario mínimo que abre conversación con el producto ya elegido | P2 |
| Calendario y reuniones | Gratis 1 enlace (V) | **No existe** | — | Calendario de **salidas** (no de reuniones): qué sale cada día y con cuántos pasajeros | P2 (salidas) / no (reuniones) |
| Móvil | Apps iOS/Android gratis (V) | **Web, revisión a 375 px pendiente** | T-023 | Web responsive que se usa con una mano en el muelle; app nativa fuera de v1 | **P0** (responsive) |
| Permisos y equipos | **No verificado** en el inventario | **Real en API:** roles, permisos, invitaciones, baja, visibilidad. Pantalla de equipo en maqueta | `invitaciones.controller.ts`, `miembros.controller.ts`; `configuracion/page.tsx` usa `MOCK_MIEMBROS_EQUIPO`; T-027 | Roles de agencia (dueño, asesor, operaciones) y el permiso de ver netos | **P0** (invitar asesores) |
| Importación / exportación | **No verificado** | **No existe**; importación de catálogo diseñada | ADR-0017 §4.2 | Importar catálogo y contactos desde la hoja de la agencia; exportar contactos y ventas a CSV (la agencia es dueña de sus datos) | P1 |
| Integraciones y API | Marketplace de 2.000+ apps (V); API por plan no verificado | **Diseñado** solo para catálogo | ADR-0017 §6 (sujeto a `auditor-seguridad`) | API pública de catálogo y luego de cotizaciones/reservas; webhooks salientes. Integraciones a pedido de la piloto | P2 |
| IA | Agent Hub en Pro/Ent, por créditos (V/T) | **No existe**; sin SDK de Anthropic | ADR-0017 tabla de verificación; `docs/09-ia/09-…` no está en `main` | Resumir la conversación, extraer pax y fecha para prellenar la cotización, leer el catálogo de la web o un PDF (ADR-0017 §7). Incluida en el plan, con tope | P1 (catálogo) / P2 (resto) |
| Objetos personalizados | **Solo Enterprise** (V) | **Diseñado:** campos personalizados por entidad, sin ruta | `DefinicionCampoPersonalizado` (`schema.prisma:528`); T-026 | No hay objetos genéricos: los objetos de turismo vienen hechos. Campos propios por agencia en contacto, oportunidad, paquete y archivo | P1 (campos) / **no** (objetos) |
| Pagos | Payments solo EE. UU./RU/CA (T); Stripe con 0,75 % (V) | **No existe** | — | Enlace de pago en COP de una pasarela local, anticipo y saldo, idempotente por cola (R5) | P1 |

---

## 3. Fases con salida medible

Ordenadas por valor para la **piloto JD Tours** (Cartagena, excursiones de un día, venta por
WhatsApp; 19 excursiones en COP por persona, consultado el 2026-10-26 según ADR-0017). Cada fase
termina cuando su criterio de salida se **demuestra**, no cuando se codifica. Terminado = integrado
en `main` (R11).

**Regla de convivencia con el roadmap v2.** Ninguna fase pone datos reales de viajeros en producción
antes de que C1–C5 estén en verde (`01-roadmap.md` §2). Las fases de producto avanzan en paralelo con
M1–M6 donde no compiten; donde compiten, ganan los cimientos.

Carriles: **BE** backend · **FE** frontend (Antigravity) · **DA** datos · **WA** whatsapp · **IA** ingeniero-ia.

### Fase 1 — Piloto utilizable

**Objetivo.** Que un asesor de JD Tours trabaje una jornada entera sin abrir el WhatsApp del
celular: recibe, responde, cotiza, envía la cotización y deja un seguimiento.

| Entregable | Carril | Tareas existentes |
|---|---|---|
| **Envío a Meta**: adaptador detrás del puerto de mensajería que consume el outbox y entrega texto y media; estados de entrega (enviado, entregado, leído, fallido) de vuelta en la bandeja | WA, BE | Nueva. Es el bloqueante de la fase |
| Plantilla de reapertura fuera de la ventana de 24 h (una, aprobada en Meta) y respuestas rápidas | WA, BE, FE | Nueva |
| Alta y edición de contacto; crear oportunidad desde la conversación | BE, FE | Nueva (API) |
| API real por defecto en todas las pantallas; la demostración solo si se pide y se ve | FE | T-016 |
| Catálogo de JD Tours cargado **por la agencia** desde la pantalla: migraciones M1 y M2, CRUD y ajustes | DA, BE, FE | ADR-0017 §4.1; T-031, T-028 |
| Cotizador de excursiones de un día: por persona, promo, cargos en destino aparte, opción de salida | BE, FE | T-017; ADR-0017 §3.1 |
| Tarjeta de excursión con «desde», horarios, qué incluye; estado vacío que guía a cargar | FE | T-018, T-019 |
| **Enviar la cotización por WhatsApp como texto** con formato (producto, fecha, pax, total, no incluido) desde la conversación | BE, FE | Nueva |
| Seguimiento con fecha sobre oportunidad o conversación; inicio del asesor con pendientes | BE, FE | T-020 + nueva (API) |
| Equipo: invitar asesores y asignar rol | FE | T-027 |
| Formato es-CO y revisión a 375 px | FE | T-022, T-023 |

**Criterio de salida (lo que el propietario demuestra ese día).** En staging, con el número de
WhatsApp de JD Tours conectado: un asesor de la agencia atiende al menos **20 conversaciones en
una jornada**; en al menos 5 envía una cotización desde ViajaPro que el cliente **recibe en su
teléfono**; cada conversación sin cerrar termina con un seguimiento fechado; y al final del día el
asesor declara que no abrió el WhatsApp del celular. Mientras C1–C5 no estén en verde, la misma
prueba se hace con el número de prueba de Meta y conversaciones que el personal de la agencia
simula desde sus teléfonos.

**Dependencias externas.** Meta: app, número, y **verificación del negocio** para pasar de 250
conversaciones iniciadas/24 h (ESTADO §2) — iniciada: **no** según ESTADO. Render (staging, M5.1).
Postmark solo para invitaciones (M2.2). La aprobación de la plantilla de reapertura (tiempo **no
verificado**).

**Riesgos.** (1) El envío a Meta no estaba en ningún plan: si se descubre tarde, la piloto ve una
bandeja que no contesta. (2) Que la jornada se haga sobre datos inventados si el catálogo real no se
carga (RG-15). (3) Competir por el mismo carril backend con M1.4 (cifrado) y M2.5 (límite de tasa),
ambos requisitos de C1–C5.

### Fase 2 — Mejor que HubSpot para turismo

**Objetivo.** Lo que HubSpot no puede dar sin Enterprise o sin integración a medida: la cotización
que el cliente abre en su móvil, el archivo de viaje, el catálogo que entra solo, los cupos y el
pago en pesos.

| Entregable | Carril |
|---|---|
| **Cotización compartible**: enlace público firmado con la marca de la agencia y PDF, ambos sobre `presentacion` (ADR-0017 §9); el cliente acepta desde el enlace | BE, FE |
| **Archivo de viaje**: cotización aceptada → archivo con viajeros (PII cifrada, ADR-0015; acceso auditado, R10, M2.6), estado de pago y voucher | DA, BE, FE |
| **Catálogo por hoja (CSV/XLSX)**: plantillas por tipo de producto e importación con previsualización | BE, FE (T-029, T-030) |
| **Catálogo por API pública** (M3 de ADR-0017, tras `auditor-seguridad`) | DA, BE |
| **Catálogo por IA** desde la web o un PDF de la agencia, con revisión humana (ADR-0017 §7; condiciones 4c) | IA, BE, FE |
| **Cupos por salida**: cupo que se descuenta al confirmar el archivo, «quedan 4», agotado. Requiere ADR que decida cupo controlado frente a informativo (ADR-0009 hoy lo deja informativo) | arquitecto, DA, BE, FE |
| **Pagos en COP**: enlace de pago de una pasarela local para anticipo y saldo; conciliación idempotente por cola (R5); ADR de la pasarela | BE |
| Campos personalizados por agencia (contacto, oportunidad) | BE, FE (T-026) |

**Criterio de salida.** El propietario muestra, cronometrado con un caso real de JD Tours: (a) de
la primera pregunta del cliente a la **propuesta abierta en su móvil en menos de 5 minutos** (el
criterio del cotizador que el roadmap v2 mantiene); (b) el cliente acepta y paga un anticipo en el
**sandbox** de la pasarela, y el archivo de viaje cambia de estado sin que nadie lo toque; (c) la
salida muestra un cupo menos; (d) la agencia carga su catálogo completo desde su propia hoja **sin
ayuda nuestra en menos de 30 minutos** (cifra **supuesto**, a medir con la piloto).

**Dependencias externas.** Pasarela de pagos — **sin decidir** (ESTADO §5, pregunta 4: Wompi, PayU,
ePayco o Mercado Pago). DPA con el proveedor del modelo para activar la IA con agencias reales
(ADR-0017 §7.4c). Revisión legal de protección de datos antes de guardar pasaportes (ESTADO §4).

**Riesgos.** Cupos: si JD Tours revende salidas de terceros, el cupo controlado miente (es
**supuesto** que opera las suyas; preguntarlo). Pagos: es dinero, R5 sin excepciones. IA: costo
por documento **no medido**.

### Fase 3 — Automatización y crecimiento

**Objetivo.** Que el sistema trabaje cuando el asesor no está, sin convertirnos en un motor de
workflows genérico.

| Entregable | Carril |
|---|---|
| **Reglas de turismo sobre WhatsApp**, cada una con plantilla aprobada y apagable por agencia: cotización sin respuesta a las 48 h, recordatorio D-1 con hora y punto de encuentro (opciones de salida, ADR-0017 §3.1), saldo pendiente antes de la salida, encuesta posviaje | WA, BE, FE |
| **Reportes reales**: tiempo de primera respuesta, embudo conversación → cotización → venta por asesor, ventas por producto y por salida (T-021 sin maquetas) | BE, DA, FE |
| **Captación**: enlace click-to-WhatsApp por producto y formulario mínimo que abre la conversación con el producto elegido | BE, FE, WA |
| **IA del asesor**: resumen de conversación y extracción de pax/fecha que prellena el cotizador | IA, BE, FE |
| Exportación de contactos y ventas a CSV; importación de contactos | BE, FE |
| API pública de lectura de cotizaciones y archivos; webhooks salientes. Integraciones solo a pedido de clientes que paguen | BE |

**Criterio de salida.** Durante dos semanas en la piloto: el reporte de la agencia muestra el tiempo
de primera respuesta y la conversión por asesor **calculados**, no maquetados; al menos un cliente
que no respondió una cotización la reabre por el recordatorio automático; y cero viajeros se quedan
sin el recordatorio D-1 de una salida confirmada (comprobable en el registro de envíos).

**Dependencias externas.** Meta: aprobación de plantillas de utilidad y **su costo por mensaje en
COP**, que no tenemos (ESTADO §3, tarea 2b; RG-13). Cada regla automática es costo variable de Meta.

**Riesgos.** Que la automatización dispare el costo de Meta por encima del precio del plan.
Spam: Meta baja la calidad del número si los clientes bloquean (consecuencia **no medida**).

### Fase 4 — Escala

**Objetivo.** Abrir segmentos que hoy no servimos y bajar el costo de cada agencia nueva.

| Entregable | Carril | Qué abre |
|---|---|---|
| Varios números y varias sedes por agencia, con reportes por sede | WA, DA, BE | Agencias con sedes |
| Mayoristas y operadores receptivos: cupos compartidos, tarifas netas por canal | arquitecto, DA, BE | Segmento nuevo (requiere ADR) |
| Instagram y Messenger en la bandeja (v1.5 del roadmap v2) | WA, BE | Agencias con venta por redes |
| Alta autoservicio: Embedded Signup + catálogo por IA + plan de prueba | WA, BE, FE, IA | Costo de adquisición |
| Integración con facturación electrónica del ERP de la agencia (no DIAN propia) | BE | Agencias formales medianas |
| Particiones, observabilidad, prueba de carga (M5, M6.3 del roadmap v2) | DA, devops | Volumen |

**Criterio de salida.** **Cinco agencias pagando**, al menos una con dos sedes, y una agencia nueva
que pasa de registrarse a recibir su primer WhatsApp en ViajaPro **en un día sin intervención
nuestra**.

**Dependencias externas.** Estado de Tech Provider de Meta (Embedded Signup). Revisión legal hecha.

**Riesgos.** Que «escala» se convierta en parametrización infinita (R12). Cada segmento nuevo pasa
por la pregunta de §4 del agente: ¿nos acerca al CRM genérico?

---

## 4. Posicionamiento comercial

### Propuesta de valor en tres frases

1. **Atiende, cotiza y cobra por WhatsApp en un solo lugar**, sin que el canal se vaya con el asesor.
2. **Cotiza como cotiza una agencia**: por pasajero, por salida, con neto y margen, en pesos.
3. **Desde el primer plan, en COP y sin cuota de incorporación**: lo que en HubSpot exige un plan
   Professional.

### Comparación de costo con HubSpot

Solo cifras del inventario. TRM de referencia del inventario: COP 3.163,76 por USD (21-oct-2026).

| Escenario HubSpot para una agencia de 3 asesores | Primer año (USD) | Primer año (COP aprox.) | Marca |
|---|---|---|---|
| A. Service Hub Pro × 3 (90 USD/asiento/mes, anual) + incorporación 1.500 = mínimo con WhatsApp | 4.740 | ≈ 15,0 millones | Precios **V**; el cálculo es **I** |
| B. A + Sales Hub Pro × 3 (secuencias), con dos incorporaciones | 9.480 | ≈ 30,0 millones | **I**; que se cobren dos incorporaciones **no está verificado** |
| C. B + Revenue Hub para cotizaciones | ~10.850 | ≈ 34,3 millones | Revenue Hub 38 USD es **T**; plan de cotizaciones **contradictorio** |

Lo que **no** está en esas cifras: IVA (**no verificado**), el costo de Meta por mensaje (**no
verificado**) y cualquier integración turística. Referencia vertical: Tern, USD 35–49 por usuario al
mes (**V**), sin WhatsApp verificado ni foco latinoamericano.

**Cómo leerlo.** El escenario A es el techo de referencia, no el precio que debemos poner: el
cliente no nos compara con HubSpot, nos compara con Excel. Por eso la cifra relevante es **cuánto
vale una venta más al mes por responder antes**, y ese dato no lo tenemos: el ticket medio de JD
Tours y su conversión son **supuesto** hasta medirlos en la fase 1.

### Las tres preguntas que el propietario debe decidir

1. **¿Quién paga a Meta?** El ADR-0002 dice «nosotros facturamos a Meta el consumo y lo
   repercutimos»; el modelo de Tech Provider con Embedded Signup sugiere que la cuenta de WhatsApp es
   de la agencia y que la agencia podría pagar a Meta directamente (**supuesto, no verificado**).
   *Recomendación:* que la agencia pague a Meta directamente si Meta lo permite, y nosotros
   mostremos el consumo en pantalla; nos saca el riesgo de precio de Meta del margen. Si se decide,
   se escribe como ADR que enmienda el ADR-0002.
2. **¿Por agencia o por asesor?** *Recomendación:* plan **por agencia** con asesores incluidos
   (p. ej. hasta 3 / hasta 8), nunca por usuario: la temporada alta duplica el equipo justo el mes
   en que más valor recibe la agencia, y cobrar por asiento empuja a compartir credenciales. Las
   cifras de cada tramo **no se fijan** sin la tarifa de Meta en COP (tarea 2b de ESTADO).
3. **¿Gratis, prueba o piloto pagada?** HubSpot da el día uno gratis y Excel es gratis.
   *Recomendación:* sin plan gratuito permanente (cada agencia nos cuesta infraestructura y, según la
   pregunta 1, quizá Meta), con **prueba de 30 días** y **sin cuota de incorporación**; la carga del
   catálogo la hace el producto. Lo que se decida condiciona qué hay que medir desde la fase 1.

---

## 5. Riesgos y supuestos

### Riesgos (nuevos; los técnicos siguen en `03-riesgos.md`)

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| RP-01 | **La bandeja no envía a Meta** y la piloto lo descubre antes que nosotros | Alta (hoy es así) | Alto | Primer entregable de la fase 1 |
| RP-02 | Copiar la amplitud de HubSpot y diluir el dominio (parametrización infinita) | Media | Alto | Lista «no haremos» del §1; R12; toda funcionalidad nueva pasa por «¿abre un segmento o nos acerca al CRM genérico?» |
| RP-03 | El costo de Meta por mensaje vuelve inviable el plan de entrada, sobre todo con automatización | Media | Alto | Pregunta 1 del §4 antes de fijar precio; medir costo por agencia desde la fase 1 |
| RP-04 | Las agencias no pagan software (hipótesis más peligrosa de `04-modelo-de-negocio.md`) | **No medido** | Existencial | Cobrar a la piloto algo, aunque sea simbólico, al cerrar la fase 2 |
| RP-05 | La fase 1 choca con C1–C5: no se puede usar con clientes reales hasta cerrar el cifrado y la supresión | Alta | Alto | Ensayo con número de prueba mientras tanto; los cimientos van primero (RG-14) |
| RP-06 | Cupos modelados para quien opera cuando la piloto revende, o al revés | Media | Medio | ADR de cupos con la respuesta de JD Tours delante |
| RP-07 | HubSpot baja precios en Colombia (tiene sede regional en Bogotá, **T**) | **No medido** | Medio | Nuestra defensa es el dominio, no el precio |

### Supuestos (a verificar; ninguno está en el inventario ni en el repositorio)

- JD Tours atiende del orden de 20 conversaciones por asesor en una jornada (la cifra del criterio de
  la fase 1 es **supuesto**; se ajusta con su volumen real).
- JD Tours opera sus propias salidas (y por eso el cupo controlado le sirve).
- Una agencia puede cargar su catálogo sola en menos de 30 minutos con la importación.
- La agencia puede pagar a Meta directamente con el modelo de Tech Provider.
- Las agencias del segmento pagan hoy entre cero y poco por software (sin entrevistas hechas: el
  paso 1 de `04-modelo-de-negocio.md` §1 sigue pendiente).
- Ticket medio y tasa de conversión de la piloto: desconocidos; sin ellos el «una venta más al mes
  paga la suscripción» es un argumento, no un número.

### Lo que este documento no pudo verificar

- El estado de despliegue posterior al 2026-10-20 (ESTADO.md no se ha actualizado desde entonces, y su
  §1 contradice su cabecera: la cabecera describe inbox, autenticación y cotizaciones como hechos; el
  cuerpo del §1 dice que no existen. Este documento se fió del código).
- Si hay ramas sin integrar que ya resuelvan el envío a Meta: solo se revisó `main`.
- El plan exacto de HubSpot para cotizaciones, permisos e importación (contradicciones del inventario).
