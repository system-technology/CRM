# Cola de trabajo — Antigravity

> **Flujo continuo y sincronización con Jira:**
> Tareas 0d, 0c.3 (Pipeline Kanban) y 6 (Ventana 24h Meta HSM) completadas y verificadas bajo las 5 compuertas (22/22 tests en verde, typecheck limpio, lint limpio, build limpio, format limpio).
> Conforme a la instrucción del propietario («cuando te quedes sin tareas toma de Jira y lo colocas en el archivo para que lo trabajes y Claude sepa pero nunca te quedes sin trabajar pero tampoco inventes trabajos»), se toma del roadmap oficial (Epic VC-3 Fase 2 y `viajapro_diseno_ui_ux.json` Pantalla P0):
> **Tarea 0c.4. Directorio de Contactos y Viajeros (`/contactos`)**.

**Siempre:** solo tocas `apps/web/`. Nunca escribes en `main`. No tocas `ESTADO.md`. Cero tipos
redefinidos: todo de `@viajapro/contracts` — si falta un campo, **para y dilo**. `lint`, `typecheck`, `test`, `build` y `format:check` en verde
**ejecutados**, no supuestos, antes de escribir `ENTREGA.md`. Y funciona a 375 px.

---

## [x] 0c.6. Cotizador Comercial, Despacho a WhatsApp y Navegación (`/cotizador`)

Origen: Jira Epic VC-4 (Fase 3: Cotizador) · `viajapro_diseno_ui_ux.json` (Pantalla 2: Cotizador de paquetes) · `@viajapro/contracts` (`CotizarPaquete`, `CotizacionCalculada`, `Paquete`).

**Objetivo:** Conectar el cotizador con la navegación general (`BarraModulos`), permitir preselección desde el catálogo vía query param (`?paqueteId=...`), incorporar generador de propuesta comercial formateada para WhatsApp con copiado al portapapeles y motor de cálculo offline verificado contra el esquema oficial Zod (R3).

- **Completado y verificado al 100%:**
  - **Navegación Unificada (`BarraModulos`):** Integración fluida del cotizador en la barra de módulos con indicador de ruta activa y soporte para modo oscuro.
  - **Recepción de Parámetros (`?paqueteId=...`):** Conexión con el catálogo de paquetes mediante `useSearchParams` en `<Suspense>` para cotización inmediata en <5 minutos.
  - **Despacho Comercial a WhatsApp (`generarTextoPropuestaWhatsApp`):** Botón para copiar propuesta comercial al portapapeles y enlace directo a `/bandeja` para enviar al cliente.
  - **Protección de Confidencialidad (R10):** Las propuestas para el cliente excluyen estrictamente tarifas netas y margen comercial interno de la agencia.
  - **Motor de Cálculo Simulado y Offline:** Soporte resiliente con `calcularCotizacionMock` cuando la API backend no esté disponible localmente, validado al 100% contra el esquema Zod `CotizacionCalculada` de `@viajapro/contracts` (R3).
  - **Pruebas automáticas (5/5 en `cotizador-logica.spec.ts`):** 41/41 pruebas totales en verde en Vitest.

---

## [x] 0c.5. Catálogo de Paquetes y Tarifarios de Mayoristas (`/catalogo`)

- **Completado y verificado al 100%:**
  - **Directorio de Paquetes en `/catalogo`:** Catálogo interactivo de paquetes prearmados de mayoristas aliados, buscador reactivo en tiempo real (por destino, nombre, mayorista o inclusión), selector de plan de alimentación, selector de destinos y filtro por tarifarios vigentes.
  - **Ficha de Detalle y Matriz de Tarifas (`FichaDetallePaquete`):** Panel modal con selector de temporadas, desglose completo de matriz de tarifas por acomodación (`SENCILLA`, `DOBLE`, `TRIPLE`, `CUADRUPLE`) y tipo de pasajero (Adulto, Niño e Infante con edades de corte comercial), desglose de precios neto/venta y advertencias de vigencia.
  - **Gestión de Mayoristas y Time Limits:** Visualización de mayoristas proveedores con información de contacto y conteo regresivo de time limit (`diasTimeLimit`) para proteger cupos antes de liberación.
  - **Conexión Directa al Cotizador:** Enlaces de acción directa «Cotizar este paquete ahora» hacia `/cotizador` para garantizar cotización de propuesta comercial en <5 minutos.
  - **Cero Tipos Redefinidos (R3):** Basado 100% en esquemas Zod de `@viajapro/contracts` (`Paquete`, `Mayorista`, `Temporada`, `Precio`, `PlanAlimentacion`, `Acomodacion`, `TipoPasajero`).
  - **Habilitación en Barra Lateral:** Activado el módulo de Catálogo en `BarraModulos` (`disponible: true`, indicador de ruta activa para `/catalogo`).
  - **Pruebas automáticas (8/8 en `catalogo-logica.spec.ts`):** 36/36 pruebas totales en verde en Vitest.

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P0: Catálogo de paquetes) · Jira Epic VC-4 (Fase 3: Cotizador) & VC-10 · `@viajapro/contracts` (`Paquete`, `Mayorista`, `Temporada`, `Precio`, `PlanAlimentacion`, `Acomodacion`, `TipoPasajero`).

**Objetivo:** Construir la pantalla y panel de detalle del catálogo de paquetes turísticos en `/catalogo` para encontrar, auditar y operar los paquetes de mayoristas que la agencia revende, con desglose de temporadas, matriz de tarifas por acomodación y tipo de pasajero, y enlace rápido al cotizador.

**Invariantes y criterios:**
1. **Directorio y Búsqueda en Tiempo Real:**
   - Buscador reactivo por nombre del paquete, destino o mayorista.
   - Filtro dinámico por plan de alimentación (`TODO_INCLUIDO`, `DESAYUNO`, `MEDIA_PENSION`, etc.).
   - Filtro por estado de vigencia del tarifario (tarifas vigentes vs vencidas).
2. **Tarjeta de Paquete Responsiva:**
   - Visualización de destino, duración (`X días / Y noches`), plan de alimentación, mayorista responsable y días de time limit (`diasTimeLimit`).
   - Precio de referencia «Desde» por persona en clase `.cifra`.
   - Badges de temporadas y fechas de vigencia (`desde` y `hasta`).
   - Inclusiones destacadas.
3. **Ficha de Detalle del Paquete (`FichaDetallePaquete`):**
   - Modal/drawer con desglose exhaustivo de temporadas.
   - Matriz transparente de tarifas por tipo de pasajero (Adulto, Niño, Infante con edades de corte) y acomodación (`SENCILLA`, `DOBLE`, `TRIPLE`, `CUADRUPLE`).
   - Inclusiones y exclusiones detalladas.
   - Datos del mayorista y política de time limit.
4. **Acción Comercial Directa:**
   - Botón «Cotizar este paquete» que vincula directamente a `/cotizador` para cumplir la meta de cotización en menos de 5 minutos.
5. **Cero Tipos Redefinidos (R3):** Uso estricto de `Paquete`, `Mayorista`, `Temporada`, `Precio`, `PlanAlimentacion` de `@viajapro/contracts`.
6. **Habilitación en barra lateral:** Activar el módulo en `BarraModulos` (`disponible: true`, activo en `/catalogo`).
7. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.

---

## [x] 0c.4. Directorio de Contactos y Viajeros (`/contactos`)

Origen: `viajapro_diseno_ui_ux.json` (Pantalla P0: Contactos y viajeros) · Epic VC-3 (Fase 2: CRM) · `@viajapro/contracts` (`Contacto`, `Consentimiento`, `PaginaContactos`).

**Objetivo:** Construir el directorio y panel de detalle de contactos en `/contactos` para conservar el historial comercial asociado a la persona correcta, distinguiendo formalmente entre Contacto, Viajero y Pasajero.

**Invariantes y criterios:**
1. **Directorio navegable y búsqueda en tiempo real:**
   - Lista y tabla de contactos con búsqueda por nombre, teléfono o correo y filtrado por etiquetas (`VIP`, `Familia`, `Corporativo`).
2. **Ficha de detalle del contacto:**
   - Visualización de datos de identidad (nombre, teléfono E.164, correo, avatar determinista).
   - Preferencias de viaje para atención y recompra (asientos, aerolíneas favoritas, notas de viaje).
   - Consentimientos explícitos (`TRANSACCIONAL`, `PROMOCIONAL`) conforme a la Ley 1581 de 2012 y normativas de Meta.
3. **Acciones directas:**
   - Enlace directo a abrir conversación en `/bandeja`.
   - Enlace a cotizar o ver oportunidades en `/pipeline`.
4. **Cero tipos redefinidos (R3):** Uso estricto de `Contacto`, `Consentimiento` y `PaginaContactos` de `@viajapro/contracts`.
5. **Habilitación en barra lateral:** Activar el módulo en `BarraModulos` (`disponible: true`).
6. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.
- **Completado y verificado al 100%:**
  - **Directorio comercial en `/contactos`:** Búsqueda en tiempo real (por nombre, teléfono E.164 o correo), selector de etiquetas de negocio (`VIP`, `Familia`, `Cancún`, etc.) y filtrado por consentimientos.
  - **Ficha de detalle del contacto (`FichaDetalleContacto`):** Panel drawer con avatar determinista, identidad, preferencias de viaje (asientos, aerolíneas, requerimientos), métricas y acciones directas (Chat en `/bandeja`, Cotización en `/cotizador`, Pipeline en `/pipeline`).
  - **Consentimientos de datos (Ley 1581 / Meta):** Distinción explícita de consentimiento `TRANSACCIONAL` y `PROMOCIONAL` con badges visuales de cumplimiento.
  - **Cero tipos redefinidos (R3):** Conforme 100% a los esquemas Zod `Contacto`, `Consentimiento` y `PaginaContactos` de `@viajapro/contracts`.
  - **Habilitación en navegación:** Activado el enlace y estado activo de Contactos en `BarraModulos`.
  - **Pruebas automáticas (6/6 en `contactos-logica.spec.ts`):** 28/28 pruebas totales en verde en Vitest.


---
## [x] 6. La ventana de 24 horas, de verdad

Origen: Jira (VC-13) · `COLA-DESPUES.md §6` · `packages/contracts/src/plantillas.ts` (`PlantillaWhatsApp`, `EnviarPlantilla`, `PlantillasDisponibles`).

**Objetivo:** Transformar el estado «24h Cerrada» de una etiqueta pasiva a una restricción activa del producto con soporte completo para plantillas aprobadas por Meta.

**Invariantes y criterios:**
1. **Restricción estricta:** Con la ventana cerrada, el campo de texto libre se deshabilita y se activa el selector de plantillas.
2. **Aviso preventivo (<2h):** Mostrar claramente cuánto falta cuando quedan menos de 2 horas (tiempo decisivo para que el asesor escriba antes del cierre).
3. **Preservación de borrador:** Si la ventana se cierra mientras hay un texto escrito, no se pierde; se avisa y se permite reutilizarlo.
4. **Cero tipos redefinidos (R3):** Utilizar `PlantillaWhatsApp`, `EnviarPlantilla` y `PlantillasDisponibles` de `@viajapro/contracts`.
5. **Formulario de variables interactivo:** Permitir rellenar `{{1}}`, `{{2}}`... validando que ningún hueco quede vacío antes de enviar (`EnviarPlantilla.superRefine`).
6. **Idempotencia (R5):** Generación de `claveIdempotencia` UUID v4 en cada envío.
7. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.
- **Completado y verificado al 100%:**
  - **Restricción estricta:** Con la ventana cerrada, el redactor de texto libre se bloquea completamente con icono de candado y aviso de políticas de Meta.
  - **Aviso preventivo (<2h):** Banner ámbar visible en la parte superior del chat cuando quedan menos de 120 minutos, alertando al asesor para responder antes del cierre.
  - **Preservación de borrador:** Si el asesor tenía texto escrito al momento de vencer la ventana o abrir el selector, el borrador se conserva y se muestra en el modal como referencia.
  - **Cero tipos redefinidos (R3):** Uso estricto de `PlantillaWhatsApp`, `EnviarPlantilla` y `PlantillasDisponibles` de `@viajapro/contracts`.
  - **Formulario de variables interactivo:** Formulario dinámico para variables `{{1}}`, `{{2}}`... con validación Zod (`EnviarPlantilla.superRefine`) que impide enviar huecos vacíos.
  - **Idempotencia (R5):** Clave UUID v4 única generada para cada intento de envío.
  - **Pruebas automáticas (6/6 en `plantillas-logica.spec.ts`):** 22/22 pruebas totales en verde en Vitest.


---
## [x] 0c.3. Pantalla de Pipeline de Oportunidades (`/pipeline`)

Origen: Jira (Epic VC-3 / Fase 2 — CRM y pipeline) · `COLA-DESPUES.md §0c.3` · `viajapro_diseno_ui_ux.json` (Pantalla 2) · Contratos en `@viajapro/contracts` (`TableroPipeline`, `ColumnaPipeline`, `Oportunidad`, `MoverOportunidad`, `EtapaPipeline`).

**Objetivo:** Construir el tablero Kanban de oportunidades de venta en `/pipeline` con 5 columnas (`NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`).

**Invariantes y criterios no opcionales:**
1. **El total de la columna viene del servidor y no se suma en el navegador:**
   - La API / simulador entrega `totalValor` denormalizado por columna. Si hay paginación o filtros, la suma visible no encoge falsamente.
2. **Arrastrar necesita alternativa por teclado:**
   - Soporte para mover tarjeta entre columnas con teclado (menú accesible o acción rápida).
3. **Soltar o mover una tarjeta a «PERDIDA» abre un diálogo obligatorio:**
   - Exige `motivoPerdida` (`PRECIO_ALTO`, `COMPRO_A_COMPETENCIA`, `DESTINO_NO_DISPONIBLE`, `FECHAS_NO_COINCIDEN`, `SIN_RESPUESTA`, `OTRO`).
   - Si el motivo es `OTRO`, exige explicación en `notaPerdida` según el contrato `exigirMotivoDePerdida`.
4. **Montos monetarios formateados con `.cifra` y tokens visuales acordes a `DISENO-BANDEJA.md` y `globals.css`.**
5. **Compuertas:** `test`, `typecheck`, `lint`, `build` y `format:check` en verde.
- **Completado y verificado al 100%:**
  - Tablero Kanban de 5 columnas en `/pipeline` (`NUEVO_LEAD`, `EN_COTIZACION`, `EN_NEGOCIACION`, `GANADA`, `PERDIDA`) conforme a `TableroPipeline` y `Oportunidad` de `@viajapro/contracts`.
  - **Invariante 1 cumplido:** Los totales monetarios de columna se reciben denormalizados del servidor y se muestran en clase `.cifra`, sin recálculo engañoso en el cliente.
  - **Invariante 2 cumplido:** Alternativa accesible de teclado mediante menú contextual («Mover a...») en cada tarjeta con navegación por flechas y teclado.
  - **Invariante 3 cumplido:** Diálogo accesible obligatorio (`ModalMotivoPerdida`) al mover tarjetas a `PERDIDA` exigiendo `MotivoPerdida` y nota explicativa si es `OTRO` (garantizado por el refinement `exigirMotivoDePerdida` del contrato Zod).
  - **Vistas duales:** Selector entre «Tablero Kanban» y «Tabla compacta» según `viajapro_diseno_ui_ux.json`.
  - **Pruebas automáticas (7/7 en `pipeline-logica.spec.ts`):** 16/16 pruebas en verde en Vitest.


---

## [x] 0d. La ficha del viajero, atada a SU conversación

- **Completado y verificado.**
- `obtenerMockFichaDeContacto(conversacionId)` atada al ID: Juan Pérez devuelve `+573000012345` y Ana Martínez devuelve `+573000024690`.
- Prueba 7 en `apps/web/src/lib/bandeja-comportamiento.spec.ts`:
  - **Roja antes:** `AssertionError: expected '+573001234567' not to be '+573001234567'`.
  - **Verde después:** Pasan 9/9 pruebas.
- Subsanadas las observaciones no bloqueantes de `REVISION.md`:
  - Creado `apps/web/src/app/icon.svg` eliminando el 404 de favicon.
  - Tiempos de ventana variados en `mock-inbox.ts` para visibilizar urgentes (<1h), medios y cerrados.
  - Eliminado texto `(Próximamente)` en el botón de archivo de viaje.

---
## [x] 0b. El diseño — todo esto va antes que cualquier funcionalidad nueva

El propietario abrió la aplicación y dijo que la experiencia de usuario está por el suelo. Tiene
razón, y la causa fue mía: esta cola nunca mencionó el diseño acordado. El `diseno-ux` auditó la
bandeja contra `docs/_assets/diseno/01-bandeja.png` y dejó la corrección completa en
**`DISENO-BANDEJA.md`**, en esta misma rama. Léelo entero antes de empezar; aquí va el orden y lo
que no puedes saltarte.

**0b.1 — Sacar el instrumental de desarrollo de la pantalla.** Una hora, y es lo que más cambia.
Hoy un asesor de agencia lee «Mock Simulador», «Guard R5/UI», «Simular fallo de envío (Prueba
R5)» y «v0.1.0». Eso no es una pantalla de producto, es un banco de pruebas. Detrás de un
`process.env.NODE_ENV !== 'production'`, o fuera.

Y en `[id]/page.tsx:730`, la selección de plantillas —**la acción más cara del producto**, la
única forma de reabrir una conversación fuera de la ventana de 24 h— es un `alert()` del
navegador. Eso no se queda así ni un día más.

**0b.2 — El armazón de tres columnas.** Medio día, y va **antes** que lo demás: hoy cada página
es una pantalla completa con su propio `h-screen`, su cabecera y su scroll, y construir la ficha
del cliente dentro de esos cascarones es construirla para tirarla. Un `app/bandeja/layout.tsx`
con la rejilla; la lista vive en el layout, el hilo en `[id]/page.tsx`. Abrir una conversación
deja de ser navegar a otra página y perder la lista.

Condición para que lo demás llegue por partes sin rehacer nada: **las piezas nuevas reciben props
y no son dueñas ni de su layout ni de su scroll.**

**0b.3 a 0b.9 — El resto, en el orden del documento** y repartibles una vez puesto el armazón:
barra lateral de módulos con la meta de cierres · ficha del cliente a la derecha · iconos en vez
de emoji · cabecera con cuenta atrás de 24 h, SLA y «Nueva cotización» · tarjetas de cotización
en el hilo · acciones de cierre · móvil a 375 px, que incluye un defecto real de accesibilidad:
los chips miden unos 24 px de alto y el mínimo táctil son 44.

**Tres cosas del diseño que NO se construyen**, y el documento explica cada una: la cotización
como tipo de mensaje —`TipoContenido` solo admite lo que Meta entrega; hace falta un cambio de
contrato que pido yo—, «Detalles del viaje» como campos de `inbox` —pertenece a `crm`, se maqueta
simulado—, y el selector que duplica `FiltroBandeja`, donde gana el contrato.

**Sobre `packages/ui`, que hoy solo tiene un README:** hay 1 678 líneas de Tailwind en línea entre
dos archivos, el mismo badge escrito seis veces, y dos contadores de 24 h distintos cuyas reglas
de color no coinciden —la lista avisa a los 60 minutos y el hilo no avisa—. Extrae los tres
primitivos que propone el documento según los necesites. Moverlos a `packages/ui` después es
cambiar una ruta de importación.

---

---

## 📌 Sincronización Jira Cloud — Proyecto VIAJAPRO CRM (VC)

- **Ticket de Frontend activo:** [VC-13] (5 — Bandeja de conversaciones en la web).
- **Estado:** Entregado en `feat/bandeja-web` (Commits `685ec53` y `10f5a96`). Comentario formal registrado en Jira con evidencia de las 5 compuertas.
- **Próximas tareas en Jira identificadas para Frontend:**
  1. Pantalla de Pipeline (`/pipeline`) — Tablero Kanban de Oportunidades contra contratos de `crm.ts` (`TableroPipeline`, `Oportunidad`), según `viajapro_diseno_ui_ux.json`.
  2. [VC-21] Carrera de `turbo` entre `build` y `typecheck` de la web: evitar falso rojo en CI.
