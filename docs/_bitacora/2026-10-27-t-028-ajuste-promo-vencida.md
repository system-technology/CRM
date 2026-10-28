# 2026-10-27 — Ajuste de promoción vencida en Configuración y su aplicación (T-028)

- **Autor:** Antigravity (IA colaborativa)
- **Rama:** `b/T-028-ajuste-promo-vencida`
- **Tarea cerrada:** `T-028` (Ajuste «promoción vencida» [ocultar o tachar] en Configuración › Catálogo y su aplicación en tarjeta y cotizador).
- **Diseño Stitch:**
  - Proyecto: `8333038101997719867`
  - Pantalla: `4b4005013aba465685340f4b13c49203` (*Configuración › Catálogo: Ajuste de Promoción Vencida — ViajaPro CRM*)

## Qué se construyó

1. **Cliente API (`apps/web/src/lib/catalogo-ajustes-api.ts`):**
   - Consume los endpoints del ADR-0017 §9 (D3): `GET /api/v1/catalogo/ajustes` y `PATCH /api/v1/catalogo/ajustes` con esquema Zod `AjustesDeCatalogo` (`{ promoVencida: 'OCULTAR' | 'TACHAR' }`).
   - Envío de cabeceras de tenant y fallback a `OCULTAR` en modo offline.

2. **Componente de Configuración (`apps/web/src/components/configuracion/bloque-ajustes-catalogo.tsx` y `.spec.tsx`):**
   - Panel de control de 2 columnas inspirado en Stitch:
     - Selector con radio buttons para `OCULTAR` (recomendado para cotizaciones limpias en WhatsApp) y `TACHAR` (anclaje de precio con aviso de vencimiento).
     - Cuadro de advertencia comercial: el precio de venta cobrado al cliente no cambia (invariante de dominio R12 / ADR-0017 §9).
     - Previsualización reactiva en vivo sobre una tarjeta de excursión caribeña (*Pasadía Islas del Rosario*), mostrando o escondiendo el precio de lista tachado y la insignia ámbar.
     - Botón de guardado con feedback accesible y banner de confirmación.

3. **Pestaña en Configuración (`apps/web/src/app/configuracion/page.tsx`):**
   - Nueva pestaña `Catálogo` (`data-testid="tab-btn-catalogo"`) renderizando `BloqueAjustesCatalogo`.

4. **Aplicación en Tarjeta de Catálogo (`apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx` y `.spec.tsx`):**
   - Renderizado condicional de `salida.presentacion.listaTachada` y `salida.presentacion.leyenda === 'PROMO_VENCIDA'` calculados por la API.

5. **Aplicación en Cotizador (`apps/web/src/components/cotizador/desglose-cotizacion-salida.tsx` y `.spec.tsx`):**
   - Renderizado condicional en las líneas de tarifa de `linea.presentacion.listaTachada` e `insignia-promo-vencida`.

6. **Pruebas y verificación:**
   - 48 suites pasando en `@viajapro/web`, 406/406 pruebas en verde.
   - Tests específicos para ambos valores (`OCULTAR` y `TACHAR`) tanto en Configuración como en la Tarjeta y en el Cotizador.
   - Typecheck, ESLint y `test:hooks` 100% en verde.
