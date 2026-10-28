# 2026-10-28 — T-022: Auditoría de formatos es-CO con helpers únicos

## Contexto
Tarea T-022 del roadmap (Fase 1: Un CRM mostrable y endurecido):
- Existe un módulo de formato en `apps/web/src/lib/` y ninguna pantalla formatea dinero o fechas a mano.
- COP en enteros sin decimales con punto de miles (R8), fechas estándar legibles «sáb 3 oct 2026» con zona `America/Bogota` (R9).
- Teléfonos con formato estándar colombiano (+57 móvil y fijo nacional) y cupos descriptivos.
- Tests que recorren los helpers con casos límite: cero, millones, miles de millones, medianoche UTC frente a la zona de la agencia `America/Bogota`.

## Implementación

1. **Módulo Canónico de Formato (`apps/web/src/lib/formato.ts`)**:
   - `formatearDinero`: Soporta contratos Zod (`{ unidades, moneda }`), objetos con `monto`, números primitivos y bigints. Regla R8: En COP produce enteros sin decimales y punto de miles (`$ 350.000`, `$ 12.500.000`). En divisas extranjeras (USD, EUR) mantiene 2 decimales y coma.
   - `formatearCOP`: Variante específica simplificada para valores en pesos colombianos.
   - `formatearFecha`: Convierte cadenas ISO o fechas a formato estándar colombiano «sáb 3 oct 2026». Maneja strings `YYYY-MM-DD` fijando mediodía UTC para evitar desplazamientos por desfase horario; y timestamps UTC nocturnos proyectados fielmente a `America/Bogota` (UTC-5, R9).
   - `formatearFechaHora`: Formato compuesto amigable (ej: «sáb 3 oct 2026, 9:30 a. m.»).
   - `formatearTelefono`: Normaliza móviles de 10 dígitos («+57 300 123 4567») y fijos con indicativo nacional («+57 (601) 234 5678»).
   - `formatearCupo`: Textos claros para salidas y excursiones («Agotado», «1 cupo disponible», «12 de 20 cupos», «Cupos libres»).

2. **Migración Exhaustiva de Pantallas y Componentes**:
   - `apps/web/src/lib/api.ts`: Re-exporta los helpers para compatibilidad hacia atrás en componentes existentes.
   - `apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx`: Migrado para usar `formatearFecha` y `formatearDinero`.
   - `apps/web/src/components/catalogo/tabla-gestion-catalogo.tsx`: Migrado de `Intl.NumberFormat` inline a `formatearDinero`.
   - `apps/web/src/lib/politica-precio-logica.ts`: `formatearPesosCop` delega directamente en `formatearDinero`.
   - `apps/web/src/lib/inicio-logica.ts`: `formatearHoraSeguimiento` delega en `formatearFecha({ estilo: 'hora' })`.
   - `apps/web/src/lib/pipeline-logica.ts`: `formatearTiempoRelativo` delega en `formatearFecha`.
   - `apps/web/src/app/cotizaciones/[id]/page.tsx` y `cotizaciones/page.tsx`: Migrados a `formato.ts`.

3. **Pruebas y Verificación**:
   - `apps/web/src/lib/formato.spec.ts`: 23 pruebas exhaustivas cubriendo ceros, millones, miles de millones, medianoche UTC vs Bogotá, números de teléfono colombianos con/sin indicativo y cupos.
   - 65 suites de prueba pasando en `@viajapro/web` con 562 pruebas en verde (100%).
   - Monorepo completo verificado con `pnpm typecheck` (9/9 paquetes), `pnpm lint` (7/7 paquetes) y `pnpm test:hooks` (59/59, 19/19, 6/6).
