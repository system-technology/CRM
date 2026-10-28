# Bitácora — 2026-10-27: Pantalla de gestión del catálogo (T-031)

- **Autor:** Antigravity (Frontend Agent)
- **Tarea:** T-031 (Pantalla de gestión del catálogo: crear, editar y desactivar productos, tarifas y salidas)
- **Rama:** `b/T-031-gestion-catalogo`
- **Stitch Screen ID:** `fd289cef536d46779e25b27d5e7cca0e` (*Gestión del Catálogo — ViajaPro CRM*, Proyecto `8333038101997719867`)

## Contexto y Decisiones
Una vez completada la API del catálogo gestionable en `main` según el ADR-0017 (endpoints `GET /api/v1/catalogo/paquetes/gestion`, `POST /api/v1/catalogo/paquetes`, `PATCH /api/v1/catalogo/paquetes/:id`, `PATCH /api/v1/catalogo/paquetes/:id/desactivar`), procedimos con la implementación de la pantalla de gestión del catálogo en el frontend.

### Reglas clave implementadas:
1. **Validación Zod estricta y mensajes en español (R3):**
   - Se crearon funciones puras en `apps/web/src/lib/catalogo-gestion-logica.ts` que validan los datos del formulario contra los esquemas Zod `CrearPaquete` y `EditarPaquete`.
   - Coherencia de días y noches: Pasadías tienen 1 día y 0 noches (`noches === 0`). Para paquetes con hotel, las noches deben ser iguales a los días o uno menos.
2. **Preservación histórica e inmutabilidad (R12 / ADR-0017):**
   - La acción de desactivar advierte de forma explícita que el producto se oculta del cotizador para nuevas cotizaciones pero se preserva intacto en cotizaciones emitidas previas y viajes confirmados.
3. **Ergonomía visual y accesibilidad:**
   - Barra de KPIs superiores (Total, Activos para venta, Pausados).
   - Buscador por texto y filtro por destino.
   - Pestañas de estado segmentadas (Todos, Activos, Inactivos).
   - Botón `+ Nuevo producto` y modales con foco atrapado y touch target de 44 px.

## Verificación
- Monorepo tests: 47 archivos de prueba en `@viajapro/web` (410 tests pasados), 4 suites en `@viajapro/api` (24 tests pasados). Totalmente en verde.
- Typecheck: 0 errores TypeScript en monorepo (`tsc --noEmit`).
- Lint: 0 errores, 0 advertencias ESLint.
- Branch protection hooks: 59/59 casos en verde (`pnpm test:hooks`).
