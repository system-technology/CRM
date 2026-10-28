# 2026-10-28 — T-036: Tarjetas de Producto con Identidad por Tipo de Excursión

## Contexto
Tarea T-036 del roadmap (Fase 1: Identidad Visual y Experiencia de Usuario):
- Cada tipo de producto (`isla_beach_club`, `reserva_natural`, `city_tour`, `aventura_nautica`, `paquete_hotel`, `excursion_general`) tiene su color, icono y degradado cuando no hay foto.
- La tarjeta muestra «Desde $X por persona», promo vigente con insignia (aro dorado `#c9a24b`), horarios, chips de lo que incluye y cupos, con la nueva identidad visual.
- No hay datos de producto escritos en el código: salen de la API / entidad `SalidaPublicada`; tests de la lógica de tipos y formateo visual.

## Diseño Stitch MCP
- **Proyecto**: `8333038101997719867`
- **Pantalla**: `9e60798823de4540a788622f805745ff`
- **Título**: *Catálogo de Excursiones — Tarjetas con Identidad Visual Turística — ViajaPro CRM*

## Implementación

1. **Inferencia y Lógica de Tipos de Turismo (`apps/web/src/lib/catalogo-logica.ts`)**:
   - `TipoProductoTurismo`: Definición tipada de los 6 tipos clave del sector turístico (`isla_beach_club`, `reserva_natural`, `city_tour`, `aventura_nautica`, `paquete_hotel`, `excursion_general`).
   - `inferirTipoProducto(nombre, etiquetas)`: Función pura que deduce la tipología a partir del léxico comercial colombiano (ej. "Bora Bora", "Chiva", "Careteo", "Reserva", "Manglares", "Resort", etc.) evitando falsos positivos mediante comprobación de límites y términos compuestos.
   - Re-exportada limpiamente en `apps/web/src/components/comun/chip-tipo-producto.tsx`.

2. **Componente de Tarjeta de Salida (`apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx`)**:
   - **Cabecera sin foto**: Aplica el degradado sustituto temático del tipo (`configTipo.degradadoSustituto`), marca de agua del icono en opacidad tenue (`text-white/15`) y ambient blur caribeño.
   - **Cabecera con foto**: Soporta fotografía real (`fotoUrl`) con gradiente oscuro protector para garantizar legibilidad y contraste WCAG AA.
   - **Insignias y Aro Dorado**:
     - Duración (`Pasadía`, `X noches`) renderizada con `<InsigniaAroDorado>` y borde `#c9a24b`.
     - Promo vigente con destello e insignia dorada (`.insignia-aro-dorado` y `border-[#c9a24b]`).
   - **Cupos y Urgencia**: Muestra chip de cupos en vivo con etiquetas diferenciadas (`¡Últimos cupos!`, `quedan X`, `Agotado`).
   - **Horarios e Inclusiones**: Bloque desplegable de horario (`formatearHorarioExcursion`) y lista de inclusiones destacadas con icono `CheckCircle`.
   - **Tarifas y Precios**: Presentación «Desde $X por persona» con soporte de `desdePorMoneda`, tachado de lista ante política `promo_vencida` y botones accesibles de cotización y ficha.

3. **Integración en Pantalla Catálogo (`apps/web/src/app/catalogo/page.tsx` y `ficha-detalle-paquete.tsx`)**:
   - Conexión de `onVerFicha` en `TarjetaSalidaPublicada` para abrir la ficha de detalle sin fricción.
   - Inclusión de `ChipTipoProducto` en las tarjetas del catálogo simulado y en la cabecera de `FichaDetallePaquete`.

4. **Pruebas y Verificación**:
   - `tarjeta-salida-publicada.spec.tsx`: 15 pruebas unitarias cubriendo los 6 tipos turísticos, degradados sustitutos, fotografías reales, aro dorado, cupos, botón ver ficha y políticas de promo vencida.
   - `catalogo-logica.spec.ts`: 20 pruebas unitarias incluyendo la prueba exhaustiva de inferencia para todos los tipos y sinónimos.
   - Suite total `@viajapro/web`: 61 suites y 517 tests pasando al 100%.
   - Typecheck (9/9 paquetes) y Lint limpios.
