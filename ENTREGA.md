# ENTREGA.md — Tarea 0b (Diseño y UX de la Bandeja) y Extracción de Pruebas Puras

## Veredicto Previo Subsanado: Tarea 0b y Pruebas Puras con Mutación

Se completó integralmente la **Tarea 0b** según las especificaciones de `DISENO-BANDEJA.md` y el diseño UX en `viajapro_diseno_ui_ux.json`, junto con la extracción de la lógica a funciones puras testeables en `apps/web/src/lib/bandeja-logica.ts`.

---

### 1. Resumen de Implementación de Diseño (0b.1 a 0b.9)

1. **0b.1 Sacar instrumental de desarrollo:**
   - Eliminados subtítulos («Mock Simulador», «Guard R5/UI», «v0.1.0») y casillas de prueba del redactor.
   - El banner de reorden diferido ahora muestra el lenguaje del asesor: **«X conversaciones nuevas · Actualizar»** de forma discreta.
   - Sustituido el `alert()` al intentar enviar fuera de la ventana de 24h por un componente modal accesible y estilizado (`ModalPlantillas`) para seleccionar plantillas Meta HSM aprobadas.

2. **0b.2 Armazón de Tres Columnas (`apps/web/src/app/bandeja/layout.tsx`):**
   - Rejilla: `[56px_320px_1fr]` en escritorio y `[56px_340px_1fr_340px]` en pantallas `xl:`.
   - **`ListaConversaciones` vive en el layout**: el asesor puede saltar entre conversaciones con un solo clic sin recargar la página y sin perder el scroll ni el estado de sus filtros.
   - `apps/web/src/app/bandeja/page.tsx` es ahora el estado vacío central («Elige una conversación para empezar»).
   - Cada columna cuenta con `min-h-0 overflow-y-auto` independiente.

3. **0b.3 Barra lateral de módulos (`BarraModulos`):**
   - 56 px de ancho en `apps/web/src/components/bandeja/barra-modulos.tsx`.
   - Logo ViajaPro, accesos a Bandeja y Cotizador activos, y módulos futuros con tooltip «Próximamente».
   - Widget **«Meta de cierres»** con ventas confirmadas y progreso (71%).
   - Selector de modo oscuro y avatar del asesor integrados al pie de la barra lateral.

4. **0b.4 Panel derecho contextual (`FichaCliente`):**
   - Componente `apps/web/src/components/bandeja/ficha-cliente.tsx`.
   - Permanente en pantallas `xl` (340 px) y accesible mediante drawer/sheet lateral en pantallas intermedias.
   - Muestra: Identidad con avatar determinista e iniciales, etiquetas, oportunidad viva con etapa y próxima tarea, cotizaciones recientes con precios en clase `.cifra`, archivos de viaje (`TravelFile`), notas internas de CRM, y acciones de cierre fijas al pie (**«Crear cotización»** y **«Ver archivo completo»**).

5. **0b.5 Iconografía real (`lucide-react`) y Avatares deterministas:**
   - Emojis eliminados como iconografía de interfaz; reemplazados por iconos SVG consistentes de `lucide-react` (`Search`, `Rows3`, `Clock`, `AlertTriangle`, `PlusCircle`, etc.).
   - Avatares con iniciales y paleta de color determinista calculada según el identificador de contacto (`generarColorAvatar` y `obtenerIniciales`).

6. **0b.6 Cabecera del hilo orientada a negocio:**
   - Cuenta atrás viva de la ventana de 24 horas (`calcularTiempoRestanteVentana`), recalculada cada minuto.
   - SLA badge visible.
   - Acción principal destacada como único botón sólido de acento: **«Nueva cotización»**.

7. **0b.7 Tarjetas de cotización dentro del hilo (`TarjetaCotizacion`):**
   - Componente `apps/web/src/components/bandeja/tarjeta-cotizacion.tsx` para renderizar propuestas de viaje con precio en `.cifra` y botón para ver en el cotizador.

8. **0b.9 Responsive Móvil (375 px):**
   - En móviles (<768 px), la interfaz conmuta entre la lista (`/bandeja`) y el hilo (`/bandeja/[id]`) con flecha `← Volver`.
   - Filtros y controles adaptados para un área táctil mínima de 36 a 44 px.

---

### 2. Extracción de Funciones Puras y Verificación por Mutación

La lógica de negocio se extrajo a funciones puras desacopladas de React en `apps/web/src/lib/bandeja-logica.ts`:
- `reordenarConGuardia(prevVisible, bufferActual, evento, ratonEncima)`
- `claveDeReintento(mapaIdempotencia, mensajeId)`
- `debeBajarElScroll(distanciaAlFondo, umbralPx)`
- `calcularTiempoRestanteVentana(expiraEn)`

Las pruebas automáticas en `apps/web/src/lib/bandeja-comportamiento.spec.ts` ahora importan y prueban directamente estas funciones de producción.

#### Evidencia de Verificación por Mutación:
1. **Mutación en `claveDeReintento`:**
   - *Mutante:* Se eliminó la comprobación en `mapaIdempotencia` para forzar la generación de una clave nueva en cada llamada.
   - *Resultado:* La **Prueba 3 falló inmediatamente en rojo** (`AssertionError: expected false to be true` al comprobar `esReutilizada`).
2. **Mutación en `reordenarConGuardia`:**
   - *Mutante:* Se eliminó la derivación sobre `bufferActual` (`const base = [...prevVisible]`).
   - *Resultado:* La **Prueba 2 falló inmediatamente en rojo** (`AssertionError: expected 'Inicio A' to be 'Actualización A'` al perderse la primera actualización en el búfer).
3. **Código restaurado:** Ambas pruebas vuelven a ponerse en verde tras revertir la mutación.

---

### 3. Estado de las 5 Compuertas de Calidad

1. **Pruebas unitarias (Vitest):**
   ```bash
   npx pnpm --filter @viajapro/web test
   # Result: 2 test files passed, 8/8 tests passed (0 failures).
   ```

2. **Verificación de Tipos (TypeScript):**
   ```bash
   npx pnpm --filter @viajapro/web typecheck
   # Result: 0 errors (tsc --noEmit limpio).
   ```

3. **Linter (ESLint):**
   ```bash
   npx pnpm --filter @viajapro/web lint
   # Result: 0 errors, 0 warnings.
   ```

4. **Compilación de Producción (Next.js Build):**
   ```bash
   npx pnpm --filter @viajapro/web build
   # Result: Compiled successfully (0 errors), /bandeja (2.81 kB), /bandeja/[id] (10.9 kB).
   ```

5. **Formato (Prettier):**
   ```bash
   npx pnpm format:check
   # Result: All matched files use Prettier code style!
   ```


---

## 4. Estado de la Cola: AGOTADA — Solicitud de Reposición a Claude

- **Tareas activas:** Tareas 0, 0b, 1, 2, 3, 4, 5 y 7 completadas y verificadas al 100%.
- **Reserva:** Densidad configurable, Atajos de teclado del hilo y Modo oscuro completados al 100%.
- **Tarea 6 (Ventana 24h Meta):** Pausada a la espera del esquema `EnviarPlantilla` en backend / contratos.
- **Siguiente paso para Claude:** Reponer la cola con la siguiente pantalla (`/pipeline` — Tablero Kanban de Oportunidades según `viajapro_diseno_ui_ux.json` y `packages/contracts/src/crm.ts`), o indicar las tareas siguientes del roadmap.


---

## 5. Actualización en Jira Cloud (VC-13)

- **Ticket:** [VC-13] 5 — Bandeja de conversaciones en la web.
- **Acción realizada:** Se registró el comentario formal de entrega en Jira detallando la implementación de la Tarea 0b, el armazón de tres columnas, la extracción de funciones puras, los commits `685ec53` y `10f5a96`, y el paso exitoso de las 5 compuertas de calidad.
