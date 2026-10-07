# El norte del producto

> **Qué es este documento.** [`images/Brochure.jpeg`](../../images/Brochure.jpeg) es material de
> inspiración: una exploración visual de cómo podría verse el producto. **No es un compromiso
> comercial** —el nombre, los precios y los planes siguen sin decidirse— pero sí aporta algo
> valioso: una dirección clara. Aquí se recoge esa dirección y se empuja más allá.
>
> **Mercado base confirmado: Colombia.**

---

## 1. Lo que el brochure acierta y conviene conservar

### La frase que define el producto

> **«Convierte conversaciones en viajes reales.»**

Es la mejor definición que tenemos. Contiene la tesis completa: la materia prima es una
conversación de WhatsApp, el resultado es un viaje vendido, y el producto es la máquina que
convierte lo uno en lo otro. **La métrica del producto se deduce sola: tasa de conversión de
conversación a viaje.** Todo lo demás es instrumentación.

### El flujo de cinco pasos

```
Consulta → Registro → Cotización → Seguimiento → Reserva
```

Es correcto y es el esqueleto del pipeline. Cada paso corresponde a un contexto del sistema, y cada
transición es una métrica. Lo conservamos tal cual.

### Los nueve módulos

Conversaciones · Clientes · Oportunidades · Cotizaciones · Reservas · Campañas · Reportes · Equipo ·
Configuración.

Es un mapa razonable y en el lenguaje que una agencia entiende. Se adopta como **propuesta de
navegación**, no como decisión cerrada. El mapeo a los contextos del sistema está en
[lenguaje ubicuo](../01-producto/02-lenguaje-ubicuo.md#nombres-en-la-interfaz).

### Los cuatro beneficios

Más consultas atendidas · Mayor conversión a ventas · Seguimientos automáticos · Clientes más
satisfechos.

Están bien elegidos porque son **resultados de negocio, no funcionalidades**. Esa es la forma
correcta de hablarle a un dueño de agencia, y debe trasladarse al producto: cada pantalla de
reportes responde a uno de los cuatro.

### El tono

Cálido, aspiracional, con imaginería de viaje. «Más viajeros, más experiencias, más historias.»
Es el tono correcto: **vendemos a gente que vende sueños.** Un CRM que se vea como una hoja de
cálculo de contabilidad no encaja con quien eligió trabajar en turismo. Esto informa el
[sistema de diseño](../01-producto/06-diseno-y-ux.md): densidad de herramienta de trabajo, pero
calidez en la marca.

---

## 2. Dónde el brochure se queda corto, y hacia dónde expandir

Aquí está el valor de verdad. Cada punto es una dirección de producto, no una funcionalidad suelta.

### 2.1 El ciclo no termina en «Reserva»

El brochure cierra el flujo en la reserva. **Ahí es donde empieza el dinero fácil.**

```
Consulta → Cotización → Reserva → VIAJE → Post-venta → Reseña → Referido → RECOMPRA
                           ↑                                                    │
                           └────────────────────────────────────────────────────┘
```

Una agencia que vende una vez tiene un cliente. Una que vende tres veces tiene un activo. Y el
viajero que ya viajó es, con diferencia, **el lead más barato que esa agencia conseguirá el año
que viene**: no hay costo de adquisición, hay confianza acumulada y hay datos de qué le gustó.

Lo que esto exige del producto:

- La ficha del viajero guarda **historial de viajes, no historial de mensajes**: a dónde fue, con
  quién, cuánto gastó, qué le gustó.
- Encuesta post-viaje que alimenta dos cosas: reseña pública y datos de preferencia.
- Programa de referidos del viajero, medible.
- **Disparador de recompra por aniversario:** «hace un año viajaste a Cartagena con nosotros».

### 2.2 «Campañas» mal entendida es spam; bien entendida es reactivación

El riesgo está escrito en la [integración con Meta](../04-integraciones/01-whatsapp-cloud-api.md):
una herramienta de envío masivo mal diseñada hace que el cliente queme su número, y **la culpa
agregada recae sobre nuestra app ante Meta**, no solo sobre él.

La oportunidad real no es difundir ofertas. Es **activar el activo dormido**: la base de viajeros
que la agencia ya atendió y nunca volvió a contactar.

| Campaña que quema el número | Campaña que vende |
|---|---|
| «¡OFERTA! Cancún desde $2.999.000» a toda la base | «Hace un año viajaste a San Andrés. Este diciembre tenemos algo parecido a 15 minutos de allá» |
| Sin segmentar | Segmentada por destino previo, composición familiar y rango de gasto |
| Sin consentimiento verificable | Con opt-in registrado, fecha y finalidad |

**Decisión de diseño que se deriva:** el producto debe hacer *fácil* lo segundo y *difícil* lo
primero. No por términos de uso — por diseño de la interfaz.

### 2.3 «Portal del cliente» es un motor de productividad disfrazado

El brochure lo pone como opción de crecimiento, casi como una cortesía al viajero. En realidad es
la palanca de productividad más grande del producto: **cada cosa que el viajero hace en el portal
es trabajo que el asesor deja de hacer.**

| El viajero hace | El asesor se ahorra |
|---|---|
| Elegir entre las opciones A, B o C de la cotización | Tres mensajes de ida y vuelta |
| Subir su pasaporte y el de sus hijos | Pedirlo cuatro veces por WhatsApp |
| Pagar su cuota con un botón | Conciliar un comprobante borroso |
| Ver su itinerario actualizado | «¿A qué hora salía el vuelo?» ×6 |
| Llenar los datos de cada pasajero | Transcribirlos a mano |

Con cinco asesores atendiendo quince conversaciones cada uno, eso no es una comodidad: es la
diferencia entre cerrar diez viajes al mes o quince.

### 2.4 La IA no es «respuestas sugeridas»: es eliminar la digitación

El brochure menciona «IA para clasificación y respuestas sugeridas». Es lo más obvio y lo menos
valioso.

La joya está en la **extracción de intención**: convertir

> «somos 4 para Cartagena en diciembre, 2 niños, algo económico»

en una oportunidad con destino, fechas aproximadas, composición de pasajeros (2 ADT + 2 CHD) y
rango de presupuesto, **sin que nadie teclee nada**. El asesor abre el CRM y la oportunidad ya está
creada, con los datos puestos.

Esa es la diferencia entre un CRM que el asesor alimenta y un CRM que se alimenta solo. Y la razón
por la que es la primera capacidad de IA del [roadmap](../08-roadmap/01-roadmap.md), no la tercera.

### 2.5 El dato que ninguna agencia tiene: margen en tiempo real

«Reportes» en el brochure es un módulo más. El diferencial está en una pregunta concreta que hoy
ningún dueño de agencia puede responder sin abrir Excel y hacer cuentas:

> **¿Cuánto gané este mes, y en qué archivos?**

No ventas. **Margen.** Venta menos costo neto de proveedores, por archivo, por asesor, por destino,
por mes. Es el dato que convierte el producto de «una herramienta que me ayuda a atender» a «el
sistema con el que dirijo mi negocio». Y es lo que hace que no te cambien por el competidor barato.

Derivada natural: **alerta de margen.** Un archivo que cae por debajo del umbral mientras todavía
se puede negociar vale más que cualquier reporte mensual.

### 2.6 Estacionalidad: el turismo colombiano es un calendario

Diciembre-enero, Semana Santa, mitad de año, puentes festivos. Los picos son conocidos y repetidos,
y la demanda se forma con semanas de anticipación.

Un CRM genérico ignora esto. Uno vertical lo usa:

- «Faltan 90 días para Semana Santa. Estos 38 viajeros viajaron la Semana Santa pasada.»
- «Tu capacidad de atención en diciembre fue del 60%. Este año se te vienen 400 consultas.»
- Tarifarios con temporada alta, baja y puentes como concepto de primera clase, no como nota.

### 2.7 El horizonte lejano: la red entre agencias

A tres años, lo que ninguna herramienta genérica puede copiar:

- **Calificación real de proveedores**, agregada de forma anónima entre agencias: qué hotel
  incumple, qué operador responde tarde, qué mayorista cobra penalidades indebidas. Es información
  que hoy circula por grupos de WhatsApp entre colegas y que nadie ha sistematizado.
- **Catálogo compartido**: una agencia pequeña accede a producto armado por otras.
- **Benchmarking anónimo**: «tu tasa de conversión es del 18%; la mediana de agencias de tu tamaño
  es del 24%». Nada vende una funcionalidad mejor que un número que duele.

Esto solo funciona con masa crítica, y por eso es horizonte, no roadmap. Pero condiciona decisiones
de hoy: el modelo de datos debe permitir agregación anónima entre tenants desde el principio, o
después será imposible sin migrar.

---

## 3. Qué cambia y qué no en el plan actual

| | Decisión |
|---|---|
| **Mercado base** | Colombia. COP, normativa colombiana, TRM, pasarelas locales |
| **Flujo de cinco pasos** | Se adopta como esqueleto del pipeline |
| **Nueve módulos** | Propuesta de navegación. No decisión cerrada |
| **Tono de marca** | Cálido y aspiracional. Densidad de herramienta en la interfaz |
| **Campañas** | Se replantea: de difusión a **reactivación segmentada**. Decisión de alcance pendiente |
| **Portal del cliente** | Sube de prioridad: de cortesía a palanca de productividad. Sigue en v2 |
| **Extracción de intención** | Confirmada como la primera capacidad de IA |
| **Margen en tiempo real** | Se eleva a diferenciador central, no a reporte más |
| **Estacionalidad** | Entra como concepto del dominio, no como nota al pie |
| **Nombre, precios, planes** | **Sin decidir.** Ver [modelo de negocio](04-modelo-de-negocio.md) |

---

## 4. La frase que resume el norte

> No construimos un CRM con WhatsApp.
> Construimos **el sistema operativo de una agencia de turismo**, que vive donde ocurre la venta.

Un CRM se abandona cuando se acaba el entusiasmo. Un sistema operativo no se abandona: se depende
de él. La diferencia entre lo uno y lo otro está en los puntos de la sección 2 — el ciclo que se
cierra, el margen que se ve, el trabajo que el viajero hace solo, los datos que se acumulan.
