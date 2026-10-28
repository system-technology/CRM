# 2026-10-28 — T-035: Animaciones y Transiciones Fluidas con Shimmer Oceánico

## Contexto
Tarea T-035 del roadmap v2 (Fase 1: Identidad Visual y Experiencia de Usuario):
- Las listas y cuadrículas (bandeja, pipeline, catálogo, contactos) deben entrar con animación escalonada corta (< 300 ms).
- Las tarjetas se elevan al pasar el cursor con microinteracción elástica sin salto de diseño (`layout shift`).
- Los esqueletos de carga incorporan un efecto de brillo (`shimmer`) oceánico y dorado arena caribeño.
- Los paneles y modales cuentan con transiciones suaves (< 250 ms).
- Todo respeta rigurosamente `prefers-reduced-motion: reduce` (WCAG 2.2 Nivel AA).

## Diseño Stitch MCP
- **Proyecto**: `8333038101997719867`
- **Pantalla**: `ed51eb6813d7471487cf3b7a1b82d0e2`
- **Título**: *Sistema de Animaciones Fluidas, Shimmer Oceánico & Accesibilidad — ViajaPro CRM*

## Implementación

1. **Tokens y Clases en `globals.css`**:
   - `@keyframes brilloEsqueleto`: Shimmer en gradiente a 115° con destello sutil turquesa caribeño (`rgba(6, 182, 212, 0.08)`) y dorado arena (`rgba(201, 162, 75, 0.12)`).
   - `.esqueleto-brillo`: Clases aplicadas tanto en modo claro como en modo oscuro (`.dark .esqueleto-brillo`).
   - `@keyframes entradaEscalonada` y `.anim-entrada`: Desplazamiento sutil de 8px a 0px en 250ms con curva `cubic-bezier(0.16, 1, 0.3, 1)`.
   - `.anim-retraso-1` a `.anim-retraso-6`: Retrasos escalonados de 40ms a 240ms.
   - `.tarjeta-turismo-hover` y `.tarjeta-elevacion`: Elevación elástica suave de -3px con sombra turquesa y microescala táctil `active:scale-[0.995]`.
   - `.anim-modal` y `.anim-panel-lateral`: Transiciones rápidas e imperceptibles al ojo humano (< 250ms).
   - Directiva estricta `@media (prefers-reduced-motion: reduce)`: Cancela duraciones de animación, detiene el shimmer y elimina desplazamientos de hover y modales.

2. **Módulo Reutilizable `apps/web/src/components/comun/animaciones.tsx`**:
   - `obtenerClaseEscalonada(indice: number)`: Asigna el retraso CSS correcto hasta el límite de 6 niveles (máx 240ms).
   - `usePrefersReducedMotion()`: Hook reactivo con fallback seguro contra SSR.
   - `<ShimmerBox />`: Caja reutilizable con brillo y `aria-hidden="true"`.
   - `<ContenedorEscalonado />`: Componente envoltorio que anima a sus hijos de forma escalonada sin intervenir en accesibilidad.

3. **Integración en Componentes y Pantallas**:
   - `apps/web/src/components/comun/esqueletos.tsx`: `EsqueletoConversacion`, `EsqueletoKanban`, `EsqueletoGridTarjetas`, `EsqueletoTabla`, `EsqueletoExpediente` y `EsqueletoReportes` actualizados con `.esqueleto-brillo`.
   - `apps/web/src/app/catalogo/page.tsx` y `tarjeta-salida-publicada.tsx`: Entrada escalonada y elevación de tarjetas.
   - `apps/web/src/app/pipeline/page.tsx`, `columna-kanban.tsx` y `tarjeta-oportunidad.tsx`: Animación de entrada y elevación en tarjetas kanban.
   - `apps/web/src/components/bandeja/lista-conversaciones.tsx`: Esqueletos con brillo y entrada escalonada en items.
   - `apps/web/src/app/contactos/page.tsx`: Entrada escalonada en filas de la tabla de directorio.
   - `apps/web/src/components/inicio/bloque-seguimientos-dia.tsx`: Elevación y entrada escalonada en seguimientos diarios.
   - `apps/web/src/components/busqueda/modal-busqueda-global.tsx`: Transición `.anim-modal`.
   - `apps/web/src/components/catalogo/ficha-detalle-paquete.tsx`: Transición lateral `.anim-panel-lateral`.

4. **Pruebas y Verificación**:
   - `apps/web/src/components/comun/animaciones.spec.tsx`: 11 tests unitarios verificando escalonamiento, mockeo dinámico de `matchMedia`, renderizado de `ShimmerBox` y desactivación con movimiento reducido.
   - `apps/web/src/components/comun/esqueletos.spec.tsx`: 11 tests en verde verificando `aria-busy="true"`, etiquetas accesibles y presencia de `esqueleto-brillo`.
   - Suite total `@viajapro/web`: 61 archivos de prueba, 508 tests pasando.
