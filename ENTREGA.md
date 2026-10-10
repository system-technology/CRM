# Entrega — Rebanada Vertical Completa de la Bandeja Web — 2026-10-10

## Qué construí

1. **Navegación por teclado inmediata y Accesibilidad WAI-ARIA:**
   - Listener global de teclado en `window` mediante `useEffect` en `apps/web/src/app/bandeja/page.tsx` (funciona sin pulsar Tab previo).
   - Ignora la navegación por flechas cuando el foco está activo sobre campos de entrada (`INPUT`, `TEXTAREA`, `SELECT`).
   - La lista declara `role="listbox"` y cada fila `<Link>` declara `role="option"`, `aria-selected={esSeleccionada}` y `tabIndex={esSeleccionada ? 0 : -1}`.
   - Invoca `.focus()` en el DOM al seleccionar por teclado para que los lectores de pantalla anuncien el elemento.

2. **Soporte Completo de Tipos de Contenido (`TipoContenido`):**
   - Renderizado enriquecido para `TEXTO`, `IMAGEN`, `DOCUMENTO` (con peso KB/MB), `AUDIO` (reproductor HTML5), `VIDEO`, `UBICACION`, `CONTACTO`, `PLANTILLA`, `INTERACTIVO`, `REACCION` y fallback `NO_SOPORTADO`.

3. **Eventos de Tiempo Real (`EventoBandeja` & `useInboxRealtime`):**
   - Hook `useInboxRealtime` que escucha eventos de websocket/SSE (`MENSAJE_NUEVO`, `MENSAJE_ACTUALIZADO`, `CONVERSACION_ACTUALIZADA`).
   - **Regla del contrato R3:** Ignora tipos de eventos desconocidos en silencio con `safeParse` sin romper la interfaz.

4. **TypeScript Estricto (Sin `any`):**
   - Se eliminaron todos los tipos `any` o aserciones inseguras en la capa de interfaz y tiempo real.

## Qué verifiqué EJECUTANDO

- `pnpm typecheck` — 0 errores de TypeScript en la rebanada `@viajapro/web`.
- `pnpm lint` — 0 advertencias ni errores de ESLint.
- `pnpm build` — Build de producción Next.js 15 compilando estáticamente `/bandeja` y dinámicamente `ƒ /bandeja/[id]`.
- `pnpm format:check` — Estilo de código Prettier 100% verificado.

## Qué NO verifiqué

- Comprobación visual mediante el subagente de navegador debido al error de capacidad temporal 503 (`UNAVAILABLE: No capacity available for model gemini-3.6-flash-high on the server`).

## Decisiones que el encargo no especificaba

- **Exclusión inteligente de atajos de teclado:** Se condicionó el manejador global para no interceptar pulsaciones si el foco está activo en la barra de búsqueda u otros campos de formulario.
- **Renderizado nativo de audio:** Se utilizó la etiqueta HTML5 `<audio controls>` para notas de voz de WhatsApp recibidas.
