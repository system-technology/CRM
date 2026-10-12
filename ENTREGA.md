# ENTREGA.md — Tareas 0d, 0c.3–0c.11 y 0c.12 (Asistente Copilot IA en la Bandeja)

## 0. Entrega de Tarea 0c.12: Asistente Copilot IA en la Bandeja: Extractor de Oportunidades, Resumen Ejecutivo y Respuestas Sugeridas con Aprobación Humana

Origen: `viajapro_diseno_ui_ux.json` (§`interaction_patterns.ai` y §`states_and_business_rules.human_approval_required_for_ai_outbound: true`) · Jira Epics VC-6 (Fase 5 — Automatización e IA) y VC-13 (Bandeja Web) · Regla R8 (dinero en enteros de COP sin flotantes), R9 (fechas en UTC) y R10 (PII sensible protegida).

### Implementación Realizada:
1. **Motor Heurístico y de Extracción IA (`apps/web/src/lib/asistente-ia-logica.ts`):**
   - `extraerDatosViajeDeMensajes`: detecta destinos (Cancún, San Andrés, Punta Cana, Cartagena, Orlando, etc.), cantidad de adultos/niños, fechas tentativas, preferencias de alojamiento y presupuesto declarado en COP (R8).
   - `generarResumenConversacion`: resume necesidades, objeciones y siguiente acción recomendada en 3 viñetas ejecutivas para acelerar la toma de contexto entre asesores.
   - `sugerirRespuestaComercial`: genera borradores personalizados con destino, número de personas y llamado a cotización.
   - `calificarLead`: calcula puntuación objetiva (`ALTO`, `MEDIO`, `BAJO`) con justificación explícita según variables comerciales detectadas.

2. **Invariante de Aprobación Humana Obligatoria (`human_approval_required_for_ai_outbound`):**
   - La respuesta generada por IA **nunca** se despacha sola al cliente.
   - El botón "Insertar en borrador" traslada el texto al área de redacción (`textarea`) del asesor para su lectura, adaptación y envío explícito.

3. **Interfaz de Usuario (`apps/web/src/components/bandeja/panel-copilot-ia.tsx` y `apps/web/src/app/bandeja/[id]/page.tsx`):**
   - Botón interactivo "✨ Copilot IA" integrado en la barra de herramientas del chat junto a los selectores de mensajes y notas internas.
   - Panel deslizable con:
     - Indicador de calificación de lead (`Lead ALTO/MEDIO/BAJO` con puntos y justificación).
     - Tarjeta de datos detectados con enlace a "Precargar Cotizador" (`/cotizador?destino=...&adultos=...&ninos=...`).
     - Resumen ejecutivo de 3 puntos clave.
     - Respuesta comercial sugerida con botón de inserción asistida y recordatorio de revisión humana.

4. **Pruebas Automatizadas en Vitest (`apps/web/src/lib/asistente-ia-logica.spec.ts`):**
   - 6 pruebas unitarias cubriendo extracción de destinos, pasajeros y presupuesto en COP, generación de resumen, redacción comercial y calificación de leads.
   - Total suite: **100/100 pruebas pasando en 14 suites**.

### Verificación de las 5 Compuertas:
- **Vitest:** 100/100 pruebas pasando en 14 suites (`pnpm --filter @viajapro/web test`).
- **TypeScript:** `tsc --noEmit` 0 errores.
- **ESLint:** `eslint src` 0 errores, 0 advertencias.
- **Next.js Build:** Generación estática exitosa de las 13 rutas de la aplicación (`pnpm --filter @viajapro/web build`).
- **Prettier:** 100% verificado (`pnpm format:check`).

---

## 0. Entrega de Tarea 0c.11: Centro de Búsqueda Global Omnicanal (`Cmd+K` / `Ctrl+K`) y Centro de Alertas Operativas Críticas

Origen: `viajapro_diseno_ui_ux.json` (§`interaction_patterns.global_search` y §`interaction_patterns.notifications`) · Jira Epics VC-1 (Fundaciones) y VC-2 / VC-13 (Bandeja Web e Integración) · Criterios de usabilidad ("Responder un mensaje requiere tres clics o menos", "SLA, time limits y pagos pendientes son visibles").

### Implementación Realizada:
1. **Motor de Búsqueda Global Unificado (`apps/web/src/lib/buscador-global-logica.ts`):**
   - Búsqueda en memoria indexando 6 categorías transversales:
     - ⚡ **Acciones Rápidas:** Atajos directos a Bandeja, Pipeline, Cotizador, Viajes, Contactos, Catálogo, Reportes y Configuración.
     - 💬 **Conversaciones WhatsApp:** Búsqueda por nombre de contacto, teléfono E.164 y extracto del último mensaje.
     - 📇 **Contactos y Viajeros:** Indexación sobre `PaginaContactos.datos` con nombre, teléfono, correo y etiquetas.
     - 📊 **Oportunidades:** Búsqueda sobre columnas del Kanban por título, cliente, valor en COP (`Money` R8) y etapa configurada.
     - ✈️ **Archivos de Viaje (TravelFiles):** Indexación por código de expediente (`EXP-2026-...`), titular, destino y fechas de viaje.
     - 📦 **Catálogo:** Paquetes turísticos filtrados por destino, nombre y mayorista.
   - Búsqueda insensible a tildes y mayúsculas con normalización NFD.

2. **Centro de Notificaciones y Alertas Operativas (`apps/web/src/lib/notificaciones-logica.ts`):**
   - Agregación y detección reactiva de alertas operativas:
     - **SLA de WhatsApp Excedido:** Detección de mensajes sin leer o chats con SLA de primera respuesta vencido (>15 min).
     - **Time Limit de Reservas Mayoristas:** Alertas críticas (< 24h o vencido) y advertencias para reservas de hoteles/aerolíneas próximas a caducar.
     - **Saldos Pendientes:** Viajes confirmados con recaudos pendientes en COP (R8).
     - **Documentación Faltante:** Expedientes con pasaportes o vouchers pendientes de carga.
   - Clasificación por severidad (`critica`, `advertencia`, `informativa`) y contador de alertas no leídas.

3. **Pruebas Automatizadas en Vitest:**
   - `apps/web/src/lib/buscador-global-logica.spec.ts` (8 pruebas unitarias).
   - `apps/web/src/lib/notificaciones-logica.spec.ts` (4 pruebas unitarias).
   - Suite total: **94/94 pruebas pasando en 13 archivos de prueba**.

4. **Componentes de Interfaz de Usuario:**
   - `apps/web/src/components/busqueda/modal-busqueda-global.tsx`: Modal Spotlight tipo `⌘K` accesible con atajo de teclado en cualquier ruta, navegación fluida con flechas de dirección (arriba/abajo), `Enter` para navegar y `Esc` para cerrar.
   - `apps/web/src/components/notificaciones/panel-notificaciones.tsx`: Popover flotante desplegable desde la campana con selector de filtros (Todas, Críticas, Advertencias), insignia roja de no leídas y botones de salto directo en un solo clic ("Responder Chat", "Ver Expediente").
   - Integración transversal en la barra lateral (`apps/web/src/components/bandeja/barra-modulos.tsx`).

### Verificación de las 5 Compuertas:
- **Vitest:** 94/94 pruebas pasando en 13 suites (`pnpm --filter @viajapro/web test`).
- **TypeScript:** `tsc --noEmit` 0 errores.
- **ESLint:** `eslint src` 0 errores, 0 advertencias.
- **Next.js Build:** Generación estática exitosa de las 13 rutas de la aplicación (`pnpm --filter @viajapro/web build`).
- **Prettier:** 100% verificado (`pnpm format:check`).

---

## 0. Entrega de Tarea 0c.10: Pantalla de Expediente Operativo y Archivo de Viaje (`/viajes` — `travel_file`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P1: `travel_file` Archivo de viaje) · `docs/01-producto/02-lenguaje-ubicuo.md` (`TravelFile`, `Booking`, `timeLimit`, `recordLocator`, `Supplier`) · Reglas R8 (Dinero en enteros de COP sin decimales), R9 (Fechas UTC) y R10 (PII sensible de pasajeros enmascarada y protegida).

### Implementación Realizada:
1. **Modelos de Dominio y Datos Tipados (`apps/web/src/lib/mock-viajes.ts`):**
   - Estructura canónica del archivo de viaje: `ArchivoDeViaje`, `ReservaProveedor` (`Booking`), `PasajeroViaje`, `PagoAbono`, `DiaItinerario`, `NotaBitacora`.
   - Estados de expediente: `CONFIRMADO`, `EN_OPERACION`, `VIAJANDO`, `COMPLETADO`, `CANCELADO`.
   - Datos reales de agencias colombianas: expedientes para Cancún todo incluido, San Andrés Islas y Punta Cana.

2. **Lógica Pura y Reglas Críticas de Negocio (`apps/web/src/lib/viajes-logica.ts`):**
   - `calcularSaldoPendiente`: Balance financiero en COP (R8), cálculo de porcentaje de recaudo y validación de saldado total.
   - `evaluarAlertaTimeLimit`: Detección en tiempo real de vencimiento de reservas de mayoristas/aerolíneas, con clasificación de urgencia crítica (< 24h o vencido) para evitar penalidades y pérdidas de inventario.
   - `enmascararDocumentoPii`: Protección rigurosa de datos de pasaporte y cédula (R10) mostrando únicamente tipo y últimos 3-4 dígitos.
   - `verificarDocumentacionCompleta`: Auditoría de pasaportes y vouchers por cada pasajero.
   - `calcularMargenOperativoExpediente`: Cálculo de rentabilidad en COP y porcentaje de margen bruto operativo sobre costos de mayoristas.

3. **Pruebas Automatizadas en Vitest (`apps/web/src/lib/viajes-logica.spec.ts`):**
   - 13 pruebas unitarias exhaustivas probando balance financiero, alertas de time limit próximas y vencidas, enmascaramiento PII, control documental de pasaportes y cálculo de margen.
   - Total suite: **82/82 pruebas pasando en 11 suites de Vitest**.

4. **Interfaz de Usuario del Expediente Operativo (`apps/web/src/app/viajes/page.tsx`):**
   - Selector lateral con lista de expedientes activos y soporte de parámetro de URL (`?id=...`) para transición fluida desde la Ficha de Contacto.
   - Cabecera con resumen del viaje, estado visual, titular, fechas de viaje y saldo pendiente de recaudo.
   - Resumen financiero de 4 tarjetas: Total Venta (COP), Total Recaudado (COP), Saldo Pendiente (COP) y Margen Bruto Estimado.
   - Pestañas operativas:
     - **Itinerario:** Cronograma día por día con traslados, vuelos, hoteles y excursiones.
     - **Pasajeros y Documentos:** Lista con tipo de pasajero, documento enmascarado (R10), estado de pasaporte y vouchers.
     - **Reservas Proveedores (Bookings):** Mayorista, PNR/localizador copiable en un clic, costo neto mayorista y alerta de time limit destacada.
     - **Pagos y Tesorería:** Historial de abonos con fecha UTC, método de pago y soporte.
     - **Bitácora Operativa:** Registro cronológico de notas de seguimiento de la agencia.
   - Habilitación del módulo en la barra de navegación lateral (`apps/web/src/components/bandeja/barra-modulos.tsx`).

### Verificación de las 5 Compuertas:
- **Vitest:** 82/82 pruebas pasando en 11 suites (`pnpm --filter @viajapro/web test`).
- **TypeScript:** `tsc --noEmit` 0 errores.
- **ESLint:** `eslint src` 0 errores, 0 advertencias.
- **Next.js Build:** Generación estática exitosa de las 13 rutas de la aplicación (`pnpm --filter @viajapro/web build`).
- **Prettier:** 100% conforme (`pnpm format:check`).

---

## 1. Entrega de Tarea 0c.9: Conexión de API Real del CRM: Tablero Pipeline, Movimiento de Etapas y Ficha de Contacto

Origen: Instrucción directa de arquitectura en `COLA.md` por Claude · Endpoints verificados en `apps/api/src/modules/crm/interface/crm.controller.ts` (`GET /api/v1/crm/tablero`, `PATCH /api/v1/crm/oportunidades/:id/etapa`, `GET /api/v1/crm/contactos/:id/ficha`, `GET /api/v1/crm/contactos`).

### Implementación Realizada:
1. **Cliente de API Robusto (`apps/web/src/lib/crm-api.ts`):**
   - Endpoints integrados y tipados estrictamente contra contratos oficiales:
     - `obtenerTableroPipeline`: consume `GET /api/v1/crm/tablero` validando respuesta con `TableroPipeline.parse`.
     - `moverOportunidadDeEtapa`: valida payload con `MoverOportunidad.parse`, envía `PATCH /api/v1/crm/oportunidades/:id/etapa` y valida respuesta con `Oportunidad.parse`.
     - `obtenerFichaDeContacto`: consume `GET /api/v1/crm/contactos/:id/ficha` validando con `FichaDeContacto.parse`.
     - `listarContactos`: consume `GET /api/v1/crm/contactos?buscar=...` validando con `PaginaContactos.parse`.
   - Manejo de cabecera `x-dev-tenant-id` para entorno local (R1/R2).
   - Resiliencia transparente: fallback local ante caídas de red o ejecuciones estáticas para garantizar disponibilidad continua.

2. **Integración Reactiva en UI:**
   - `apps/web/src/app/pipeline/page.tsx`: Carga inicial asíncrona vía `obtenerTableroPipeline`, y movimiento de tarjetas con actualización optimista inmediata + persistencia asíncrona vía `moverOportunidadDeEtapa`.
   - `apps/web/src/app/bandeja/[id]/page.tsx`: Ficha lateral conectada a `obtenerFichaDeContacto`.
   - `apps/web/src/app/contactos/page.tsx`: Directorio de contactos conectado a `listarContactos`.

3. **Pruebas Automatizadas (`apps/web/src/lib/crm-api.spec.ts`):**
   - 5 pruebas unitarias cubriendo consulta de tablero, movimiento con regla de pérdida, rechazo de `OTRO` sin nota explicativa, consulta de ficha y filtrado de contactos.
   - Vitest en 69/69 pruebas totales en verde a través de 10 suites.

### Verificación de las 5 Compuertas:
- **Vitest:** 69/69 pruebas pasando en 10 suites.
- **TypeScript:** `tsc --noEmit` 0 errores.
- **ESLint:** `eslint src` 0 errores, 0 advertencias.
- **Next.js Build:** Generación estática exitosa de las 12 rutas de la aplicación.
- **Prettier:** 100% verificado con `prettier --check`.

---

## 2. Entrega de Tarea 0c.8: Pantalla de Equipo y Configuración de Agencia (`/configuracion`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P1: Equipo y configuración `settings_team`) · ADR-0006 (Nivel 1 de parametrización en v1) · Jira Epics VC-1 (Fundaciones / Roles), VC-2 (WhatsApp Cloud API / WABA) y VC-3 (CRM y Pipeline).

### Implementación Realizada:
1. **Modelos de Datos y Dominio (`apps/web/src/lib/mock-configuracion.ts`):**
   - Miembros del equipo con roles tipados (`DUENO`, `ASESOR`), estados (`ACTIVO`, `INVITADO`), correo, teléfono E.164 y avatar.
   - Parámetros de WABA (Phone Number ID, WABA ID, número verificado +57, calidad Meta GREEN/HIGH y webhook URL oficial).
   - Parámetros de SLA (tiempo máximo de primera respuesta, alerta preventiva, horario y días laborales).
   - Parámetros de agencia (razón social, nombre comercial, NIT colombiano, moneda base COP R8 y huso horario R9).
   - Etapas comerciales del pipeline con orden y probabilidades de cierre estimadas.

2. **Lógica de Negocio y Pruebas Unitarias (`apps/web/src/lib/configuracion-logica.ts` & `configuracion-logica.spec.ts`):**
   - `validarSla`: validación estricta de tiempo de respuesta (1 a 1440 min) y umbral de alerta preventiva.
   - `validarReglaDuenoActivo`: invariante de seguridad que garantiza la existencia de al menos un usuario activo con rol DUEÑO.
   - `verificarSaludConexion`: diagnóstico de salud de la integración de WhatsApp Cloud API (ÓPTIMO, ATENCIÓN, CRÍTICO).
   - `validarFormatoNit`: comprobación de formatos válidos de NIT colombiano con dígito de verificación.
   - `calcularProbabilidadPromedio`: cálculo de probabilidad global del embudo comercial.
   - 13 pruebas unitarias automatizadas en Vitest pasando (59/59 pruebas totales del monorepo en verde).

3. **Interfaz de Usuario y Secciones Reactivas (`apps/web/src/app/configuracion/page.tsx`):**
   - Integración nativa con `BarraModulos` con navegación lateral completa y soporte de modo oscuro (`dark:`).
   - Pestañas funcionales:
     - «Miembros y Roles»: métricas del equipo, tabla detallada, badges de rol y modal interactivo para invitar nuevos asesores.
     - «Canal WhatsApp (WABA)»: tarjeta de salud en vivo, identificadores técnicos y nota de seguridad sobre cifrado AES-256-GCM (R6).
     - «SLA y Tiempos»: formulario de parametrización con validaciones reactivas y cálculo de alerta preventiva.
     - «Etapas del Pipeline»: visualización de etapas y orden comercial con porcentajes de conversión.
     - «Marca y Datos Fiscales»: formulario de razón social, NIT validado, moneda oficial COP (R8) y ubicación.

4. **Navegación Lateral Activada (`apps/web/src/components/bandeja/barra-modulos.tsx`):**
   - Módulo `/configuracion` activado (`disponible: true`, `activo: pathname.startsWith('/configuracion')`).

### Verificación de las 5 Compuertas:
- **Vitest:** 59/59 pruebas pasando en 9 suites (`catalogo`, `cotizador`, `contactos`, `pipeline`, `plantillas`, `realtime`, `bandeja`, `reportes`, `configuracion`).
- **TypeScript:** `tsc --noEmit` sin errores.
- **ESLint:** `eslint src` 0 errores, 0 advertencias.
- **Next.js Build:** Generación estática exitosa de las 12 rutas de la aplicación (`/configuracion` 11.4 kB).
- **Prettier:** 100% verificado con `prettier --check`.

---

## 2. Entrega de Tarea 0c.7: Pantalla de Reportes, Métricas y Cierres (`/reportes`)

Origen: Jira Epic VC-7 (Fase 6: Analítica y escala) · `viajapro_diseno_ui_ux.json` (Pantalla P1: Reportes) · Reglas del lenguaje ubicuo y R8 (Dinero en enteros de COP).

### Implementación Realizada:
1. **Modelos de Dominio y Datos de Período (`apps/web/src/lib/mock-reportes.ts`):**
   - Agrupación por períodos temporales (`ultimos_30_dias`, `este_mes`, `trimestre`, `ano`).
   - Métricas de ventas, oportunidades creadas, tasa de conversión, tiempo medio de primera respuesta (SLA WhatsApp) y margen comercial.
   - Desglose de ingresos por destino turístico con montos en centavos COP y porcentajes calculados.
   - Desglose del embudo de conversión por etapas (`NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`).
   - Desempeño por asesor (conversaciones, oportunidades ganadas, total facturado y SLA de respuesta).

2. **Lógica de Negocio y Pruebas Unitarias (`apps/web/src/lib/reportes-logica.ts` & `reportes-logica.spec.ts`):**
   - Cálculo seguro de tasa de conversión con protección contra división por cero (`calcularTasaConversion`).
   - Cálculo de variación porcentual (`calcularDeltaPorcentaje`).
   - Cálculo de margen neto y porcentaje de rentabilidad (`calcularMargenComercial`).
   - Segregación de vistas entre `DUENO` (gerencial con márgenes y costos netos) y `ASESOR` (operativa centrada en volumen y tiempos de respuesta).
   - 5 pruebas unitarias automatizadas en Vitest pasando (46/46 pruebas totales en verde).

3. **Interfaz de Usuario Reactiva y Responsiva (`apps/web/src/app/reportes/page.tsx`):**
   - Integración nativa con `BarraModulos` con navegación bidireccional y modo oscuro (`dark:`).
   - Selector interactivo de período de tiempo y conmutador de perfil (Dueño vs Asesor).
   - Tarjetas de KPIs con indicadores de tendencia (verde subida, rojo bajada).
   - Visualización de embudo con barras de progreso y porcentajes relativos.
   - Rendimiento por destino y ranking de asesores con badges y SLA de atención.
   - Soporte para impresión de reporte y visualización adaptable a móviles (375px).

4. **Navegación Lateral Activada (`apps/web/src/components/bandeja/barra-modulos.tsx`):**
   - Módulo `/reportes` activado (`disponible: true`, `activo: pathname.startsWith('/reportes')`).

### Verificación de las 5 Compuertas:
- **Vitest:** 46/46 pruebas pasando en 8 suites (`catalogo`, `cotizador`, `contactos`, `pipeline`, `plantillas`, `realtime`, `bandeja`, `reportes`).
- **TypeScript:** `tsc --noEmit` sin errores.
- **ESLint:** `eslint src` 0 errores, 0 advertencias.
- **Next.js Build:** Generación estática exitosa de las 11 rutas de la aplicación (`/reportes` 7.59 kB).
- **Prettier:** 100% verificado con `prettier --check`.

---

## 2. Entrega de Tarea 0c.6: Cotizador Comercial, Despacho a WhatsApp y Navegación (`/cotizador`)

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
