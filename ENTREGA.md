# ENTREGA.md — Tareas 0d, 0c.3 (Pipeline Kanban), 6 (Ventana 24h Meta HSM), 0c.4 (Contactos) y 0c.5 (Catálogo de Paquetes)

## 1. Entrega de Tarea 0c.5: Catálogo de Paquetes y Tarifarios de Mayoristas (`/catalogo`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P0: Catálogo de paquetes) · Jira Epic VC-4 (Fase 3: Cotizador) & VC-10 · `@viajapro/contracts` (`Paquete`, `Mayorista`, `Temporada`, `Precio`, `PlanAlimentacion`, `Acomodacion`, `TipoPasajero`).

### Implementación Realizada:
1. **Directorio y Buscador Comercial en `/catalogo` (`apps/web/src/app/catalogo/page.tsx`):**
   - Buscador reactivo por destino, nombre de paquete, mayorista o inclusiones.
   - Filtros combinables por destino, plan de alimentación (`TODO_INCLUIDO`, `DESAYUNO`, etc.) y switch de solo tarifas vigentes.
   - Métricas en tiempo real en la cabecera: total de paquetes, tarifarios vigentes, mayoristas aliados y destinos.
   - Grid de tarjetas responsivas con destino, días/noches, plan de alimentación, time limit de mayorista, inclusiones destacadas, precio de referencia «Desde» en clase `.cifra` y estado de vigencia.
2. **Ficha de Detalle y Matriz de Tarifas (`apps/web/src/components/catalogo/ficha-detalle-paquete.tsx`):**
   - Panel modal interactivo con desglose de temporadas (`desde` y `hasta`).
   - Matriz transparente de tarifas organizando precios por tipo de pasajero (Adulto ADT, Niño CHD e Infante INF con edades mínimas y máximas de corte) y acomodación (`SENCILLA`, `DOBLE`, `TRIPLE`, `CUADRUPLE`).
   - Muestra tarifa de venta para clientes y tarifa neta confidencial para el asesor.
   - Detalle de inclusiones con viñetas verdes y exclusiones con viñetas rojas.
   - Identificación del mayorista con contacto y días de time limit para pago antes de liberación de cupo.
   - Botón directo «Cotizar este paquete ahora» enlazando a `/cotizador` para cumplir la meta de propuesta en <5 minutos.
3. **Módulo Activado en Navegación Lateral (`BarraModulos`):**
   - Habilitado el acceso a `/catalogo` con icono de paquete y resaltado de ruta activa.
4. **Cero Tipos Redefinidos (R3):**
   - Integración directa con los contratos Zod de `@viajapro/contracts`. Cero tipos ad-hoc.

---

## 2. Entrega de Tarea 0c.4: Directorio de Contactos y Viajeros (`/contactos`)

- Directorio comercial con búsqueda reactiva, etiquetas (`VIP`, `Familia`, `Corporativo`) y consentimientos de datos.
- Ficha de detalle drawer (`FichaDetalleContacto`) con identidad, preferencias de viaje, badges de Ley 1581 / Meta (`TRANSACCIONAL`, `PROMOCIONAL`) y accesos directos a chat, cotizador y pipeline.

---

## 3. Entrega de Tarea 6: La Ventana de 24 Horas de Meta HSM

- Bloqueo estricto del redactor cuando la ventana está cerrada.
- Modal de selección y despacho de plantillas aprobadas (`ModalPlantillas`) con interpolación de variables y validación Zod.
- Banner de advertencia preventiva (<2 horas). Clave de idempotencia UUID v4 (R5).

---

## 4. Estado de las 5 Compuertas de Calidad (Todas en Verde)

1. **Pruebas (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 6 passed (6 suites), 36 passed (36 tests)
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
   # Result: Compiled successfully, 10 static routes (/catalogo, /contactos, /pipeline, /bandeja, etc.)
   ```
5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```

---

## 5. Sincronización Jira Cloud (VC-13, VC-3 y VC-4)

- Comentarios y avances registrados en Jira Cloud vía REST API.
- Commits en `origin/feat/bandeja-web` listos para inspección.
