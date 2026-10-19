# 2026-10-19 — `feat/inbox-esquema` al día con v0.19.0

Agente: `datos`. Rama: `feat/inbox-esquema`.

## Qué se hizo

- `git merge main` (v0.19.0, `2905e05`). Dos conflictos:
  - `tests/aislamiento.spec.ts`: dos tramos de comentario; queda la versión de `main` (arnés por
    corrida con `tenantDeCorrida` + `borrarTenants`). El bloque del inbox se conserva entero.
  - `package.json`: `test:aislamiento` de `main` (limpia antes de correr) y se conserva
    `mutaciones` de la rama.
- El defecto por el que volvió la rama (`canales` borrado antes que `enrutamiento_canales`, RESTRICT)
  ya lo arreglaba `02dedf3`: el `afterAll` del inbox borra el directorio como `viajapro_enrutador`
  antes de tocar `canales`. Comprobado en la corrida, no por lectura.

## Verificación (base `neondb`, comprobada con `current_database()`; todo con `env -u DATABASE_URL -u DIRECT_URL`)

- `prisma migrate status`: 15 migraciones, «up to date». Nada aplicado.
- `migrate diff` base → esquema fusionado: solo deriva de modelado previa (índices trigram/parciales
  que Prisma no representa, tres nombres de FK de `20261013230000`). Menor que la de cualquiera de
  los dos lados por separado.
- Aislamiento: **50/50** dos veces seguidas, cero saltadas, la segunda sin residuo; y una tercera
  dentro de `pnpm test`.
- `lint` 7/7, `typecheck` 9/9, `build` 5/5, `test` 6/6 (contracts 56, domain 70, api 218,
  database 50), `format:check` limpio. Todo con `--force`.

## Pendiente

- Integración por `integrador`.
