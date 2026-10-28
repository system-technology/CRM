# Bitácora — 2026-10-28 — T-013: Corregir politicaDePrecio.findFirst() sin where (riesgo de fuga silenciosa)

- **Tarea:** `T-013` (Corregir politicaDePrecio.findFirst() sin where (riesgo de fuga silenciosa))
- **Rama:** `b/T-013-politica-precio-where`
- **Autor:** Antigravity (`backend`)

## Contexto y Motivación
Durante la auditoría automática inicial se identificó que en la cotización de salidas (`apps/api/src/modules/quoting/application/cotizar-salida.use-case.ts`), la búsqueda de la política de precios de la agencia corría el riesgo de emplear `findFirst()` sin cláusula `where`, dependiendo exclusivamente del aislamiento por RLS a nivel de base de datos.
Bajo la Regla 1 (R1) del proyecto:
- Toda consulta de aplicación sobre tablas de negocio multitenant debe incluir `tenant_id` explícito en la condición `where` además de las políticas RLS.
- Si una consulta se ejecuta con un rol administrativo, en migraciones, o bajo eventualidades de bypass de RLS, jamás debe retornar registros de otra agencia.

## Cambios Realizados
1. **Verificación de Producción:**
   - Se corroboró que `cotizar-salida.use-case.ts` ejecuta `tx.politicaDePrecio.findUnique({ where: { tenantId }, select: { base: true } })`.
   - Se ratificó que no existe ningún `findFirst()` huérfano de filtro de tenant.
2. **Suite de Pruebas Unitarias (`cotizar-salida.use-case.spec.ts`):**
   - Se creó `apps/api/src/modules/quoting/application/cotizar-salida.use-case.spec.ts` con cobertura específica:
     1. Verificación de que `tx.politicaDePrecio.findUnique` recibe explícitamente `{ where: { tenantId } }`.
     2. Verificación de comportamiento en escenario de bypass RLS con múltiples políticas registradas: si la agencia en contexto no tiene política propia, se utiliza `POLITICA_POR_DEFECTO.base = 'SOBRE_EL_NETO'`, previniendo la contaminación cruzada o herencia accidental de políticas ajenas.
3. **Guardianes de Arquitectura:**
   - Se comprobó la vigencia de `apps/api/src/shared/tenant/consultas-sin-filtro.spec.ts`, garantizando que ninguna consulta en el backend se ejecute sin filtro sobre tablas sensibles.

## Verificación Monorepo
- `pnpm --filter @viajapro/api test cotizar-salida.use-case.spec.ts`: 2/2 tests en verde.
- `pnpm --filter @viajapro/api test consultas-sin-filtro.spec.ts`: 5/5 tests en verde.
- `pnpm lint`: 100% limpio en todo el monorepo.
- `pnpm typecheck`: 100% limpio en todos los paquetes.
- `pnpm test:hooks`: 59/59 políticas de rama, 19/19 guardianes de secretos, 6/6 fronteras entre módulos.
