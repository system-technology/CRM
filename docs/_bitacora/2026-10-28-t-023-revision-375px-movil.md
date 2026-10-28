# 2026-10-28 — T-023: Revisión a 375 px y objetivos táctiles en Bandeja, Pipeline, Cotizador y Catálogo

## Contexto
Tarea T-023 del roadmap (Fase 1: Un CRM mostrable y endurecido):
- Las cuatro pantallas clave (Bandeja, Pipeline, Cotizador y Catálogo) no deben presentar scroll horizontal parásito en un viewport angosto de 375 px (pantalla tipo iPhone SE / estándar móvil).
- Todos los objetivos táctiles interactivos deben respetar el estándar de accesibilidad para pantallas táctiles de al menos 44 px (`min-h-[44px] min-w-[44px]`, WCAG 2.5.5 / 2.5.8).
- Auditoría documentada en `traspaso/ENTREGA.md` a 375 px y 1280 px.
- Cambios restringidos a `apps/web` y compuertas en verde.

## Implementación

1. **Bandeja (`/bandeja`, `/bandeja/[id]` y componentes)**:
   - `BarraModulos`: los enlaces en la barra colapsada y los botones auxiliares (notificaciones, tema claro/oscuro, avatar de sesión) cuentan con `h-11 w-11 min-h-[44px] min-w-[44px]` para interacción cómoda en celulares y tablets.
   - `ListaConversaciones`: selector de densidad y pestañas de filtro con `min-h-[44px]` en móvil.
   - Interfaz de conversación: botón de envío (`aria-label="Enviar mensaje"`) y botones de notas rápidas adaptados con `min-h-[44px] min-w-[44px]`.

2. **Pipeline de Oportunidades (`/pipeline`)**:
   - Selector de vistas (Kanban / Tabla) con `min-h-[44px]` para evitar toques erráticos.
   - Contenedor Kanban con padding responsivo `p-3 sm:p-6` y separación adaptativa `space-x-3 sm:space-x-4`.
   - Contenedor de tabla con `overflow-x-auto rounded-2xl` y `min-w-[680px]` en la tabla, permitiendo scroll horizontal interno controlado sin romper el ancho general de la página a 375 px.

3. **Cotizador (`/cotizador` y desglose de cotización)**:
   - `DesgloseCotizacionSalida`: botones de acción principales («Guardar Oficial» y «Copiar Propuesta para WhatsApp») apilados verticalmente en pantallas estrechas con `flex-col sm:flex-row w-full sm:w-auto min-h-[44px]`.
   - Botones de paso y acciones inferiores adaptados a ancho completo móvil `w-full sm:w-auto min-h-[44px]`.

4. **Catálogo de Salidas y Excursiones (`/catalogo`)**:
   - Barra de acciones superior apilada verticalmente en móvil («Importar archivo CSV» e «Ir al Cotizador») con `w-full sm:w-auto min-h-[44px]`.
   - Barra de navegación entre pestañas («Salidas Publicadas», «Todas las Excursiones», «Historial de Precios», «Descargar Plantillas») con desplazamiento lateral interno suave `overflow-x-auto` y botones de pestaña con `shrink-0 min-h-[44px]`.
   - `TarjetaSalidaPublicada`: botón de cotizar salida con texto adaptable y conciso («Cotizar» en móvil vs «Cotizar esta salida» en desktop) con touch target `min-h-[44px]`.

5. **Pruebas Automatizadas y Validación**:
   - Creado archivo de prueba `apps/web/src/components/comun/revision-375px.spec.tsx` verificando el cumplimiento de touch targets y atributos responsivos en los componentes involucrados.
   - 66 suites y 566 pruebas unitarias pasando en `@viajapro/web`.
   - Compuertas verificadas: `typecheck` (9/9), `lint` (7/7) y `test:hooks` (59/59, 19/19, 6/6).
