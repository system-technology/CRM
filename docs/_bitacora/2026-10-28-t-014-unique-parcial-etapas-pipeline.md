# Bitácora — 2026-10-28 — T-014: Sincronizar unique parcial etapas_pipeline en schema.prisma

- **Tarea:** `T-014` (Sincronizar unique parcial etapas_pipeline en schema.prisma)
- **Rama:** `b/T-014-unique-parcial-etapas-pipeline`
- **Autor:** Antigravity (`backend`)

## Contexto y Motivación
Durante el diseño inicial de CRM (migración `20261010210000_crm_contactos_y_oportunidades`) se introdujo la columna `clave` en `etapas_pipeline` para conectar las etapas personalizables de cada agencia con el enum del contrato. En dicha migración se creó en PostgreSQL el índice:
```sql
CREATE UNIQUE INDEX "etapas_pipeline_tenant_id_clave_key"
  ON "etapas_pipeline" ("tenant_id", "clave") WHERE "clave" IS NOT NULL;
```
Este índice permite que cada agencia tenga como máximo una etapa asociada a cada clave del contrato (por ejemplo `NUEVO`, `COTIZADO`, `GANADA`), mientras que admite un número arbitrario de etapas personalizadas sin clave (`clave IS NULL`).

Sin embargo, existía una deriva de modelado documentada en `ESTADO.md:297`: `schema.prisma` no declaraba la unicidad de `[tenantId, clave]` sobre `EtapaPipeline`, impidiendo que el cliente de Prisma conociera esta restricción y privando al código de la clave compuesta `tenantId_clave` para consultas tipadas.

## Cambios Realizados
1. `packages/database/prisma/schema.prisma`:
   - Se añadió `@@unique([tenantId, clave])` al modelo `EtapaPipeline`.
   - Se agregó comentario técnico documentando su naturaleza de índice parcial en PostgreSQL (`WHERE clave IS NOT NULL`).
2. Generación de Cliente Prisma:
   - Se ejecutó `pnpm --filter @viajapro/database build` (`prisma generate`), actualizando las interfaces del cliente de datos.

## Verificación Monorepo
- `prisma validate`: Schema validado sin errores.
- `pnpm typecheck`: 9 paquetes limpios.
- `pnpm lint`: 100% limpio en todo el monorepo.
- `pnpm test:hooks`: 59/59 políticas de rama, 19/19 guardianes de secretos, 6/6 fronteras entre módulos.
