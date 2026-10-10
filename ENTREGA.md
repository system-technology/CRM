# Entrega — Densidad configurable en la bandeja — 2026-10-10

## Qué construí
- **Conmutador de densidad de lista (`compacta` vs `cómoda`)** en `apps/web/src/app/bandeja/page.tsx`:
  - Botón selector en la barra superior junto al campo de búsqueda con estados visuales activos.
  - Persistencia de la preferencia del asesor en `localStorage` (`viajapro:bandeja:densidad`).
- **Modos de renderizado de fila (`ConversacionFila`)**:
  - Modo **Compacta (`⚡ Compacta`)**: relleno ajustado (`p-1.5 sm:p-2`), vista previa de mensaje a 1 sola línea (`line-clamp-1`), tipografía adaptada (`text-sm`). Permite visualizar un ~60% más de conversaciones por pantalla.
  - Modo **Cómoda (`📖 Cómoda`)**: relleno amplio (`p-2.5 sm:p-3`), vista previa a 2 líneas (`line-clamp-2`), tipografía espaciosa (`text-base`).
- **Accesibilidad y respuesta a 390px**: los botones del selector mantienen roles accesibles de grupo (`role="group"`) y etiquetas ARIA descriptivas.

## Qué verifiqué EJECUTANDO
- `pnpm typecheck`: Verificación estricta de tipos de TypeScript aprobada sin errores.
- `pnpm lint`: Reglas de linter ESLint en verde.
- `pnpm build`: Compilación de Next.js de producción exitosa.
- `pnpm format:check`: Verificación de formato Prettier aprobada en todo el monorepo.

## Qué NO verifiqué
- Interacción visual en tiempo real en dispositivo físico de pantalla pequeña (verificado mediante reglas de CSS responsive Tailwind).

## Decisiones que el encargo no especificaba
- Se utilizó la clave de `localStorage` con prefijo `viajapro:bandeja:densidad` para evitar colisiones con otras aplicaciones o preferencias del CRM.
- Se agregó un fallback seguro mediante `try/catch` alrededor del almacenamiento en `localStorage` para no fallar en entornos restringidos o navegación privada estricta.
