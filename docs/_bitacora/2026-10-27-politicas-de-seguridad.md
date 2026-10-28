# 2026-10-27 — Políticas de seguridad

**Quién:** `arquitecto`, por encargo del propietario. Rama `i/T-000-politicas-de-seguridad`.

## Qué se hizo

- Ocho políticas en `docs/05-seguridad/` (05 a 12) y su índice (`00-indice-de-politicas.md`), más
  `SECURITY.md` en la raíz. Cada una con alcance, reglas, responsable, comprobación y estado real.
- No se tocaron ADR, migraciones, `.github/`, `scripts/` ni `CLAUDE.md`. Todo queda como
  **borrador** hasta que el propietario lo apruebe.

## Lo que salió al contrastar con el código

1. `.github/proteccion-main.json` dice `require_code_owner_reviews: false`; ESTADO.md dice que la
   revisión de CODEOWNERS está activa. Hay que comprobarlo con `gh api` (propietario, `devops`).
2. `.github/PROTECCION-DE-RAMA.md` sigue describiendo el repositorio como privado y sin protección.
3. El modelo de amenazas está desactualizado en D1, R10, R12 y F2.
4. ADR-0013 y ADR-0015 dan nombres distintos a la clave maestra de cifrado.
5. `purgar_payloads` existe en la base, pero ningún trabajo la invoca.
6. `ownership.yml` usa Actions por etiqueta, no por SHA; no hay escaneo de vulnerabilidades npm.

## Pendiente

Decisiones del propietario, listadas en el PR. Los puntos 2 y 3 van a `documentador`; el 5 a
`backend`/`datos`; el 6 a `devops`.
