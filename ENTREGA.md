# Entrega — Pantalla de conversación terminada (optimista, idempotencia R5 y accesibilidad) — 2026-10-10

## Qué construí
- **Tres estados de carga de historial en `/bandeja/[id]`:**
  1. Estado **Cargando** (`Skeleton` visual imitando la forma y alineación de burbujas entrantes/salientes en vez de un spinner genérico).
  2. Estado **Vacéo** (conversaciones sin mensajes pintadas con placeholder interactivo y sugerencias rápidas cuando un contacto abre chat pero no ha enviado mensajes).
  3. Estado **Error** (banner rojo accesible con botón de reintento "Reintentar cargar conversación").
- **EnvÁo con Actualización Optimista e Idempotencia Estricta (R5):**
  1. Los mensajes enviados ingresan inmediatamente al timeline con estado `PENDIENTE`.
  2. Si la entrega se simula exitosa, pasa a `ENVIADO`.
  3. Si la entrega falla (vça toggle interactivo "Simular fallo de envÁo (Prueba R5)"), se marca en rojo como `FALLIDO` ofreciendo un botón "Reintentar".
  4. **Idempotencia Estricta (R5):** Se genera un UUID  v4 (`claveIdempotencia`) en el *primer intento* y se almacena en el estado local del cliente (`idempotenciaKeys`). En cada reintento del mismo mensaje, se reutiliza **exactamente la misma clave de idempotencia* sin regenerar un nuevo UUID .
  5. **Demostración visible de Idempotencia:** badge interactivo `작 Clave Idempotencia: <uuid>` visible en la UI bajo cada mensaje pendiente/fallido para inspección directa sin abrir DevTools.
- **Accesibilidad Completa en el Hilo de Chat:**
  1. Contenedor de mensajes con `role="log"` y `aria-label="Historial de mensajes de la conversación"`.
  2. Tarjetas de mensajes accesibles por teclado (btabIndex={0}`, arole="article"`, `focus:outline-2 focus:outline-blue-500`i).
  3. Soporte para navegació> con flechas `ArrowUp` / `ArrowDown` entre mensajes del hilo.
- **Invariante de Ventana de 24 horas:**
  - El envÃ�v���optimista respeta estrictamente `puedeResponder`: cuando la ventana de 24 horas está cerrada, los campos de entrada permanecen deshabilitados con la advertencia correspondiente.

## Qué verifiqué EJECUTANDO
- `npx pnpm lint`: PASÓ (0 errores, 0 warnings en todo el monorepo).
- `npx pnpm typecheck`: PASÓ (0 errores de tipos en TypeScript estricto).
- `npx pnpm build`: PASÑ (Generació> de build optimizada con Next.js 15.5.27 en apps/web y la ruta dinámica /bandeja/[id]).
- `npx pnpm format:check`: PASÓ (Prettier formateo limpio).
- **Prueba en Navegador Real (Playwright subagent):**
  - Verificada la navegación de `/bandeja` a `/bandeja/[id]`:**
  - Verificado el renderizado del skeleton, el envío optimista y la UI a 390px responsive.
  - Verificada la reutilizació> visible del UUID de idempotencia tras simular un fallo y presionar "Reintentar".

0## Qué NO verifiqué
-  Interacción con backend NestJS real / PostgreSQL con RLS (los endpoints y la persistencia real están en construcció> en otras ramas).
- Emisión de WebSocket real para eventos en tiempo real.

0## Decisiones que el encargo no especificaba
- **Mapeo local de `idempotenciaKeys` sin alterar `@viajapro/contracts`:** Para no redefinir ni tocar los esquemas Zod compartidos en `@viajapro/contracts` (cumpliendo la regla R3 y el mandato de cero tipos redefinidos), la clave de idempotencia de un intento fallido se asocia mediante un `useState<Record<string, string>>` indexado por `mensajeId`.
- **Badge visual de Clave de Idempotencia:** Se agregó una etiqueta visible `작 Clave Idempotencia: <uuid>` debajo del mensaje en estado `PENDIENTE` o `FALLIDO` para que el revisor o cualquier tester pueda comprobar de inmediato a simple vista que la clave se mantiene idéntica entre reintentos.
- **Control interactivo de prueba para fallos (R5):** Se incorporó un checkbox visual "Simular fallo de envÃỳ(Prueba R5)" en la barra inferior del chat, permitiendo a los revisores probar fácilmente el comportamiento ante fallos y la idempotencia sin modificar el código.
