# ENTREGA.md — Tareas 0d y 0c.3 (Pipeline de Oportunidades /pipeline) y Sincronización Jira

## 1. Entrega de Tarea 0c.3: Pantalla de Pipeline de Oportunidades (`/pipeline`)

Tomada directamente del roadmap oficial (Jira Epic VC-3 Fase 2, `COLA-DESPUES.md §0c.3` y `viajapro_diseno_ui_ux.json`) para garantizar el trabajo continuo sin detener el desarrollo.

### Implementación y Componentes Construidos:
1. **Ruta y Armazón (`apps/web/src/app/pipeline/page.tsx`):**
   - Integrada en el armazón de la aplicación con la `BarraModulos` a la izquierda (acceso activo a `/pipeline` e icono Kanban).
   - Cabecera con estadísticas en tiempo real (oportunidades activas, ganadas y perdidas).
   - Barra de herramientas con buscador predictivo por cliente, destino o título, selector de asesor asignado y conmutador de vistas duales: **Tablero Kanban** y **Tabla compacta**.
2. **Tablero y Columnas (`apps/web/src/components/pipeline/columna-kanban.tsx`):**
   - 5 etapas de negocio: `NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`.
   - **Invariante 1 — Totales de servidor:** Cada columna muestra su cantidad de tarjetas y el `valorTotal` monetario denormalizado provisto por el servidor en formato `.cifra` ($18.5M, $28.3M, $23.5M, $16.2M, $8.9M). No se recalcula sumando tarjetas visibles en el cliente.
   - Zona de drop para drag-and-drop con indicador visual punteado.
3. **Tarjetas de Oportunidad (`apps/web/src/components/pipeline/tarjeta-oportunidad.tsx`):**
   - Nombre de cliente y avatar determinista, destino con icono de mapa, título, valor estimado en clase `.cifra`, probabilidad (badge según nivel), tiempo relativo desde el último contacto y asesor asignado.
   - **Alertas de Próxima Tarea:** Detección de tareas atrasadas con icono de alerta rojo y fecha de vencimiento resaltada.
   - **Invariante 2 — Alternativa accesible por teclado:** Menú contextual desplegable («Mover a...») con navegación por flechas para trasladar la oportunidad a cualquier otra etapa sin requerir ratón.
   - Enlace directo al chat de WhatsApp del cliente (`/bandeja`).
4. **Modal de Pérdida Obligatorio (`apps/web/src/components/pipeline/modal-motivo-perdida.tsx`):**
   - **Invariante 3 — Regla de Contrato R3:** Soltar o mover una tarjeta a `PERDIDA` detiene la operación y abre un diálogo modal accesible que exige seleccionar el motivo (`PRECIO`, `TIEMPO_DE_RESPUESTA`, `SIN_DISPONIBILIDAD`, `COMPRO_EN_OTRA_AGENCIA`, `VIAJE_APLAZADO`, `NO_RESPONDE`, `OTRO`).
   - Si se selecciona `OTRO`, el campo de texto es estrictamente obligatorio según el refinamiento `exigirMotivoDePerdida` del esquema Zod.
5. **Lógica Pura y Simulador (`apps/web/src/lib/pipeline-logica.ts` y `mock-pipeline.ts`):**
   - Función inmutable `moverOportunidadEnTablero`.
   - Formateador de moneda segura y cálculo de tareas vencidas.
   - Fuente de datos simulada conforme al esquema `TableroPipeline` de `@viajapro/contracts`.

---

## 2. Pruebas Automáticas y Verificación por Mutación (`pipeline-logica.spec.ts`)

7 pruebas unitarias nuevas añadidas en `apps/web/src/lib/pipeline-logica.spec.ts` (16/16 pruebas pasando en total):
- **Prueba 1:** Mover a `PERDIDA` sin motivo es rechazado por Zod (`exigirMotivoDePerdida`).
- **Prueba 2:** Mover a `PERDIDA` con motivo `OTRO` sin nota de explicación es rechazado por Zod.
- **Prueba 3:** Mover a `PERDIDA` con motivo válido (ej. `PRECIO`) pasa con éxito.
- **Prueba 4:** Asignar `motivoPerdida` a etapas no perdidas (ej. `GANADA`) es rechazado por Zod.
- **Prueba 5:** `moverOportunidadEnTablero` traslada la tarjeta a la columna destino inmutablemente.
- **Prueba 6:** El `valorTotal` monetario de la columna se preserva del servidor y no se recalcula en cliente.
- **Prueba 7:** `esTareaAtrasada` detecta vencimientos en el pasado.

---

## 3. Estado de las 5 Compuertas de Calidad (Todas en Verde)

1. **Pruebas (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 3 passed (3), 16 passed (16)
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
   # Result: ✓ Compiled successfully in 3.8s, 8 static routes (/pipeline 10.4 kB)
   ```
5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```

---

## 4. Sincronización Jira Cloud (VC-13 y Epic VC-3)

- Comentarios y estado registrados en Jira Cloud con evidencia de pruebas y compuertas.
- Commits en rama `feat/bandeja-web` listos para inspección.
