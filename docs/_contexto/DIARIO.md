# DIARIO — memoria versionada del proyecto (lo más reciente primero)

> **Para qué sirve.** `CONTEXTO.md` guarda lo estable (quién decide, trampas, cómo se integra).
> Este diario guarda **lo que cambia**: decisiones, hitos y la cola viva. Se lee al iniciar cada
> sesión (hook `contexto-persistente.mjs`) y es lo que sobrevive a compactar, a un clon nuevo y a un
> Codespace. La capa rápida es `CHECKPOINT.local.md` (ignorada por git, sin PR); aquí se consolida.
>
> **Reglas.** Entradas cortas y fechadas, la más nueva arriba. Cada una separa **Verificado**
> (comprobado con `gh`/`git`/navegador) de **Supuesto**. Sin secretos. Si una entrada queda falsa,
> se añade otra que la corrige; no se reescribe la historia. Se consolida por lote en la carril
> `i/` (rama `i/T-000-…`, alcance `hilo`).

---

## 2026-11-21 (noche) — Staging estaba vivo y el hilo decía que no; el ingreso cae por el origen de confianza

**Verificado por HTTP contra los servicios reales, a las 22:55 UTC.** El propietario avisó de que su
cliente abre la URL de staging y la ve, pero al poner usuario y contraseña no le deja entrar.

**Lo primero que apareció fue un error nuestro, y en la dirección optimista:** `ESTADO.md` afirmaba
«no hay servicio desplegado» y «Render: sin verificar». **Las dos cosas eran falsas.** La web responde
200 en `/` y en `/ingresar` con su formulario, `/salud` de la API da 200, y **`/salud/listo` devuelve
`{"estado":"ok","baseDeDatos":"ok","rol":"viajapro_app","aislamiento":"forzado"}`**: la API está
desplegada, habla con Neon, se conecta con un rol de aplicación (R2) y **RLS está forzado**.

Que la reescritura web→API funciona se dedujo **sin poder leer encabezados**: `/api/v1/salud` devuelve
**el mismo 401** desde Vercel que desde Render directo. Si no llegara, daría 502 o 404. Ese 401 es el
guard de sesión, no una avería.

**La causa más probable del rechazo, por lectura del código.** `origen.ts:33` devuelve **una sola
entrada**, `WEB_PUBLIC_URL`, y si falta usa `http://localhost:3000`; `origin-check.middleware.ts`
rechaza con **403 `ORIGEN_NO_CONFIABLE`** toda **mutación** cuyo `Origin` no esté en esa lista, y
**salta los métodos seguros**. De ahí el síntoma exacto: los GET se ven, el **POST del ingreso** no
pasa. En `render.yaml:56` esa variable es `sync: false` —vive solo en el panel de Render— y el ejemplo
apunta a un dominio propio que aún no existe.

**Supuesto, no verificado.** No se pudo hacer el POST con `Origin` que lo zanjaría: el clasificador
deniega `curl` y el navegador, y los MCP de Vercel, Render y Neon rechazan sus credenciales. Así que
**sigue viva una segunda causa**: que el usuario del cliente no exista en staging o su clave se
perdiera (punto 8e). Se distinguen en el propio POST: **403 `ORIGEN_NO_CONFIABLE`** es la variable;
**401 de credenciales** es resembrar.

**La lección, que es la de todo el día otra vez:** *el hilo se equivocó por no comprobar, y esta vez
de menos.* Llevábamos tres turnos escribiendo «ninguna agencia ha visto nada» mientras había un
cliente entrando a una URL viva. **Un estado heredado envejece hacia el pesimismo igual que hacia el
optimismo, y las dos formas mienten.**

---

## 2026-11-21 (lote de contraste y cobros) — Un síntoma contado cinco veces no es un diagnóstico, y la cadena de madres se agotó

**Verificado.** `main` arranca en `e5b670e0` y cierra en `91f3cc19` (más #484). Seis PR integrados:
**#479** (T-584), **#480** (T-582), **#481** (T-583), **#482** (T-585), **#483** (cierre automático de
T-585) y **#484** (T-576). Los seis con los 15 checks en verde, `mutaciones-aislamiento` incluido, y
auditoría del código —no del informe— donde tocaba PII, dinero o aislamiento (R13).

### Lo que más vale de este lote no es lo entregado, es lo diagnosticado

**El cierre automático de tareas no estaba roto: lo habíamos envenenado nosotras.** El traspaso
anterior decía en mayúsculas «el cierre automático NO cierra nada, lo comprobé CINCO veces». La
observación era cierta y el diagnóstico falso, **y nadie abrió el log del job**. Al abrirlo:

```
T-584: blocked sin blocked_reason
##[error]Process completed with exit code 1.
```

`scripts/cerrar-tarea.mjs` **valida la cola entera antes de tocar nada**, así que **una sola** tarea
`blocked` sin `blocked_reason` lo aborta y **ningún** PR cierra su tarea. Estaban así T-334 y T-336,
que el lote anterior pasó a `blocked` con buen criterio pero sin motivo, y T-584, **que creé yo en
este lote repitiendo el error**.

Y el mecanismo tiene un segundo paso que tampoco hacía nadie: el job **no escribe en `main`** —no
puede, está protegido—, sino que **empuja una rama `i/cerrar-T-XXX-prNNN` cuyo PR hay que integrar**.
Arreglado lo primero, el CI abrió él mismo el PR #483, se integró, y **T-585 llegó a `done` en `main`
por el camino automático, sin tocarla a mano**: confirmación de punta a punta.

*Contar las veces que algo falla no es diagnosticarlo. Cinco observaciones idénticas sin abrir un log
no valen lo que una lectura del log.*

### La cadena de sesiones orquestadoras se agotó (T-584, y la desbloquea solo el propietario)

Esta sesión está en **profundidad de linaje 8 de 8**: no puede crear hijas, ni la madre siguiente, ni
rearmar su despertar, y *ninguna configuración del usuario o de la organización cambia ese límite*. La
tarea programada apunta a una sesión ya archivada, así que **el modo desatendido está parado de
hecho**. Cada relevo por `create_session` gastaba un escalón **y nadie lo estaba contando**, aunque
`get_session` devuelve `lineage.depth` en la misma llamada que el `context_usage` que sí se mira en
cada vuelta.

El lote se sacó adelante con **subagentes en proceso** (herramienta `Agent`, `CLAUDE.md` §8), que no
cuentan contra el linaje, cada uno con `isolation: worktree`. No abren PR —no llevan las herramientas
de GitHub—, consumen contexto de la madre y mueren con la sesión: **sirven para un lote, no sustituyen
a la cadena**.

### Lo entregado, sin inflarlo

- **#481 (T-583)** — los dos dashboards y la línea legal pasan de **2,29–3,96:1 a mínimo 5,02** en
  claro y **6,48/6,7** en oscuro. Lo importante del método: **el medidor se vio funcionar antes de
  creerle** (141 textos leídos en administración, 81 en asesor, 0 colores no entendidos), porque en
  T-346 ese mismo medidor dio «0 hallazgos» por no entender `oklch()`. Aparecieron tres cosas que la
  medición anterior no decía, entre ellas que **el dashboard de administración está duplicado**.
- **#480 (T-582)** — `FilaDeCobro` trae el recuento de pasajeros. **Cifras, no nombres**, y la razón
  queda escrita en el contrato: la vista la lee quien tenga `cobro.ver` y **se exporta a un CSV que
  sale de la agencia**, mientras los nombres exigen `archivo.ver` (R10). Sin migración.
- **#484 (T-576)** — el manual deja de describir pantallas que ya no existen. **Desmintió mi
  hipótesis**: cambian 15 de 16 capturas y la causa dominante no era el contraste, sino la barra
  lateral (insignia «Vista» de T-566, entrada «Cobros» de T-332).

**Para una agencia, esto es media pieza nueva** (pasajeros en cobros, aún sin columna en pantalla) y
dos que hacen presentable lo que ya existía.

> **Corregida esta frase el mismo día, sin borrarla** (las reglas del diario piden corregir con otra
> entrada, no reescribir la historia): aquí decía «ninguna agencia ha visto todavía nada», y **era
> falso**. Lo desmiente la entrada de esa misma noche, que lo midió. Se deja escrito **porque el error
> importa más que la frase**: se repitió durante tres turnos sin que nadie lo comprobara.

### Otras dos cosas medidas, no supuestas

- **`navegador` se cayó a la vez en dos PR sin nada en común.** Relanzado **sin cambiar una línea**,
  pasó en los dos. Inestabilidad demostrada por experimento: `09-reportes-por-alcance.e2e-spec.ts`,
  introducida el mismo día. Encolada **T-592 en P1**, porque no rompe una funcionalidad: **rompe la
  compuerta**. Lo que no se hace es desactivarla para ver verde.
- **El check «Carril y tarea» sí rechaza la bitácora en un PR de código.** La nota que decía lo
  contrario citaba tres PR verdes, y los tres hechos eran ciertos y la conclusión falsa: aquellas
  ramas no llevaban prefijo de carril, y el check deduce el carril del prefijo. Costó dos rondas de CI.

### Supuesto, no verificado

- Que el fallo de la clase `dark` en `<html>` sea solo del servidor de desarrollo. **Si no lo es, el
  modo oscuro no funciona en ninguna pantalla** y el trabajo en oscuro de T-583 es invisible. Por eso
  **T-586 va en P1 y pide responder esa pregunta antes de arreglar nada**.
- Que las diferencias pequeñas de seis capturas se deban solo a T-569 y T-583; no se revisaron región
  por región.

### Cola al cerrar

**565 tareas, 254 `done`** (contando T-576 y T-593, que cierra el CI al integrar este PR), **308
abiertas, 4 P0 y 15 P1.** Cifras **recalculadas sobre el fichero dos veces**: las escribí primero de
memoria y estaban mal, y volvieron a quedarse cortas al integrarse T-576. Validaciones en verde: 0 ids duplicados, 0 `ready` con
dependencia sin terminar, **0 `blocked` sin motivo** (comprobación nueva, nacida de este lote).
Encoladas T-585 a T-592. **Siguiente id libre: T-594.**

---

## 2026-11-21 (lote nocturno) — La cola daba por lista una tarea que solo desbloquea el propietario

**Verificado** con `gh` y `git` en el mismo turno; cada PR con sus **15 checks** comprobados a mano
antes del merge (`mutaciones-aislamiento` incluido, que aún no es obligatorio en el servidor).
`main`: `580dd67f` → **`d059acba`**. Madre `…5mmenvvqrBAdaBUW1`.

**Cómo se eligió el lote.** No contra la lista de P1, sino contra el **criterio de salida de JD
Tours** (§3 del roadmap del piloto), que es la única lista del repositorio que mide lo que el
propietario pide cuando dice «que lleguen agencias».

- **#475 — T-340.** El **ADR-0035 pasa de «Propuesto» a «Aceptado»** con la auditoría de seguridad
  que le faltaba, recorrida punto por punto **contra el código**. Cierra un agujero de R7: llevaba
  días implementado (T-341 a T-343) sin que nadie lo revisara. Queda escrito en el propio ADR que lo
  revisó **una sesión de Claude leyendo código, no el agente `auditor-seguridad` ni una persona**, y
  que el propietario puede reabrirlo. Cola derivada: T-580, T-581, y las condiciones de §9 anotadas
  en T-345 y T-483.
- **#476 — T-332 y T-335.** La pantalla **«quién pagó y quién debe»** con los cuatro filtros de
  estado de cobro y **exportación a CSV**: el punto 4 del criterio de salida. **Es lo único de este
  lote que una agencia puede ver.**
- **#477 — T-346.** La prueba **en un navegador** de que un asesor no ve las cifras de otro ni las
  de la agencia, y de que pedir el `asesorId` ajeno responde **403**.

### Lo que este lote corrigió de la propia cola

**`T-334` figuraba como `ready` y era falso.** Su primer criterio exige las columnas de la **hoja
real del piloto**, que no está en el repositorio; el roadmap encabeza sus preguntas abiertas con
«antes de T-327, T-323 y **T-334**» y la última es justo esa hoja. Es el **punto 12 de los
pendientes del propietario**. El pendiente estaba bien anotado: **lo que mentía era la cola**.
`T-334` y `T-336` pasan a `blocked`; `T-335` se reapunta a `T-332`.

De ahí sale una comprobación barata que conviene repetir cada lote: **que ninguna tarea `ready`
dependa de una `blocked`**.

**`T-372` se cierra medida.** La madre anterior la dejó diciendo «no lo he verificado: que lo mida
quien la tome». Se midió: en la corrida `44934621499` **M17 y M21 salieron las dos rojas**, su
criterio exacto. Acertó en el fondo y en la forma: **marcar la sospecha como sospecha es lo que hizo
que alguien la midiera.**

### Tres cosas aprendidas que no son del producto

1. **Antes de llamar fuga a una guarda de tipos, mira el sitio de llamada.** Una hija reportó que
   `porAsesor` solo estaba protegido «por tipos» y que los adaptadores ignoran el parámetro. Suena a
   fuga; no lo es: el estrechamiento sale de `esAgenciaEntera`, que decide **en ejecución**. Bien
   clasificado como cola (T-580). Fiarse del informe en cualquiera de los dos sentidos habría errado.
2. **El cierre automático de tareas no cierra nada**, por cuarta vez consecutiva: T-340, T-332 y
   T-335 seguían abiertas en `main` después de integrar, con las ramas nombrándolas. Hay que mirar
   el `status` y cerrarlo a mano.
3. **Una herramienta que no se ha visto fallar no mide nada.** Lo encontró sola la sesión de T-346:
   su medidor de contraste dio «0 hallazgos» por no entender los colores `oklch()` de Tailwind. Lo
   detectó, lo arregló y escribió que *«un medidor que devuelve cero sin haberse visto fallar es la
   misma cobertura falsa que la de las pruebas de aislamiento»*. Con el medidor arreglado aparecieron
   los defectos reales (T-583).

### Supuesto, no verificado

- Que la pantalla de cobros se ve bien con datos de volumen: las capturas son de la demostración.
- Que el 403 del `asesorId` ajeno se comporta igual contra Postgres real: eso lo corre el CI, no la
  sesión. El rojo que sí se vio fue contra una API falsa mutada.

### Lo que NO hizo este lote

**Acercar una agencia.** Tres de las cuatro piezas son verdad del proceso y confianza. El cuello de
botella sigue siendo del propietario: el despliegue, la lista de chats de JD Tours y —nuevo— **la
muestra de su hoja de reservas**.

## 2026-11-21 (lote de la tarde-noche) — El manual destapa lo que ninguna prueba verde enseñaba

**Verificado** con `gh` y `git` en el mismo turno, cada PR con sus 14 checks comprobados **a mano** antes del
merge. `main`: `ef44c75e` → **`7a0ac374`**. Nueve PR integrados, en serie y con squash a mano.

- **#446 — T-555.** La comparación entre asesores sale ya contada de `porAsesor` (se retiran las N consultas y
  el tope de 12) y «Destinos» pasa a ventas del periodo, una fila por destino **y** moneda, sin sumarlas (R8).
- **#450 — T-556.** El modo demostración ya no enseña un error en «Hoy» donde debe haber datos de muestra.
  Auditoría de unidades: COP en pesos, USD en centavos, separadas por moneda.
- **#451 — T-549.** El filtro de «sin responsable» va **antes** del tope, por puertos y **sin JOIN entre
  contextos** (R4 intacta, sin ADR ni migración). La sesión declaró que **dos de sus pruebas pasaban en verde
  con el bug puesto** y las endureció hasta verlas fallar.
- **#454 — T-561.** Ver abajo: la premisa era falsa y el hallazgo real fue mejor.
- **#457 — T-560.** Conmutador de tema en las pantallas públicas y pruebas de **comportamiento** del anti-FOUC.
- **#453 — T-562, el manual de usuario**, pedido por el propietario. Dos recorridos, 15 capturas regenerables
  **con un comando**, y una página que dice sin adornos qué es maqueta.
- **#448 y #455** — el relevo de la orquestadora y la corrección de sus dos diagnósticos falsos.

### Lo que más valor dio no fue integrar, fue documentar

Escribir el manual obligó a recorrer el producto **como lo recorre una persona**, y ahí aparecieron tres huecos
que **ninguna prueba verde enseñaba**, porque las e2e hacen por API lo que la persona no puede hacer por pantalla:

- **T-563 (P1): no se puede aceptar una cotización desde la web.** Verificado: `cambiarEstadoCotizacionApi` solo
  se llama con `'ENVIADA'`. El paso «aceptar → abrir el archivo de viaje» es el corazón del producto, así que
  **el propietario no podría cerrar una venta delante de una agencia**. Y `04-flujos-criticos.md:49` lo declaraba
  **«Existe»**: documentación que miente, corregida en el mismo PR.
- **T-564:** no hay pantalla para corregir un pago, pese a que ADR-0034 reserva `cobro.corregir` al dueño.
- **T-565:** el ingreso afirma «Conectado a la API y PostgreSQL en vivo» **sin comprobar nada** (sale de una
  bandera), y además habla en técnico a un dueño de agencia.
- **T-566:** la demostración **solo sabe enseñar la vista del dueño**; el usuario de muestra no es asesor, que
  es lo que será la mayoría del equipo de una agencia real.

### Dos premisas falsas seguidas, las dos de la orquestadora

| Tarea | Lo que la madre afirmó | Lo que resultó ser |
|---|---|---|
| **T-560** | «El tema no se aplica al arrancar» | **Falso.** El anti-FOUC existe e inyecta con el nonce de la CSP |
| **T-561** | «Hay tokens bajo el umbral; ajustar luminancia» | **Falso.** Los 19 pares reales cumplen AA. El fallo eran **14 tonos usados sin declarar**: clase inerte, y en oscuro sobrevivía el color de claro. Un **botón destructivo a 2,34:1** |

**Las dos sesiones pararon antes de escribir código y lo midieron** —una con navegador y CSP real, otra
compilando el CSS con la Tailwind instalada—. Eso es consecuencia directa de pedir en cada encargo que **vean
fallar la prueba** y que **declaren si alguna pasó en verde con el fallo puesto**: una declaró **tres**, incluida
una que fallaba **por el motivo equivocado** y escondía justo el número que importaba.

**Regla que queda:** una tarea nacida de lo que alguien **ve** se escribe como **síntoma y pregunta**, nunca como
diagnóstico. El diagnóstico lo pone quien mide.

### Y lo que el propietario vio con sus propios ojos

Preguntó si se podían manejar los modos claro y oscuro, y dijo que «el toque de contraste negro hace que se
pierdan un poco los textos». **Las dos cosas resultaron ciertas por motivos distintos de los supuestos:** el
contraste fallaba por los tonos sin declarar, y los modos **ya existían** pero el conmutador es inencontrable
(T-572). Hicieron falta un manual, una sesión midiendo y **dos correcciones de la madre** para establecer dónde
está. Si no lo encuentra quien conoce el producto, una agencia tampoco.

**Corrección del propio turno, anotada antes de cerrarlo:** la madre escribió en el tablero que el medidor de
consumo «no se autorreporta para la propia sesión», tras verlo en `0` tres veces. **Falso: iba con retraso.** A
las 16:48 marcaba **457.098 tokens y 52,26 USD**, el triple del tope. Es la **cuarta** premisa falsa del turno y
la única sobre sí misma. La regla que queda: **un `0` es «aún no hay dato», nunca «tengo margen»**; sin cifra, se
releva por calendario al cerrar el lote.

**Supuesto, no verificado:** que las capturas del manual se vean bien en pantallas reales (son medición y
revisión visual, sin dispositivos); que `/ingresar` muestre el conmutador fuera de la compilación con
autenticación real. **Nada de esto está desplegado y ninguna agencia lo ha visto todavía.**

---

## 2026-11-21 (lote de la tarde) — Reportes por asesor y por destino, y tres cierres que mentían

**Verificado** con `gh` y `git` en el mismo turno. `main`: `47fb844e` → `cfae145c` → `a5e1fc44` → `2149b9db`.
Cuatro PR, en serie y con squash a mano.

- **#439** — relevo de la madre saliente. Solo documentación. Sus tres checks «cancelados» **se clasificaron
  antes de integrar**: no eran fallo ni prueba frágil, los mató `concurrency: cancel-in-progress: true` al
  entrar otro commit en la rama.
- **#440 — T-546 y T-538.** «Hoy» y «Mis números» pintan las cotizaciones abiertas por tramos de antigüedad y
  el saldo por cobrar por moneda, y una cifra truncada se presenta **como mínimo, no como total**. Se retiró de
  `inicio-logica.ts` el conteo sobre listas de agencia, el apaño que T-343 se negó a hacer.
- **#442** — cierra T-542 y T-548 tras verificarlas una por una, abre T-555 y manda T-553 a la bandeja.
- **#441 — T-531 y T-532.** El reporte de agencia trae las cifras **por asesor en una sola consulta** (antes era
  una por asesor, en lotes de cuatro, con tope de 12) y las **ventas del periodo por destino**.

### Las auditorías independientes (R13: en dinero no se recorta)

Las dos entregas de producto tocan dinero, así que la madre auditó el código, no el informe.

- **#440:** el dinero pasa por el formateador canónico, que entra por la rama de `unidades` y divide por
  `10 ** decimales` **según la moneda** —en COP no divide—, así que **no repite T-543**, el bug que pintaba cien
  veces de más. El contrato declara `saldo: Dinero`, hay una fila por moneda y nunca se suman (R8), y `null`
  omite el bloque en vez de pintar ceros.
- **#441:** `GROUP BY v.destino, v.moneda_iso` — las monedas nunca se suman. `porAsesor` y `ventasPorDestino`
  existen solo con alcance de agencia, con **tres guardas independientes**: el tipo `AlcanceDeAgenciaEntera`
  (un alcance propio no compila), la comprobación en ejecución y el contrato `strict`. Sin permiso de margen,
  sus columnas **ni entran en la consulta**: no hay valor que filtrar después.

### Lo que de verdad se aprendió

**«Una prueba que nadie ha visto fallar no es evidencia» volvió a pagar, y esta vez contra sí misma.** La sesión
de T-531/T-532 avisó por su cuenta de que su mutación de la mediana **pasó primero en verde**: cada asesor tenía
una sola conversación respondida, así que promedio, mediana y p90 coincidían. Endureció el caso (respuestas a
20/40/90 minutos) y la volvió a ver roja. Después mutó las dos e2e que reconocía no haber visto fallar: al quitar
el predicado de asesor, la respuesta `PROPIO` de una asesora pasó a traer **la suma suya y la de su compañero**
(`"unidades":"3600000"`). La prueba detecta la fuga. Ninguna de las dos hizo falta endurecerla.

**Tres tareas estaban integradas y el roadmap decía que no.** El cierre automático había fallado cuatro veces
seguidas, y la causa raíz (T-542) ya estaba arreglada por #437 y #438 sin que nadie lo hubiera comprobado. Se
verificó una por una en vez de marcarlas en bloque: T-542 y T-548 sí estaban hechas; **T-549 no**, y ahí estaba
lo serio — su rama llevaba su id porque un PR de *documentación* la registraba, no porque alguien la hubiera
hecho. De no haber estado roto el validador, ese merge la habría cerrado en falso.

**Defecto nuevo, verificado tres veces el mismo día:** una rama que nombra **dos** tareas solo cierra la primera,
porque `cerrar-tarea.mjs` captura un único id. Pasó con T-538 (rama de T-546), y con T-532 (rama de T-531). Las
dos se cerraron a mano. Mientras siga así, **cada rama con dos ids deja una tarea mintiendo, en silencio**.

### Supuesto, no verificado

Que las cuatro ramas con bugs puestos a propósito no entrañan riesgo real: no hay PR para ninguna y `main` está
protegido, pero el repositorio es público y **nadie ha podido borrarlas** (403 para la sesión, denegado por el
clasificador para la madre). Están en el punto 12 de la bandeja del propietario.

### Cola que deja el lote

**T-555** (mitad web de T-531/T-532, carril `b`, lista para repartir), **T-556** (el modo demo enseña un error
donde debería enseñar datos de muestra), **T-557** (ventas por destino sin tope) y **T-558** (decidir si «Hoy»
enseña al dueño lo suyo o lo de toda la agencia). Sigue abierta **T-553**, la raíz que queda: nada valida
`roadmap/tasks.yaml` en el CI **antes** del merge, y pide tocar `.github/`.

---

## 2026-11-21 (cierre de la tarde) — Un foco que robaba teclas, una compuerta reparada y el relevo de la madre

**Verificado** (`gh`/`git`, mismo turno): `main` de `d755ea69` a **`898ba390`**. Integrados: **#436** (T-548), **#437** (T-542 parcial) y **#438** (el triaje aplicado). **Once PR en todo el turno.** Abierto solo **#439**, este relevo.

**El hallazgo de la tarde empezó como un check en rojo que parecía ruido.** Una e2e de ingreso fallaba **2 de cada 3 veces**. La lectura cómoda era «prueba frágil, súbele el timeout». El encargo que se dio fue otro: *averigua por qué la fila nunca se revalida*, con una hipótesis de la madre —la caché— escrita encima.

**La hipótesis era falsa, y la sesión lo demostró en vez de obedecerla.** Se bajó el `trace.zip` de una corrida fallida: la lista **sí** se recargaba. Lo que fallaba es que el `PATCH` enviaba el apodo **viejo**, y el servidor guardaba lo que le llegaba. La causa: `useFocoModal` mueve el foco al primer enfocable 30 ms después de abrir **aunque el foco ya esté dentro**, y ahí el primero es el botón «Cerrar». Borrar un campo es seleccionar y pulsar Suprimir; si el temporizador cae en medio, **el Suprimir se lo come el botón**.

**Para una persona es el mismo defecto:** quien abra ese diálogo y empiece a escribir enseguida **pierde lo que escribe**. Llevaba meses así. Arreglo de cuatro líneas, dos pruebas que fallan sin él (comprobado con `stash`) y el job en verde **3 de 3** sobre el mismo sha — porque con algo que falla 2 de 3, una sola pasada verde no demuestra nada.

**T-542, la compuerta que marcaba tareas como hechas, tenía dos averías con el mismo síntoma.** Se separaron a propósito: la mecánica (18 tareas con `type`/`effort` fuera del enum) se arregló; la de criterio (20 tareas `in_progress`) se **propuso y no se aplicó**, porque cerrar como hecha una tarea que no lo está convierte el roadmap en ficción. La sesión confirmó, además, que **con solo la mitad mecánica el job seguía rojo** — justo lo que hacía falta para no cantar victoria.

**Al aplicar el triaje apareció lo que nadie veía.** Validar el fichero **entero, incluyendo claves repetidas** (que `yaml.safe_load` tolera quedándose con la última) destapó que **T-493 tenía `owner` duplicado con valores distintos**: el fichero la asignaba a `backend` cuando su título dice «**experto-turismo** valida la atribución de reportes». Una tarea cuyo sentido entero es criterio de dominio **apuntaba al agente equivocado, en silencio**. Y una de las duplicadas **la introdujo la propia madre** al aplicar el triaje; solo se vio porque esta vez se buscó a propósito.

**Dos enmiendas al triaje, ambas por el mismo motivo.** T-126 no se descarta: un job de CI comprueba que el flujo no se rompe, **no** que el producto se entienda, y el recorrido manual antes de la demo al piloto es justo lo que falta. T-372 no se cierra moviendo a otra tarea su criterio pendiente, que es que **el arnés de mutaciones de aislamiento nunca se ha ejecutado**.

**El relevo, y por qué importa más que cualquiera de los PR.** La madre llegó a **450 mil tokens y 47 USD**, el triple del tope. Vigiló el consumo de las siete sesiones hijas en cada vuelta y **el suyo una sola vez, al arrancar, cuando marcaba 0**. La anterior llegó a 688 mil por lo mismo: **dos de dos**. En el despertar de la madre entrante ese paso deja de ser el quinto y pasa a ser **el primero**, con las dos cifras al lado.

**Verificado y ya no supuesto:** el despertar propio funciona. `trig_01Cq7TrGZ9uGFc9uAmqQEDtr` disparó a las **14:15:28 UTC** directo en la madre, sin el relevo en dos saltos.

**Supuesto** (no verificado): que el job «Marcar la tarea como hecha» pase a verde ahora que `in_progress` está en cero. **Hay que comprobarlo en el primer merge**; si sigue rojo, hay una tercera causa que nadie ha visto.

**Lo que queda al propietario:** la lista de chats de JD Tours (sin ella **T-533 no arranca y no se conecta el número real**), borrar la rama de mutación, y **contestar el permiso de Bash que tiene parada a la sesión de T-531/T-532 desde las 13:49**.

---

## 2026-11-21 (cierre del lote de mediodía) — Dinero mal pintado, una compuerta de permisos y una mutación que midió el aislamiento

**Corrige y completa la entrada de abajo**, que se quedó corta: decía «integrados #427 y #428, abierto #430», y después entraron cuatro más.

**Verificado** (con `gh`/`git`, mismo turno): `main` pasa de `a177ce83` a **`d755ea69`**. **Siete PR integrados**, todos en serie y con squash a mano: **#427** (T-510), **#428** (T-528), **#430** (rastro), **#429** (T-520, T-521), **#433** (T-543, T-544), **#434** (T-548 y cierres) y **#432** (T-537, T-529). **#431 cerrado por sustitución.**

**Lo que más valió del lote no fue una funcionalidad: fue un defecto de R8 vivo.** `formatearDeltaDinero` formateaba unidades mínimas sin partirlas por los decimales, así que **toda moneda con decimales se pintaba cien veces de más**, con unos «,00» que le daban aire de exactitud. En COP acertaba por casualidad, porque allí la unidad mínima es el peso. Lo avisó de propina la sesión de T-520/T-521, lo verificó la madre leyendo el fuente, y lo arregló otra sesión con aritmética de `BigInt`. Es exactamente el error que `CLAUDE.md` dice que «ya llegó a la pantalla una vez» — seguía ahí.

**El criterio que ordenó el lote: una prueba que nadie ha visto fallar no es evidencia.** Se aplicó tres veces y las tres dieron algo distinto:
- **T-520**: con la tabla de monedas actual (0/2/2/2), un recorrido a secas **habría pasado en verde con el bug puesto**. La sesión añadió KWD durante la ejecución y vio la prueba ponerse roja. Evidencia.
- **T-543**: la sesión trajo el fallo literal con el código viejo — `expected '+ $ 125.050,00 USD' to be '+ $ 1.250,50 USD'`. Evidencia.
- **T-528**: ni su sesión ni la auditoría mutaron la e2e de aislamiento. **Hueco reconocido, no defecto**: es T-547.

**La mutación de T-529 y por qué su resultado no es el que parece.** Tras la auditoría se pidió **una vuelta más, solo por aislamiento entre agencias** (§3.1: el único sitio donde no se recorta), porque el e2e del endpoint nuevo no cruzaba agencias. La sesión fue más allá y **midió**: quitó el filtro de `tenant_id` y lanzó el CI. **`test` salió VERDE.** La lectura fácil —«la prueba no discrimina»— es **falsa**: significa que **RLS sola sigue cubriendo esa ruta**. Se derriba una capa y la otra aguanta; es R2 funcionando, y ahora está medido en vez de leído. Lo que **no** demuestra, y la propia sesión se negó a venderlo así: que la aserción cace una fuga, porque no hubo fuga que cazar.

**T-537, el hallazgo que casi bloquea #428, cerrado en el mismo día en que se abrió.** `porCobrar` se omite sin `cobro.ver`, y la omisión es real: el puerto **ni se invoca**, así que el dato nunca se lee de la base. Al auditarlo, lo que más se miró fue si el cambio de fixture aflojaba alguna prueba —habría sido lo peor que podía traer el PR—: no lo hace, y la discriminación **se añade**.

**Dos compuertas rotas, descubiertas por mirar un rojo en vez de encogerse de hombros.** **T-542**: el job «Marcar la tarea como hecha» falla tras *cada* merge y no lo veía nadie, porque corre después del merge y no está entre los checks obligatorios. **T-548**: una e2e de ingreso falla **2 de cada 3 veces**; el locator resuelve 24 veces sobre el mismo valor viejo, lo que apunta a que la fila nunca se revalida — si es eso, el defecto está en la web y la prueba tiene razón en fallar. Subida a P1. Ninguna de las dos la habría encontrado nadie leyendo código.

**Coste, que también es un resultado.** Cinco sesiones hijas: 164, 291, 161, 134 y **324 mil tokens** (esta última, **25,51 USD**). La más barata (0,80 USD) fue la de encargo más acotado: dos tareas del mismo fichero, con el defecto ya verificado y el criterio escrito. **Ninguna sesión ve su propio consumo**, así que el tope de 150 mil no es una norma que se cumpla sola: es trabajo de la madre en cada vuelta.

**Supuesto** (no verificado): que las e2e en paralelo aguanten sin 40P01; es la apuesta de T-510 y lo dirá el CI.

**Pendiente del propietario, nuevo:** queda publicada la rama `a/T-529-mutacion-aislamiento` **con el filtro de tenant retirado a propósito**. Sin PR y con `main` protegida no puede entrar sola, pero el repositorio es público. **El proxy deniega los borrados (403)** a las sesiones; está en la bandeja como punto 9.

**Cola que deja el lote:** T-537 a T-552 (dieciséis), de las que siguen abiertas T-538 a T-542, T-544 a T-552. **Siguiente id libre: T-553.**

---

## 2026-11-21 (cuarto lote) — Una apuesta medida en las pruebas, el alcance entre asesores y una compuerta que llevaba rota

**Verificado** (con `gh`/`git`, mismo turno): `main` pasa de `a177ce83` a **`aa38bdf9`**. Integrados en serie y a mano con squash: **#427** (**T-510 `done`**) y **#428** (**T-528 `done`**). Abierto queda **#430**, el rastro documental de este lote.

**T-510 — lo que se demostró y lo que no.** El 40P01 de `invitaciones` queda cerrado con log real del CI: un `TRUNCATE` lanzado desde el paquete `database` contra la limpieza de las e2e de la api; **dos paquetes**, y lo cerró #408. El de `historial-de-etapas` **no se demostró**: queda atribuido por mecanismo. El PR retira además la ejecución en serie que metió #415, que costaba ~65 s de mediana por PR sin evidencia detrás. **Matiz que añadió la madre al integrar, y que el PR no decía:** las 32 corridas limpias que cubren el criterio de «cinco seguidas» se midieron con la configuración **en serie**, justo la que el PR retira; en paralelo la evidencia es n=2 aquí más n=17 históricos. Es una apuesta medida, no una certeza, y la vuelta atrás es una línea (`fileParallelism: false`).

**T-528 — auditoría independiente, sin bloqueantes.** Es alcance entre asesores, así que llevó auditoría propia (R13). El aislamiento está bien hecho: el `asesorId` que llega del cliente pasa siempre por `alcanceDeReporte()` y sin `reportes.ver_agencia` responde **403**, no un recorte en silencio. El acierto estructural del PR es que la firma del puerto **no tiene valor por defecto**: olvidar el filtro ya no compila, y olvidarlo era devolver toda la agencia.

**El hallazgo que estuvo cerca de bloquear, y cómo se decidió.** El saldo por cobrar se sirve **sin exigir `cobro.ver`** mientras las pantallas de cobro sí lo exigen, lo que contradice el ADR-0035 §4 («nunca más amplio»). Se clasificó como cola —no bloqueante— **después de verificar** que no existe ningún endpoint para componer roles a medida, de modo que hoy ninguna agencia puede alcanzar ese estado. Queda como **T-537 (P1)** con la condición escrita: **el día que ese endpoint exista, deja de ser cola.** La lección de método es que la frontera entre «hoy roto» y «el día que…» (§3.1) se decide comprobando, no razonando.

**Hallazgo nuevo, T-542 (P1): una compuerta que llevaba tiempo sin correr.** El job «Marcar la tarea como hecha» **falla tras cada merge** (corrida 44904456823). No lo veía nadie porque corre *después* del merge y no está entre los 14 checks obligatorios. Dos causas distintas: **18 tareas** con `type`/`effort` fuera del enum de `tools/roadmap-mcp/roadmap.mjs` (mecánico) y **20 tareas `in_progress`** cuando el validador exige una (no mecánico: es criterio de producto, tarea del `dueno-de-producto`). **Mientras siga roto, cerrar una tarea es un acto manual y `roadmap/tasks.yaml` miente en cuanto alguien se olvida.** La madre no lo arregló a propósito: triar 20 tareas es justo el trabajo que no le toca.

**Operación.** Se corrigió una afirmación falsa del tablero: decía que la madre no puede crear su tarea programada porque el clasificador lo deniega. **Sí puede.** Ahora hay **una sola**, `trig_01Cq7TrGZ9uGFc9uAmqQEDtr`, apuntando directamente a la madre, en vez del relevo en dos saltos que despertaba a la sesión saliente de 688 mil tokens solo para reenviar un mensaje. La vieja ya no existía al ir a borrarla; **quién la borró no está verificado** y se anota como incógnita.

**Supuesto** (no verificado): que la configuración en paralelo de las e2e aguante sin 40P01 a medio plazo. Es la apuesta de T-510 y se sabrá por el CI.

**Coste.** Las dos sesiones hijas se archivaron tras entregar: T-510 en 164 mil tokens, **T-528 en 291 mil y 14,29 USD**. Ninguna de las dos avisa de su propio consumo: el tope de 150 mil **lo tiene que mirar la madre**, sesión por sesión.

**Cola que deja el lote:** T-537 (P1), T-538, T-539, T-540, T-541 y T-542 (P1). **Siguiente id libre: T-543.**

---

## 2026-11-21 (tercer lote) — Cobros en pantalla, catálogo de permisos y el coste de las pruebas en serie

**Verificado** (con `gh`/`git`, mismo turno): `main` en **`e16f5499`**, cero PR abiertos. Integrados en serie y a mano con squash: **#414** (relevo de la orquestadora y aviso al despertar en el tablero), **#416** (**T-505 `done`**: una prueba compara el `CHECK` `roles_permisos_del_catalogo` con `PERMISOS` en los dos sentidos; comprobado en el log del CI que corre contra Postgres real y que no es vacua), **#415** (T-510) y **#410** (**T-331 `done`**: registrar un pago y ver el saldo en el archivo de viaje).

**Lo que de verdad importó:** #410 llegó con los 14 checks en verde y **no era integrable**. La auditoría independiente —obligatoria por ser dinero en pantalla (R13)— encontró tres bloqueantes reales: el saldo a favor se pintaba **en negativo** bajo la etiqueta «Saldo a favor» y la confirmación decía **siempre** «Falta por cobrar»; la clave de idempotencia vivía en el diálogo, así que cerrarlo y reabrirlo tras un fallo de red **cobraba dos veces** al viajero; y un aviso afirmaba que la nota no se guarda cuando se guarda en claro en el historial inmutable. **Ningún check los habría visto**, porque la e2e evita el camino de sobrepago a propósito. Corregidos los tres con prueba de regresión. Cola abierta: **T-515..T-521**; el siguiente id libre es **T-522**.

**Hallazgo del día:** el `navegador` rojo de #410 **no era un bug**. La semilla vale $ 550.000 y la prueba pagaba $ 1.500.000 fijos; el servidor lo rechazó por sobrepago y el diálogo se quedó abierto *como debía*. Dos lecciones que valen más que el arreglo: una prueba de dinero no lleva cifras fijas, y un fallo de e2e debe leer el mensaje de la pantalla en vez de decir solo «seguía abierto». De paso quedó verificado el camino de sobrepago entero contra la API real.

**Supuesto / sin verificar:** **T-510 sigue `in_progress`** — exige cinco corridas de CI seguidas sin rojo y van **cero**, y los deadlocks 40P01 no se reprodujeron ni se cerraron. **Ninguna sesión puede levantar Postgres en local**: todo lo de «API real» lo validó el CI y lo visual salió de modo demostración. Nada desplegado.

**Medido, que nadie lo había medido:** la ejecución en serie de las e2e de `apps/api` sube el job `test` de **3m11s a 4m26s**, un 40% más en cada PR.

**Compuerta que no estaba apretada:** el tope de 150 mil tokens por sesión **no se cumple solo** — ninguna sesión recibe aviso de su consumo. La hija de T-331 acabó en **354 mil tokens y 31 USD**, y lo hizo notar ella misma. La madre tiene que consultar `get_session` → `context_usage` en cada vuelta del ciclo. Dato de coste comparado, del mismo turno: las dos sesiones Sonnet entregaron trabajo bueno por **0,74 y 0,67 USD**.

**Bloqueo del propietario (punto 8f):** tras el relevo, el despertar de 2 h sigue apuntando a la madre anterior. `create_trigger`, `update_trigger` y `send_message` a la madre anterior fueron denegados y **ninguno se rodeó**. Mitigación: aviso al despertar en la cabecera del tablero, en `main` y en la rama `claude/repository-status-d4ug6p`. Detalle: [bitácora](../_bitacora/2026-11-21-tercer-lote-cobros-permisos-y-pruebas.md).

**Trampa nueva:** el `scope` de commitlint es lista cerrada y **los nombres de los agentes no están en ella** (`datos`→`db`, `qa`→`test`, `backend`→`api`). Mató #411, #412 y un primer intento del tablero. Como `--force-with-lease` está denegado, obliga a recrear la rama. En [el tablero, §7](TABLERO-DEL-ORQUESTADOR.md).

## 2026-11-21 (segundo lote) — Alcance de vistas, permiso de reportes y pruebas sin carrera

Integrados #404 y #405 (ingreso con correo o usuario; sustituyen a #402 y #362), #406 (T-485), #407 (T-341, permiso `reportes.ver_agencia`, catálogo de 14 a 15) y #408 (T-503, las pruebas de la api esperan a las de la base). `main` en `44d8673`, cero PR abiertos. La llave del alcance de las vistas está aislada en `apps/web/src/lib/alcance-de-vista.ts`: T-342 solo cambia esa función. Cola nueva T-505 a T-511; resto de T-503 en T-510. Limitación que pesa: las sesiones no levantan Postgres en local, así que lo «probado en navegador» es contra API simulada. Detalle: [bitácora](../_bitacora/2026-11-21-segundo-lote-reportes-cobros-y-pruebas.md).

## 2026-11-21 (madrugada) — Lote de integración nocturno

**Verificado** (con `gh`/`git`): integrados #388, #358, #397, #393, #398, #401, #400 y #395; `main` en `c74b44d`. #401 sustituyó a #384, #386, #389, #390, #392, #399 y #396. Auditoría independiente de #358 y de #393 sin bloqueantes; la de #395 dejó un hallazgo en `completar` seguimiento.
**Abierto:** #402 (sustituto de #362), a la espera de «Carril y tarea» y de `override-lane` (propietario). #362 se cierra al integrar #402.
**Cola registrada:** T-494..T-504, más criterios nuevos en T-361 y T-490. Lo urgente es **T-503 (P1)**: tres pruebas de base comparten estado y fallan al azar (FK de etiquetas, deadlocks 40P01).
**Supuesto / sin verificar:** #402 a 390 px contra la API real; nada desplegado; la clave de la demo se da por perdida.
**Trampas nuevas:** en [el tablero, §7](TABLERO-DEL-ORQUESTADOR.md).

---

## 2026-11-21 — Ola 0 en marcha: navegación móvil, etiquetas, base de pagos y operación desatendida

**Decisiones del propietario**
- Operación desatendida hasta terminar el CRM (no solo el MVP): [roadmap maestro](../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) (olas 0 a 4) y una tarea programada que despierta a la sesión madre cada dos horas. El orquestador queda autorizado a aprobar e integrar (también rutas protegidas, con auditoría hecha y CI verde). No alcanza a paneles, claves, `override-lane`, ni a nada del propietario: está en [`PENDIENTES-DEL-PROPIETARIO.md`](PENDIENTES-DEL-PROPIETARIO.md).
- Navegación: menú D1 a D4 (D3 reemplazada por reportes por niveles de acceso), barra móvil variante B (Hoy · Conversaciones · Cotizar · Archivos de viaje · Más, lupa fija), ADR-0032 aceptado, ADR-0031 (ingreso por apodo) aceptado.
- **El CRM se usa desde celular, tablet y navegador de escritorio** (aclarado hoy): la auditoría responsiva cubre las tres familias de ancho. Pendiente ampliar el criterio de salida 9 del roadmap de JD Tours, que aún dice «móvil 390 px».
- Sesión dedicada a analizar y rediseñar la interfaz y la experiencia de usuario (Fase 1 análisis sin código; Fase 2 con OK del orquestador).
- ADR-0034 (pagos del viajero, registro manual): integrado como *Propuesto* y tratado como aceptado tras dos revisiones (seguridad y turismo). Decididos: solo el dueño devuelve, ajusta, penaliza y reversa (`cobro.corregir`); el asesor solo registra el pago; plazo de cobro por agencia (30 por defecto); medios de pago ampliados; orden de la idempotencia escrito.

**Verificado** (con `gh`, CI en verde en cada PR)
- Integrados en `main`: guarda de segunda agencia (#363), barra móvil (#368), cotizar completo desde el celular (#369), la URL como estado (#371), paleta con la misma fuente que cada pantalla (#374), etiquetas por agencia: migración con RLS (#372), API (#379) y chips en la bandeja (#381), ADR-0034 (#378), libro de cobro `pagos` con permisos `cobro.*` (#382) y las etiquetas de esos permisos en la web (#383), más los PR de docs de cada lote.
- #382: `aislamiento-tenants` verde; fue la primera ejecución real de la migración `20261121140000`.
- Auditorías de seguridad sin bloqueantes en #363, #372, #379 y #382 (una de la sesión de trabajo y una independiente del orquestador en cada una; las de #372 y #382 fueron por lectura de código, la confirmación la dio el CI).

**Pendiente**
- Abiertos al escribir esto: #358 y #362 (ingreso por apodo), esperando `override-lane` del propietario; #385 (T-322), #387 (quita una unión temporal de tipos) y PR de docs.
- Cola nueva: T-330 (API de pagos, con las reglas por estado y la carrera registrar-pago contra cancelar-archivo), T-339 a T-346 (reportes por nivel), T-322 y los puntos menores de cada auditoría en `roadmap/tasks.yaml`.
- Propietario: secretos de Render y `DIRECT_URL`, proyecto de Vercel, `override-lane`, `navegador` como check obligatorio (contenido en el commit `27412e7`), autonomía de la sesión de cobros, decisión de coexistencia (ADR-0033) y pasarela.
- **Sin verificar:** que `AP14` salga omitida en `test` y corra en `aislamiento-tenants` (una pasada verde no descarta la intermitencia); la pantalla de etiquetas y de cotizar contra la API real fuera del CI; nada de esto está desplegado.

**Trampas nuevas**
- Con `strict` en la protección de `main`, cada integración deja `behind` a los demás PR: web y rutas protegidas se integran de una en una, con «ventana» pedida al orquestador, y los PR de docs con auto-merge los atrasan (se les quita el auto-merge mientras dura la ventana).
- `AP14` vacía `tenants`: no puede correr junto a los e2e de la API; se omite cuando `npm_lifecycle_event` es `test` (si reaparece roja, la salida es sacar `aislamiento.spec` del job `test`, y toca `ci.yml`).
- «Carril y tarea» rojo cuando un PR mezcla carriles; la etiqueta `override-lane` la pone solo el propietario. Se evita partiendo el cambio (caso de `permisos.ts`: unión temporal de tipos y luego limpieza).
- Un auditor puede leer el SQL pero no ejecutarlo: «integrable» por lectura no sustituye al job `aislamiento-tenants`.

---

## 2026-11-20 (tarde) — T-268 integrada: base del registro de agencias

**Verificado** (con `gh`)
- PR #323 integrado (`0f3a707`), 15 checks en verde. La migración `20261120140000` aplicó en Postgres 16 y `aislamiento.spec.ts` pasó 158/158 (bloque R-1 a R-10, incluidas S1 y las altas simultáneas).
- Auditoría de seguridad en dos pasadas, sin fugas entre agencias. Bloqueantes corregidos: B1 (orden del literal de `excepciones_rls`), B2 (otra sesión había integrado `perfiles_de_agencia`; T-268 pasó a extenderla y reemplazar su disparador) y B3 (tipos sin calificar en `crear_agencia` frente a `pg_temp`, con aserción en la migración y prueba R-10).

**Pendiente**
- Cola: T-306 (mismo patrón de `pg_temp` en otras 15 funciones y `REVOKE TEMPORARY`), T-308 (`createrole_self_grant` en Neon antes del primer despliegue), T-309 (cifrado del NIT), T-310 (prefijo `fixture-`), T-311 (alinear ADR-0030 §3.3), T-312 (tope por hora atómico).
- Siguen T-269 y T-273; el registro no abre hasta tener API (T-270) y web.
- Propietario: pidió revisar la navegación de la web («no me cuadra»); auditoría de navegación en curso, su informe irá a la carpeta de auditorías.

**Trampas nuevas**
- Dos sesiones pueden crear la misma tabla en migraciones distintas: antes de empezar una migración, `git fetch` y leer las migraciones nuevas de `main`.
- El orden del literal de `excepciones_rls` es el de `ORDER BY tabla, rol` (`acc` va antes que `ace`).
- Los ids de tarea también chocan entre sesiones (T-307): comprobar el máximo en `main` antes de numerar.

---

## 2026-11-20 — Web creíble, registro de agencias decidido, MCP y despliegue en espera, y `docs/` ordenada

**Decisiones del propietario**
- ADR-0030 (registro autoservicio) aceptado con P1–P7: 14 días de prueba; durante el piloto, registro con código de acceso; textos legales por abogado y el propietario; solo Colombia y COP; 5 miembros, 1 canal, sin IA; la plataforma conecta a mano el WhatsApp de las agencias piloto; avisos a su correo por variable de entorno.
- Skills `diseno-web` (propia) y `frontend-design` (Anthropic, Apache 2.0, base de la anterior) más el MCP de 21st.dev. MCP de Neon, Render y Vercel para que la sesión de despliegue termine la demo; las claves viven en el entorno, nunca en el repo.
- Reorganizar `docs/` sin dañar lo que hay: primero un comprobador de enlaces, luego mover solo lo de riesgo bajo. Sin agrupar la bitácora por año (rompería el hook de arranque).
- Autorización vigente (2026-11-17): aprobar e integrar PR, incluidas rutas protegidas, tras auditoría y CI en verde. No alcanza paneles de Neon, Render, Vercel y 21st.dev, claves, WhatsApp real desde celular, ni borrar ramas ajenas.

**Verificado** (con `gh`/`git`)
- Integrados con CI en verde: #301–#303 (despachador, historial de estados, reserva atada a su archivo), #304–#308 (skills, credibilidad de la demo, solicitud de viaje, MCP), #309 (propuesta al viajero, sesión aparte), #310 y #312 (ADR-0030 y arreglo de H6), #314 (sistema visual y enlaces), #315 (tope de 10 fallos del código por correo, en Postgres), #316–#319 (reorganización de `docs/`).
- `main` en `9662e04`; 155 tareas `done`; 47 migraciones.
- La sesión de despliegue confirmó que los MCP de Neon, Render, Vercel y 21st conectan; en Neon existe `viajapro-staging` con 32 de 47 migraciones y faltan 3 roles; **no existe** servicio en Render ni proyecto en Vercel.

**Supuesto, sin verificar**
- Nada de ViajaPro está desplegado. La opción C (long-polling a Render a través de Vercel) está sin probar.
- Reservas, campana y las pantallas nuevas no se han visto contra la API real en un navegador.
- Las pruebas de base de T-300 corren solo en el CI.

**Pendiente**
- Propietario: decisiones a la sesión de despliegue (contraseñas de rol, `API_TRUST_PROXY`), secretos del entorno y de GitHub Actions, `CAMPOS_SENSIBLES_KEY` con copia fuera de Render, rotar la clave de 21st.dev pegada en el chat, mensaje real de WhatsApp desde celular, T-080, textos legales con abogado.
- Cola: T-268 (migración del registro, ruta protegida), T-269/T-273, T-281 (precondición para abrir el registro sin código), T-283, T-301 y T-303; salidas en el cotizador (punto 6 de la auditoría UX); encabezado de conversación en móvil; referencias muertas a los documentos FLUJO y CICLO (que ya no existen) en comentarios de `.github/` y `scripts/` (T-304).

**Trampas nuevas**
- mover la carpeta de traspaso a `docs/_traspasos` anida la carpeta si el destino ya existe: comprobar con `ls`.
- Alcance de commit `datos` no existe (usar `db`); `ia` tampoco (usar `mcp`); el asunto no puede empezar en mayúscula.
- Tras un squash, la rama de trabajo se rehace desde `origin/main`; no hay force-push.

---

## 2026-11-17 (noche) — Permisos del archivo, avisos de plazo y campana

**Verificado (gh/git, CI en verde en cada PR)**
- #295 (1c71e0f): `archivo.ver` / `archivo.operar` (migración 20261118100000); la auditoría pidió
  `archivo.ver` también en las mutaciones (devuelven el detalle con menores): corregido en el PR.
- #296 (64ad344): vigilancia de los dos plazos (T-244). Corregido en el PR: la edición del asesor ya
  no pisa una marca de aviso recién ganada (R5), lote 50, filtro afinado, prueba de outbox cruzado.
- #297 (15a2587): permisos en la web de Reservas (T-252) + `DESPACHO_BARRIDO=inerte` en las e2e:
  el barrido de arranque de otro archivo e2e entregaba eventos de fixtures ajenos.
- #298 (79e5536): notificaciones en la aplicación (T-254, migración 20261118110000, tabla sin
  columnas de texto, RLS y FK compuestas). Sin `archivo.ver` no se listan.
- #299 (51f59d4): campana con los avisos (T-255). El CI cazó un EXPLAIN inestable en
  `historial-de-estados-cotizacion.spec.ts` (estadísticas viejas): ANALYZE antes del EXPLAIN.
- Cola nueva: T-253 (función de descubrimiento de plazos), T-256 (FK reserva-archivo en
  notificaciones), parte externa de T-254 (WhatsApp/correo con plantilla y opt-in).

**Decisiones por delegación**
- Aprobé las migraciones 20261118100000 y 20261118110000 (ruta protegida) tras auditoría sin
  bloqueantes y CI en verde.
- Destinatario del aviso: el asesor de la oportunidad si puede operar archivos; si no, todos los que
  tienen `archivo.operar`.

**Supuesto / sin probar**
- Nada desplegado. Ni Reservas ni la campana se han visto contra la API real en un navegador.

---

## 2026-11-17 (tarde) — Archivo de viaje de punta a punta y demo sin dominio

**Verificado (gh/git, CI en verde en cada PR)**
- #289 (5ec0b37): opción C, la demo sin dominio. La web en `*.vercel.app` reescribe `/api/v1` y el
  socket (long-polling) a Render. Variables: Vercel sin `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` =
  Render; Render `WEB_PUBLIC_URL` = vercel, `API_PUBLIC_URL` = Render, `API_TRUST_PROXY=1`.
- #290 (75f396a): `CotizacionAceptada` por outbox + despachador por consumidor en `AppModule`
  (descubre agencias con `tenants_con_eventos_por_entregar`, entrega bajo `conTenant`, idempotente por
  `entregas_de_eventos`, abandona a los 10 intentos) → abre el TravelFile con número de file.
- #291 (31b8eb1): el cotizador congela el mayorista por línea y la TRM declarada en la versión.
  El CI cazó un orden esperado mal escrito en el e2e, no un defecto.
- #292 (2167a2a): API `/api/v1/archivos` (estados de reserva, pasajeros, cancelación) y neto solo con
  permiso (T-242, T-248). T-241 done.
- #293 (68c3c38): pantalla Reservas en `/viajes` con datos reales (T-243).
- Auditorías de seguridad de #290 y #292: **sin bloqueantes**; los huecos de prueba de aislamiento
  de #290 se cerraron en el mismo PR. Cola: T-247, T-249, T-250, T-251, T-252.

**Decisión por delegación**
- Mutaciones de reservas con `cotizacion.escribir` mientras no existan `archivo.ver` /
  `archivo.operar` (T-249, migración de `datos`). Efecto: OPERACIONES aún no opera reservas.

**Supuesto / sin probar**
- Nada desplegado todavía (el propietario configura los paneles). La pantalla Reservas no se ha visto
  contra la API real en navegador. La opción C no se ha probado contra Vercel real.
- Los agentes en worktree no pueden levantar Postgres local (permiso denegado); el e2e lo valida el CI.

---

## 2026-11-17 — Auditoría competitiva, despliegue elegido y decisiones delegadas

**Decisiones del propietario (literales)**
- «Sí, prepara Neon, Vercel y Render»: staging en Neon + web en Vercel + API en un solo proceso en
  Render (modo único, sin Redis). ADR-0028, integrado en #283.
- «tu tienes autorizacion mia para aprobar y destrabar los temas pendientes como si fuera yo».
  Alcance aplicado: aprobar e integrar PR de Dependabot en verde, cerrar los que no conviene,
  registrar decisiones de producto. NO alcanza lo que requiere sus manos o cuentas: paneles de
  Neon/Vercel/Render, claves, mensaje real desde un celular, demos de la competencia.

**Decisiones tomadas por delegación (2026-11-17)**
- D1: **el foco sigue siendo la agencia minorista que revende (S1)**. Se tomó primero «S3 entra»
  leyendo las pasadías con fecha del catálogo como salidas propias; era un error: el propietario
  ya había dicho que la agencia piloto «revende, no opera» (`docs/01-producto/11-dictamen-del-
  catalogo-real.md`) y esas fechas son del tarifario del mayorista. El cupo sigue informativo
  (ADR-0009). El cupo propio queda diseñado como ADR-0029 **Propuesto**, para cuando llegue una
  agencia que opere salidas propias.
- D2: ViajaPro exporta al ERP y no emite factura electrónica. ADR-0023 sigue Propuesto: juicio
  fiscal pendiente del contador del propietario; fuentes DIAN sin verificar.
- D3: la pasarela de pagos local se elige en la Fase 2, tras investigar costos.
- D5: Neon + Vercel + Render (ADR-0028).
- ADR-0024 (archivo de viaje, time limit, TRM congelada) se adopta como dirección de la Fase 1:
  es justo lo que necesita quien revende (el time limit del mayorista es su riesgo diario).

**Verificado (gh/git)**
- Auditoría competitiva en `docs/_auditorias/2026-11-16-*` (#281); página publicada para el
  propietario. Veredicto: ~40 % de lo imprescindible para S1+S3.
- Integrados: #283 (ADR-0028, `render.yaml` de un servicio, `apps/web/vercel.json`,
  `deploy-staging.yml`, guía `docs/07-ingenieria/despliegue-neon-vercel-render.md`), y los
  Dependabot #265, #257, #255 y #13 (aprobados por delegación).
- Cerrados con comentario: #259 (Prisma 7), #261 (Nest 12), #262 (pnpm 12) → T-238; #260
  (@types/node 26, el proyecto es Node 22); #282 (su cambio va en #283).
- Cola nueva: T-238 (saltos mayores y zod 4), T-239 (lo que ADR-0028 deja abierto antes de
  producción).

**Supuesto (no verificado)**
- Nada desplegado todavía: la configuración no se ha ejecutado contra Neon, Vercel ni Render.
- Precios de la competencia y costos de hosting sin verificar en páginas oficiales.

**Pendiente del propietario**
- Seguir la guía de despliegue (dominio, Neon, Render, Vercel, GitHub, DNS) y guardar copia de
  `CAMPOS_SENSIBLES_KEY` fuera de Render.
- Mensaje real desde un celular (T-080); demos de competidores (D4); contador para ADR-0023.

**Trampas nuevas**
- Los PR de Dependabot exigen la revisión del propietario del código (CODEOWNERS): con la
  delegación se aprueban desde la sesión, que actúa con su cuenta.
- La sonda continua de Render debe ser `/salud` (no toca la base): con `/salud/listo` Neon nunca
  se suspende y un corte de Neon reinicia la API.

## 2026-11-15 — Auditoría integral, MVP en navegador y cifrado de PII

**Decisiones del propietario**
- Corregir toda la auditoría integral y después seguir el roadmap hasta un MVP demostrable.
- Modo de trabajo: «intégralo cuando esté en verde y sigue» (merge de PR propios con CI en verde).
- Autorizó resolver los pendientes, incluida la aceptación de ADR que no dependan de decisiones suyas.

**Verificado (gh/git)**
- Auditoría integral 2026-11-15 (`docs/_auditorias/2026-11-15-auditoria-integral.md`) y plan
  (`docs/08-roadmap/02-plan-correccion-auditoria-2026-11-15.md`); cola T-175..T-227.
- Integrados en `main`: #256 (37 correcciones), #263 (suite de navegador T-196, observabilidad
  T-203, T-190/T-221/T-222), #264 (cifrado de PII en reposo, ADR-0015, T-212, con auditoría de
  seguridad). El job `navegador` del CI ejecuta el flujo H1–H6 contra la API real.
- La suite de navegador encontró defectos reales que ninguna prueba unitaria veía: el modal de
  guardado ignoraba título y contacto (cotización a nombre de otro cliente) y guardar con la API
  real usaba la acomodación de la maqueta. Corregidos.
- ADR-0018, 0019, 0022 y 0025 aceptados; 0023 y 0024 propuestos.

**Cierre del lote (añadido; `main` en `5c6e247`)**

Verificado (gh/git):
- Integrados #266 (`02d1e07`: demo cifrada T-225; la suite de navegador T-196 responde desde la
  bandeja y envía cotización contra Graph falsa), #267 (`8b4c070`: deps T-220, audit de producción
  3 críticas/15 altas a 0/1, T-224, T-226a, T-227, ADR-0022 y 0025, hooks del cerebro), #268
  (`46e88a6`: `medir_cola_de_salida` con dueño NOLOGIN `viajapro_metricas` y `motivos_de_perdida`;
  auditoría de seguridad: integrable; migraciones en verde en el CI) y #269 (`5c6e247`: vista previa
  honesta, consultas desde hoy, T-228).
- Defecto real hallado por la suite: la bandeja nunca ofrecía cotizaciones con la API real (la ficha
  de CRM las trae vacías por R4); ahora las pide a `quoting`.
- Vitest 4 rompió 40 e2e: `import(variable)` relativo se resuelve contra la raíz de Vite; usar
  `new URL(ruta, import.meta.url).href`.
- Cola nueva: T-229 (API/UI de motivos), T-230 (endurecer función y disparador), T-231 (ADR-0008/R2
  con el rol nuevo). T-228 `done`. T-214 y T-226 (b, c) siguen `in_progress`.
- Entrada: `docs/_bitacora/2026-11-15-mvp-en-navegador-y-cierre-de-auditoria.md`.

Supuesto (no verificado): nada está desplegado; WhatsApp solo se probó contra una Graph falsa; las
fuentes de la DIAN del ADR-0023 no se verificaron.

**Segundo cierre (añadido; `main` en `e46ee11`)**

Verificado (gh/git; todos con el CI en verde, 13-14 checks):
- #270 (`73d8f80`): ESTADO, bitácora y diario del primer cierre.
- #271 (`2252fd0`): T-229 motivos de pérdida por agencia: contrato, API, pantalla y migración
  `20261115190000` (el disparador respeta el `motivo_perdida_id` escrito). Regla: todo lo guardado
  como OTRO, también un motivo propio, exige nota (el contrato `Oportunidad` lo rechaza sin ella).
- #272 (`e52e78b`): T-230/T-232 (migración `20261115200000`: VP001 al asignar un motivo
  desactivado, CHECK de que OTRO exige nota, pruebas de superficie y restauración de contexto) y
  T-231 (ADR-0026 + R2).
- #273 (`26aa5d1`): T-226 (b) abortar al arrancar si hay `*_clave_version` sin clave; T-233
  (migración `20261115210000`, solo comprobaciones).
- #274 (`e46ee11`): T-234, la comprobación corre en `onModuleInit` de la raíz y todo lo que toma
  trabajo arranca en `onApplicationBootstrap`.
- Cada lote que tocó aislamiento o cifrado pasó por `auditor-seguridad` (integrable en todos);
  lo que no se corrigió en la vuelta fue a la cola (T-232..T-235).
- Cola de código restante: T-235 (P3), T-226 (c) (solo con una clave real que rotar).

**Revisión de PR abiertos (añadido 2026-11-16; `main` en `a7fb3d5`)**

Verificado (gh/git):
- #276 (`8e12896`) rescata del #29 `CAMPOS_SENSIBLES_KEY_PREVIOUS` en `render.yaml` y la guía de
  staging; #29 y #107 cerrados con comentario (obsoletos).
- #234 rehecho sobre main en #277 (`e4eb9b3`): rol `viajapro_ajustes` con permisos de columna,
  función `actualizar_zona_horaria_de_la_agencia`, ADR-0027 y R2; #234 cerrado. Endpoint en #278
  (`db8c875`, `usuarios.administrar`) y pantalla en #279 (`a7fb3d5`).
- Dependabot en verde (#265, #257, #255, #13): no se pueden integrar sin la revisión del
  propietario (CODEOWNERS: «Waiting on code owner review»). Los saltos mayores (#259 Prisma 7,
  #261 Nest 12, #262 pnpm 12, #260 @types/node 26) están en rojo y esperan su decisión.
- Cola: T-237 (Z5 con NULL, comentarios de `policies/002`, 403 por HTTP).

**Pendiente (no darlo por hecho)**
- Del propietario: aprobar los cuatro Dependabot en verde y decidir los saltos mayores; `CAMPOS_SENSIBLES_KEY` en Render y copia de la clave; `STAGING_DESPLIEGUE`;
  Meta real (T-080); decidir zod 4; ADR-0023/0024.

**Trampas nuevas**
- Los PR de Dependabot exigen la revisión del propietario del código; los del propio dueño no.
- `expectedHeadSha` del merge exige el SHA completo y real: no reconstruirlo a partir de un prefijo.
- Tras un squash-merge, la rama remota diverge de `main`: el force-push lo deniega el
  clasificador. Se hace `git merge origin/<rama>` (contenido idéntico) y push normal.
- Commitlint: el alcance `datos` no existe; para la base es `db`.
- Un commit que falla en lint-staged restaura el árbol: con agentes trabajando en paralelo puede
  borrar su trabajo. Pasar lint antes de commitear y nunca usar `git stash` con agentes activos.
- Desde el cifrado, la búsqueda de la bandeja solo mira nombre y teléfono, y la semilla SQL no
  puede escribir texto: la demo se siembra con `demo:sembrar-cifrada`.
- Un saliente pasa a ENVIADO con el webhook de estado `sent` de Meta, no con la respuesta de la
  Graph: las pruebas con Graph falsa deben simularlo.
- Postgres no arranca en las sesiones en la nube: migraciones, e2e y aislamiento solo se
  verifican en el CI.

---

## 2026-11-05 — Campaña funcional en Codespaces y cerebro persistente

**Decisiones del propietario**
- Sin gasto de alojamiento hasta que el flujo de punta a punta funcione; se prueba en Codespaces
  (`pnpm dev:nube`, puertos 3000 y 3333 públicos mientras se prueba).
- Antigravity no está habilitado: un agente `frontend` de Claude hace su papel (carril `b/`).
- Congelado hasta cerrar H1–H6: multiidioma (T-152..T-172) y reportes avanzados. Primero la campaña
  funcional T-126; riesgo de mercado añadido; revisión externa de RLS antes de datos reales.
- La primera demo a JD Tours la ve **el dueño** (agencia pequeña): vista gerencial además de bandeja
  y cotizador. La verificación de negocio con Meta (T-080) la lleva el propietario.
- PRs grandes por carril y tanda (lotes); migraciones y aislamiento van aparte.
- Contexto persistente en archivos, no en la memoria del modelo. Estructura y marco de trabajo en `MARCO.md` (se inyecta al iniciar).

**Verificado**
- H-2 (la API devolvía cuerpo JSON vacío salvo en importaciones) → PR #248, en `main`.
- H-1 (la raíz abría sin login y con datos inventados) → PR #249, dentro del lote #250.
- Pendiente de integrar al 2026-11-05: #250 (lote web 1), #244 (retrospectiva), #234 (función de zona
  horaria, migración). #245 (hallazgos) ya entró. El PR #251 (`cerrar-tarea`) se integró y dejó
  T-126 como `done` **por error**.

**Pendiente (no darlo por hecho)**
- Corregir T-126 a `in_progress` con un PR de documentos (usar `T-000` en el nombre de la rama).
- Registrar H-1..H-4 en `docs/_bitacora/hallazgos-funcionales-2026-11-05.md` y H-3 (hidratación
  en `/ingresar`) y H-4 (`/login` da 404) en `roadmap/tasks.yaml`.
- Tras integrar #250: `git pull` y reiniciar `pnpm dev:nube` en el Codespace; retomar el recorrido
  login → bandeja → WhatsApp → contacto/oportunidad → cotizar → enviar → reportes.
- Después de #234: backend implementa `PATCH /api/v1/agencia/ajustes`.
- Fijar Node 22.20 en `.devcontainer` (ruta protegida).

**Trampas nuevas**
- Una rama con `T-126` en el nombre dispara `cerrar-tarea` al integrarse y cierra la tarea. Usar `T-000`.
- La mezcla de carriles en un PR la rechaza el check «Carril y tarea».
- Alcance `bitacora` no existe en commitlint; usar `hilo`.
- Registrar el middleware de Nest con un nombre `jsonParser` hace que Nest omita su parser global.

## 2026-11-21 · T-343: la web lee `alcance`
Se retira el conmutador Vista Dueño/Asesor; la vista la decide la respuesta de la API. «Mis números» (390 px, tarjetas) para quien solo ve lo suyo. Decisión: **no se filtran listas de agencia en el cliente** para fingir «lo tuyo»; cotizaciones abiertas y cobros por cobrar del asesor quedan para la API (T-528). Detalle: [bitácora](../_bitacora/2026-11-21-mis-numeros-y-retirada-del-conmutador.md).

## 2026-11-21 · T-562: manual de usuario con capturas
`docs/06-manual/`: recorrido del asesor, recorrido del dueño, lo que no cubre y cómo regenerar las capturas. 15 imágenes que genera `docs/06-manual/capturas.mjs` de una pasada, contra `next build` + `next start` (no `dev`). Todo en modo demostración. Al documentar el recorrido completo aparecieron defectos reales: la web no puede aceptar una cotización (T-563, P1) ni corregir un pago (T-564), y salieron T-565 a T-568 (cartel del ingreso, demo sin vista de asesor, datos de muestra incoherentes, campos personalizados sin cifrado). Capturas regeneradas tras T-561 y T-560. Se corrigió `docs/01-producto/04-flujos-criticos.md` paso 7, que decía «Existe».

**Trampas nuevas**
- La web necesita `packages/contracts` y `packages/domain` compilados antes de arrancar.
- Con `NEXT_PUBLIC_USE_REAL_AUTH=true` el modo demostración no entra: la foto del ingreso exige otra compilación.
- `/ingresar` afirma «Conectado a la API y PostgreSQL en vivo» solo por la configuración; no comprueba nada.

## 2026-11-21 · El lote que deja la demostración en condiciones de enseñarse
`main` de `7a0ac374` a `910c04f0`, **siete PR integrados y cero abiertos**. Las tres piezas que impedían enseñar el producto están en `main`: **T-563** (aceptar una cotización desde la pantalla), **T-566** (ver la demostración como un asesor puro) y **T-565** (el ingreso deja de afirmar una conexión que nunca comprobó). Lo más valioso del lote, sin embargo, fue **#463: la reconciliación de las 74 tareas P1**, que dejó **17**. Ocho ya estaban hechas en el código y 49 estaban mal priorizadas. Detalle: [bitácora](../_bitacora/2026-11-21-lote-de-la-tarde-demo-ensenable.md).

**Decisiones**
- **T-377 sube de P3 a P1**: el arnés de mutaciones de aislamiento **no corre en el CI**. §3.1 no admite recortar en aislamiento entre agencias; una compuerta que no se ejecuta no es una compuerta.
- **T-574 (P1)**: las **14 tareas P0 abiertas nunca se contrastaron contra el código**; T-131 y T-132 parecen hechas. La reconciliación solo cubrió las P1.
- **T-566 no deshace T-343.** T-343 retiró el conmutador Dueño/Asesor porque la vista la decide la API y no se finge el alcance en el cliente. El de T-566 vive **solo en modo demostración**, no toca sesión ni API ni `tienePermiso`, y su predicado de permisos **solo quita** entradas del menú. Queda escrito para que no se lea como marcha atrás.
- **Las tareas se escriben como síntoma, no como diagnóstico** — otra vez. La madre repartió sospechando que T-137, T-139 y T-140 estaban hechas porque sus contratos existen; la sesión midió y las desmintió a medias. **Quien mide es quien diagnostica.**

**Trampas nuevas**
- **El cierre automático de tareas compite con todo el carril `i`**: provocó un conflicto en #463, tumbó un merge de #464 («Base branch was modified») y dejó #465 detrás dos veces. La ventana segura para tocar `tasks.yaml` es cuando no hay ningún otro PR de carril `i` abierto.
- Un conflicto de `tasks.yaml` **se devuelve a quien hizo el trabajo**: tomar `origin/main` como base y reaplicar **tarea por tarea**. Concatenar ya entremezcló entradas una vez y el YAML parseaba igual.
- **Hay criterios de aceptación que cruzan carriles por su cuenta** (T-565 y T-566 pedían tocar `docs/06-manual/` desde una tarea de `apps/web`). Avisar al repartir; el rastro va aparte (T-576).
- El **sha truncado** de un monitor propio usado en `update-branch` da 422: leerlo entero con `--jq '.head.sha'`.
- Un monitor que imprime el estado **cada vuelta** inunda de notificaciones: emitir solo al cambiar.
- **2026-11-21 · T-574**: las 14 P0 abiertas se contrastaron contra el código. 5 ya estaban hechas (T-120, T-121, T-123, T-131, T-132; la hipótesis de T-131/T-132 se confirmó), 5 bajaron (T-133, T-134, T-135, T-136 a P2; T-081 a P1) y 4 siguen P0 (T-079, T-080, T-093, T-126). El título de T-136 era falso. Detalle: [bitácora](../_bitacora/2026-11-21-reconciliacion-de-las-p0-abiertas.md).
- **2026-11-21 · T-377**: el arnés de mutaciones de aislamiento ya corre, **en todo PR**, cada noche y a demanda. Su **primera ejecución en la vida** destapó que tampoco corría entero: moría en M22 y **M23 y M24 nunca se ejecutaban** — una mutación rota escondía a todas las posteriores. Corregido con cuatro estados por mutación. **La medición desmintió al diseño**: 43 s, no «minutos», así que se le quitó el filtro de rutas y ya puede ser check obligatorio (T-577). **M24 pone P-7 en rojo**: la fijación de fechas ya tiene quien la vigile. Detalle: [bitácora](../_bitacora/2026-11-21-arnes-de-aislamiento-y-las-p0.md).
- **2026-11-21 · T-569**: 41 clases de la familia `primary`, que no existe en ninguna paleta, mapeadas a `acento-*`. Con prueba que exige que toda familia de color usada exista en Tailwind o en el tema.
- **Dos cosas que se daban por ciertas y no lo eran**: `Carril y tarea` **sí** acepta una bitácora de `docs/` en un PR de carril `a` o `b` (verificado en verde en #471, #472 y #473; T-576 decía lo contrario y se corrigió), y **el cierre automático de tareas no cerró nada** en este lote pese a que las ramas nombraban su tarea. **Comprobar el `status` en `main` después de cada integración.**
- **Un comentario que justifica una decisión con una medición que nadie tomó congela esa decisión durante meses.** Es lo que mantenía al arnés con filtro de rutas y fuera de los checks obligatorios.

## 2026-11-22 · El lote del cliente que no podía entrar

`main` de **`e5b670e0`** a **`57deaa27`**. Trece PR integrados (#483, #486, #487, #489, #491, #492,
#495, #497, #498, #499, #500, #501, #502) y el resto en la cola. El lote no lo decidió la hoja de
ruta: lo decidió que **el propietario tenía un cliente delante de la pantalla de ingreso sin poder
entrar**.

**Lo que resolvió el caso (verificado).** El flujo `preparar-demo-staging.yml` (T-600) midió la base
antes de tocarla: `{agencias:1, agenciaDemo:true, identidades:3, usuarios:3, credenciales:1}`. La
base **no estaba vacía**: dos de los tres usuarios no tenían contraseña porque `seed.ts` crea
identidades **sin credencial** a propósito y el despliegue **migra pero no siembra**. Tras sembrar:
4 identidades, 4 usuarios, 2 credenciales. El cliente entró. **Cuál de las tres comprobaciones lo
desbloqueó no consta** — se le pidieron tres cosas a la vez (URL escrita a mano, otra red, otro
navegador) y no se aisló ninguna. Queda escrito como lo que es: causa **no confirmada**.

**Nueve afirmaciones falsas en el hilo, todas en la misma dirección.** El propietario lo dijo con
estas palabras: «Veo muchas contradicciones tuyas y me preocupa.» `ESTADO.md` afirmaba «no hay nada
desplegado» y «ninguna agencia lo ha visto» mientras staging respondía 200 y un cliente real estaba
entrando. Corregido en `ESTADO.md` (×5, T-594), en el tablero, en el diario (marcado, no borrado) y
en `CLAUDE.md` (#500). **Todas eran afirmaciones heredadas que nadie volvió a comprobar.**

**Decisiones**
- **T-598 (P0): rotar los secretos del Environment.** El propietario recordó que **los cargó una
  sesión de IA anterior con plantillas**, contra su propia regla («son claves; nunca pasan por una
  sesión»). Orden escrito: contraseñas de los cuatro roles de Neon y `BETTER_AUTH_SECRET` primero.
- **El limitador de ingreso pasa a ser configurable** (T-612, `LIMITE_INICIO_SESION_POR_IP`) en vez
  de subirlo a mano en producción. El tope por identidad (10 fallos / 15 min, ventana deslizante,
  respuesta idéntica a clave mala) **no se toca**: su opacidad es deliberada (ADR-0031 §4). Lo que
  se arregla es que un usuario legítimo hoy no puede saber que solo tiene que esperar (T-611).
- **El audio del cliente se encoló tal cual** (T-608, T-609, T-610). La primera petición
  —organizar los chats por estado— **ya estaba construida** (T-323..T-326, `done`): lo que falta es
  sembrarla en la demo y enseñársela. Dos de las tres peticiones no eran código nuevo.

**Trampas nuevas**
- **Integrar un PR despliega.** `deploy-staging.yml` lleva 50+ ejecuciones desde el 2026-11-21:
  dispara el hook de Render, redespliega Vercel y corre `prisma migrate deploy` contra Neon. Nadie
  en el hilo lo sabía mientras se discutía «qué falta por desplegar».
- **La cadena de sesiones madre se agota**: `create_session` responde «lineage depth 8 (limit 8)» y
  **ninguna configuración lo cambia** (T-584). Desde aquí solo hay subagentes en proceso, que no
  abren PR y mueren con la sesión. **La próxima madre la abre el propietario desde la raíz.**
- **El carril sí importa para las bitácoras**: el check «Carril y tarea» rechaza `docs/` en una rama
  `a/` o `b/`. La nota de T-576 que lo negaba era engañosa — aquellos PR tenían ramas sin prefijo de
  carril. Las bitácoras van al PR de cierre del lote.
- **Resolver un conflicto de `tasks.yaml` con expresiones regulares rompe el archivo** y el YAML
  sigue parseando. Pasó aquí: partió una tarea y dejó sus criterios sin cabecera, y llegó a
  commitearse en local porque la salida se había silenciado con `2>/dev/null`. **Validar antes de
  commitear, no antes de empujar, y no silenciar `git commit`.** El procedimiento bueno es
  reconstruir desde `origin/main` y reaplicar **solo** las diferencias reales de la rama, comprobadas
  tarea por tarea con `yaml.safe_load`.
- **Antes de relanzar un check en rojo, mirar qué job es.** Solo `navegador` es inestable; dos veces
  se relanzó en vano un `convencion-de-commits` que iba a fallar siempre.
- **Commitlint rechaza un asunto que empieza por `CLAUDE.md`** (`subject-case`) y los scopes
  inexistentes (`e2e`). Dos PR hubo que recrearlos por esto (#488→#500, #494→#498).
- **Buscar por el concepto en español.** Se afirmó «no hay ninguna pieza que cree contraseñas»
  buscando `signUp` y `hashPassword`; existía `sembrar-credenciales-dev.ts`.
- **`navegador` cae por el limitador, no por azar**: 5 intentos/minuto por IP y la suite hace 7
  ingresos. Medido. T-592 hace que la prueba espere el cupo; T-603 lo sube solo en el job de CI.

**Pendiente del propietario (solo él puede)**
- Rotar los secretos (T-598) y la contraseña de la demo, que quedó en texto plano en el log de un
  run de un repositorio **público**.
- Aprobar #503 y poner `LIMITE_INICIO_SESION_POR_IP=20` en Render.
- Añadir `"Bash(node scripts/diagnostico-ingreso.mjs:*)"` a `permissions.allow` (#490).
- **Abrir la próxima sesión madre desde la raíz** (T-584).
- Renovar las credenciales de los conectores de Neon, Render y Vercel: los tres rechazan su token.

## 2026-11-22 · La guía de Chrome, una compuerta que no existía y la navegabilidad

`main` de **`57deaa27`** a **`c77ce2f2`**. Nueve PR integrados (#509, #511, #513, #514, #515, #518 y
los de cierre automático) y siete abiertos al escribir esto. El tramo lo marcaron tres peticiones del
propietario, y cada una destapó algo que nadie había comprobado.

### 1. «¿Trabaja con esta skill? ¿Sirve?»

Pasó el repositorio [`GoogleChrome/modern-web-guidance`](https://github.com/GoogleChrome/modern-web-guidance),
mantenido por los equipos de Chrome, Edge, Firefox y MDN. Autorizó instalarlo y usarlo.

**Se revisó antes de proponerlo**, porque la documentación de Claude Code avisa de que un plugin puede
ejecutar código arbitrario. Clonado y revisado en el commit `64a6d708` (v1.0.1): **no contiene ni un
fichero ejecutable**. Ni `hooks/`, ni `.mcp.json`, ni `bin/`. Solo Markdown, JSON, un TOML e imágenes.
Lo que ejecuta código es la CLI de npm, que es **otra superficie**. Por eso el marketplace se fija al
commit revisado y no a `main`.

**Medido sobre el código real:** 11 hallazgos en `apps/web`, 17 en `apps/api`, 1 en
`packages/database`, **0** en `domain` y `contracts`. Se aplicaron 25 (T-615, T-616).

**Y cuatro se descartaron tras leerlos** — el dato que de verdad importa:

- **`error-cause` en el consumidor de correo** habría sido un **defecto de privacidad**: ahí el error
  se despoja **a propósito por R10**, porque puede traer la dirección o el cuerpo. El código ya lo
  decía en un comentario. **Aplicado a ciegas, datos personales en un log.**
- **Los dos `structuredClone`**: la vuelta por JSON **normaliza, no copia**. `structuredClone`
  conserva `Date` y `undefined` y cambiaría lo que se escribe en una columna JSON de Postgres.
- **`Promise.withResolvers`** es ES2024 y nuestro `lib` es ES2023.

**Sirve para encontrar, no para decidir.** Adoptada como **R15** en `CLAUDE.md`, con la precedencia
`CLAUDE.md` → `diseno-web` → la guía, y escrita además en la skill, en tres agentes y en el modelo
operativo. Detalle: [`docs/09-ia/10-guia-web-moderna.md`](../09-ia/10-guia-web-moderna.md).

**La precedencia funcionó en su primer choque real.** En T-607 la guía proponía `color-scheme` en
lugar de la clase `dark` de Tailwind: chocaba con lo construido, **mandó `CLAUDE.md` y no se aplicó**.
Y para depurar la hidratación **no aportó nada**. Es un límite útil: vale para patrones de interfaz y
para encontrar deuda, no para depurar React.

### 2. «¿Qué ha cambiado en el diseño? Veo todo igual»

**Tenía razón.** Lo del día había sido deuda interna y accesibilidad; T-615 y T-616 son refactor puro,
cero píxeles. Se le dijo así, sin adornos, y pidió **un diagnóstico antes de tocar nada**. Luego
precisó: **«Importante mejorar mucho la navegabilidad.»**

T-618 (#519) recorrió 13 rutas con **52 capturas** a 1440 y 390 px, claro y oscuro, con clics reales.
Lo que encontró, medido:

- **Las 9 tarjetas del pipeline** dicen «Abrir conversación con X» y apuntan a `/bandeja`, **no a
  `/bandeja/<id>`**. Prometen un toque y cobran un toque más una búsqueda visual.
- **La cadena del trabajo solo está enlazada hacia atrás**: el chat, la cotización y la ficha no
  llevan al archivo ni al cobro.
- **Configuración es inalcanzable** en demostración: ni menú, ni «Más», ni paleta.
- **Contactos a 390 px: 0 de 8 enlaces alcanzables.**
- **«Hoy» en oscuro: contraste ≈1,1:1** en la línea que lleva «$2.500.000», porque `neutral-850` no
  existe en `@theme` y **no emite CSS**.
- **«Ventana cerrada» con el verde de éxito.** El color miente sobre lo que cuesta dinero.
- **En móvil, el aviso de cookies tapa «Ingresar con código de 6 dígitos».** De la misma semana en que
  un cliente real no conseguía entrar.

### 3. «El CRM debe ser configurable para cualquier agencia»

Llegó mientras un agente iba a incrustar fotos de playas colombianas en el ingreso. Se le reconduçió
en caliente: **las imágenes y los textos pasan a ser datos con valor por omisión**, no JSX.

Y se midió qué más ata el producto a Colombia (**T-621**). **Lo grave no eran los textos:**
`dashboard-admin.tsx` usa `ZONA_HORARIA_COLOMBIA` **por omisión** pese a existir
`tenants.zona_horaria` — una agencia fuera de Colombia **vería el día cambiado**, contra R9. Y el alta
pide **NIT y RUT**, que son colombianos.

Decisión de producto: **entregamos un paquete estándar** (Cartagena, Santa Marta, Barranquilla, Barú,
Playa Blanca, Islas del Rosario) y **la agencia puede sustituirlo** (T-622). Con un límite escrito: en
el **ingreso** no se sabe de qué agencia es quien mira, porque es **anterior a la sesión**. Marcarlo
por agencia exige subdominio o similar, y eso es **ADR**.

### 4. La compuerta que creíamos tener y no existía

**Lo peor del tramo, y se descubrió pasando por ella.** El PR #511 se integró en `main` **sin una sola
revisión**, tocando `CLAUDE.md` y cuatro ficheros de `.claude/`. Horas antes se le había dicho al
propietario que ese PR «esperaba su aprobación». **Era falso.**

Causa medida: `require_code_owner_reviews: true` pero **`required_approving_review_count: 0`**. Con el
contador en cero **GitHub no exige nada**. El `CODEOWNERS` está bien escrito; **la protección no lo
hace cumplir**. R11 mentía.

**Es el mismo error que este hilo lleva corrigiendo dos días**, cometido por quien lo corregía: se
leyó el `CODEOWNERS`, se vio `require_code_owner_reviews: true` y **no se comprobó que la compuerta
corriera**.

Y al arreglarlo apareció algo peor: **GitHub no deja que el autor de un PR lo apruebe**, y **todos los
PR de la sesión salen a nombre del propietario**. Con la compuerta activada **se bloquearía a sí
mismo**.

**Decisiones**

- **No subir el contador a 1.** Se aplica a **todos** los PR, y el propietario pidió lo contrario:
  «que solamente cuando se vaya a cambiar la arquitectura establecida intervenga yo».
- **Hay dos vías y las dos valen.** La nativa, **verificada en la documentación**: la regla *Required
  reviewers* de una ruleset permite exigir revisión **solo en ciertas rutas** («require review or
  approval from specific teams when a pull request changes certain files or directories»), solo en
  repositorios de organización y **con un equipo**. Y el **check obligatorio** (#517), que comparte
  lista con `ownership.json` y usa `pull_request_target` para que **un PR no pueda reescribir la
  compuerta que lo juzga**.
- **Modelo de trabajo nuevo, decidido por el propietario:** los agentes escriben en la sesión, la
  sesión empuja la rama, y **el PR lo abre la app Integradora** (T-624, #521). Lo crítico lo hace la
  sesión con su autorización. Escrito en `CONTEXTO.md`.
- **El orden no se puede alterar:** enrutado → integrar el check → **solo entonces** marcarlo
  obligatorio. Al revés, el repositorio se queda inmóvil.

**Trampas nuevas**

- **Un asunto de commit que empieza por un identificador en mayúsculas** (`T-608`, `CLAUDE.md`) rompe
  `subject-case`. Pasó **otra vez**, con la trampa ya escrita.
- **T-608 se cerró sola sin que el trabajo se hiciera**: el cierre automático cierra **por el nombre
  de la rama**, y aquel PR solo encolaba la petición del cliente. Nace T-614. **Comprobar el `status`
  tras cada cierre automático.** Por eso las ramas de cola usan `T-000`.
- **Cada cierre automático deja en conflicto cualquier rama del carril `i`** que toque `tasks.yaml`.
  Resuelto cinco veces en este tramo. Tomar siempre el estado de `main` para los campos de cierre.
- **El clasificador deniega escribir en `.claude/settings.json`** — es la barrera que impide que un
  agente se conceda permisos. **Sí** deja editar `.claude/agents/*.md` y `.claude/skills/`. No se
  rodea: se anota en `PENDIENTES-DEL-PROPIETARIO.md`.
- **`preparar-demo-staging.yml` exige una contraseña, rota la que haya y la imprime en claro** en el
  resumen de un repositorio **público**. Por eso **no se relanzó** tras integrar T-614, y la demo del
  cliente sigue sin las etiquetas nuevas.

**Pendiente del propietario**: aprobar #521 y #490/#503; marcar `rutas-protegidas` **después** de
integrar #517; `.claude/settings.json` con el fragmento de `docs/09-ia/10-guia-web-moderna.md` §5;
rotar los secretos (T-598, **P0**); y **abrir la próxima sesión madre**, que esta no puede: linaje 8 de 8.
