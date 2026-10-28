# 2026-10-28 — Inventario de cookies, política y banner de consentimiento accesible (T-094 & T-095)

- **Autor:** Antigravity (IA colaborativa)
- **Rama:** `b/T-094-t-095-politica-banner-cookies`
- **Tareas cerradas:**
  - `T-094`: Inventario de cookies y almacenamiento del navegador, y política de cookies.
  - `T-095`: Banner de consentimiento de cookies: solo lo no esencial, con aceptar, rechazar y configurar, y registro de la decisión.
- **Diseño Stitch:**
  - Proyecto: `8333038101997719867`
  - Pantalla: `2c7d1f8d1494433e87f3d3abc9e8c1f4` (*Consentimiento de Cookies y Configuración de Privacidad — ViajaPro CRM*)

## Qué se construyó

1. **Documento Técnico de Inventario y Política (`docs/05-seguridad/13-inventario-y-politica-de-cookies.md`):**
   - Inventario exhaustivo y riguroso de cada cookie y clave de `localStorage` de `apps/web` y `apps/api`:
     - Cookies técnicas backend: `viajapro.session_token` (HttpOnly, Secure, 7 días), `viajapro.csrf_token` (HttpOnly, Sesión).
     - Almacenamiento frontend: `viajapro_consentimiento_cookies` (12 meses, necesaria para registro legal de consentimiento), `viajapro_tema` (preferencias), `viajapro_modo_demo` (preferencias), `_viajapro_telemetria_rendimiento` (analítica no esencial, 30 días).
   - Marco legal colombiano integrado: Ley 1581 de 2012, Decreto 1074 de 2015, Guía de Cookies de la Superintendencia de Industria y Comercio (SIC), y leyes turísticas 300 de 1996 y 2068 de 2020.
   - Actualización del índice maestro en `docs/05-seguridad/00-indice-de-politicas.md` (Política 13 en estado **Cumple**).

2. **Lógica de Privacidad y Consentimiento (`apps/web/src/lib/privacidad-cookies.ts` y `.spec.ts`):**
   - Tipos estrictos para categorías (`NECESARIAS`, `PREFERENCIAS`, `ANALITICA`) y decisiones (`ACEPTAR_TODO`, `SOLO_NECESARIAS`, `PERSONALIZADO`).
   - Métodos seguros `obtenerConsentimientoGuardado()`, `guardarConsentimiento()`, `aceptarTodasLasCookies()`, `aceptarSoloCookiesNecesarias()`, `tieneConsentimientoPara()`.
   - Limpieza automática de datos no consentidos (`limpiarDatosNoConsentidos`) y eventos reactivos de ventana (`EVENTO_CONSENTIMIENTO_ACTUALIZADO`, `EVENTO_ABRIR_MODAL_COOKIES`).
   - 14/14 pruebas unitarias pasando.

3. **Banner de Consentimiento Flotante (`apps/web/src/components/privacidad/banner-consentimiento-cookies.tsx` y `.spec.tsx`):**
   - Tarjeta flotante inferior elegante, de alto contraste en modo claro/oscuro, con touch targets ergonómicos (≥ 44 px).
   - Botones rápidos: «Aceptar todas», «Solo necesarias» (rechaza analítica y preferencias de inmediato sin fricción), «Configurar» (abre modal).
   - 6/6 pruebas unitarias pasando.

4. **Modal de Configuración Granular Accesible (`apps/web/src/components/privacidad/modal-preferencias-cookies.tsx` y `.spec.tsx`):**
   - Atrapamiento de foco accesible con `useFocoModal`.
   - Desglose por categorías con switches interactivos:
     - Cookies Necesarias: bloqueadas permanentemente en activo con badge «Siempre activas».
     - Preferencias: switch interactivo para ergonomía visual y modo demo.
     - Analítica: switch interactivo, inactivo por defecto (*opt-in* estricto).
   - 6/6 pruebas unitarias pasando.

5. **Página Pública de Política e Inventario (`apps/web/src/app/politica-cookies/page.tsx` y `.spec.tsx`):**
   - Ruta `/politica-cookies` con metadata SEO, tabla de inventario completa, guía de configuración en los principales navegadores (Chrome, Firefox, Safari, Edge) y botón interactivo para reabrir el modal de preferencias.
   - 4/4 pruebas unitarias pasando.

6. **Pie de Página Global y RootLayout (`apps/web/src/components/privacidad/pie-de-pagina-privacidad.tsx` y `apps/web/src/app/layout.tsx`):**
   - Footer minimalista con enlace directo a «Preferencias de cookies» (reapertura en cualquier momento) y «Política de cookies e inventario».
   - Inyectado en `RootLayout` con diseño responsive para 375 px y compatibilidad completa con SSR y directivas CSP (T-069).

7. **Pruebas y Verificación:**
   - 57 archivos de prueba en `@viajapro/web` con 471/471 pruebas en verde.
   - Cero errores en `pnpm typecheck`, `pnpm lint`, `pnpm test:hooks`, `verificar-fronteras.mjs` y `check-ownership.mjs`.
