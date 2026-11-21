# 2026-11-21 — T-505: el CHECK de permisos y `PERMISOS` ya se comparan

## Qué se hizo
- `packages/database/tests/catalogo-de-permisos.spec.ts`: lee `pg_get_constraintdef` del CHECK
  `roles_permisos_del_catalogo` (nombre real, vigente desde `20261121160000`) y lo contrasta con
  `PERMISOS` de `@viajapro/contracts` en los dos sentidos. El fallo dice, por permiso, si «falta en
  la base» (hay que escribir la migración) o «falta en contratos» (hay que añadirlo a `identidad.ts`).
  También falla ante duplicados. El comparador y el extractor de literales tienen pruebas propias.
- `permisos-de-reportes.spec.ts` deriva `CATALOGO_ANTERIOR` de `PERMISOS` en vez de repetir catorce literales.
- `@viajapro/contracts` pasa a devDependency de `packages/database` (sin ciclo: contracts no depende de database; `^build` de turbo ya lo construye antes de `test`). Ruta protegida: espera al propietario.

## Sin verificar
Sin Postgres en esta sesión: la prueba no se ejecutó, ni el typecheck. Solo se comprobó a mano la
expresión regular contra una definición de ejemplo. Pendiente del CI.

## En cola
`DUENO_ANTES`, `ASESOR_ANTES` y `OPERACIONES_ANTES` siguen escritos a mano a propósito: son fotos del
estado histórico previo a la migración, no el catálogo vigente.
