# Bitácora — 2026-10-28 — T-103: Búsqueda global y filtros guardados en bandeja, contactos y oportunidades

## Contexto
El asesor comercial y el equipo de la agencia de viajes necesitan una búsqueda global omnicanal accesible en cualquier momento mediante atajo de teclado (`Cmd+K` / `Ctrl+K`), capaz de indexar y buscar contactos, chats de WhatsApp, oportunidades comerciales, cotizaciones y catálogo tanto por nombre como por teléfono (normalizado) y destino turístico, respetando la visibilidad por rol y permisos (R10: un asesor sin permiso para ver todas las conversaciones solo ve las asignadas a su identificador, y las opciones de administración o reportes con margen quedan ocultas). Asimismo, el asesor necesita que la aplicación recuerde automáticamente sus filtros frecuentes en Bandeja, Contactos y Pipeline en almacenamiento local (`localStorage`), con opción explícita de limpiar los filtros activos mediante un botón táctil accesible (`>= 44 px`).

## Qué se construyó

1. **Módulo de Persistencia de Filtros (`filtros-guardados-logica.ts`):**
   - Hook reactivo `useFiltrosPersistidos` que sincroniza el estado de React con `localStorage` de forma segura (tolerante a entornos SSR, modo incógnito restringido y errores de parseo JSON).
   - Estructuras tipadas para filtros en Bandeja (`FiltrosBandejaPersistidos`), Contactos (`FiltrosContactosPersistidos`) y Pipeline (`FiltrosPipelinePersistidos`).
   - Función pura `hayFiltrosActivos` para comparar los valores actuales contra los valores por defecto, con soporte para ignorar campos de presentación (como la vista Kanban/Tabla).
   - Acciones tipadas `actualizarFiltro` y `limpiarFiltros`.

2. **Búsqueda Global Omnicanal y Visibilidad por Rol (`buscador-global-logica.ts`):**
   - Búsqueda por número de teléfono normalizado (dígitos continuos o con espacios/indicativo, umbral `>= 4` dígitos) en contactos y conversaciones de WhatsApp.
   - Búsqueda por destino en oportunidades (`op.destino`), permitiendo localizar prospectos y cotizaciones directamente por el destino del viaje.
   - Restricción estricta de visibilidad por rol (R10): si el asesor carece de `conversaciones.ver_todas`, solo se indexan las conversaciones con `c.asignadoAId === miUsuarioId`. Se excluyen acciones de configuración (`act-config`) y reportes con margen (`act-reportes`) a usuarios sin los permisos requeridos.
   - Actualizado el modal `ModalBusquedaGlobal` integrando `usePermisos` y asegurando botones de limpieza con objetivo táctil de 44 px.

3. **Integración en Vistas de Negocio:**
   - **Bandeja de Entrada (`lista-conversaciones.tsx`):** persistencia de pestaña y búsqueda con botón "Limpiar" (`min-h-[44px]`).
   - **Contactos (`contactos/page.tsx`):** persistencia de búsqueda, etiqueta y consentimiento (Ley 1581 / Meta) con botón "Limpiar filtros" visible cuando hay filtros activos.
   - **Pipeline (`pipeline/page.tsx`):** persistencia de búsqueda, asesor y vista, con botón "Limpiar filtros" en la barra de herramientas.

4. **Verificación de Compuertas:**
   - Pruebas unitarias (@viajapro/web): 83 suites, 677 pruebas en verde.
   - Pruebas dedicadas a T-103:
     - `filtros-guardados-logica.spec.ts` (8 pruebas).
     - `buscador-global-logica.spec.ts` (12 pruebas).
     - `modal-busqueda-global.spec.tsx` (7 pruebas).
     - `pipeline/page.spec.tsx` (9 pruebas).
     - `contactos/page.spec.tsx` (6 pruebas).
   - Typecheck (9/9) y Linter (7/7) del monorepo en verde.
   - Compilación exitosa en Next.js (23 rutas).
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59 política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.
