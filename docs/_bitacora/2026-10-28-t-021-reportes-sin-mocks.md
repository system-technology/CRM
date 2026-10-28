# Bitácora — 2026-10-28 — T-021: Reportes sin mocks con cálculo desde API y estados «Aún sin datos»

- **Tarea:** `T-021` (Reportes sin mocks: métricas calculadas desde la API o marcadas como no disponibles)
- **Rama:** `b/T-021-reportes-sin-mocks`
- **Autor:** Antigravity (`frontend`)

## Contexto y Motivación
La pantalla de reportes comerciales (`apps/web/src/app/reportes/page.tsx`) importaba estructuras y datasets de muestra directamente desde `mock-reportes.ts`. El objetivo de T-021 es desacoplar la vista de datos inventados:
1. Eliminar cualquier import de `mock-reportes` en `page.tsx`.
2. Extraer los tipos canónicos a `reportes-logica.ts`.
3. Calcular las métricas comerciales agregadas en tiempo real a partir del `TableroPipeline` provisto por la API del CRM.
4. Para toda métrica no proporcionada por los servicios actuales del backend (comparación con períodos anteriores, meta comercial mensual, SLA de WhatsApp), marcarla como `null` y renderizar explícitamente distintivos o estados «Aún sin datos».
5. Mantener la confidencialidad de márgenes comerciales y costos netos (R10 / ADR-0011).
6. Garantizar accesibilidad ergonómica con objetivos táctiles `>= 44px` (WCAG 2.5.5).

## Cambios Realizados
1. `apps/web/src/lib/reportes-logica.ts`:
   - Definición de tipos canónicos exportados (`RangoPeriodo`, `RolVistaReporte`, `VentaPorDestino`, `EtapaConversion`, `RendimientoAsesor`, `ReporteComercial`).
   - Implementación de `calcularReporteDesdePipeline(tablero, rol, periodo)` que agrega ventas ganadas, tasa de conversión y ventas por destino a partir del tablero, dejando ausentes en `null` las métricas no soportadas por la API actual.
   - Preservación de `filtrarMetricasPorRol` para cumplimiento de confidencialidad R10 (costo neto y margen ocultos a asesores).
2. `apps/web/src/lib/mock-reportes.ts`:
   - Se refactorizó para importar los tipos desde `reportes-logica.ts` (R3: sin redefinición de tipos).
   - Se añadió `tieneDatosReales: true` a las entradas de muestra para modo demo.
3. `apps/web/src/app/reportes/page.tsx`:
   - Cero imports de `mock-reportes`.
   - Consulta asíncrona de `obtenerTableroPipeline()` en `useEffect` con soporte para modo demo dinámico (`esModoDemo()`).
   - Renderizado condicional de métricas ausentes con distintivos y textos «Aún sin datos».
   - Estados vacíos informativos en ventas por destino, embudo y rendimiento de asesores cuando no hay datos.
   - Dimensionamiento táctil de selectores y conmutadores a `min-h-[44px]`.
4. `apps/web/src/lib/reportes-logica.spec.ts`:
   - 8 pruebas unitarias exhaustivas verificando operaciones BigInt R8, tasa de conversión protegida contra división por cero, roles R10, y el cálculo de métricas reales y valores `null`.

## Verificación Monorepo
- `pnpm --filter @viajapro/web test`: 109 suites, 886 tests en verde.
- `pnpm typecheck`: 5 paquetes en verde.
- `pnpm lint`: 100% limpio.
- `pnpm test:hooks`: 59/59 políticas de rama, 19/19 guardianes de secretos, 6/6 fronteras entre módulos.
