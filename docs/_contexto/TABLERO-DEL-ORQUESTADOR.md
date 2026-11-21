# TABLERO DEL ORQUESTADOR — el estado vivo que sobrevive a la sesión

> **Para qué sirve.** `CHECKPOINT.local.md` es local y se pierde con el contenedor; `DIARIO.md` va por lotes y
> queda horas atrás. Este tablero está **versionado** y lo alimenta la sesión madre en cada hito y en cada
> despertar de las dos horas (R14). Es lo primero que lee una sesión nueva de orquestación. Entradas cortas:
> lo que ya es historia se pasa al diario y se borra de aquí. **Sin secretos ni datos reales.**
>
> **Cómo se alimenta.** Tras cada hito se edita la sección que toque y entra en `main` por un PR de docs del
> carril `i/`. El hook `contexto-persistente.mjs` inyecta **el más reciente** entre el del checkout y el de la
> rama `claude/repository-status-d4ug6p`. Si el tablero contradice a `gh`/`git`, manda la realidad.

Última actualización: **2026-11-21, 14:20 UTC**, por la madre `session_01R81Xh5b7wpteu5YpcDpw5p`, **que se releva aquí**. `main` en **`898ba390`**. **ONCE PR integrados** en el turno (#427, #428, #430, #429, #433, #434, #432, #435, #436, #437, #438). **Cero PR abiertos.**


## 1. Quién es quién

- **Propietario:** Alfavear (español). Autorización literal: «tú tienes autorización mía para aprobar y destrabar los temas pendientes como si fuera yo»; «tú como sesión principal tienes toda mi autorización para aprobar los PRs y destrabar todo lo que nos bloquea». El 2026-11-21 añadió: **modo desatendido, avanzar en todos los frentes**.
- **No alcanza:** paneles de Neon, Render, Vercel o 21st.dev; claves y secretos; `override-lane` y la configuración de GitHub; WhatsApp real; trámites (Meta, abogado, contador, pasarela); redesplegar la demo sin su confirmación; borrar ramas ajenas.
- **Sesión madre** (orquestadora): **`session_01R81Xh3ygCnt8wYfALeA6yY`** (Opus, esfuerzo alto), desde las 08:50 UTC del 2026-11-21. La anterior, `session_01R81Xh45hbFQHivoDJ8cbJQ`, se relevó por contexto (400 mil tokens, ~48 USD).
- **El despertar de las 2 h ya apunta bien.** Tarea programada **`trig_01H8nNZUwV2DdTA2fnJzQkVh`** (`15 */2 * * *`), creada por la madre anterior el 2026-11-21 a las 09:53 UTC apuntando a la madre actual; la suya, `trig_016u2cLZTGLRrJvkZWgJpqpG`, quedó borrada. **Verificado con `list_triggers`**, no de palabra. Quedó así porque a la madre nueva el clasificador le deniega `create_trigger`: si vuelve a haber relevo, **la madre saliente crea la tarea de la entrante antes de retirarse**.
- **Sesión madre ACTUAL: `session_01R81Xh5b7wpteu5YpcDpw5p`** (Opus, esfuerzo alto), desde las 12:25 UTC del 2026-11-21. La saliente, `session_01R81Xh3ygCnt8wYfALeA6yY`, llegó a 688 mil tokens y 122 USD.
- **Sesión madre: SE RELEVÓ a las 14:20 UTC.** La saliente, `session_01R81Xh5b7wpteu5YpcDpw5p`, llegó a **450 mil tokens y 47 USD** — **el triple del tope de 150 mil**. Motivo exacto, para que no se repita: **comprobó el consumo de todas las hijas en cada vuelta y el suyo propio solo una vez, al arrancar, cuando marcaba 0.** El despertar de las dos horas trae ese paso el quinto; conviene hacerlo **el primero**.
- **El despertar propio FUNCIONA, verificado:** `trig_01Cq7TrGZ9uGFc9uAmqQEDtr` disparó a las **14:15:28 UTC** directo en la madre, sin relevo en dos saltos. Era su primera vez.
- **Sesión hija viva (1), y está BLOQUEADA:** `session_01R81Xh6LKjb37fMwSBRg2YL` — **T-531 y T-532** (carril `a`, reportes por asesor y por destino, **solo servidor**). **Lleva parada desde las 13:49 esperando un permiso de Bash que solo contesta el propietario en esa conversación.** No es un fallo suyo.
  - Coexistencia WhatsApp `session_01R81Xh2TUy9RCrR6RV4oAze`: **la abrió el propietario, no se le dan órdenes**.
- **Archivadas tras entregar:** arquitectura (T-340, ADR-0035 → #397), roadmap, cobros, diseño anterior, despliegue.

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
- Una sesión hija creada sin `source_url` nace sin el repositorio clonado y `add_repo` cae bajo el clasificador: crearla siempre con `source_url` y, si procede, `source_revision`.
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

## 8. Sin verificar (heredado)

E2E de ráfagas, de cobros y de #395 contra Postgres real (solo CI); tablet solo emulada; `error.tsx` y la campana con API real; Safari, Firefox y Edge; **nada contra la API real desplegada**.
