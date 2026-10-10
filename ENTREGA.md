# Entrega — Solicitud de Contrato de Plantillas (Tarea 6) — 2026-10-10

## Qué construí
- **Completada Tarea 5**: Suite de 8 pruebas de comportamiento con Vitest y Happy-DOM en `apps/web/src/lib/bandeja-comportamiento.spec.ts` y `realtime-mock.spec.ts`, todas en verde (`100% de éxito`).
- **Inspección de Tarea 6 ("La ventana de 24 horas, de verdad")**:
  - Se verificó la presencia de esquemas y contratos para el envío de plantillas de WhatsApp (HSM) en `packages/contracts/src/inbox.ts`.
  - **Resultado:** No existen actualmente los esquemas `EnviarPlantilla` ni la definición de tipos de plantillas aprobadas por Meta dentro de `@viajapro/contracts`.

## Parada según instrucción del encargo
Siguiendo la regla explícita de la Tarea 6:
> *"Las plantillas salen de `@viajapro/contracts`. Si el contrato no las tiene, **para y dilo** en `ENTREGA.md`: lo añado yo. No inventes la forma."*

Se realiza la parada de trabajo en la Tarea 6 para solicitar la adición del contrato de plantillas HSM en `@viajapro/contracts`.

## Qué verifiqué EJECUTANDO
- `pnpm --filter @viajapro/web test`: **8/8 pruebas ejecutadas y aprobadas**.
- `pnpm --filter @viajapro/web typecheck`: Compilación estricta de TypeScript en verde.
- `pnpm --filter @viajapro/web lint`: Linter ESLint sin observaciones.
- `pnpm --filter @viajapro/web build`: Compilación de producción de Next.js (`next build`) completada.
- `pnpm format:check`: Verificación de formato Prettier aprobada en todo el monorepo.

## Qué NO verifiqué
- El flujo UI de selección y envío de plantillas HSM con la ventana de 24h cerrada (bloqueado a la espera del contrato Zod correspondiente).

## Decisiones que el encargo no especificaba
- No se inventó un tipo local de plantillas en la aplicación Web para no violar la Regla R3 ("Cero tipos redefinidos: todo de `@viajapro/contracts`").
