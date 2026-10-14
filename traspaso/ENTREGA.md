# ENTREGA.md — Tarea 0c.15: La política de precio de la agencia, en /configuracion

- **Rama:** `feat/bandeja-web`
- **Fecha:** 2026-10-13
- **Tarea completada:** `0c.15. La política de precio de la agencia, en /configuracion` (ADR-0009)

---

## 1. Qué construí

1. **Sección y Bloque «Cómo se forma el precio» en `/configuracion` (`apps/web/src/components/configuracion/bloque-politica-precio.tsx` - 0c.15.1):**
   - Panel dedicado en la pestaña «Formación del Precio» (`precios`) y en la vista general de configuración con etiqueta `ADR-0009`.
   - Incluye los 4 campos del contrato `PoliticaDePrecio` de `@viajapro/contracts`:
     - `porcentaje` (con slider reactivo de 1 % a 100 % y presets rápidos: 15 %, 20 %, 25 %, 30 %).
     - `base`: Selector interactivo entre `SOBRE_EL_NETO` («le subo el X %») y `SOBRE_LA_VENTA` («me deja el X %»).
     - `origenDeLaVenta`: `DIRECTA` vs `CANAL_EXTERNO`.
     - `redondeoVenta`: `SIN_REDONDEO`, `CIEN_COP`, `MIL_COP`, `CINCO_MIL_COP`.
     - `admiteMargenPorTarifa`: Toggle interactivo que indica si las tarifas pueden sobreescribir el margen global.

2. **Ejemplo vivo interactivo con impacto económico real (0c.15.2):**
   - Tarjeta de cálculo en tiempo real con un neto base de prueba de **$1.000.000 COP** (editable).
   - Al alternar `base` entre `SOBRE_EL_NETO` y `SOBRE_LA_VENTA` con el 20 %:
     - `SOBRE_EL_NETO` muestra venta de **$1.200.000 COP**, margen de **$200.000 COP** (20 % sobre neto, 16.7 % sobre venta).
     - `SOBRE_LA_VENTA` muestra venta de **$1.250.000 COP**, margen de **$250.000 COP** (25 % sobre neto, 20.0 % sobre venta).
   - Explica de forma visual y pedagógica la diferencia de **$50.000 COP por silla** y el impacto de **$2.000.000 COP en una salida de bus de 40 pasajeros**.
   - Muestra la fórmula matemática dinámica según la base seleccionada (`neto × (1 + p)` vs `neto / (1 − p)`).

3. **Aritmética estricta desde el dominio (0c.15.3 - Reglas R3 y R8):**
   - Toda la aritmética de formación de precio se delegó a `calcularVenta` y `calcularMargen` y al objeto de valor `Money` de `@viajapro/domain`.
   - Cero reimplementación de fórmulas en el frontend. Enteros en centavos respetados en todo el flujo.
   - Lógica desacoplada en `apps/web/src/lib/politica-precio-logica.ts` con tipado Zod estricto y funciones puras probadas.

4. **Honestidad y datos simulados (0c.15.4):**
   - Botón de guardado deshabilitado con mensaje explícito: *«Guardado deshabilitado: La API todavía no expone la ruta de persistencia para la política de precio (ADR-0009).»*
   - Distintivo discreto `DistintivoDatosDemo` visible junto a la configuración predeterminada.

5. **Responsividad móvil:**
   - Controles accesibles a 375 px de ancho con targets táctiles ≥ 44 px, inputs legibles y rejilla responsive.

---

## 2. Pruebas y verificación

- **Pruebas unitarias de lógica de presentación (`apps/web/src/lib/politica-precio-logica.spec.ts`):**
  - 5 pruebas unitarias verificando el recálculo interactivo:
    1. Venta a $1.200.000 COP con `SOBRE_EL_NETO` al 20 %.
    2. Venta a $1.250.000 COP con `SOBRE_LA_VENTA` al 20 %.
    3. Diferencia exacta de $50.000 COP por pasajero y $2.000.000 COP en un bus de 40 pasajeros.
    4. Aplicación de reglas de redondeo (`MIL_COP`, etc.).
    5. Formateo amigable en pesos colombianos ($ COP).
  - Todas las 114 pruebas de `@viajapro/web` en verde (16 archivos de prueba).

- **Cinco compuertas de verificación (`pnpm compuertas`):**
  - `build`: ✓ verde (todos los paquetes compilaron a dist, 13 páginas estáticas de Next.js compiladas).
  - `lint`: ✓ verde (0 errores de ESLint).
  - `typecheck`: ✓ verde (TypeScript estricto en todos los workspaces).
  - `test`: ✓ verde (contracts, domain [52 tests], web [114 tests], api [112 tests], database [39 tests de aislamiento]).
  - `format:check`: ✓ verde (Prettier limpio).

Las cinco compuertas ejecutadas y pasadas en verde.
