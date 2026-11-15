# ADR-0023 — La comisión del proveedor es un ingreso propio aparte, no una forma de calcular el margen

- **Estado:** Propuesto
- **Fecha:** 2026-11-15
- **Decide:** propietario, a propuesta de `arquitecto`
- **Consultados:** `arquitecto`. Pendientes: `experto-turismo` (modelo de negocio), un contador
  público para la parte tributaria (este ADR **no** es una opinión tributaria)
- **Tarea:** T-192 (hallazgo M10 de la auditoría integral del 2026-11-15)
- **Relación:** precisa el vocabulario de [ADR-0009](0009-salida-programada-como-unidad-de-venta.md)
  §2, eje 2, sin cambiar su decisión (`SOBRE_EL_NETO` por defecto)

---

## Contexto

El lenguaje ubicuo ya lo dice bien: la **comisión** es «lo que el proveedor devuelve a la agencia.
Lo paga el proveedor, no el cliente. No es lo mismo que markup y no se contabiliza igual».

El modelo dice otra cosa. `PoliticaDePrecio.base` (`schema.prisma`, comentario de las líneas
957-959) y ADR-0009 llaman «comisión» a `SOBRE_LA_VENTA`, y el comentario cierra con «la agencia
que cobre comisión cambia este campo y nada más». Pero `SOBRE_LA_VENTA` no es una comisión: es
**otra fórmula de markup** (`venta = neto / (1 − p)`, «me deja el 20 %»). La paga el cliente igual
que `SOBRE_EL_NETO`. Lo único que cambia es la aritmética.

**Por qué importa ahora y no «el día que…»:**

1. **Cómo opera el sector.** En Colombia un mayorista publica la tarifa de dos maneras: **neta**
   (la minorista le suma su markup) o **comisionable** (precio al público, del que la minorista
   retiene o cobra después un porcentaje). Son dos fuentes de ingreso propio distintas: el
   **markup** lo paga el viajero; la **comisión** la paga el proveedor. Una agencia real combina las
   dos en el mismo mes, y a veces en el mismo archivo.
2. **Cómo se contabiliza.** La doctrina de la DIAN es consistente en separar lo que la agencia
   recauda para terceros de su ingreso propio:
   - Oficio DIAN 54108 de 2014: para una agencia de viajes, «el valor que constituye ingreso» es la
     tarifa administrativa o comisión; los demás valores recaudados para terceros (tiquetes,
     impuestos, tasas) «no constituyen ingreso para la agencia».
   - Oficio DIAN 5837 de 2017: la comisión que obtiene la agencia está gravada con IVA; el servicio
     del tercero sigue su propio tratamiento.
   - Marco NIIF (concepto del CTCP citado por CIJUF): actuando como **agente**, la entidad reconoce
     como ingreso solo su comisión; lo cobrado por cuenta del principal no es ingreso. Si actúa
     como **principal**, el ingreso es la venta completa. Cuál de las dos es depende de los hechos de
     cada operación.
   - Art. 455 del Estatuto Tributario y art. 1.3.1.7.6 del Decreto 1625 de 2016 regulan la base del
     IVA en ventas por intermediario; su aplicación a un paquete turístico concreto **no está
     resuelta en las fuentes consultadas** y la tiene que validar un contador.

   La consecuencia para el modelo no depende de esa letra fina: **el sistema tiene que poder
   distinguir, por cada venta, cuánto es ingreso propio y de qué tipo (markup o comisión), y cuánto
   es dinero del proveedor.** Hoy no puede, y el nombre equivocado empuja a la siguiente persona a
   modelar la comisión cambiando `base`.
3. **El reporte de margen.** Hoy `margen = venta − neto` (CHECK en `versiones_cotizacion`). Con una
   tarifa comisionable, el «neto» que captura el asesor suele ser el precio al público, y el margen
   sale **cero** cuando la agencia ganó el 10 %. Es un error de lectura del negocio que llega al
   tablero del dueño.

No hay agencia real todavía y el catálogo sembrado es todo de tarifa neta, así que **no hay datos que
migrar**. Por eso es el momento de fijar el modelo, y por eso mismo **no** es el momento de
implementarlo.

## Opciones consideradas

### A — Dejarlo como está: `SOBRE_LA_VENTA` = «agencia que cobra comisión»
- **Gana:** cero trabajo.
- **Cuesta:** el margen de toda tarifa comisionable sale mal; el ingreso propio no se distingue del
  de terceros; el vocabulario contradice al lenguaje ubicuo.
- **Cierra:** cualquier reporte para el contador.

### B — Comisión en `payments` como cuenta por cobrar al proveedor, sin tocar `quoting`
- **Gana:** modela bien el flujo de caja cuando el proveedor paga después.
- **Cuesta:** la cotización no sabe que gana un 10 %; el asesor cotiza a ciegas y el margen de la
  cotización sigue saliendo cero. `payments` todavía no existe.
- **Cierra:** ver el margen en el momento de vender, que es cuando se decide.

### C — La modalidad de la tarifa es de la tarifa; el margen se descompone en markup + comisión
La **tarifa** declara cómo la vende el proveedor (`NETA` o `COMISIONABLE` con su porcentaje). La
versión de cotización congela esa descomposición. `payments`, cuando exista, cobra la comisión que
el proveedor paga después.
- **Gana:** el margen es correcto al cotizar; ingreso propio y de terceros quedan separados por
  línea; `PoliticaDePrecio.base` vuelve a ser lo que es (una fórmula de markup).
- **Cuesta:** una migración en `tarifas` y en `versiones_cotizacion` cuando se implemente, y que el
  cotizador aprenda un segundo camino de cálculo.
- **Cierra:** nada. Las sobrecomisiones por volumen (*overrides*, incentivos) quedan fuera a
  propósito: no son de una venta, son de un periodo.

## Decisión

**C.** La comisión es **un ingreso propio aparte que paga el proveedor**, y se modela en la tarifa,
no en la política de precio. `PoliticaDePrecio.base` no tiene nada que ver con la comisión.

### El modelo (decisión, no implementación)

**Definiciones que el código usará:**

| Concepto | Quién lo paga | Fórmula |
|---|---|---|
| Venta (`sellRate`) | Viajero | lo que se cotiza |
| Costo neto (`netRate`) | — | **lo que la agencia termina pagando al proveedor**, siempre. Nunca el precio al público |
| Markup (`markup`) | Viajero | venta − precio de referencia del proveedor |
| Comisión (`commission`) | Proveedor | precio comisionable × porcentaje de comisión |
| Margen (`margin`) = ingreso propio | — | venta − costo neto = **markup + comisión** |
| Ingreso para terceros | — | costo neto |

**En la tarifa** (catálogo, `quoting`): una modalidad cerrada, que es invariante del dominio y por
tanto `enum` (R12: lo que varía por agencia es qué tarifas tiene, no qué es una comisión):

- `NETA`: el proveedor da el costo. Precio de referencia = neto; comisión = 0. Es lo de hoy.
- `COMISIONABLE`: el proveedor da un **precio comisionable** y un **porcentaje de comisión**
  (`Decimal`, como `porcentaje` de la política). Costo neto = comisionable − comisión, todo en
  unidades mínimas (R8). La comisión se redondea a la unidad mínima, medio hacia arriba; el costo
  neto se deriva de ella y **nunca se redondea por su cuenta** (mismo principio que «el neto nunca
  se redondea» de ADR-0009).

La política de precio (`base`, `porcentaje`, `origenDeLaVenta`, `redondeoVenta`) se aplica igual
sobre el **precio de referencia** (neto en `NETA`, comisionable en `COMISIONABLE`). Una agencia que
vende al precio público sin recargo pone markup 0 % y gana solo la comisión.

**En la versión de cotización** (inmutable): cada línea congela modalidad, porcentaje de comisión y
comisión en unidades mínimas; la versión congela `comisionUnidades` total. El CHECK pasa a ser
`margen = venta − neto` **con `neto` = costo neto**, y se añade `margen = markup + comisión`.
`neto` nulo sigue significando «desconocido», no cero.

**Cuándo se cobra la comisión** (retenida al pagar al proveedor, o pagada después por el proveedor)
es una cuenta por cobrar de `payments` (`SupplierPayable` / su contraparte), no del cotizador. Para
el margen es indiferente; para la caja no. Queda fuera hasta que exista `payments`.

**Impuestos.** El sistema **no calcula IVA** hoy y este ADR no lo cambia. Lo que sí garantiza es que
el dato necesario para calcularlo (ingreso propio por tipo, ingreso para terceros) exista por línea.

### Impacto en los reportes de margen

- `cotizaciones-para-reportes.prisma.ts` y `apps/web/src/lib/reportes-logica.ts` siguen leyendo
  `margen_unidades`. Con este modelo el número **pasa a ser correcto** para tarifas comisionables
  sin que el reporte cambie de fórmula.
- Se añade una descomposición **markup / comisión** en el reporte de margen del dueño, bajo el mismo
  permiso `cotizacion.ver_neto_y_margen` (la comisión revela el neto igual que el margen).
- Las versiones anteriores a la migración no tienen descomposición: se informan como «markup» con
  comisión `null` («desconocida»), nunca como cero.

### Qué se hace ya, sin migración

1. El comentario de `PoliticaDePrecio.base` en `schema.prisma` deja de decir «la agencia que cobre
   comisión cambia este campo»; pasa a decir que `SOBRE_LA_VENTA` es **margen sobre la venta** y
   que la comisión es de la tarifa (ADR-0023). Es un cambio de comentario: dueño `datos`.
2. `docs/01-producto/02-lenguaje-ubicuo.md` §«Vigencia y salida», segunda precisión: «`SOBRE_LA_VENTA`
   (comisión, «me deja el 20 %»)» pasa a «`SOBRE_LA_VENTA` (margen sobre la venta, «me deja el
   20 %»)», y se añaden las entradas **Tarifa comisionable** (`CommissionableFare`) y **Modalidad de
   tarifa** (`FareBasis`: `NET` / `COMMISSIONABLE`). Dueño `documentador`, al aceptarse este ADR.
3. El comentario de `margen` en la API y la web no cambia.

## Consecuencias

### Positivas
- El margen deja de mentir en tarifas comisionables, que son comunes en mayoristas colombianos.
- Ingreso propio y de terceros quedan separados por línea: el contador tiene el dato.
- `PoliticaDePrecio.base` recupera un solo significado.

### Negativas
- Un segundo camino de cálculo en el cotizador, con su redondeo y sus pruebas.
- Migración en `tarifas` y `versiones_cotizacion` (la segunda, con su disparador de inmutabilidad y
  su CHECK) cuando se implemente.
- La plantilla de importación de catálogo (ADR-0017) gana dos columnas, y la IA de propuestas tiene
  que distinguir «neto» de «precio comisionable» en un tarifario, que a menudo no lo dice claro.
- El redondeo de la comisión puede no coincidir al peso con la liquidación del mayorista; la
  conciliación lo absorberá cuando exista.

### Qué habría que cambiar para revertir esto
- Mientras no se implemente: nada. Después: dejar de leer la modalidad y tratar toda tarifa como
  `NETA`; las columnas quedan sin uso. Las versiones ya congeladas no se tocan.

## Cuándo revisar esta decisión

- Cuando el piloto traiga su primer tarifario comisionable real: confirmar con `experto-turismo` si
  el porcentaje es por tarifa, por vigencia o por mayorista (este ADR asume por tarifa, que cubre los
  otros dos).
- Si un contador concluye que la agencia actúa como **principal** en los paquetes que arma: el
  ingreso contable sería la venta completa y el reporte para terceros cambia de forma (el margen no).
- Cuando exista `payments`: decidir la cuenta por cobrar de comisiones diferidas.

## Fuentes

- DIAN, Oficio 54108 de 2014 — normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_54108_2014.htm
- DIAN, Oficio 5837 de 2017 — normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_5837_2017.htm
- DIAN, Oficio 901984 de 2021 (tarifa administrativa de agencia; consulta) —
  normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_901984_2021.htm
- DIAN, Concepto 323 de 2018 (base del IVA en intermediación, art. 1.3.1.7.6 del Decreto 1625 de
  2016) — cdn.actualicese.com/normatividad/2018/Conceptos/C0323-18.pdf
- CTCP vía CIJUF, Concepto 0569 de 2022 (agente frente a principal, NIIF) —
  cijuf.org.co/sites/cijuf.org.co/files/normatividad/2022/CONCEPTO%200569.pdf
- Estatuto Tributario, art. 455.

Consultadas el 2026-11-15 a través de resúmenes de búsqueda: el normograma de la DIAN no fue
accesible desde la sesión, así que las citas textuales **no se leyeron en el documento original** y
se deben verificar antes de usarlas fuera de este ADR.
