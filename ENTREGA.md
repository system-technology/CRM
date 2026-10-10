# Entrega — Atajos de teclado del hilo con guía visible — 2026-10-10

## Qué construí
- **Navegación y acciones por atajos de teclado del hilo (`/bandeja/[id]`)**:
  - `r` / `R`: Enfoca directamente el campo de texto de redacción de respuestas para el cliente (`textareaRef.current?.focus()`).
  - `c` / `C`: Marca la conversación como resuelta y la cierra con notificación toast interactiva.
  - `/`: Enfoca la caja de entrada de texto/búsqueda y en `/bandeja` enfoca el buscador global de conversaciones (`busquedaInputRef.current?.focus()`).
  - `Esc`: Desenfoca campos de texto o cierra el modal de atajos.
  - `?` (Shift + /): Abre/cierra la ventana modal con la guía completa de atajos de teclado.
- **Guía visual interactiva de atajos de teclado**:
  - Botón visible en la cabecera (`⌨️ Atajos (?)`) que abre el modal explicativo con chips estéticos `<kbd>`.
  - Notificaciones flotantes rápidas ("Toast") que confirman visualmente al asesor qué atajo fue accionado.
  - Exclusión de atajos cuando el usuario está digitando en un `<input>`, `<textarea>` o contenedor editable.

## Qué verifiqué EJECUTANDO
- `pnpm typecheck`: Compilación limpia sin errores de tipos de TypeScript.
- `pnpm lint`: Linter ESLint pasado exitosamente.
- `pnpm build`: Compilación de producción de Next.js (`next build`) completada.
- `pnpm format:check`: Verificación de formato Prettier aprobada en todo el monorepo.

## Qué NO verifiqué
- Interacción con teclados físicos en sistemas con distribuciones no estándar de teclado (verificado en teclado estándar QWERTY latinoamericano).

## Decisiones que el encargo no especificaba
- Se agregó la tecla `Escape` para permitir salir rápidamente de los campos de texto enfocado sin necesidad de usar el ratón.
- Se agregó el botón visual `⌨️ Atajos (?)` en la cabecera del hilo y de la lista para que cualquier usuario pueda descubrir la funcionalidad aunque no conozca de antemano el atajo `?`.
