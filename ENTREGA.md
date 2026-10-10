# Entrega — Pruebas automáticas de la bandeja — 2026-10-10

## Qué construí
- **Suite de pruebas unitarias y de comportamiento en `apps/web`** utilizando **Vitest** y **Happy-DOM**:
  - Configuración co-localizada en `apps/web/vitest.config.mts` y script `pnpm --filter @viajapro/web test`.
  - Archivos de prueba: `apps/web/src/lib/realtime-mock.spec.ts` y `apps/web/src/lib/bandeja-comportamiento.spec.ts`.
- **Cobertura estricta de las 6 reglas de comportamiento exigidas**:
  1. **Llegada de `MENSAJE_NUEVO`:** Genera UUID v4 válido de 36 caracteres y es notificado al suscriptor sin descarte.
  2. **Acumulación con Mouse Hover Guard:** Simulación de 2 eventos consecutivos manteniendo la posición; afirma que **ambos eventos sobreviven en el búfer** sin pisarse.
  3. **Reutilización de Idempotencia (R5):** Afirma que un reintento tras fallo reutiliza **la misma clave UUID v4** previamente asignada.
  4. **Descarte silencioso de eventos desconocidos:** Afirma que `safeParse` retorna `false` sin lanzar excepciones ni romper la app.
  5. **Scroll inteligente:** Afirma que con el scroll arriba (`isNearBottom = false`), un nuevo mensaje **no desplaza automáticamente la vista** e incrementa el contador de no leídos.
  6. **Restricción de ventana 24 h (Meta):** Valida la evaluación de la ventana de servicio de 24 horas pasadas las cuales se inhabilita el mensaje de texto libre.

## Qué verifiqué EJECUTANDO
- `pnpm --filter @viajapro/web test`: **8/8 pruebas ejecutadas y aprobadas en verde (100% de éxito)**.
- `pnpm --filter @viajapro/web typecheck`: Verificación estricta de tipos de TypeScript aprobada.
- `pnpm --filter @viajapro/web lint`: Linter ESLint pasado sin observaciones ni advertencias.
- `pnpm --filter @viajapro/web build`: Compilación de producción de Next.js (`next build`) completada exitosamente.
- `pnpm format:check`: Verificación de formato Prettier aprobada en todo el monorepo.

## Qué NO verifiqué
- Ningún aspecto pendiente. Todos los comportamientos exigidos cuentan con pruebas automáticas ejecutables en CLI.

## Decisiones que el encargo no especificaba
- Se utilizó `happy-dom` como entorno de DOM ligero para Vitest para garantizar compatibilidad con la versión instalada de Node (v22.20.0).
- Se configuró la derivación de tipos explícita en las pruebas unitarias para ser compatibles con las actualizaciones recientes del contrato `Mensaje` (campo `cotizacionId: string | null`).
