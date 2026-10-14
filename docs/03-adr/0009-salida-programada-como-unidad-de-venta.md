# ADR-0009 — El precio se ata a una ventana de vigencia, no al paquete

- **Estado:** Propuesto
- **Fecha:** 2026-10-10
- **Decide:** Propietario del producto
- **Consultados:** `experto-turismo` (dictamen `docs/01-producto/11-dictamen-del-catalogo-real.md`),
  `arquitecto`. **Pendientes de revisar antes de aceptar:** `auditor-seguridad` (tablas nuevas con
  `tenant_id`), `dueno-de-producto` (reapuntar la cabeza de playa).
- **Supersede:** nada. Ver §6.

> **Dos revisiones antes de firmarse, y las dos retiraron una premisa. Se dejan a la vista.**
>
> **Revisión 1 — 2026-10-11.** El propietario respondió lo que la primera redacción daba por
> inferido: **la agencia piloto revende paquete de mayorista. No opera.** Cayó la premisa del bus
> fletado y del costo fijo.
>
> **Revisión 2 — 2026-10-13.** El propietario instruyó dos cosas: **«que sea paramétrico, estas
> agencias de turismo no todas trabajan igual»** y **«tarifario neto del mayorista, margen el
> 20 %»**. La primera retira la premisa que quedaba en pie: que había **un** arquetipo al que
> apostar. La segunda fija, por fin, cómo se forma el precio de venta. Esta revisión cambia el
> título del ADR, porque lo que se decide ya no es que la salida sea la unidad de venta — es de
> **qué** cuelga el precio, y la salida pasa a ser un caso particular de eso.

---

## Contexto

La fuerza es **falsabilidad del modelo, no volumen ni latencia**: el primer tarifario real de una
agencia no se puede representar con los contratos que ya tenemos, y la contradicción es estructural,
no de captura.

Cuatro hechos. Los tres primeros no dependen de quién opere; el cuarto es la instrucción de la
revisión 2, y es el que cambia la forma de la decisión.

1. `CrearPrecio` (`packages/contracts/src/catalogo.ts`) exige `acomodacion`, `tipoPasajero` y `neto`,
   los tres obligatorios. **`neto` es correcto y sigue siendo obligatorio** — es lo que la agencia
   le paga al mayorista. Los que no tienen sentido para más de media hoja son los otros dos.
2. Más de la mitad del catálogo no tiene noche —26 de 47 productos según el conteo del propietario,
   27 según el dictamen; la diferencia no cambia nada—. La acomodación no está escondida: **no
   existe** para esos productos. Con el contrato actual no se cotizan sin inventar datos.
3. «Piangüita + Ballenas» vale 329.000 como pasadía y 569.000 como pasanoche. **El nombre no
   identifica el producto; la fecha de salida sí.**
4. **No todas las agencias venden igual.** Unas publican fechas concretas —la hoja del piloto lo
   hace— y otras cotizan contra la fecha que el cliente elige, dentro de un rango de vigencia que
   les da el mayorista. **La misma agencia hace las dos cosas en semanas distintas.**

**Lo que la revisión 1 retiró y sigue retirado:** que la agencia flete el bus, que el costo sea fijo
aunque vayan doce, y que «no falta la tarifa neta: falta el concepto». Es falso para nuestro piloto.
El mayorista existe, el neto existe, y es exactamente el dato que seguimos esperando (tarea 2 de
`ESTADO.md`). Con esa premisa cae también el bloque de valor operativo que el dictamen celebraba
—cupo en vivo, salida «en riesgo», planilla del conductor—: **el revendedor no decide si el bus
sale; le pregunta al mayorista si hay cupo.**

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

### B — La salida programada asciende a unidad de venta

`Departure` (Salida) pasa a ser lo que se vende y lo que se cotiza, con **sus propias tarifas**.
`Package` queda como plantilla. El precio deja de colgar del paquete.

- **Gana:** expresa el tarifario del piloto tal cual está, y cotizar se acorta a un identificador.
- **Cuesta:** dos tablas nuevas, semilla rehecha, el cotizador pierde su camino principal.
- **Cierra:** el hecho 4. Una agencia que vende contra fecha elegida por el cliente tendría que
  publicar salidas falsas, una por cada día del rango, para poder cotizar. **Esto es lo que la
  revisión 2 descarta.**

### C — Dos modelos de catálogo conviviendo, con un discriminador por tenant

Mantener el camino actual (paquete + temporada + matriz de acomodación) y añadir el de salida
programada en paralelo.

- **Gana:** no apuesta por ningún arquetipo; sirve a las dos agencias siguientes vengan como vengan.
- **Cuesta:** dos caminos de cotización, dos superficies de prueba y dos formas de equivocarse,
  sostenidos por un equipo que todavía no tiene inbox de WhatsApp. Es el error que ADR-0006 nombra:
  configurabilidad que parece razonable opción por opción.
- **Cierra:** la regla de parada. Duplica el alcance del contexto más denso del sistema antes de
  tener una segunda agencia que lo justifique.

### D — Un solo eje, con la ventana de vigencia como parámetro (elegida)

**El error de encuadre de las tres opciones anteriores fue tratar «salida programada» y «fecha
abierta» como dos modelos.** No lo son. Son dos valores de un mismo eje:

> Una tarifa es un precio **válido para una ventana de fechas de salida**. Una salida programada es
> la ventana de **un solo día**, publicada, con cupo opcional. Una vigencia abierta es la ventana de
> un rango.

Con eso, `Temporada` no se retira: **se generaliza**. Y la salida no es un modelo rival, es su caso
degenerado. **Hay una sola función de resolución de tarifa, una sola superficie de prueba y una
sola forma de equivocarse** — que es justo lo que C no conseguía.

- **Gana:** sirve a las dos agencias del hecho 4 sin duplicar el cotizador. Y sirve a la misma
  agencia haciendo las dos cosas, que es el caso que C tampoco cubría bien.
- **Cuesta:** un paso de resolución —dada una fecha, ¿qué ventana aplica?— con una regla de desempate
  que hay que escribir y probar. Más una tabla de configuración por tenant.
- **Cierra:** que una tarifa exista sin ventana. A partir de aquí, **un precio sin vigencia no
  existe**.

## Decisión

**Opción D**, con seis resoluciones: la forma, **tres ejes paramétricos declarados**, una lista
explícita de lo que **nunca** se parametriza, y el tratamiento del costo.

### 1. `Fare` cuelga de una ventana; `Departure` es la ventana de un día

`Package` (Paquete) es **plantilla**: nombre, destino, noches, itinerario, inclusiones, exclusiones,
plantilla de política. **No lleva precio.**

`Fare` (Tarifa) es el precio, y cuelga de una **`Vigencia`**: `desde`, `hasta` y un `departureId`
opcional. Cuando `desde = hasta` y la ventana está **publicada**, eso es una `Departure` (Salida):
una fecha concreta que el cliente ve en la pieza de WhatsApp, con cupo **informativo y opcional**
—informativo porque para un revendedor el inventario de sillas es del mayorista: la disponibilidad
se pregunta, no se calcula—.

**La resolución es una sola función, igual para todos los tenants:** dado `(paqueteId, fecha)`,
devuelve la tarifa aplicable. **Regla de desempate, y es la única que hay: lo más específico gana.**
Una salida publicada en esa fecha vence a una vigencia abierta que la contenga; entre dos vigencias
abiertas que se solapen, gana la más corta; si empatan en longitud, **es un error de datos y se
devuelve como tal**, no se elige en silencio. Una agencia con solapes sin resolver tiene un problema
de tarifario y merece verlo, no heredar un precio elegido por orden de inserción.

**Frontera de módulos, para no crear un contexto nuevo** (ADR-0004): `quoting` posee `Package`,
`Vigencia`, `Departure` y `Fare` —son catálogo y precio—. Lo que ocurre **después de vender una
silla** (reserva contra el mayorista y su *time limit*) ya es de `booking`, que referencia la
vigencia o la salida. `quoting` publica `DepartureScheduled` y `DeparturePriced`. No se crea un
módulo `operations`, y **no se crea un agregado de inventario propio**: nuestro piloto no lo tiene.

### 2. Los tres ejes paramétricos

Esto es lo que pide la instrucción del propietario, acotado a ADR-0006: **nivel 1, configuración por
tenant.** Ninguno de los tres añade un camino de código nuevo, y esa frase es la que hay que
defender cada vez que alguien quiera tocar esta parte.

#### Eje 1 — Cómo se publica la vigencia

`modoDeCatalogo`: `SALIDAS_PUBLICADAS`, `VIGENCIA_ABIERTA` o `AMBOS`. **Afecta solo a las altas y a
la interfaz** —qué formulario se muestra, qué se exige al cargar el tarifario—. **No afecta a la
resolución ni al cálculo**, que son idénticos para los tres valores.

Ese límite es la diferencia entre esta decisión y la opción C, y hay que vigilarlo: **el día que una
ruta de cotización ramifique sobre `modoDeCatalogo`, nos hemos vuelto C sin haberlo decidido.**

#### Eje 2 — Cómo se forma el precio de venta

Aquí entra la segunda instrucción del propietario: **neto del mayorista, margen 20 %.** Son cuatro
parámetros, y el primero es una ambigüedad que **no se puede adivinar**:

| Parámetro | Valores | Por defecto |
|---|---|---|
| `porcentaje` | 0 a 500 | **20** |
| `base` | `SOBRE_EL_NETO` · `SOBRE_LA_VENTA` | `SOBRE_EL_NETO` |
| `origenDeLaVenta` | `DERIVADA_DEL_NETO` · `FIJADA_EN_EL_TARIFARIO` | `DERIVADA_DEL_NETO` |
| `redondeoVenta` | en unidades mínimas de la moneda; 0 = sin redondear | **1.000** |

**`base` vale dinero, y hay que decirlo en voz alta.** «Margen del 20 %» tiene dos lecturas, y dan
números distintos sobre el mismo neto de $1.000.000:

| Lectura | Cómo lo dice una agencia | Venta |
|---|---|---|
| `SOBRE_EL_NETO` (markup) | «le subo el 20 %» | **$1.200.000** |
| `SOBRE_LA_VENTA` (comisión) | «me deja el 20 %» | **$1.250.000** |

Son **$50.000 por silla**. En un bus de cuarenta, dos millones de pesos por salida. Este ADR
**toma `SOBRE_EL_NETO` como valor por defecto porque es la lectura más frecuente en agencia
minorista colombiana, y lo declara como suposición nuestra, no como dato del propietario.**
Cambiarlo es una palabra suya y un campo de una tabla: no se toca una línea de código.

`origenDeLaVenta` decide quién manda cuando el mayorista sube su neto. Con `DERIVADA_DEL_NETO` la
venta se recalcula y la agencia conserva su margen; con `FIJADA_EN_EL_TARIFARIO` el número de la
hoja es ley y el porcentaje queda como sugerencia al capturar y como cifra en el informe. **Las dos
existen de verdad en el mercado**, y la diferencia es de negocio, no de arquitectura.

`redondeoVenta` existe porque ninguna hoja de tarifas colombiana publica $1.236.432. Se redondea
**la venta, nunca el neto**: el neto es lo que cobra el mayorista y no es nuestro para redondearlo.

#### Eje 3 — Qué pregunta el cotizador

**Este NO es un interruptor, y es a propósito.** Si las tarifas aplicables traen condición de
acomodación o de tipo de pasajero, el cotizador pregunta la composición de pasajeros; si no la
traen, no pregunta. **Se deriva del dato.**

Una bandera que puede contradecir al dato es un defecto esperando su turno, y aquí no hace ninguna
falta: el tarifario ya dice si el producto tiene habitaciones. Así, la agencia de pasadías nunca ve
una pantalla de acomodación sin haber configurado nada, y la de paquetes con hotel la ve siempre,
sin que nadie haya elegido un modo.

### 3. Lo que **nunca** se parametriza

R12 dice que se parametriza la política y nunca el invariante. La lista, escrita para que
«que sea paramétrico» no se lea más ancho de lo que es:

| Invariante | Por qué no es configurable |
|---|---|
| **La unidad de cobro** (`PER_PERSON`, `PER_GROUP` con `cubrePasajeros`) | Es el **denominador**: aritmética, no política |
| **El dinero en enteros**, en la unidad mínima de la moneda | R8. En COP esa unidad es **el peso**, no el centavo |
| **Una cotización congela sus números** | Cambiar la política jamás altera una cotización ya enviada. Es lo que protege a la agencia si el cliente reclama |
| **El cálculo ocurre en el servidor** | El navegador no calcula precio |
| **`neto` nunca sale del tenant** | Es lo que la agencia le paga al mayorista |
| **Una sola función de resolución de tarifa** | El eje 1 mueve las altas, no el cálculo |
| **El aislamiento entre agencias** | R1. No se negocia nunca |

### 4. `Fare` sí; motor de condiciones no

Una vigencia tiene N tarifas: nombre, monto, **unidad de cobro**, condición de aplicación y
`supplierId`. La tarifa por defecto es por persona.

**Unidad de cobro:** `PER_PERSON` y `PER_GROUP` con `cubrePasajeros: n`. «Promo pareja» es
`PER_GROUP` con `cubrePasajeros = 2`; el precio de grupo es `PER_GROUP` con n mayor. Se elimina
`PER_COUPLE` —es redundante— y se elimina `PER_VEHICLE`: el vehículo es un **costo**, no una tarifa,
y tiene su sitio en §5.

**La condición es declarativa y cerrada**, no una expresión evaluable: número exacto / mínimo /
máximo de pasajeros, rango de edad, acomodación, y ocupa-silla sí/no. Un motor de reglas genérico en
el catálogo sería el nivel 5 que ADR-0006 prohíbe, y nadie lo pidió. Si aparecen tres agencias con
una condición que no cabe, **se añade un caso, no un lenguaje.**

Con esto, un solo concepto absorbe los cuatro casos reales de la hoja: promo pareja, suplemento de
sencilla (tarifa `PER_PERSON` aditiva), tarifa de menor y precio de grupo.

**R8:** los montos `PER_GROUP` se guardan íntegros. Dividir entre `cubrePasajeros` es
**presentación**, y se marca como derivado. Nunca se persiste el per cápita de una tarifa de grupo.

**R12 y el vocabulario:** el invariante es **el número de noches**. «Pasadía», «pasanoche»,
«excursión», «mini-excursión» y «super excursión» son `TripFormat`: **tabla por tenant**, sembrada
con los cinco, derivable de las noches. Un `enum` cerrado sería exactamente el error que R12
previene —la propia hoja los solapa: tres días cae en dos categorías—. **Ninguna ruta de cotización
puede ramificar sobre la etiqueta.**

### 5. El costo por defecto es el neto por silla. La hoja de costos es la excepción

**Camino por defecto, y lo único que se construye ahora:** la tarifa lleva `neto` y `venta`. `neto`
es lo que cobra el mayorista por silla, `supplierId` dice a quién se le compra, y la venta sale del
eje 2. `Paquete.mayoristaId` baja del paquete a la tarifa: el mayorista es de quien se compra **esa
silla en esa fecha**, y dos salidas del mismo paquete pueden comprarse a mayoristas distintos.

**Excepción, diseñada y aplazada:** el tenant que además **opera** una salida propia —flete de bus,
guía, entradas en bloque— no tiene neto por silla: tiene costo fijo que se causa aunque vayan doce.
Para ese caso queda previsto `DepartureCost`, con causación `FIJO_POR_SALIDA` y
`VARIABLE_POR_PASAJERO`, y margen por punto de equilibrio en lugar de resta por línea. **No se
construye, no se migra y no entra en el esquema hasta que haya una agencia que lo necesite.** Queda
escrito aquí para que, cuando aparezca, nadie lo confunda con un descuento ni lo meta a la fuerza
dentro de `neto`.

**El margen nunca es entrada obligatoria para cotizar.** Se cotiza contra la tarifa publicada. Una
tarifa sin `neto` cargado **cotiza igual y reporta margen desconocido** —`null`, no cero—, que es la
verdad mientras esperamos el tarifario del mayorista.

### 6. Qué sobrevive y qué se retira

**No se supersede ADR-0006.** ADR-0006 decide *hasta dónde llega la configurabilidad*, no la forma
del catálogo; su regla —se parametriza la política, nunca el invariante— es justamente la que
sostiene los §2 y §3 de arriba, y los tres ejes son **nivel 1**, que ADR-0006 ya puso en v1. Lo
único que queda desactualizado es una celda de su tabla de áreas configurables: donde dice
«Catálogo: productos, proveedores, tarifarios, temporadas», léase «vigencias, salidas y tarifas».
Eso es inventario de lo configurable, no la decisión. **Ningún ADR anterior cambia de estado.**

El modelo de catálogo nunca tuvo ADR: vivía en `07-cabeza-de-playa-paquetes.md` y en los contratos.
Por eso este ADR no supersede: **cierra un hueco**.

| Se retira | A dónde va |
|---|---|
| `Precio` como entidad de precio | lo reemplaza `Fare` |
| `acomodacion` y `tipoPasajero` **obligatorios** en `CrearPrecio` | condición **opcional** de una `Fare` |
| ~~`Precio.neto`~~ — **no se retira** (revisión 1). Es el costo real del piloto | sigue obligatorio, ahora como campo de `Fare` |
| ~~`Temporada` como eje de precio~~ — **no se retira** (revisión 2). Se **generaliza** a `Vigencia` | la salida pasa a ser la vigencia de un día |
| `Paquete.mayoristaId` | `supplierId` en la tarifa |
| `CotizarPaquete.markupExtra` como vía al precio de venta | el markup es política del tenant (eje 2); se admite anulación por tarifa, no por petición de cotización |
| `ComposicionPasajeros` obligatoria para cotizar | opcional, **y lo decide el dato** (eje 3) |
| `CotizacionCalculada.acomodacion`, `habitaciones`, `plazasSinUsar` obligatorios | bloque opcional, solo si las tarifas aplicables lo piden |
| El reparto automático de habitaciones como **camino único** | **la revisión 2 lo rescata**: deja de ser único, pero para la agencia de paquetes con hotel sigue siendo el centro. La revisión 1 lo daba por amortizado; era consecuencia de apostar por un solo arquetipo |

**Lo que sobrevive intacto:** `Quote` y su versionado, `TravelFile`, el *time limit*, `Money` en
enteros, el cálculo en servidor, el aislamiento por tenant, `Mayorista` como proveedor, y la cabeza
de playa como segmento. La web del cotizador sobrevive como pantalla; cambia su entrada.

### El límite: qué sigue siendo apuesta

La revisión 2 **baja el riesgo, no lo elimina**, y conviene no vender lo contrario.

**Lo que ya no es apuesta:** que el precio se ata a una ventana de fechas y no al nombre del
paquete. Lo prueban el hecho 3 y la propia hoja.

**Lo que sigue siéndolo:** que **una sola** función de resolución cubra de verdad los dos modos. Si
la agencia de vigencia abierta necesita escalas que cambian dentro de la misma ventana según la
**antelación de compra** —*early bird*, que existe y es común—, la ventana por fecha de salida no
basta: haría falta una segunda dimensión, la fecha de **compra**. **Eso no está en este ADR, y lo
decidiría un ADR nuevo**, no un parche a la condición de la tarifa.

**Qué invalidaría la decisión:** que en dos de las próximas cinco agencias haya que ramificar el
**cálculo** —no las altas— sobre `modoDeCatalogo`. Si eso pasa, D se ha vuelto C de hecho, y lo
honesto es reconocerlo y pagar el precio de C a conciencia.

## Consecuencias

### Positivas
- Los 47 productos del tarifario real se expresan sin inventar un solo dato.
- Cotizar exige un identificador y una fecha, no una entrevista: encaja con cómo se vende por
  WhatsApp.
- La agencia que vende con fecha abierta **ya no queda fuera**, y no cuesta un segundo cotizador.
- El «20 %» deja de ser un número en la cabeza de alguien: pasa a ser un campo con dueño, con base
  declarada y con prueba.
- Se cambia el esquema cuando cuesta poco: no hay datos de agencia real.

### Negativas
- **Se añade un paso.** La resolución de tarifa con desempate es código que antes no existía, y es
  exactamente donde se esconderán los defectos de precio. Necesita pruebas de solape, no de camino
  feliz.
- El cotizador de punta a punta cambia su entrada, y la semilla se rehace.
- Una tabla de configuración por tenant más, con su `tenant_id`, su política RLS y su valor por
  defecto.
- **`base` por defecto es una suposición nuestra, no un dato del propietario.** Mientras no se
  confirme, toda cifra de margen que enseñemos lleva ese asterisco.
- Seguimos sin el **neto** del mayorista: lo que tenemos son precios de venta al público (pregunta
  abierta 5).

### Qué habría que cambiar para revertir esto
Volver a colgar la tarifa del paquete y reinstalar la matriz como camino único. `neto` no entra en
la reversión —nunca se fue— y `Temporada` tampoco, porque tras la revisión 2 sobrevive como
`Vigencia`. Mientras no haya datos de producción es barato; con tres agencias vendiendo, no.

## Cuándo revisar esta decisión

- Cuando alguna ruta de **cálculo** —no de altas— necesite ramificar sobre `modoDeCatalogo`.
- Cuando aparezca la primera petición de precio por **fecha de compra** (*early bird*): eso pide un
  ADR propio, no un campo más.
- Cuando llegue un tenant que **opere salidas propias**: ahí se construye `DepartureCost` y se
  escribe su ADR —cupo propio, mínimo de operación, salida en riesgo y reubicación—.
- Si `Fare.condicion` recibe su tercera petición de un caso que no cabe en la forma declarativa.

---

## Fuera de alcance de este ADR

**Fuera por no ser problema de nuestro piloto —son del operador, y el piloto revende:** cupo propio
y reserva de silla en vivo · estado «en riesgo» con fecha de decisión · mínimo de operación y
reubicación · planilla del conductor · `DepartureCost`. El dictamen los marcó bloqueantes; **para un
revendedor no lo son**, porque no decide si el bus sale: le pregunta al mayorista si hay cupo.

**Fuera por alcance, aunque sí nos tocan:** campaña comercial (`SalesCampaign`, que además colisiona
con `Campaign` de `automation`) · punto de abordaje · vista de saldos por salida · generar la pieza
de WhatsApp · precio por fecha de compra. Van a la cola de `ESTADO.md`, no a este documento.

## Preguntas abiertas con dueño

| # | Pregunta | Dueño |
|---|---|---|
| 1 | **Normativa de la pieza publicitaria.** La pieza no exhibe RNT, ni código de conducta ESCNNA, ni aviso de habeas data. **Este ADR no afirma qué obliga cada norma ni en qué soporte: no se verificó con fuente.** Verificar Ley 300/1996 y RNT, Ley 679/2001 y 1336/2009, Ley 1581/2012 | `investigador` |
| 2 | Reapuntar la cabeza de playa en `07-cabeza-de-playa-paquetes.md`; las nueve preguntas del §9 del dictamen a la agencia piloto | `dueno-de-producto` |
| 3 | RLS y aislamiento de `vigencias`, `salidas`, `tarifas` y `politicas_de_precio`: `tenant_id` y política en las cuatro, ninguna excepción | `auditor-seguridad` |
| 4 | Dudas de transcripción del tarifario antes de sembrar | `experto-turismo` |
| 5 | **Resuelta a medias en la revisión 2.** El propietario fijó la regla: **neto del mayorista + 20 %**. Queda abierta **una sola palabra**: ¿el 20 % va **sobre el neto** o **sobre la venta**? (§2, eje 2). Y sigue sin llegar la hoja de netos: las cifras que tenemos son de venta al público, así que **el neto de la semilla se deriva** —`venta ÷ 1,20`— y **se marca como derivado**, nunca como dato del mayorista | `dueno-de-producto` |

## Entradas propuestas al lenguaje ubicuo

No se edita el diccionario en este ADR. Se proponen, para aprobación: `Vigencia` (Ventana de
vigencia), `Departure` (Salida), `Fare` (Tarifa), `PricingUnit` (Unidad de cobro), `PricingPolicy`
(Política de precio), `TripFormat` (Formato de viaje, tabla por tenant). `DepartureCost` y
`BreakEven` quedan **nombrados pero no propuestos**: entran el día que haya un tenant que opere
salidas propias.
