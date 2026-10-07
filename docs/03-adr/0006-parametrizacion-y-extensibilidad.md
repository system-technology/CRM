# ADR-0006 — Niveles de parametrización: vertical configurable, no plataforma genérica

- **Estado:** Aceptado
- **Fecha:** 2026-10-07
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `experto-turismo`, `analista-producto`, `datos`

---

## Contexto

El producto debe servir a **muchas agencias de turismo distintas**. Dos agencias no operan igual:
una vende solo nacional con markup fijo; otra hace receptivo en tres monedas con comisión de
proveedor y pagos en cuotas. Si el sistema impone una sola forma de trabajar, la segunda no lo
puede usar — y el mercado objetivo se reduce a la mitad.

La pregunta que motiva este ADR: **¿hasta dónde debe llegar la configurabilidad?**

Hay dos fuerzas opuestas y ambas pueden matar el producto:

- **Poco configurable** → cada agencia que no encaje se pierde como cliente.
- **Demasiado configurable** → poner en marcha el sistema exige configurar cuarenta cosas, la
  agencia lo abandona en la semana dos, y el producto se convierte en un CRM genérico más.
  Que es exactamente contra lo que compite (ver
  [visión de producto](../00-vision/01-vision-producto.md)).

La segunda fuerza es la peligrosa porque no se siente como un error mientras ocurre: cada opción
nueva parece razonable por separado.

## Opciones consideradas

### A — Vertical opinado y configurable, con extensibilidad acotada (elegida)

Niveles 1 a 3 de configurabilidad en v1; nivel 4 en v2; nunca el nivel 5.

| Nivel | Qué es | Cuándo |
|---|---|---|
| 0 | Todo fijo en el código | Descartado: no sirve ni para dos agencias |
| **1 · Configuración** | Ajustes por tenant: etapas, monedas, impuestos, markup, plantillas, roles, SLA, marca | **v1** |
| **2 · Campos personalizados** | La agencia define campos propios en contacto, viajero, oportunidad y archivo | **v1 en el esquema**, interfaz en Fase 2 |
| **3 · Automatizaciones** | Reglas disparador → condición → acción definidas por la agencia | **v1, Fase 5** |
| **4 · Extensibilidad** | API pública, webhooks salientes, integraciones de terceros | v2 |
| 5 · Plataforma | Objetos personalizados, scripting, módulos propios | **Nunca** |

- **Gana:** sirve a agencias muy distintas sin dejar de hablar el idioma del turismo; el arranque
  sigue siendo de minutos gracias a valores por defecto opinados.
- **Cuesta:** más complejidad en el esquema y en la interfaz desde el principio; hay que resistir
  activamente la presión de añadir opciones.
- **Cierra:** vender a sectores distintos del turismo sin reescribir. Es deliberado.

### B — Producto rígido, una sola forma de operar

- **Gana:** simplicidad máxima; arranque instantáneo; menos superficie de error.
- **Cuesta:** cada agencia que no encaje se pierde. En un mercado de agencias pequeñas con
  procesos heterogéneos, eso es la mayoría.
- **Cierra:** el mercado.

### C — Plataforma genérica configurable (tipo CRM horizontal)

Objetos personalizados, campos arbitrarios, flujos definibles, sin dominio propio.

- **Gana:** sirve a cualquier sector en teoría.
- **Cuesta:** **destruye la ventaja competitiva entera.** La tesis del producto es que los CRM
  genéricos fracasan en turismo por no entender pasajeros, tarifas netas, *time limits* ni
  itinerarios. Volverse genérico es competir con HubSpot en su terreno, con menos recursos.
  Además la puesta en marcha deja de ser de minutos y pasa a ser un proyecto de consultoría.
- **Cierra:** la razón de existir.

### D — Código abierto

Decisión adyacente que suele plantearse junto a la anterior. Ver sección propia abajo.

## Decisión

**Opción A.** Y la regla que la gobierna, que es lo importante de este ADR:

> **Se parametriza la política de negocio. Nunca los invariantes del dominio.**

### Qué es configurable (política de negocio)

| Área | Configurable |
|---|---|
| Pipeline | Etapas, nombres, orden, probabilidad por etapa, motivos de pérdida |
| Catálogo | Productos, proveedores, tarifarios, temporadas |
| Precio | Reglas de markup por tipo de producto y proveedor; comisión; impuestos |
| Moneda | Monedas habilitadas, moneda de venta por defecto, quién fija la TRM y cómo |
| Mensajería | Plantillas, horario de atención, SLA de primera respuesta, mensajes automáticos |
| Equipo | Roles, permisos, asignación de conversaciones, comisiones a asesores |
| Marca | Logo, color de acento, términos y condiciones del PDF de propuesta |
| Datos | **Campos personalizados** en contacto, viajero, oportunidad y archivo de viaje |

### Qué NO es configurable (invariantes del dominio)

Estos no son preferencias: son lo que hace que el sistema sea **correcto**. Hacerlos
configurables introduce formas de usar el producto que están mal.

- `TravelFile`, `Passenger`, `Quote`, `Booking` y sus relaciones. El modelo es el modelo.
- **Una cotización enviada es inmutable.** Editarla crea una versión. Sin esto no se puede
  resolver una disputa sobre qué se ofreció.
- **Existe el *time limit*** y se vigila. Una agencia no puede «desactivarlo».
- **El dinero va en enteros** con moneda explícita.
- **El aislamiento entre tenants.** Ver [ADR-0003](0003-multitenancy.md).
- **La ventana de 24 horas de WhatsApp.** No es nuestra regla, es de Meta.
- El registro de consentimiento y la bitácora de auditoría.

### El principio que evita la trampa de la configuración infinita

**Valores por defecto opinados.** Una agencia nueva arranca con etapas, plantillas, reglas de
markup y roles que ya sirven para operar, y configura **solo lo que de verdad le estorba**.

Criterio para aceptar una opción de configuración nueva — las tres preguntas:

1. ¿Hay **al menos dos agencias reales** que lo necesiten distinto? Si es una, es un caso especial,
   no una opción.
2. ¿Puede el valor por defecto servir al 80%? Si no, el valor por defecto está mal elegido.
3. ¿Qué pasa si **nadie** la configura? Si la respuesta es «el sistema no sirve», no es una opción:
   es un dato obligatorio del alta.

### Consecuencia inmediata para el esquema

**Los campos personalizados se diseñan en el modelo de datos desde el día uno**, aunque la interfaz
para gestionarlos llegue en la Fase 2. Entran en la misma categoría que `tenant_id`, el versionado
de cotizaciones y los *time limits*: **añadirlos después significa migrar datos de producción**.

Lo mismo para las etapas del pipeline: desde la primera migración son una tabla por tenant, nunca
un `enum` en el código.

## Sobre el código abierto

Decisión separada, de modelo de negocio, y la respuesta hoy es **no**.

| | |
|---|---|
| **A favor** | Confianza del comprador, contribuciones, sin preocupación de dependencia del proveedor, atrae talento |
| **En contra** | **Los compradores no evalúan código.** Una agencia de cinco personas no elige CRM leyendo un repositorio. Mientras tanto, la integración como Tech Provider de Meta —que es el foso— queda copiable por cualquiera con más capital. Y sostener una comunidad cuesta tiempo que hoy no existe |

**Cuándo reconsiderarlo:** cuando el foso deje de ser el código y pase a ser la
[red entre agencias](../00-vision/05-norte-del-producto.md#27-el-horizonte-lejano-la-red-entre-agencias)
—datos acumulados, calificación de proveedores, benchmarking—. Ahí abrir el código puede acelerar
la adopción sin regalar la ventaja. Año dos o tres, no hoy.

Si llegara ese momento, el modelo probable es **núcleo abierto**: el CRM abierto, y cerrado lo que
de verdad sostiene el negocio — gestión multi-tenant, facturación, capa de IA y la red.

## Consecuencias

### Positivas
- Sirve a agencias con operaciones muy distintas sin dejar de ser un producto de turismo.
- El arranque sigue siendo de minutos, no un proyecto de configuración.
- El modelo de datos nace preparado para campos personalizados y etapas por tenant.
- Queda un criterio escrito para rechazar opciones de configuración, que es lo que impide la deriva.

### Negativas
- **Más complejidad desde el principio**: tablas de configuración por tenant, campos personalizados,
  resolución de valores por defecto. Es trabajo real en la Fase 0-1.
- **Hay que resistir presión constante.** Cada cliente pedirá «una opción más», y cada una parecerá
  razonable. Las tres preguntas existen para eso.
- Los campos personalizados complican las consultas y los índices. Hay que diseñarlos bien
  (`jsonb` con índice GIN) o degradan el rendimiento.
- Cerramos la puerta a vender fuera del turismo sin reescribir. Deliberado.

### Qué habría que cambiar para revertir
Pasar a plataforma genérica (opción C) sería reescribir el dominio entero y rehacer el
posicionamiento. Pasar a producto rígido (opción B) sería más fácil, pero perdería clientes ya
captados. En la práctica, esta decisión es difícil de revertir en ambas direcciones.

## Cuándo revisar esta decisión

- Si **más de tres agencias piloto** no pueden operar por falta de una opción concreta: esa opción
  concreta sube de nivel, no la filosofía entera.
- Si la puesta en marcha de una agencia nueva empieza a tardar **más de un día**: hay demasiada
  configuración y hay que podar.
- Si aparece un sector adyacente con el mismo modelo de dominio (p. ej. operadores de eventos o
  turismo corporativo): evaluar si es una **vertical nueva** con su propio producto, no una opción
  de configuración de este.
- Para el código abierto: cuando el foso sea la red entre agencias, no el código.
