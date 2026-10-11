> ## ⚠️ Corregido el 2026-10-11 — la premisa central de este dictamen es falsa para nuestro piloto
>
> Este documento concluye que la agencia **opera** su propia excursión en bus. Era una
> **inferencia a partir de una imagen**, no un dato, y el propietario la desmintió al día
> siguiente: **la agencia piloto usa paquetes de mayoristas. Revende.**
>
> Lo que cae con ella, y está en todo el texto: «no falta la tarifa neta, falta el concepto»
> —el mayorista existe y el neto existe—, el costo como bus fletado con punto de equilibrio, y
> el valor operativo que de ahí se derivaba: cupo en vivo, salida «en riesgo», planilla del
> conductor. El revendedor no decide si el bus sale; le pregunta al mayorista si hay cupo.
>
> **Lo que sigue en pie** y es la razón de conservar este documento entero en vez de borrarlo:
> la salida con fecha como unidad de venta, `Fare` con su unidad de cobro, los 26 de 47
> productos sin noche, y la lectura de la imagen que ninguna transcripción captura —que el
> avión de «Super Excursiones» es decorativo y los 47 productos son terrestres.
>
> **Manda el `ADR-0009`**, revisado con el dato correcto. Esto se queda como está, sin limpiar,
> porque un documento que esconde en qué se equivocó enseña menos que uno que lo deja ver.

# Dictamen del catálogo real — `experto-turismo`

> **Fuente:** `docs/01-producto/10-catalogo-real-de-referencia.json` y la imagen original
> `docs/_assets/catalogo/2026-10-tarifario-semana-de-receso.png`.
> **Fecha:** 2026-10-10. **Encargo:** decir si el tarifario desmiente el modelo, y qué hacer.
>
> Esto es criterio de sector, no de ingeniería. **Lo que haya que cambiar lo decide el
> `arquitecto` con un ADR.** Aquí no se edita ni contrato ni diccionario: se proponen entradas.

---

## 0. Veredicto en una línea

**Sí, tienes razón — pero el problema no es que el modelo esté sobredimensionado: es que está
apuntando a otro negocio.** Modelamos la agencia que *revende paquete de mayorista*; esta hoja la
vende una agencia que *opera su propia excursión en bus*. No son la misma empresa y no se cotizan
igual.

---

## 1. Lo que la imagen dice y la transcripción no captura

Seis señales que solo están en el PNG:

1. **El icono de PASANOCHES es un bus.** El de SUPER EXCURSIONES es un avión — pero
   «Costa Atlántica, 3 al 12 de octubre, 10 días, $1.689.000» desde el Eje Cafetero **no puede
   incluir vuelo**: eso no paga ni el tiquete. El avión es decorativo, significa «destino lejano».
   **Los 47 productos son terrestres.** Esto gobierna todo lo demás: el producto es una silla de bus.
2. **No hay un solo asterisco, ni nota al pie, ni condiciones.** Ni «precio por persona», ni
   vigencia, ni política de cancelación, ni qué incluye. Todo eso vive en la conversación.
3. **No hay RNT, ni código de conducta ESCNNA, ni aviso de habeas data.** Ver §7.
4. **No hay teléfono, ni logo, ni dirección.** Porque la pieza **viaja dentro de WhatsApp**: el
   número es el canal por el que llega. El catálogo real de esta agencia **es una imagen difundida
   por WhatsApp**. Dato de producto de primer orden.
5. **El mismo producto aparece a precios distintos en secciones distintas.** «Piangüita + Ballenas»
   vale 329.000 como pasadía y 569.000 como pasanoche. El itinerario es el mismo; lo que cambia es
   la salida.
6. **Son 47 filas pero ≈34 itinerarios distintos.** «Parque del café» y otros seis se repiten entre
   sábado y domingo al mismo precio. La hoja ya distingue, sin decirlo, entre *plantilla* y *salida*.

---

## 2. Pregunta 1 — Acomodación y tipo de pasajero

**No está sobredimensionado el concepto: está sobredimensionada su obligatoriedad, y está mal
puesto el eje.** Tres cosas distintas, mezcladas:

**a) En 27 de los 47 productos la acomodación no existe, no está escondida.** Un pasadía no tiene
habitación. Preguntar «¿sencilla o doble?» para Lago Calima es una pregunta sin sentido. Hoy
`CrearPrecio` exige `acomodacion` y `tipoPasajero`, y `CotizacionCalculada` devuelve `acomodacion`,
`habitaciones` y `plazasSinUsar` como campos obligatorios. **Con el contrato actual no se puede
cotizar más de la mitad de esta hoja sin inventar datos.** Severidad: **bloqueante**.

**b) En los que sí tienen noche, la acomodación existe pero no es un eje de precio: es un
supuesto por defecto más un suplemento.** El precio publicado de un pasanoche o de una super
excursión es, por convención del sector, **acomodación múltiple** (3 o 4 por habitación). Nadie
publica la matriz. Lo que existe es **un precio base y un `suplemento sencilla`** que el asesor
canta por teléfono a quien lo pide — y lo pide uno de cada diez. Invertimos la relación: hicimos
matriz lo que el negocio trata como excepción.

**c) El tipo de pasajero sí existe, pero su disparador no es la edad: es la silla.** En bus la
pregunta que mueve el precio es **«¿el niño ocupa silla?»**. El menor que va en las piernas no paga
transporte; paga, si acaso, la entrada al parque y el seguro. Y las entradas (Parque del Café,
Panaca, Ukumarí) tienen **su propia tarifa de menor, por estatura o por edad, fijada por el
tercero, no por la agencia**. Es el mismo patrón que INF-sin-asiento en aéreo, aplicado al bus.

**¿Dónde vive esa complejidad y cuándo aparece?** En el cierre, nunca en el catálogo. La secuencia
real es: el cliente reenvía la imagen y escribe «¿el de Panaca el domingo?» → el asesor responde el
precio **en el primer mensaje** → y solo entonces pregunta cuántos van, qué edades, si el niño
ocupa silla y dónde abordan. **El precio se da antes de conocer la composición.** Un cotizador que
exige composición para producir un número no sirve en este canal.

> **Requisito de negocio:** el precio publicado de una salida debe poder enviarse **sin configurar
> nada**. Acomodación, edades y suplementos son refinamientos **opcionales y posteriores**, no
> campos de entrada.

---

## 3. Pregunta 2 — ¿Salida o paquete?

**La `Salida` es la entidad que se vende. El `Paquete` es la plantilla que se reutiliza.** Tienes
razón, y la evidencia está en la propia hoja (§1.5 y §1.6): el mismo itinerario cambia de precio
según la salida, y siete itinerarios se repiten en dos grupos de fechas.

Lo que carga la `Salida`: **fecha, cupo, precio, vehículo, estado**. Lo que carga el `Paquete`:
nombre, destino, itinerario, inclusiones, política. El cupo no es atributo secundario — **es el
inventario**. Un bus tiene 40 sillas y cuando se acaban se acabó el producto, aunque el «paquete»
siga existiendo.

**`Temporada` no está mal: está mal usada.** Aquí la temporada no modifica un precio — **genera las
salidas**. «Semana de receso» es el motivo por el que existen estas ocho fechas. Eso en la agencia
tiene un nombre y un ritual mensual: **la campaña**. La pieza completa es la unidad de trabajo
comercial: se arma, se diseña, se difunde, se mide. Propongo elevarla a entidad (§5).

---

## 4. Pregunta 3 — El vocabulario

**Mezcla: dos son del sector, tres son gradación comercial de esta agencia.**

| Término | ¿Estándar? | Dictamen |
|---|---|---|
| **Pasadía** | **Sí**, plenamente. Uso general en Colombia | Entra al diccionario |
| **Pasanoche** | **Sí** entre operadores terrestres (Antioquia, Eje Cafetero). Menos canónico | Entra |
| **Excursión** | **Sí**, universal | Entra |
| **Mini-excursión** / **Super excursión** | **No**. Gradación de marketing | **No entran como tipos** |

La prueba de que no son categorías duras está en la misma hoja: mini-excursión dice «dos o tres
días» y excursión dice «tres o cuatro». **Un viaje de tres días cae en las dos.** La otra agencia
de la esquina pondrá los cortes en otro lado.

**Lo invariante es el número de noches; la etiqueta es política comercial del tenant.** Esto es
exactamente R12: se parametriza la política, nunca el invariante. Un `enum` cerrado con los cinco
valores sería el error.

**Propuesta de entradas al diccionario** (para que las apruebe el `arquitecto`):

| Término | Código propuesto | Qué es |
|---|---|---|
| **Formato de viaje** | `TripFormat` | Etiqueta comercial derivada de las noches. **Tabla por tenant, no `enum`.** Se siembra con los cinco |
| **Pasadía** | `TripFormat` con `nights = 0` | Salida y regreso el mismo día. Sin alojamiento |
| **Pasanoche** | `TripFormat` con `nights = 1` | Una noche |
| **Salida** | `Departure` | **Ya existe en el diccionario.** Asciende a entidad vendible: fecha, cupo, precio, estado |
| **Campaña comercial** | `SalesCampaign` | Conjunto de salidas publicado como una pieza. **Ojo: colisiona con `Campaign` de `automation`** — hay que desambiguar |
| **Cupo de salida** | `DepartureCapacity` | Sillas totales y disponibles. **No confundir con `Allotment`**, que es cupo del mayorista |
| **Punto de abordaje** | `PickupPoint` | Dónde sube el pasajero. Atributo de la venta, no del paquete |
| **Planilla de pasajeros** | `PassengerManifest` | El listado que recibe el conductor y la aseguradora |
| **Tarifa** | `Fare` | Ver §5. Precio con unidad de cobro y condición |
| **Unidad de cobro** | `PricingUnit` | `PER_PERSON`, `PER_COUPLE`, `PER_GROUP`, `PER_VEHICLE` |

---

## 5. Pregunta 4 — «Promo pareja»

**Ninguna de las tres opciones que planteas. No es descuento, ni producto distinto: es un precio
con otra unidad de cobro.** Y la aritmética lo demuestra:

| Producto | Precio pasadía (p.p.) | × 2 | Promo pareja | Implica |
|---|---|---|---|---|
| Consotá | 189.000 | 378.000 | **280.000** | −26 % |
| Ukumarí + Filandia | (Ukumarí+Consotá) 259.000 | 518.000 | **369.000** | −29 % |

Si «Promo pareja Consotá» fuera por persona, costaría **más** que el pasadía normal (280.000 contra
189.000) y nadie la compraría. **Solo tiene sentido leída como precio por la pareja.** Descuentos
consistentes del 26-29 % confirman la lectura.

Dos consecuencias:

- **Lo que cambia no es el monto: es el denominador.** Un modelo que solo guarda número y moneda no
  puede expresar esto, y el asesor acabará dividiendo a mano — y equivocándose.
- **«Ukumarí + Filandia» no existe en ninguna otra sección.** No es un descuento sobre algo
  preexistente: es un armado propio. Una tabla de promociones que apunte a un producto base no lo
  representa.

> **Requisito:** una `Salida` tiene **N tarifas**. Cada una con nombre, **unidad de cobro**,
> **condición de aplicación** (p. ej. «exactamente 2 pasajeros») y **vigencia propia**. La tarifa
> por defecto es por persona.

**Un solo concepto absorbe cuatro problemas:** promo pareja, suplemento de sencilla, tarifa de
menor y precio de grupo. Es la pieza con mejor relación valor/costo de todo este dictamen.

---

## 6. La pregunta que importa: el trabajo del asesor que la hoja esconde

Esta imagen es la **punta** del trabajo. Debajo hay esto, y nada está modelado:

**6.1 Armar la salida — y aquí se rompe el modelo de margen. `bloqueante`.**
La agencia **flete un bus completo**: paga por el vehículo, no por pasajero. Ese costo es **fijo y
se causa aunque vayan 12**. Súmale guía, entradas y hoteles en bloque. Entonces:

```
margen de la salida = (sillas vendidas × tarifa) − costo fijo del bus − costos variables por pax
```

**No hay «tarifa neta por pasajero» de la cual sacar markup.** Nuestro modelo —`neto` por pasajero,
`markup` encima, `mayoristaId` en el paquete— **presupone un mayorista que aquí no existe**: esta
agencia *es* el operador. Por eso el JSON dice, con razón, que el margen no se puede calcular. No
falta el dato: **falta el concepto**. El margen de una salida es un resultado del punto de
equilibrio, no una resta por línea. Es el hallazgo más caro de ignorar.

**6.2 Controlar el cupo. `bloqueante`.**
«¿Quedan sillas para el Nevado el domingo?» es la pregunta que el asesor responde veinte veces al
día. Hoy se resuelve con un Excel compartido o gritando en un grupo de WhatsApp — y se sobrevende.
Hace falta disponibilidad en vivo, **reserva de silla con *time limit*** (el concepto sí aplica
aquí: la silla se separa con abono y se libera si no entra), lista de espera y asignación de
puestos, que importa cuando viaja una familia.

**6.3 El bus que no se llena. `bloqueante`.**
Existe un **mínimo de operación** (del orden de 25 de 40) y una **fecha de decisión**, típicamente
tres a cinco días antes. Si no se alcanza, el asesor hace una de cuatro cosas: cancelar y reubicar,
bajar de bus a buseta renegociando el flete, fusionar dos salidas, u operar a pérdida para no
quemar la marca. **Nuestro modelo no sabe que una salida puede morir.** Hace falta estado
`en riesgo` con alerta, y mover pasajeros de una salida a otra **en un gesto**.

**6.4 Lo que pregunta antes de poder cerrar. `importante`.**
Cuántos van y qué edades · si el menor ocupa silla · **dónde aborda** (la agencia recoge en tres o
cuatro paraderos de la ciudad; falta por completo en el modelo) · condición médica, embarazo o
movilidad reducida — en un circuito de diez días en bus esto decide si el pasajero puede ir ·
documentos, y **permiso de viaje para el menor que no va con sus padres**.

**6.5 Cartera. `importante`.**
Se separa con abono (30-50 %) y se paga el saldo días antes. Perseguir saldos por WhatsApp es tarea
diaria. El entregable es trivial y nadie lo tiene: **«quiénes deben saldo para la salida del
sábado»**.

**6.6 La planilla de pasajeros. `importante` — y el mejor regalo de todos.**
La víspera, alguien arma a mano la lista para el conductor, el guía y la aseguradora: nombre,
cédula, teléfono, contacto de emergencia, punto de recogida, observaciones. **Generarla con un clic
es la funcionalidad más vendible de esta rebanada** y es invisible en el tarifario.

**6.7 El día del viaje. `mejora`.** El no-show, el que llama porque el bus no pasó, el cambio a las
cinco de la mañana.

---

## 7. Cumplimiento — hallazgo no solicitado

La pieza **no exhibe RNT, ni código de conducta ESCNNA (Ley 1336 / Ley 679), ni aviso de
tratamiento de datos (Ley 1581 de 2012)**, pese a ser publicidad turística que capta datos por
WhatsApp. No sé si la agencia los incluye en otro soporte, y **no afirmo el detalle exacto de qué
medio obliga cada norma: queda pendiente de verificación con fuente.** Dicho eso, la oportunidad de
producto es clara y barata: **que el CRM inserte RNT y código de conducta en toda cotización y
registre la aceptación de habeas data al primer contacto**. Severidad: **importante**, y es
argumento de venta, no solo de cumplimiento.

---

## 8. ¿Nos equivocamos de cabeza de playa?

**El segmento está bien. El arquetipo de producto está mal.**

- **Acertamos:** agencia pequeña colombiana que vive en WhatsApp, cuyo catálogo es una imagen y
  cuyo cuello de botella es convertir un mensaje suelto en un precio. Intacto.
- **Erramos:** `07-cabeza-de-playa-paquetes.md` dice «revende producto de mayorista… escoge de un
  tarifario, aplica su margen». **Esta agencia no revende: opera.** De ahí salen `mayoristaId`,
  `neto` por pasajero, matriz de acomodación y temporadas como ejes de precio. **Ninguno de los
  cuatro aparece en la hoja.**

**Recomendación: no cambiar de cabeza de playa — reapuntarla a la `salida programada`.** Y hay una
buena noticia: el modelo de salida programada es **más simple** de cotizar —un precio, una fecha,
una silla— así que reapuntar **acorta** el camino a entregar, no lo alarga. Sirve a la regla de
parada.

**Dos salvedades honestas.** Primera: esto es **una agencia y una hoja**. Prueba que el modelo de
salida programada existe y que hoy no lo podemos expresar; **no** prueba que el modelo de
acomodación esté equivocado para otras — las dos realidades conviven en Colombia. Segunda: nada de
lo que hay que hacer es tirar código. `Quote`, `TravelFile`, `time limit` y el versionado siguen en
pie. Lo que cambia es **qué es el ítem que se cotiza**.

---

## 9. Lo que le falta preguntar a la agencia piloto

Las siete preguntas de `07-cabeza-de-playa-paquetes.md` §5 presuponen mayorista. Faltan estas:

1. ¿El bus se flete completo o se paga por pasajero? ¿Cuánto cuesta y de cuántas sillas?
2. ¿Cuál es el mínimo para que una salida opere, y cuándo se decide?
3. ¿Qué pasa con los pasajeros de una salida cancelada: devolución, reubicación, bono?
4. ¿El precio publicado asume acomodación múltiple? ¿Cuál es el suplemento de sencilla?
5. ¿Qué paga un menor según ocupe o no silla? ¿Desde qué edad?
6. ¿Cuánto es el abono y cuántos días se le guarda la silla a quien no ha abonado?
7. ¿Cuáles son los puntos de abordaje y cambian por salida?
8. ¿Quién arma hoy la planilla del conductor y cuánto tarda?
9. ¿Cómo se difunde la pieza: lista de difusión, estados, grupos? ¿Quién la diseña y cada cuánto?

---

## 10. Resumen por severidad

| # | Hallazgo | Severidad |
|---|---|---|
| 1 | El precio exige `acomodacion` y `tipoPasajero`: 27 de 47 productos no se pueden cotizar | **bloqueante** |
| 2 | No existe el concepto de margen por salida con costo fijo de bus. `neto`+`markup` no aplica al operador | **bloqueante** |
| 3 | No hay cupo de salida ni reserva de silla: el inventario del negocio no está modelado | **bloqueante** |
| 4 | Una salida no puede estar «en riesgo» ni cancelarse reubicando pasajeros | **bloqueante** |
| 5 | La tarifa no tiene unidad de cobro: «promo pareja» es inexpresable | **importante** |
| 6 | `Salida` es atributo y debería ser la entidad vendible; `Temporada` genera salidas, no precios | **importante** |
| 7 | Falta punto de abordaje | **importante** |
| 8 | Falta planilla de pasajeros | **importante** |
| 9 | Falta la vista de saldos por salida | **importante** |
| 10 | Mini/super excursión como `enum` violaría R12: es política del tenant | **importante** |
| 11 | Sin RNT, ESCNNA ni habeas data en la pieza (normativa **pendiente de verificar**) | **importante** |
| 12 | El catálogo real es una imagen de WhatsApp: generarla y responder desde ella | **mejora** |
| 13 | Dudas de transcripción: «Entre Palmas y Café», «Salento 3d», «Borondo Boyacense» — confirmar con la agencia antes de sembrar | **mejora** |

---

**Siguiente paso:** esto no es una decisión de diseño, es un insumo. Corresponde al `arquitecto`
decidir con un ADR si `Departure` asciende a agregado y si `Fare` sustituye a `Precio`, y al
`dueno-de-producto` decidir si la cabeza de playa se reapunta. **Pendiente de verificación con
fuente: el detalle normativo de §7.**
