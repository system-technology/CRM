# ADR-0016 — Ciclo de desarrollo autónomo con sesiones de OpenCode

- **Estado:** Propuesto (lo ratifica el propietario al integrar este PR)
- **Fecha:** 2026-10-26
- **Supersede parcialmente:** R11 de `CLAUDE.md` y el papel de `ESTADO.md` como cola de trabajo

## Contexto

Con una persona y dos IA en paralelo el cuello de botella es la revisión y la integración, no escribir código. En AltarDiario (repo `system-technology/ALTARDIARIO`) un modelo distinto funcionó una noche sin supervisión e integró más de 25 PRs. Queremos el mismo modelo aquí, sobre un producto con reglas más duras (aislamiento entre tenants, PII).

El repositorio pasó a **público** en `system-technology/CRM`. Eso da protección de ramas, CODEOWNERS, Actions y escaneo de secretos sin coste, y hace que `main` tenga por fin protección de servidor.

## Decisión

1. **Quién escribe qué.** Sesiones de OpenCode, desatendidas, escriben el código de producto. Claude Code orquesta y valida: define tareas, revisa lo que entra, ajusta la configuración. No escribe código de producto.
2. **Carriles por rutas** (`ownership.json`): `a` Backend, `b` Frontend, `i` Integradora, más rutas compartidas y rutas que exigen aprobación humana (`humanRequired`). Una tarea pertenece a un solo carril; un cambio rompiente en `packages/contracts` son dos tareas.
3. **Backlog máquina** en `roadmap/tasks.yaml`, escrito con `tools/roadmap-mcp`. Sustituye a la cola de `ESTADO.md`, que queda como resumen corto.
4. **Un supervisor por carril** (`scripts/ciclo.mjs`, proceso de Node, no una sesión): elige tarea → un modelo planifica → **otro modelo revisa el plan** → un modelo implementa → puertas deterministas → PR con la identidad de una GitHub App → auto-merge.
5. **Las puertas son las del proyecto**, no otras: `pnpm compuertas --rapido` y `verificar:fronteras` en local; en el servidor, las ocho de `ci.yml`, entre ellas `aislamiento-tenants`, que nunca se salta (R13).
6. **R11 se reformula:** en `main` escribe la **integración automática** (auto-merge), solo con la protección de rama satisfecha (PR, checks en verde, rama al día, administradores incluidos). Las rutas de `humanRequired` esperan aprobación del Owner por CODEOWNERS.
7. **Una GitHub App por sesión** (`viajapro-integradora`, `viajapro-backend`, `viajapro-frontend`), sin permisos de administración ni de workflows. Las claves viven fuera del repo (`~/.viajapro-keys`).
8. **Los hooks de `.claude/hooks/` solo protegen a sesiones de Claude.** A las de OpenCode las protegen la protección de rama del servidor y los permisos de su configuración (`.opencode/sesiones/auto.permisos.jsonc`).

## Aprobación humana siempre

Migraciones y políticas RLS, roles de base de datos, cifrado (ADR-0014/0015), `render.yaml`, `infra/`, `.github/`, `.env*`, dependencias, `scripts/`, `tools/`, `.opencode/`, `CLAUDE.md`, `AGENTS.md` y ADR.

## Consecuencias

- **Bueno:** el trabajo no espera a una persona entre pasos; cada cambio pasa por la misma compuerta, y la protección es del servidor y no de la disciplina.
- **Riesgo:** un modelo plausible-pero-incorrecto escribiendo en un producto multi-tenant. Mitigación: rutas sensibles bloqueadas a mano; `db:aislamiento` obligatoria en CI; un revisor de plan distinto del planificador; parada tras 3 fallos seguidos; fichero `STOP`.
- **Coste:** el ciclo consume cuotas de modelos (NVIDIA y OpenCode Go). Presupuesto diario en `scripts/ciclo.config.json`.
- **Límite conocido:** el `.env` y la base de datos no existen en los worktrees de las sesiones; lo que necesite base de datos lo prueba el CI, no el supervisor.
