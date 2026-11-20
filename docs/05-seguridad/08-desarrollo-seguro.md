# Desarrollo seguro

| Campo | Valor |
|---|---|
| Versión | 0.1, borrador |
| Fecha | 2026-10-27 |
| Estado | **Pendiente de aprobación del propietario** |
| Responsable | `devops` (CI y protección), `integrador` (compuerta de `main`), `auditor-seguridad` y `auditor-codigo` (revisión), propietario (rutas protegidas) |
| Se apoya en | R7, R11, R13 de `CLAUDE.md`; [ADR-0005](../03-adr/0005-modelo-de-ramas.md); [ADR-0016](../03-adr/0016-ciclo-autonomo-con-sesiones-de-opencode.md); [`docs/07-ingenieria/03-git.md`](../07-ingenieria/03-git.md) |

## 1. Alcance

Todo cambio que llega a `main` del repositorio público `system-technology/CRM`, lo escriba una
persona, un agente de Claude, Antigravity u OpenCode.

## 2. Reglas

### 2.1 Revisión y protección de `main`

| # | Regla | Cómo se comprueba | Hoy |
|---|---|---|---|
| D1 | Nada entra en `main` sin PR; administradores incluidos; sin *force-push* ni borrado | Protección de rama del servidor (`gh api repos/system-technology/CRM/branches/main/protection`) | **Cumple** según ESTADO.md (verificado el 2026-10-26) |
| D2 | Los 8 checks obligatorios en verde y la rama al día (`strict`) | Ídem; lista en `.github/proteccion-main.json` | **Cumple** |
| D3 | Las rutas protegidas (migraciones, RLS, esquema, pruebas de aislamiento, cifrado, ADR, `.github/`, `scripts/`, `infra/`, `render.yaml`, dependencias, `CLAUDE.md`, `AGENTS.md`, `.claude/`) esperan la aprobación del propietario | `.github/CODEOWNERS` + `require_code_owner_reviews` | **Discrepancia sin resolver:** ESTADO.md dice que la revisión de CODEOWNERS está activa; la copia `.github/proteccion-main.json` tiene `require_code_owner_reviews: false`. Hay que comprobarlo con `gh api` y corregir la copia o la protección |
| D4 | Todo cambio que toque datos de agencias pasa por `auditor-seguridad` antes de integrarse; el resto, una sola vuelta de revisión (R13) | Comentario de revisión en el PR | Proceso, no mecanismo |
| D5 | Decisión estructural = ADR **antes** de implementar (R7) | Revisión del PR | **Incumplido una vez:** ADR-0018 sigue «Propuesto» y su implementación (PR #44) ya está integrada (ESTADO.md §3) |
| D6 | Commits en Conventional Commits con scope válido | Job obligatorio `convencion-de-commits` | **Cumple** |

### 2.2 Compuertas automáticas (`.github/workflows/ci.yml`)

| Check obligatorio | Qué impide |
|---|---|
| `secretos` | Un secreto en cualquier commit del historial (gitleaks, binario verificado por SHA-256) |
| `aislamiento-tenants` | Una tabla sin RLS, un rol que salta RLS, una lectura o escritura cruzada entre agencias. **Nunca se salta** |
| `fronteras-entre-modulos` | Importaciones y accesos a datos cruzados entre módulos (R4) |
| `typecheck`, `lint`, `build`, `test` | Código roto; `test` incluye el arranque seguro (los procesos abortan con un rol que salta RLS) |
| `convencion-de-commits` | Historial ilegible |

### 2.3 Dependencias y cadena de suministro

| # | Regla | Hoy |
|---|---|---|
| D7 | Instalación reproducible: `pnpm install --frozen-lockfile` en CI | **Cumple** |
| D8 | Una dependencia nueva se justifica en el PR y la aprueba el propietario (`package.json` y `pnpm-lock.yaml` son rutas protegidas) | **Cumple** por CODEOWNERS (sujeto a D3) |
| D9 | Las Actions se fijan por SHA, y Dependabot las actualiza por PR semanal | **Parcial:** `ci.yml` fija por SHA; `ownership.yml` usa `actions/checkout@v4` y `actions/setup-node@v7` por etiqueta |
| D10 | Auditoría de vulnerabilidades de dependencias npm en CI (`pnpm audit` o Dependabot para npm) que falle en severidad alta o crítica | **No existe.** `dependabot.yml` solo cubre `github-actions` |
| D11 | Permisos mínimos del `GITHUB_TOKEN`: `permissions: contents: read` por defecto en cada workflow | **Parcial:** `ownership.yml` lo declara; `ci.yml` solo lo declara en el job `secretos` |
| D12 | Las imágenes de despliegue no corren como root | **Cumple:** job `imagenes-de-despliegue` lo comprueba |

### 2.4 GitHub Apps y agentes

| # | Regla | Hoy |
|---|---|---|
| D13 | Una GitHub App por carril (`viajapro-integradora`, `-backend`, `-frontend`), sin permisos de administración ni de workflows; claves fuera del repo | Declarado en ADR-0016 §7. **No verificado** en esta revisión |
| D14 | Una App no puede aprobar un PR de ruta protegida: solo el propietario | Por diseño de CODEOWNERS (sujeto a D3) |
| D15 | El auto-merge solo se activa en PR que no tocan rutas protegidas | Proceso; ver [12-uso-aceptable-agentes-ia.md](12-uso-aceptable-agentes-ia.md) |

### 2.5 Código

- Los errores no se tragan en silencio; un error de descifrado se registra como `Clase:código`, sin
  contenido (ADR-0015 §6).
- Nunca se registran cuerpos de petición, texto de mensajes, documentos ni *tokens* (ADR-0013 §4).
- Toda superficie nueva (pagos, media, IA) añade su tabla STRIDE al
  [modelo de amenazas](01-modelo-de-amenazas.md) **antes** de integrarse.

## 3. Estado real hoy (2026-10-27)

Lo que **no** se cumple, por orden de riesgo:

1. **D3:** no está claro que la revisión de CODEOWNERS esté activa en el servidor. Si no lo está,
   una App con permiso de escritura podría integrar un cambio de migración o de cifrado sin el
   propietario. **Bloqueante para confiar en el auto-merge.** Comprobación: una línea de `gh api`.
2. **D10:** sin escaneo de vulnerabilidades de dependencias npm.
3. **D9 y D11:** `ownership.yml` sin fijar por SHA y `ci.yml` sin permisos por defecto.
4. **D5:** ADR-0018 por cerrar.
5. **Documentación desactualizada:** `.github/PROTECCION-DE-RAMA.md` todavía dice que `main` no
   tiene protección y que el repositorio es privado, y el
   [modelo de amenazas](01-modelo-de-amenazas.md) (D1, R10, R12, F2) no refleja T-001, T-003, T-006
   ni la protección de servidor. Ambos van a la cola de `documentador`.
