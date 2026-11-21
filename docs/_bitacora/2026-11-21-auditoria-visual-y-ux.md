# 2026-11-21 — Auditoría visual y de UX y plan de rediseño (sesión de diseño)

**Qué se hizo.** Una sesión de diseño, sin código de producto:
1. Se levantó la web en modo maqueta y se recorrió con Playwright: 14 rutas más detalles, a 390 y 1440 px, y después una **matriz de 10 tamaños** (celular 360 y 430, celular horizontal 844×390, tablet 768, 820, 1024 y 1180, escritorio 1280 y 1920, zoom del 200 %) sobre 8 rutas.
2. Se escribió [`docs/_auditorias/2026-11-21-auditoria-visual-y-ux.md`](../_auditorias/2026-11-21-auditoria-visual-y-ux.md): hallazgos priorizados, el análisis por familia de dispositivo y el plan por olas.
3. Tras la corrección del propietario (celular, tablet y escritorio) y las decisiones del orquestador, se escribió la hoja de ruta de diseño [`docs/08-roadmap/10-roadmap-diseno-ui-ux.md`](../08-roadmap/10-roadmap-diseno-ui-ux.md) y se registraron **32 tareas** (T-440 a T-471) en `roadmap/tasks.yaml`, una por PR.

**Hallazgos que más pesan.** La navegación ya está resuelta; lo que falla es la densidad y la jerarquía dentro de cada pantalla. El producto tiene dos diseños (< 768 px y ≥ 768 px), no tres: la tablet hereda el de escritorio con riel de iconos sin etiquetas. Hay dos sistemas de color (los tokens de estado suman 166 usos; los colores crudos de Tailwind, 2.073). Cuatro bloqueantes para JD Tours en móvil: aviso de cookies, cabecera de la conversación, detalle de la cotización y filas de prueba extrema en la demo.

**Decisiones del orquestador (2026-11-21).** Plan aprobado con el layout responsivo y los puntos de quiebre en la Ola 1; `packages/ui` **no** ahora (componentes en `apps/web/src/components/comun`, sin ADR); la Ola 5 espera marca y logo; la sesión del roadmap hace la lógica y la de diseño la presentación, en PR separados; el sembrado de demo creíble lo registra el orquestador.

**Verificado.** Las capturas y las mediciones salen de Chromium sobre la maqueta (puerto 3456); cero desbordes horizontales en las 80 combinaciones. Los 32 registros nuevos se validaron con el validador de la cola en una copia: solo quedan los errores que ya traía `main` (T-383 con tipo inválido y varias tareas `in_progress`), ninguno de los nuevos.

**No verificado.** Safari iOS, Firefox y Edge (solo hay Chromium); teclado en pantalla; zonas seguras; foco de teclado recorrido a mano; contraste medido con herramienta; una sesión con rol de dueña frente a asesora; nada contra la API real.

**Pendiente.** Ejecutar la Ola 1, empezando por T-441 y las tareas que no chocan con el PR #385; T-440 espera a que #385 entre. Los ids T-440 a T-471 se eligieron por encima de los que ya reservaban otros PR abiertos (hasta T-432).
