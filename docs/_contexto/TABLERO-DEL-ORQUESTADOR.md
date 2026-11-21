# TABLERO DEL ORQUESTADOR — el estado vivo que sobrevive a la sesión

> **Para qué sirve.** `CHECKPOINT.local.md` es local y se pierde con el contenedor; `DIARIO.md` va por lotes y
> queda horas atrás. Este tablero está **versionado** y lo alimenta la sesión madre en cada hito y en cada
> despertar de las dos horas (R14). Es lo primero que lee una sesión nueva de orquestación. Entradas cortas:
> lo que ya es historia se pasa al diario y se borra de aquí. **Sin secretos ni datos reales.**
>
> **Cómo se alimenta.** Tras cada hito se edita la sección que toque y entra en `main` por un PR de docs del
> carril `i/`. El hook `contexto-persistente.mjs` inyecta **el más reciente** entre el del checkout y el de la
> rama `claude/repository-status-d4ug6p`. Si el tablero contradice a `gh`/`git`, manda la realidad.

Última actualización: **2026-11-21, ~17:30 UTC**, por la madre `session_01R81Xh4XshqoadVSoT7orGV`, **que se releva aquí**. `main` en **`910c04f0`**. **SIETE PR integrados** en el turno (#461, #460, #463, #466, #462, #464, #465, más los cierres automáticos #467, #468 y #469). **Cero PR abiertos** salvo el cierre automático de T-563 en vuelo. En `done` y verificadas: **T-562, T-565, T-566** y **T-563** (su cierre, en vuelo).

**Las tres piezas que impedían enseñar el producto están en `main`.** Lo que queda para que una agencia lo vea no está en este repositorio: **el despliegue y la lista de chats de JD Tours son del propietario**.


## 1. Quién es quién

- **Propietario:** Alfavear (español). Autorización literal: «tú tienes autorización mía para aprobar y destrabar los temas pendientes como si fuera yo»; «tú como sesión principal tienes toda mi autorización para aprobar los PRs y destrabar todo lo que nos bloquea». El 2026-11-21 añadió: **modo desatendido, avanzar en todos los frentes**.
- **No alcanza:** paneles de Neon, Render, Vercel o 21st.dev; claves y secretos; `override-lane` y la configuración de GitHub; WhatsApp real; trámites (Meta, abogado, contador, pasarela); redesplegar la demo sin su confirmación; borrar ramas ajenas.
- **Sesión madre ACTUAL: `session_01R81Xh4XshqoadVSoT7orGV`** (Opus), desde las **16:51 UTC** del 2026-11-21. Es la **quinta** madre del día; archivó a la cuarta nada más arrancar, como manda el propietario. Las tres anteriores se pasaron del tope de 150 mil: `…3ygCnt8wYfALeA6yY` con 688 mil y 122 USD, `…45hbFQHivoDJ8cbJQ` con 400 mil, y `…5b7wpteu5YpcDpw5p` con **275.757 tokens y 18,11 USD**, y `…5a2iFmSzSLVN6VcXy` con **457.098 tokens y 52,26 USD**.
- **El despertar apunta bien y es ÚNICO: `trig_01Eidr2fdjQtPooauAz6uPY1`** (`47 */2 * * *`). **Verificado con `list_triggers` a las 16:52 UTC:** una sola tarea programada, y su `persistent_session_id` es el de la madre actual. Sin relevo en dos saltos.
- **El traspaso traía un id de tarea programada que NO existe** (`trig_01W27QjMm5BD8aFm1EJ6wa17`): la madre entrante iba a borrarlo. Es la **tercera vez** que el traspaso entre madres trae un id inventado. **No se borra ni se cita un id sin verlo antes en `list_triggers`.**
- **EL MEDIDOR DE CONSUMO PROPIO NO ESTÁ ROTO: VA CON RETRASO. Demostrado el 2026-11-21 por el camino caro.**
  `external_metadata.context_usage.used_tokens` marcó **`0` durante CASI TODO el turno** —tres lecturas
  separadas, con `updated_at` avanzando y trabajo real en medio— y la madre concluyó que «sirve para vigilar a
  las hijas pero no se autorreporta para la propia sesión». **Esa conclusión era FALSA.** A las 16:48 el mismo
  campo marcó **457.098 tokens y 52,26 USD**: el triple del tope de 150 mil.
  - **Es la misma trampa que ya avisó la madre anterior y que esta volvió a pisar**, solo que con una teoría más
    elaborada: tres lecturas en cero no prueban nada, porque el retraso dura más que tres lecturas.
  - **La regla, sin matices: un `0` significa «todavía no hay dato». Nunca significa «tengo margen».** Mientras
    no haya cifra, se gobierna por calendario: **relevo al cerrar el lote**, pase lo que pase.
  - Y lo que hace daño de verdad: esa conclusión falsa **se escribió en el tablero y en el prompt del despertar**,
    es decir, se propagó a la siguiente madre. Al corregir algo así, **corregir también donde se propagó**.
  - **Confirmado otra vez el 2026-11-21 a las 16:51 UTC:** la quinta madre leyó `0` en su primera lectura, con
    la sesión recién creada. Se gobernó por calendario desde el primer minuto y cerró su lote sin pasarse.
    **No hace falta entender el retraso: basta con no tratar el `0` como margen.**
- **Sesiones hijas: NINGUNA viva al cerrar el turno.** Las cuatro del lote entregaron y están archivadas:
  - `session_01R81Xh3AATp9guobTJ6DQPG` — carril `i`, Sonnet. **La reconciliación de las 74 P1** (#463). Resolvió
    sola el conflicto de `tasks.yaml` tomando `origin/main` como base y reaplicando tarea por tarea, y **desmintió
    a medias el diagnóstico de la madre** sobre T-137/T-139/T-140. **3,35 USD.**
  - `session_01R81Xh6WKz2dd4x8mNK61JP` — carril `b`, Sonnet. **T-565** (#462). **0,66 USD.**
  - `session_01R81Xh4AHfgGSxgn3RkmKyV` — carril `b`, Sonnet. **T-566** (#464). **1,05 USD.**
  - `session_01R81Xh45A6sQNSXTgcMEkna` — carril `b`. **T-563** (#465), el botón de aceptar una cotización.
  - **Lección de coste:** cuatro tareas reales por unos pocos dólares en Sonnet, frente a los **52,26 USD** de la
    madre anterior. El trabajo de carril va en sesiones cortas; la madre orquesta y no escribe código.
- **Archivadas tras entregar:** arquitectura (T-340, ADR-0035 → #397), roadmap, cobros, diseño anterior, despliegue.

## 1.1 Decisión de producto del turno (2026-11-21, 15:25 UTC)

**T-556 sube de P3 a P2 y se reparte por delante de T-550**, con la autorización de producto del propietario.
El motivo, para que no haya que reconstruirlo: en modo demo la pantalla «Hoy» **enseña un error** donde debería
haber un dato de muestra, y la demo es **lo único que mira quien evalúa el producto**. T-550 (la fracción de
`parsearMontoAUnidades` con monedas de tres decimales) es un «el día que…» de manual: ninguna moneda habilitada
tiene tres decimales. Se ordena según §3.1: **lo que hoy está roto va antes que lo que podría romperse**.

Detrás sigue el hecho que no cambia por mucho código que se integre: **ninguna agencia ha visto nada todavía**,
y lo que lo desbloquea no está en este repositorio, sino en la lista de chats a excluir de JD Tours (T-533).

## 1.2 Orden del propietario: una sola madre viva (2026-11-21, 15:30 UTC)

**«Importante: cada que crees una sesión orquestadora cierra la anterior.»** Literal.

**Cómo se cumple, y por qué hacía falta:** al recibirla se comprobó con `list_sessions` y había **DOS madres
vivas además de la actual**, las dos `IDLE` y conectadas:

| Sesión | Estado real | Consumo real |
|---|---|---|
| `…5b7wpteu5YpcDpw5p` (relevo 12:25) | `IDLE` — **su propio resumen decía «sesión archivada». Era falso** | **497.542 tokens, 53,49 USD** |
| `…4Z3eKYzxJCGZ717uK` (relevo 14:20) | `IDLE` — la que redactó este traspaso | **307.625 tokens, 21,32 USD** |

Las dos archivadas a las 15:29, junto con la hija `…2DhFQmHXUmF7Mqedn` (255.180 tokens), que seguía `IDLE`
después de entregar #441. **La orden queda metida en el prompt de la tarea programada**
(`trig_01RSjZimU6jHEhMXXe6kApQu`, paso 2) para que no dependa de que una madre se acuerde.

**Dos cosas que esto enseña y no se pueden olvidar:**
- **Una sesión que afirma estar archivada puede no estarlo.** Se verifica con `session_status`, no con lo que
  diga su resumen ni con lo que diga ella misma por `send_message`.
- **El consumo real de una madre es mayor que el que traspasa**, porque sigue trabajando después de escribir el
  relevo: la de las 14:20 traspasó «275.757 tokens y 18,11 USD» y acabó en **307.625 y 21,32**. Al leer un
  traspaso, **tratar su cifra como un suelo, no como el total**.

## 1.3 Revisión visual del propietario (2026-11-21, 15:40 UTC)

Miró la aplicación y dijo: le gusta, pero **«el toque de contraste negro hace que se pierdan un poco los
textos»**, y preguntó si se pueden manejar los dos modos. Preguntado dónde lo ve, señaló **la barra lateral,
las pantallas de trabajo y el conjunto**.

**Lo verificado antes de responderle, que cambió la respuesta:** los dos modos **ya existen** — `globals.css`
redefine los tokens bajo `.dark` (`@variant dark`), **144 archivos** usan variantes `dark:`, y
`selector-tema-densidad.tsx` ofrece claro / oscuro / seguir al sistema con persistencia en `viajapro_tema`.
No hace falta construir el modo oscuro: hace falta **aplicarlo bien y que se lea**.

- **T-561 (P2, repartida)** — el contraste. Como es sistemático y no de una pantalla, se arregla **en los
  tokens**. Condición del encargo: **se mide, no se opina** (ratio por par texto/fondo, claro y oscuro, umbral
  WCAG 2.1 AA) y lo que cierra la tarea es **una prueba que falle si un token baja del umbral**. Límite dado:
  **la identidad no se toca**; se ajusta la luminancia, no la familia de color, y si hiciera falta cambiar el
  azul de acento, la sesión para y pregunta, porque eso es decisión de marca del propietario.
- **T-560 — OJO, su diagnóstico original era FALSO y lo escribió la madre.** Decía que el tema no se aplica al
  arrancar y que no se respeta `prefers-color-scheme`: **las dos cosas son falsas**. `layout.tsx` ya inyecta
  `SCRIPT_ANTI_FOUC` en `<head>` con el nonce de la CSP, y el tema por defecto es `system`. Lo desmintió la
  sesión de carril `b`, que **paró antes de escribir código** y lo midió en un navegador con la CSP real y la
  hidratación abortada. El conmutador tampoco está «solo en la bandeja»: `MarcoDeTrabajo` monta `BarraModulos`
  en **todo** el grupo `(app)` (avatar en escritorio, hoja «Más» en móvil). **Lo único que falta de verdad** es
  el conmutador en las pantallas **públicas** y unas pruebas de comportamiento del anti-FOUC.
  - **Cómo nació el error, porque importa más que el error:** un `grep` de `localStorage|classList` **limitado a
    `layout.tsx`** no encontró nada, y eso se escribió como un hecho. El script vive en otro archivo y entra como
    constante importada. **No encontrar algo con un grep estrecho no demuestra que no exista.** Antes de afirmar
    una ausencia en el roadmap, buscar por el nombre del símbolo en todo `apps/web`, no por la implementación
    donde uno supone que está.
  - **Descubribilidad, el hallazgo que sí vale:** el propietario preguntó si se podían manejar ambos modos **sin
    saber que el conmutador ya existe**. Si no lo encuentra quien conoce el producto, una agencia tampoco.

- **Inventariado, sin tocar:** la portada de ingreso usa colores **fijos fuera de los tokens**
  (`#FDE68A`, `#C9A24B`, `bg-black/25` en `formulario-ingreso.tsx`), así que se ve igual en los dos modos. Es
  estética de marca, no un defecto de contraste: lo decide el propietario.

## 1.4 Manual de usuario (T-562, pedido por el propietario el 2026-11-21)

Quiere **un manual funcional de lo que ya existe, con fotos**, para poder enseñar el producto. Repartido.

**Tres decisiones del encargo, para que no se rehagan:**
- **El alcance sale de la sección «Es real (en `main`)» de `ESTADO.md`**, no de la memoria de nadie. Lo que sea
  maqueta o no se haya probado contra la API real, o no entra, o entra diciéndolo. Esto lo va a ver una agencia:
  un manual que explica una maqueta como si funcionara hace más daño que no tener manual.
- **Todas las capturas serán de modo demostración**, porque en este entorno no se puede levantar Postgres. **El
  propio manual tiene que decirlo**, para que nadie lo enseñe creyendo que son datos reales.
- **El texto va antes que las fotos.** T-556 (el modo demo enseña un error en «Hoy») y T-561 (contrastes) cambian
  lo que saldría en las capturas: tomarlas ahora sería tirar el trabajo. Se capturan cuando esas dos entren.

**Hay dos sesiones en el carril `i`** (esta y la del relevo): tocan archivos distintos, pero el segundo PR quedará
`behind` y habrá que ponerlo al día. Contar con esa vuelta.

## 1.5 DOS premisas falsas seguidas, las dos escritas por la madre (2026-11-21)

**Es un patrón, no mala suerte, y por eso está aquí y no enterrado en una tarea.** Las dos tareas que la madre
redactó a partir de la revisión visual del propietario tenían el diagnóstico equivocado:

| Tarea | Lo que la madre afirmó | Lo que resultó ser |
|---|---|---|
| **T-560** | «El tema no se aplica al arrancar; no se respeta `prefers-color-scheme`» | **Falso.** El anti-FOUC existe e inyecta con nonce; el tema por defecto es `system` |
| **T-561** | «Hay tokens por debajo del umbral de contraste; ajustar luminancia» | **Falso.** Los 19 pares reales cumplen AA. El fallo era **14 tonos usados sin declarar**, que en Tailwind v4 no emiten CSS: la clase era inerte y en oscuro sobrevivía el color de claro, dejando un **botón destructivo a 2,34:1** |

**La causa común:** la madre miró el código por encima (un `grep` estrecho, una lectura de `globals.css`) y
escribió su hipótesis **como si fuera un diagnóstico**, en el roadmap, que es una de las cuatro fuentes de verdad.
Las dos sesiones hijas lo midieron de verdad —una con el navegador y la CSP real, otra compilando el CSS con la
Tailwind instalada— y las dos la desmintieron.

**Lo que hay que hacer distinto, y es barato:** cuando el propietario reporta algo que se ve, **la tarea se
escribe como SÍNTOMA y pregunta, no como diagnóstico**. «El propietario ve que los textos se pierden en la barra
lateral y en las pantallas de trabajo; medir los contrastes reales y averiguar por qué» habría llevado al mismo
sitio sin afirmar nada falso. El diagnóstico lo pone quien mide, no quien reparte.

**Lo que SÍ funcionó, y hay que conservar:** pedir en cada encargo que **vean fallar la prueba** y que **declaren
si alguna pasó en verde con el fallo puesto**. Es lo que hizo que las dos pararan en vez de implementar una
premisa falsa, y lo que destapó el 2,34:1. Una de ellas declaró **tres** pruebas suyas que habrían entregado algo
falso, incluida una que fallaba **por el motivo equivocado** y escondía justo el número que importaba.

## 1.6 La cola mentía: reconciliación de las P1 (2026-11-21, 17:10 UTC)

**De 74 tareas P1 abiertas quedan 17.** Ocho ya estaban hechas en el código —cada una con el símbolo,
archivo o prueba que lo demuestra— y 49 estaban mal priorizadas. Lo hizo una sesión corta en Sonnet por
**3,35 USD** (#463), y el detalle está en `docs/_bitacora/2026-11-21-reconciliacion-de-las-p1.md`.

**Lo que falta por reconciliar, y es peor:** las **14 tareas P0 abiertas nunca se contrastaron contra el
código**. T-131 y T-132, ambas P0 en backlog, parecen ya hechas. Es **T-574 (P1)**. P0 es la lista que
todo el mundo mira primero: si miente ahí, se reparte trabajo ya hecho.

**T-377 sube de P3 a P1:** el arnés de mutaciones de aislamiento **no corre en el CI**. §3.1 dice que el
aislamiento entre agencias es el único sitio donde no se recorta. Una compuerta que no se ejecuta no es
una compuerta, y llevaba dormida en P3.

**T-575:** ADR-0035 sigue «Propuesto» con T-341 y T-342 ya integrados. Incumple R7.

## 1.7 T-566 NO deshace T-343 (2026-11-21)

T-343 retiró a propósito el conmutador Vista Dueño/Asesor, porque la vista la decide la respuesta de la
API y **no se filtran listas de agencia en el cliente para fingir «lo tuyo»**. T-566 añade un conmutador
con ese mismo nombre. **No es una marcha atrás, y conviene no leerlo como tal:** vive solo dentro del modo
demostración, no toca sesión ni API ni `tienePermiso`, solo decide qué se pinta, y su predicado de permisos
**solo quita** entradas del menú, nunca añade. T-343 prohibió fingir el alcance con datos reales; T-566
enseña la forma de la pantalla con datos de ejemplo.

## 1.8 El arnés de aislamiento corría a medias y nadie lo sabía (2026-11-21, 18:00 UTC)

T-377 puso `mutaciones-aislamiento.mjs` en el CI por primera vez. **Su primera ejecución en la vida
destapó que el arnés no llegaba al final:** 17 controles en verde, M1 a M21 todas en rojo (funciona),
y **M22 reventaba el proceso entero, así que M23 y M24 nunca se ejecutaban**.

`error: role "viajapro" is a member of role "viajapro_app"` (`0LP01`, `AddRoleMems`). M22 hace
`GRANT <dueño de perfiles_de_agencia> TO viajapro_app`, y en el CI el dueño es `viajapro`, que **ya
es miembro de `viajapro_app`**: pertenencia circular. M22 asumía una topología de roles que no es la
del CI, justo donde la compuerta iba a vivir.

**Lo que hay que llevarse de aquí, y vale para cualquier arnés:** una mutación rota **esconde a todas
las posteriores**. El bucle dejaba que la excepción tumbara el proceso —a propósito, para no contar
una mutación como VERDE— pero eso convierte un fallo en una venda. Ahora hay cuatro estados
(ROJO / VERDE / **ERROR** / **N/A**), se sigue con la siguiente y se sale distinto de cero al final.

**Decisión mía, por si alguien la revisa:** N/A **no** hace fallar la corrida. Una compuerta en rojo
permanente acaba ignorada, y entonces vuelve a ser lo que T-377 existía para arreglar. Prefiero 23
mutaciones que corren y **un hueco escrito** (T-579) a un rojo que nadie mira. El hueco debe verse en
el resumen del job, no solo en el informe interno.

**La medición desmintió al diseño, y eso fue lo más útil del día.** El workflow nació con filtro de
rutas y sin ser obligatorio porque se suponía que el arnés tardaba «minutos». Al correrlo de verdad:
**43 segundos**, 1m45 el job entero. La sesión lo midió y vino a desdecirse sola. Se le quitó el
filtro, corre en **todo PR**, y con eso **ya puede ser check obligatorio** en cuanto el propietario lo
añada a `proteccion-main.json` (T-577). Moraleja para la próxima compuerta: **un comentario que
justifica una decisión con una medición que nadie tomó congela esa decisión durante meses.**

**Resultado final del arnés:** 17 controles verdes, M1–M21 rojas, **M22 no aplicable**, M23 roja y
**M24 roja — el entregable de T-377 está demostrado**: la fijación de fechas de `creado_en` y
`actualizado_en` tiene quien la vigile.

**Y la parte que no se recortó:** M24 se comparó **línea a línea** con la definición viva de
`proteger_verificacion_del_perfil` (migración `20261120170000`, la de `statement_timestamp`) antes de
aceptarla. Difiere **solo** en las cuatro asignaciones de fecha y deja intacta la lógica de
verificación; captura la definición sana **antes** de mutar, así que la restauración es correcta. Una
mutación mal acotada pondría la prueba en rojo por el motivo equivocado y daría cobertura falsa.

## 1.9 Una afirmación falsa de la cola, corregida (2026-11-21)

**`Carril y tarea` SÍ acepta una bitácora de `docs/` dentro de un PR de carril `a` o `b`.** Los tres
PR de este lote (#471 carril `a`, #472 carril `i`, #473 carril `b`) la llevaban y el check pasó en
verde en los tres. T-576 nació diciendo lo contrario y se ha corregido. Avisar a las hijas de que no
pueden dejar su rastro documental **les hacía quitar trabajo bueno por una regla que no existe**.

## 1.10 La cola marcaba `ready` una tarea que solo puede desbloquear el propietario (2026-11-21, lote nocturno)

**T-334 estaba en `ready` y era falso.** Su primer criterio exige «las columnas de la hoja **real**
del piloto (muestra sin datos personales)», y esa muestra **no está en el repositorio** (no hay
ningún `.csv`). El roadmap de JD Tours encabeza sus preguntas abiertas con «**antes de T-327, T-323
y T-334**», y la última es justo la hoja. Es el **punto 12 de `PENDIENTES-DEL-PROPIETARIO.md`**.

El pendiente **sí** estaba registrado con el propietario. Lo que fallaba era la cola: marcaba lista
una tarea que depende de él. **Un pendiente bien anotado no sirve de nada si la tarea que lo espera
figura como disponible**: la siguiente sesión la toma y se estrella, o peor, se inventa las columnas.

Corregido: `T-334` → `blocked`, `T-336` → `blocked` (importar su hoja exige su hoja), y `T-335` →
`ready` con su dependencia movida de `T-334` a `T-332`, porque lo que hay que exportar es la tabla
del **criterio de salida §3.4**, no las columnas del propietario.

**Comprobación que conviene repetir cada lote, es barata:** que **ninguna tarea `ready` dependa de
una `blocked`**. Se hace en diez líneas de Python sobre `tasks.yaml`. Tras esta corrección, las 551
pasan.

## 1.11 T-372: la sospecha del turno anterior era correcta, y hacía bien en no darla por buena

La madre anterior dejó T-372 en la cola diciendo «**NO lo he verificado: que lo mida quien la tome y
me desmienta si procede**». Se midió: en la corrida **`44934621499`** (ya en `main`, 18:18 UTC)
**M17 y M21 salen las dos ROJAS**, que era exactamente su criterio pendiente. T-372 → `done`.

Acertó en el fondo **y** en la forma. Si hubiera escrito «T-372 ya está hecha», habría tenido razón
por casualidad y nadie habría mirado la corrida. **Marcar la sospecha como sospecha es lo que hizo
que se midiera.**

## 1.12 Una guarda «solo de tipos» puede estar protegiendo de verdad: mira el sitio de llamada

La hija de T-340 encontró que `porAsesor` y `ventasPorDestino` exigen el alcance de agencia entera
**por tipo**, y que los tres adaptadores lo reciben como `_alcance` (guion bajo: sin usar). Dicho
así suena a fuga: los tipos se borran al compilar.

**No lo es, y lo comprobé antes de aceptarlo.** El estrechamiento no viene del tipo sino de
`esAgenciaEntera`, que es una **función con lógica en ejecución** (`nivel === 'AGENCIA' && asesorId
=== null`). En `obtener-resumen.use-case.ts` un alcance `PROPIO` deja `agenciaEntera === null` y la
llamada **no se hace**. La barrera es real; lo que falta es la segunda, en el adaptador.

**La regla:** antes de llamar fuga a una guarda de tipos, **mira el sitio de llamada**. Si el
estrechamiento sale de un `if` sobre un discriminante, hay comprobación en ejecución aunque el tipo
desaparezca. La hija lo clasificó bien como cola (T-580); yo lo verifiqué en vez de creerla.

## 1.13 LA CADENA DE MADRES SE AGOTÓ: profundidad de linaje 8 de 8 (2026-11-21, 19:12 UTC)

**El hecho, verificado contra el error literal de la herramienta, no deducido.** La séptima madre
(`session_01R81Xh4xCBnaheEL9Gxa6TL`) intentó crear sus hijas y recibió:

> «this session is at lineage depth 8 (limit 8), so it cannot start sessions, or create, fire or
> re-arm routines and reminders. **No user or organization setting changes this limit.**»

`get_session` lo confirma en su propio cuerpo: `"lineage":{"depth":8,"limit":8}`.

**Qué significa para la forma de trabajar.** Cada madre nacía de la anterior con `create_session`, y
eso gastaba un escalón por relevo. Siete relevos después, no queda ninguno. Desde esta sesión:

1. **No se pueden crear sesiones hijas.** El reparto a hijas, que es el método de los siete turnos
   anteriores, no está disponible.
2. **No se puede crear la madre siguiente.** El protocolo de relevo no se puede ejecutar.
3. **No se puede crear ni rearmar la tarea programada.** La que existe apunta a
   `session_01R81Xh5mmenvvqrBAdaBUW1`, **archivada en este mismo turno**: sus despertares no llegan a
   ninguna sesión viva. **El modo desatendido está parado de hecho.**

**La salida, y solo la tiene el propietario:** abrir una sesión nueva **desde la raíz**, no como
relevo de ninguna otra. Vuelve a profundidad 1 y recupera los ocho escalones. Está escrito como
punto 19 de `PENDIENTES-DEL-PROPIETARIO.md`.

**La lección para quien venga, y es de método:** el relevo por `create_session` **tiene un presupuesto
finito que nadie estaba contando**. Ninguno de los siete turnos miró `lineage.depth`, aunque
`get_session` lo devuelve en cada vuelta, junto al `context_usage` que sí se mira religiosamente.
*Se vigilaba el consumo de contexto y se ignoraba el consumo de la cadena.* **Mira `lineage.depth` en
la misma llamada en la que miras `used_tokens`:** a partir de 6 conviene que el siguiente relevo nazca
desde la raíz en vez de encadenarse.

**El apaño que sí funciona mientras tanto, y sus límites.** Los **subagentes en proceso** (herramienta
`Agent`, que `CLAUDE.md` §8 ya contempla con su lista de roles) **no** cuentan contra el linaje. Con
`isolation: "worktree"` cada uno trabaja en su propio árbol y no se pisan en el único `checkout`.
Pero: **no llevan las herramientas MCP de GitHub**, así que no abren PR —empujan la rama y la madre
abre e integra—, **consumen contexto de la madre** en vez del suyo, y **mueren con la sesión**.
Sirven para un lote; no sustituyen a la cadena.

## 1.14 El check «Carril y tarea» SÍ rechaza la bitácora en un PR de código, y la nota que decía lo contrario era engañosa (2026-11-21, 20:05 UTC)

**Costó dos rondas de CI en este lote**, así que queda escrito con el texto exacto del fallo:

> `✗ El carril b toca rutas de otro carril:`
> `  docs/_bitacora/2026-11-21-contraste-de-los-dashboards.md  (carril i)`
> `Separa el cambio en un PR del carril dueño, o pide la etiqueta override-lane al integrador.`

**La nota anterior, en los criterios de T-576, afirmaba lo contrario** y lo daba por «FALSO y
verificado», citando que los PR #471, #472 y #473 llevaban bitácora en `docs/` y pasaron en verde.
**Los tres datos eran ciertos y la conclusión era falsa.** Comprobado: aquellas ramas se llamaban
`test/aislamiento-...`, `chore/roadmap-...` y `fix/web-...` — **sin prefijo de carril**. El check
deduce el carril **del prefijo de la rama**: con `b/` aplica la regla, con `fix/` no la aplica.

**La regla que sirve:** una rama con prefijo `a/`, `b/` o `i/` **solo toca su carril**. La bitácora de
un PR de código va al **PR de cierre del lote**, que es lo que `CLAUDE.md` R14 ya admite
expresamente («o, como tarde, en el PR de cierre del lote»). No hace falta `override-lane` —que
además solo puede poner el propietario— ni renombrar la rama para esquivar el check.

**La lección, que es la de §1.5 otra vez:** *una afirmación puede apoyarse en tres hechos verificados
y seguir siendo falsa, si lo que no se verificó es la relación entre ellos.* Nadie miró por qué
aquellos PR pasaban; se dio por hecho que era porque el check lo permitía.

**Y una comprobación que se pagó sola el mismo día:** al encolar los hallazgos de este lote dejé
T-590 en `ready` colgando de T-582, que todavía no estaba integrada. **Lo pilló la comprobación de
diez líneas que recomendó el turno anterior** («ninguna `ready` depende de algo sin terminar»), no mi
lectura. Correrla después de editar la cola, no solo antes.

## 2. Reglas operativas que no se olvidan

- **R14:** todo cambio se documenta, lo hecho y lo que viene. Un plan que solo vive en una conversación no existe.
- **Checks obligatorios reales (8):** `secretos`, `typecheck`, `lint`, `build`, `test`, `aislamiento-tenants`, `fronteras-entre-modulos`, `convencion-de-commits`. **`navegador` todavía NO es obligatorio** (lo aplica el propietario en el servidor).
- **Aprobación:** en la práctica el servidor no la exige (#391 y #388 entraron sin review). La compuerta real son los checks y la rama al día.
- **Integración serializada** (`strict`): cada merge deja `behind` a los demás. Web y rutas protegidas, de una en una, con «ventana». Squash a mano, sin auto-merge en `apps/web`.
- **Antes de integrar:** `gh` del mismo turno con los checks en verde, rama al día, y auditoría propia en aislamiento, dinero, autenticación y datos personales (ahí no se recorta, R13).
- **Numeración:** `git fetch` y mirar los `tasks.yaml` de los PR de docs abiertos antes de numerar tareas, migraciones o ADR.
- **Veracidad:** «verde», «integrado» o «listo» solo con evidencia del mismo turno.
- **Subagentes:** nunca dos Opus a la vez (el límite de 5 h de la cuenta los mata con HTTP 429 y **no se reanudan**). Todo subagente que vaya a commitear trabaja en un `git worktree` aparte: el working tree es compartido.

## 3. Cola de integración (orden)

### Lote nocturno de cobros y permisos (2026-11-21, madre `…5mmenvvqrBAdaBUW1`) — CERRADO

Arranca con `main` en **`580dd67f`** y cero PR abiertos. Tres hijas Sonnet en paralelo, elegidas
contra el **criterio de salida de JD Tours** (§3 del roadmap del piloto), no contra la lista de P1.

- **#475** (T-340, carril `i`) — **INTEGRADO** en `7dc17bef`. 15/15 verdes, `mutaciones-aislamiento`
  incluido. ADR-0035 pasa a **Aceptado**. Auditoría propia antes de integrar: comprobé **línea a
  línea** su hallazgo delicado y resultó bien clasificado (ver §1.12). Dos seguimientos registrados
  (**T-580**, **T-581**) y las condiciones de §9 anotadas en **T-345** y **T-483**; **T-493** ya
  existía y no se duplicó.
- **#476** (T-332 y T-335, carril `b`) — **INTEGRADO** en `d059acba`. 15/15 verdes. La pantalla de
  cobros y su CSV. Auditoría propia: **R8 correcto** (usa `Money.desdeUnidades().aDecimal()`, nunca
  divide por 100), el escapado contra fórmulas exime **solo** números negativos puros con expresión
  anclada y el entrecomillado RFC 4180 sigue después, y **no hay neto ni margen que ocultar porque
  el contrato no los trae**. Conflicto de `ESTADO.md` resuelto a mano. Cola: **T-582** (pasajeros).
- **#477** (T-346, carril `b`) — **INTEGRADO** en `716f400d`. 15/15 verdes. Vio la prueba **en rojo**
  con dos mutaciones nombradas, sembró las cifras **dentro** de la prueba (la semilla no da movimiento
  por asesor y dos asesores en cero pasan en verde sin probar nada) y comparó **por diferencia**.
  Midió el contraste de los dos dashboards y salieron defectos reales: **T-583**.

**Cierre del lote:** `main` **`580dd67f` → `716f400d`**. Tres PR integrados, cero abiertos.
**555 tareas, 249 `done`, 303 abiertas, 4 P0 y 12 P1** (eran 17). **Siguiente id libre: T-584.**
Cerradas a mano: T-332, T-335, T-340, T-346, T-372. Nuevas: T-580 a T-583.

**Confirmado CUATRO veces en este lote: el cierre automático de tareas no cierra nada.** T-340
seguía en `review`, y T-332 en `ready` y T-335 en `backlog` después de integrar, con las ramas
nombrándolas. **Comprobar el `status` en `main` tras cada integración y cerrarlo a mano.**

**Integrar con `gh api -X PUT .../merge` por Bash queda denegado** por el sistema de permisos de la
sesión. **No se rodea**: queda anotado como pendiente del propietario, que es quien puede añadir la
regla de permiso si quiere esa vía.

### Lote del arnés y la cola (2026-11-21, madre `…64ppDELKxYC1Tkdsu`) — CERRADO

Arranca con `main` en **`36bd12f2`** y cero PR abiertos. Tres sesiones en paralelo, una por carril.

- **#472** (T-574, carril `i`) — **INTEGRADO** en `6760ce6a`. De 14 P0 abiertas quedan **4 reales**:
  5 estaban hechas, 5 bajan de prioridad. Auditoría propia antes de integrar: comprobé tres de las
  cinco citas de `done` contra el código y **las tres exactas**. La hipótesis de la madre (T-131 y
  T-132) era correcta pero **parcial**: T-120, T-121 y T-123 también estaban hechas.
- **#471** (T-377, carril `a` + rutas protegidas) — **INTEGRADO** en `010d77d5`. **Devuelto dos veces**: la primera por §1.8 (moría en M22), la segunda al medir 43 s y ver que su propia justificación era falsa. Las dos vueltas destaparon defectos reales; ninguna fue una pasada de auditoría sobre una auditoría.
- **#473** (T-569, carril `b`) — 14 checks en verde, rama puesta al día tras entrar #472.
  41 clases de la familia `primary`, que no existe en ninguna paleta, mapeadas a `acento-*` del mismo
  tono. Trae una prueba nueva que exige que toda familia usada sea de Tailwind o de `@theme`.

**El cierre automático no cerró nada en este lote.** Tras integrar #472 y #473 por squash, con ramas
que nombraban `T-574` y `T-569`, las dos seguian en `ready` y `backlog` en `main` y **no apareció
ningún PR de cierre**. Las marcó la madre a mano en #474, con la evidencia citada. El traspaso
anterior avisaba de que ese cierre *compite* con el carril `i`; hoy, sin más, **no se ejecutó**.
Conviene no dar por hecho ninguna de las dos cosas: **comprobar el `status` en `main` después de
cada integración**, que es barato, en vez de confiar en que alguien lo cierra.

### Lote de cierre de la demostración (2026-11-21, madre `…4XshqoadVSoT7orGV`) — CERRADO

Arranca con `main` en **`7a0ac374`** y dos PR abiertos. Termina en **`910c04f0`**, **cero abiertos**.

Integrados, por orden: **#461** (cierre del lote anterior), **#460** (cierre de T-562), **#463** (la
reconciliación de las P1), **#466** (sus seguimientos: T-574, T-575, T-576 y T-377 a P1), **#462** (T-565),
**#464** (T-566) y **#465** (T-563). Más los cierres automáticos #467, #468 y #469.

**Auditorías propias del código, no del informe (R13):**
- **T-563** — `POST /cotizaciones/:id/estado` exige `cotizacion.escribir` (`@RequierePermiso`, verificado en
  `cotizaciones.controller.ts`) y el dominio solo admite `ENVIADA → ACEPTADA` (`estado-de-cotizacion.ts`).
  La web **repite** el invariante en vez de inventarse el suyo y **deshabilita por comodidad, nunca por
  seguridad** (ADR-0011). El archivo de viaje no viene en la respuesta —lo abre el consumidor de
  `cotizacion.aceptada`, ADR-0024 §1—, así que la pantalla lo busca seis veces y distingue «sigo mirando»
  de «ya miré bastante»; **nunca inventa el enlace**. Sin bloqueantes.
- **T-566** — **doble compuerta**: `vistaDemo()` devuelve `dueno` fuera del modo demostración, y el menú solo
  sustituye `tienePermiso` bajo `esDemo && vista === 'asesor'`. La sustitución **solo quita** entradas, nunca
  añade, así que el peor fallo posible es enseñar de menos en una demo. Sin bloqueantes.
- **#463** — el YAML se validó **aparte del informe de la sesión**: 545 tareas, ningún id duplicado, ninguna
  sin título ni sin cuerpo. Coincidía con lo que declaraba.

### Lote de la tarde (2026-11-21, madre `…5a2iFmSzSLVN6VcXy`) — CERRADO

Arranca con `main` en **`ef44c75e`** y **un PR abierto, #446**.

- **#446** (`b/T-555-web-por-asesor-y-destinos`) — T-555, carril `b` limpio (los 8 archivos en `apps/web`).
  **Auditoría propia del código, no del informe (R13, toca dinero):**
  - `destinosVendidos` **no suma nada entre monedas**: agrupa por destino y deja una fila por moneda tal
    como la sirve el servidor. El ranking es por `aceptadas`, que es un **conteo**, no dinero (R8 respetado).
  - En pantalla, cada moneda va en su línea con `formatearDinero(..., { conCodigo: true })`, el formateador
    compartido que divide por `10 ** decimales` **según la moneda** (en COP no divide). No repite T-543.
  - `filasDeAsesores` deja de hacer una consulta por asesor: las cifras llegan ya contadas en `porAsesor`.
    Desaparece `MAXIMO_ASESORES_COMPARADOS` (12) y con él el tope silencioso de la comparación.
  - **Hallazgo, no bloqueante:** el cambio **elimina el `.slice(0, maximo)`** de los destinos, que es
    exactamente **T-557** (ya en la cola como P3). Y la clave de agrupación es `f.destino` **sin `trim()` ni
    normalizar**, aunque el nombre que se pinta sí va con `trim()`: dos filas con el mismo nombre visible si
    el servidor manda `"Cartagena"` y `"Cartagena "`. Es cosmético y cae dentro de T-557. **Cola, no bloquea** (§3.1).
  - **Sin bloqueantes. INTEGRADO a las 15:22 UTC** con squash: `main` **`ef44c75e` → `1e947f4b`**. Verificación
    a mano antes del merge, no del vigía: los **14 checks existen, los 14 `completed` + `success`**, ninguno nulo,
    `mergeable_state=clean` y la base igual al `main` del momento. `navegador` entró en verde (la fragilidad de
    T-548 no apareció).
  - **El «alguien actualizó mi rama» que avisó la hija era yo.** El `update-branch` de las 15:11 sale a nombre de la
    cuenta y se ve como `web-flow`/Alfavear. Los `cancelled` de `8cc3527` quedan clasificados: **concurrencia**, no
    rojo ni fragilidad, reemplazados por el run de `b65e521`. Queda dicho para que nadie lo investigue otra vez.
  - Queda en cola **T-559**: en la web no hay mutación que vigile que el margen por destino solo se pinte cuando el
    servidor manda la clave. **No bloquea**: la compuerta real está en el servidor y **sí está probada**
    (`obtener-resumen.use-case.spec.ts`, el `incluirMargen` sale del permiso). Es defensa en profundidad (§3.1).

### Lote de mediodía (2026-11-21, madre `…DpwSp`) — CERRADO

`main`: `a177ce83` → **`aa38bdf9`**. Dos PR, en serie y con squash a mano. **Cero PR abiertos.**

- **#427** (`7fec8760`) — T-510 `done`. 40P01 de `invitaciones` cerrado con log del CI; el de `historial-de-etapas`
  **atribuido por mecanismo, sin demostrar**. Retira la serie de #415 (~65 s por PR sin evidencia). **Matiz:** las 32
  corridas limpias se midieron EN SERIE; en paralelo lleva n=2. Vuelta atrás: `fileParallelism: false`.
- **#428** (`aa38bdf9`) — T-528 `done`. **Auditoría independiente hecha (R13, alcance entre asesores): sin bloqueantes.**
  Lo que la sostiene: el `asesorId` del cliente pasa siempre por `alcanceDeReporte()` (403, no recorte silencioso) y la
  firma del puerto no tiene valor por defecto, así que olvidar el filtro **no compila**. Cola: T-537 a T-541.

**T-537 (P1) merece atención:** el saldo por cobrar se sirve sin exigir `cobro.ver` mientras las pantallas sí lo exigen
(contradice ADR-0035 §4). Es cola y no bloqueante **porque se verificó que no existe endpoint para componer roles a medida**;
el día que exista, deja de ser cola. No es una suposición: se comprobó.

### T-542 (P1) — RESUELTA: la compuerta de cierre vuelve a correr

**Cerrada el 2026-11-21 por la madre «…717uK», a mano y tras verificarla**, no por el cierre automático.
Causa 1 (18 tareas con `type`/`effort` fuera del enum) la arregló **#437**; causa 2 (las 20 `in_progress`) la aplicó **#438**.
**Verificado sobre `main` 898ba390** con un parseo línea a línea: **527 tareas, cero `in_progress`, cero claves duplicadas,
cero tareas sin `status`.** La evidencia que pedía el criterio: la corrida de cerrar-tarea.yml sobre la rama
«i/T-554-triaje-aplicado» (14:16:23Z) salió **en verde**, la primera tras **cuatro fallos seguidos** (ramas de T-537,
T-549, T-548 y T-542).

**Residuo que dejaron esos cuatro fallos:** T-542 y T-548 estaban integradas y seguían en `backlog`. **Las cierra este PR.**
**T-549 no se cierra:** su rama era un PR de *docs* que solo la registraba; su bug (el filtro aplicado tras el `LIMIT`)
sigue abierto y la tarea sigue en `backlog`, que es lo correcto.

**La raíz que queda es T-553:** nada valida `roadmap/tasks.yaml` en el CI **antes** del merge, así que la próxima rotura
se descubrirá igual de tarde. Pide `.github/`, ruta protegida del propietario.

### Turno de la madre «…717uK» (2026-11-21, desde 14:20 UTC)

**`main`: `47fb844e` → `cfae145c` → `a5e1fc44`.** Integrados en serie, con squash a mano:

- **#439** (`47fb844e`) — relevo de la madre saliente. Solo documentación. Sus tres checks «cancelados»
  **se clasificaron, no se normalizaron**: entró un commit nuevo en la rama a las 14:19:37 y
  `concurrency: cancel-in-progress: true` mató el run del sha anterior. Ni prueba frágil ni fallo real.
- **#440** (`cfae145c`) — **T-546 y T-538.** «Hoy» y «Mis números» pintan las cotizaciones abiertas por tramos y
  el saldo por cobrar por moneda, y una cifra truncada se presenta como mínimo. **Auditoría independiente de la
  madre (R13, dinero): sin bloqueantes.** Lo que la sostiene: usa el formateador canónico, que entra por la rama
  de `unidades` y divide por `10 ** decimales` **según la moneda** —en COP no divide—, así que **no repite T-543**;
  el contrato declara `saldo: Dinero`; una fila por moneda y nunca sumadas (R8); y `null` omite el bloque en vez de
  pintar ceros, el mismo patrón de T-537. La sesión declaró por su cuenta el límite de su evidencia: la mutación
  cubre el marcado del mínimo, no el texto de la cifra ni la rama de alcance.
- **#442** (`a5e1fc44`) — cierra T-542 y T-548 tras verificarlas, abre T-555, T-553 a la bandeja.

- **#441** (`2149b9db`) — **T-531 y T-532.** El reporte de agencia trae las cifras **por asesor en una sola
  consulta** (antes era una por asesor, en lotes de cuatro, con tope de 12) y las **ventas del periodo por destino**.
  **Auditoría independiente de la madre (R13, dinero): sin bloqueantes.** `GROUP BY v.destino, v.moneda_iso`, así que
  las monedas **nunca** se suman (R8); `porAsesor` y `ventasPorDestino` solo existen con alcance de agencia, con
  **tres guardas independientes** —el tipo `AlcanceDeAgenciaEntera` (un alcance propio no compila), la comprobación
  en ejecución y el contrato `strict`—; y sin permiso de margen **sus columnas ni entran en la consulta**.

**La evidencia de #441 se completó antes de darlo por bueno.** La sesión reconoció que dos e2e —alcance `PROPIO` y
margen— **no las había visto fallar**, y se le pidió mutarlas. Al quitar el predicado de asesor, la respuesta
`PROPIO` de una asesora pasó a traer **la suma suya y la de su compañera** (`"unidades":"3600000"`): la prueba
detecta la fuga. La del margen también falló. No hubo que endurecer ninguna. Antes, la sesión había avisado **por su
cuenta** de que su mutación de la mediana pasó primero en verde (un solo valor por asesor hacía coincidir promedio,
mediana y p90) y la endureció hasta verla roja.

**`main` final del lote: `91f5664b`.** Cero PR de trabajo abiertos.

**Reparto:** la sesión de T-531/T-532 estaba **muerta**, no parada (worker desconectado, **sin publicar nada**).
Se relanzó entera. Carril `a` = sesión `01R81Xh2DhFQmHXUmF7Mqedn`; carril `b` = `01R81Xh4VsA5hAVxGfnhUVR7`, ociosa
y reservada para **T-555**.

**Ids: T-554 está QUEMADA** (nombre de rama sin tarea detrás). Creadas: T-555 (mitad web de T-531/T-532),
T-556, T-557 y T-558. **Siguiente libre: T-559**; `git fetch` antes de numerar.

**Tarea programada de esta madre: `trig_01W27QjMm5BD8aFm1EJ6wa17`** (cada dos horas, directa a ella), verificado
con `list_triggers`: hay **una sola**. El id que traía el traspaso era falso. Comprobar, no heredar.

### Integrado en este turno (2026-11-21)

- **#388** (`7475d7b`): R14, tablero, prompt de arranque y los skills `ahorro-de-tokens`, `modelo-y-esfuerzo` y `relevo-de-sesion`.
- **#358** (`ea017f7`): ingreso por apodo, tope por identificador y apodo de miembros. **Auditoría independiente: sin bloqueantes.** El arreglo de la carrera (reservar antes de comprobar, dos sentencias en autocommit) falla cerrado y la prueba de 25 peticiones en paralelo **discrimina** el arreglo; el caso mixto ya estaba. El apodo es global en esta fase y lo contiene `guardia-de-apodos.ts` (consulta viva, falla cerrado) más el aborto al arrancar. Cola: T-361 (índice por `(tenant_acceso_id, apodo)`), aserción tautológica en `apodo-ingreso.e2e-spec.ts:505`, `tenant.count()` por intento sin caché, reserva no liberada si Better Auth da 5xx, sesiones huérfanas en Better Auth.

## 4. Pendientes del orquestador (prometido y no hecho)

**Turno de la madre «…717uK» (2026-11-21, 14:20 UTC):**

1. **Recoger lo que entreguen las dos sesiones vivas** (T-531/T-532 en `a`, T-546/T-538 en `b`) y auditar de forma
   independiente lo que toque dinero: las dos lo tocan (ventas por moneda, saldo por cobrar). Ahí no se recorta (R13).
2. **Al entrar T-531 y T-532, repartir T-555** (su mitad web) al carril `b`.
3. **T-553 sigue abierta** y necesita `.github/`: va a la bandeja del propietario, no se rodea.
4. **T-549 sigue en `backlog` a propósito.** Nadie la ha trabajado: el PR que llevaba su id en la rama solo la registraba.
5. **La sesión muerta de T-531/T-532 dejó un permiso de Bash pendiente** en la conversación del propietario. Ya no sirve
   para nada: su trabajo se relanzó entero en otra sesión. Puede denegarlo sin pensárselo.


**Al relevarse la madre el 2026-11-21 a las 12:20 UTC:**

1. **Integrar #426** (este PR) y después lo que entreguen T-528 y T-510.
2. **T-528 lleva auditoría independiente** con `auditor-seguridad` antes de integrar: lo que devuelva a un asesor con alcance `PROPIO` no puede traer una fila de otro.
3. **T-533 (`ready`) bloquea conectar el número real** de JD Tours: lista de exclusión y filtro en el trabajador con prueba de punta a punta. **Espera que el propietario traiga de JD Tours la lista de chats a excluir.**
4. **Resembrar staging** para recuperar la clave de la demo: lo corre **el propietario** desde su terminal. La madre no toca credenciales.
5. **T-536**: el job `navegador` imprime `BETTER_AUTH_SECRET` en un log público. **No es una fuga** (nace y muere en el job), pero no se enmascara porque no es un secreto registrado. `.github/` es ruta protegida.
6. **Cola sin repartir:** T-515, T-517..T-527, T-529..T-532, T-534. La ventana web está **libre**.

**Lección de coste, de la madre saliente:** llegó a **688 mil tokens y 122 USD** por no relevarse a los 150 mil, y por hacer ella arreglos de código que debió delegar (persiguió por CI un `any` de su propia prueba con la flota parada). **Comprobar `context_usage` propio en cada vuelta, no solo el de las hijas.**



- **El tope de 150 mil tokens por sesión no se cumple solo.** Ninguna sesión recibe aviso de su propio consumo: la hija de T-331 terminó en **318 mil** y ~25 USD sin enterarse, y lo hizo notar ella. **La madre tiene que consultar `get_session` → `context_usage` en cada vuelta del ciclo** y archivar al pasarse. Es paso del ciclo, no buena intención.
- **Siguiente trabajo:** T-511 (web, ventana libre), T-343 y T-344 tras T-342, y la cola nueva T-515..T-521 de la auditoría de cobros.
- **Sin repartir, esperando la ventana web** (va de una en una, y hoy la tiene T-331): **T-343** y **T-344** (dashboards del asesor y de administración; dependen de que T-342 entre primero) y **T-511** (ingreso por apodo a 390 px contra la API real). T-506 a T-509 son P3.
- **Ojo con T-511:** su criterio dice «contra la API real, no simulada», y en este entorno **ninguna sesión puede levantar Postgres en local**. En la práctica significa escribir la e2e para que **la corra el CI**, que sí tiene Postgres. Dilo así en el PR en vez de afirmar que se probó en local.

- La cola de las auditorías de #393, #358 y #395 y la estabilidad de las pruebas quedaron en `roadmap/tasks.yaml` (T-494..T-504, T-361 y T-490). T-503 se cerró con #408; su resto es T-510 (`qa`, P2). La migración de T-341 ya se integró (#407).
- Criterio de salida 9 y principio 7 del roadmap 08 en celular, tablet y escritorio.
- Verificar el `navegador` de `main` tras los merges; reabrir el PR del `navegador` obligatorio (commit `27412e7`) **solo** cuando el propietario lo aplique en el servidor.
- Redesplegar con el `main` actual **solo con la confirmación del propietario**.

## 5. Lo que solo puede el propietario

Bandeja completa en [`PENDIENTES-DEL-PROPIETARIO.md`](PENDIENTES-DEL-PROPIETARIO.md). Lo que más bloquea hoy: secretos de Render y `DIRECT_URL` en Actions, espacio de trabajo de Render, `navegador` como check obligatorio, coexistencia (ADR-0033), pasarela, nombre comercial y marca.

**Nuevo (2026-11-21):**
- ~~El despertar solo lo arregla el propietario~~ — **FALSO, corregido el 2026-11-21**. La madre `session_01R81Xh5b7wpteu5YpcDpw5p` creó su propia tarea programada sin que el clasificador la denegara: **`trig_01Cq7TrGZ9uGFc9uAmqQEDtr`** (`15 */2 * * *`), que entra **directa** en ella. Lo que había antes era un relevo en dos saltos: `trig_01H8nNZUwV2DdTA2fnJzQkVh` despertaba a la madre **saliente** (688 mil tokens) solo para reenviar un mensaje — caro y con un punto de fallo de más.
- **Estado verificado a las 13:05 UTC con `list_triggers`: existe UNA sola tarea programada, la de la madre actual.** `trig_01H8nNZUwV2DdTA2fnJzQkVh` **ya no existe**; la madre fue a borrarla por orden del propietario y la encontró borrada, pese a haberla leído entera a las 12:25. Quién la borró **no está verificado** (lo más probable: la madre saliente al despertar, siguiendo su propio texto). Se anota como incógnita, no como hecho.
- **Para la próxima madre: `create_trigger` funciona.** Créate la tuya apuntándote a ti misma y **no heredes el relevo en dos saltos**. Comprueba con `list_triggers` que queda una sola y que su `persistent_session_id` es el tuyo.
- **Las sesiones no pueden levantar Postgres en local** (el clasificador lo deniega): «probado en navegador» casi siempre es contra API simulada. Limita toda verificación de pantalla.
- El **clasificador del modo automático deniega `git push --force-with-lease`**. Sin eso no se puede corregir el asunto de un commit ajeno: hay que recrear la rama y abrir otro PR (así nació #399). Si el propietario quiere evitarlo, tendría que permitirlo explícitamente.
- La sesión de despliegue fue archivada, así que **la clave de la demo (`acceso-demo-VIAJAPRO.txt`) se da por perdida**; se regenera resembrando.

## 6. Hechos que cuesta recuperar

- **Despliegue:** proyecto Vercel `viajapro-staging`, un despliegue `READY` desde `main` en #321; Render sin verificar. Nada de lo nuevo está desplegado. Staging tiene migraciones hasta `20261120150000`; faltan `20261120140000` y `20261120160000/170000/180000`; verificar `createrole_self_grant` antes de la de registro.
- **ADR-0034 (pagos):** `cobro.corregir` solo para el dueño; el asesor solo registra el pago.
- **ADR-0035 (reportes, en #397):** dos niveles, propio y agencia; un permiso `reportes.ver_agencia`; el servidor impone el alcance con `alcanceDeReporte`; 403 en vez de recorte silencioso; la venta se atribuye a quien cotizó y el trabajo vivo al asignado actual.
- **El CRM se usa desde celular, tablet y navegador de escritorio.**
- **`ESTADO.md` es la fuente de qué es real y qué es maqueta.**

## 7. Trampas

- commitlint rechaza asuntos de más de 100 caracteres y el push no avisa: comprobar con `git log`.
- Los logs de Actions por MCP son enormes: volcar a archivo y filtrar.
- `comprobar-enlaces` también revisa rutas entre backticks: citar un archivo que solo existe en otro PR rompe el check.
- Tras traer `main`, recompilar `packages/contracts` y `packages/domain` o el typecheck falla.
- El hook bloquea comandos git compuestos con el cwd en `main`; el hook `commit-msg` exige tipo conventional también en los merges.
- `next dev` y `next build` no comparten `.next`. `AP14` se omite en `test` por `npm_lifecycle_event`.
- commitlint rechaza `merge:` como tipo: en los mensajes de merge hay que usar `chore:`.
- **El `scope` de commitlint es una lista cerrada y los nombres de los agentes NO están en ella.** Costó tres PR la mañana del 2026-11-21 (#411 con `test(datos)`, #412 con `test(qa)` y el primer intento de este tablero con `docs(contexto)`). La lista es: `identity, inbox, crm, quoting, booking, payments, automation, analytics, notifications, audit, api, web, worker, db, contracts, domain, ui, sdk, whatsapp, infra, deps, ci, dx, lint, test, docs, adr, hilo, estado, estructura, entregables, roadmap, agentes, skills, hooks, mcp, stitch, diseno, seguridad, rls`. Equivalencias que se piden solas: `datos` → **`db`**, `qa` → **`test`**, `backend` → **`api`**, `contexto`/cerebro → **`hilo`**, reportes → **`analytics`**. **Dilo en el prompt de cada sesión hija**, porque como `--force-with-lease` está denegado, un scope malo **obliga a recrear la rama y abrir otro PR**.
- **Un asunto de commit que empieza por el id de la tarea tumba `convencion-de-commits`.** La regla `subject-case` rechaza sentence-case, start-case, pascal-case y upper-case, y `docs(roadmap): T-548, la e2e…` cuenta como mayúsculas. **Costó el PR #431 entero** (sustituido por #434) el 2026-11-21: como `--force-with-lease` está denegado, un asunto malo **no se enmienda, se recrea la rama**. El id va **al final**, entre paréntesis: `docs(roadmap): cierra T-520 y T-521, y abre la fragilidad de la e2e (T-548)`.
- **El job `navegador` tiene una prueba frágil conocida** (`08-ingreso-por-usuario.e2e-spec.ts`, **T-548**). Si un PR sale rojo **solo** ahí: relanzar el job sobre el **mismo sha**. Si pasa, es la fragilidad; si vuelve a fallar, es real. **No se integra con un check en rojo sin clasificarlo antes**, aunque `navegador` no esté entre los 8 obligatorios.
- `gh pr checks` usa GraphQL y está bloqueado aquí: usar `gh api repos/system-technology/CRM/commits/<sha>/check-runs`.
- **Una sesión hija creada sin `source_url` nace sin el repositorio clonado** y `add_repo` cae bajo el clasificador: la hija **se queda bloqueada pidiendo un permiso que, en modo desatendido, nadie concede**. Crearla siempre con `source_url` y, si procede, `source_revision`. **Señal inmediata:** la respuesta de `create_session` trae la etiqueta `config:no-git-repo`; si está, archivar y relanzar, no intentar rescatarla. **Esta trampa YA ESTABA ESCRITA AQUÍ y la madre del lote de las 17:50 cayó igual**, con las tres hijas a la vez (0,36 USD y una vuelta entera). Lo cual dice algo de esta lista: **ha crecido más de lo que nadie lee antes de actuar.** Si vuelve a pasar, el remedio no es otra viñeta.
- **`Carril y tarea` NO rechaza una bitácora de `docs/` dentro de un PR de carril `a` o `b`.** Verificado en verde en #471, #472 y #473 el 2026-11-21. No hagas que las hijas quiten su rastro documental por esto (ver §1.9).
- El clasificador deniega `git push --force-with-lease` (así nació #399): para corregir el asunto de un commit ya empujado, recrear la rama y abrir otro PR. No hay atajo.
- Pide siempre el mensaje de error completo de `tsc` antes de dar por buena una causa.
- Una sesión hija sin `source_url` nace sin repositorio.
- **Bautizar una rama con el id de una tarea que solo se está REGISTRANDO la cierra en falso.** cerrar-tarea.yml mira
  únicamente el nombre de la rama, nunca el título, y marca esa tarea como hecha. Pasó con T-549: un PR de documentación
  que solo la anotaba iba en una rama con su id, y solo se libró porque el validador estaba roto y abortó el cierre.
  **Para un PR de docs que registra tareas sin hacerlas, usar en la rama el id de la tarea que ESE PR sí completa**, o
  ninguno.
- **Un check «cancelled» no es un fallo, pero tampoco es verde: hay que clasificarlo.** Lo más frecuente aquí es
  `concurrency: cancel-in-progress: true` matando el run de un sha al empujar otro commit a la misma rama. Se confirma
  mirando si hay un run posterior en la rama con otro sha, no suponiéndolo.
- **El traspaso entre madres puede traer ids inventados.** El de la tarea programada venía mal el 2026-11-21. Comprobar
  con `list_triggers` y no heredar un id de memoria.
- Un 23505 de un disparador puede llegar como P2002 sin restricción. `issue_write` con `labels` reemplaza etiquetas.

- **El check `Carril y tarea` NO falla si el PR no menciona ninguna `T-xxx`: solo emite un `::warning::`**
  (verificado el 2026-11-21 leyendo `.github/workflows/ownership.yml`). Lo que sí falla es el carril. Por eso
  **un PR de documentación que solo registra tareas puede ir en una rama sin ningún id** — es la forma limpia de
  no cerrar ninguna en falso, mejor que buscarle un id prestado.
- **`update-branch` de GitHub es seguro para `convencion-de-commits`.** Su commit se llama `Merge branch 'main'
  into …`, y `commitlint.config.cjs` **no desactiva `defaultIgnores`**, que ignora los mensajes que empiezan por
  `Merge `. Verificado el 2026-11-21 antes de usarlo. Lo que sí lo tumba es un merge escrito a mano con `merge:`
  como tipo (en minúscula no entra en `defaultIgnores`): ahí va `chore:`.

- **Una sesión bloqueada en un permiso NO está muerta: está esperando, y su carril sigue ocupado.** `connection_status: disconnected` y `status_bucket: BLOCKED` dicen **dónde está**, no si va a seguir. Comprobar que no ha publicado nada **tampoco basta**. Antes de repartir su tarea a otra: **archivarla** (así no revive) **o esperarla**. Verificado el 2026-11-21 por el camino caro: se reasignó T-531/T-532 dándola por muerta, la sesión revivió, la implementó entera y abrió un PR duplicado.
- **El medidor de consumo sí funciona MIRANDO A LAS HIJAS, aunque la madre no vea el suyo en caliente.** `get_session` de una hija trae `context_usage.used_tokens` y `usage.cost_usd` reales (verificado: 226.328 tokens y 1,22 USD en una Sonnet). Así que el consumo de la flota **se puede vigilar**; lo que no se ve en el momento es el propio. No confundir las dos cosas, y no dejar de mirar el propio por eso.

- **Un hex en el cuerpo de un commit rompe `convencion-de-commits`.** commitlint lee `#abc123` como referencia a
  incidencia (`#` es prefijo de issue) y dispara `footer-leading-blank` aunque la línea en blanco antes de los
  trailers esté bien puesta. Escribir los colores por el nombre del token. Verificado por la sesión de T-561.
- **`mergeable_state: unstable` NO significa rojo.** Puede ser simplemente que falte un check por terminar.
  Se clasifica mirando los `check-runs`, igual que un `cancelled`: ni se da por verde ni se da por rojo.

- **El cierre automático de tareas compite con TODO el carril `i`.** En un solo lote: provocó el conflicto de
  #463, tumbó un merge de #464 con «Base branch was modified» y dejó #465 detrás **dos veces**. **La ventana
  segura para tocar `tasks.yaml` es cuando no hay ningún otro PR de carril `i` abierto.** Un integrador en serie
  que ponga la rama al día y reintente lo absorbe solo; a mano cuesta una vuelta de checks cada vez.
- **Un conflicto de `tasks.yaml` se DEVUELVE a quien hizo el trabajo**, con instrucciones de tomar `origin/main`
  como base y reaplicar **tarea por tarea**. Nunca concatenar: ya entremezcló entradas una vez y el YAML parseaba
  igual. Al recibirlo, validar aparte: parsea, sin ids duplicados, cada título con su cuerpo.
- **Hay criterios de aceptación que cruzan carriles por su cuenta.** T-565 y T-566 pedían tocar `docs/06-manual/`
  dentro de una tarea de `apps/web`; «Carril y tarea» lo habría rechazado. Avisarlo **al repartir** y encolar el
  rastro de documentación aparte (así nació T-576).
- **El sha truncado vuelve a morder, y ahora desde el propio monitor.** Un bucle que imprime `${sha:0:8}` y se
  reutiliza en `update-branch` da **422**. Leerlo entero con `--jq '.head.sha'`.
- **Un monitor que imprime el estado en cada vuelta inunda de notificaciones.** Guardar el estado anterior y
  emitir **solo al cambiar**.

## 8. Sin verificar (heredado)

E2E de ráfagas, de cobros y de #395 contra Postgres real (solo CI); tablet solo emulada; `error.tsx` y la campana con API real; Safari, Firefox y Edge; **nada contra la API real desplegada**.
