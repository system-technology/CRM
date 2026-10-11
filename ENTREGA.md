# ENTREGA.md — Tareas 0d, 0c.3 (Pipeline Kanban), 6 (Ventana 24h Meta HSM), 0c.4 (Contactos), 0c.5 (Catálogo) y 0c.6 (Cotizador)

## 1. Entrega de Tarea 0c.6: Cotizador Comercial, Despacho a WhatsApp y Navegación (`/cotizador`)

Origen: Jira Epic VC-4 (Fase 3: Cotizador) · `viajapro_diseno_ui_ux.json` (Pantalla 2: Cotizador de paquetes) · `@viajapro/contracts` (`CotizarPaquete`, `CotizacionCalculada`, `Paquete`).

### Implementación Realizada:
1. **Navegación Integral y Modo Oscuro (`apps/web/src/app/cotizador/page.tsx`):**
   - Incorporación de `BarraModulos` a la izquierda resolviendo el defecto de pantalla ciega.
   - Compatibilidad completa con temas claro y oscuro (`dark:bg-neutral-950`, `dark:border-neutral-800`).
2. **Conexión Directa desde el Catálogo:**
   - Enlace reactivo mediante `useSearchParams` (`?paqueteId=...`) envoltura en `<Suspense>` para inicialización automática del paquete seleccionado en `/catalogo`.
3. **Generador de Propuesta para WhatsApp (`apps/web/src/lib/cotizador-logica.ts`):**
   - Formato comercial optimizado para lectura móvil en WhatsApp con destino, fechas, acomodación, desglose de pasajeros y total en COP.
   - Botón interactivo de copiado al portapapeles con feedback visual («¡Copiado al Portapapeles!»).
   - Acceso directo a abrir conversación en `/bandeja`.
   - Impresión / exportación directa en PDF (`window.print()`).
4. **Protección de Datos y Confidencialidad Comercial (R10):**
   - La propuesta enviada al viajero oculta rigurosamente tarifas netas mayoristas y margen interno.
5. **Resiliencia Offline y Cero Tipos Redefinidos (R3):**
   - Motor de cálculo simulado (`calcularCotizacionMock`) y fallback a catálogo mock cuando la API backend no esté corriendo, validado contra el esquema Zod `CotizacionCalculada`.
6. **Pruebas Automáticas y Calidad:**
   - 5 pruebas unitarias nuevas en `apps/web/src/lib/cotizador-logica.spec.ts` (41/41 pruebas en verde en Vitest).

---

## 2. Entrega de Tarea 0c.5: Catálogo de Paquetes y Tarifarios de Mayoristas (`/catalogo`)

- Directorio comercial con búsqueda reactiva, filtros por plan de alimentación y temporadas activas.
- Modal de detalle (`FichaDetallePaquete`) con matriz de tarifas por acomodación y tipo de pasajero.
- Time limits de mayoristas y botón de cotización rápida.

---

## 3. Entrega de Tarea 0c.4: Directorio de Contactos y Viajeros (`/contactos`)

- Directorio comercial y ficha de detalle drawer (`FichaDetalleContacto`) con identidad, preferencias de viaje y consentimientos Ley 1581 / Meta.

---

## 4. Entrega de Tarea 6: La Ventana de 24 Horas de Meta HSM

- Bloqueo estricto del redactor cuando la ventana está cerrada, modal de plantillas aprobadas (`ModalPlantillas`) y clave de idempotencia UUID v4 (R5).

---

## 5. Estado de las 5 Compuertas de Calidad (Todas en Verde)

1. **Pruebas (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 7 passed (7 suites), 41 passed (41 tests)
   ```
2. **Tipos (TypeScript):**
   ```bash
   npx pnpm --filter @viajapro/web typecheck
   # Result: 0 errors
   ```
3. **Lint (ESLint):**
   ```bash
   npx pnpm --filter @viajapro/web lint
   # Result: 0 errors, 0 warnings
   ```
4. **Construcción (Next.js):**
   ```bash
   npx pnpm --filter @viajapro/web build
   # Result: Compiled successfully, 10 static routes (/cotizador a 6.86 kB)
   ```
5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```

---

## 6. Sincronización Jira Cloud (VC-13, VC-3, VC-4 y VC-10)

- Comentarios y avances registrados en Jira Cloud vía REST API.
- Commits en `origin/feat/bandeja-web` listos para inspección.
