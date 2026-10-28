# Bitácora — 2026-10-27 — T-018, T-051 y T-019: Tarjeta y ficha de excursión, presentación de promo y estado sin catálogo

## Contexto
Implementación combinada de las tareas frontend asociadas al catálogo público y cotizador comercial:
- **T-018:** Tarjeta y ficha de excursión en catálogo con imagen/degradado temático por tipo (pasadía vs multidía), nombre, duración, horarios de salida/regreso, tarifa «desde» por moneda, insignias de promo, inclusiones y cupos disponibles con chips de urgencia («sáb 3 oct · quedan 4»). Estado «Consultar» si no hay tarifa base.
- **T-051:** Respeto estricto del objeto `presentacion` entregado por la API sin evaluar fechas ni calcular expiración en el cliente (`promoHasta` no se compara en ningún archivo de `apps/web`). Lista tachada y leyenda «promo vencida» se pintan según la política (`OCULTAR` o `TACHAR`). Los cargos en destino (`cargosEnDestino`) se muestran aparte como «No incluido» y nunca se suman al total.
- **T-019:** Estado vacío «sin catálogo todavía» cuando el tenant no cuenta con excursiones publicadas, con dos acciones claras («Importar catálogo» y «Crear excursión») en `/catalogo` y `/cotizador`.

## Decisiones técnicas
1. **Stitch Screen:** Se generó la pantalla de referencia en el proyecto `8333038101997719867` con ID `b86a95d7aa3246b087e0baa6fe1063fe` (*Catálogo de Excursiones y Estado Sin Catálogo — ViajaPro CRM*), con diseño visual caribeño, alta estética y micro-interacciones.
2. **Lógica de presentación unificada:**
   - Se añadieron `formatearHorarioExcursion`, `clasificarDisponibilidadCupos`, `interpretarPresentacionTarifa` y `verificarCargosEnDestinoSeparados` en `apps/web/src/lib/catalogo-logica.ts`.
3. **Componente `EstadoSinCatalogo` reutilizable:**
   - Ubicado en `apps/web/src/components/catalogo/estado-sin-catalogo.tsx` y re-exportado en `components/comun/`.
   - Incorpora botones con `data-testid="btn-sin-catalogo-importar"` y `data-testid="btn-sin-catalogo-crear"`.
   - Adaptación contextual para cotizador y catálogo.
4. **Desglose de Cotización:**
   - `desglose-cotizacion-salida.tsx` muestra `linea-lista-tachada` y badge `linea-promo-vencida` derivados de `linea.presentacion`.

## Verificación
- `@viajapro/web`: 52 archivos de test, 432 pruebas pasando al 100%.
- TypeScript estricto: `typecheck` con 0 errores.
- ESLint: 0 errores.
- Hooks de git y barreras de seguridad: 59/59 y 19/19 en verde.
