# 2026-10-28 — T-024: Accesibilidad en bandeja y modales con foco, teclado, etiquetas y contraste

## Contexto
Tarea T-024 del roadmap (Fase 1: Un CRM mostrable y endurecido):
- Todos los botones de solo icono deben tener `aria-label` descriptivo y los modales deben atrapar y devolver el foco.
- La bandeja debe poder recorrerse completa solo con teclado (flechas, estilo vim, atajos rápidos) con atajos documentados en pantalla.
- Verificación exhaustiva con pruebas en `accesibilidad-logica.spec.ts` y `foco-modal.spec.tsx`.

## Implementación

1. **Atajos de Teclado y Navegación en la Bandeja**:
   - `ListaConversaciones`:
     - Navegación arriba/abajo mediante `ArrowDown`/`ArrowUp` y teclas estilo vim (`j`/`k`).
     - Atajo `/` para enfocar directamente la barra de búsqueda.
     - `Escape` para desenfocar la búsqueda o cancelar selección.
     - Barra informativa documentada en pantalla (`data-testid="barra-atajos-teclado"`).
   - Detalle de conversación (`/bandeja/[id]`):
     - Atajos globales del chat: `Alt+P` para abrir plantillas, `Alt+R` para reasignar asesor, `Alt+F` para alternar ficha de cliente, `Escape` para cerrar diálogos o paneles.

2. **Gestión de Foco y Trampas Accesibles en Modales**:
   - Implementado hook `useFocoModal` en todos los diálogos interactivos:
     - `ModalPlantillas`
     - `ModalReasignar`
     - `ModalGuardarCotizacion`
     - `ModalMotivoPerdida`
     - `ModalBusquedaGlobal`
   - Los modales posicionan automáticamente el foco en su primer elemento interactivo, atrapan el tabulador (`Tab`/`Shift+Tab`) para impedir que escape al fondo del DOM y regresan el foco al disparador al cerrarse.

3. **Etiquetas Accesibles y Contraste WCAG**:
   - Añadidos `aria-label` a botones de solo icono: volver a lista, alternar ficha de cliente, cerrar ficha, envío de mensaje / guardado de nota, botones de cierre de modales.
   - Añadido validador `validarContrasteWCAG` en `apps/web/src/lib/accesibilidad-logica.ts` verificando cumplimiento de ratios AA (4.5:1 / 3:1) y AAA (7:1 / 4.5:1).

4. **Pruebas y Cobertura**:
   - `apps/web/src/lib/accesibilidad-logica.spec.ts`: 6 pruebas en verde.
   - `apps/web/src/components/bandeja/lista-conversaciones-teclado.spec.tsx`: 6 pruebas en verde.
   - `apps/web/src/components/comun/foco-modal.spec.tsx`: 11 pruebas en verde.
   - Total `@viajapro/web`: 66 suites, 571 pruebas en verde.
