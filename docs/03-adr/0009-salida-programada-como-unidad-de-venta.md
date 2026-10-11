# ADR-0009 — La salida programada es la unidad de venta del catálogo

- **Estado:** Propuesto
- **Fecha:** 2026-10-10
- **Decide:** Propietario del producto
- **Consultados:** `experto-turismo` (dictamen `docs/01-producto/11-dictamen-del-catalogo-real.md`),
  `arquitecto`. **Pendientes de revisar antes de aceptar:** `auditor-seguridad` (tablas nuevas con
  `tenant_id`), `dueno-de-producto` (reapuntar la cabeza de playa).
- **Supersede:** nada. Ver §4.
- **Revisado el 2026-10-11, antes de firmarse.** El propietario respondió lo que la primera
  redacción daba por inferido: **la agencia piloto revende paquete de mayorista. No opera.** Eso
  invalida la premisa central de la versión anterior. Lo corregido se marca abajo sin suavizarlo.

---

## Contexto

La fuerza es **falsabilidad del modelo, no volumen ni latencia**: el primer tarifario real de una
agencia no se puede representar con los contratos que ya tenemos, y la contradicción es estructural,
no de captura.

**Lo que esta revisión retira.** La versión anterior afirmaba que la agencia flete el bus completo,
que el costo es fijo aunque vayan doce, y que «no falta la tarifa neta: falta el concepto». **Es
falso para nuestro piloto.** El mayorista existe, el neto existe, y es exactamente el dato que
seguimos esperando (tarea 2 de `ESTADO.md`). El costo es **neto por silla comprada al mayorista**,
no un punto de equilibrio. También se retira, por la misma razón, el bloque de valor operativo que
el dictamen celebraba —cupo en vivo, salida «en riesgo», planilla del conductor—: **el revendedor no
decide si el bus sale; le pregunta al mayorista si hay cupo.**

La contradicción con el modelo es, entonces, más estrecha de lo que se afirmó. Sigue siendo real, y
estos tres hechos no dependen de quién opere:

1. `CrearPrecio` (`packages/contracts/src/catalogo.ts`) exige `acomodacion`, `tipoPasajero` y `neto`,
   los tres obligatorios. **`neto` es correcto y sigue siendo obligatorio** — es lo que la agencia
   le paga al mayorista. Los que no tienen sentido para más de media hoja son los otros dos.
2. Más de la mitad del catálogo no tiene noche —26 de 47 productos según el conteo del propietario,
   27 según el dictamen; la diferencia no cambia nada—. La acomodación no está escondida: **no
   existe** para esos productos. Con el contrato actual no se cotizan sin inventar datos.
3. «Piangüita + Ballenas» vale 329.000 como pasadía y 569.000 como pasanoche. **El nombre no
   identifica el producto; la salida sí.**

Y un cuarto: la misma agencia podría, además, operar alguna salida propia. **Eso ya no es la
premisa; es una extensión prevista y aplazada.** Ver §2.

El momento importa. El esquema es el activo más caro de cambiar y hoy no hay datos de ninguna
agencia real: lo que existe es semilla de demostración. **El costo de esta decisión solo crece.**

## Opciones consideradas

### A — Relajar los contratos actuales

Hacer opcionales `acomodacion`, `tipoPasajero` y `neto`; dejar `Paquete` + `Temporada` + `Precio`
como están.

- **Gana:** cambio pequeño, el cotizador sigue en pie, cero migración.
- **Cuesta:** no resuelve el hecho 3. Dos productos con el mismo nombre y precios distintos siguen
  sin poder coexistir, porque el precio sigue colgando del paquete y no de la fecha. Y un modelo con
  la mitad de los campos en `null` deja de afirmar nada.
- **Cierra:** nada formalmente, y ese es el problema: deja la decisión para cuando sí haya datos.

### B — La salida programada asciende a unidad de venta (elegida)

`Departure` (Salida) pasa a ser lo que se vende y lo que se cotiza: fecha, cupo publicado, estado y
**sus propias tarifas**. `Package` (Paquete) queda como **plantilla reutilizable**: nombre, destino,
itinerario, noches, inclusiones, política. El precio deja de colgar del paquete.

- **Gana:** expresa el tarifario tal cual está. Cotizar se vuelve más corto, no más largo: un
  `departureId` basta para producir un precio enviable, sin composición de pasajeros ni
  acomodación. Y la repetición que ya está en la hoja —siete itinerarios en dos grupos de fechas—
  deja de ser duplicación de datos.
- **Cuesta:** dos tablas nuevas (`departures`, `fares`), semilla rehecha, y el cotizador actual
  pierde su camino principal.
- **Cierra:** que el precio viva en el paquete. A partir de aquí, un precio sin salida no existe.

### C — Dos modelos de catálogo conviviendo desde el día uno

Mantener el camino actual (paquete + temporada + matriz de acomodación) y añadir el de salida
programada en paralelo, con un discriminador por tenant.

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
`Departure`: `packageId`, fecha de salida, fecha de regreso, estado, tarifas, y un cupo
**informativo y opcional**. Informativo porque para un revendedor el inventario de sillas es del
mayorista: la disponibilidad se pregunta, no se calcula. Ninguna de las dos lleva precio fuera de
las tarifas de la salida.

**Frontera de módulos, para no crear un contexto nuevo** (ADR-0004): `quoting` posee `Package`,
`Departure` y `Fare` —son catálogo y precio—. Lo que ocurre **después de vender una silla** (reserva
contra el mayorista y su *time limit*) ya es de `booking`, que referencia `departureId`. `quoting`
publica `DepartureScheduled` y `DeparturePriced`. No se crea un módulo `operations`, y **no se crea
un agregado de inventario propio**: nuestro piloto no lo tiene.

### 2. El costo por defecto es el neto por silla. La hoja de costos es la excepción

**Aquí es donde la respuesta del propietario mueve el centro de gravedad.** La forma del diseño no
cambia; cambia cuál de sus dos casos es el principal — y eso cambia qué se construye primero.

**Camino por defecto, y lo único que se construye ahora:** la tarifa lleva `neto` y `venta`, como
hoy. `neto` es lo que cobra el mayorista por silla, `margen = venta − neto` por línea, y
`supplierId` dice a qué mayorista se le compra. **Esto ya funciona y no se toca.** Lo único que se
mueve es de dónde cuelga: del paquete a la tarifa de la salida.

**Excepción, diseñada y aplazada:** el tenant que además **opera** una salida propia —flete de bus,
guía, entradas en bloque— no tiene neto por silla: tiene costo fijo que se causa aunque vayan doce.
Para ese caso queda previsto `DepartureCost`, líneas con causación `FIJO_POR_SALIDA` y
`VARIABLE_POR_PASAJERO`, con margen por punto de equilibrio en vez de resta por línea. **No se
construye, no se migra y no entra en el esquema hasta que haya una agencia que lo necesite.** Queda
escrito aquí para que, cuando aparezca, nadie lo confunda con un descuento ni lo meta a la fuerza
dentro de `neto`.

Dicho sin suavizar: la versión anterior de este ADR hizo principal al caso raro. **El revendedor no
es el caso degenerado del operador: es el caso principal, y el operador es la extensión.** La opción
C sigue siendo innecesaria por la misma razón de antes —un concepto absorbe los dos—, pero el orden
de construcción es el inverso del que se escribió.

**El margen nunca es entrada obligatoria para cotizar.** Se cotiza contra la tarifa publicada. Una
tarifa sin `neto` cargado todavía cotiza y reporta margen desconocido — que es la verdad mientras
esperamos el tarifario del mayorista (tarea 2 de `ESTADO.md`).

`Paquete.mayoristaId` baja del paquete a la tarifa: el mayorista es de quien se compra **esa silla
en esa fecha**, y dos salidas del mismo paquete pueden comprarse a mayoristas distintos.

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
| ~~`Precio.neto`~~ — **corregido en la revisión: no se retira.** Es el costo real del piloto | sigue obligatorio, ahora como campo de `Fare` |
| `Temporada` como eje de precio | la salida lleva su tarifa; la temporada **genera** salidas |
| `Paquete.mayoristaId` | `supplierId` en la tarifa de la salida |
| `CotizarPaquete.markupExtra` como vía al precio de venta | el markup arma la tarifa; no es entrada de la cotización |
| `ComposicionPasajeros` obligatoria para cotizar | opcional; el precio sale solo con `departureId` |
| `CotizacionCalculada.acomodacion`, `habitaciones`, `plazasSinUsar` obligatorios | bloque opcional, solo si la salida tiene noches |
| El reparto automático de habitaciones («la acomodación que no deja plazas vacías») | **sale del camino principal.** Es el algoritmo más trabajado del cotizador y pasa a detalle opcional. Decirlo en voz alta: eso es lo que cuesta esta decisión |

**Lo que sobrevive intacto:** `Quote` y su versionado, `TravelFile`, el *time limit*, `Money` en
centavos, el cálculo en servidor, el aislamiento por tenant, `Mayorista` como proveedor, y la
cabeza de playa como segmento. La web del cotizador sobrevive como pantalla; cambia su entrada.

### El límite: esto es una apuesta, y así se declara

Una agencia y una hoja **prueban que el precio se ata a la fecha de salida y no al paquete, y que
hoy no lo podemos expresar. No prueban que el modelo de acomodación esté mal para otras agencias.**
Las dos realidades conviven en Colombia.

La apuesta, ya corregida, es esta: **que el revendedor también vende salidas con fecha, no paquetes
con fecha abierta.** La evidencia es que su hoja publica fechas concretas y que el mismo itinerario
cambia de precio entre dos de ellas. Es independiente de quién opere el bus.

**Qué la invalidaría:** que el piloto resulte vender mayoritariamente contra fecha elegida por el
cliente —el cliente pide «Salento la primera semana de noviembre» y la agencia cotiza contra un
rango de vigencia del mayorista, sin salidas publicadas—. Si eso pasa en dos de las próximas cinco
agencias, `Departure` se vuelve papeleo. No se revertiría este ADR: se escribiría uno nuevo que
reinstala el precio por rango de fechas sobre `Package` —la forma de `Temporada`, hoy retirada pero
no olvidada— como segunda ruta de cotización.

## Consecuencias

### Positivas
- Los 47 productos del tarifario real se expresan sin inventar un solo dato.
- Cotizar exige un identificador, no una entrevista: encaja con cómo se vende por WhatsApp.
- El cálculo de margen del piloto —`venta − neto` por silla— **sobrevive intacto**, y queda sitio
  previsto para el operador el día que aparezca, sin deformar el camino de hoy.
- Se cambia el esquema cuando cuesta poco: no hay datos de agencia real.

### Negativas
- **Se tira trabajo verificado.** El cotizador de punta a punta pierde su camino principal y el
  reparto de habitaciones sale del centro.
- Dos tablas nuevas y la semilla rehecha antes de entregar funcionalidad nueva.
- `Departure` añade una indirección que el revendedor paga aunque su mayorista le dé fechas
  abiertas. Es el costo directo de la apuesta declarada arriba.
- Apostamos sobre una hoja de la que **ni siquiera sabemos de quién es** (ver pregunta abierta 5).

### Qué habría que cambiar para revertir esto
Volver a `Paquete` + `Temporada` + `Precio` como camino principal: reinstalar la matriz y volver a
colgar la tarifa del paquete en vez de la salida. `neto` no entra en la reversión — nunca se fue.
Mientras no haya datos de producción es barato; con tres agencias vendiendo salidas, no.

## Cuándo revisar esta decisión

- Cuando **dos de cinco** agencias piloto coticen contra rango de vigencia y no contra salidas
  publicadas (§ el límite).
- Cuando llegue un tenant que **opere salidas propias**: ahí se construye `DepartureCost` y se
  escribe su ADR —cupo propio, mínimo de operación, salida en riesgo y reubicación—.
- Si `Fare.condicion` recibe su tercera petición de un caso que no cabe en la forma declarativa.

---

## Fuera de alcance de este ADR

**Fuera por no ser problema de nuestro piloto —son del operador, y el piloto revende:** cupo propio
y reserva de silla en vivo · estado «en riesgo» con fecha de decisión · mínimo de operación y
reubicación · planilla del conductor · `DepartureCost`. El dictamen los marcó bloqueantes; **para un
revendedor no lo son**, porque no decide si el bus sale: le pregunta al mayorista si hay cupo. Si
alguno de estos aparecía justificando algo en la versión anterior de este ADR, quedó retirado.

**Fuera por alcance, aunque sí nos tocan:** campaña comercial (`SalesCampaign`, que además colisiona
con `Campaign` de `automation`) · punto de abordaje · vista de saldos por salida · generar la pieza
de WhatsApp. Van a la cola de `ESTADO.md`, no a este documento.

## Preguntas abiertas con dueño

| # | Pregunta | Dueño |
|---|---|---|
| 1 | **Normativa de la pieza publicitaria.** La pieza no exhibe RNT, ni código de conducta ESCNNA, ni aviso de habeas data. **Este ADR no afirma qué obliga cada norma ni en qué soporte: no se verificó con fuente.** Verificar Ley 300/1996 y RNT, Ley 679/2001 y 1336/2009, Ley 1581/2012 | `investigador` |
| 2 | Reapuntar la cabeza de playa en `07-cabeza-de-playa-paquetes.md`; las nueve preguntas del §9 del dictamen a la agencia piloto | `dueno-de-producto` |
| 3 | RLS y aislamiento de `departures` y `fares`: `tenant_id` y política en ambas, ninguna excepción | `auditor-seguridad` |
| 4 | Dudas de transcripción del tarifario antes de sembrar | `experto-turismo` |
| 5 | **¿De quién es la hoja?** El propietario la dio «de referencia» y no lo sabemos. **(a)** Es la hoja que el piloto publica a sus clientes → los precios transcritos son público y el modelo se siembra tal cual. **(b)** Es la hoja que **el mayorista le manda al piloto** → esos precios son netos o sugeridos de venta, no público, y `Fare.venta` tendría que calcularse con markup sobre ellos antes de sembrar nada. **No se supone ninguna de las dos en este ADR** | `dueno-de-producto` |

## Entradas propuestas al lenguaje ubicuo

No se edita el diccionario en este ADR. Se proponen, para aprobación: `Departure` (Salida),
`Fare` (Tarifa), `PricingUnit` (Unidad de cobro), `TripFormat` (Formato de viaje, tabla por tenant).
`DepartureCost` y `BreakEven` quedan **nombrados pero no propuestos**: entran el día que haya un
tenant que opere salidas propias.
