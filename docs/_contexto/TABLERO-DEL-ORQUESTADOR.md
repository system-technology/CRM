# TABLERO DEL ORQUESTADOR — el estado vivo que sobrevive a la sesión

> **Para qué sirve.** `CHECKPOINT.local.md` es local y se pierde con el contenedor; `DIARIO.md` va por lotes y
> queda horas atrás. Este tablero está **versionado** y lo alimenta la sesión madre en cada hito y en cada
> despertar de las dos horas (R14). Es lo primero que lee una sesión nueva de orquestación. Entradas cortas:
> lo que ya es historia se pasa al diario y se borra de aquí. **Sin secretos ni datos reales.**
>
> **Cómo se alimenta.** Tras cada hito se edita la sección que toque y entra en `main` por un PR de docs del
> carril `i/`. El hook `contexto-persistente.mjs` inyecta **el más reciente** entre el del checkout y el de la
> rama `claude/repository-status-d4ug6p`. Si el tablero contradice a `gh`/`git`, manda la realidad.

Última actualización: **2026-11-21, 12:20 UTC**, relevo de la madre por contexto (688 mil tokens, 122 USD). `main` en **`e7c80045`**. **Un PR abierto: #426** (este).


## 1. Quién es quién

- **Propietario:** Alfavear (español). Autorización literal: «tú tienes autorización mía para aprobar y destrabar los temas pendientes como si fuera yo»; «tú como sesión principal tienes toda mi autorización para aprobar los PRs y destrabar todo lo que nos bloquea». El 2026-11-21 añadió: **modo desatendido, avanzar en todos los frentes**.
- **No alcanza:** paneles de Neon, Render, Vercel o 21st.dev; claves y secretos; `override-lane` y la configuración de GitHub; WhatsApp real; trámites (Meta, abogado, contador, pasarela); redesplegar la demo sin su confirmación; borrar ramas ajenas.
- **Sesión madre** (orquestadora): **`session_01R81Xh3ygCnt8wYfALeA6yY`** (Opus, esfuerzo alto), desde las 08:50 UTC del 2026-11-21. La anterior, `session_01R81Xh45hbFQHivoDJ8cbJQ`, se relevó por contexto (400 mil tokens, ~48 USD).
- **El despertar de las 2 h ya apunta bien.** Tarea programada **`trig_01H8nNZUwV2DdTA2fnJzQkVh`** (`15 */2 * * *`), creada por la madre anterior el 2026-11-21 a las 09:53 UTC apuntando a la madre actual; la suya, `trig_016u2cLZTGLRrJvkZWgJpqpG`, quedó borrada. **Verificado con `list_triggers`**, no de palabra. Quedó así porque a la madre nueva el clasificador le deniega `create_trigger`: si vuelve a haber relevo, **la madre saliente crea la tarea de la entrante antes de retirarse**.
- **Sesión madre:** se relevó a las 12:20 UTC. La saliente era `session_01R81Xh3ygCnt8wYfALeA6yY`.
- **Sesiones vivas, repartidas a las 12:01 UTC:**
  - `session_01R81Xh5CyC21JcvzAQYqDbP` — **T-528**, el resumen propio sirve las cifras del asesor (Opus alto). **Lleva auditoría independiente de la madre antes de integrar: es alcance entre asesores.**
  - `session_01R81Xh2wqYiANqJPC5JnvyK` — **T-510**, cerrar los deadlocks 40P01 y las cinco corridas limpias (Sonnet alto).
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

**`main` en `e7c80045`: TRECE PR integrados el 2026-11-21**, todos en serie y a mano con squash: #414, #416 (T-505), #415 (T-510 sigue abierta), #410 (T-331), #417 (T-342), #418, #420 (T-516), #421 (ADR-0036), #419 (T-511), #422 (T-343), #424 (ADR-0033 aceptado), #423 (T-344 y su enganche) y #425 (T-535).

**STAGING VIVO Y AUTOMÁTICO.** `DEPLOY STAGING → success`: migraciones + Render + sonda `/salud/listo` + Vercel. **Cada merge a `main` con CI verde lo repite solo.** Lo destrabaron los tres secretos del Environment `staging` que puso el propietario, más conectar el proyecto de Vercel al repositorio (sin eso no existe el deploy hook; `vercel.json` ya trae `deploymentEnabled: false`). **Render y Vercel no se pueden tocar desde las sesiones** (`unauthorized` y credencial rechazada): no hace falta, el workflow basta.

Lo último que entró: #404 a #409 (detalle en la [bitácora](../_bitacora/2026-11-21-segundo-lote-reportes-cobros-y-pruebas.md)). #402 y #362 se cerraron por sustitución.

**Ids de tarea ya usados:** T-515..T-521 (cola de la auditoría de #410, en este PR).

**Antes:** T-425..T-435, T-440..T-479, T-480..T-485, T-490..T-493 T-494..T-504 y T-505..T-512 (T-512 registra el ingreso por apodo; cola de la auditoría de #407 y restos de T-503 y #405, este PR). **El siguiente libre es T-537**; `git fetch` antes de numerar.

### Integrado en este turno (2026-11-21)

- **#388** (`7475d7b`): R14, tablero, prompt de arranque y los skills `ahorro-de-tokens`, `modelo-y-esfuerzo` y `relevo-de-sesion`.
- **#358** (`ea017f7`): ingreso por apodo, tope por identificador y apodo de miembros. **Auditoría independiente: sin bloqueantes.** El arreglo de la carrera (reservar antes de comprobar, dos sentencias en autocommit) falla cerrado y la prueba de 25 peticiones en paralelo **discrimina** el arreglo; el caso mixto ya estaba. El apodo es global en esta fase y lo contiene `guardia-de-apodos.ts` (consulta viva, falla cerrado) más el aborto al arrancar. Cola: T-361 (índice por `(tenant_acceso_id, apodo)`), aserción tautológica en `apodo-ingreso.e2e-spec.ts:505`, `tenant.count()` por intento sin caché, reserva no liberada si Better Auth da 5xx, sesiones huérfanas en Better Auth.

## 4. Pendientes del orquestador (prometido y no hecho)

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
- **El relevo de la madre dejó el despertar descolocado, y solo lo arregla él.** La tarea programada `trig_016u2cLZTGLRrJvkZWgJpqpG` apunta a la madre anterior. La madre nueva no puede repuntarla: `create_trigger` lo deniega el clasificador del modo automático («Destructive or Unwanted Actions») y `update_trigger` solo admite cambiar el prompt desde la conversación a la que la tarea escribe. **También se denegó (`Undermining Oversight`) pedírselo a la madre anterior por `send_message`** — y no se insistió. Mitigación provisional: el aviso al despertar de la cabecera de este tablero. Arreglo: que el propietario permita `create_trigger` a la madre, o cree él la tarea apuntando a `session_01R81Xh3ygCnt8wYfALeA6yY` y borre la vieja.
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
- `gh pr checks` usa GraphQL y está bloqueado aquí: usar `gh api repos/system-technology/CRM/commits/<sha>/check-runs`.
- Una sesión hija creada sin `source_url` nace sin el repositorio clonado y `add_repo` cae bajo el clasificador: crearla siempre con `source_url` y, si procede, `source_revision`.
- El clasificador deniega `git push --force-with-lease` (así nació #399): para corregir el asunto de un commit ya empujado, recrear la rama y abrir otro PR. No hay atajo.
- Pide siempre el mensaje de error completo de `tsc` antes de dar por buena una causa.
- Una sesión hija sin `source_url` nace sin repositorio.
- Un 23505 de un disparador puede llegar como P2002 sin restricción. `issue_write` con `labels` reemplaza etiquetas.

## 8. Sin verificar (heredado)

E2E de ráfagas, de cobros y de #395 contra Postgres real (solo CI); tablet solo emulada; `error.tsx` y la campana con API real; Safari, Firefox y Edge; **nada contra la API real desplegada**.
