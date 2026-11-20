# 2026-11-20 — Cierre de lote: reorganización de `docs/` (T-302)

**Qué se hizo.** Cuatro PR, uno por paso, cada uno integrado con el CI en verde antes del siguiente:
1. #316: `scripts/comprobar-enlaces.mjs` con línea base (`scripts/enlaces-rotos.base.json`, 70 roturas conocidas) y job `enlaces-de-documentacion` en modo aviso, fuera de los 8 checks obligatorios.
2. #317: la carpeta `_auditoria` fusionada en `docs/_auditorias/` con `git mv`. `_investigacion` se deja.
3. #318: la carpeta de traspaso movida a `docs/_traspasos/` (que ya existía; la primera vez `git mv` anidó la carpeta y hubo que subirla un nivel). Actualizadas las citas vivas y las históricas.
4. #319: `docs/README.md` con los ADR 0019 a 0030 y 31 documentos que no estaban en el índice.

**Qué no se hizo, a propósito.** La bitácora no se agrupa por año: el hook de arranque lee `docs/_bitacora` sin recursión y `CLAUDE.md`, `AGENTS.md` y `ESTADO.md` fijan la ruta plana. `_backlog`, `_incidentes` y `packages/*` no se tocaron.

**Verificado.** Los cuatro PR figuran como integrados en `gh`. El comprobador local dio «sin roturas nuevas» tras cada paso.

**Pendiente (cola).** T-304 (referencias muertas a los documentos FLUJO y CICLO (que ya no existen) en comentarios protegidos) y T-305 (subir el comprobador a obligatorio).
