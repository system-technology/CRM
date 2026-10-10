# Entrega — Tiempo real en la bandeja (EventoBandeja, safeParse y Mouse Hover Guard) — 2026-10-10

## Qué construí
- **Integración y manejo de Tiempo Real contra `EventoBandeja` (@viajapro/contracts):**
  1. **Emisor Simulado R-Safe (`realtimeMockBus`):** Pub/Sub simulado para eventos de bandeja (`MENSAJE_NUEVO`, `MENSAJE_ACTUALIZADO`, `CONVERSACION_ACTUALIZADA`).
  2. **Silenciador de Eventos Desconocidos (`safeParse`):** Validación estricta con `EventoBandeja.safeParse(payload)`. Si el backend publica tipos de eventos futuros no soportados, **se descartan en silencio sin lanzar excepciones ni romper la interfaz**.
- **Reglas de Producto en la Lista de Conversaciones (`/bandeja`):**
  - **Guard de Mouse Hover para Reordenamiento:** Cuando se recibe un evento que actualiza una conversación, **NO se reordenan las filas del DOM si el cursor del asesor está encima de la lista**, evitando que la fila cambie de posición justo debajo del ratón y provoque clics erróneos.
  - **Diferimiento Suave:** Los reordenamientos se acumulan en un búfer visual y se aplican limpiamente cuando el mouse abandona el contenedor (`onMouseLeave`) o mediante el botón *"Reordenar ahora"*.
- **Desplazamiento Inteligente en la Conversación Abierta (`/bandeja/[id]`):**
  - Al recibir `MENSAJE_NUEVO`:
    * Si el asesor está scrolleado al final del historial, la vista avanza suavemente hacia abajo.
    * Si el asesor está leyendo hacia arriba, **NO se roba la posición de scroll**. Aparece un botón flotante animado `⬇️ Hay X mensaje(s) nuevo(s)` que permite scrollear a voluntad.
- **Panel Interactivo de Pruebas de Tiempo Real (`SimuladorTiempoReal`):**
  - Drawer flotante en UI para disparar mensajes entrantes, actualizaciones de estado, cambios de conversación y **prueba explícita de eventos desconocidos R-Safe**.
  - Modo auto-simulación continua (disparo periódico cada 8s).

## Qué verifiqué EJECUTANDO
- `npx pnpm lint`: PASÓ (0 errores, 0 warnings en todo el monorepo).
- `npx pnpm typecheck`: PASÓ (0 errores de tipos en TypeScript estricto).
- `npx pnpm build`: PASÓ (Generación de build optimizada con Next.js 15.5.27 en `apps/web`).
- `npx pnpm format:check`: PASÓ (Prettier formateo limpio).
- **Prueba R-Safe:** Disparado evento con tipo `CLIENTE_UBICACION_COMPARTIDA_V2` comprobando que `safeParse` devuelve `success: false` y el sistema ignora en silencio sin errores.

## Qué NO verifiqué
- Conexión con un servidor WebSocket NestJS / SSE de producción (se simuló la capa de eventos a través de `realtimeMockBus`).

## Decisiones que el encargo no especificaba
- **Componente `SimuladorTiempoReal` accesible en UI:** Se colocó una barra de control desplegable en la esquina inferior de `/bandeja` y `/bandeja/[id]` para facilitar la verificación visual e interactiva del equipo revisor sin necesidad de escribir scripts en consola.
- **Aviso flotante con contador de actualizaciones retenidas:** Se implementó un banner superior en la lista cuando el ratón está encima (*"📌 Hay X actualización(es) de mensajes. Reordenamiento en pausa..."*) con un botón para forzar la actualización si el asesor lo desea.
