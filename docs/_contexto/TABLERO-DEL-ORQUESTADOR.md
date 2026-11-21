# TABLERO DEL ORQUESTADOR — el estado vivo que sobrevive a la sesión

> **Para qué sirve.** `CHECKPOINT.local.md` es local y se pierde con el contenedor; `DIARIO.md` va por lotes y
> queda horas atrás. Este tablero está **versionado** y lo alimenta la sesión madre en cada hito y en cada
> despertar de las dos horas (R14). Es lo primero que lee una sesión nueva de orquestación. Entradas cortas:
> lo que ya es historia se pasa al diario y se borra de aquí. **Sin secretos ni datos reales.**
>
> **Cómo se alimenta.** Tras cada hito se edita la sección que toque y entra en `main` por un PR de docs del
> carril `i/`. El hook `contexto-persistente.mjs` inyecta **el más reciente** entre el del checkout y el de la
> rama `claude/repository-status-d4ug6p`. Si el tablero contradice a `gh`/`git`, manda la realidad.

Última actualización: 2026-11-21 06:05 UTC. `main` en `ea017f7` (PR #358).

## 1. Quién es quién

- **Propietario:** Alfavear (español). Autorización literal: «tú tienes autorización mía para aprobar y destrabar los temas pendientes como si fuera yo»; «tú como sesión principal tienes toda mi autorización para aprobar los PRs y destrabar todo lo que nos bloquea». El 2026-11-21 añadió: **modo desatendido, avanzar en todos los frentes**.
- **No alcanza:** paneles de Neon, Render, Vercel o 21st.dev; claves y secretos; `override-lane` y la configuración de GitHub; WhatsApp real; trámites (Meta, abogado, contador, pasarela); redesplegar la demo sin su confirmación; borrar ramas ajenas.
- **Sesión madre** (orquestadora): `session_01R81Xh45hbFQHivoDJ8cbJQ` (Opus, esfuerzo alto). La despierta cada 2 h la tarea programada **`trig_016u2cLZTGLRrJvkZWgJpqpG`** (`15 */2 * * *`). La anterior (`…2jA45EF6ZnEoepRHu`) y su tarea quedaron retiradas el 2026-11-21 a las 05:05 UTC.
- **Sesiones vivas:** diseño `session_01R81Xh45hbduaWzUdQuheSu` (Sonnet, alto; T-440, marco responsivo). Coexistencia WhatsApp `session_01R81Xh2TUy9RCrR6RV4oAze`: **la abrió el propietario, no se le dan órdenes**.
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

| # | PR | Qué | Estado verificado 05:55 UTC | Falta |
|---|---|---|---|---|
| 1 | #393 | T-330: dominio y API de cobros | **Auditado por la madre: INTEGRABLE, sin bloqueantes.** Cabeza `d5cc346` (ya con `main`). `test` falló por `packages/database` → `etiquetas-por-agencia.spec.ts` (FK `etiquetas_tenant_id_fkey`); **parece inestabilidad**: con un `main` equivalente iba 14/14. Job relanzado | Que el rerun verdee; integrar con squash |
| 2 | #397 | ADR-0035, niveles de acceso a reportes (T-340) | 14/14 en verde sobre `5047f06`; `behind`. **Lectura de la madre hecha** (ruta protegida) | Actualizar rama y integrar |
| 3 | #362 | Ingreso por apodo, web | `override-lane` del propietario. Solo corrió «Carril y tarea» | Después de #358; fusionar #359; probar a 390 px y contra la API real |
| 4 | #395 | Cierre provisional H1/H2 de reportes | Borrador. `test` fallaba por un **fixture propio** (CHECK `seguimientos_exactamente_un_destino`), ya corregido en `7acae9a`; CI sin verificar | CI verde + **auditoría de permisos de la madre** + sacar de borrador |
| 5 | docs | #384, #389, #386, #390, #392, #399 | Todos `behind` tras #388; sus checks estaban en verde antes | En ese orden, actualizando rama justo antes de cada merge |

**#399 sustituye a #396** (mismo contenido, asunto de 89 caracteres): el de #396 medía 112 y commitlint corta en 100. **Cerrar #396** al integrar #399.
**Ids de tarea reservados:** T-425..T-435 (#384, #386, #399), T-440..T-479 (#389, diseño), T-480..T-485 (#399), T-490..T-493 (#397).

### Integrado en este turno (2026-11-21)

- **#388** (`7475d7b`): R14, tablero, prompt de arranque y los skills `ahorro-de-tokens`, `modelo-y-esfuerzo` y `relevo-de-sesion`.
- **#358** (`ea017f7`): ingreso por apodo, tope por identificador y apodo de miembros. **Auditoría independiente: sin bloqueantes.** El arreglo de la carrera (reservar antes de comprobar, dos sentencias en autocommit) falla cerrado y la prueba de 25 peticiones en paralelo **discrimina** el arreglo; el caso mixto ya estaba. El apodo es global en esta fase y lo contiene `guardia-de-apodos.ts` (consulta viva, falla cerrado) más el aborto al arrancar. Cola: T-361 (índice por `(tenant_acceso_id, apodo)`), aserción tautológica en `apodo-ingreso.e2e-spec.ts:505`, `tenant.count()` por intento sin caché, reserva no liberada si Better Auth da 5xx, sesiones huérfanas en Better Auth.

## 4. Pendientes del orquestador (prometido y no hecho)

- **Registrar en `tasks.yaml` la cola de la auditoría de #393** (dueño: cobros): `lock_timeout` igual al timeout de transacción de Prisma, invariantes de dinero solo en el dominio, clave de idempotencia por `(tenant, clave)`, `responder()` relee fuera de transacción, C3 (Luhn) y C4 (reverso con otro motivo).
- **Estabilizar las pruebas de migración** de `packages/database`: `etiquetas-por-agencia.spec.ts` falla de forma intermitente por una FK a `tenants`; huele a carrera entre pruebas que comparten base.
- **Flake de `apps/web`:** `bandeja/[id]/page.tsx` hace `setState` después del teardown de jsdom (`ReferenceError: window is not defined`) y tumba el job `test` con 1806/1806 pruebas en verde. Cancelar la promesa al desmontar.
- Auditar #395 (permisos) antes de integrarlo. Auditar la migración de T-341 cuando llegue (toca el catálogo de autorización).
- Criterio de salida 9 y principio 7 del roadmap 08 en celular, tablet y escritorio.
- Verificar el `navegador` de `main` tras los merges; reabrir el PR del `navegador` obligatorio (commit `27412e7`) **solo** cuando el propietario lo aplique en el servidor.
- Redesplegar con el `main` actual **solo con la confirmación del propietario**.

## 5. Lo que solo puede el propietario

Bandeja completa en [`PENDIENTES-DEL-PROPIETARIO.md`](PENDIENTES-DEL-PROPIETARIO.md). Lo que más bloquea hoy: secretos de Render y `DIRECT_URL` en Actions, espacio de trabajo de Render, `navegador` como check obligatorio, coexistencia (ADR-0033), pasarela, nombre comercial y marca.

**Nuevo (2026-11-21):**
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
- Un 23505 de un disparador puede llegar como P2002 sin restricción. `issue_write` con `labels` reemplaza etiquetas.

## 8. Sin verificar (heredado)

E2E de ráfagas, de cobros y de #395 contra Postgres real (solo CI); tablet solo emulada; `error.tsx` y la campana con API real; Safari, Firefox y Edge; **nada contra la API real desplegada**.
