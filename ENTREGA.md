# ENTREGA.md — Tareas 0d, 0c.3 (Pipeline Kanban), 6 (Ventana 24h Meta HSM) y 0c.4 (Directorio de Contactos)

## 1. Entrega de Tarea 0c.4: Directorio de Contactos y Viajeros (`/contactos`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P0: Directorio y ficha de contacto) · Epic VC-3 (Fase 2: CRM) · `@viajapro/contracts` (`Contacto`, `Consentimiento`, `PaginaContactos`).

### Implementación Realizada:
1. **Directorio Comercial en `/contactos` (`apps/web/src/app/contactos/page.tsx`):**
   - Buscador en tiempo real reactivo por nombre, teléfono E.164 o correo electrónico.
   - Filtro interactivo por etiquetas de negocio (`VIP`, `Familia`, `Corporativo`, `Cancún`, etc.).
   - Filtro por estado de consentimiento de datos (`Todos`, `Transaccional y Promocional`, `Solo Transaccional`, `Pendiente`).
   - Métrica en cabecera con conteo total de contactos registrados y contactos filtrados.
   - Tabla responsiva con avatares deterministas, canales de contacto con formato visual, etiquetas y acciones rápidas.
2. **Ficha de Detalle del Contacto (`apps/web/src/components/contactos/ficha-detalle-contacto.tsx`):**
   - Panel lateral modal/drawer con información completa del contacto seleccionado.
   - Datos de identidad y comunicación (teléfono E.164, correo, fecha de registro).
   - Preferencias de viaje para fidelización y recompra: aerolíneas preferidas, tipo de asiento, requerimientos especiales y notas comerciales.
   - Distinción explícita de consentimientos de datos (Ley 1581 de 2012 / Políticas de Meta): badges para consentimiento transaccional y promocional con indicación de estado.
   - Accesos directos a flujos comerciales: botón para abrir chat en WhatsApp (`/bandeja`), generar cotización (`/cotizador`) y vincular a oportunidad (`/pipeline`).
3. **Cero Tipos Redefinidos (R3):**
   - Integración estricta con esquemas Zod de `@viajapro/contracts`: `Contacto`, `Consentimiento`, `PaginaContactos` (estructura `{ datos, pageInfo }`).
4. **Habilitación de Navegación Lateral:**
   - Activado el acceso directo a Contactos en `BarraModulos` (`disponible: true`, indicador de ruta activa para `/contactos`).

---

## 2. Entrega de Tarea 6: La Ventana de 24 Horas, de Verdad (Meta HSM)

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
   - Las plantillas no aprobadas aparecen deshabilitadas con el motivo exacto registrado por Meta.
   - Formulario interactivo para rellenar variables `{{1}}`, `{{2}}`... con marcadores de posición basados en ejemplos.
   - Vista previa en tiempo real del texto final interpolado antes de despachar.
   - Validación Zod estricta (`EnviarPlantilla.superRefine`): rechaza el envío si algún hueco queda vacío o en blanco.
   - Generación criptográfica de UUID v4 para la clave de idempotencia (R5).
5. **Simulador y Lógica Pura (`apps/web/src/lib/mock-plantillas.ts` y `plantillas-logica.ts`):**
   - Catálogo de plantillas pre-registradas conforme al contrato.
   - Funciones puras de interpolación y cálculo de tiempo restante.

---

## 3. Pruebas Automáticas y Calidad (28/28 Pruebas en Verde)

Se añadieron 6 pruebas unitarias nuevas en `apps/web/src/lib/contactos-logica.spec.ts`:
- **Prueba 1:** Valida estructura de contactos conformes al contrato `Contacto` de Zod.
- **Prueba 2:** Búsqueda reactiva filtra por nombre, teléfono o correo.
- **Prueba 3:** Filtrado por etiqueta de negocio (`VIP`, `Familia`, `Corporativo`).
- **Prueba 4:** Filtrado por consentimiento de datos (`PROMOCIONAL`, etc.).
- **Prueba 5:** Obtención de contacto por ID existente y retorno de `null` si no existe.
- **Prueba 6:** Valida estructura de paginación conforme al contrato `PaginaContactos` (`datos`, `pageInfo`).

---

## 4. Estado de las 5 Compuertas de Calidad (Todas en Verde)

1. **Pruebas (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 5 passed (5 suites), 28 passed (28 tests)
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
   # Result: Compiled successfully, 9 static routes (/contactos, /pipeline, /bandeja, etc.)
   ```
5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```

---

## 5. Sincronización Jira Cloud (VC-13 y VC-3)

- Comentarios y avances registrados en Jira Cloud vía REST API.
- Commits en `origin/feat/bandeja-web` listos para inspección.
