# Bitácora — 2026-10-28 — T-102: Pipeline tipo tablero (kanban) con arrastrar y soltar entre etapas, totales por etapa y tarjetas con valor estimado

## Contexto
El asesor y líder comercial de la agencia de viajes requiere visualizar el embudo de ventas en formato tablero Kanban, mover oportunidades entre etapas mediante arrastrar y soltar (mouse) o menú accesible (teclado), obtener totales monetarios consolidados por etapa y moneda en números enteros (R8) que se recalculen dinámicamente tanto al cargar como tras cualquier movimiento optimista, con reversión automática si la persistencia en el servidor falla.

## Qué se construyó

1. **Aritmética Entera de Dinero (R8) y Totales Dinámicos:**
   - Funciones puras `sumarDinero`, `restarDinero` y `calcularTotalColumna` en `apps/web/src/lib/pipeline-logica.ts` basadas en `BigInt` y aislamiento de divisas (sin coma flotante ni mezclar monedas).
   - Recálculo dinámico de `valorTotal` y `total` en `moverOportunidadEnTablero` tanto para la columna de origen como para la columna de destino al mover oportunidades comerciales.

2. **Tablero Kanban con Drag & Drop, Menú por Teclado y Reversión Optimista:**
   - En `apps/web/src/app/pipeline/page.tsx`, `ejecutarMovimiento` aplica una actualización optimista inmediata en la UI y persiste el cambio en `moverOportunidadDeEtapa`. Si la API rechaza o falla la petición, se revierte automáticamente el estado del tablero (`setTablero(tableroPrevio)`) y se notifica al usuario con un aviso descriptivo accesible.
   - Soporte para drag & drop nativo HTML5 en `ColumnaKanban` con realce visual de zona activa y captura de drop.
   - Soporte para movimiento por teclado en `TarjetaOportunidad` mediante botón y menú desplegable accesible con todas las etapas configuradas por la agencia.
   - Activación obligatoria de `ModalMotivoPerdida` al mover hacia etapas marcadas con `esPerdida: true`, exigiendo motivo tipado del contrato y detalle para el caso `OTRO`.

3. **Accesibilidad y Usabilidad Responsive (375 px):**
   - Touch targets `>= 44 px` en todos los controles: selector Kanban/Tabla, botón de nueva oportunidad, buscador, selector de asesor, enlaces de chat, menús desplegables de etapas y botones de acción en modales.
   - Vista compacta en tabla con scroll horizontal contenido y cifras monetarias con formato es-CO.

4. **Verificación de Compuertas:**
   - Pruebas unitarias (@viajapro/web): 82 suites, 665 pruebas en verde (`pipeline-logica.spec.ts` con 19 pruebas y `page.spec.tsx` con 8 pruebas).
   - Typecheck: 9 paquetes monorepo en verde; Next.js compiló 23 rutas exitosamente.
   - Linter: 7 paquetes limpios sin advertencias ni variables huérfanas.
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59 política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.
