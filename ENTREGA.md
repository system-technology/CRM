# ENTREGA.md — Tareas 0d, 0c.3 (Pipeline Kanban) y 6 (Ventana 24h Meta HSM) y Sincronización Jira

## 1. Entrega de Tarea 6: La Ventana de 24 Horas, de Verdad (Meta HSM)

Se transformó el estado pasivo de la ventana de servicio de Meta en una restricción activa del producto con soporte integral de plantillas HSM según los esquemas oficiales de `@viajapro/contracts`.

### Implementación Realizada:
1. **Restricción Estricta al Cierre de Ventana (`apps/web/src/app/bandeja/[id]/page.tsx`):**
   - Cuando la ventana está cerrada (`!detalle.ventana.abierta`), el redactor de texto libre queda deshabilitado y se muestra un panel con candado explicando la política de Meta.
   - El botón «Seleccionar plantilla aprobada» abre el modal especializado.
2. **Aviso Preventivo (<2 horas):**
   - Banner ámbar visible al tope del chat cuando restan menos de 120 minutos: `⚠️ Ventana de Meta por cerrar: quedan X min. Envía tu respuesta ahora o la reapertura exigirá una plantilla aprobada.`
3. **Preservación de Borrador:**
   - Si el asesor tenía texto escrito al momento del vencimiento o al abrir el modal, el borrador se preserva como `borradorPrevio` y se muestra dentro del modal como referencia para no perder el trabajo.
4. **Selector y Formulario de Plantillas (`apps/web/src/components/bandeja/modal-plantillas.tsx`):**
   - Utiliza exclusivamente los contratos `PlantillaWhatsApp`, `EnviarPlantilla` y `PlantillasDisponibles` (R3). Cero tipos locales redefinidos.
   - Presenta las plantillas con sus categorías (`UTILIDAD` y `MARKETING`) y sus estados en Meta (`APROBADA`, `PAUSADA`, `RECHAZADA`).
   - Las plantillas no aprobadas aparecen deshabilitadas con el motivo exacto registrado por Meta (ej. pausada por quejas de spam).
   - Formulario interactivo para rellenar variables `{{1}}`, `{{2}}`... con marcadores de posición basados en ejemplos.
   - Vista previa en tiempo real del texto final interpolado antes de despachar.
   - Validación Zod estricta (`EnviarPlantilla.superRefine`): rechaza el envío si algún hueco queda vacío o en blanco.
   - Generación criptográfica de UUID v4 para la clave de idempotencia (R5).
5. **Simulador y Lógica Pura (`apps/web/src/lib/mock-plantillas.ts` y `plantillas-logica.ts`):**
   - Catálogo de plantillas pre-registradas conforme al contrato.
   - Funciones puras de interpolación y cálculo de tiempo restante.

---

## 2. Pruebas Automáticas y Calidad (22/22 Pruebas en Verde)

Se añadieron 6 pruebas unitarias nuevas en `apps/web/src/lib/plantillas-logica.spec.ts`:
- **Prueba 1:** Interpolación correcta de marcadores `{{1}}` y `{{2}}`.
- **Prueba 2:** Rechazo estricto de variables vacías o con espacios en blanco por Zod (`superRefine`).
- **Prueba 3:** Validación exitosa con variables completas y clave UUID v4 (R5).
- **Prueba 4:** Detección de ventana urgente (<2h / <=120 min).
- **Prueba 5:** Detección de ventana cerrada en fechas expiradas.
- **Prueba 6:** Catálogo simulado incluye plantillas aprobadas y pausadas con sus motivos.

---

## 3. Estado de las 5 Compuertas de Calidad (Todas en Verde)

1. **Pruebas (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 4 passed (4 suites), 22 passed (22 tests)
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
   # Result: ✓ Compiled successfully in 3.8s, 8 static routes (/bandeja/[id] a 13.8 kB)
   ```
5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```

---

## 4. Sincronización Jira Cloud (VC-13 y VC-3)

- Comentarios y avances registrados en Jira Cloud vía REST API.
- Commits en `origin/feat/bandeja-web` listos para inspección.
