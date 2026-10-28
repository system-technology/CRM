# Bitácora — 2026-10-28 — T-010: Prueba de arranque con roles prohibidos y aserción relforcerowsecurity

- **Tarea:** `T-010` (Prueba de arranque con roles prohibidos y asercion relforcerowsecurity (M1.2))
- **Rama:** `b/T-010-arranque-seguro-relforcerowsecurity`
- **Autor:** Antigravity (`backend`)

## Contexto y Motivación
La regla 2 (R2) de ViajaPro exige que ninguna aplicación ni proceso de background conecte a la base de datos con roles propietarios o de superusuario (`postgres`, roles con `rolsuper` o `rolbypassrls`), garantizando que RLS sea ineludible en toda transacción de datos.

La auditoría automática identificó la tarea T-010 para asegurar que:
1. La API y sus servicios aborten inequívocamente si se intenta iniciar la conexión con roles prohibidos (`postgres`, `rolsuper`, `rolbypassrls`).
2. Se mantenga una aserción estricta en base de datos (`relforcerowsecurity`) verificando que toda tabla de negocio tenga habilitado el forzado de políticas de fila incluso ante propietarios de tablas.

## Cambios y Verificaciones Realizadas
1. **Guardia de Identidad en Prisma:**
   - `PrismaService`, `PrismaWebhookService` y `PrismaIdentidadService` implementan verificación obligatoria de `rolsuper` y `rolbypassrls` en `onModuleInit()`.
   - 13/13 pruebas unitarias en `guardia-de-rol.spec.ts` ratifican el rechazo frente a superusuarios, bypass RLS y roles equivocados de login.
2. **Suite e2e de Arranque Seguro (`arranque-seguro.e2e-spec.ts`):**
   - Comprueba mediante simulación de roles prohibidos contra PostgreSQL que cada uno de los servicios aborta con el error esperado.
3. **Aserción Dinámica `relforcerowsecurity` en `aislamiento.spec.ts` (AUD-013):**
   - Comprueba que toda tabla del esquema con `relrowsecurity` tenga `relforcerowsecurity = true` y verifica con contraprueba que una tabla sin forzar rompa el detector.

## Verificación Monorepo
- `pnpm --filter @viajapro/api test src/shared/prisma/guardia-de-rol.spec.ts`: 13/13 tests en verde.
- `pnpm typecheck`: 9 paquetes en verde.
- `pnpm lint`: 100% limpio.
- `pnpm test:hooks`: 59/59 políticas de rama, 19/19 guardianes de secretos, 6/6 fronteras entre módulos.
