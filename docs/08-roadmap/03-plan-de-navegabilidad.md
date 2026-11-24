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
| 8 | **T-630** | Murallas de cabecera: la muralla eran **los filtros**, no los botones | M | **en revisión** (2 de 5) |
| 9 | **T-631** | Pestañas que no caben: 7 de 9 fuera, y la activa **sin anunciar** | M | **en revisión** |
| 10 | **T-632** | Iconos sin nombre: 16 de 68, **todos en Contactos** | S | **en revisión** |
| 11 | **T-633** | Títulos y migas: el ADR lo exigía y **nadie lo hacía** | S | **en revisión** |
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
   pantallas**. ~~Ese desajuste ya estaba arreglado.~~

   **CORRECCIÓN del 2026-11-24 (T-633): esa última frase era FALSA.** Las migas viven en las pantallas
   de **detalle**, que no se midieron, y `/bandeja/<id>` **seguía diciendo «Bandeja»**. La premisa de
   T-629 era correcta y la corrección, no. Se arregló en T-633; queda aquí a la vista porque dar por
   resuelto lo que no se midió es el vicio que este plan persigue.
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

---

## T-630: la premisa señalaba el sitio equivocado (2026-11-24)

T-630 decía que **cuatro** pantallas ponen «Exportar CSV» e «Importar archivo» antes del contenido, y
que la cura es bajarlos a un menú. Medido a 390 px, son **cinco** — y, sobre todo, **en tres de las
cinco ese botón comparte fila con otra cosa, así que bajarlo recupera cero píxeles.**

Al descomponer la cabecera aparece de qué está hecha: **de filtros**, porque cada `select` ocupa su
propia fila de 44 px.

| Pantalla | Cabecera | De qué está hecha |
|---|---|---|
| `/catalogo` | 429 px | 156 de filtros + **96 de botones en fila propia** + 45 de pestañas |
| `/contactos` | 358 px | **198 de filtros** + 111 de título y chips |
| `/cotizaciones` | 348 px | 136 de título y bajada + **123 de filtros** |
| `/pipeline` | 308 px | filtros + «Exportar CSV» en fila propia (44) |
| `/cobros` | 253 px | «Exportar CSV» **comparte fila**: 0 px que ganar ahí |

### Lo hecho, en las dos peores

`FiltrosPlegables`: en el teléfono los filtros se pliegan tras un botón; de `sm:` en adelante siguen
en línea y no cambia nada. **El buscador no se pliega** —en el teléfono buscar es la acción principal
de estas pantallas— y **el botón dice cuántos filtros hay puestos**, porque plegar un filtro esconde
el estado y una lista filtrada que no se anuncia es peor que la muralla.

| Pantalla | Cabecera | Primer dato |
|---|---|---|
| `/contactos` | 358 → **217 px** (−39 %) | y=481 → **y=340** |
| `/catalogo` | 429 → **321 px** (−25 %) | y=690 → **y=582** |

En `/contactos` eso son **dos filas de contacto visibles sobre el pliegue** donde antes no cabía
ninguna.

### Lo que falta, ya medido

`/cotizaciones` (348), `/pipeline` (308) y `/cobros` (253) siguen el mismo patrón: aplicar
`FiltrosPlegables` a su fila de filtros. Es mecánico; lo que costaba era saber dónde mirar.

### Lo que no se tocó, y es decisión de producto

Los dos chips de `/contactos` —«Aceptan promociones: 5» y «Segmentos: 12»— ocupan 30 px y **no llevan
a ninguna acción**, que es justo lo que `diseno-web` §2 desaconseja («las KPIs solo si llevan a una
acción»). Quitarlos recorta otros 30 px, pero es alcance de `dueno-de-producto`.

---

## T-631: el desplazamiento no era lo peor (2026-11-24)

Medido a 390 px:

| Pantalla | Pestañas | Ancho visible / real | Fuera de vista |
|---|---|---|---|
| `/configuracion` | 9 | 342 / **1414 px** | **7** |
| `/catalogo` | 3 | 362 / 521 px | 1 |

Las dos se podían desplazar, pero **nada en pantalla decía que hubiera más**.

### Lo que la tarea no decía: las dos no estaban igual de mal

`/catalogo` **ya tenía semántica de pestañas completa** (`role="tab"`, `aria-selected`,
`aria-controls`, `type="button"`). `/configuracion` era un `<nav>` de botones planos donde **la activa
solo se distinguía por el color**: sin `aria-selected`, sin `aria-current`, sin `type`. Quien usara un
lector de pantalla **no podía saber en qué sección estaba** — y eso es más grave que el
desplazamiento, que al menos funcionaba.

### Lo hecho

- `.tira-desplazable` (`globals.css`): desvanece cada extremo con una **máscara sobre el propio
  desplazador**, animada por la posición real de scroll. Cuando todo cabe **no hay desvanecido** (la
  línea de tiempo está inactiva) y el extremo al que ya se llegó deja de difuminarse. Se enmascaran
  solo las bandas, para no tapar el anillo de foco.
- `usarPestanaALaVista`: lleva la activa a la vista al entrar y al cambiar, con `block: 'nearest'`
  para que corregir el horizontal no haga saltar la página.
- `/configuracion`: nombre accesible en la tira, y `type="button"` + `aria-current` en sus diez
  botones, **con el estilo saliendo del mismo booleano** para que lo visual y lo accesible no puedan
  discrepar.

**Degradación dicha:** donde no haya animaciones de línea de tiempo de scroll (hoy, Safari), los
desvanecidos se quedan en 0 px y la tira se comporta como antes. Se pierde la pista visual, no el
acceso.

**Verificado en el navegador a 390 px:** las dos tiras con máscara, barra oculta, una activa marcada y
a la vista, todos los botones con `type`, y al elegir la novena pestaña de Configuración la tira la
trae a la vista.

### Nueve etiquetas que la pasada de T-629 no alcanzó

Su heurística buscaba tres palabras capitalizadas y estas tienen dos: «Miembros y Roles»,
«Respuestas Rápidas», «Campos Personalizados», «Formación del Precio», «Asistente de Inicio». Más
tres de jerga: «Canal WhatsApp (**WABA**)» → «Canal de WhatsApp», «Etapas del **Pipeline**» → «Etapas
de las oportunidades», y los dos botones «Guardar … de **SLA** / de Agencia».

### Lo que falta

La **semántica completa de pestañas** en `/configuracion` (`role="tablist"`, `role="tab"`, flechas),
que exige atar los paneles con sus ids. **Media semántica es peor que ninguna:** anunciar «pestaña 1
de 9» sin que las flechas funcionen engaña. Por eso T-631 queda abierta.

---

## T-632: los dieciséis eran los mismos dieciséis (2026-11-24)

Medido en el navegador **calculando el nombre accesible**, no por `grep`: de los **68 controles de
solo icono** de las once pantallas, **52 están bien**. Los **16 que fallaban estaban todos en
`/contactos`** —los dos enlaces de cada una de las ocho filas— y fallaban **por partida doble**:

1. Su nombre salía **solo de `title`**. En un teléfono no hay `hover`, así que en el aparato
   principal de la asesora esos iconos **no tenían nombre en la práctica**.
2. El nombre **se repetía ocho veces**: «Abrir chat en bandeja» ×8 y «Abrir Ficha 360» ×8. Un lector
   de pantalla no podía distinguir el chat de Juan del de Ana.

**Los dos puntos de la tarea resultaron ser el mismo defecto**, en los mismos dieciséis controles.

### La cura

La etiqueta lleva **a quién pertenece la fila**, no un texto genérico: «Abrir el chat con Juan Pérez»,
«Ver la ficha de Juan Pérez». Arregla las dos cosas a la vez. Si el contacto no tiene nombre se usa su
teléfono, que es lo que la fila enseña. `aria-label` y `title` salen del mismo texto, para que el ratón
y el lector no discrepen.

**Verificado a 1440 y a 390 px:** de 16 controles dependientes de `title` a **cero**, y **ningún nombre
se repite** ya dentro de una pantalla.

### Lo que queda

«**Ficha 360**» sigue en tres sitios (`tarjeta-seguimiento`, `ficha-detalle-contacto`): **no está en el
lenguaje ubicuo** y es material de T-629, no de esta fila.

Y la guarda **no vigila los otros 52 controles**: hacerlo pediría una lista que se desactualiza sola.
Lo que los caza es la medición del navegador, que queda escrita aquí para repetirla.

---

## T-633: el ADR lo exigía desde el principio (2026-11-24)

ADR-0032 §4 dice literalmente que **«los detalles lo sobrescriben con `tituloDeDocumento(nombre)`»**.
Medido: **ninguna de las tres pantallas de detalle lo hacía.** Seis conversaciones abiertas en seis
pestañas decían las seis «Conversaciones · ViajaPro».

**Por qué hacía falta un canal** y no bastaba con que el detalle pintara su propio `<title>`: React 19
eleva al `<head>` **todos** los que encuentra y el navegador se queda con **el primero del documento**,
que es el del marco. Dos `<title>` no se pisan. Así que el detalle **avisa** y el marco sigue siendo el
único que pinta la etiqueta — y se repone al salir.

| Ruta | Pestaña, verificada en el navegador |
|---|---|
| `/contactos/<id>` | «Juan Pérez · ViajaPro» |
| `/cotizaciones/<id>` | «Cotización San Andrés — Plan Familiar · ViajaPro» |
| `/bandeja/<id>` | «+573000009999 · ViajaPro» |

### Las migas contaban otra historia que el menú

- `/bandeja/<id>` decía **«Bandeja»** donde el menú, el H1 y el título dicen «Conversaciones». Ahora
  sale de `entradaDe('conversaciones').etiqueta` — **la tabla única que pide la propia tarea**.
- `/seguimientos` tenía un `<nav>` **escrito a mano** con un nivel **«CRM»** que enlazaba a
  `/contactos` pero se llamaba de otra forma. Ahora usa `MigasDePan`, que ya existía: «Hoy ›
  Seguimientos».

### Un bug propio que cazaron las pruebas

El gancho quedó **después de dos retornos tempranos** en la ficha de contacto, así que React contaba un
hook distinto en el render que carga y en el que pinta: «Rendered more hooks than during the previous
render». Movido arriba del todo, y **una de las cuatro guardas vigila que siga ahí**.

### Lo que queda

`/viajes/<id>` y `/cobros` no tienen hoy pantalla de detalle propia que titular, pero la tendrán. Y las
migas siguen sin existir en las once pantallas de lista: eso es una decisión de diseño, no un defecto.
