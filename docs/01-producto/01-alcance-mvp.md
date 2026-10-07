# Alcance de la versión 1

**Alcance aprobado:** los cuatro bloques — inbox + pipeline, cotizador + itinerarios,
reservas + pagos + post-venta, automatización + IA.

**Advertencia registrada y asumida:** ese alcance no cabe en 3-4 meses. Son 8 a 11 meses con un
equipo de 3-4 personas. El [roadmap](../08-roadmap/01-roadmap.md) lo secuencia en fases para que
haya clientes pagando al mes 4, sin eliminar nada del alcance. La decisión de dónde cortar es del
propietario del producto; este documento define **qué significa exactamente** cada bloque, para que
el alcance no crezca por la puerta de atrás.

---

## Bloque 1 — Inbox y pipeline

### Entra

| Capacidad | Detalle |
|---|---|
| Conexión de WhatsApp | Embedded Signup; la agencia conecta su propio número en minutos |
| Bandeja compartida | Lista de conversaciones, filtros, búsqueda, asignación entre asesores |
| Mensajería | Texto, imagen, documento, audio, video, plantillas, botones y listas |
| Ventana de 24 h | Visible con cuenta regresiva, aplicada en el servidor, con plantillas a mano al cerrarse |
| Plantillas | Crear, enviar a aprobación, ver estado, usar con variables |
| Notas internas | Visibles solo para el equipo |
| SLA de primera respuesta | Configurable, con aviso en la bandeja al vencerse |
| Tiempo real | Mensajes y estados sin recargar |
| Contactos | Ficha, historial unificado, etiquetas |
| Oportunidades | Embudo con etapas configurables, tablero y tabla |
| Actividades y tareas | Con recordatorios |
| Motivo de pérdida | **Obligatorio** al marcar una oportunidad como perdida |
| Reportes básicos | Conversión por etapa, tiempo de respuesta, actividad por asesor |

### No entra en v1
Instagram, Messenger y correo en la bandeja (WhatsApp es el 90% del volumen real); llamadas de voz;
chatbot que responde solo sin supervisión.

---

## Bloque 2 — Cotizador e itinerarios

### Entra

| Capacidad | Detalle |
|---|---|
| Catálogo | Productos turísticos y proveedores propios de la agencia |
| Tarifarios | Carga manual de tarifas netas por proveedor y temporada |
| Cotización multi-opción | Hasta tres alternativas (económica / estándar / premium) |
| Multi-pasajero | ADT / CHD / INF, con tarifa e impuestos propios por tipo |
| Cálculo | Tarifa neta → markup o comisión → impuestos → venta. **Margen visible en todo momento** |
| Multi-moneda | TRM congelada en la cotización, con su fecha |
| Itinerario | Días y segmentos, con horarios |
| Versionado | La cotización que vio el cliente **no cambia**; editar crea una versión |
| Propuesta PDF | Con la marca de la agencia |
| Envío | Por WhatsApp, con seguimiento de apertura |
| Vencimiento | Fecha de validez y recordatorio automático |

### No entra en v1
Integración con GDS (Amadeus, Sabre, Travelport) ni con consolidadores; disponibilidad en tiempo
real; reserva automática contra el proveedor. **El cotizador v1 es manual, y es lo correcto para
empezar:** automatizarlo antes de entender cómo cotizan de verdad las agencias es construir la cosa
equivocada muy bien.

---

## Bloque 3 — Reservas, pagos y post-venta

### Entra

| Capacidad | Detalle |
|---|---|
| Archivo de viaje | Expediente completo, generado desde la cotización aceptada |
| Pasajeros | Datos, tipo, relación con el titular |
| Documentos | Pasaporte, cédula, visa. **Cifrados, con acceso auditado** |
| Reservas por proveedor | Localizador, estado, costo |
| **Time limits** | Con alerta automática antes de vencer |
| Plan de pagos | Anticipo y cuotas |
| Pasarela | Cobro con enlace enviado por WhatsApp; webhooks idempotentes |
| Conciliación | Lo que dice la pasarela contra lo que dice el sistema |
| Vouchers | Generación y envío al pasajero |
| Post-venta | Seguimiento antes, durante y después del viaje |
| Penalidades | Registro de costos por cambio y cancelación |

### No entra en v1
Contabilidad; facturación electrónica ante la DIAN (se integra con el ERP de la agencia, no lo
reemplazamos); cuentas por pagar a proveedores con flujo de aprobación; liquidación de comisiones
a asesores.

---

## Bloque 4 — Automatización e IA

### Entra

| Capacidad | Detalle | Prioridad |
|---|---|---|
| Extracción de intención | De lenguaje suelto a destino, fechas, pasajeros y presupuesto | **La primera.** Máximo impacto |
| Calificación de lead | Puntaje **con justificación visible**. Un puntaje sin explicación no se usa | Alta |
| Respuesta sugerida | Borrador que el asesor revisa. **Nunca se envía solo en v1** | Alta |
| Resumen de conversación | Retomar un chat de 300 mensajes en diez segundos | Media |
| Secuencias | Seguimientos automáticos por tiempo o por evento | Media |
| Automatizaciones | Disparador → condición → acción, configurables por la agencia | Media |
| Control de costo | Presupuesto por tenant, con degradación elegante al alcanzarlo | Obligatoria |

### No entra en v1
Bot que conversa y cierra ventas sin supervisión humana; generación automática de cotizaciones
completas; voz.

**Por qué:** en v1 toda salida de IA pasa por un asesor antes de llegar al cliente. La automatización
completa se gana con datos de evaluación, no con optimismo. Un bot que cotiza mal un viaje de luna
de miel cuesta más que diez horas de asesor.

---

## Fuera de v1 por completo

| Fuera | Por qué | Cuándo |
|---|---|---|
| App móvil nativa | La web responsive cubre el caso real | v2 |
| Marca blanca de la interfaz | Solo el PDF y el color de acento en v1 | Plan enterprise |
| Portal del viajero | Interesante, no urgente | v2 |
| Turismo corporativo | Otro producto, otro comprador, otras necesidades | v3 |
| Multi-idioma de la interfaz | Español primero. Mercado objetivo definido | v2 |
| Integración con ERP contable | Vía API cuando haya demanda concreta | v2 |

---

## Cómo encaja el norte de producto con este alcance

El [norte de producto](../00-vision/05-norte-del-producto.md) describe hacia dónde va ViajaPro.
Esta tabla aterriza cuándo llega cada cosa, para que la visión no se confunda con lo entregable.

| Capacidad del norte | Cuándo llega | Nota |
|---|---|---|
| Conversaciones, Clientes, Oportunidades | Fases 1-2 | El núcleo vendible |
| Cotizaciones | Fase 3 | El diferenciador |
| Reservas y archivos de viaje | Fase 4 | — |
| Reportes básicos | Fase 2 | Conversión y actividad |
| **Margen por archivo en tiempo real** | Fase 4, completo en 6 | Diferenciador central. Depende de tener costos netos |
| Extracción de intención (IA) | Fase 5 | Primera capacidad de IA, por impacto |
| Recordatorios de viaje y encuestas post-viaje | Fase 5 | Alimenta la recompra |
| **Campañas de reactivación** | **Decisión de alcance pendiente** | Ver abajo |
| Instagram y Facebook en la bandeja | v1.5 | WhatsApp es el 90% del volumen |
| Portal del cliente | v2 | Sube de prioridad: es productividad, no cortesía |
| Red entre agencias (benchmarking, proveedores) | Horizonte | Condiciona el modelo de datos hoy |

### La decisión pendiente: Campañas

Aparece en la navegación del brochure, y el [norte](../00-vision/05-norte-del-producto.md#22-campañas-mal-entendida-es-spam-bien-entendida-es-reactivación)
explica por qué es a la vez la mayor oportunidad y el mayor riesgo del producto.

Si entra en v1, tiene que entrar **como reactivación segmentada, no como difusión masiva**. Una
herramienta de envío masivo mal diseñada es la vía más rápida para que un cliente queme su número
de WhatsApp — y la culpa agregada recae sobre **nuestra** app ante Meta, no solo sobre él.

### Lo que condiciona decisiones de hoy aunque sea horizonte

El benchmarking anónimo entre agencias solo funciona con masa crítica, pero **el modelo de datos
debe permitir agregación anónima entre tenants desde el principio**. Agregarlo después significa
migrar datos de producción. Está anotado en
[modelo de datos](../02-arquitectura/03-modelo-de-datos.md).

## Criterios para que algo entre a v1

Antes de aceptar cualquier adición, las cinco preguntas:

1. **¿Una agencia dejaría de comprar sin esto?** Si no, no es v1.
2. **¿Resuelve un dolor que tienen hoy**, o uno que creemos que tendrán?
3. **¿Lo pidió una agencia real**, o se nos ocurrió a nosotros?
4. **¿Cuánto retrasa el lanzamiento?** Sumar funciones resta clientes tempranos.
5. **¿Se puede hacer después sin rehacer lo anterior?** Si sí, se hace después.

Las cosas que **no** admiten "después" —y por eso están en v1 aunque cuesten—: el aislamiento entre
tenants, el versionado de cotizaciones, y los *time limits*. Agregar cualquiera de las tres más
tarde significa migrar datos de producción.
