# 2026-10-20 — devops: acciones por SHA (M1.5) y hueco del guard de rama en worktrees

## M1.5
22 usos de acciones en `.github/workflows/*.yml` fijados a SHA de 40 con comentario de version
(SHA de `git ls-remote`; pnpm/action-setup v4.4.0 es anotado: se uso el commit `^{}`).
Misma linea mayor que antes (v4/v2), sin saltos de mayor. Alta de `.github/dependabot.yml`
(`github-actions`, semanal).

## Hueco de gobierno (alta)
Causas, reproducidas en un repo temporal con worktrees:
1. `autorizar-integracion` escribia `.git/INTEGRACION-AUTORIZADA`; en un worktree `.git` es un
   archivo: ENOTDIR.
2. `guard-rama` buscaba el marcador relativo al directorio de la sesion, no al del comando.
3. **El falso negativo:** `git -C <dir> commit|merge` no se reconocia. El "subcomando" era la
   primera palabra sin guion, es decir la ruta; y la rama se miraba en la sesion, no en `<dir>`.
   Escribir en `main` desde otro worktree pasaba sin autorizacion.

Correccion: `lib/marcador.mjs` (`git rev-parse --absolute-git-dir`: directorio git PROPIO del
worktree, asi una autorizacion no sirve a otro worktree; falla cerrado si no resuelve);
`politica-rama.mjs` ignora opciones globales (`-C`, `-c`, `--git-dir`) al buscar el subcomando y
usa `-C` como directorio del comando. Pruebas en `politica-rama.test.mjs` (con worktrees reales
temporales; `pnpm test:hooks`).

## Cola (no bloquea)
- El tokenizador trata `\` como escape: rutas Windows con barra invertida en `cd`/`-C` se
  deforman. Con rutas de Git Bash (`/d/...`) o con `/` funciona.
- `--git-dir`/`--work-tree` como directorio del comando no se resuelven (solo se saltan).
- Un `git -C` y un `cd` distintos en el mismo comando: se usa el primero.
- La proteccion real sigue siendo el ruleset de servidor (AUD-004).
