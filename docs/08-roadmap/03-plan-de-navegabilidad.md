# Plan de navegabilidad y experiencia — 2026-11-22

> Lo pidió el propietario: **«Importante mejorar mucho la navegabilidad»**, y después **«crea un plan
> de trabajo para que revises todo lo que encontró el informe de navegabilidad»**.
>
> Origen: el diagnóstico **T-618**, en
> [`docs/01-producto/07-diagnostico-de-pantallas.md`](../01-producto/07-diagnostico-de-pantallas.md).
> No es una opinión: son **52 capturas de 13 rutas**, a 1440 y 390 px, en claro y oscuro, con clics
> reales sobre la aplicación compilada.

## Por qué existe este plan

El propietario dijo, mirando el producto: **«¿Qué ha cambiado en el diseño? Veo todo igual.»** Tenía
razón — lo anterior había sido deuda interna y accesibilidad, no rediseño. Pidió un diagnóstico antes
de tocar nada, y esto convierte ese diagnóstico en trabajo con dueño y orden.

**Regla de este plan:** ninguna fila se da por hecha sin medirla como se midió el problema. El
diagnóstico cuantificó toques, contrastes y píxeles; las correcciones se verifican igual.

## El orden, y por qué

| # | Tarea | Qué arregla | Esf. | Estado |
|---|---|---|---|---|
| 1·2·4 | **T-623** | Enlaces rotos, cadena hacia delante, Configuración, colores que mienten | S | **en revisión** |
| 3 | **T-626** | Contactos en el teléfono: de **0 de 8** a **8 de 8** enlaces alcanzables | M | **en revisión** |
| 5 | **T-627** | Modo oscuro de «Hoy»: **contraste 1,1:1 sobre un importe** | S | lista |
| 6 | **T-628** | El aviso de cookies tapaba el ingreso: de **44 px tapados** a **59 de holgura** | S | **en revisión** (PR #549) |
| 7 | **T-629** | Pasada de lenguaje: la lista de contactos tenía **cuatro nombres** | M | **en revisión** |
| 8 | T-630 | Murallas de cabecera en móvil | M | cola |
| 9 | T-631 | Pestañas que no caben | M | cola |
| 10 | T-632 | Botones de solo icono sin nombre | S | cola |
| 11 | T-633 | Títulos de documento y migas (ADR-0032) | S | cola |
| — | T-634 | La paleta no encuentra la mitad de lo que hay | S | cola |
| — | T-638 | El ADR-0032 y el código **se contradicen** en la barra móvil | S | lista |
| 12 | T-635 | Reportes con menos texto; acciones en Cobros | M | cola · **producto** |
| 13 | **T-636** | **Cotizador: neto, markup, margen, ítems y enviar** | L | cola · **producto** |
| 14 | T-637 | Datos de demostración que no mienten | S | cola · producto |

## Las tres decisiones que lleva dentro

**1. Las filas 1, 2 y 4 van juntas, en un solo lote.** Lo recomienda el diagnóstico y la razón es
buena: casi no hay que diseñar nada. El patrón de la fila de enlaces **ya está construido y probado**
en Archivo de viaje y en Cotización; se lleva a tres pantallas más y se corrigen dos `href`. Es la
respuesta literal a «mejorar mucho la navegabilidad».

**2. La pasada de lenguaje (fila 7) va antes que lo demás de diseño.** Hoy la misma pantalla se llama
«Conversaciones» en el menú y «Bandeja» en las migas; la misma lista es «Contactos», «Directorio
comercial» y «Directorio de Contactos». El diagnóstico lo dice sin rodeos: **es lo que alguien percibe
como «cambió el diseño»**, y cuesta poco.

**3. El Cotizador NO se toca todavía.** Es la fila de mayor impacto del informe y aun así se aparca,
porque **lo que le falta no es diseño: es producto** —neto, markup, margen, ítems y envío—. Decidir
su alcance es del `dueno-de-producto`. Rediseñar la pantalla antes de esa decisión sería dibujar dos
veces.

## Lo que se aparca a propósito

Transiciones de vista, carrusel del Kanban, navegación espacial y barra de menús. **Mejoran la
sensación, no el funcionamiento.** Vuelven cuando lo anterior esté cerrado.

## Lo que este plan NO cubre, y hay que recordar

El diagnóstico se midió **en local**, con la demostración. Queda sin verificar: el comportamiento con
**datos reales** (500 conversaciones, nombres largos), la bandeja **contra la API y WhatsApp vivos**
—los estados de envío no son observables porque la demo no tiene ni un mensaje saliente—, los
**lectores de pantalla** (se comprobó la semántica del DOM, no el resultado audible), el arrastre del
Kanban, las pantallas de impresión y **cualquier cosa desplegada en staging**.

---

## T-626, cerrada con medición (2026-11-24)

Medido con el navegador en modo demostración, antes y después, a 390 px:

| | Tabla / caja | Enlaces de ficha alcanzables |
|---|---|---|
| **Antes** (`origin/main`) | 877 px dentro de 340, `overflow: hidden` | **0 de 8** — en x=850..886, fuera del viewport |
| **Después** | 356 px dentro de 356, `overflow-x: auto` | **8 de 8** — en x=65 |
| A 1440 px | sin cambio | 8 de 8 antes y después |

El `x=850..886` coincide con lo que el diagnóstico (T-618) había medido por su cuenta, así que las
dos mediciones se confirman.

**Lo que de verdad pasaba:** no era que la tabla se viera apretada. Con `overflow: hidden` no hay
barra ni gesto, así que para un dedo la columna de acciones **no existe**. Se comprobó además que
medirlo mal invierte el resultado: `scrollIntoViewIfNeeded()` desplaza por script un contenedor
`overflow: hidden` y devuelve «8 de 8 alcanzables» sobre la pantalla rota.

**Dos correcciones a los criterios que traía la tarea:**

1. Decía «el arreglo ya existe en el producto: tabla con `@container`, como hace Cobros». **Cobros no
   usa `@container`:** duplica el marcado con puntos de ruptura de viewport (`md:hidden` y
   `hidden md:table`), y no había **ninguna** consulta de contenedor en el repositorio. Se siguió la
   guía (`responsive-table`): una sola tabla semántica con `@container`, en `.tabla-apilable` de
   `globals.css`, reutilizable por las tablas de T-630 y T-631.
2. Desviación deliberada de la guía, anotada como pide `diseno-web`: las etiquetas se inyectan con
   `attr(data-etiqueta)` y no con `--label-N` + `td:nth-child(N)`, porque `nth-child` ata el CSS al
   orden de las columnas y al reordenarlas pondría una etiqueta equivocada sobre un dato.

**Fuera de alcance, y queda dicho:** los dos iconos de acción siguen sin nombre visible (T-632) y el
aviso de cookies tapa el pie en móvil (T-628, PR #549).

---

## T-628, verificada de forma independiente (2026-11-24)

El arreglo ya existía en el **PR #549**. Lo que faltaba no era código: la rama estaba `behind` y
**nadie había comprobado sus cifras**. Medido aquí con el navegador a 390 px sobre la pantalla de
ingreso real (modo demostración con `NEXT_PUBLIC_AUTH_MAQUETA`), antes y después:

| Medida | Antes | Después |
|---|---|---|
| Alto del aviso | **355 px** (42,1 % de 844) | **221 px** (26,2 %) |
| Arranca en | y=489 | **y=623** |
| Solape con «Ingresar a ViajaPro» | **44 px** | **0 px** |
| Holgura | **−75 px** | **+59 px** |
| Botón alcanzable (`elementFromPoint`) | **NO**, lo recibe el aviso | **SÍ** |
| Objetivo táctil de los tres botones | 44 px | 44 px |

**Una corrección al cuerpo del PR:** decía que el aviso «parte por la mitad» el botón, 25 px. En local
es **peor**: lo tapa **entero**, 44 de 44 px. No era incómodo de pulsar — **no se podía pulsar**. La
diferencia viene de que el PR midió contra staging y esto es el build local; el defecto es el mismo y
la cifra de aquí es la mala.

**Lo que el PR no traía, y se añadió:** ninguna prueba vigilaba el arreglo. Sus «7/7 en verde» eran
las siete que ya existían, **ninguna tocada**. Se añadieron cuatro guardas (texto corto en móvil,
`grid-cols-3`, etiquetas corta y larga, objetivo táctil) y **se probaron rechazando**, como pide
ADR-0038: sobre `main` sin el arreglo, **3 de las 4 se ponen rojas**; con él, 11/11.

**Matiz que no bloquea:** los tres enlaces legales siguen tapados en la vista en reposo, pero la
página scrollea (1123 px de 844) y al desplazarse los tres son alcanzables.

---

## T-629, medida antes de tocar nada (2026-11-24)

**Dos premisas de la tarea ya no se cumplían.** Se levantaron las once pantallas y se leyó de cada una
el H1, el título del documento, las migas y la bajada:

1. «La misma pantalla se llama *Conversaciones* en el menú y *Bandeja* en las migas». Hoy `/bandeja`
   dice **«Conversaciones»** en el menú, el H1 y el título. Y **no hay migas en ninguna de las once
   pantallas**. Ese desajuste ya estaba arreglado.
2. Las once ya tenían el H1 igual que su etiqueta de menú, salvo «Hoy», que saluda a propósito.

**Lo que sí estaba roto, y era peor de lo escrito: la lista de contactos tenía CUATRO nombres.**

| Dónde | Decía | Dice |
|---|---|---|
| Menú y H1 | Contactos | Contactos |
| Bajada de `/contactos` | **Directorio comercial** | Preferencias de viaje y permisos de contacto |
| Ficha del contacto | **Directorio de Contactos** | Contactos |
| Paleta de módulos | **Directorio de Clientes** | Contactos |

**Jerga fuera de la pantalla:** «SLA Vencido» → «Fuera de plazo»; «SLA y Tiempos» → «Plazos de
respuesta»; «Opt-In Marketing» → «Aceptan promociones»; «Meta Opt-In» → «permiso expreso»;
«protección PII» fuera; y **«Cero PII en Títulos (R10)» → «Sin datos personales en los títulos»**, que
era lo peor del lote: una sigla técnica **y el número de una regla interna**, en pantalla.

**Fechas ISO del catálogo: eran cuatro sitios, no uno.** Las vigencias de la ficha (tres usos), la
descripción de una salida, «Vigente hasta 2027-06-15» en la tarjeta de cada tarifario, y el aviso de
vigencia — que además enseñaba **«(UTC)»** al asesor, contra R9.

**Title Case:** las ocho etiquetas que lo tenían. Y «Ver Pipeline Kanban» → «Ver oportunidades», que
es como el menú llama a esa pantalla.

**Guarda nueva** —`lenguaje-de-interfaz.spec.ts`, junto al resto de guardas en `apps/web/src/lib`—,
porque nada de esto avisaba: una
cadena que vuelve no rompe nada. Recorre los ficheros de interfaz y se pone roja ante cualquier
reincidencia, nombrando fichero, cadena y motivo. **Probada rechazando**, como pide ADR-0038.

### Un choque con el diccionario, resuelto y anotado

El lenguaje ubicuo decía «**SLA de primera respuesta**», así que T-629 chocaba con él: la tarea manda
sacar «SLA» de la interfaz y el diccionario lo usaba como término. Se resolvió por donde apunta la
propia tarea —«el diccionario manda»— cambiando el término español a **«Plazo de primera respuesta»**.
El nombre en código (`FirstResponseSla`) **no cambia**. Si el propietario prefiere lo contrario, se
revierte en una línea.

### Lo que NO se hizo, y por qué

**«CSV» (46 apariciones) se deja como está.** En un botón que descarga un `.csv` no es jerga: es el
formato del fichero, y decir «Excel» sería mentir. Quitarlo de la prosa y conservarlo en los botones
es una decisión de lenguaje de producto, no de implementación: la toma `dueno-de-producto`. Por eso
**T-629 no se cierra** con este lote y su rama va como `T-000`.
