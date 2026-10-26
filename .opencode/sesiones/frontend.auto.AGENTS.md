# Ciclo autónomo — carril FRONTEND de ViajaPro

Trabajas **sin supervisión humana**, dentro de un ciclo que ejecuta un supervisor (`scripts/ciclo.mjs`). Nadie va a contestarte: no pidas visto bueno ni hagas preguntas; decide con los criterios de `TAREA.md` y, si algo no se puede resolver, escríbelo en el fichero de salida de tu fase y termina.

## Tu carril
- **Tuyas:** `apps/web/**` (Next.js App Router, `src/app/(dashboard)/<contexto>/`; React, Tailwind, shadcn/ui, TanStack Query), `packages/ui/**`, `packages/sdk/**`.
- **Compartidas** (cambio rompiente = tarea en ambos carriles): `packages/contracts/**`, `packages/domain/**`. La web trabaja contra los contratos Zod, nunca contra tipos inventados.
- **Prohibido tocar:** `apps/api/**`, `apps/worker/**`, `packages/database/**` (Backend), `ownership.json`, `opencode.jsonc`, `.opencode/`, `scripts/`, `tools/`.
- Todo estado de UI cubierto: cargando, error, vacío. Usable en móvil. Para revisión visual, el MCP `playwright` contra el servidor de desarrollo de la web, si el entorno lo permite.

## Reglas que no se negocian
- **No existe GitHub para ti**: no uses `gh`, `git push`, `git remote`, tokens ni claves. El supervisor empuja y abre el PR cuando tus cambios pasen las puertas.
- Escribe el código **directamente en los ficheros**. Prohibido crear `fix_*.py`, `apply_*.py`, `update_*.py` u otros scripts de parcheo.
- **Verifica los hechos antes de afirmarlos** (que un fichero existe, qué dice `package.json`, qué exporta un módulo). Cita el comando. No inventes ids, ficheros ni APIs.
- Lee `CLAUDE.md` (las 13 reglas) y, si tocas dominio, `docs/01-producto/02-lenguaje-ubicuo.md`: si el documento dice `TravelFile`, el código dice `TravelFile`.
- **R1/R2:** toda tabla de negocio lleva `tenant_id` y RLS; nunca el rol `postgres`. **R3:** los contratos viven en `packages/contracts` (Zod); nadie redefine tipos. **R4:** los módulos no se importan entre sí. **R8:** dinero en enteros en la unidad mínima (en COP es el peso). **R6:** ningún secreto en el repo.
- TypeScript estricto, `any` prohibido (usa `unknown` + Zod). Errores de dominio como clases tipadas, nunca `catch` silencioso.
- Cambios pequeños y concentrados (el supervisor rechaza más de 25 ficheros o 1500 líneas). Si un criterio exige más, implementa el núcleo y anota en `RESULTADO.md` lo que queda.
- Commits locales con mensaje convencional (`feat(quoting): …`, scope de `commitlint.config.mjs`) que incluya el id de la tarea. No toques `main`.
- Tests co-localizados `*.spec.ts`. Antes de terminar ejecuta `pnpm compuertas --rapido` y arregla lo que falle; no uses `--no-verify`.
- Migraciones, RLS, roles de BD, cifrado, `render.yaml`, `infra/`, `.github/`, `.env*` y dependencias son del Owner: **no los toques**.
- No hay base de datos en tu worktree: las pruebas de integración y `db:aislamiento` los corre el CI. Si tu tarea las necesita, escribe el test y dilo en `RESULTADO.md`.

## Qué te pide el supervisor en cada fase
Te lo dice el mensaje de cada fase (planificar, revisar, implementar o reparar). Sigue exactamente el fichero de salida que te indique.

## Entorno (Windows)
- `node`, `pnpm`, `git` y `bash` (Git Bash) están disponibles. En PowerShell `where` no imprime nada: usa `Get-Command`.

## Superpowers
Tienes las skills de superpowers (TDD, depuración sistemática, verificación antes de dar por hecho, planes, revisión de código). Úsalas. Pero **nadie contesta**: si una skill te pide preguntar al usuario, esperar aprobación o elegir entre opciones, decide tú con `TAREA.md` y sigue. No hagas merge, push ni crees worktrees: eso es del supervisor.

## Lo que NO haces al terminar
Ignora la sección «Al terminar» de `AGENTS.md` de la raíz del repo: **no edites `ESTADO.md` ni `docs/_bitacora/`**, que son del carril Integradora. Tu parte es `RESULTADO.md`. Tampoco ejecutes `prettier --write` sobre el repo entero ni sobre ficheros que no son de tu tarea: formatea solo los que tocaste (`pnpm exec prettier --write <tus ficheros>`). Cualquier cambio fuera de los `files` de `TAREA.md` hace fallar la puerta de carriles.
