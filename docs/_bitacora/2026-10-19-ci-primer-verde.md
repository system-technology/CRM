# 2026-10-19 — Primer CI en verde

Corrida verde: https://github.com/Alfavear/CRM/actions/runs/39307485006 (rama `ci/primer-verde`, disparada con `workflow_dispatch`).

## Qué estaba roto
- `db:migrate` llamaba a `prisma migrate dev` (interactivo, shadow DB): ahora `db:migrate:deploy`.
- Faltaba `prisma generate` en los jobs `test` y `aislamiento-tenants`.
- Las pruebas e2e exigen la base `neondb` (guardia propia) y la semilla: la base del CI se llama `neondb` y se corre `pnpm db:seed` (antes, build de `@viajapro/domain`).
- Turbo filtra variables de entorno: los secretos de prueba se añadieron a `env` de la tarea `test` en `turbo.json`.
- Las pruebas e2e necesitan `APP_ENV=local` (tenant por cabecera; no hay autenticación).
- gitleaks: dos falsos positivos históricos (token hex de una prueba unitaria; `VAR=` vacío en `.env.example`), permitidos por forma del valor en `.gitleaks.toml`.

## Decisiones
- Postgres 16 y Redis 7 como service containers; migraciones reconstruidas desde cero con las 18 migraciones. Nada propio de Neon bloqueó.
- Secretos de prueba generados en el job con `openssl rand` y exportados por `GITHUB_ENV`. No se creó ningún secreto en GitHub.

## Cola
- Redis está levantado pero `apps/api/vitest.config.ts` fija `COLA_CHANGES=inerte`: BullMQ real sigue sin probarse.
- Falta el disparador `push` de ramas y la protección de rama con los checks obligatorios (el workflow solo corre en PR a `main`, push a `main` y manual).
