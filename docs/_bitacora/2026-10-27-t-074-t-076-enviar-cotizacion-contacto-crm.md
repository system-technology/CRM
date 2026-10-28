# 2026-10-27 — T-074 y T-076: Enviar cotización por WhatsApp y Gestión CRM de contacto y oportunidad en la bandeja

**Contexto:** `inbox` y `crm`
**Tareas cerradas:** `T-074`, `T-076`
**Ramas:** `b/T-074-t-076-enviar-cotizacion-contacto-crm`
**Diseño Stitch:** Pantalla `534cbe1440c34cfa86668289dbe5408d` (*Bandeja WhatsApp con Modal Cotización & Panel CRM — ViajaPro CRM*, Proyecto `8333038101997719867`).

---

## 1. Qué se hizo

### T-074: Botón «Enviar cotización» en la conversación de la bandeja
1. **Contrato:**
   - Añadido `EnviarCotizacionCuerpo` a `packages/contracts/src/inbox.ts` con `{ cotizacionId: Id, version?: number, claveIdempotencia?: string }`.
2. **API y Backend:**
   - Endpoint `POST /api/v1/conversaciones/:id/cotizaciones` en `ConversacionesController`, `ActuarEnConversacionUseCase` y `ConversacionesPrisma`.
   - Idempotente por clave (R5), respetando la ventana de 24 horas (`VentanaCerradaError`).
3. **Frontend:**
   - Creado `ModalEnviarCotizacion` en `apps/web/src/components/bandeja/modal-enviar-cotizacion.tsx`.
   - Selector de cotizaciones guardadas con cálculo de vigencia y precio en formato local `es-CO`.
   - Vista previa formateada para WhatsApp con emojis, inversión, pasajeros y vigencia.
   - Banner de advertencia si la ventana de servicio de 24h está cerrada.
   - Manejo de estados: `inactivo`, `enviando`, `enviado`, `fallido` con opción de reintentar.
   - Botón «Enviar cotización» (`data-testid="boton-abrir-enviar-cotizacion"`) en la barra de herramientas del chat.
   - Al enviar, se anexa reactivamente el mensaje al hilo de la conversación.

### T-076: Pantalla/modal de contacto y botón «Crear oportunidad» en la conversación
1. **Cliente API CRM:**
   - Creadas funciones `crearOportunidadDeConversacionApi`, `editarContactoApi` y `crearContactoApi` en `apps/web/src/lib/crm-api.ts`.
   - Mocks completos y reactivos en `apps/web/src/lib/mock-crm.ts`.
2. **Componentes:**
   - Creado `ModalEditarContacto`: formulario para nombre, teléfono (formato internacional E.164), correo, etiquetas y preferencias.
   - Creado `ModalCrearOportunidad`: formulario para abrir oportunidad en la etapa inicial `NUEVO_LEAD` asociada a la conversación y contacto.
   - Actualizado `FichaCliente`: botón `data-testid="btn-editar-contacto"` y botón `data-testid="btn-crear-oportunidad"` (tanto para abrir nueva oportunidad como para el estado vacío sin oportunidad activa).
   - Integrado en `apps/web/src/app/bandeja/[id]/page.tsx` para vistas desktop y cajón móvil.

---

## 2. Pruebas y Verificación
- `modal-enviar-cotizacion.spec.tsx`: 7 pruebas unitarias y de componente (formateo WhatsApp, selector, ventana 24h, transiciones de estados, touch target >= 44px).
- `modal-crear-oportunidad.spec.tsx`: 3 pruebas (validaciones, apertura en `NUEVO_LEAD`, touch target).
- `modal-editar-contacto.spec.tsx`: 3 pruebas (precarga, mutación vía API, touch target).
- `ficha-cliente.spec.tsx`: 4 pruebas (renderizado, llamadas a callbacks de edición y creación de oportunidades).
- Vitest en `@viajapro/web`: 53 suites pasando, 433 pruebas verdes.
- ESLint en `@viajapro/web`: 0 errores.
- Typecheck en `@viajapro/web` y `@viajapro/api`: 0 errores.
- `pnpm test:hooks`: 59/59 y 19/19 en verde.
