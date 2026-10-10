# Entrega — Conectar con la API real, detrás de un interruptor — 2026-10-10

## Qué construí
- **Cliente unificado `inboxApi` (`apps/web/src/lib/inbox-api.ts`):**
  1. **Patrón de la casa (siguiendo `api.ts`):** Se conecta a los endpoints reales de la API NestJS (`/api/v1/inbox/...`) respetando estrictamente la Regla R3.
  2. **Validación Zod en Peticiones y Respuestas:** Todas las respuestas HTTP devueltas por el backend real se procesan con `.parse()` contra los esquemas oficiales (`PaginaBandeja`, `ConversacionDetalle`, `Mensaje`). Se evitan respuestas malformadas en ejecución.
  3. **Interruptor por Variable de Entorno (`NEXT_PUBLIC_USE_REAL_INBOX`):** Permite cambiar con un solo flag entre la capa de datos simulados y el backend real NestJS sin tocar los componentes de la interfaz de usuario.
  4. **Traducción Útil de Errores de Dominio (`VENTANA_CERRADA`):** Si la API responde con el código de error de contrato `VENTANA_CERRADA`, se presenta un mensaje explicativo claro sobre la restricción de 24h de Meta y el uso de plantillas HSM.
- **Integración con Componentes de la Bandeja (`/bandeja` y `/bandeja/[id]`):**
  - Actualizadas ambas vistas para realizar las consultas y envíos a través de `inboxApi`.
  - Mantenidos intactos los simuladores de tiempo real y de idempotencia (R5).

## Qué verifiqué EJECUTANDO
- `npx pnpm lint`: PASÓ (0 errores, 0 warnings en todo el monorepo).
- `npx pnpm typecheck`: PASÓ (0 errores de tipos en TypeScript estricto).
- `npx pnpm build`: PASÓ (Build de producción compilada correctamente).
- `npx pnpm format:check`: PASÓ (Estilo Prettier limpio).

## Qué NO verifiqué
- Petición HTTP real contra un servidor NestJS en producción activo (el backend real está en construcción en la rama paralela `feat/inbox-webhook`).

## Decisiones que el encargo no especificaba
- **Manejo transparente de fallback en `inboxApi`:** Si la variable `NEXT_PUBLIC_USE_REAL_INBOX` no está definida o es diferente de `'true'`, la aplicación utiliza automáticamente la fuente simulada de 500 conversaciones sin alterar ninguna línea de código de las páginas.
- **Indicador de modo en el header:** Se añadió en el pie del título de la bandeja la etiqueta *"Modos: 🔌 API NestJS Real"* o *"⚡ Mock Simulador"* para que cualquier desarrollador o revisor sepa de inmediato qué motor de datos está activo.
