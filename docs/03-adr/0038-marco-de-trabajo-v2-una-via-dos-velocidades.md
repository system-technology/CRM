# ADR-0038 — Marco de trabajo v2: una vía, dos velocidades

- **Estado:** Propuesto (2026-11-23). **No se implementa nada hasta que el propietario lo acepte.**
- **Fecha:** 2026-11-23
- **Decide:** propietario, a propuesta de `arquitecto`
- **Motivo:** decisión explícita del propietario el 2026-11-23: *«prefiero hacer un alto en este
  punto y corregir todo que seguir así»*, tras un atasco de seis PR que reveló fallos del plano de
  control. Decidió además **consolidar la memoria a tres artefactos** y **congelar todo** hasta
  cerrar las brechas.
- **Tarea:** T-647. Habilita T-648 a T-659 (ver el
  [plan de cierre de brechas](../08-roadmap/12-plan-de-cierre-de-brechas.md))
- **Amplía / modifica:** R11 y §9 de `CLAUDE.md`, [ADR-0005](0005-flujo-de-git-y-releases.md),
  [ADR-0016](0016-ciclo-autonomo.md) §6 y `docs/_contexto/MARCO.md` (que **desaparece**: su contenido
  pasa a `CLAUDE.md`). No supersede ningún ADR.
- **Base verificada:** `origin/main` en `52459b50`, comprobado con `git`, `gh` y la API de GitHub el
  2026-11-23. Lo no comprobado va marcado.

---

## Contexto

El 2026-11-23 había **seis PR detenidos a la vez** y `main` llevaba 32 h sin recibir nada. Al
diagnosticarlo aparecieron fallos que no eran del producto sino **del plano de control**, y que
comparten una raíz.

### Los hechos, verificados ese día

| # | Hecho | Cómo se comprobó |
|---|---|---|
| H1 | Los 6 PR los abrió la cuenta del propietario. La compuerta `rutas-protegidas` rechaza **siempre** un PR del Owner que toque ruta protegida, porque GitHub no deja aprobar el PR propio. **No era «falta aprobación»: era imposible de aprobar** | `gh pr view --json author`; log del job; `scripts/comprobar-aprobacion-owner.mjs` |
| H2 | El arreglo de H1 (#521) tocaba `.github/workflows/`, ruta protegida, y lo abrió el Owner: **no podía pasar su propia compuerta**. La llave estaba dentro de la caja | Mismo log, sobre #521 |
| H3 | El mecanismo correcto **existía desde el 2026-10-26** (`scripts/gh-app.mjs`, tres apps por carril) y `MARCO.md` §5 ya lo exigía. **Estaba escrito y no se cumplía** | `scripts/gh-apps.json`; la app respondió a `gh pr list` en la misma máquina |
| H4 | `rutas-protegidas` **no está en los checks requeridos**. Los requeridos son 8: `secretos, typecheck, lint, build, test, aislamiento-tenants, fronteras-entre-modulos, convencion-de-commits`. La compuerta **pinta rojo y no impide integrar** | `gh api repos/.../branches/main/protection` |
| H5 | El estado vivo (`CHECKPOINT.local.md`) es **la única capa no versionada** (`.gitignore:67`) y a la vez el hook `parada` **impide cerrar el turno** sin él | `git check-ignore -v`; cabecera de `contexto-persistente.mjs` |
| H6 | `scripts/cerrar-tarea.mjs:44` valida **toda** la cola y aborta ante cualquier error: una fila mala en cualquier parte impide cerrar una tarea sin relación. **Y estaba pasando en vivo:** `T-599` llevaba en `main` truncada a `id` y `title`, así que la cola **no validaba** y el cierre automático **no podía cerrar ninguna tarea** — dos días después de darlo por arreglado | `R.validate()` sobre `tasks.yaml` de `main`; `roadmap/tasks.yaml:12488`. Reparada en este mismo PR |
| H7 | El job `navegador` falló en dos PR sin nada en común y pasó al relanzarlo **sin cambiar una línea** | Diario del 2026-11-21; relanzado de nuevo el 23 |
| H8 | «Done» no distingue integrado de entregado. **267 tareas `done`** y ninguna capacidad usada por una agencia real. Las 6 P0 abiertas **no son de código** | Recuento de `tasks.yaml`; auditoría del 2026-11-04 |

### La raíz común

Los ocho son variantes de **tres** fallos de diseño:

1. **Una regla sin mecanismo es decoración** (H3). Se escribió, no se hizo cumplir, se incumplió.
2. **Una compuerta que no bloquea es peor que ninguna** (H4, H7). Genera confianza falsa: durante
   días se creyó que R11 se cumplía en el servidor.
3. **El plano de control no tiene camino de arranque** (H2). Las compuertas viven en rutas que ellas
   mismas protegen: **una dependencia circular consigo mismas**.

Y uno de forma, que explica por qué 1 y 2 pasaron desapercibidos: **el marco vigila su propia
honestidad muy bien y nada le obliga a mirar hacia afuera** (H8). Se puede estar impecablemente
honesto sobre no avanzar — y eso fue exactamente lo que pasó.

---

## Decisión

Se adopta un marco de trabajo **v2** con un principio rector y cinco pilares.

> ### Principio rector
>
> **La vía segura tiene que ser la vía rápida.** Si cumplir la regla cuesta más que rodearla, se
> rodea — y eso no es indisciplina, es diseño defectuoso. H3 es exactamente eso: la regla correcta
> existía y era más incómoda que la incorrecta.

Hoy hay **un solo camino, y es pesado para todo**. Un cambio de una línea en un documento paga las
mismas 15 compuertas que una migración de base de datos. La consecuencia no es solo lentitud: empuja
a **agrupar cambios en lotes grandes**, y un lote grande es **menos** seguro que varios pequeños.

### Pilar 1 — Enrutado por radio de impacto (velocidad)

El coste de verificación pasa a ser **proporcional al daño que el cambio puede hacer**, no uniforme.

| Vía | Qué toca | Compuertas | Aprobación |
|---|---|---|---|
| **Verde** | Solo `docs/`, bitácora, `roadmap/tasks.yaml` | `lint`, `convencion-de-commits`, `enlaces-de-documentacion` | Ninguna. Auto-merge |
| **Ámbar** | Código de producto **sin** dinero, PII, tenancy ni plano de control | Las 8 requeridas de hoy | Ninguna. Auto-merge |
| **Roja** | Migraciones, RLS, permisos, cifrado, dinero, PII, `.github/`, `scripts/`, `.claude/`, `infra/`, ADR, dependencias | Las 8 + `aislamiento-tenants` + `mutaciones-aislamiento` + `rutas-protegidas` | **Del propietario, obligatoria** |

Tres condiciones **innegociables**:

- **La vía la decide un script sobre los ficheros del PR, nunca el autor.** Nadie se autoclasifica.
- **La lista roja es exactamente `humanRequired` de `ownership.json`.** Una sola fuente; no se
  mantienen dos listas que puedan divergir.
- **Ante la duda, roja.** Un fichero que no encaje en verde ni en ámbar es rojo (principio «falla
  cerrado»).

### Pilar 2 — Compuertas que de verdad cierran (seguridad)

1. **Paridad declarado ↔ requerido.** Un job compara los checks requeridos que devuelve la API de
   GitHub contra un manifiesto versionado. **Si divergen, rojo.** Es lo que habría impedido H4, y
   cierra T-619 de verdad y no por documento.
2. **Toda compuerta se prueba rechazando.** Cada compuerta necesita una prueba negativa que
   demuestre que **rechaza**, no solo que corre. *Una compuerta que nadie ha visto rechazar no es
   una compuerta.* Habría impedido H1: su precondición nunca se validó.
3. **Cuarentena de compuertas inestables.** Un job que falla y pasa al relanzarlo sin cambios sale
   de requeridos, se mide su tasa de fallo y vuelve bajo umbral. Lo que no puede quedarse es
   «requerido, pero ya sabemos que se relanza» (H7): eso enseña a relanzar también los fallos
   reales.

### Pilar 3 — Nada se pierde (datos)

**Tres artefactos, los tres versionados.** Decisión del propietario del 2026-11-23.

| Artefacto | Capa | Autoridad |
|---|---|---|
| `ESTADO.md` | Lo vivo: dónde estamos, qué se prometió, qué bloquea | Se reescribe entero |
| `docs/_contexto/DIARIO.md` | Lo histórico: decisiones y lecciones | Append-only. **Una entrada falsa se corrige con otra debajo; no se reescribe** |
| `roadmap/tasks.yaml` | La cola | Una fila por tarea |

- **`CHECKPOINT.local.md` desaparece.** Su función pasa a `ESTADO.md`, que **sí** se versiona. H5 es
  el único fallo de **pérdida de datos real** del marco actual: la capa más fresca y load-bearing
  era la única sin respaldo.
- **`MARCO.md` y `CONTEXTO.md` se funden en `CLAUDE.md`.** Deja de haber ocho sitios donde el estado
  pueda envejecer por separado. *`ESTADO.md` llegó a estar 18 días obsoleto y el diario tuvo que
  corregirse a sí mismo dos veces en un día: no por descuido, sino porque ocho copias de la verdad
  es una garantía de divergencia.*
- **El estado vivo se escribe por la vía verde**, en un minuto y sin revisión. **Por eso el Pilar 1
  es requisito previo de este:** si escribir el estado cuesta 15 compuertas, no se escribe.
- **«Done» deja de significar «entregado».** Se añade un eje aparte del estado —
  `integrado → desplegado → usado por alguien real` — y **la métrica semanal es la del tercero**:
  *¿qué puede hacer hoy un usuario real que no podía la semana pasada?* Es la única pieza de este
  ADR que mira hacia afuera, y la que responde a H8.

### Pilar 4 — El plano de control tiene puerta (bloqueos)

- **Camino de arranque auditado.** Etiqueta `arranque-de-compuerta`, entrada **obligatoria** en un
  log versionado, caducidad de 24 h, y el propio arranque **entra en la cola como tarea** para
  revisarse después. No es «saltarse R11»: es que R11 **tenga una puerta documentada** en vez de que
  se improvise una bajo presión. El 2026-11-23 la improvisamos en mitad del atasco; eso no puede
  depender del criterio del momento.
- **Autor ≠ aprobador. Ya implementado** en PR #537 (el hook bloquea `gh pr create|merge` fuera de
  la app). Se eleva aquí a regla del marco.
- **Todo recurso con techo duro se mide donde ya se mira.** La cadena de sesiones se agotó en 8 de 8
  sin que nadie lo contara, aunque el dato venía en la misma llamada que lo que sí se miraba. Si
  hace falta una llamada extra para verlo, no se verá.
- **Un validador aísla el fallo al registro que toca** (H6). Fallar por una fila ajena es
  acoplamiento gratuito. **No es hipotético: al escribir este ADR la cola estaba inválida por una
  fila truncada y nadie lo sabía.** El mismo fallo se «arregló» el 2026-11-21 corrigiendo *los datos*
  y no *la arquitectura*, y reapareció en 48 horas. **Corregir el dato de un fallo estructural
  garantiza su vuelta.**

### Pilar 5 — Flujo acotado (reprocesos)

- **Tope de trabajo en curso: 6 PR abiertos.** Al séptimo no se abre nada: se integra.
- **Entra una, sale una** en la cola. 612 tareas con 345 abiertas no es un plan, es una lista de
  deseos, y crece más rápido de lo que se cierra.
- **P0 solo si bloquea hoy a alguien.** Lo que espera a un tercero es `blocked` con dueño externo y
  fecha de revisión. Hoy las 6 P0 no son de código y el tablero no dice qué hacer primero.
- **Una vuelta de revisión** (R13 vigente, sin cambios), salvo aislamiento entre agencias.

### Pilar 6 — Que el propietario no sea el cuello de botella

**Añadido el 2026-11-23 a petición del propietario**, que señaló el defecto antes de firmar: *«lo
único que me preocupa es que este marco de trabajo depende mucho de mí»*. **Tenía razón, y el plan
tal como estaba escrito lo empeoraba:** las olas 1 a 4 son **100 % plano de control**, así que
durante toda la corrección la dependencia habría sido total. Un plan que convierte a su aprobador en
el cuello de botella de su propia ejecución está mal diseñado.

**Lo primero es dimensionarlo, no suponerlo.** Medido el 2026-11-23 sobre los **60 PR integrados más
recientes**, aplicando los mismos globs `humanRequired` de `ownership.json`:

| Medida | Valor |
|---|---|
| PR que habrían exigido la firma del propietario | **10 de 60 (17 %)** |
| PR que no le tocaban | 50 |
| Globs que más la disparan | `.github/**` (5), `scripts/**` (5), `.claude/**` (4), `CLAUDE.md` (3) |

**El 7 de 7 de hoy es el pico histórico, no el régimen normal**, y lo es precisamente porque lo que
se está arreglando *es* el plano de control. Pero eso no excusa nada: durante el plan la dependencia
sí será del 100 %.

**Hay que separar tres dependencias que se venían confundiendo:**

| Tipo | Ejemplo | ¿Reducible? |
|---|---|---|
| **De decisión** | Aceptar un ADR, el aviso de privacidad, el precio, la prioridad | **No, y no se debe.** Es el trabajo del propietario |
| **De credencial** | Protección de rama, secretos, paneles de Render/Vercel/Neon | **Sí.** No hay juicio que ejercer: solo tiene la llave |
| **De sobre-protección** | Un borrador de ADR en `Propuesto` exige su firma | **Sí, y es autoinfligida** |

**Se decide:**

- **(a) Aprobar la decisión, no el borrador.** Un ADR en `Propuesto` **no ejecuta nada** —lo declara
  su propia cabecera— y pasa a vía **ámbar**. La firma del propietario se exige en la transición
  **`Propuesto → Aceptado`**, que es donde ocurre la decisión. *Hoy firma borradores.*
- **(b) Protección de rama como código.** El manifiesto del Pilar 2 pasa a ser la fuente de verdad y
  una credencial estrecha lo aplica. **El propietario aprueba el diff; no ejecuta la operación.**
  Delegación de una vez, en lugar de acción en cada evento.
- **(c) Globs por riesgo, no por carpeta.** `scripts/**` son decenas de ficheros y solo unos pocos
  son compuertas; `**/package.json` trata igual subir la versión de una herramienta de desarrollo
  que añadir una dependencia de producción. Es el Pilar 1 aplicado a la lista roja. **Se hace
  fichero a fichero, nunca por lotes** (ver la contrapartida).
- **(d) Lote de aprobación con resumen.** El coste no es el clic: es **reconstruir el contexto una
  vez por PR**. Un digest ordenado por riesgo, una vez al día.
- **(e) Núcleo irreducible, declarado.** Tras (a)–(d) queda del propietario: **aceptar ADR, lo legal,
  la identidad en Meta, gastar dinero y la prioridad.** Del orden de **cinco decisiones por semana**,
  no siete PR al día.

**La contrapartida, dicha sin adornos:** reducir la dependencia del propietario es, por definición,
**aumentar lo que los agentes hacen sin supervisión**. (a), (b) y (d) son seguras —sigue aprobando la
*decisión* y deja de ejecutar la *mecánica*—. **(c) no lo es:** afina de verdad la superficie que
mira, y por eso va fichero a fichero y con la regla «ante la duda, roja» intacta.

**Y se añade a la tabla de medición una fila que hoy no existía:** el **porcentaje de PR que exigen
la firma del propietario**, con objetivo **≤ 10 %** en régimen normal. Si el Pilar 6 no lo baja del
17 % actual, no cumplió.

---

## Orden de implementación, y por qué ese

**Seguridad antes que velocidad, y no es retórica:** implementar el Pilar 1 antes que el 2 sería
acelerar mientras las compuertas todavía no cierran. El detalle y los criterios de aceptación están
en el [plan de cierre de brechas](../08-roadmap/12-plan-de-cierre-de-brechas.md).

| Ola | Qué | Pilar |
|---|---|---|
| **0** | Desatascar: aprobar los 6 PR pendientes | — |
| **1** | Que las compuertas no mientan | 2 |
| **1.5** | **Que el propietario deje de ser el cuello de botella.** Va aquí, y no al final, porque **las olas 2 a 4 son todas plano de control**: sin esto, él aprueba cada paso de su propio plan de corrección | 6 |
| **2** | Que no se pierda nada | 3 |
| **3** | Velocidad: enrutado por radio de impacto | 1 |
| **4** | Flujo: topes, eje de entrega, P0 saneadas | 4 y 5 |

**El congelamiento se levanta al terminar la Ola 2**, verificada. Las olas 3 y 4 ya pueden convivir
con el producto en marcha.

---

## Consecuencias

### A favor

- Un cambio de documentación deja de costar 15 compuertas, y **escribir el estado deja de ser caro**
  — que es lo que hace que se escriba.
- H4 y su familia dejan de ser posibles: una compuerta declarada y no requerida **rompe el CI**.
- El estado vivo deja de poder perderse con un disco o un `git clean`.
- Aparece, por primera vez, **una métrica que mira al cliente**.

### En contra, y hay que decirlo

- **Tres vías es más máquina que una.** Un clasificador mal escrito puede mandar por verde algo que
  era rojo. Mitigación: la lista roja sale de `ownership.json`, ante la duda es roja, y lleva prueba
  negativa. **No elimina el riesgo: lo acota.**
- **Fundir `MARCO.md` y `CONTEXTO.md` en `CLAUDE.md` lo engorda**, y `CLAUDE.md` pide quedarse bajo
  ~400 líneas. Habrá que recortar de verdad, no mover texto. Si no cabe, el Pilar 3 habrá fallado en
  su propósito.
- **El congelamiento tiene coste de cliente.** JD Tours espera más. Es decisión expresa del
  propietario, consciente del riesgo.
- **Nada de esto garantiza entregar.** Es plano de control. Si tras la Ola 4 la métrica de «usado por
  alguien real» sigue en cero tres semanas seguidas, el problema no era el marco.

### Riesgo que se asume a sabiendas

Este ADR **añade mecanismo a un marco al que ya le sobraba** en opinión del propio arquitecto. La
apuesta es que el mecanismo del Pilar 1 **retira** más ceremonia de la que añade, al liberar a las
vías verde y ámbar. **Es una apuesta, no un hecho**, y se mide así: si el tiempo medio de un PR de
documentación no baja de forma clara, el Pilar 1 no cumplió y hay que revertirlo.

---

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Dejarlo como está y disciplinarse más** | Es lo que falló. H3 es literalmente «estaba escrito y no se cumplía». Pedir más disciplina a agentes que producen más rápido de lo que nadie revisa no es una medida |
| **Migrar a BMAD** (evaluado el 2026-11-23) | Opera en el plano de planificación, no en el de control: no resuelve ninguno de H1–H8. Y su defecto documentado —*false completion*: marcar una historia completa con la funcionalidad rota— es justo la enfermedad que este proyecto combate, contra la que el marco actual defiende mejor. Se le toman dos ideas sueltas (filas de cola autocontenidas y vía ligera), sin migrar |
| **Recorte radical: 2 artefactos y 3 agentes** | Desmontar lo que ya rueda en un repositorio con ~680 commits de inercia. El propietario eligió la consolidación a tres |
| **Quitar `rutas-protegidas` en vez de hacerla requerida** | Resuelve el síntoma creando el agujero que la compuerta tapaba. R11 dejaría de ser cierto, esta vez a propósito |

---

## Cómo se sabrá si funcionó

Verificable, no opinable. Se mide a las **cuatro semanas** de aceptarlo:

| # | Señal | Hoy (2026-11-23) | Objetivo |
|---|---|---|---|
| 1 | Checks requeridos declarados ≠ los del servidor | **Diverge** (H4) | Imposible: rompe el CI |
| 2 | Compuertas sin prueba negativa | Sin medir | 0 |
| 3 | PR abiertos por la cuenta del propietario | 0 desde #537 | 0 |
| 4 | Artefactos de memoria | 8 | 3 |
| 5 | Estado vivo versionado | **No** (H5) | Sí |
| 6 | Tareas abiertas en la cola | 345 | ≤ 300 y bajando |
| 7 | **PR que exigen la firma del propietario** | **17 %** (10 de los 60 últimos) | ≤ 10 % |
| 8 | Capacidades **usadas por alguien real** | **0** | ≥ 1 |

**La fila 8 es la que importa.** Si las siete primeras salen verdes y la octava sigue en cero, este
ADR habrá hecho el repositorio más honesto y el producto igual de parado.

**Y la fila 7 es la que delata si el marco escala.** Un marco que solo funciona mientras su
propietario esté disponible todos los días no es un marco: es una guardia.
