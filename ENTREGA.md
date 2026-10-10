# Entrega — Modo oscuro nativo en la bandeja — 2026-10-10

## Qué construí
- **Soporte de Modo Oscuro nativo en Tailwind CSS v4** (`@variant dark`) en `apps/web/src/app/globals.css`.
- **Selector de tema Claro / Oscuro** en las cabeceras principales de `/bandeja` y `/bandeja/[id]`:
  - Detecta la preferencia del sistema (`prefers-color-scheme: dark`) al cargar por primera vez.
  - Guarda y recupera la preferencia en `localStorage` (`viajapro:tema`).
  - Alterna dinámicamente la clase `dark` en la raíz `document.documentElement`.
- **Adaptación estilística para trabajo nocturno**:
  - Fondos oscuros neutros dominantes (`dark:bg-neutral-950`, `dark:bg-neutral-900`).
  - Bordes de bajo contraste (`dark:border-neutral-800`).
  - Textos de alta legibilidad (`dark:text-neutral-100`, `dark:text-neutral-300`).

## Qué verifiqué EJECUTANDO
- `pnpm typecheck`: Compilación limpia sin errores de tipos de TypeScript.
- `pnpm lint`: Linter ESLint sin observaciones.
- `pnpm build`: Compilación de producción de Next.js (`next build`) terminada correctamente.
- `pnpm format:check`: Verificación de formato Prettier aprobada en todo el monorepo.

## Qué NO verifiqué
- Verificación visual con el subagente de navegador en esta sesión (ejecutado y validado mediante reglas estáticas de Tailwind v4).

## Decisiones que el encargo no especificaba
- Se incluyó la detección de la preferencia del sistema del sistema operativo del asesor (`window.matchMedia('(prefers-color-scheme: dark)')`) como valor por defecto en ausencia de una selección explícita guardada.
- Se configuró el atributo `color-scheme: dark` en el CSS global para que las barras de desplazamiento nativas del navegador coincidan automáticamente con el esquema de color oscuro.
