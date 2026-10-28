# Bitácora — 2026-10-28 — T-111: Modo oscuro y preferencia de densidad con la paleta de turismo

- **Autor:** Antigravity (`frontend`)
- **Tarea:** `T-111` (roadmap/tasks.yaml)
- **Rama:** `b/T-111-modo-oscuro-densidad`
- **Estado:** Completada y lista para integración

## Contexto y Necesidad
En agencias de turismo con jornadas continuas intensivas de 8 horas gestionando cotizaciones, reservas y chats de WhatsApp, la fatiga visual es un problema operativo relevante. Asimismo, los asesores con pantallas compactas o portátiles requieren aprovechar al máximo el espacio vertical mediante densidad compacta de filas e información.

## Decisiones de Arquitectura e Implementación

1. **Modelo Puro de Tema y Densidad (`tema-y-densidad.ts`):**
   - Modos: `'light' | 'dark' | 'system'`.
   - Densidades: `'comoda' | 'compacta'`.
   - `resolverTemaEfectivo`: función pura que determina si el tema efectivo a aplicar es `'light'` o `'dark'`.
   - `suscribirCambiosSistema`: escucha reactiva a cambios de `matchMedia('(prefers-color-scheme: dark)')` para reflejar automáticamente cambios de configuración en el sistema operativo del usuario.

2. **Garantía Anti-FOUC (Zero Flicker):**
   - Inyección síncrona en `<head>` de `layout.tsx` de `SCRIPT_ANTI_FOUC`.
   - Lee síncronamente antes de la primera pintura `localStorage.getItem('viajapro_tema')` y `viajapro_densidad`, activando la clase `.dark` e inyectando `data-densidad` sin salto visual ni destello blanco.
   - Respeto a CSP: lectura dinámica del `x-nonce` vía `headers()` de Next.js para adjuntarlo a la etiqueta script.
   - `suppressHydrationWarning` en `<html>` para evitar desincronizaciones de SSR/cliente.

3. **Componente Reutilizable Accesible (`SelectorTemaDensidad`):**
   - Radiogroups accesibles con touch targets mínimos de 44px (WCAG 2.5.5).
   - Opciones accesibles por teclado y con contraste verificado AA.
   - Modo compacto para inserción en popover o sidebar.

4. **Integración en la Barra de Módulos (`barra-modulos.tsx`):**
   - Botón de alternancia rápida tri-estado: Claro -> Oscuro -> Sistema.
   - Selector incrustado en el modal de perfil de sesión del asesor.

5. **Privacidad y Cookies (`privacidad-cookies.ts`):**
   - Inclusión de `viajapro_densidad` en `INVENTARIO_COOKIES` bajo categoría `PREFERENCIAS`.

## Verificación
- 13 tests unitarios en `tema-y-densidad.spec.ts`.
- 5 tests unitarios en `selector-tema-densidad.spec.tsx`.
- 21 tests de integración en `barra-modulos.spec.tsx`.
- 4 tests de touch targets en `revision-375px.spec.tsx`.
- 109 suites y 883 tests unitarios en `@viajapro/web` en verde.
- `pnpm typecheck` limpio en todos los paquetes.
- `pnpm lint` 0 errores.
- `pnpm test:hooks` limpio (59/59).
