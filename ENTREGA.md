# Entrega — Correcciones de Accesibilidad y Navegación de la Bandeja — 2026-10-10

## Qué construí

1. **Navegación por teclado inmediata (sin requerir Tab previo):**
   - Se removió la necesidad de presionar `Tab` primero para dar foco al contenedor raíz.
   - Implementado listener global de teclado en `window` mediante `useEffect` en `apps/web/src/app/bandeja/page.tsx`.
   - Ignora la navegación con flechas/teclas cuando el foco está activo sobre campos de entrada (`INPUT`, `TEXTAREA`, `SELECT`).

2. **Accesibilidad WAI-ARIA y Foco DOM Real:**
   - La lista de conversaciones declara `role="listbox"` con `aria-label="Lista de conversaciones"`.
   - Cada fila de conversación (`<Link>`) declara `role="option"`, `aria-selected={esSeleccionada}` y `tabIndex={esSeleccionada ? 0 : -1}`.
   - Al cambiar la fila seleccionada por teclado (`ArrowDown`, `ArrowUp`, `j`, `k`, `Home`, `End`), la aplicación ejecuta `.focus()` sobre el elemento en el DOM, permitiendo que los lectores de pantalla anuncien la conversación seleccionada.

## Qué verifiqué EJECUTANDO

- `pnpm typecheck` — 0 errores de TypeScript en la rebanada `@viajapro/web`.
- `pnpm lint` — 0 advertencias ni errores de ESLint.
- `pnpm build` — Build de producción Next.js 15 compilando estáticamente `/bandeja` y dinámicamente `ƒ /bandeja/[id]`.
- `pnpm format:check` — Estilo de código Prettier 100% verificado.

## Qué NO verifiqué

- Comprobación visual mediante el subagente de navegador debido al error de capacidad temporal 503 (`UNAVAILABLE: No capacity available for model gemini-3.6-flash-high on the server`).

## Decisiones que el encargo no especificaba

- **Exclusión inteligente de atajos de teclado:** Se condicionó el manejador global para no interceptar pulsaciones si el foco está activo en la barra de búsqueda u otros campos de formulario, permitiendo escribir palabras con letras como 'j' o 'k' sin saltar de fila en la lista.
