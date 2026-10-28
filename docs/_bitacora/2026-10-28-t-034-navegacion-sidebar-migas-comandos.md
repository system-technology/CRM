# Bitácora de Implementación — T-034: Navegación más rica (barra lateral con iconos de color, migas, paleta de comandos y accesos rápidos)

**Fecha:** 2026-10-28  
**Rama:** `b/T-034-navegacion-sidebar-migas-comandos`  
**Carril:** `b` (Frontend / Web)  
**Stitch Design Screen ID:** `14a4e161532b449c8001be6656399ee2` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Navegación Enriquecida & Paleta de Comandos (Ctrl+K) — ViajaPro CRM*)

---

## 1. Contexto y Objetivos

La tarea **T-034** del roadmap aborda la experiencia de navegación de los asesores de agencias de turismo que trabajan jornadas completas en ViajaPro:
1. **Barra lateral expandible / contraíble:**
   - Visualización por módulos con códigos de color caribeños (`CONFIGURACION_MODULOS`) y etiquetas claras.
   - Indicador animado de sección activa con aro dorado de marca (`#c9a24b`) y fondo sutil turquesa/marino.
   - Botón toggle de colapso con atajo `Alt+S` y persistencia en `localStorage` (`viajapro_sidebar_expandida`).
   - En resoluciones móviles (< 768 px), la barra lateral se oculta y pasa a una barra inferior fija con touch targets `>= 44 px`.
2. **Migas de pan accesibles (`MigasDePan`):**
   - Jerarquía semántica WAI-ARIA (`<nav aria-label="Migas de pan">`, `<ol>`, `aria-current="page"`).
   - Integradas en las pantallas de detalle clave (`/bandeja/[id]` y `/cotizaciones/[id]`) con botón de retorno contextual.
3. **Paleta de Comandos Flotante Omnibox (`Ctrl+K` / `Cmd+K`):**
   - Modal omnicanal tipo Spotlight con búsqueda instantánea de contactos viajeros, cotizaciones, paquetes del catálogo y saltos directos a módulos.
   - Pestañas con filtros temáticos accesibles (`[Todos]`, `[WhatsApp]`, `[Catálogo]`, `[Cotizaciones]`, `[Contactos]`, `[Acciones]`).
   - Navegación íntegra por teclado (`↑ ↓`, `↵`, `Esc`, `Tab`).
4. **Accesos rápidos operacionales:**
   - Botón prominente de «Nueva cotización» en el chat y accesos contextuales para minimizar pasos repetitivos.

---

## 2. Archivos Modificados y Creados

- `apps/web/src/components/comun/migas-de-pan.tsx` (Nuevo): Componente accesible de migas de pan con soporte para botón de retorno y touch targets `>= 44 px`.
- `apps/web/src/components/comun/migas-de-pan.spec.tsx` (Nuevo): 3 pruebas unitarias verificando estructura semántica, atributo `aria-current="page"` y botón de retorno.
- `apps/web/src/components/comun/index.ts`: Exportación de `MigasDePan`.
- `apps/web/src/lib/buscador-global-logica.ts`: Incorporación de categoría `cotizaciones`, indexación de `MOCK_COTIZACIONES_INICIALES` y soporte para filtros por categoría.
- `apps/web/src/lib/buscador-global-logica.spec.ts`: 11 pruebas unitarias cubriendo indexación de cotizaciones y filtros.
- `apps/web/src/components/busqueda/modal-busqueda-global.tsx`: Evolución a Paleta de Comandos con pestañas temáticas, aro dorado en selección activa, guía de atajos de teclado y categoría de cotizaciones.
- `apps/web/src/components/busqueda/modal-busqueda-global.spec.tsx` (Nuevo): 5 pruebas unitarias verificando renderizado, filtrado por pestaña, búsqueda y navegación con teclado.
- `apps/web/src/components/bandeja/barra-modulos.tsx`: Barra lateral interactiva expandible (`w-60`) y contraíble (`w-14`), con toggle accesible, iconos de color, aro dorado de sección activa, perfil del asesor expandido y atajo `Alt+S`.
- `apps/web/src/components/bandeja/barra-modulos.spec.tsx`: 17 pruebas unitarias verificando navegación, toggle expandible/contraíble y persistencia en `localStorage`.
- `apps/web/src/app/bandeja/[id]/page.tsx`: Integración de `MigasDePan` en la cabecera de la conversación.
- `apps/web/src/app/cotizaciones/[id]/page.tsx`: Integración de `MigasDePan` en la cabecera de la cotización guardada.

---

## 3. Verificación de Compuertas

- `pnpm --filter @viajapro/web test`: **60 archivos de prueba, 497/497 pruebas en verde (100%)**.
- `pnpm typecheck`: **9/9 paquetes en verde** (`tsc --noEmit` exit 0, compilación de 16 rutas Next.js sin errores).
- `pnpm lint`: **7/7 paquetes en verde** (0 errores, 0 advertencias).
- `pnpm test:hooks`: **59/59 casos de política de rama en verde, 19/19 secretos en verde, 6/6 fronteras en verde**.
- `node scripts/check-ownership.mjs`: **✔ Dentro del carril (`carril: b`)**.
