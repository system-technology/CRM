# ADR-0009 — La salida programada es la unidad de venta del catálogo

- **Estado:** Propuesto
- **Fecha:** 2026-10-10
- **Decide:** Propietario del producto
- **Consultados:** `experto-turismo` (dictamen `docs/01-producto/11-dictamen-del-catalogo-real.md`),
  `arquitecto`. **Pendientes de revisar antes de aceptar:** `auditor-seguridad` (tablas nuevas con
  `tenant_id`), `dueno-de-producto` (reapuntar la cabeza de playa).
- **Supersede:** nada. Ver §4.

---

## Contexto

La fuerza es **falsabilidad del modelo, no volumen ni latencia**: el primer tarifario real de una
agencia no se puede representar con los contratos que ya tenemos, y la contradicción es estructural,
no de captura.

Modelamos una agencia que **revende** paquete de mayorista. El tarifario lo publica una agencia que
**opera** su propia excursión en bus. Tres hechos verificados contra los datos:

1. `CrearPrecio` (`packages/contracts/src/catalogo.ts`) exige `acomodacion`, `tipoPasajero` y `neto`,
   los tres obligatorios.
2. Más de la mitad del catálogo no tiene noche —26 de 47 productos según el conteo del propietario,
   27 según el dictamen; la diferencia no cambia nada—. La acomodación no está escondida: **no
   existe** para esos productos. Con el contrato actual no se cotizan sin inventar datos.
3. «Piangüita + Ballenas» vale 329.000 como pasadía y 569.000 como pasanoche. **El nombre no
   identifica el producto; la salida sí.**

Y un cuarto, el caro: la agencia **flete el bus completo**. El costo es fijo aunque vayan doce. No
hay tarifa neta por pasajero de la cual sacar markup, porque no hay mayorista: la agencia *es* el
operador. `Precio.neto` no describe nada en este negocio.

El momento importa. El esquema es el activo más caro de cambiar y hoy no hay datos de ninguna
agencia real: lo que existe es semilla de demostración. **El costo de esta decisión solo crece.**

## Opciones consideradas

### A — Relajar los contratos actuales

Hacer opcionales `acomodacion`, `tipoPasajero` y `neto`; dejar `Paquete` + `Temporada` + `Precio`
como están.

- **Gana:** cambio pequeño, el cotizador sigue en pie, cero migración.
- **Cuesta:** no resuelve nada de fondo. Dos productos con el mismo nombre y precios distintos
  siguen sin poder coexistir, el margen del operador sigue sin concepto, y el cupo —que es el
  inventario real del negocio— sigue sin existir. Un modelo con la mitad de los campos en `null`
  es un modelo que ya no afirma nada.
- **Cierra:** nada formalmente, y ese es el problema: deja la decisión para cuando sí haya datos.

### B — La salida programada asciende a unidad de venta (elegida)

`Departure` (Salida) pasa a ser lo que se vende y lo que se cotiza: fecha, cupo publicado, estado y
**sus propias tarifas**. `Package` (Paquete) queda como **plantilla reutilizable**: nombre, destino,
itinerario, noches, inclusiones, política. El precio deja de colgar del paquete.

- **Gana:** expresa el tarifario tal cual está. Cotizar se vuelve más corto, no más largo: un
  `departureId` basta para producir un precio enviable, sin composición de pasajeros ni
  acomodación. Y la repetición que ya está en la hoja —siete itinerarios en dos grupos de fechas—
  deja de ser duplicación de datos.
- **Cuesta:** tablas nuevas (`departures`, `fares`, `departure_costs`), semilla rehecha, y el
  cotizador actual pierde su camino principal. Introduce el cupo, que es concurrencia y es trabajo
  real — por eso este ADR lo declara fuera de alcance (§5).
- **Cierra:** que el precio viva en el paquete. A partir de aquí, un precio sin salida no existe.

### C — Dos modelos de catálogo conviviendo desde el día uno

Mantener el camino de reventa (paquete + temporada + matriz) y añadir el de operador en paralelo,
con un discriminador.

- **Gana:** no apuesta por ningún arquetipo; sirve a las dos agencias siguientes vengan como vengan.
- **Cuesta:** dos caminos de cotización, dos superficies de prueba y dos formas de equivocarse,
  sostenidos por un equipo que todavía no tiene inbox de WhatsApp. Es el error que ADR-0006 nombra:
  configurabilidad que parece razonable opción por opción.
- **Cierra:** la regla de parada. Duplica el alcance del contexto más denso del sistema antes de
  tener una segunda agencia que lo justifique.

## Decisión

**Opción B**, con cuatro resoluciones y un límite declarado.

### 1. `Departure` es la entidad vendible; `Package` es plantilla

Contrasto el argumento del dictamen y lo confirmo: **acorta**. La matriz de acomodación obliga a
conocer composición de pasajeros antes de dar un número; la salida programada entrega el número con
un identificador. Que el camino de cotización se acorte vale más que el hecho de que el esquema
tenga una tabla más.

`Package`: nombre, destino, noches, itinerario, inclusiones, exclusiones, plantilla de política.
`Departure`: `packageId`, fecha de salida, fecha de regreso, cupo publicado, estado, tarifas.
Ninguna de las dos lleva precio fuera de las tarifas de la salida.

**Frontera de módulos, para no crear un contexto nuevo** (ADR-0004): `quoting` posee `Package`,
`Departure` y `Fare` —son catálogo y precio—. La **consumición** de sillas (reserva con *time
limit*, planilla, no-show) es de `booking`, que referencia `departureId` y mantiene su propia
proyección de disponibilidad. `quoting` publica `DepartureScheduled` y `DeparturePriced`; `booking`
posee el `SeatHold`. No se crea un módulo `operations`.

### 2. El costo es una hoja de la salida, no un neto por pasajero

Se introduce `DepartureCost`: **líneas de costo de la salida**, cada una con tipo de causación.

| Causación | Ejemplo | Entra al margen como |
|---|---|---|
| `FIJO_POR_SALIDA` | flete del bus, guía | costo total, independiente de los pasajeros |
| `VARIABLE_POR_PASAJERO` | entradas, seguro, alimentación | costo × pasajeros |

```
margen de la salida = Σ(tarifas vendidas) − Σ(fijos) − Σ(variables × pax)
punto de equilibrio  = techo( Σfijos / (tarifa base − Σvariables por pax) )
```

Dos consecuencias que son el verdadero valor de esta forma:

- **El arquetipo de reventa se vuelve un caso degenerado, no un modelo rival.** Un paquete de
  mayorista es una salida con **cero costos fijos y una línea variable por pasajero** cuyo
  proveedor es el mayorista. El `neto` no se borra: **se muda** a una línea de costo. Por eso la
  opción C es innecesaria.
- **La hoja de costos no es entrada obligatoria para cotizar.** Se cotiza contra la tarifa
  publicada. El costo produce margen y punto de equilibrio como **lectura**, nunca como requisito.
  Una salida sin hoja de costos cotiza bien y reporta margen desconocido — que es la verdad.

`Paquete.mayoristaId` desaparece del paquete y reaparece como `supplierId` de una línea de costo.

### 3. `Fare` sí; motor de condiciones no

Confirmo que `Fare` es la pieza de mejor relación valor/coste del dictamen, **con una poda**. Una
salida tiene N tarifas: nombre, monto, **unidad de cobro**, condición de aplicación y vigencia.
La tarifa por defecto es por persona.

**Unidad de cobro, simplificada respecto del dictamen:** `PER_PERSON` y `PER_GROUP` con
`cubrePasajeros: n`. «Promo pareja» es `PER_GROUP` con `cubrePasajeros = 2`; el precio de grupo es
`PER_GROUP` con n mayor. Se elimina `PER_COUPLE` —es redundante— y se elimina `PER_VEHICLE`: el
vehículo es un **costo**, no una tarifa, y ya tiene su sitio en §2. Esto no es política comercial
sino aritmética: la unidad de cobro es el **denominador**, y es invariante. R12 no aplica aquí.

**La condición es declarativa y cerrada**, no una expresión evaluable: número exacto / mínimo /
máximo de pasajeros, rango de edad, y ocupa-silla sí/no. Un motor de reglas genérico en el catálogo
sería el nivel 5 que ADR-0006 prohíbe, y nadie lo pidió. Si aparecen tres agencias con una condición
que no cabe, se añade un caso, no un lenguaje.

Con esto, un solo concepto absorbe los cuatro casos: promo pareja, suplemento de sencilla
(tarifa `PER_PERSON` aditiva), tarifa de menor y precio de grupo.

**R8:** los montos `PER_GROUP` se guardan íntegros en centavos. Dividir entre `cubrePasajeros` es
**presentación**, y se marca como derivado. Nunca se persiste el per cápita de una tarifa de grupo.

**R12 y el vocabulario:** el invariante es **el número de noches**. «Pasadía», «pasanoche»,
«excursión», «mini-excursión» y «super excursión» son `TripFormat`: **tabla por tenant**, sembrada
con los cinco, derivable de las noches. Un `enum` cerrado sería exactamente el error que R12
previene —la propia hoja los solapa: tres días cae en dos categorías—. **Ninguna ruta de cotización
puede ramificar sobre la etiqueta.**

### 4. Qué sobrevive y qué se retira

**No se supersede ADR-0006.** ADR-0006 decide *hasta dónde llega la configurabilidad*, no la forma
del catálogo; su regla —se parametriza la política, nunca el invariante— es justamente la que
sostiene `TripFormat` como tabla. Lo único que queda desactualizado es una celda de su tabla de
áreas configurables: donde dice «Catálogo: productos, proveedores, tarifarios, temporadas», léase
«salidas y tarifas». Eso es inventario de lo configurable, no la decisión. **Ningún ADR anterior
cambia de estado por este.**

El modelo de catálogo nunca tuvo ADR: vivía en `07-cabeza-de-playa-paquetes.md` y en los contratos.
Por eso este ADR no supersede: **cierra un hueco**.

**Lo que se retira** (lista explícita, porque es más útil que la de lo que se gana):

| Se retira | A dónde va |
|---|---|
| `Precio` como entidad de precio | lo reemplaza `Fare` |
| `acomodacion` y `tipoPasajero` obligatorios en `CrearPrecio` | condición opcional de una `Fare` |
| `Precio.neto` | línea `VARIABLE_POR_PASAJERO` de `DepartureCost` |
| `Temporada` como eje de precio | la salida lleva su tarifa; la temporada **genera** salidas |
| `Paquete.mayoristaId` | `supplierId` en la línea de costo |
| `CotizarPaquete.markupExtra` como vía al precio de venta | el markup arma la tarifa; no es entrada de la cotización |
| `ComposicionPasajeros` obligatoria para cotizar | opcional; el precio sale solo con `departureId` |
| `CotizacionCalculada.acomodacion`, `habitaciones`, `plazasSinUsar` obligatorios | bloque opcional, solo si la salida tiene noches |
| El reparto automático de habitaciones («la acomodación que no deja plazas vacías») | **sale del camino principal.** Es el algoritmo más trabajado del cotizador y pasa a detalle opcional. Decirlo en voz alta: eso es lo que cuesta esta decisión |

**Lo que sobrevive intacto:** `Quote` y su versionado, `TravelFile`, el *time limit*, `Money` en
centavos, el cálculo en servidor, el aislamiento por tenant, `Mayorista` como proveedor, y la
cabeza de playa como segmento. La web del cotizador sobrevive como pantalla; cambia su entrada.

### El límite: esto es una apuesta, y así se declara

Una agencia y una hoja **prueban que el modelo de salida programada existe y que hoy no lo podemos
expresar. No prueban que el modelo de acomodación esté mal para otras agencias.** Las dos realidades
conviven en Colombia. Apostamos por el arquetipo operador porque es el que tenemos delante, porque
acorta el camino a entregar, y porque §2 hace del reseller un caso degenerado y no un rival.

**Qué invalidaría la apuesta:** que dos de las próximas cinco agencias piloto vendan
principalmente con fecha abierta y matriz de acomodación publicada. En ese caso no se revierte este
ADR: se escribe uno nuevo que reinstala el camino de precio por rango de fechas sobre `Package`
—que es la forma de `Temporada`, hoy retirada pero no olvidada— como segunda ruta de cotización.

## Consecuencias

### Positivas
- Los 47 productos del tarifario real se expresan sin inventar un solo dato.
- Cotizar exige un identificador, no una entrevista: encaja con cómo se vende por WhatsApp.
- El margen del operador pasa a tener concepto, y el del revendedor sigue funcionando como caso
  particular del mismo.
- Se cambia el esquema cuando cuesta poco: no hay datos de agencia real.

### Negativas
- **Se tira trabajo verificado.** El cotizador de punta a punta pierde su camino principal y el
  reparto de habitaciones sale del centro.
- Tres tablas nuevas y la semilla rehecha antes de entregar funcionalidad nueva.
- El cupo entra en el modelo y trae concurrencia, sobreventa y estados de salida. Aplazado, pero ya
  no es ignorable.
- Apostamos por un arquetipo con n = 1. Está declarado arriba, con su condición de invalidación.

### Qué habría que cambiar para revertir esto
Volver a `Paquete` + `Temporada` + `Precio` como camino principal: reinstalar la matriz, devolver
`neto` al precio y descolgar las tarifas de la salida. Mientras no haya datos de producción es
barato; con tres agencias operando salidas, no.

## Cuándo revisar esta decisión

- Cuando **dos de cinco** agencias piloto vendan con fecha abierta y matriz publicada (§ el límite).
- Cuando el cupo deje de ser aplazable: ahí va su propio ADR —reserva de silla, sobreventa, mínimo
  de operación, salida en riesgo y reubicación—.
- Si `Fare.condicion` recibe su tercera petición de un caso que no cabe en la forma declarativa.

---

## Fuera de alcance de este ADR

Nombrado para que no se cuele: cupo y reserva de silla · estado «en riesgo» y reubicación · campaña
comercial (`SalesCampaign`, que además colisiona con `Campaign` de `automation`) · punto de abordaje
· planilla de pasajeros · vista de saldos por salida · generar la pieza de WhatsApp. Todo ello va a
la cola de `ESTADO.md`, no a este documento.

## Preguntas abiertas con dueño

| # | Pregunta | Dueño |
|---|---|---|
| 1 | **Normativa de la pieza publicitaria.** La pieza no exhibe RNT, ni código de conducta ESCNNA, ni aviso de habeas data. **Este ADR no afirma qué obliga cada norma ni en qué soporte: no se verificó con fuente.** Verificar Ley 300/1996 y RNT, Ley 679/2001 y 1336/2009, Ley 1581/2012 | `investigador` |
| 2 | Reapuntar la cabeza de playa en `07-cabeza-de-playa-paquetes.md`; las nueve preguntas del §9 del dictamen a la agencia piloto | `dueno-de-producto` |
| 3 | RLS y aislamiento de `departures`, `fares`, `departure_costs`: `tenant_id` y política en las tres, ninguna excepción | `auditor-seguridad` |
| 4 | Dudas de transcripción del tarifario antes de sembrar | `experto-turismo` |

## Entradas propuestas al lenguaje ubicuo

No se edita el diccionario en este ADR. Se proponen, para aprobación: `Departure` (Salida),
`Fare` (Tarifa), `PricingUnit` (Unidad de cobro), `DepartureCost` (Costo de salida),
`TripFormat` (Formato de viaje, tabla por tenant), `BreakEven` (Punto de equilibrio).
