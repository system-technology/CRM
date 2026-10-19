# Integración 2026-10-19 (decimotercera) — `fix/qa-arnes-paralelo`, sin etiqueta

| Rama | Veredicto | Commit |
|---|---|---|
| `fix/qa-arnes-paralelo` @ `835d2a6` (2 commits, 6 archivos, +230/−55) | **INTEGRADA** (`5ead5fe`, `--no-ff`) | sin etiqueta: pruebas y scripts de prueba |

## Compuerta

Es la primera integración con **el CI como compuerta de aislamiento**: Neon compartido tiene
aplicada una migración sin integrar y no puede servir de referencia.

- Rama de compuerta `chore/compuerta-qa-arnes` = `origin/main` (`17750cd`) + la rama, en `8acc08c`.
- `gh workflow run ci.yml --ref chore/compuerta-qa-arnes` →
  https://github.com/Alfavear/CRM/actions/runs/39336470606: `aislamiento-tenants`, `test`,
  `fronteras-entre-modulos`, `politica-de-rama`, `lint`, `typecheck`, `build` y `secretos` en
  **success**. `convencion-de-commits` sale *skipped* porque solo corre en PR.
- El árbol del merge en `main` es el que probó el CI.
- Estáticas en local, sin caché: `typecheck` 9/9, `lint` 7/7, `build` 5/5, `format:check` limpio.

## Revisión

- La suite sigue con 57 `it` y pasa de 163 `expect` a 164. Las que salen en el diff como borradas
  están re-sangradas dentro del `pg_advisory_lock`.
- `DELETE FROM recepciones_webhook` queda acotado a `recepcion_id = ANY($1)`.
- La guarda (`guarda-base-desechable.mjs`) exige `VIAJAPRO_BASE_DESECHABLE=1`, y rechaza hosts de
  Neon y la base `neondb` fuera de loopback. Tiene su propia prueba.

Incidente asociado (las mutaciones contra Neon compartido): `ESTADO.md`.
