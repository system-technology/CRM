# TABLERO DEL ORQUESTADOR — el estado vivo que sobrevive a la sesión

> **Para qué sirve.** `CHECKPOINT.local.md` es local y se pierde con el contenedor; `DIARIO.md` va por lotes y
> queda horas atrás. Este tablero está **versionado** y lo alimenta la sesión madre en cada hito y en cada
> despertar de las dos horas (regla R14). Es lo primero que lee una sesión nueva de orquestación. Entradas
> cortas: lo que ya es historia se pasa al diario y se borra de aquí. **Sin secretos ni datos reales.**
>
> **Cómo se alimenta.** Tras cada hito (integración, ventana, auditoría, decisión) se edita la sección que
> toque y se empuja a la rama `claude/repository-status-d4ug6p`; entra en `main` con el siguiente PR de docs
> del lote. Si el tablero contradice a `gh`/`git`, manda la realidad y se corrige el tablero.

Última actualización: 2026-11-21 04:15 UTC (hora de la máquina). `main` en `4f1883a`.

## 1. Quién es quién

- **Propietario:** Alfavear (español). Su autorización literal: «tú tienes autorización mía para aprobar y destrabar los temas pendientes como si fuera yo»; «tú como sesión principal tienes toda mi autorización para aprobar los PRs y destrabar todo lo que nos bloquea».
- **No alcanza:** paneles de Neon, Render, Vercel o 21st.dev; claves y secretos; `override-lane` y la configuración de GitHub; WhatsApp real; trámites (Meta, abogado, contador, pasarela); borrar ramas ajenas.
- **Sesión madre** (orquestadora): `session_01R81Xh2jA45EF6ZnEoepRHu`. Una tarea programada la despierta cada 2 h (ciclo de [`09-roadmap-maestro`](../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) §3.2).
- **Sesiones de trabajo** (las abrió la madre; reportan por `send_message` a `@parent`):

| Sesión | Id | Carril y tarea |
|---|---|---|
| Roadmap JD Tours | `session_01R81Xh5cU4HFUZKTZJ7kcHe` | Web funcional y cierre de lotes. Sin PR web nuevo hasta aviso |
| Cobros (punto 8) | `session_01R81Xh4M2q356e4sohzT45y` | T-330 (API de pagos, código en `a/`, docs en `i/`); T-339 reportes por nivel. No acepta autonomía sin confirmación escrita del propietario |
| Diseño y UX | `session_01R81Xh3tYPD7HTZMyQCZKpU` | Ola 1 del rediseño (PR #391); celular, tablet y escritorio |
| Despliegue | `session_01R81Xh3CLgTi3QE8KBFoqLC` | Ingreso por apodo (#358, #362); demo desplegada |
| Coexistencia WhatsApp | `session_01R81Xh2TUy9RCrR6RV4oAze` | La abrió el propietario: **no se le dan órdenes** |

## 2. Reglas operativas que no se olvidan

- **R14:** todo cambio se documenta, lo hecho y lo que viene; un plan que solo vive en una conversación o en el checkpoint no existe.
- **Integración serializada** (protección `strict`): cada merge deja `behind` a los demás. Web y rutas protegidas, de una en una, con «ventana» que pide la sesión y concede la madre; los PR de docs con auto-merge se desactivan mientras dura una ventana. Squash, a mano, sin auto-merge en `apps/web`.
- **Antes de integrar:** `gh` del mismo turno con todos los checks en verde (`aislamiento-tenants` en lo de base de datos), rama al día, auditoría de seguridad en aislamiento, dinero, autenticación y datos personales (en aislamiento no se recorta, R13), y mi lectura propia del diff en rutas protegidas.
- **Numeración:** `git fetch`, `main` y los `tasks.yaml` de los PR de docs abiertos antes de numerar tareas, migraciones o ADR.
- **`override-lane`:** la pone solo el propietario. Un PR que mezcla carriles se parte.
- **Veracidad:** «verde», «integrado» o «listo» solo con evidencia del mismo turno; lo no comprobado se dice «sin verificar».
- Commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y `Claude-Session: …/session_01R81Xh2jA45EF6ZnEoepRHu`; asunto en minúscula, ≤100 caracteres, scope válido. Nunca un identificador de modelo en commits ni PR.

## 3. Cola de integración (orden)

Ventana web abierta a **diseño** hasta 05:00 UTC.

| # | PR | Qué | Estado verificado | Falta |
|---|---|---|---|---|
| 1 | #391 | Diseño Ola 1: tokens de estado y plazo, utilidades de puntero | Abierto, CI sin ver | 14/14 con `navegador`, rama al día; integrar a mano |
| 2 | #358 | Ingreso por apodo, API | **No integrable:** mi auditoría halló una carrera en el tope de fallos | Arreglo (reservar antes de comprobar o candado) + e2e de 20 ingresos en paralelo; luego repaso del diff y 15/15 |
| 3 | #362 | Ingreso por apodo, web | `override-lane` aplicado por el propietario | Después de #358 y de traerle `main` |
| 4 | #388 | Regla R14 + cierre del lote de la ola 0 + este tablero | Abierto; toca `CLAUDE.md`, `AGENTS.md` y `.github/` | Integro yo, CI verde |
| 5 | #384, #389, #386, #390, #377 | Docs: cola de etiquetas, diseño, cierre de pagos, docs de cobros, bandeja | Abiertos, sin auto-merge | En ese orden; resolver `ESTADO.md` y `tasks.yaml` en cada uno |

**Ids de tarea reservados:** T-425..T-427 (#384), T-428..T-435 (roadmap, cierre de T-322), T-440..T-471 (diseño, #389), T-472..T-479 (cobros, #386).

## 4. Pendientes del orquestador (prometido y no hecho)

- Aplicar la redacción ampliada del criterio de salida 9 y el principio 7 de [`docs/08-roadmap/08`](../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md) a celular, tablet y escritorio (la propone el informe de diseño, §4.4).
- Auditar T-330 (API de pagos) cuando la sesión de cobros lo pida: dinero + aislamiento, completa.
- Auditar T-339 (reportes por nivel): permisos y margen.
- Reabrir el PR de `navegador` obligatorio (contenido en el commit `27412e7`) **solo** cuando el propietario lo aplique en el servidor.
- Verificar el `navegador` de `main` tras los últimos merges y que `AP14` no reaparezca en rojo en `test`.
- Redesplegar la web con el `main` actual y comprobar la API en Render, **con la confirmación del propietario** (el despliegue vivo es de antes de la ola 0).

## 5. Lo que solo puede el propietario

La bandeja completa y al día está en [`PENDIENTES-DEL-PROPIETARIO.md`](PENDIENTES-DEL-PROPIETARIO.md). Lo que hoy más bloquea: secretos de Render y `DIRECT_URL` en Actions, elegir el espacio de trabajo de Render, `navegador` como check obligatorio, autonomía de la sesión de cobros, coexistencia (ADR-0033), pasarela, nombre comercial, logo y marca.

## 6. Hechos que cuesta recuperar

- **Despliegue:** proyecto de Vercel `viajapro-staging` (dominio `viajapro-staging.vercel.app`), un despliegue `READY` desde `main` en #321; Render sin verificar. Nada de lo nuevo está desplegado.
- **Aislamiento:** `aislamiento-tenants` ejecutó por primera vez la migración de pagos (#382) en verde. Las auditorías de migraciones por lectura no sustituyen a ese job.
- **ADR-0034 (pagos):** integrado como Propuesto y tratado como aceptado; `cobro.corregir` solo para el dueño; el asesor solo registra el pago.
- **El CRM se usa desde celular, tablet y navegador de escritorio** (aclarado por el propietario).
- **Despliegue vivo vs. código:** `ESTADO.md` es la fuente de qué es real y qué es maqueta.
