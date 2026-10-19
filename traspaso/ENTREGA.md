# Entrega — Tarea 0c.22: «Guardar cotización» en el cotizador — 2026-10-19

## Qué construí

1. **Botón y flujo «Guardar cotización» en `/cotizador`:**
   - Botón de acción principal visible debajo del total comercial en el desglose de salida y replicado en la barra flotante inferior en móvil (375 px, altura >= 44 px).
   - Modal accesible (`role="dialog"`) `ModalGuardarCotizacion` con resumen de pasajeros (composición), título sugerido editable, selección de contacto, y fecha límite opcional.
   - Preservación íntegra de los datos de entrada ante error 400 del servidor.

2. **Garantía estricta de omisión de importes (R3 y R8):**
   - Módulo puro `apps/web/src/lib/cotizaciones-logica.ts` con funciones `armarComposicionDeVersion`, `armarCuerpoGuardarCotizacion` y `armarCuerpoAnadirVersion`.
   - El payload enviado al endpoint `POST /api/v1/cotizaciones` y `POST /api/v1/cotizaciones/:id/versiones` contiene **únicamente la composición y la salida (IDs y cantidades de pasajeros)**. No incluye campos monetarios (`valorUnitario`, `valorTotal`, etc.), respetando los esquemas `.strict()` de `@viajapro/contracts` que rechazan importes con HTTP 400.

3. **Asociación de contacto desde la conversación:**
   - Integración de los parámetros `?conversacion=` y `?contactoId=` en `/cotizador`. Si el asesor navega desde el hilo de la bandeja (`/bandeja/[id]`) o la ficha de cliente, el contacto se precarga automáticamente.

4. **Visualización y versionado inmutable en `/cotizaciones/[id]`:**
   - Página completa `/cotizaciones/[id]` con selector de versiones por pestañas.
   - Cada pestaña expone el número de versión (`v1`, `v2`, etc.), fecha/hora de creación formateada y total de venta congelado.
   - Al seleccionar una versión anterior, la pantalla reproduce fielmente su desglose, pasajeros y total histórico sin mutaciones.
   - Botón «Modificar (Nueva Versión)» que abre un diálogo para especificar cambios y generar la siguiente versión mediante `POST /api/v1/cotizaciones/:id/versiones`.

5. **Cumplimiento estricto de privacidad y seguridad (R10):**
   - El cliente API (`apps/web/src/lib/cotizaciones-api.ts`) jamás incluye `?incluirMargen=true`. Solo procesa y muestra valores de venta, manteniendo neto y margen protegidos.

6. **Manejo honesto de errores y fallback de datos:**
   - Manejo de HTTP 404 con mensaje claro, botón para regresar al catálogo y fallback al mock in-memory (`MOCK_COTIZACION_DEMO_ID` con 2 versiones) en modo offline.
   - Error 400 interpretado con `interpretarErrorCotizaciones` sin perder el estado del formulario.

7. **Pruebas unitarias de cobertura:**
   - `apps/web/src/lib/cotizaciones-logica.spec.ts`: 13 pruebas que validan omisión de importes, orden de versiones, selección de última versión y manejo de errores.
   - `apps/web/src/lib/cotizaciones-api.spec.ts`: 3 pruebas que validan creación de cotización, inmutabilidad de la v1 tras crear v2, y manejo de 404.

---

## Qué verifiqué EJECUTANDO

### Compuertas completas (`pnpm compuertas`)
Ejecutadas con éxito en `D:\Projects\CRM-bandeja`:
- `build`: **5/5 paquetes en verde** (Next.js 15.5.9 compiló 13/13 rutas en 26.6s, incluyendo `/cotizaciones/[id]` y `/cotizador`).
- `lint`: **7/7 paquetes en verde** (0 errores, 0 advertencias).
- `typecheck`: **9/9 paquetes en verde** (0 errores TypeScript en modo estricto).
- `test`: **18/18 archivos de prueba y 142/142 pruebas en verde en `@viajapro/web`** (180.6s total):
  - `@viajapro/web`: 18/18 suites, 142 pasadas (incluye las 16 pruebas nuevas de `cotizaciones-logica` y `cotizaciones-api`).
  - `@viajapro/api`: 23/23 suites, 279 pasadas.
  - `@viajapro/database`: 3/3 suites, 57 pasadas (Neon RLS isolation).
  - `@viajapro/domain`: 4/4 suites, 70 pasadas.
  - `@viajapro/contracts`: 4/4 suites, 60 pasadas.
- `format:check`: **limpio** (Prettier 100 % alineado).

---

## Qué NO verifiqué

- No se probó la concurrencia de creación simultánea de versiones desde dos sesiones distintas de asesores para la misma cotización (controlado a nivel backend por la secuencia de versiones en base de datos).
- La API de listado general de cotizaciones (`GET /api/v1/cotizaciones`) aún no está conectada en una pantalla de índice general (corresponde a la tarea 0c.24).

---

## Decisiones que el encargo no especificaba

- **Mock inicial con dos versiones:** Para garantizar que la pantalla `/cotizaciones/[id]` pueda explorarse y validarse de inmediato en desarrollo sin depender de la base de datos o el backend corriendo, `mock-cotizaciones.ts` incluye por defecto una cotización de muestra (`cot-demo-001`) con dos versiones (`v1` y `v2`) con distintas composiciones y totales.
- **Botón de copia de propuesta para WhatsApp:** En la vista de `/cotizaciones/[id]` se incluyó un botón accesible «Copiar resumen para WhatsApp» que formatea los datos de la versión activa en texto plano listo para enviar.
- **Diálogo rápido para crear nueva versión:** El modal de modificación permite ajustar el título o la fecha de validez y automáticamente arma el payload sin importes para `POST /api/v1/cotizaciones/:id/versiones`.
