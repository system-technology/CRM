# ENTREGA.md — Tarea 0d (Ficha Atada a su Conversación) y Sincronización Jira / Roadmap

## 1. Entrega de Tarea 0d: La Ficha del Viajero Atada a su Conversación

Se resolvió el defecto bloqueante reportado en `REVISION.md` donde la ficha lateral mostraba siempre a «Sofía Gómez (+573001234567)» sin importar qué conversación estuviera abierta.

### Correcciones Realizadas:
1. **Atadura estricta al `conversacionId`:**
   - `obtenerMockFichaDeContacto(conversacionId)` ahora consulta la conversación en `MOCK_CONVERSACIONES`.
   - Recupera el `contactoId`, `contactoNombre`, `contactoTelefono` y etiquetas reales de la conversación abierta.
   - Si se consulta una conversación fuera del catálogo base, genera un contacto determinista derivado del hash del ID, garantizando que dos IDs diferentes jamás devuelvan el mismo teléfono.
2. **Conformidad Zod con `@viajapro/contracts` (R3):**
   - Todos los identificadores (`id`, `contactoId`, `cotizaciones[].id`, `archivosDeViajeIds`, `notasInternas[].id`) son UUID v4 válidos requeridos por el tipo `Id`.
   - Todos los datos son validados en la salida mediante `FichaDeContacto.parse(...)`.

### Evidencia de Prueba por Mutación (Criterio de Aceptación):
Se agregó la **Prueba 7** en `apps/web/src/lib/bandeja-comportamiento.spec.ts`:
- **Roja antes de la corrección:**
  ```
  FAIL src/lib/bandeja-comportamiento.spec.ts > 7. La Ficha del Viajero está atada a su conversación (0d)
  AssertionError: expected '+573001234567' not to be '+573001234567' // Object.is equality
  Tests: 1 failed | 8 passed (9)
  ```
- **Verde después de la corrección:**
  ```
  ✓ src/lib/bandeja-comportamiento.spec.ts (7 tests)
  ✓ src/lib/realtime-mock.spec.ts (2 tests)
  Tests: 9 passed (9)
  ```
  Juan Pérez devuelve `+573000012345` y Ana Martínez devuelve `+573000024690`.

### Subsanación de Observaciones No Bloqueantes (`REVISION.md`):
1. **Favicon 404:** Creado `apps/web/src/app/icon.svg` con el icono de ViajaPro (#2563eb y silueta blanca), servido automáticamente por Next.js App Router en `/icon.svg`.
2. **Ventana 24h variada:** En `mock-inbox.ts` se añadieron variaciones en `minutosRestantes` (35 min para casos urgentes con alerta naranja, 95 min, 4 h, 8 h, 18 h y cerrada -60 min), eliminando el valor constante de 11h 59min.
3. **Botón de Archivo de Viaje:** Eliminado el texto de promesa falsa `(Próximamente)` en `apps/web/src/components/bandeja/ficha-cliente.tsx`.

---

## 2. Estado de las 5 Compuertas de Calidad (Todas en Verde)

1. **Pruebas (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 2 passed (2), 9 passed (9)
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
   # Result: ✓ Compiled successfully in 3.3s, 7 static routes generated
   ```
5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```

---

## 3. Adopción de Siguiente Tarea desde Jira Cloud & Roadmap (Sin Detener el Trabajo)

Siguiendo la directriz del propietario («cuando te quedes sin tareas toma de Jira y lo colocas en el archivo para que lo trabajes y Claude sepa pero nunca te quedes sin trabajar pero tampoco inventes trabajos»):
- Se adopta la tarea oficial de Jira **Epic VC-3 (Fase 2 — CRM y pipeline)** detallada en `COLA-DESPUES.md §0c.3` y `viajapro_diseno_ui_ux.json`:
- **Tarea 0c.3: Pantalla de Pipeline de Oportunidades (`/pipeline`) — Tablero Kanban**.
- Registrada en `COLA.md` para conocimiento y seguimiento de Claude.
