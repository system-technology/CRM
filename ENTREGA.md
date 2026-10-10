# ENTREGA.md — Avance de Trabajo en `feat/bandeja-web`

## Tarea Entregada: 7. La ficha del viajero junto al hilo (`/bandeja/[id]`)

### 1. Resumen de Implementación
- **Ficha del Viajero (`FichaDeContacto`):** Se construyó el panel lateral y selector móvil para desplegar la información completa del viajero junto al hilo de conversación sin salir del contexto de la bandeja.
- **Cumplimiento Estricto de Contratos (`@viajapro/contracts`):**
  - **Lenguaje Ubicuo:** Se usa explícitamente **`TravelFile`** (`archivosDeViajeIds`) para los archivos de viaje confirmados (no `Booking` ni `Order`).
  - **Formatos de Dominio:** Se usó el tipo `Dinero` (`unidades` enteras y `moneda` ISO) para las cotizaciones y valores estimados.
  - **Esquemas:** Tipado directo contra `Contacto`, `Oportunidad`, `CotizacionResumen` y `FichaDeContacto`.
- **Adaptabilidad Responsive (Viewport 390px):**
  - En escritorio (`sm:` en adelante) la ficha se presenta como un panel lateral colapsable a la derecha.
  - En dispositivos móviles (<640px / 390px) se habilita un tab-bar superior (`[ 💬 Conversación ] [ 👤 Ficha del Viajero ]`) para conmutar fácilmente entre el chat y la ficha sin solapar elementos.
- **Mock CRM (`apps/web/src/lib/mock-crm.ts`):** Se implementó una fuente mock aislada de CRM que abastece de datos realistas al panel lateral (oportunidad viva, cotizaciones anteriores, notas internas y etiquetas).

---

## Estado de las 5 Compuertas de Calidad

1. **Pruebas unitarias (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 2 test files passed, 8/8 tests passed (0 failures).
   ```

2. **Verificación de Tipos (TypeScript):**
   ```bash
   npx pnpm --filter @viajapro/web typecheck
   # Result: 0 errors (tsc --noEmit clean).
   ```

3. **Linter (ESLint):**
   ```bash
   npx pnpm --filter @viajapro/web lint
   # Result: 0 errors.
   ```

4. **Compilación de Producción (Next.js Build):**
   ```bash
   npx pnpm --filter @viajapro/web build
   # Result: Compiled successfully (0 errors), /bandeja/[id] (8.45 kB).
   ```

5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```

---

## Estado de la Cola
- **[x] Tarea 5:** Pruebas automáticas de la bandeja (8/8 tests passing).
- **[ ] Tarea 6:** La ventana de 24 horas (PAUSADA por falta de esquema `EnviarPlantilla` en contratos, reportado anteriormente).
- **[x] Tarea 7:** La ficha del viajero junto al hilo (COMPLETADA Y VERIFICADA).
- **[x] Reserva:** Densidad configurable, Modo oscuro y Atajos de teclado del hilo (`r`, `c`, `/`, `↑`, `↓`, `Esc`, `?`).

Todas las tareas de la cola activa y reserva alcanzables han sido completadas y verificadas.
