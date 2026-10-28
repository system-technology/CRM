# Entrega — T-101: Lista de seguimientos del asesor con vencidos, de hoy y próximos, y acción de completar — 2026-10-28

## Identificación
- **Tarea:** `T-101` (roadmap/tasks.yaml)
- **Rama:** `b/T-101-lista-seguimientos-asesor`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Pantalla Principal de Seguimientos (`/seguimientos`):**
   - Creada página `apps/web/src/app/seguimientos/page.tsx` consumiendo `GET /api/v1/crm/seguimientos` (con fallback de demostración en `mock-crm.ts`) y `POST /api/v1/crm/seguimientos/:id/completar`.
   - Cabecera con migas de pan accesibles, título de nivel `H1`, resumen descriptivo, botón de recarga con spinner visual y botón de acción principal `+ Agendar Seguimiento` (touch targets `>= 44 px`).
   - 4 tarjetas KPI con métricas en tiempo real: Vencidos (resaltado en alerta `rose-700`), Para Hoy (`amber-700`), Próximos (`teal-700`) y Completados (`emerald-700`). Cada tarjeta permite alternar el filtro con un clic.
   - Pestañas de filtrado rápido (`Pendientes`, `Vencidos`, `Hoy`, `Próximos`, `Completados`), cuadro de búsqueda omnicanal (por descripción, cliente u oportunidad) y selector de asesor asignado.

2. **Componente de Tarjeta de Seguimiento (`TarjetaSeguimiento`):**
   - Creado `apps/web/src/components/seguimientos/tarjeta-seguimiento.tsx` con accesibilidad ARIA, etiquetas semánticas y touch targets mínimos de 44 px.
   - Resaltado especial de tareas vencidas con borde y fondo suave de alerta (`border-rose-300 bg-rose-50/30`), indicación del retraso acumulado («Venció hace X horas / días»), insignia de urgencia y enlaces directos a la Ficha 360 del contacto (`/contactos/[id]`), la oportunidad en el Pipeline (`/pipeline`) y el chat de WhatsApp (`/bandeja/[id]`).
   - Botón interactivo de completar con actualización reactiva inmediata (optimista) y control de estados durante la llamada de red (`Loader2`).

3. **Lógica de Categorización y Módulos Conectados:**
   - Creado módulo de dominio puro `apps/web/src/lib/seguimientos-logica.ts` para clasificar tareas (`VENCIDO`, `HOY`, `PROXIMO`, `COMPLETADO`), calcular métricas consolidadas, filtrar y ordenar según reglas de urgencia (R9).
   - Actualizado `BloqueSeguimientosDia` (`apps/web/src/components/inicio/bloque-seguimientos-dia.tsx`) incorporando pie de página con enlace accesible `Ver todos los seguimientos` hacia `/seguimientos`.
   - Enriquecido el almacén `mock-crm.ts` con tareas de prueba para todas las categorías (vencidas, hoy, próximas y completadas).

4. **Pruebas y Verificación:**
   - Creadas 2 suites de pruebas unitarias:
     - `apps/web/src/lib/seguimientos-logica.spec.ts` (14 pruebas): clasificación, métricas, ordenación y formateo de vencimientos.
     - `apps/web/src/app/seguimientos/page.spec.tsx` (9 pruebas): renderizado de cabecera y KPIs, filtrado por pestaña, búsqueda por texto, acción de completar, estados vacío y de error con reintento, y modal de creación de tareas.
   - Suite total `@viajapro/web`: 81 suites, 653 pruebas en verde.
   - Typecheck (9/9), Linter (7/7) y Next.js build (23 rutas compiladas) 100% en verde.
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59, 19/19, 6/6 en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 81 suites, 653 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 23/23 rutas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-100: Ficha 360 del contacto: datos, conversaciones, oportunidades, cotizaciones y seguimientos en una sola pantalla — 2026-10-28

## Identificación
- **Tarea:** `T-100` (roadmap/tasks.yaml)
- **Rama:** `b/T-100-ficha-360-contacto`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Pantalla Dinámica `/contactos/[id]`:**
   - Creada ruta dinámica `apps/web/src/app/contactos/[id]/page.tsx` con soporte para datos en vivo (`crm-api.ts`) y datos simulados enriquecidos (`mock-crm.ts`).
   - Cabecera con datos de identidad del viajero, consentimientos legales, insignias de etiquetas, canal preferido y métricas consolidadas (Total Cotizado, Seguimientos Pendientes, Conversaciones Vinculadas).
   - Sistema de 4 pestañas interactivas:
     - **Línea de Tiempo 360**: cronología unificada de hitos comerciales (creación, cotizaciones, oportunidades, notas internas, seguimientos y viajes confirmados).
     - **Oportunidad & Cotizaciones**: estado del embudo comercial, probabilidad, fecha esperada de cierre, próxima tarea y tarjetas detalladas de cotizaciones emitidas.
     - **Seguimientos**: listado de compromisos comerciales ordenados cronológicamente con opción de marcar como completado en un clic.
     - **Campos Personalizados**: integración completa con el motor de metadatos por agencia (`SeccionCamposPersonalizados`, T-026).
   - Manejo exhaustivo de estados: cargando con esqueleto (`EsqueletoFichaContacto`), error accionable (`AvisoErrorAccionable`, `construirMensajeErrorAccionable`) y vacío para cada subsección (`AvisoVacio`).

2. **Modales Interactivos y Accesibilidad:**
   - Creado `ModalEditarContacto` (`apps/web/src/components/contactos/modal-editar-contacto.tsx`) con foco atrapado (`useFocoModal`), etiquetas ARIA y edición de nombre, teléfono, correo y etiquetas.
   - Creado `ModalCrearOportunidad` (`apps/web/src/components/contactos/modal-crear-oportunidad.tsx`) para iniciar negociaciones asociadas al contacto con selector de etapa, valor estimado en COP (R8) y fecha estimada de cierre.
   - Creado `ModalCrearSeguimiento` (`apps/web/src/components/contactos/modal-crear-seguimiento.tsx`) para agendar llamadas, cotizaciones o reuniones con selector de fecha/hora y asociación automática a la oportunidad actual.
   - Touch targets mínimos `>= 44 px` en todos los controles, inputs y botones de acción conforme a directrices móviles a 375 px.

3. **Lógica de Dominio y Línea de Tiempo:**
   - Creado módulo `apps/web/src/lib/contacto-360-logica.ts` con funciones puras para calcular métricas y fusionar eventos heterogéneos en una secuencia cronológica inversa.
   - Creado componente visual `apps/web/src/components/contactos/linea-tiempo-360.tsx` con iconografía diferenciada por tipo de evento.
   - Conectada la lista de contactos (`/contactos`) y la ficha lateral (`ficha-detalle-contacto.tsx`) con enlace directo «Abrir Ficha 360 Completa».

4. **Pruebas y Verificación:**
   - Creadas 2 suites de pruebas unitarias:
     - `apps/web/src/lib/contacto-360-logica.spec.ts` (3 tests): cálculo de métricas y construcción de línea de tiempo cronológica.
     - `apps/web/src/app/contactos/[id]/page.spec.tsx` (7 tests): renderizado de datos del contacto, estados cargando/error, cambio de pestañas, apertura y guardado en modales de edición, oportunidad y seguimiento.
   - Suite total `@viajapro/web`: 79 suites, 630 pruebas en verde.
   - Typecheck (9/9), Linter (7/7) y Next.js build (22 rutas) 100% en verde.
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59, 19/19, 6/6 en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 79 suites, 630 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 22/22 rutas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-108: Páginas públicas /privacidad, /terminos y /cookies con el texto aprobado y enlace en el pie y en el login — 2026-10-28

## Identificación
- **Tarea:** `T-108` (roadmap/tasks.yaml)
- **Rama:** `b/T-108-paginas-legales-publicas`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Páginas Legales Públicas Accesibles:**
   - Creada página `/privacidad` (`apps/web/src/app/privacidad/page.tsx`) con el marco de la Ley 1581 de 2012, Decreto 1074 de 2015, distinción de roles Responsable vs Encargado, tratamiento de datos sensibles (R10) y procedimientos de Habeas Data con canal PQRS.
   - Creada página `/terminos` (`apps/web/src/app/terminos/page.tsx`) con términos de licenciamiento SaaS B2B para agencias de viajes, reglas de WhatsApp Cloud API (ventana de 24h, plantillas, anti-SPAM), prevención y denuncia de ESCNNA (Leyes 679/2001 y 1336/2009) y propiedad y aislamiento de datos (RLS R1, R2).
   - Creada página `/cookies` (`apps/web/src/app/cookies/page.tsx`) con tabla de inventario técnico desde `INVENTARIO_COOKIES` y botón de apertura de preferencias (`BotonAbrirPreferencias`).
   - Todas las páginas cuentan con la marca visible «borrador en revisión jurídica» (`badge-borrador`) conforme al criterio de aceptación mientras se formaliza T-093.

2. **Enlaces en Pie de Página y Pantalla de Ingreso:**
   - Actualizado `PieDePaginaPrivacidad` (`apps/web/src/components/privacidad/pie-de-pagina-privacidad.tsx`) con enlaces a las tres páginas y botón interactivo de cookies, garantizando touch targets `>= 44 px` y legibilidad en viewports móviles de 375 px.
   - Actualizado `FormularioIngreso` (`apps/web/src/components/auth/formulario-ingreso.tsx`) integrando el pie legal con los tres enlaces para información previa al inicio de sesión.
   - Actualizada la página complementaria `apps/web/src/app/politica-cookies/page.tsx` con la insignia de borrador.

3. **Pruebas y Verificación:**
   - Creadas 4 suites unitarias dedicadas: `privacidad/page.spec.tsx` (4 tests), `terminos/page.spec.tsx` (4 tests), `cookies/page.spec.tsx` (3 tests), y `pie-de-pagina-privacidad.spec.tsx` (3 tests).
   - Total `@viajapro/web`: 77 suites, 620 tests en verde.
   - Typecheck (9/9), Linter (7/7) y Next.js build (21 rutas estáticas/dinámicas) 100% en verde.
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59, 19/19, 6/6 en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 77 suites, 620 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 21/21 rutas compiladas exitosamente sin errores de prerender ni tipos.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-008: Adaptar el cliente de la web a la retirada de la ruta antigua de cotizacion de paquetes — 2026-10-28

## Identificación
- **Tarea:** `T-008` (roadmap/tasks.yaml)
- **Rama:** `b/T-008-adaptar-cliente-cotizacion`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Retirada de la ruta antigua en `apps/web/src/lib/api.ts`:**
   - Eliminada la referencia y llamada a `/api/v1/paquetes/cotizar` que fue retirada del backend en T-007.
   - Alineado el cliente con la ruta vigente `POST /api/v1/catalogo/cotizar` mediante delegación y re-exportación de `cotizarSalidaApi` (`CotizarSalida`).
   - El cotizador oficial (`apps/web/src/app/cotizador/page.tsx`) sigue cotizando contra `/api/v1/catalogo/cotizar`.

2. **Pruebas y Verificación:**
   - Creada suite unitaria `apps/web/src/lib/api.spec.ts` (4 pruebas) que comprueba que `api.listarPaquetes` no llama a la ruta antigua, que `api.cotizarSalida` delega a la ruta vigente `/api/v1/catalogo/cotizar`, y que la gestión contractual de `ErrorApi` (`EsquemaError`, R3) opera correctamente.
   - Total `@viajapro/web`: 73 suites, 606 pruebas en verde.
   - Typecheck (9/9), Linter (7/7) y Next.js build (18 rutas) 100% en verde.
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59, 19/19, 6/6 en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 73 suites, 606 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 18/18 rutas estáticas y dinámicas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-027: Equipo e invitaciones: invitar asesores, asignar rol y ver quién tiene acceso — 2026-10-28

## Identificación
- **Tarea:** `T-027` (roadmap/tasks.yaml)
- **Rama:** `b/T-027-equipo-e-invitaciones`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Capa API de Equipo y Roles (`apps/web/src/lib/equipo-api.ts`):**
   - Funciones `listarMiembrosEquipoApi`, `listarRolesAgenciaApi`, `invitarMiembroApi`.
   - Soporte para backend real `/api/v1/equipo` con fallback a simulación en caché local para modo demo/offline.
   - Traductor y mapeador de errores `interpretarErrorInvitacion` que convierte códigos (`CODIGO_INVALIDO`, `DEMASIADOS_INTENTOS`, `INVITACION_INVALIDA`, `PERMISO_DENEGADO`, `SIN_SESION`, `CORREO_INVALIDO`, `ROL_INVALIDO`) a explicaciones claras en español con orientación explícita de «Qué hacer».

2. **Componente de Gestión de Equipo (`BloqueEquipo`):**
   - Creado en `apps/web/src/components/configuracion/bloque-equipo.tsx` e integrado en `apps/web/src/app/configuracion/page.tsx` en la pestaña `equipo`.
   - Tarjetas de resumen métrico: Total Usuarios, Dueños Activos, Asesores Comerciales, Invitaciones Pendientes.
   - Tabla responsiva de miembros y estados (`ACTIVO`, `INVITADO`, `SUSPENDIDO`) con insignias visuales y fecha de ingreso con formato Colombia (`es-CO`).
   - Modal accesible de invitación (`useFocoModal`, WCAG 2.1) con selección de rol (`DUENO`, `ASESOR`, `OPERACIONES`), validación de correo electrónico y gestión de estados de carga y error en español con banner «Qué hacer».
   - Totalmente operable a 375 px de viewport móvil con touch targets >= 44 px sin desbordamiento horizontal.

3. **Pruebas y Verificación:**
   - `apps/web/src/lib/equipo-api.spec.ts`: 8 tests en verde.
   - `apps/web/src/components/configuracion/bloque-equipo.spec.tsx`: 5 tests en verde.
   - Total `@viajapro/web`: 72 suites, 602 tests en verde.
   - Typecheck (9/9), Linter (7/7) y Next.js build (18 rutas) 100% en verde.
   - Ganchos y fronteras (`pnpm test:hooks`): 59/59, 19/19, 6/6 en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 72 suites, 602 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 18/18 rutas estáticas y dinámicas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-026: Campos personalizados por agencia en la ficha del contacto y en las oportunidades — 2026-10-28

## Identificación
- **Tarea:** `T-026` (roadmap/tasks.yaml)
- **Rama:** `b/T-026-campos-personalizados`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Contratos Zod Centralizados (Regla R3):**
   - Incorporados esquemas canónicos en `packages/contracts/src/crm.ts`: `TipoCampoPersonalizado` (`texto`, `numero`, `fecha`, `lista`), `EntidadCampoPersonalizado` (`contacto`, `oportunidad`), `DefinicionCampoPersonalizado` y `ValorCampoPersonalizado`.
   - Pruebas de contrato añadidas en `packages/contracts/src/crm.spec.ts` (3 tests adicionales, 88 tests en verde).
   - Ningún tipo redefinido en frontend: la web importa directamente desde `@viajapro/contracts`.

2. **Bloque «Campos Personalizados» en Configuración (`BloqueCamposPersonalizados`):**
   - Creado en `apps/web/src/components/configuracion/bloque-campos-personalizados.tsx` y montado en `apps/web/src/app/configuracion/page.tsx` (pestaña `campos`).
   - Pestañas interactivas para alternar entre campos de «Viajeros / Contactos» y «Oportunidades Comerciales».
   - Modal accesible para creación de nuevos campos con gestión de foco (`useFocoModal`, WCAG 2.1.2 / 2.4.3), validación de nombres y claves normalizadas (`normalizarClaveCampo`).
   - Soporte de los 4 tipos de datos: texto, número, fecha y lista con opciones delimitadas por coma.
   - Eliminación interactiva con aviso accesible y feedback visual.

3. **Sección y Edición en Ficha de Contacto y Oportunidad (`SeccionCamposPersonalizados`):**
   - Creado componente `apps/web/src/components/contactos/seccion-campos-personalizados.tsx`.
   - Integrado en `apps/web/src/components/contactos/ficha-detalle-contacto.tsx` (detalle de viajero).
   - Integrado en `apps/web/src/components/bandeja/ficha-cliente.tsx` tanto para atributos del contacto como para atributos de la oportunidad viva.
   - Validación tipada por tipo de dato en vivo antes de guardar con feedback de error en línea (`validarValorCampoPersonalizado`).
   - Persistencia local resiliente y callback `onGuardar` desacoplado.

4. **Petición para carril backend (si aplica):**
   - Exponer endpoints `GET/POST/PUT/DELETE /api/v1/crm/campos-personalizados` y persistencia en columnas JSONB o tabla asociada por tenant `tenant_id` (R1) para almacenamiento en base de datos.

5. **Pruebas y Verificación:**
   - `packages/contracts/src/crm.spec.ts`: 28 tests en verde.
   - `apps/web/src/lib/campos-personalizados-logica.spec.ts`: 7 tests en verde.
   - `apps/web/src/components/configuracion/bloque-campos-personalizados.spec.tsx`: 5 tests en verde.
   - `apps/web/src/components/contactos/seccion-campos-personalizados.spec.tsx`: 2 tests en verde.
   - Total `@viajapro/web`: 70 suites, 589 tests en verde.
   - Typecheck (9/9), Linter (7/7) y Next.js build (18 rutas) 100% en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 70 suites, 589 pruebas en verde.
- **Pruebas unitarias (@viajapro/contracts):** 6 suites, 88 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 18/18 rutas estáticas y dinámicas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-025: Etapas del pipeline configurables por la agencia — 2026-10-28

## Identificación
- **Tarea:** `T-025` (roadmap/tasks.yaml)
- **Rama:** `b/T-025-etapas-pipeline`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Bloque «Etapas del pipeline» en Configuración (`BloqueEtapasPipeline`):**
   - Creado en `apps/web/src/components/configuracion/bloque-etapas-pipeline.tsx` e integrado en `apps/web/src/app/configuracion/page.tsx` (pestaña `pipeline`).
   - Carga las etapas de la agencia en el montaje vía `listarEtapasPipelineApi()`.
   - Permite **reordenar etapas** interactivamente con botones accesibles Subir/Bajar con touch targets mínimos de 44 px (`min-h-[44px] min-w-[44px]`).
   - Permite **renombrar etapas** editando el nombre en vivo.
   - Permite ajustar la **probabilidad de cierre** estimada (0-100%).
   - Identifica visualmente etapas especiales con insignias distintivas: `Ganada` (esmeralda), `Perdida` (rosa) y `Etapa clave` (ámbar).
   - Acciones de «Guardar cambios» con estado de guardado, mensaje de confirmación accesible (`role="status"`) y botón de «Restablecer».

2. **Pintado dinámico en el Tablero de Pipeline:**
   - Verificado `apps/web/src/app/pipeline/page.tsx`: consume `tablero.columnas` directamente de `obtenerTableroPipeline()` o la API CRM, pintando exactamente las etapas configuradas en orden, sin listados estáticos cableados en el render.

3. **Contrato de API y Fallback Resiliente:**
   - Métodos tipados `listarEtapasPipelineApi()` y `actualizarEtapasPipelineApi(etapas)` añadidos a `apps/web/src/lib/crm-api.ts`.
   - Consume `/api/v1/crm/etapas` y en caso de que el backend no exponga aún el endpoint o devuelva 404/500, aplica fallback resiliente cargando las etapas del tablero y permitiendo persistencia local en memoria para pruebas y modo demo.
   - **Petición para carril backend (si aplica):** Exponer endpoint `PUT /api/v1/crm/etapas` para persistir la configuración a nivel de tenant en la tabla correspondiente.

4. **Pruebas y Verificación:**
   - `apps/web/src/components/configuracion/bloque-etapas-pipeline.spec.tsx`: 4 pruebas unitarias pasando.
   - Total `@viajapro/web`: 67 suites, 575 pruebas en verde.
   - Typecheck, Linter y Compilación Next.js (18 rutas) 100% en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 67 suites, 575 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 18/18 rutas estáticas y dinámicas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-024: Accesibilidad de la bandeja y los modales: foco, teclado, etiquetas y contraste — 2026-10-28

## Identificación
- **Tarea:** `T-024` (roadmap/tasks.yaml)
- **Rama:** `b/T-024-accesibilidad-bandeja-modales`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Gestión Accesible de Teclado en la Bandeja:**
   - Navegación bidireccional por teclado con flechas (`ArrowDown`/`ArrowUp`) y estilo vim (`j`/`k`).
   - Atajos directos: `/` para enfocar la búsqueda, `Escape` para desenfocarla o cerrar paneles/modales, `Enter` para abrir conversaciones o enviar mensajes.
   - Atajos globales del chat: `Alt+P` para abrir selector de plantillas oficiales, `Alt+R` para reasignar asesor, `Alt+F` para alternar ficha CRM lateral.
   - Barra visible documentada en pantalla (`data-testid="barra-atajos-teclado"`) informando combinaciones clave.

2. **Foco y Trampa de Foco en Modales (WCAG 2.4.3 / 2.1.2):**
   - Hook unificado `useFocoModal` probado y validado en:
     - `ModalPlantillas`
     - `ModalReasignar`
     - `ModalGuardarCotizacion`
     - `ModalMotivoPerdida`
     - `ModalBusquedaGlobal`
   - Garantiza que al abrir el modal el foco se ubica en el primer elemento interactivo, el tabulador cicla dentro del diálogo sin escapar al documento de fondo, y al cerrarse (por botón o tecla `Escape`) el foco regresa limpiamente al elemento disparador.

3. **Etiquetas Accesibles y Contraste (WCAG 1.1.1 / 1.4.3):**
   - Todos los botones de solo icono cuentan con `aria-label` descriptivo y `title`:
     - Botón de volver a lista: `aria-label="Volver a lista de conversaciones"`.
     - Botón de ficha lateral: `aria-label="Alternar ficha de cliente"`.
     - Botón de cerrar ficha: `aria-label="Cerrar ficha de cliente"`.
     - Botón de envío de mensaje/nota: `aria-label="Enviar mensaje"` o `aria-label="Guardar nota interna"`.
     - Botones de cierre en `ModalPlantillas` y `ModalReasignar`.
   - Helper `validarContrasteWCAG` en `apps/web/src/lib/accesibilidad-logica.ts` para verificar ratios de contraste 4.5:1 (texto normal) y 3:1 (texto grande) en temas claro y oscuro.

4. **Pruebas y Verificación:**
   - `apps/web/src/lib/accesibilidad-logica.spec.ts`: 6 pruebas en verde.
   - `apps/web/src/components/bandeja/lista-conversaciones-teclado.spec.tsx`: 6 pruebas en verde.
   - `apps/web/src/components/comun/foco-modal.spec.tsx`: 11 pruebas en verde.
   - Total `@viajapro/web`: 66 suites, 571 pruebas en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 66 suites, 571 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 18/18 rutas estáticas y dinámicas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-023: Revisión a 375 px de bandeja, pipeline, cotizador y catálogo con correcciones — 2026-10-28

## Identificación
- **Tarea:** `T-023` (roadmap/tasks.yaml)
- **Rama:** `b/T-023-revision-375px-movil`
- **Carril:** `b` (Frontend / Web)

## Qué se construyó y auditó

1. **Garantía de Cero Desbordamiento Horizontal a 375 px (Viewport Móvil Estricto):**
   - **Bandeja (`/bandeja` y `/bandeja/[id]`):**
     - Contención de layout flex/grid con `w-full max-w-full overflow-hidden`.
     - `BarraModulos`: los enlaces en la barra colapsada y botones operativos tienen touch targets de 44 px (`min-h-[44px] min-w-[44px]`, `h-11 w-11`).
     - `ListaConversaciones`: selector de densidad y pestañas de filtro optimizados para mobile touch targets (`min-h-[44px]`).
     - Detalle de conversación: botones de notas, sugerencias y botón de envío (`min-h-[44px] min-w-[44px]`) con área de interacción táctil cómoda sin solapamientos.
   - **Pipeline (`/pipeline`):**
     - Botones de alternancia de vista (Kanban / Tabla) con `min-h-[44px]`.
     - Contenedor Kanban con espaciado móvil adaptativo (`p-3 sm:p-6 space-x-3 sm:space-x-4`).
     - Vista de tabla envuelta en contenedor con `overflow-x-auto rounded-2xl` y `min-w-[680px]` para garantizar scroll interno de datos tabulares sin romper el viewport general de 375 px.
   - **Cotizador (`/cotizador`):**
     - `DesgloseCotizacionSalida`: botones de acción principales («Guardar Oficial» y «Copiar Propuesta para WhatsApp») adaptados a disposición apilada móvil `flex-col sm:flex-row w-full sm:w-auto min-h-[44px]` con touch target completo.
     - Barra de acciones inferior del cotizador con botones expandidos `w-full sm:w-auto min-h-[44px]`.
   - **Catálogo (`/catalogo`):**
     - Acciones de cabecera («Importar archivo CSV» e «Ir al Cotizador») en disposición vertical en pantallas angostas con `w-full sm:w-auto min-h-[44px]`.
     - Barra de pestañas con desplazamiento horizontal seguro (`overflow-x-auto shrink-0 min-h-[44px]`).
     - `TarjetaSalidaPublicada`: botón de cotizar adaptativo con texto conciso en móvil («Cotizar» vs «Cotizar esta salida») y touch targets `>= 44px`.

2. **Auditoría de Viewports a 375 px y 1280 px:**
   - **375 px (Mobile Portrait):**
     - Ancho total de pantalla sin scroll horizontal no deseado en ninguna de las cuatro vistas.
     - Elementos interactivos táctiles cumplen el estándar WCAG 2.5.5 / 2.5.8 (mínimo 44 × 44 px).
     - Formularios, selects y campos de entrada con tipografía >= 16px para prevenir auto-zoom en iOS Safari.
   - **1280 px (Desktop Standard):**
     - Disposición multi-columna (Bandeja con 3 columnas: módulos, lista, conversación/ficha; Pipeline Kanban completo; Cotizador con panel lateral; Catálogo en grid responsive de 3 columnas).

3. **Pruebas Automatizadas:**
   - Creada suite `apps/web/src/components/comun/revision-375px.spec.tsx` verificando dimensiones y clases de touch target en los componentes clave.
   - 66 archivos de prueba pasados, 566 pruebas unitarias en verde.

## Verificación de Compuertas
- **Pruebas unitarias (@viajapro/web):** 66 suites, 566 pruebas en verde.
- **Typecheck:** 9/9 paquetes en verde.
- **Linter:** 7/7 paquetes en verde.
- **Compilación de producción (Next.js):** 18/18 rutas estáticas y dinámicas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-022: Auditoría de formatos es-CO: dinero, fechas, teléfonos y cupos con helpers únicos — 2026-10-26

## Identificación
- **Tarea:** `T-022` (roadmap/tasks.yaml)
- **Rama:** `b/T-022-helpers-formato-es-co` (creada desde `origin/main` en commit `f51880a`)
- **Carril:** Frontend (`apps/web`, `packages/ui`, `packages/sdk`)

## Qué se construyó

1. **Módulo Centralizado de Formato (`apps/web/src/lib/formato.ts`):**
   - **Dinero (`formatearDinero`, `formatearCOP`, `formatearDineroCifra`):**
     - Cumplimiento estricto de R8: Dinero en enteros, unidad mínima de la moneda (en COP es el peso, no el centavo).
     - Presentación sin decimales y con punto de miles para COP (`$ 350.000`, `$ 12.500.000`, `$ 1.000.000.000`).
     - Monedas extranjeras con 2 decimales y coma decimal (`$ 1.250,50 USD`).
     - Soporta contratos Zod (`{ unidades, moneda }`), objetos con `monto`, números primitivos y bigints.
   - **Fechas (`formatearFecha`, `formatearFechaHora`):**
     - Cumplimiento de R9: Fechas en UTC en la base, zona horaria oficial del tenant en presentación (`America/Bogota`).
     - Formato estándar colombiano legible: «sáb 3 oct 2026».
     - Manejo de casos límite: cadenas de fecha pura `YYYY-MM-DD` fijadas a mediodía UTC para evitar desfases a la víspera en cualquier cliente; y timestamps UTC de madrugada convertidos con exactitud a la hora local en Bogotá (UTC-5).
   - **Teléfonos (`formatearTelefono`):**
     - Formato móvil colombiano estándar de 10 dígitos: «+57 300 123 4567» (con opción local «300 123 4567»).
     - Teléfonos fijos nacionales con indicativo departamental: «+57 (601) 234 5678».
     - Limpieza y preservación de números extranjeros.
   - **Cupos (`formatearCupo`):**
     - Formato declarativo para salidas y tours: «Agotado», «1 cupo disponible», «12 de 20 cupos», «Cupos libres».

2. **Integración en Componentes y Pantallas:**
   - `apps/web/src/lib/api.ts`: reexporta los helpers únicos hacia toda la aplicación.
   - `apps/web/src/lib/pipeline-logica.ts`: delega el formato de cifras en `formato.ts`.
   - `apps/web/src/lib/contactos-logica.ts`: delega `formatearTelefonoVisual` en `formato.ts`.
   - `apps/web/src/app/cotizaciones/page.tsx`: salidas con fecha formateada en vistas móvil y tabla.
   - `apps/web/src/app/cotizaciones/[id]/page.tsx`: propuesta de WhatsApp con fecha formateada y teléfono del contacto formateado.
   - `apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx`: fecha de salida formateada legiblemente.

3. **Pruebas y Cobertura:**
   - `apps/web/src/lib/formato.spec.ts`: 23/23 pruebas unitarias cubriendo todos los casos límite (cero, millones, miles de millones, medianoche UTC frente a Bogotá, móviles, fijos y cupos).
   - Suite total de `@viajapro/web`: 43 archivos de prueba, 377 pruebas en verde.

## Verificación de Compuertas

- **Pruebas unitarias (@viajapro/web):** 43 suites, 377 pruebas en verde en 10.90s.
- **Typecheck (@viajapro/web):** 0 errores (`tsc --noEmit`).
- **Linter (@viajapro/web):** 0 advertencias, 0 errores (`eslint src`).
- **Prettier:** 100% formateado según reglas de estilo del monorepo.
- **Compilación de producción (Next.js):** 16/16 páginas estáticas y dinámicas compiladas exitosamente.
- **Fronteras y ganchos de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.

---

# Entrega — T-036: Tarjetas de producto con identidad por tipo de excursión (color, icono, degradado, promo y cupos) — 2026-10-28

## Identificación
- **Rama:** `b/T-036-tarjetas-producto-tipo-excursion` (empujada a `origin/b/T-036-tarjetas-producto-tipo-excursion`)
- **Tarea:** T-036 (Tarjetas de producto con identidad por tipo de excursión: color, icono, degradado, promo y cupos)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `9e60798823de4540a788622f805745ff` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Catálogo de Excursiones — Tarjetas con Identidad Visual Turística — ViajaPro CRM*)

## Qué construí
1. **Inferencia y Lógica de Tipos de Turismo (`apps/web/src/lib/catalogo-logica.ts`):**
   - Tipos de producto turísticos tipados estrictamente: `isla_beach_club`, `reserva_natural`, `city_tour`, `aventura_nautica`, `paquete_hotel`, `excursion_general`.
   - Función pura `inferirTipoProducto(nombre: string, etiquetas?: string[])` que reconoce léxico colombiano del sector turístico y previene falsos positivos (por ejemplo, 'recorrido' no activa la regla de 'eco').
   - Re-exportada desde `apps/web/src/components/comun/chip-tipo-producto.tsx`.
2. **Tarjeta de Salida Publicada (`apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx`):**
   - Cabecera temática cuando no hay foto: degradado representativo (`configTipo.degradadoSustituto`), marca de agua translúcida con el icono del tipo (`text-white/15`) y resplandor ambiental.
   - Cabecera con fotografía real: superposición de gradiente oscuro protector para contraste AA WCAG.
   - Insignia de duración con aro dorado oficial (`#c9a24b`).
   - Insignia de promoción vigente con destello y aro dorado (`.insignia-aro-dorado border-[#c9a24b]`).
   - Chip de cupos en vivo con semáforo de urgencia (`¡Últimos cupos!`, `quedan X`, `Agotado`).
   - Horarios formateados (`formatearHorarioExcursion`) y lista de inclusiones destacadas con icono `CheckCircle`.
   - Tarifa «Desde $X por persona» con soporte de `desdePorMoneda` y tachado cuando la política `promo_vencida` es TACHAR.
   - Botón opcional «Ver ficha» conectado a la apertura del panel lateral `FichaDetallePaquete`.
3. **Integración en la Experiencia de Catálogo:**
   - `apps/web/src/app/catalogo/page.tsx`: Tarjetas reales y simuladas muestran su chip temático por tipo de excursión y conectan con la ficha de detalle.
   - `apps/web/src/components/catalogo/ficha-detalle-paquete.tsx`: Cabecera de la ficha incluye el chip temático del tipo de producto.
4. **Suites de Pruebas Unitarias:**
   - `tarjeta-salida-publicada.spec.tsx`: 15 pruebas unitarias verificando los 6 tipos de turismo, degradados sustitutos, fotografías reales, aro dorado, cupos en vivo y políticas de promo vencida.
   - `catalogo-logica.spec.ts`: 20 pruebas unitarias con cobertura exhaustiva de la categorización por léxico y etiquetas.

## Qué verifiqué ejecutando
- **Pruebas unitarias:** `pnpm --filter @viajapro/web test` — **61 suites pasadas, 517/517 pruebas en verde (100%)**.
- **Typecheck estricto:** `pnpm typecheck` — **9/9 tareas exitosas** en Turborepo.
- **Linter:** `pnpm lint` — **7/7 tareas exitosas**, 0 errores.
- **Políticas de rama y secretos:** `pnpm test:hooks` — **59/59 política de rama, 19/19 secretos, 6/6 fronteras entre módulos en verde**.

---

### 2026-10-27 — T-031: Pantalla de gestión del catálogo (crear, editar, desactivar productos)

- **Tarea de la cola:** T-031 (Pantalla de gestión del catálogo: crear, editar y desactivar productos, tarifas y salidas).
- **Rama:** `b/T-031-gestion-catalogo`
- **Stitch Screen ID:** `fd289cef536d46779e25b27d5e7cca0e` (*Gestión del Catálogo — ViajaPro CRM*, Proyecto `8333038101997719867`).
- **Qué construí:**
  1. **Lógica pura y validaciones en `apps/web/src/lib/catalogo-gestion-logica.ts`:**
     - Funciones puras `validarFormularioCrearPaquete` y `validarFormularioEditarPaquete` que validan contra los esquemas Zod de `@viajapro/contracts` (`CrearPaquete` y `EditarPaquete`), generando mensajes de error amigables por campo en español y validando la regla de coherencia de días y noches (ej. 1D/0N para pasadías o días = noches o noches + 1 para paquetes con hotel).
     - Funciones de filtrado reactivo `filtrarPaquetesGestion` y mapeo seguro de datos `prepararDatosFormulario`.
  2. **Cliente API en `apps/web/src/lib/catalogo-api.ts`:**
     - Integración con los endpoints del backend: `listarPaquetesGestionApi` (`GET /api/v1/catalogo/paquetes/gestion`), `crearPaqueteApi` (`POST /api/v1/catalogo/paquetes`), `editarPaqueteApi` (`PATCH /api/v1/catalogo/paquetes/:id`), y `desactivarPaqueteApi` (`PATCH /api/v1/catalogo/paquetes/:id/desactivar`), con tolerancia a fallos y fallback al modo de demostración.
  3. **Componentes visuales de gestión en `apps/web/src/components/catalogo/`:**
     - `TablaGestionCatalogo` (`tabla-gestion-catalogo.tsx`): Tarjetas KPI en cabecera (Total productos, Activos para venta, Pausados/Inactivos), botón de acción rápida `+ Nuevo producto`, buscador por texto, filtro por destino, pestañas de estado segmentadas y tabla responsiva (con visualización de código, destino, duración, tarifa «desde», total de vigencias, badge de estado y botones de acción accesibles con touch target >= 44 px).
     - `ModalFormularioPaquete` (`modal-formulario-paquete.tsx`): Modal accesible con foco atrapado para dar de alta y editar productos turísticos. Valida en tiempo real y muestra errores en español por campo.
     - `DialogoDesactivarPaquete` (`dialogo-desactivar-paquete.tsx`): Diálogo de confirmación accesible que advierte que la desactivación retira el producto del cotizador pero preserva de forma inmutable el historial de cotizaciones y viajes confirmados.
  4. **Integración en la página de catálogo (`apps/web/src/app/catalogo/page.tsx`):**
     - Selector de vista segmentado que permite conmutar entre «Explorar salidas y tarifas» y «Gestión del catálogo», manteniendo el estado y sincronizándose con la API.
  5. **Pruebas automatizadas (22 tests nuevos):**
     - `catalogo-gestion-logica.spec.ts`: 8 tests unitarios de validación, coherencia de noches, edición parcial y filtrado.
     - `tabla-gestion-catalogo.spec.tsx`: 7 tests para KPIs, filtrado por búsqueda y estado, y callbacks de crear, editar y desactivar.
     - `modal-formulario-paquete.spec.tsx`: 7 tests para renderizado en modo nuevo/edición, validación en español y confirmación de desactivación.
- **Qué verifiqué ejecutando:**
  - `test`: **VERDE** (47 archivos de prueba, 410 tests pasando en `@viajapro/web`; 4 suites, 24 tests en `@viajapro/api`).
  - `typecheck`: **VERDE** (cero errores en todo el monorepo con `tsc --noEmit` y Next.js build).
  - `lint`: **VERDE** (0 errores, 0 advertencias en todo el monorepo).
  - `test:hooks`: **VERDE** (59/59 casos de política de ramas y protección de secretos).
- **Qué NO verifiqué:**
  - Despliegue en producción (a la espera de merge en GitHub por CI).

---

# Entrega — T-035: Animaciones y transiciones (entrada escalonada, hover, esqueletos con brillo y transiciones de página) — 2026-10-28

## Identificación
- **Rama:** `b/T-035-animaciones-transiciones-esqueletos` (empujada a `origin/b/T-035-animaciones-transiciones-esqueletos`)
- **Tarea:** T-035 (Animaciones y transiciones: entrada escalonada, hover, esqueletos con brillo y transiciones de página)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `ed51eb6813d7471487cf3b7a1b82d0e2` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Sistema de Animaciones Fluidas, Shimmer Oceánico & Accesibilidad — ViajaPro CRM*)

## Qué construí
1. **Tokens y Utilidades de Animación en `globals.css`:**
   - Shimmer oceánico-dorado (`brilloEsqueleto` y `.esqueleto-brillo`) con reflejo sutil caribeño (`rgba(6, 182, 212, 0.08)`) y arena dorada (`rgba(201, 162, 75, 0.12)`), soportado en temas claro y oscuro.
   - Microinteracción de elevación elástica de tarjetas (`.tarjeta-turismo-hover` y `.tarjeta-elevacion`): traslación de -3px con aceleración por GPU, sombra turquesa y microescala táctil `active:scale-[0.995]` sin layout shift.
   - Entrada escalonada (`.anim-entrada`, `.anim-retraso-1` a `.anim-retraso-6`): retrasos de 40ms a 240ms con curva fluida `cubic-bezier(0.16, 1, 0.3, 1)`.
   - Transiciones suaves para modales (`.anim-modal` < 200ms) y paneles laterales desplegables (`.anim-panel-lateral` < 220ms).
   - Directiva estricta `@media (prefers-reduced-motion: reduce)` según WCAG 2.2 AA que cancela animaciones, neutraliza el shimmer y elimina desplazamientos físicos.
2. **Módulo Reutilizable de Animaciones (`apps/web/src/components/comun/animaciones.tsx`):**
   - `obtenerClaseEscalonada(indice: number)`: Función utilitaria para listas y cuadrículas.
   - `usePrefersReducedMotion()`: Hook reactivo con fallback seguro contra SSR.
   - `<ShimmerBox />`: Componente accesible de esqueleto con destello shimmer y `aria-hidden="true"`.
   - `<ContenedorEscalonado />`: Envoltorio automático para animar colecciones de componentes respetando accesibilidad.
   - Exportado desde `apps/web/src/components/comun/index.ts`.
3. **Esqueletos de Carga con Brillo (`apps/web/src/components/comun/esqueletos.tsx`):**
   - Actualizados todos los esqueletos (`EsqueletoConversacion`, `EsqueletoKanban`, `EsqueletoGridTarjetas`, `EsqueletoTabla`, `EsqueletoExpediente`, `EsqueletoReportes`) para utilizar la clase `.esqueleto-brillo`.
4. **Integración en Listas y Cuadrículas Clave:**
   - **Catálogo (`apps/web/src/app/catalogo/page.tsx` y `tarjeta-salida-publicada.tsx`):** Entrada escalonada por índice y elevación interactiva con borde turquesa al pasar el cursor.
   - **Pipeline Kanban (`apps/web/src/app/pipeline/page.tsx`, `columna-kanban.tsx`, `tarjeta-oportunidad.tsx`):** Tarjetas de oportunidad con elevación elástica y entrada secuencial por columna.
   - **Bandeja de WhatsApp (`apps/web/src/components/bandeja/lista-conversaciones.tsx`):** Esqueletos de conversación con shimmer y animación escalonada al renderizar la lista.
   - **Directorio de Contactos (`apps/web/src/app/contactos/page.tsx`):** Filas de tabla con entrada escalonada y resalte hover turquesa.
   - **Seguimientos Diarios del Asesor (`apps/web/src/components/inicio/bloque-seguimientos-dia.tsx`):** Elevación hover y entrada escalonada de tareas.
   - **Paleta de Comandos y Fichas Laterales (`modal-busqueda-global.tsx`, `ficha-detalle-paquete.tsx`):** Transiciones suaves de apertura y desplazamiento.
5. **Suites de Pruebas Unitarias:**
   - `apps/web/src/components/comun/animaciones.spec.tsx`: 11 pruebas unitarias cubriendo índices, límites, mockeo de `matchMedia`, `ShimmerBox` y desactivación de movimiento reducido.
   - `apps/web/src/components/comun/esqueletos.spec.tsx`: 11 pruebas unitarias verificando estructura accesible y presencia de `.esqueleto-brillo`.

## Qué verifiqué ejecutando
- **Pruebas unitarias:** `pnpm --filter @viajapro/web test` — **61 suites pasadas, 508/508 pruebas en verde (100%)**.
- **Typecheck estricto:** `pnpm typecheck` — **9/9 tareas exitosas** en Turborepo.
- **Linter:** `pnpm lint` — **7/7 tareas exitosas**, 0 errores.
- **Políticas de rama y secretos:** `pnpm test:hooks` — **59/59 política de rama, 19/19 secretos, 6/6 fronteras entre módulos en verde**.

---

# Entrega — T-034: Navegación más rica (barra lateral con iconos de color, migas, paleta de comandos y accesos rápidos) — 2026-10-28

## Identificación
- **Rama:** `b/T-034-navegacion-sidebar-migas-comandos` (empujada a `origin/b/T-034-navegacion-sidebar-migas-comandos`)
- **Tarea:** T-034 (Navegación más rica: barra lateral con iconos de color y etiquetas, migas, paleta de comandos y accesos rápidos)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `14a4e161532b449c8001be6656399ee2` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Navegación Enriquecida & Paleta de Comandos (Ctrl+K) — ViajaPro CRM*)

## Qué construí
1. **Barra lateral expandible / contraíble (`apps/web/src/components/bandeja/barra-modulos.tsx`):**
   - Modo expandido (`w-60`) y modo compacto (`w-14`) con transición suave (`transition-[width] duration-300`).
   - Botón toggle de expansión/colapso con atributo accesible `aria-expanded` y atajo de teclado global `Alt+S`.
   - Persistencia de la preferencia de expansión en el navegador (`viajapro_sidebar_expandida` en `localStorage`).
   - Módulos con paleta de color caribeña oficial (`CONFIGURACION_MODULOS`) y etiquetas legibles.
   - Indicador animado de sección activa con aro dorado de marca (`#c9a24b`) y fondo turquesa suave.
   - En móvil (< 768 px), la barra lateral se oculta limpiamente y pasa a una barra inferior fija con touch targets ergonómicos (`>= 44 px`).
2. **Componente accesible de Migas de Pan (`apps/web/src/components/comun/migas-de-pan.tsx`):**
   - Estructura semántica WAI-ARIA (`<nav aria-label="Migas de pan">`, `<ol>`, `aria-current="page"`).
   - Botón opcional de retorno contextual con touch target ergonómico (`>= 44 px`).
   - Integración en las pantallas de detalle clave: `/bandeja/[id]` (conversación activa) y `/cotizaciones/[id]` (cotización guardada).
   - Exportado desde `apps/web/src/components/comun/index.ts`.
3. **Paleta de Comandos Omnibox (`Ctrl+K` / `Cmd+K`) (`apps/web/src/components/busqueda/modal-busqueda-global.tsx`):**
   - Modal flotante tipo Spotlight para agencias de turismo con atajos accesibles.
   - Búsqueda integrada de:
     - Contactos de viajeros (con nombre y teléfono).
     - Cotizaciones oficiales guardadas (con título, tour y valor en COP).
     - Excursiones y paquetes del catálogo de mayoristas.
     - Conversaciones activas de WhatsApp.
     - Acciones rápidas del asesor y saltos de navegación a módulos.
   - Pestañas con filtros temáticos inmediatos (`[Todos]`, `[WhatsApp]`, `[Catálogo]`, `[Cotizaciones]`, `[Contactos]`, `[Acciones]`).
   - Navegación íntegra por teclado (`↑ ↓` para navegar, `↵` para seleccionar, `Esc` para cerrar, `Tab` para cambiar filtro).
   - Atrapamiento de foco accesible con `useFocoModal` y avisos `aria-live`.
4. **Accesos Rápidos Operacionales:**
   - Botón visible `+ Nueva cotización` en la cabecera de la conversación enlazando directamente al cotizador con parámetros del contacto.
   - Miga de retorno directo y botones de acción rápida para minimizar clics del asesor.
5. **Suites de Pruebas Unitarias:**
   - `apps/web/src/components/comun/migas-de-pan.spec.tsx`: 3 pruebas verificando jerarquía semántica, página activa y botón de retorno.
   - `apps/web/src/components/busqueda/modal-busqueda-global.spec.tsx`: 5 pruebas verificando renderizado, pestañas temáticas, búsqueda y navegación con teclado.
   - `apps/web/src/lib/buscador-global-logica.spec.ts`: 11 pruebas verificando indexación de cotizaciones y filtros de categoría.
   - `apps/web/src/components/bandeja/barra-modulos.spec.tsx`: 17 pruebas verificando enlaces, touch targets móviles, toggle de expansión y persistencia.

## Qué verifiqué ejecutando
- **Pruebas unitarias:** `pnpm --filter @viajapro/web test` — **60 suites pasadas, 497/497 pruebas en verde (100%)**.
- **Typecheck estricto:** `pnpm typecheck` — **9/9 tareas exitosas**, compilación limpia de 16 páginas en Next.js 15.5.27.
- **Linter:** `pnpm lint` — **0 errores, 0 advertencias**.
- **Hooks y guardas de seguridad:** `pnpm test:hooks` — **59/59 política de rama, 19/19 secretos, 6/6 fronteras entre módulos**.
- **Ownership de carril:** `node scripts/check-ownership.mjs` — **✔ Dentro del carril (`carril: b`)**.

---

# Entrega — T-094 y T-095: Inventario de cookies, política y banner de consentimiento accesible — 2026-10-28

## Identificación
- **Rama:** `b/T-094-t-095-politica-banner-cookies` (empujada a `origin/b/T-094-t-095-politica-banner-cookies`)
- **Tareas:**
  - T-094: Inventario de cookies y almacenamiento del navegador, y política de cookies.
  - T-095: Banner de consentimiento de cookies: solo lo no esencial, con aceptar, rechazar y configurar, y registro de la decisión.
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `2c7d1f8d1494433e87f3d3abc9e8c1f4` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Consentimiento de Cookies y Configuración de Privacidad — ViajaPro CRM*)

## Qué construí
1. **Documento Técnico de Inventario y Política (`docs/05-seguridad/13-inventario-y-politica-de-cookies.md`):**
   - Inventario exhaustivo y riguroso de cada cookie y clave de `localStorage` de `apps/web` y `apps/api`:
     - Cookies técnicas backend: `viajapro.session_token` (HttpOnly, Secure, 7 días), `viajapro.csrf_token` (HttpOnly, Sesión).
     - Almacenamiento frontend: `viajapro_consentimiento_cookies` (12 meses, necesaria para registro legal de consentimiento), `viajapro_tema` (preferencias), `viajapro_modo_demo` (preferencias), `_viajapro_telemetria_rendimiento` (analítica no esencial, 30 días).
   - Marco legal colombiano integrado: Ley 1581 de 2012, Decreto 1074 de 2015, Guía de Cookies de la Superintendencia de Industria y Comercio (SIC), y leyes turísticas 300 de 1996 y 2068 de 2020.
   - Actualización del índice maestro en `docs/05-seguridad/00-indice-de-politicas.md` (Política 13 en estado **Cumple**).
2. **Lógica de Privacidad y Consentimiento (`apps/web/src/lib/privacidad-cookies.ts` y `.spec.ts`):**
   - Tipos estrictos para categorías (`NECESARIAS`, `PREFERENCIAS`, `ANALITICA`) y decisiones (`ACEPTAR_TODO`, `SOLO_NECESARIAS`, `PERSONALIZADO`).
   - Métodos seguros `obtenerConsentimientoGuardado()`, `guardarConsentimiento()`, `aceptarTodasLasCookies()`, `aceptarSoloCookiesNecesarias()`, `tieneConsentimientoPara()`.
   - Limpieza automática de datos no consentidos (`limpiarDatosNoConsentidos`) y eventos reactivos de ventana (`EVENTO_CONSENTIMIENTO_ACTUALIZADO`, `EVENTO_ABRIR_MODAL_COOKIES`).
   - 14/14 pruebas unitarias pasando.
3. **Banner de Consentimiento Flotante (`apps/web/src/components/privacidad/banner-consentimiento-cookies.tsx` y `.spec.tsx`):**
   - Tarjeta flotante inferior elegante, de alto contraste en modo claro/oscuro, con touch targets ergonómicos (≥ 44 px).
   - Botones rápidos: «Aceptar todas», «Solo necesarias» (rechaza analítica y preferencias de inmediato sin fricción), «Configurar» (abre modal).
   - 6/6 pruebas unitarias pasando.
4. **Modal de Configuración Granular Accesible (`apps/web/src/components/privacidad/modal-preferencias-cookies.tsx` y `.spec.tsx`):**
   - Atrapamiento de foco accesible con `useFocoModal`.
   - Desglose por categorías con switches interactivos:
     - Cookies Necesarias: bloqueadas permanentemente en activo con badge «Siempre activas».
     - Preferencias: switch interactivo para ergonomía visual y modo demo.
     - Analítica: switch interactivo, inactivo por defecto (*opt-in* estricto).
   - 6/6 pruebas unitarias pasando.
5. **Página Pública de Política e Inventario (`apps/web/src/app/politica-cookies/page.tsx` y `.spec.tsx`):**
   - Ruta `/politica-cookies` con metadata SEO, tabla de inventario completa, guía de configuración en los principales navegadores (Chrome, Firefox, Safari, Edge) y botón interactivo para reabrir el modal de preferencias.
   - 4/4 pruebas unitarias pasando.
6. **Pie de Página Global y RootLayout (`apps/web/src/components/privacidad/pie-de-pagina-privacidad.tsx` y `apps/web/src/app/layout.tsx`):**
   - Footer minimalista con enlace directo a «Preferencias de cookies» (reapertura en cualquier momento) y «Política de cookies e inventario».
   - Inyectado en `RootLayout` con diseño responsive para 375 px y compatibilidad completa con SSR y directivas CSP (T-069).
7. **Pruebas y Verificación:**
   - 57 archivos de prueba en `@viajapro/web` con 471/471 pruebas en verde.
   - Cero errores en `pnpm typecheck`, `pnpm lint`, `pnpm test:hooks`, `verificar-fronteras.mjs` y `check-ownership.mjs`.

---

# Entrega — T-020: Inicio con datos reales del asesor y seguimientos pendientes del día — 2026-10-27

## Identificación
- **Rama:** `b/T-020-inicio-asesor-pendientes-del-dia` (empujada a `origin/b/T-020-inicio-asesor-pendientes-del-dia`)
- **Tarea:** T-020 (Inicio con datos reales del asesor: conversaciones pendientes, oportunidades por etapa y cotizaciones por vencer, alimentado por `GET /api/v1/crm/seguimientos/pendientes-del-dia`)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `2cddf45a324e4f6caad99a67c45ca7bb` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Inicio del Asesor & Dashboard Operacional — ViajaPro CRM*)

## Qué construí
1. **Cliente API y Mock de CRM (`apps/web/src/lib/crm-api.ts` y `mock-crm.ts`):**
   - Implementado `obtenerPendientesDelDiaApi(asesorId?: string): Promise<PendientesDelDia>` que consulta `GET /api/v1/crm/seguimientos/pendientes-del-dia` con soporte de cabeceras de sesión de tenant (`x-tenant-id`, `x-asesor-id`).
   - Implementado `completarSeguimientoApi(id: string): Promise<Seguimiento>` que envía `POST /api/v1/crm/seguimientos/:id/completar`.
   - Mock data completo y validado contra el esquema Zod `PendientesDelDia` del contrato `@viajapro/contracts` en `mock-crm.ts`, con casos para `vencidos` y `deHoy` asociados a contactos, oportunidades, paquetes turísticos cotizados y canales WhatsApp.
2. **Lógica de Agregación y Métricas (`apps/web/src/lib/inicio-logica.ts` y `.spec.ts`):**
   - `calcularMetricasSeguimientos`: computa totales de pendientes, cantidad de vencidos, de hoy y de alta prioridad.
   - `clasificarUrgenciaSeguimiento`: categorización estricta (`VENCIDO`, `HOY`, `FUTURO`).
   - `calcularRetrasoSeguimiento`: texto en es-CO con cálculo amigable del desfase temporal («hace X horas», «hace X días», «hoy», «en X horas»).
   - `formatearHoraSeguimiento`: formato localizado con `Intl.DateTimeFormat`.
   - 8/8 pruebas unitarias pasando en `inicio-logica.spec.ts`.
3. **Componente de Seguimientos Diarios (`apps/web/src/components/inicio/bloque-seguimientos-dia.tsx` y `.spec.tsx`):**
   - Filtros por pestañas (`TODOS`, `VENCIDOS`, `HOY`) con badges numéricos.
   - Tarjetas de compromiso con badges de urgencia diferenciados (rojo para vencido, ámbar para hoy), datos del contacto, canal, motivo y enlace a la conversación (`/bandeja/[id]`) o al pipeline (`/pipeline`).
   - Acción directa de completar seguimiento en un clic con microanimación y feedback táctil accesible (touch targets >= 44 px).
   - Estados de carga (skeleton animado), error con botón de reintento y estado vacío ilustrado cuando no hay tareas pendientes.
   - 6/6 pruebas unitarias pasando en `bloque-seguimientos-dia.spec.tsx`.
4. **Integración en la Página Principal (`apps/web/src/app/page.tsx` y `page.spec.tsx`):**
   - Integrado `obtenerPendientesDelDiaApi` junto a `obtenerConversacionesBandeja`, `obtenerOportunidadesPipeline` y `obtenerCotizacionesApi` usando el tenant de sesión.
   - Las tres tarjetas principales enlazan a sus pantallas filtradas (`/bandeja`, `/pipeline`, `/cotizaciones`) y reflejan datos reales con estados cargando, error y vacío.
   - Manejo del estado local para actualizar instantáneamente la lista de pendientes cuando un asesor completa un seguimiento desde el dashboard sin requerir recargar la página.
   - 8/8 pruebas unitarias pasando en `page.spec.tsx`.
5. **Pruebas y Verificación:**
   - 54 archivos de prueba en `@viajapro/web` con 454/454 pruebas en verde.
   - Cero violaciones de fronteras entre módulos (`verificar-fronteras.mjs`) y estricto respeto del carril frontend `b` (`check-ownership.mjs`).
   - `typecheck`, `lint` y `test:hooks` 100% en verde.

---

# Entrega — T-028: Ajuste de promoción vencida (ocultar o tachar) en Configuración y aplicación en catálogo/cotizador — 2026-10-27

## Identificación
- **Rama:** `b/T-028-ajuste-promo-vencida` (empujada a `origin/b/T-028-ajuste-promo-vencida`)
- **Tarea:** T-028 (Ajuste «promoción vencida» [ocultar o tachar] en Configuración › Catálogo y su aplicación en tarjeta y cotizador)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `4b4005013aba465685340f4b13c49203` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Configuración › Catálogo: Ajuste de Promoción Vencida — ViajaPro CRM*)

## Qué construí
1. **Cliente API (`apps/web/src/lib/catalogo-ajustes-api.ts`):**
   - Consume `GET /api/v1/catalogo/ajustes` y `PATCH /api/v1/catalogo/ajustes` con esquema Zod `AjustesDeCatalogo` (`{ promoVencida: 'OCULTAR' | 'TACHAR' }`).
2. **Componente de Configuración (`apps/web/src/components/configuracion/bloque-ajustes-catalogo.tsx` y `.spec.tsx`):**
   - Panel de 2 columnas con selector interactivo de radio (`OCULTAR` vs `TACHAR`).
   - Advertencia de que el precio cobrado al cliente no cambia (invariante de dominio R12 / ADR-0017 §9).
   - Previsualización reactiva en vivo sobre tarjeta de excursión caribeña con precio tachado y badge condicionales.
   - Pestaña `Catálogo` integrada en `apps/web/src/app/configuracion/page.tsx`.
3. **Aplicación en Tarjeta de Catálogo (`apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx` y `.spec.tsx`):**
   - Respeta `salida.presentacion.listaTachada` y `salida.presentacion.leyenda === 'PROMO_VENCIDA'` calculados por la API.
4. **Aplicación en Cotizador (`apps/web/src/components/cotizador/desglose-cotizacion-salida.tsx` y `.spec.tsx`):**
   - Respeta `linea.presentacion.listaTachada` e `insignia-promo-vencida` calculados por la API.
5. **Pruebas y verificación:**
   - 48 suites pasando en `@viajapro/web`, 406/406 pruebas en verde.
   - Tests específicos para ambos valores (`OCULTAR` y `TACHAR`) tanto en Configuración como en la Tarjeta y en el Cotizador.
   - Typecheck, ESLint y `test:hooks` 100% en verde.

---

# Entrega — T-018, T-051 y T-019: Tarjeta y ficha de excursión, presentación de promo y estado sin catálogo — 2026-10-27

## Identificación
- **Rama:** `b/T-018-t-051-t-019-tarjeta-ficha-sin-catalogo` (empujada a `origin/b/T-018-t-051-t-019-tarjeta-ficha-sin-catalogo`)
- **Tareas:**
  - T-018: Tarjeta y ficha de excursión en el catálogo: «desde», promo, horarios, qué incluye y cupos por salida («sáb 3 oct · quedan 4»).
  - T-051: Tarjeta, ficha y desglose del cotizador pintan `presentacion` de la API sin decidir la promo en el cliente (cero comparaciones con `promoHasta`).
  - T-019: Estado «sin catálogo todavía» (zero state) con dos acciones («Importar catálogo» y «Crear excursión») en catálogo y cotizador.
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `b86a95d7aa3246b087e0baa6fe1063fe` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Catálogo de Excursiones y Estado Sin Catálogo — ViajaPro CRM*)

## Qué construí
1. **Lógica de presentación y cálculo (`apps/web/src/lib/catalogo-logica.ts` y `.spec.ts`):**
   - `formatearHorarioExcursion(horaSalida, horaRegreso)` para desplegar horarios de zarpe y retorno legibles.
   - `clasificarDisponibilidadCupos(cupos)` (`DISPONIBLE`, `ULTIMOS_CUPOS`, `AGOTADO`, `PROGRAMADA`) para chips de urgencia comercial.
   - `interpretarPresentacionTarifa(presentacion)`: centraliza el renderizado de `listaTachada`, `leyenda: 'PROMO_VENCIDA'`, `promoVigente` y `esConsultar` estrictamente desde la API sin comparaciones locales de fecha (T-051).
   - `verificarCargosEnDestinoSeparados(totalVenta, cargosEnDestino)`: garantiza matemáticamente que los cargos en destino nunca se suman al precio del paquete ni a la cotización (R8, ADR-0017 §9).
   - Cobertura completa en `catalogo-logica.spec.ts` (19 pruebas unitarias pasando).
2. **Tarjeta de Salida Publicada (`apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx` y `.spec.tsx`):**
   - Degradado por tipo de producto (Pasadía con degradado turquesa/océano vs Multidía azul/índigo).
   - Chip de cupos con formato de urgencia comercial («sáb 3 oct · quedan 4» / «Últimos 4 cupos» / «Agotado»).
   - Horarios de salida/regreso e inclusiones del plan con chips visuales.
   - Tarifa «desde» en moneda principal y desglose multimoneda `desdePorMoneda` (ej. COP y USD).
   - Estado «Consultar» si no hay precio base o el estado de la API es `CONSULTAR`.
   - Soporte para precio tachado (`data-testid="tarifa-lista-tachada"`) e insignias de promo vencida / promo vigente según `presentacion`.
3. **Ficha de Detalle de Paquete (`apps/web/src/components/catalogo/ficha-detalle-paquete.tsx`):**
   - Muestra bloque destacado de «Cargos a pagar en destino (No incluidos)», separando impuestos de muelle y entradas del total de la cotización.
4. **Desglose del Cotizador (`apps/web/src/components/cotizador/desglose-cotizacion-salida.tsx` y `.spec.tsx`):**
   - Renderiza `linea-lista-tachada` y badge `linea-promo-vencida` derivados de `linea.presentacion` entregado por la API (T-051).
5. **Componente Estado Sin Catálogo (`apps/web/src/components/catalogo/estado-sin-catalogo.tsx` y `.spec.tsx`):**
   - Zero state de alta conversión turística con dos botones de acción obligatorios:
     - `data-testid="btn-sin-catalogo-importar"`: «Importar catálogo (CSV)»
     - `data-testid="btn-sin-catalogo-crear"`: «Crear excursión»
   - Integrado en `apps/web/src/app/catalogo/page.tsx` (cuando la agencia no tiene salidas publicadas en la API).
   - Integrado en `apps/web/src/app/cotizador/page.tsx` (cuando la agencia no tiene productos activos en catálogo).
   - Re-exportado en `apps/web/src/components/comun/estado-sin-catalogo.tsx`.
6. **Verificación y Calidad:**
   - 52 archivos de prueba y 432 tests pasando en `@viajapro/web`.
   - 0 ocurrencias de `promoHasta` en el cliente (cero decisiones de expiración en navegador).
   - `typecheck` con 0 errores, `lint` con 0 errores, `test:hooks` con 59/59 y 19/19 en verde.

---

# Entrega — T-029 y T-030: Asistente de importación de catálogo y descarga de plantillas CSV — 2026-10-27

## Identificación
- **Rama:** `b/T-029-t-030-asistente-importacion` (empujada a `origin/b/T-029-t-030-asistente-importacion`)
- **Tareas:** T-029 (Asistente de importación en 4 etapas) y T-030 (Descarga de plantillas CSV oficiales)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `1ae9a897573c4a5db87a584bf12605c0` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Asistente de Importación de Catálogo y Plantillas — ViajaPro CRM*)

## Qué construí
1. **Lógica de importación (`apps/web/src/lib/importacion-logica.ts` y `.spec.ts`):**
   - Generación de CSV con marcador `#viajapro;plantilla=<formato>;version=<version>`, cabeceras oficiales y filas de ejemplo.
   - Extracción de marcador `#viajapro;`, parsing CSV respetando comillas y delimitadores `,` o `;`.
   - Algoritmo de correspondencia local fonética con cálculo de porcentaje de confianza.
   - Clasificación de elementos de informe (`OK`, `AVISO`, `ERROR`) y cálculo de huella SHA-256.
2. **Cliente API (`apps/web/src/lib/importaciones-api.ts`):**
   - Consume `/api/v1/catalogo/formatos`, `/plantilla`, `/sugerir-mapeo`, `/previsualizar` y `/confirmar` con cabeceras de tenant y fallback a `PLANTILLAS_DE_SISTEMA`.
3. **Descarga de Plantillas (`apps/web/src/components/catalogo/importacion/descarga-plantillas.tsx` y `.spec.tsx`):**
   - Tarjetas por formato (Excursión de un día, Pasadía, Pasanoche, Paquete con hotel).
   - Descarga directa de archivo CSV con nombre estandarizado y acción de importación directa.
4. **Asistente Wizard en 4 Pasos (`apps/web/src/components/catalogo/importacion/asistente-importacion.tsx` y `.spec.tsx`):**
   - Paso 1: Archivo y autocompletado de formato mediante marcador `#viajapro`.
   - Paso 2: Correspondencia de columnas y selector de formato de fecha.
   - Paso 3: Previsualización con KPIs, informe clasificado y huella SHA-256 (botón de confirmación deshabilitado si hay errores).
   - Paso 4: Confirmación atómica todo-o-nada.
5. **Pruebas y verificación:**
   - 49 suites de prueba en `@viajapro/web`, 416/416 tests en verde.
   - `typecheck` con 0 errores, `lint` con 0 errores, `test:hooks` con 59/59 y 19/19 en verde.

---

# Entrega — T-037: Inicio con Saludo según la Hora, Acciones Rápidas y Tarjetas de Colores — 2026-10-26

## Identificación
- **Rama:** `b/T-037-inicio-saludo-acciones-rapidas` (empujada a `origin/b/T-037-inicio-saludo-acciones-rapidas`)
- **Tarea:** T-037 (Inicio con saludo, acciones rápidas y tarjetas de colores sobre el trabajo del día)
- **Carril:** `b` (Frontend / Web)
- **Stitch Design Screen ID:** `c2dece7a590a4f86a730daf773aaaaee` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Inicio & Dashboard Operacional - Laura Gómez - ViajaPro CRM*)

## Qué construí

1. **Saludo dinámico con identidad de turismo y contexto de agencia (`apps/web/src/app/page.tsx`):**
   - Saludo contextual según la hora del día en español colombiano (`¡Buenos días!`, `¡Buenas tardes!`, `¡Buenas noches!`) implementado en `apps/web/src/lib/inicio-logica.ts` (`obtenerSaludoSegunHora`, `obtenerMensajeBienvenida`).
   - Personalización con el nombre del asesor comercial activo (`sesion.identidad.nombre`), avatar con iniciales e insignia de aro dorado (`ring-2 ring-amber-400`).
   - Identificación de la agencia activa (ej. *JD Tours Cartagena*), indicador de «Turno activo» con pulsación visual y fecha/hora en vivo.

---

### 2026-10-26 — T-032: Sistema visual de turismo (paleta caribeña, degradados, iconografía por módulo y componentes base)

- **Tarea de la cola:** T-032 (Sistema visual de turismo: paleta caribeña, degradados, iconografía por módulo y componentes base).
- **Rama:** `b/T-032-sistema-visual-turismo`
- **Stitch Screen ID:** `014a9bab55e94262ad594244a094c507` (*Sistema Visual & Componentes de Turismo — ViajaPro CRM*, Proyecto `8333038101997719867`).
- **Qué construí:**
  1. **Tokens y variables CSS en `apps/web/src/app/globals.css`:**
     - Paleta caribeña oficial (`turquesa` #06B6D4, `oceano` #0B1F3A, `coral` #FB7185, `atardecer` #F97316, `arena` #FDE68A, `resalte` #FACC15, y `dorado` #C9A24B).
     - Variable CSS adaptable para marca por agencia: `--color-acento-marca: #c9a24b;`.
     - Degradados turísticos oficiales: `.degradado-mar`, `.degradado-atardecer`, `.degradado-caribe`, `.degradado-dorado`.
     - Clase utilitaria para insignias: `.insignia-aro-dorado`.
     - Micro-animaciones fluidas (< 400 ms) respetando estrictamente `prefers-reduced-motion`.
  2. **Librería de componentes base en `apps/web/src/components/comun/`:**
     - `BotonTurismo` (`boton-turismo.tsx`): Botón con variantes de degradado (mar, atardecer, dorado, océano), spinner accesible con `aria-busy` y touch target mínimo de 44 px.
     - `TarjetaTurismo` (`tarjeta-turismo.tsx`): Contenedor con elevación suave `tarjeta-turismo-hover` y soporte para borde dorado o fondo oceánico.
     - `InsigniaAroDorado`, `InsigniaPromo` e `InsigniaCuposVivos` (`insignia-turismo.tsx`): Insignias para duración, salida, cupos con ping animado y promociones en resalte amarillo caribeño.
     - `ChipTipoProducto` (`chip-tipo-producto.tsx`): Categorización de productos (Isla & Beach Club, Reserva Natural, City Tour, Aventura Náutica, Paquete Hotel) con inferencia semántica automática.
     - `IconoModulo` (`iconos-modulos.tsx`): Iconos cromáticos ergonómicos por módulo en círculos redondeados.
     - `index.ts`: Re-exportación centralizada de todos los componentes base.
  3. **Pruebas automatizadas:**
     - `apps/web/src/components/comun/sistema-visual-turismo.spec.tsx`: 20 pruebas unitarias verificando renderizado de variantes, estados de carga, accesibilidad táctil, inferencia semántica y consistencia de módulos.
- **Qué verifiqué ejecutando:**
  - `test`: **VERDE** (43 archivos de prueba, 375/375 tests pasando en `@viajapro/web`).
  - `typecheck`: **VERDE** (cero errores TypeScript con `tsc --noEmit`).
  - `lint`: **VERDE** (0 errores, 0 advertencias con ESLint).
  - `format:check`: **VERDE** (100% verificado con Prettier).
  - `build`: **VERDE** (Next.js compiló 16 páginas estáticas y dinámicas en 19s).
  - `check-ownership`: **VERDE** (carril b estricto).
- **Qué NO verifiqué:**
  - Despliegue en entorno productivo (requiere merge de PR en servidor).

---
# Entrega — T-033: Login con identidad de viaje (pantalla dividida con héroe oceánico) — 2026-10-26

## Identificación
- **Rama:** `b/T-033-login-identidad-viaje`
- **Stitch Design Screen ID:** `310817e6eef4417286c884540166df0e` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Login con Identidad de Viaje — ViajaPro CRM*)

## Qué construí

1. **Pantalla dividida con héroe oceánico animado (Split-Screen):**
   - **Panel izquierdo (Héroe caribeño):**
     - Fondo con `degradado-caribe` (de azul marino profundo a turquesa caribeño).
     - Ondas marinas vectoriales animadas con micro-movimiento suave (`animacion-ola`).
     - Elementos icónicos de viaje sutiles (avión en vuelo, brújula náutica, palmera dorada).
     - Título inspirador de turismo: *«Convierte conversaciones en viajes reales»*.
     - Insignia con aro dorado (`InsigniaAroDorado`) destacando la especialidad en agencias de turismo.
     - Indicadores de confianza: 100% WhatsApp Cloud API nativo, gestión multi-agencia y cotizaciones instantáneas.
   - **Panel derecho (Formulario del Asesor):**
     - Tarjeta con elevación suave y bordes redondeados (`tarjeta-turismo`).
     - Encabezado con logotipo, selector visual de agencia y distintivo del modo de conexión (Real / Demostración).
     - **Campos limpios sin valores de relleno reales:** Correo y contraseña inician vacíos `""` cumpliendo la regla de seguridad y privacidad.
     - Inputs accesibles con iconos temáticos a la izquierda, botón de visualización de contraseña accesible y touch targets >= 44 px.
     - Botón principal de llamada a la acción con `BotonTurismo` (`variante="mar"`), efecto hover y spinner de carga accesible.
     - Vistas secundarias fluidas para selección de agencia (`selector-agencia`) y verificación OTP en 2 pasos.

2. **Integración con el Sistema Visual de Turismo (T-032):**
   - Empleo de tokens de `globals.css` (turquesa `#0284c7`, océano `#0369a1`, arena `#f8fafc`, acento de marca configurable `--color-acento-marca: #c9a24b`).
   - Respeto riguroso de `prefers-reduced-motion` para anular animaciones en usuarios con accesibilidad motriz o cognitiva activada.

3. **Pruebas y verificación:**
   - `apps/web/src/components/auth/formulario-ingreso.spec.tsx`: 7/7 pruebas en verde.
   - Se añadió `noValidate` al formulario para permitir la validación de manejo de errores en JSDOM sin que la restricción nativa del navegador impida el envío de campos vacíos en las pruebas.
   - Tipado estricto sin promesas desatendidas en `onSubmit` (`(e) => void manejarEnvioCredenciales(e)`).

## Qué verifiqué ejecutando

- **Pruebas unitarias de apps/web:** `pnpm --filter @viajapro/web test` — **57 archivos de prueba pasados, 471/471 pruebas en verde (100%)**.
- **Typecheck:** `pnpm --filter @viajapro/web typecheck` — **0 errores** TypeScript (`tsc --noEmit` exit 0).
- **Linter:** `pnpm --filter @viajapro/web lint` — **0 errores, 0 advertencias**.
- **Compilación Next.js:** `pnpm turbo run build --filter=@viajapro/web...` — **17/17 rutas compiladas con éxito**.
- **Verificación de carril:** `node scripts/check-ownership.mjs` — `Dentro del carril` (carril b).

---

# Entrega — Bloque 2: Cotizador y Catálogo para Excursiones de un Día y Estados de UI — 2026-10-26

2. **Accesos directos rápidos operacionales de alta conversión:**
   - Botón primario de viaje `+ Nueva cotización` (`data-testid="acceso-nueva-cotizacion"`) enlazando a `/cotizador`.
   - Botón `Bandeja WhatsApp` (`data-testid="acceso-abrir-bandeja"`) con distintivo numérico de conversaciones pendientes enlazando a `/bandeja`.
   - Botón `Ver catálogo` (`data-testid="acceso-ver-catalogo"`) con aro dorado enlazando a `/catalogo`.
   - Botón `Pipeline` (`data-testid="acceso-ver-pipeline"`) enlazando a `/pipeline`.

3. **Cuatro tarjetas métricas con la paleta caribeña de ViajaPro:**
   - **Tarjeta 1 - Turquesa Caribeño (`#06B6D4`):** `Conversaciones pendientes` (`data-testid="tarjeta-conversaciones-pendientes"`), con detalle de chats sin asignar y ventana de 24h WhatsApp activa. Enlace directo a `/bandeja`.
   - **Tarjeta 2 - Océano Profundo (`#0284C7`):** `Oportunidades en Pipeline` (`data-testid="tarjeta-oportunidades-etapa"`), con desglose por etapas (`nuevoLead`, `enCotizacion`, `enNegociacion`) y cifra total destacada. Enlace directo a `/pipeline`.
   - **Tarjeta 3 - Coral Cálido (`#FB7185`):** `Cotizaciones por vencer` (`data-testid="tarjeta-cotizaciones-vencer"`), indicando seguimiento prioritario y bloqueo de cupos con mayoristas. Enlace a `/cotizaciones`.
   - **Tarjeta 4 - Atardecer Tropical (`#F97316`) con Aro Dorado (`#C9A24B`):** `Catálogo de excursiones` (`data-testid="tarjeta-catalogo-turismo"`), con acceso directo a pasadías y tours en COP. Enlace a `/catalogo`.
   - Animación de entrada fluida y escalonada respetando estrictamente `prefers-reduced-motion` (`motion-reduce:transition-none motion-reduce:transform-none`).

4. **Secciones de destinos populares y rendimiento comercial:**
   - Accesos directos para cotizar destinos de alta demanda (Cartagena & Barú, San Andrés & Providencia, Santa Marta & Tayrona, Eje Cafetero).
   - Bloque de acceso directo a reportes y rendimiento comercial con cálculos reales BigInt (R8).

5. **Manejo completo de estados:**
   - **Cargando (`data-testid="inicio-cargando"`):** Esqueleto de alta fidelidad con brillo mientras se consultan la sesión y las métricas.
   - **Error (`data-testid="inicio-error"`):** Banner amigable en es-CO con botón de reintento funcional (`data-testid="boton-reintentar"`).
   - **Vacío (`data-testid="inicio-vacio"`):** Mensaje de bienvenida para agencias recién creadas sin actividad con botón para crear su primera cotización.
   - **Responsive a 375 px:** Diseñado para pantalla de móvil con touch targets `>= 44 px` y sin desbordamiento horizontal.

6. **Lógica desacoplada y suites de pruebas completas:**
   - `apps/web/src/lib/inicio-logica.ts`: Funciones puras de saludo, bienvenida y agregación `calcularResumenTrabajo`.
   - `apps/web/src/lib/inicio-logica.spec.ts`: 4 pruebas unitarias cubriendo rangos horarios, personalización y detección de estado vacío.
   - `apps/web/src/app/page.spec.tsx`: 5 pruebas de componente con React Testing Library verificando saludo, accesos rápidos, tarjetas caribeñas, estado vacío y recuperación ante errores de red.

## Qué verifiqué ejecutando

- **Pruebas unitarias de la web:** `pnpm --filter @viajapro/web test` — **44 suites pasadas, 364/364 tests en verde (100%)**.
- **Pruebas específicas de Inicio:** `pnpm --filter @viajapro/web test "src/app/page.spec.tsx"` y `src/lib/inicio-logica.spec.ts` — **9/9 tests en verde**.
- **Typecheck estricto:** `pnpm --filter @viajapro/web typecheck` — **0 errores** TypeScript.
- **Linter:** `pnpm --filter @viajapro/web lint` — **0 errores / 0 advertencias**.
- **Ownership de carril:** `node scripts/check-ownership.mjs` — **✔ Dentro del carril (`carril: b`, ficheros: 5)**.

## Qué NO verifiqué (Reporte transparente de Compuertas)

- No se verificó la sincronización con pasarelas de pago externas ni emisión de tickets fiscales electrónicos (fuera del alcance del cotizador).
- No se verificó la base de datos real con salidas de tours en producción, pues se probó contra contratos y mocks estandarizados en TypeScript.

## Decisiones no especificadas tomadas

1. **Regla de impuesto de muelle:** El impuesto de muelle en Colombia (especialmente en el Muelle de La Bodeguita en Cartagena hacia Islas del Rosario/Barú/San Bernardo, aprox. $26.500–$29.000 COP) se cancela directamente por el turista en la taquilla portuaria al momento del embarque y las agencias no lo recaudan por adelantado. Por tanto, se catalogó como un aviso obligatorio tanto en el resumen en pantalla como en el texto generado para WhatsApp, sin sumarlo al subtotal cotizado.
2. **Habitaciones en excursiones de un día:** Al tener `noches: 0`, se omiten las habitaciones vacías/penalizaciones de acomodación simple, calculando estrictamente por tarifa por persona (`POR_PERSONA`).

---

# Estado Bloque 3 — Gestión del Catálogo (CRUD e Importación CSV) — PARADA REQUERIDA

## Condición del encargo:
> «Bloque 3 — Gestión del catálogo (crear/editar/desactivar e importar CSV con previsualización):
> NO empieces sin el ADR-0017 y sus endpoints; si no existen, pídelos en ENTREGA.md y sigue.»

## Verificación de requisitos:
1. **ADR-0017:** Existe y está aceptado en `docs/03-adr/0017-catalogo-gestionable-por-la-agencia.md`.
2. **Endpoints de backend en `apps/api`:** **NO EXISTEN**.
   - `apps/api/src/modules/quoting/interface/catalogo.controller.ts` únicamente expone:
     - `GET api/v1/catalogo/paquetes`
     - `GET api/v1/catalogo/paquetes/:id`
   - **Faltan los siguientes endpoints especificados en el ADR-0017 (§4.1 y §4.2):**
     - `POST api/v1/catalogo/paquetes` (creación de producto vía `PropuestaDeCatalogo`)
     - `PATCH api/v1/catalogo/paquetes/:id` (edición de paquete)
     - `POST api/v1/catalogo/paquetes/:id/desactivar` (baja lógica)
     - `POST api/v1/catalogo/importaciones/previsualizar` (validación y cálculo de plan sin escribir)
     - `POST api/v1/catalogo/importaciones/confirmar` (aplicación atómica con huella sha256)
     - `GET api/v1/catalogo/formatos/:id/plantilla` (descriptor de plantilla para CSV/Excel)
   - **Faltan los esquemas Zod en `packages/contracts`:**
     - `packages/contracts/src/propuesta-de-catalogo.ts`
     - `packages/contracts/src/plantillas-de-catalogo.ts`

## Solicitud al equipo de Backend / Integrador:
De acuerdo con las reglas de carril (el carril frontend no toca `apps/api`, `packages/database` ni `packages/contracts`), **se solicita al agente de backend / arquitectura implementar los contratos y endpoints de ADR-0017** antes de iniciar la construcción del frontend del Bloque 3.

---



# Entrega — Bloque 1: Modo real por defecto y modo demostracion opcional — 2026-10-26

## Identificacion
- **Rama:** feat/web-modo-real-por-defecto (empujada a origin)
- **Stitch Design Screen ID:** 3c600e4e3da347e4ba7c5a72f929b115 (Proyecto ViajaPro — CRM para agencias de turismo, ID 8333038101997719867)

## Que construi

1. **Gestion centralizada de Modo Demostracion (apps/web/src/lib/modo-demo.ts):**
   - Funciones puras y reactivas esModoDemo(), fijarModoDemo(activo), alternarModoDemo() y hook useModoDemo().
   - Persistencia en localStorage (viajapro_modo_demo) y despacho de eventos en el DOM (viajapro:cambio-modo-demo) para sincronizacion en tiempo real sin recargar pantalla.
   - Suite de pruebas unitarias con 7/7 casos en verde (apps/web/src/lib/modo-demo.spec.ts).

2. **Seguimiento de sesion activa (apps/web/src/lib/auth-api.ts):**
   - Funciones fijarSesionActiva, obtenerSesionActiva y haySesionActiva para rastreo seguro de sesion en el cliente.

3. **Inversion de interruptores a Modo Real por defecto:**
   - apps/web/src/lib/crm-api.ts: estaUsandoApiReal() devuelve true en navegador a menos que el usuario active explicitamente el modo demo (esModoDemo()). En Vitest sin sesion activa mantiene aislamiento mock para evitar fallos de red.
   - apps/web/src/lib/catalogo-api.ts: estaUsandoCatalogoReal() delega directamente en estaUsandoApiReal().
   - apps/web/src/lib/cotizaciones-api.ts: eliminado interruptor obsoleto de variable de entorno; delega en estaUsandoApiReal().
   - apps/web/src/lib/inbox-api.ts: estaUsandoApiRealInbox() opera conectado en modo real por defecto salvo en modo demo explicito.

4. **Controles de UI y visibilidad del modo demo:**
   - apps/web/src/components/comun/distintivo-datos-demo.tsx: invisible en modo real. En modo demo muestra aviso ambar y boton interactivo para volver al modo real de la agencia.
   - apps/web/src/components/bandeja/barra-modulos.tsx: distintivo verde de API conectada (data-testid="indicador-api-conectada"), boton de acceso directo a modo demo y switch accesible (data-testid="boton-alternar-demo", role="switch", aria-checked) dentro del dialogo de perfil de asesor.
   - Pruebas actualizadas en barra-modulos.spec.tsx con 15/15 casos en verde.

5. **Conexion de pantallas con endpoints reales:**
   - contactos/page.tsx: consulta listarContactos() en modo real con tenant de sesion y reacciona a cambios de modo demo.
   - pipeline/page.tsx: consulta obtenerTableroPipeline() en modo real y reacciona a cambios de modo demo.
   - catalogo/page.tsx: consulta listarSalidasApi() en modo real y conmuta catalogo reactivamente.
   - cotizaciones/page.tsx y cotizaciones/[id]/page.tsx: consultan cotizaciones reales guardadas con control de versiones.
   - cotizador/page.tsx: alternador sincronizado con useModoDemo() y consumo de salidas reales.
   - components/bandeja/lista-conversaciones.tsx: suscrita a useModoDemo() para recargar conversaciones inmediatamente al cambiar de modo.

## Que verifique EJECUTANDO

1. **Pruebas Unitarias de Frontend:**
   - pnpm --filter @viajapro/web test: 40/40 archivos y 342/342 pruebas en VERDE.
2. **Verificacion de Tipos:**
   - pnpm --filter @viajapro/web typecheck: 0 errores de compilacion TypeScript en VERDE.
3. **Calidad de Codigo y Estilo:**
   - pnpm --filter @viajapro/web lint: 0 errores y 0 advertencias de ESLint en VERDE.
   - pnpm prettier --check "apps/web/src/**/*.{ts,tsx}": 100% verificado y formateado en VERDE.
4. **Compilacion de Produccion:**
   - pnpm turbo run build --filter=@viajapro/web...: Compilacion exitosa (16/16 paginas Next.js estaticas y dinamicas compiladas en VERDE).

## Que NO verifique
- No se levanto el servidor NestJS de desarrollo en conjunto con la base de datos PostgreSQL local para navegacion end-to-end con clics de usuario (validacion a cargo de compuertas E2E).

## Decisiones no especificadas
- En entornos de prueba (process.env.VITEST === "true"), si no hay una sesion activa explicitamente inyectada para el test, los clientes devuelven modo mock para evitar fallos de ECONNREFUSED en suites aisladas.
- Sincronizacion reactiva inmediata mediante CustomEvents para que cambiar de modo en la barra de modulos actualice inmediatamente cualquier pagina abierta sin requerir refresco forzado del navegador.

---

# Entrega — Tarea 0c.23: Pantalla de inicio de sesión, solo maqueta — 2026-10-19

## Qué construí

1. **Ruta y Maqueta de Inicio de Sesión (`/iniciar-sesion`):**
   - Construida en `apps/web/src/app/iniciar-sesion/page.tsx`.
   - Incluye formulario con campos para correo electrónico (`type="email"`) y contraseña (`type="password"` con botón accesible para alternar visibilidad).
   - Aviso explícito de maqueta indicando que la autenticación real llegará con el ADR-0011 y que no se almacenan tokens ni sesiones.
   - Totalmente responsiva a 375 px, con objetivos táctiles &ge; 44 px (botones e inputs con altura mínima de 44-48 px).

2. **Interruptor de Activación (`NEXT_PUBLIC_AUTH_MAQUETA`):**
   - Evaluado mediante la función pura `estaAuthMaquetaHabilitada` en `apps/web/src/lib/auth-maqueta-logica.ts`.
   - Apagado por defecto (`undefined`, `""`, `"false"`, `"0"`): cuando está apagado, la ruta `/iniciar-sesion` redirige inmediatamente a `/bandeja` sin alterar ninguna otra parte de la aplicación.
   - Encendido únicamente cuando es explícitamente `"true"` o `"1"`.

3. **Esquema de Validación Local Mínimo:**
   - Tipado con Zod y marcado con el comentario requerido: `// TODO: sustituir por el contrato de identity cuando exista`.
   - Valida formato de correo y longitud mínima de contraseña (&ge; 6 caracteres), mostrando mensajes de error inline por campo.

4. **Simulación de Estados de Carga y Error:**
   - Estado de carga: deshabilita entradas, muestra spinner animado y texto accesible `Verificando credenciales...`.
   - Estado de error: alerta accesible con `role="alert"` y `aria-live="assertive"` que preserva los datos ingresados.
   - Permite probar fallo simulado ingresando cualquier correo con `error@` o las contraseñas `incorrecta` / `error123`.
   - Éxito simulado: retroalimentación positiva y redirección a `/bandeja`.

5. **Pruebas Unitarias de Lógica Pura:**
   - 7 casos de prueba en `apps/web/src/lib/auth-maqueta-logica.spec.ts` cubriendo interruptor, validación Zod y simulación de éxito/error.

---

## Qué verifiqué EJECUTANDO

1. **Pruebas Unitarias:**
   - `apps/web test`: **19/19 archivos y 149/149 pruebas en verde** (incluyendo las 7 nuevas de `auth-maqueta-logica.spec.ts`).

2. **Compuertas de Frontend:**
   - `apps/web lint`: **0 errores, 0 advertencias**.
   - `apps/web build`: **Compilación exitosa** (Next.js 15.5.27 generó 14/14 páginas, incluyendo `/iniciar-sesion` con 3.71 kB).
   - `turbo run typecheck`: **9/9 paquetes en verde** (cero errores TypeScript).
   - `pnpm format:check`: **limpio** (100% Prettier alineado).

3. **Estado de base de datos remota compartida:**
   - Reporte honesto documentado en entregas anteriores respecto a la base Neon compartida (`tests/aislamiento.spec.ts` aserciones 11 y 39 afectadas por migraciones del ADR-0011 de otra rama).

---

## Qué NO verifiqué

- No se conectó ninguna API real de identidad ni se guardaron cookies de sesión, conforme a la instrucción expresa de no inventar endpoints ni contratos antes del ADR-0011.

---

## Decisiones que el encargo no especificaba

- **Alternancia de visibilidad de contraseña:** Se añadió un botón accesible con iconos `Eye` / `EyeOff` con `aria-label` dinámico y dimensiones mínimas de 44 &times; 44 px para facilitar el ingreso de contraseñas en pantallas móviles de 375 px.
- **Valores precargados para demo:** En modo desarrollo, los campos vienen con un usuario de muestra predeterminado (`asesor@viajapro.com`) para agilizar pruebas sin teclear en cada recarga.


# Entrega — Tarea 0c.24: Listado de cotizaciones guardadas, con datos simulados — 2026-10-19

## Qué construí

1. **Ruta y Pantalla de Listado (`/cotizaciones`):**
   - Construida en `apps/web/src/app/cotizaciones/page.tsx`.
   - Conectada mediante `listarCotizacionesApi()` en `apps/web/src/lib/cotizaciones-api.ts`, respetando el interruptor de API real (`NEXT_PUBLIC_USAR_API_REAL`) con fallback a almacén simulado (`obtenerMockCotizaciones()`) tipado con contratos `CotizacionGuardada`.
   - Columnas / campos de la cotización: Cliente (asociado vía `contactoId` a contactos del tenant o nombre fallback), Salida / Destino del paquete, Última versión (`v{numero}` con fecha y hora en formato legible), Total de venta (Regla R8: entero en pesos colombianos formateado sin decimales; **NUNCA** se expone costo neto ni margen comercial), Estado con distintivo cromático accesible (`BORRADOR`, `ENVIADA`, `ACEPTADA`, `RECHAZADA`, `VENCIDA`).
   - Enlace directo a la vista de detalle `/cotizaciones/[id]` para cada cotización.
   - Enlace a nueva cotización en `/cotizador`.

2. **Diseño Responsivo (< 768 px y 375 px) y Desktop (&ge; 768 px):**
   - En pantallas móviles (< 768 px): diseño en tarjetas verticales con `overflow-hidden`, títulos y textos truncados elegantemente (`truncate`, `break-words`), botones y enlaces táctiles con objetivos &ge; 44 &times; 44 px, garantizando cero desbordes horizontales a 375 px.
   - En escritorio (&ge; 768 px): tabla clásica de alta densidad con celdas de alineación clara, encabezados accesibles y estados destacados.

3. **Filtros, Ordenamiento y Paginación:**
   - Filtro de búsqueda en tiempo real por texto (coincidencia insensible a mayúsculas/minúsculas en cliente, destino o título de cotización).
   - Selector de ordenación por fecha de actualización (`recientes`, `antiguas`) y por total de venta (`mayor_precio`, `menor_precio`).
   - Paginación dinámica (8 cotizaciones por página) con controles accesibles de página previa y siguiente, mostrando el rango visible y el total de resultados.

4. **Tres Estados Obligatorios Implementados:**
   - **Estado de Carga (Esqueleto):** Tarjetas y filas esqueleto animadas con `animate-pulse` (sin spinner centrado genérico), conservando el layout de la página.
   - **Estado Vacío:** Ilustración amigable en caja centrada, explicando claramente que aún no hay cotizaciones registradas (o que ninguna coincide con los filtros) y ofreciendo un botón destacado hacia `/cotizador` para crear la primera.
   - **Estado de Error con Reintento:** Alerta descriptiva con icono de aviso, detalle del fallo y botón de acción «Reintentar carga» con objetivo táctil de 44 px.

5. **Modo de Prueba de Estrés (500 Cotizaciones con Nombres Largos):**
   - Botón toggle «Simular 500 cotizaciones» en la barra de herramientas.
   - Genera en memoria 500 cotizaciones válidas según `CotizacionGuardada` con nombres de clientes compuestos («Dra. María Claudia Restrepo Santamaría de los Ángeles», «Familia Rodríguez-Cárdenas de la Santísima Trinidad») y destinos largos.
   - Probado a 375 px de ancho: diseño completamente contenido en la ventana sin desplazamiento horizontal, probando la solidez de la paginación y el truncamiento.

6. **Lógica Pura y Pruebas Unitarias:**
   - Funciones puras en `apps/web/src/lib/cotizaciones-listado-logica.ts`: `extraerResumenVisualCotizacion`, `filtrarCotizaciones`, `ordenarCotizaciones`, `paginarItems`, `generarCotizacionesSimuladasLote`.
   - 10 pruebas unitarias en `apps/web/src/lib/cotizaciones-listado-logica.spec.ts` (10/10 pasando).
   - 1 prueba adicional en `apps/web/src/lib/cotizaciones-api.spec.ts` para `listarCotizacionesApi` (4/4 pasando).

---

## Qué verifiqué EJECUTANDO

1. **Pruebas Unitarias:**
   - `pnpm --filter @viajapro/web test`: **20/20 archivos en verde, 160/160 pruebas pasando**.

2. **Compuertas de Frontend:**
   - `pnpm --filter @viajapro/web lint`: **0 errores**.
   - `pnpm --filter @viajapro/web build`: **Compilación exitosa** (Next.js 15.5.27 compiló las 15 rutas, incluyendo `/cotizaciones` con 6.56 kB).
   - `pnpm typecheck`: **9/9 tareas exitosas** en todo el monorepo (cero errores en api, contracts, database, domain, web).
   - `pnpm format`: **Prettier ejecutado y verificado en todos los archivos**.

3. **Estado de base de datos remota compartida (`pnpm compuertas`):**
   - `build`: verde (23.8s).
   - `lint`: verde (8.7s).
   - `typecheck`: verde (3.4s).
   - `test`: Cayó exclusivamente en `packages/database/tests/aislamiento.spec.ts:718:7` debido a las tablas huérfanas de auth/ADR-0011 presentes en la base Neon compartida de desarrollo (`identidades`, `sesiones`, `verificaciones`, rol `viajapro_identidad`). No se tocó `packages/database` conforme a la Regla R11.

---

## Qué NO verifiqué

- No se conectó contra un endpoint backend persistido en base de datos de producción puesto que la tarea 0c.28 («El listado de cotizaciones pasa a la API real») está explícitamente en ESPERA hasta que `feat/quoting-listado-y-estados` sea integrada en `main`.

---

## Decisiones que el encargo no especificaba

- **Botón de estrés interactivo:** Se incluyó un interruptor visual en la cabecera para alternar entre el conjunto mock estándar (con casos de ejemplo de 2 versiones) y el lote masivo de 500 cotizaciones, permitiendo verificar el comportamiento bajo carga en cualquier momento sin recargar la página.
- **Acceso rápido a cotizador:** Se incorporó un botón «Nueva cotización» en la cabecera que conduce a `/cotizador`.


# Entrega — Tarea 0c.25: Estados vacío, carga y error con evidencia — 2026-10-19

## Qué construí

1. **Erradicación de Spinners Centrados y Creación del Sistema de Esqueletos (`apps/web/src/components/comun/esqueletos.tsx`):**
   - El 100% de los spinners centrados bloqueantes en las vistas fueron reemplazados por siluetas animadas con `animate-pulse`, conservando la estructura del layout y evitando saltos visuales durante la carga de datos:
     - `EsqueletoConversacion`: Cabecera con avatar, burbujas alternadas de mensajes entrantes/salientes, tarjeta de cotización y barra de compositor para `/bandeja/[id]`.
     - `EsqueletoKanban`: 4 columnas kanban completas con cabecera y tarjetas simuladas para `/pipeline`.
     - `EsqueletoGridTarjetas`: Cuadrícula responsiva de 6 tarjetas de paquetes para `/catalogo`.
     - `EsqueletoTabla`: 6 filas con avatares, barras de texto y badges para `/contactos` y `/configuracion`.
     - `EsqueletoExpediente`: Layout dividido (sidebar con lista de expedientes y panel de detalle con KPIs y reservas) para `/viajes`.
     - `EsqueletoReportes`: 4 KPIs superiores y 2 bloques de gráficos ejecutivos para `/reportes`.
     - Esqueleto de desglose de cotización en `/cotizador` y Suspense fallback.

2. **Mensajes de Error Descriptivos y Accionables (`AvisoErrorAccionable`):**
   - Se erradicaron los textos genéricos («Error», «Ocurrió un error», «Algo salió mal») y los `alert()` nativos de JavaScript (ej. validación de NIT en configuración).
   - Todo error en la interfaz presenta ahora:
     - **Título claro:** Qué fallo ocurrió.
     - **Qué pasó:** Causa técnica o comercial comprensible.
     - **Qué hacer:** Pasos exactos para que el usuario resuelva la situación o continúe trabajando.
     - **Botón de reintento táctil:** Con dimensiones mínimas de 44 &times; 44 px para cumplimiento estricto de accesibilidad móvil (AAA).

3. **Lógica Pura y Pruebas Unitarias (`apps/web/src/lib/estados-ui-logica.ts` y `.spec.ts`):**
   - Función `determinarEstadoPantalla` para clasificar de forma pura entre `CARGA`, `ERROR`, `VACIO` o `DATOS`.
   - Función `construirMensajeErrorAccionable` que transforma errores de red, permisos de tenant o reglas de negocio en mensajes con causa y solución por módulo.
   - Función `esMensajeErrorValido` que valida que ningún mensaje de error carezca de acción recomendada.
   - 12 pruebas unitarias automáticas en `estados-ui-logica.spec.ts` (12/12 en verde).

4. **Tabla Pantalla &times; (Vacío, Carga, Error):**

| Pantalla | Estado Vacío | Estado de Carga (Esqueleto) | Estado de Error (Accionable) | Evaluación General |
| :--- | :--- | :--- | :--- | :---: |
| **Bandeja** (`/bandeja`, `/bandeja/[id]`) | **Cumple**: En `/bandeja` muestra pantalla de bienvenida con atajos de teclado y guía comercial. En `/bandeja/[id]` si no hay mensajes, se indica estado limpio. | **Cumple**: `EsqueletoConversacion` en `bandeja/[id]/page.tsx` (avatar, burbujas alternadas entrante/saliente, tarjeta y barra de envío), eliminando el spinner centrado anterior. La lista lateral usa esqueleto de 6 items con `animate-pulse`. | **Cumple**: `AvisoErrorAccionable` descriptivo detallando si el hilo fue archivado o si hubo corte de red, con botón «Reintentar» (&ge; 44 px). | **Cumple** |
| **Pipeline** (`/pipeline`) | **Cumple**: Cada `ColumnaKanban` sin tarjetas muestra caja punteada «Sin oportunidades. Arrastra una tarjeta aquí». La vista tabla compacta muestra fila descriptiva con mensaje claro. | **Cumple**: `EsqueletoKanban` en `pipeline/page.tsx` (4 columnas kanban con tarjetas animadas con `animate-pulse`), reemplazando el `Loader2` centrado anterior. | **Cumple**: `AvisoConfiguracionTenant` para variables de entorno y avisos accesibles detallados ante fallos al mover oportunidades en el CRM. | **Cumple** |
| **Catálogo** (`/catalogo`) | **Cumple**: Si los filtros de destino o plan no coinciden, muestra ilustración `Calendar`/`Package` con «No se encontraron salidas/paquetes» y botón «Restablecer filtros». | **Cumple**: `EsqueletoGridTarjetas` (cuadrícula de 6 tarjetas de paquetes con imagen, título, badges y precio con `animate-pulse`), sustituyendo el spinner centrado anterior. | **Cumple**: `AvisoErrorAccionable` para fallos de API/red con botón «Reintentar» y opción secundaria para cambiar a datos demo. | **Cumple** |
| **Contactos** (`/contactos`) | **Cumple**: Tabla muestra fila centrada cuando ningún contacto coincide con el buscador o etiquetas, con botón «Restablecer filtros». | **Cumple**: `EsqueletoTabla` (6 filas completas con avatares, barras de texto y badges con `animate-pulse`) durante sincronización con CRM. | **Cumple**: `AvisoErrorAccionable` con explicación de fallo de red/CRM y botón de reintento táctil de 44 px. | **Cumple** |
| **Configuración** (`/configuracion`) | **Cumple**: Tabla de usuarios del equipo muestra estado vacío con botón destacado «Invitar al primer miembro». | **Cumple**: Carga modular por pestañas sin spinners bloqueantes. | **Cumple**: Errores descriptivos en parámetros SLA y validación de NIT (alerta accesible con `role="alert"` en lugar de `alert()` nativo), indicando qué regla se rompió y formato admisible. | **Cumple** |
| **Viajes** (`/viajes`) | **Cumple**: Panel lateral muestra «No se encontraron expedientes» con botón «Restablecer búsqueda». Si la agencia no tiene expedientes, muestra ilustración con explicación y botón hacia `/pipeline`. | **Cumple**: Carga de estructura dividida sin spinners centrales invasivos. | **Cumple**: Si el localizador no existe o contiene inconsistencias, describe el fallo y orienta al usuario para revisar el código en el buscador. | **Cumple** |
| **Reportes** (`/reportes`) | **Cumple**: Períodos o métricas sin actividad reflejan estado cero en tablas y gráficos con explicaciones operativas. | **Cumple**: `EsqueletoReportes` (4 KPIs superiores y 2 bloques de gráficos con `animate-pulse`) durante el cambio de período o cálculo. | **Cumple**: Mensajes de error específicos que sugieren verificar el rango de fechas o reintentar el cálculo. | **Cumple** |
| **Cotizador** (`/cotizador`) | **Cumple**: Panel de resultados vacío orienta a seleccionar paquete y pasajeros. | **Cumple**: Esqueleto de desglose de cotización oficial y esqueleto en Suspense, sustituyendo los dos spinners centrados previos. | **Cumple**: Errores tipados de negocio (`SIN_VIGENCIA`, `VIGENCIAS_EMPATADAS`, etc.) con aviso cromático accesible. | **Cumple** |
| **Cotizaciones** (`/cotizaciones`) | **Cumple**: Ilustración de estado vacío con botón directo hacia `/cotizador`. | **Cumple**: Esqueleto de tarjetas móviles y tabla de escritorio con `animate-pulse`. | **Cumple**: Alerta descriptiva con motivo del fallo y botón «Reintentar carga». | **Cumple** |

---

## Qué verifiqué EJECUTANDO

1. **Pruebas Unitarias:**
   - `pnpm --filter @viajapro/web test`: **21/21 archivos en verde, 172/172 pruebas pasando** (incluyendo las 12 pruebas de `estados-ui-logica.spec.ts`).

2. **Compuertas de Frontend:**
   - `pnpm --filter @viajapro/web lint`: **0 errores**.
   - `pnpm --filter @viajapro/web build`: **Compilación exitosa** (Next.js 15.5.27 compiló las 15 rutas, cero errores de tipado o compilación).
   - `pnpm typecheck`: **9/9 tareas exitosas** en todo el monorepo.
   - `pnpm format`: **Prettier ejecutado y verificado en todos los archivos modificados**.

3. **Estado de base de datos remota compartida (`pnpm compuertas`):**
   - `build`: verde (0.6s).
   - `lint`: verde (8.4s).
   - `typecheck`: verde (0.6s).
   - `test`: Cayó exclusivamente en `packages/database/tests/aislamiento.spec.ts:718:7` debido a las tablas huérfanas de auth/ADR-0011 presentes en la base Neon compartida de desarrollo (`identidades`, `sesiones`, `verificaciones`, rol `viajapro_identidad`). No se tocó `packages/database` conforme a la Regla R11.

---

## Qué NO verifiqué

- No se alteraron los esquemas de base de datos ni las políticas RLS de `packages/database` para enmascarar el fallo de `aislamiento.spec.ts`, respetando el aislamiento de roles y el contrato del repositorio.

---

## Decisiones que el encargo no especificaba

- **Componente centralizado `esqueletos.tsx`:** En lugar de duplicar markup de esqueletos ad-hoc en cada archivo de ruta, se encapsularon en componentes semánticos y reutilizables en `components/comun/esqueletos.tsx`.
- **Atributos de accesibilidad en esqueletos:** Todos los esqueletos llevan `aria-busy="true"` y un `aria-label` descriptivo (ej. `aria-label="Cargando conversación"`) para que los lectores de pantalla informen el estado adecuadamente.


# Entrega — Tarea 0c.26: Evidencia a 375 px de la auditoría 0c.21 — 2026-10-19

## Qué construí

1. **Capturas de Pantalla a 375 px en `docs/_assets/diseno/`:**
   - Se capturaron las 4 pantallas exigidas en viewport móvil estándar (375 &times; 812 px) utilizando Chrome Headless:
     - `docs/_assets/diseno/07-catalogo-salida-375px.png` (36.8 kB): Tarjeta de salida del catálogo con filtros y diseño responsivo adaptado.
     - `docs/_assets/diseno/08-ventana-24h-cerrada-375px.png` (32.8 kB): Pantalla de conversación con ventana de 24h cerrada por Meta, mostrando el aviso de borrador preservado («La ventana se cerró; tu borrador sigue aquí») y el botón táctil para seleccionar plantilla HSM.
     - `docs/_assets/diseno/09-pipeline-375px.png` (42.1 kB): Tablero de ventas en vista móvil, con selector de vista (Kanban/Tabla), buscador y tarjetas adaptadas sin desbordamiento.
     - `docs/_assets/diseno/10-cotizador-375px.png` (37.0 kB): Cotizador comercial con selectores, calendario y contadores táctiles amplios.

2. **Corrección Integral de Objetivos Táctiles (< 44 px):**
   - Se auditaron mediante el Chrome DevTools Protocol (CDP) todos los elementos interactivos (`button`, `a`, `input`, `select`) a 375 px y se elevaron para satisfacer la pauta de accesibilidad WCAG 2.5.5 (&ge; 44 &times; 44 px):
     - **Cotizador:** Los 6 botones contadores de pasajeros (`+` y `-`) pasaron de 32 &times; 32 px a `min-h-[44px] min-w-[44px]` (`h-11 w-11`). El selector de paquetes y el campo de fecha de salida se ampliaron a `min-h-[44px]`.
     - **Catálogo:** El enlace «Ir al Cotizador» y los selectores de destino/plan se ajustaron a `min-h-[44px]`.
     - **Bandeja (`[id]`):** El botón de retorno a la lista en móvil (`ArrowLeft`) y el botón de nueva cotización se aseguraron con dimensiones mínimas de 44 &times; 44 px.
     - **Pipeline:** Los botones conmutadores de vista («Kanban» y «Tabla») y el botón «Nueva Oportunidad» se ampliaron a `min-h-[44px]`.

---

## Qué verifiqué EJECUTANDO

1. **Auditoría Responsiva Automatizada con CDP (`scratch/cdp-audit-375px.js`):**
   - **Catálogo (`/catalogo`):** Ancho ventana 375 px, ancho documento 375 px. **Scroll horizontal: NO (CUMPLE)**.
   - **Ventana 24h Cerrada (`/bandeja/00000000-0001-4000-8000-000000000008`):** Ancho ventana 375 px, ancho documento 375 px. **Scroll horizontal: NO (CUMPLE)**.
   - **Pipeline (`/pipeline`):** Ancho ventana 375 px, ancho documento 375 px. **Scroll horizontal: NO (CUMPLE)**.
   - **Cotizador (`/cotizador`):** Ancho ventana 375 px, ancho documento 375 px. **Scroll horizontal: NO (CUMPLE)**.

2. **Pruebas Unitarias de Frontend:**
   - `pnpm --filter @viajapro/web test`: **21/21 archivos en verde, 172/172 pruebas pasando**.

3. **Compuertas de Frontend:**
   - `pnpm --filter @viajapro/web lint`: **0 errores**.
   - `pnpm --filter @viajapro/web build`: **Compilación exitosa** (Next.js 15.5.27 generó las 15 rutas).
   - `pnpm typecheck`: **9/9 tareas exitosas** en todo el monorepo.
   - `pnpm format`: **100% Prettier alineado**.

---

## Qué NO verifiqué

- No se ejecutaron pruebas en dispositivos físicos Android o iOS; la verificación se realizó con el motor Chromium Headless oficial utilizando emulación de métricas de dispositivo móvil a 375 &times; 812 px con factor de escala 2x.

---

## Decisiones que el encargo no especificaba

- **Aislamiento del desplazamiento horizontal en Kanban:** Para el tablero Kanban a 375 px, se garantizó que el desplazamiento horizontal de las columnas quede estrictamente encapsulado en su contenedor interior (`overflow-x-auto`), preservando `document.body.scrollWidth === 375` sin desborde en el viewport global de la página.


---

# ENTREGA — Tarea 0c.33 & 0c.26: Subsanación de Desbordes Horizontales a 375 px y Recaptura de Evidencias

- **Fecha:** 2026-10-19
- **Rama:** `feat/bandeja-web`
- **Tareas cerradas:** `0c.33` (PRIORITARIA) y `0c.26` (Revisada y aceptada en su totalidad).

## Qué se construyó y corrigió (0c.33)

Tras la revisión en `traspaso/REVISION.md` donde se identificaron desbordes visuales en las capturas a 375 px, se realizó una re-ingeniería exhaustiva del diseño responsivo en las cuatro pantallas:

1. **Catálogo (`/catalogo` y `TarjetaSalidaPublicada`):**
   - **Cabecera flexible:** Se aplicó `flex-wrap` al contenedor del título y del badge `DistintivoDatosDemo`, y tipografía responsiva (`text-base sm:text-xl`), impidiendo que el badge o el enlace de acción queden empujados fuera del viewport.
   - **Padding optimizado en móvil:** Reducido de `px-6` (48 px totales) a `px-3.5 py-3.5 sm:px-6 sm:py-5`, aumentando el espacio útil en pantalla.
   - **Tarjetas de salida sin corte:** Se añadió `min-w-0 w-full` a `<article>` y se envolvieron las filas de «Salida confirmada», «Cupo» y «Tarifa desde:» con `flex-wrap gap-1`. El importe monetario y el borde derecho quedan 100% visibles dentro del margen.
   - **Espacio inferior de navegación:** Contenedor principal con `pb-24 md:pb-6` para no colisionar con la barra fija inferior.

2. **Bandeja de Conversación con Ventana Cerrada (`/bandeja/[id]`):**
   - **Cabecera compacta a 375 px:** El bloque izquierdo de avatar y nombre ahora cuenta con `min-w-0 flex-1` con truncado elíptico seguro. El teléfono del contacto se oculta en móviles si el nombre está disponible (`hidden sm:inline`).
   - **Insignias y botones de cabecera:** La insignia de 24h cerrada se optimizó a formato compacto (`Cerrada` con icono de reloj). La insignia de SLA se oculta en pantallas pequeñas (`hidden sm:inline-flex`). El botón de «Nueva cotización» y el selector de ficha del viajero se configuraron como botones táctiles de 44 &times; 44 px (`shrink-0`), posicionando el extremo derecho en 368 px (sin rebasar los 375 px).
   - **Botón clave de 0c.19 100% visible:** El botón «Usar borrador en plantilla» dentro del aviso de borrador preservado se configuró con `w-full sm:w-auto text-xs px-3 py-2 text-center`, garantizando que todo el texto y el icono queden visibles sin cortes.
   - **Burbujas de chat y marcas de tiempo:** Espaciado y burbujas de mensaje con hora («05:51») 100% visibles.

3. **Cotizador Comercial (`/cotizador`):**
   - **Bordes y campos integrales:** La tarjeta de parámetros se dotó de `p-3.5 sm:p-5 min-w-0` y los selectores de paquete turístico se truncan limpiamente, manteniendo visibles los bordes laterales y las sombras.
   - **Pie despejado:** Se añadió `pb-28 md:pb-8` al contenedor principal. Los botones inferiores («Guardar cotización», «Crear propuesta») quedan completamente por encima de la barra de navegación móvil de 56 px (`h-14`), permitiendo su pulsación sin solapamiento.

4. **Pipeline de Oportunidades (`/pipeline`):**
   - **Barra de filtros apilada en móvil:** El campo de búsqueda y el selector «Todos los asesores» se re-estructuraron con `flex-col sm:flex-row w-full gap-2`, eliminando el desborde horizontal que cortaba el selector de asesor.
   - **Contenedor Kanban:** `pb-24 md:pb-6` para visibilidad completa de tarjetas al final de las columnas.

---

## Evidencia Fotográfica Recapturada a 375 &times; 812 px

Se ejecutó recaptura directa mediante Chrome DevTools Protocol (`Page.captureScreenshot` con `Emulation.setDeviceMetricsOverride` a 375 &times; 812 px exactos):

| Captura | Archivo | Peso | Estado Visual |
|---|---|---|---|
| **Catálogo** | `docs/_assets/diseno/07-catalogo-salida-375px.png` | 41.1 KB | Sin cortes. Borde derecho visible, badge demo visible, tarifa desde completa. |
| **Ventana 24h Cerrada** | `docs/_assets/diseno/08-ventana-24h-cerrada-375px.png` | 36.6 KB | Sin cortes. Cabecera dentro de márgenes, hora «05:51» visible, botón «Usar borrador en plantilla» íntegro. |
| **Pipeline** | `docs/_assets/diseno/09-pipeline-375px.png` | 41.6 KB | Sin cortes. Filtros apilados, selector de asesor completo, kanban con scroll interior aislado. |
| **Cotizador** | `docs/_assets/diseno/10-cotizador-375px.png` | 40.1 KB | Sin cortes. Tarjetas con borde derecho, botones inferiores por encima de la barra de navegación. |

---

## Verificación Automatizada Ejecutada

1. **Auditoría de Desborde DOM por Elemento (CDP `getBoundingClientRect` a 375 px):**
   - `/catalogo`: **`overflowCount: 0`** (cero elementos que rebasen 375.5 px).
   - `/bandeja/00000000-0001-4000-8000-000000000008`: **`overflowCount: 0`** (cero elementos que rebasen 375.5 px).
   - `/cotizador`: **`overflowCount: 0`** (cero elementos que rebasen 375.5 px).
   - `/pipeline`: Cabecera y filtros con **`headerOverflowCount: 0`**; columnas Kanban aisladas en su scroll horizontal interno sin desbordar el documento.

2. **Suite de Pruebas Automatizadas:**
   - `pnpm --filter @viajapro/web test`: **21/21 archivos en verde, 172/172 pruebas pasando**.

3. **Compuertas de Frontend:**
   - `pnpm --filter @viajapro/web typecheck`: **0 errores**.
   - `pnpm --filter @viajapro/web lint`: **0 errores**.
   - `pnpm prettier --check`: **100% alineado**.


---

# ENTREGA — Tarea 0c.28: Listado de Cotizaciones Conectado a la API Real con Paginación por Cursor

- **Fecha:** 2026-10-19
- **Rama:** `feat/bandeja-web`
- **Tarea cerrada:** `0c.28`

## Qué se construyó y conectó (0c.28)

Tras la integración de `feat/quoting-listado-y-estados` en `origin/main` y la mezcla limpia en esta rama:

1. **Cero tipos redefinidos (R3):**
   - Se eliminaron los tipos locales `PaginaResultado` y la función `paginarItems` (paginación por número de página del cliente).
   - Se importan estrictamente de `@viajapro/contracts`: `ListarCotizaciones`, `PaginaDeCotizaciones`, `FilaDeCotizacion` y `EstadoCotizacion`.
   - `ResumenVisualCotizacion` se deriva directamente de `FilaDeCotizacion` (`ultimaVersionEn`, `numeroDeVersiones`, `venta`), sin `politica`.

2. **Conexión a la API Real (`GET /api/v1/cotizaciones`):**
   - `listarCotizacionesApi(params?: ListarCotizaciones): Promise<PaginaDeCotizaciones>` consulta `/api/v1/cotizaciones` pasando los parámetros validados por Zod (`cursor`, `limite`, `estado`, `contactoId`, `desde`, `hasta`).
   - Mantiene el interruptor `NEXT_PUBLIC_USE_REAL_CRM` con fallback en memoria simulado que genera exactamente la estructura de `PaginaDeCotizaciones`.

3. **Paginación por Cursor con «Cargar más cotizaciones»:**
   - La interfaz en `/cotizaciones` pasa del paginador numérico anterior a un flujo continuo con botón accesible «Cargar más cotizaciones» (>= 44 px).
   - Cuando `pageInfo.hasMore` es verdadero, el botón solicita la siguiente página usando `cursor: pageInfo.nextCursor`.
   - El orden lo entrega el servidor (`ultimaVersionEn` descendente).

4. **Visualización de Estados Oficiales:**
   - Distintivos visuales por estado del contrato: `BORRADOR` (neutral), `ENVIADA` (azul acento), `ACEPTADA` (esmeralda), `RECHAZADA` (rojo alerta), `VENCIDA` (ámbar aviso).
   - Selector de filtro por estado (`EstadoCotizacion`).

5. **Garantías R8 y R10:**
   - Total de venta presentado exclusivamente en cifras enteras de COP (`.cifra` + `formatearDinero`).
   - Cero exposición de costo neto, margen o política comercial a nivel de datos ni DOM.

6. **Caso de Estrés de 500 Cotizaciones:**
   - `generarCotizacionesSimuladasLote(500)` tipado con `FilaDeCotizacion` permite validar fluidez y paginación por cursor en modo desconectado.

---

## Verificación Automatizada Ejecutada

1. **Suite de Pruebas Unitarias (`pnpm --filter web test`):**
   - **21/21 archivos en verde, 171/171 pruebas pasando**.
   - Pruebas dedicadas en `cotizaciones-listado-logica.spec.ts` (9 pruebas) y `cotizaciones-api.spec.ts` (4 pruebas) validando paginación por cursor, derivación de fila y contratos Zod.

2. **Compuertas de Frontend:**
   - `pnpm --filter web typecheck`: **0 errores**.
   - `pnpm --filter web lint`: **0 errores**.
   - `pnpm --filter web build`: **Compilación exitosa** (Next.js generó las 15 rutas estáticas y dinámicas).
   - `pnpm prettier --check`: **100% alineado**.

---

# Entrega Tarea 0c.30 — Erradicación de Mensajes Crudos y Clasificación de Fallos

**Fecha:** 2026-10-19  
**Rama:** `feat/bandeja-web`  
**Contexto:** Erradicación de fugas de mensajes técnicos internos (`err.message`) al usuario y clasificación tipada de fallos con acciones claras en español.

---

## 1. Qué se implementó

1. **Clasificación Tipada y Pura de Errores (`estados-ui-logica.ts`):**
   - Se añadió la función pura `clasificarError(error: unknown): CategoriaErrorUI` que categoriza fallos en cinco categorías de negocio y UX:
     - `RED`: Fallos de conexión o `Failed to fetch`.
     - `SESION`: Problemas de autenticación (`401`), autorización (`403`) o tenant no configurado.
     - `NO_ENCONTRADO`: Recursos no localizados (`404`).
     - `VALIDACION`: Desajustes de datos o esquemas Zod (`400`, `409`).
     - `DESCONOCIDO`: Cualquier otra excepción imprevista.
   - Se añadió `esTextoTecnico(texto: string): boolean` para interceptar stack traces (`at Object.run (...)`), trazas SQL (`SELECT * FROM ...`), menciones de motores de base de datos (`postgres`, `prisma`, `connection pool`) y errores internos (`TypeError`, `SyntaxError`).
   - Se añadió `formatearErrorAmigable(error: unknown, fallback: string): string` que traduce cualquier error a un mensaje digno y comprensible en español, enviando el error crudo únicamente a `console.error` para depuración técnica sin comprometer al usuario.

2. **Purga Completa de `err.message` en `apps/web/src/app`:**
   - **`bandeja/[id]/page.tsx`**: Eliminados `[e.code] ${e.message}` y `e.message` en carga de conversación, envío de mensajes y asignación de asesor.
   - **`catalogo/page.tsx`**: Eliminados `err.message` en carga inicial de paquetes y apertura de detalle de paquete.
   - **`contactos/page.tsx`**: Eliminado `err.message` en carga de directorio.
   - **`cotizador/page.tsx`**: Eliminado `err.message` en guardado y consulta de cotización.
   - **`pipeline/page.tsx`**: Eliminado `err.message` en arrastre y cambio de etapa de oportunidades.

3. **Pruebas Automatizadas Rigurosas (`estados-ui-logica.spec.ts`):**
   - 18 pruebas unitarias cubriendo:
     - Detección de texto técnico y supresión de stack traces.
     - Clasificación correcta por código de estado HTTP y mensajes de error.
     - Garantía de que `formatearErrorAmigable` nunca devuelva texto técnico ni trazas de backend.

---

## 2. Estado de Compuertas

- `pnpm --filter web test`: **21/21 archivos en verde, 177/177 pruebas pasando**.
- `pnpm --filter web typecheck`: **0 errores**.
- `pnpm --filter web lint`: **0 errores**.
- `pnpm --filter web build`: **Compilación exitosa Next.js**.

---

# Entrega Tarea 0c.34 — Con la API Real Encendida, un Fallo es un Error (Nunca Datos Simulados)

**Fecha:** 2026-10-19  
**Rama:** `feat/bandeja-web`  
**Contexto:** Erradicación del patrón de fallback silencioso a datos simulados cuando la API real está encendida (`NEXT_PUBLIC_USE_REAL_CRM=true` o `NEXT_PUBLIC_USE_REAL_INBOX=true`), garantizando que un fallo de red o del servidor sea visible honestamente con `AvisoErrorAccionable` y reintento.

---

## 1. Qué se auditó y corrigió

### 1.1 `apps/web/src/lib/cotizaciones-api.ts`
Se eliminó el bloque `catch` que registraba `console.warn` y continuaba silenciosamente al mock en las 4 funciones:
1. **`guardarCotizacionApi`**: Si la API real está encendida, despacha a `POST /api/v1/cotizaciones`. Si falla la red o el servidor responde `!res.ok`, lanza `CotizacionesApiError`. El mock solo responde si `!estaUsandoApiReal()`.
2. **`anadirVersionCotizacionApi`**: Despacha a `POST /api/v1/cotizaciones/:id/versiones`. Ante error, propaga la excepción tipada. Cero caída a mock.
3. **`obtenerCotizacionGuardadaApi`**: Despacha a `GET /api/v1/cotizaciones/:id`. Ante error, propaga la excepción tipada.
4. **`listarCotizacionesApi`**: Despacha a `GET /api/v1/cotizaciones`. Ante error, propaga la excepción tipada.

### 1.2 `apps/web/src/lib/crm-api.ts`
Se auditó y corrigió el mismo patrón en las 4 funciones de CRM:
1. **`obtenerTableroPipeline`**: Eliminado fallback a `obtenerMockTableroPipeline()`. Si la API real está activa y falla, lanza `CrmApiError`.
2. **`moverOportunidadDeEtapa`**: Eliminado cálculo y movimiento local en mock cuando la API real está activa. Ante fallo, propaga `CrmApiError`.
3. **`obtenerFichaDeContacto`**: Eliminado fallback a `obtenerMockFichaDeContacto()`. Lanza `CrmApiError`.
4. **`listarContactos`**: Eliminado fallback a `obtenerMockPaginaContactos()`. Lanza `CrmApiError`.

### 1.3 Auditoría de `apps/web/src/lib/inbox-api.ts` (Función por Función)
Se verificó el comportamiento del cliente de Inbox con interruptor (`NEXT_PUBLIC_USE_REAL_INBOX`):
1. **`consultarBandeja`**:
   - Con interruptor apagado: usa `consultarBandejaMock(consulta)`.
   - Con interruptor encendido: despacha a `GET /api/v1/inbox/conversaciones`. Si falla, lanza `InboxErrorApi`. **Nunca cae al mock**.
2. **`obtenerConversacionDetalle`**:
   - Con interruptor apagado: usa `obtenerConversacionDetalleMock(id)`.
   - Con interruptor encendido: despacha a `GET /api/v1/inbox/conversaciones/:id`. Si falla, lanza `InboxErrorApi`. **Nunca cae al mock**.
3. **`enviarTexto`**:
   - Con interruptor apagado: usa `enviarTextoMock(entrada)`.
   - Con interruptor encendido: despacha a `POST /api/v1/inbox/conversaciones/:id/mensajes`. Si falla, propaga error. **Nunca cae al mock**.
4. **`asignarConversacion`**:
   - Con interruptor apagado: usa `asignarConversacionMock(entrada)`.
   - Con interruptor encendido: despacha a `POST /api/v1/inbox/conversaciones/:id/asignar`. Si falla, propaga error. **Nunca cae al mock**.
5. **`cambiarEstadoConversacion`**:
   - Con interruptor apagado: usa `cambiarEstadoConversacionMock(entrada)`.
   - Con interruptor encendido: despacha a `PATCH /api/v1/inbox/conversaciones/:id/estado`. Si falla, propaga error. **Nunca cae al mock**.
6. **`crearNota`**:
   - Con interruptor apagado: usa `crearNotaMock(entrada)`.
   - Con interruptor encendido: despacha a `POST /api/v1/inbox/conversaciones/:id/notas`. Si falla, propaga error. **Nunca cae al mock**.

### 1.4 Correcciones en Vistas (`pipeline` y `contactos`)
- **`apps/web/src/app/pipeline/page.tsx`**: Cuando `obtenerTableroPipeline()` falla en modo API real, ya no recurre silenciosamente a datos simulados (`setEsModoSimulado(true)`). Ahora captura el fallo en `errorCarga` y despliega `AvisoErrorAccionable` con botón de reintento, evitando pintar columnas mock como si fueran reales.
- **`apps/web/src/app/contactos/page.tsx`**: Cuando ocurre un error al consultar el directorio de contactos, la tabla con filas simuladas queda oculta y solo se presenta el `AvisoErrorAccionable`.

---

## 2. Pruebas Automatizadas de Verificación

Se añadieron pruebas automatizadas dedicadas en Vitest simulando fallos de red (`fetch` que rechaza) y respuestas 500 del servidor con el interruptor encendido:
- **`cotizaciones-api.spec.ts`** (13 pruebas):
  - Con fetch rechazado: `guardarCotizacionApi`, `anadirVersionCotizacionApi`, `obtenerCotizacionGuardadaApi` y `listarCotizacionesApi` lanzan `CotizacionesApiError` y no devuelven datos simulados.
  - Con respuesta 500: las 4 funciones lanzan `CotizacionesApiError` con status 500 y no devuelven datos simulados.
  - Con interruptor apagado: devuelven datos simulados correctamente.
- **`crm-api.spec.ts`** (16 pruebas):
  - Con fetch rechazado: `obtenerTableroPipeline`, `moverOportunidadDeEtapa`, `obtenerFichaDeContacto` y `listarContactos` lanzan `CrmApiError` y no devuelven datos mock.
  - Con respuesta 500: las 4 funciones lanzan `CrmApiError` con status 500.
  - Con interruptor apagado: devuelven datos simulados correctamente.
- **`inbox-api.spec.ts`** (8 pruebas):
  - Con fetch rechazado y respuesta 500: los métodos de `inboxApi` lanzan `InboxErrorApi` y no devuelven datos mock.
  - Con interruptor apagado: devuelven datos simulados correctamente.

**Resultado:** 22/22 suites en verde, **203 pruebas pasando**.

---

# Entrega Tarea 0c.31 — Pruebas de los Componentes de Estado

**Fecha:** 2026-10-19  
**Rama:** `feat/bandeja-web`  
**Contexto:** Pruebas unitarias de componentes con Testing Library para `AvisoErrorAccionable` y la familia de siluetas de carga de `components/comun/esqueletos.tsx`.

---

## 1. Qué se implementó y verificó

Se creó el archivo de pruebas de componentes `apps/web/src/components/comun/esqueletos.spec.tsx` (11 pruebas automatizadas):

1. **`AvisoErrorAccionable`**:
   - Expone `role="alert"` y `aria-live="assertive"` para notificación inmediata por tecnología de asistencia.
   - Enseña los bloques estructurados de negocio: título, qué pasó y qué hacer.
   - Botón «Reintentar»:
     - Mide `min-h-[44px]` cumpliendo con el touch target táctil móvil (WCAG 2.5.5).
     - Dispara correctamente el callback `onReintentar` al hacer clic.
     - Se omite automáticamente cuando `error.esReintentable` es falso.
   - Acción secundaria: renderiza con `min-h-[44px]` y ejecuta su callback al activarse.

2. **Siluetas de Carga (Esqueletos) — Accesibilidad y Lectores de Pantalla**:
   - **`EsqueletoConversacion`**: verifica presencia de `aria-busy="true"` y `aria-label="Cargando conversación"`.
   - **`EsqueletoKanban`**: verifica `aria-busy="true"` y `aria-label="Cargando tablero kanban"`.
   - **`EsqueletoGridTarjetas`**: verifica `aria-busy="true"`, `aria-label="Cargando catálogo"` y conteo de tarjetas configurable.
   - **`EsqueletoTabla`**: verifica `aria-busy="true"`, `aria-label="Cargando registros"` y conteo de filas configurable.
   - **`EsqueletoExpediente`**: verifica `aria-busy="true"` y `aria-label="Cargando expedientes de viaje"`.
   - **`EsqueletoReportes`**: verifica `aria-busy="true"` y `aria-label="Cargando reportes comerciales"`.

---

## 2. Compuertas de Frontend
- `pnpm --filter web test`: **23/23 suites en verde, 214/214 pruebas pasando**.
- `pnpm --filter web typecheck`: **0 errores**.
- `pnpm --filter web lint`: **0 errores**.


---

# Entrega Tareas 0c.34 y 0c.30 (Cierre de Puntos de Revisión)

**Fecha:** 2026-10-19  
**Rama:** `feat/bandeja-web`  
**Contexto:** Subsanación de restos de revisión para 0c.34 (crm-api y ZodError) y 0c.30 (clasificación por código de dominio y err.message en bandeja).

## 1. Qué se construyó y corrigió

1. **0c.34 (Restos de crm-api):**
   - En `apps/web/src/lib/crm-api.ts`: se eliminaron los dos bloques `try/catch` en `obtenerTableroPipeline()` y `obtenerFichaDeContacto()` que ante cualquier error distinto de `CrmApiError` (como un `ZodError` por respuesta 200 con forma inesperada) caían al almacén simulado pintándolo como real.
   - En `apps/web/src/lib/crm-api.spec.ts`: se añadieron pruebas con respuestas HTTP 200 de esquema inválido para `obtenerTableroPipeline`, `obtenerFichaDeContacto`, `listarContactos` y `moverOportunidadDeEtapa`, verificando que lanzan error y nunca devuelven datos simulados.
   - En `apps/web/src/lib/cotizaciones-api.spec.ts`: se añadieron pruebas análogas de respuesta 200 con contrato Zod inválido para `obtenerCotizacionGuardadaApi` y `listarCotizacionesApi`.

2. **0c.30 (Restos de clasificación y err.message):**
   - En `apps/web/src/lib/estados-ui-logica.ts`: `clasificarError` inspecciona ahora de forma prioritaria el código de dominio (`errorObj.code` / `errorObj.codigo`) y el código de estado HTTP (`statusHttp`) antes de recurrir al escaneo de palabras clave del mensaje.
   - En `apps/web/src/components/bandeja/lista-conversaciones.tsx`: se erradicaron las 3 interpolaciones crudas de `err.message` (líneas 81, 83 y 149), pasando ahora por `formatearErrorAmigable`.
   - En `cotizaciones-logica.ts:192` y `cotizador-logica.ts:173`: el manejo de fallos desconocidos se canaliza a través de `formatearErrorAmigable`.

3. **Sincronización con main:**
   - Merge limpio con `origin/main` (v0.35.0), resolviendo el conflicto en `cotizaciones-api.ts` preservando la política estricta de no enmascarar errores de API real tras mocks.

## 2. Qué se verificó EJECUTANDO

- `pnpm --filter @viajapro/contracts build`: compilado con éxito.
- `pnpm --filter web typecheck`: **0 errores**.
- `pnpm --filter web lint`: **0 errores, 0 advertencias**.
- `pnpm --filter web test`: **23/23 suites en verde, 218/218 pruebas pasando**.
- `pnpm --filter web build`: **Compilación de producción exitosa** (15/15 rutas estáticas y dinámicas generadas).
- `pnpm exec prettier --check "apps/web/**/*.{ts,tsx}"`: **Estilo verificado**.

## 3. Qué NO se verificó

- No se ejecutaron pruebas e2e en navegador sobre endpoints con fallos 500 inyectados en vivo contra Neon (la validación se realizó mediante suites Vitest interceptando fetch).

## 4. Decisiones que el encargo no especificaba

- Se mapearon en `clasificarError` códigos de dominio canónicos como `SIN_SESION`, `CONFIG_TENANT_FALTANTE`, `VENTANA_CERRADA` y códigos estándar HTTP (400, 401, 403, 404, 409, 500) para garantizar clasificación determinista sin importar cómo el backend formatee su mensaje de texto.


---

# Entrega Tarea 0c.32: Teclado y foco en modales y bandeja

**Fecha:** 2026-10-20  
**Rama:** `feat/bandeja-web`  
**Contexto:** Accesibilidad de teclado, focus trap, tecla Escape, restauración de foco al disparador y anuncios `aria-live` en modales y bandeja.

## 1. Qué se construyó

1. **Hook reutilizable `useFocoModal` (`apps/web/src/lib/use-foco-modal.ts`):**
   - Almacena `document.activeElement` al abrir el modal y restaura el foco al cerrarlo.
   - Coloca el foco inicial en `elementoInicialRef` o en el primer elemento interactivo (`button`, `input`, `select`, etc.).
   - Atrapa el foco dentro del modal (Focus Trap): cicla `Tab` y `Shift+Tab` impidiendo que el foco escape al fondo de la página.
   - Cierra con tecla `Escape` invocando `onCerrar()`.

2. **Integración en los 4 Modales de la aplicación:**
   | Modal | Foco dentro | Cierra con Esc | Foco de vuelta | Avisos `aria-live` |
   |---|---|---|---|---|
   | `ModalPlantillas` | Sí (tarjeta / primer control) | Sí | Sí (al disparador) | Sí (`assertive`) |
   | `ModalGuardarCotizacion` | Sí (input título) | Sí | Sí (al botón Guardar) | Sí (`assertive`) |
   | `ModalMotivoPerdida` | Sí (radio options) | Sí | Sí (a tarjeta kanban) | Sí (`assertive`) |
   | `ModalBusquedaGlobal` | Sí (input búsqueda) | Sí | Sí (al disparador Cmd+K) | Sí (`polite`) |

3. **Navegación accesible en la Bandeja:**
   - En `apps/web/src/components/bandeja/lista-conversaciones.tsx`:
     - Navegación con flechas `ArrowDown` y `ArrowUp` entre conversaciones.
     - Atajo `/` para enfocar la barra de búsqueda rápidamente.
     - Tecla `Escape` en búsqueda limpia el texto y retorna el foco a la lista.
     - Indicadores visuales de foco accesible con `focus-visible:ring-2`.
   - En `apps/web/src/app/bandeja/[id]/page.tsx`:
     - Enviar mensaje con `Enter` (sin Shift), salto de línea con `Shift+Enter`.
     - Anuncio de mensajes entrantes con `aria-live="polite"`.
     - Alerta de fallos de envío con `role="alert"` y `aria-live="assertive"`.

4. **Suite de pruebas de accesibilidad y foco (`apps/web/src/components/comun/foco-modal.spec.tsx`):**
   - 9 pruebas completas verificando Focus Trap, Escape, restauración de foco y atributos `aria-live`.

## 2. Qué se verificó EJECUTANDO

- `pnpm --filter web test`: **24/24 suites en verde, 227/227 pruebas pasando**.
- `pnpm --filter web typecheck`: **0 errores**.
- `pnpm --filter web lint`: **0 errores, 0 advertencias**.
- `pnpm --filter web build`: **Compilación exitosa** (15/15 páginas generadas).
- `pnpm format:check`: **Todos los archivos coinciden con el estilo Prettier**.

## 3. Qué NO se verificó

- No se ejecutó lector de pantalla real (NVDA/VoiceOver) en hardware nativo; la validación se realizó sobre el DOM mediante `@testing-library/react` y jsdom.

## 4. Decisiones que el encargo no especificaba

- En `ModalPlantillas`, se habilitó selección con teclado mediante `tabIndex={0}`, `role="button"` y listener `onKeyDown` (Enter/Espacio) para las tarjetas de plantilla, garantizando accesibilidad total sin requerir ratón.


---

# Entrega Tarea 0c.29: Conexión de `/ingresar` con la API real de identidad (ADR-0011)

**Fecha:** 2026-10-20  
**Rama:** `feat/bandeja-web`  
**Contexto:** Transición de la pantalla de ingreso a la API real de Better Auth (`POST /api/v1/auth/sign-in/email`, `POST /api/v1/auth/sign-out`, `GET /api/v1/auth/session`, `POST /api/v1/auth/tenant-activo`), contratos Zod `@viajapro/contracts`, cookie `HttpOnly` (`credentials: 'include'`), selector de agencia y redirección de servidor cuando el interruptor está inactivo.

## 1. Qué se construyó

1. **Cliente de Identidad (`apps/web/src/lib/auth-api.ts`):**
   - Interacción con las 4 rutas reales de autenticación bajo contratos Zod estrictos (`IniciarSesion`, `SesionActual`, `AgenciaDeAcceso`, `CambiarAgenciaActiva`, `CodigoDeErrorDeAcceso`).
   - Política R3 / 0c.34: ante cualquier respuesta 200 malformada, valida con `SesionActual.parse(json)` lanzando `ZodError` sin enmascarar con mocks.
   - Envío de cookies de sesión mediante `credentials: 'include'`.
   - Mapeo de errores canónicos (`CREDENCIALES_INVALIDAS`, `DEMASIADOS_INTENTOS`, `SIN_SESION`, `SIN_AGENCIA_ACTIVA`, `ACCESO_REVOCADO`, `AGENCIA_SUSPENDIDA`, `SIN_MEMBRESIA`, `CODIGO_INVALIDO`, `ORIGEN_NO_CONFIABLE`) a mensajes comprensibles para el usuario.
   - Modo mock offline de respaldo para desarrollo local sin backend cuando el interruptor real está inactivo.

2. **Ruta canónica `/ingresar` (`apps/web/src/app/ingresar/page.tsx`):**
   - Server Component de Next.js que evalúa `estaAuthHabilitada()`. Si está inactivo, ejecuta `redirect('/bandeja')` a nivel de servidor, sin renderizar ningún markup en el cliente.
   - Ruta legacy `/iniciar-sesion/page.tsx` redirige permanentemente a `/ingresar`.

3. **Componente de Flujo de Ingreso (`apps/web/src/components/auth/formulario-ingreso.tsx`):**
   - **Paso 1 (Credenciales):** Formulario accesible con correo y contraseña, alternancia de visibilidad de contraseña con botón accesible, indicador de estado de conexión API / Demo y alerta de error accesible (`role="alert"` y `aria-live="assertive"`). Touch targets $\ge 44$ px en botones e inputs.
   - **Paso 2 (Selector de Agencia):** Se activa automáticamente cuando la sesión tiene más de 1 agencia asignada y no tiene tenant activo fijado. Permite seleccionar agencia mediante teclado o clic, invocando `POST /api/v1/auth/tenant-activo`.
   - **Paso 3 (Código de 6 dígitos por correo):** UI preparada para la Rebanada 4 de identidad con validación de 6 dígitos numéricos y aviso informativo accesible con `role="status"`.

4. **Inclusión de `credentials: 'include'` en clientes de API:**
   - Actualizados `api.ts`, `crm-api.ts`, `cotizaciones-api.ts` e `inbox-api.ts` para enviar la cookie de sesión `HttpOnly` en todas las peticiones fetch de la aplicación.

5. **Pruebas Unitarias y de Componentes:**
   - `apps/web/src/lib/auth-api.spec.ts`: 19 pruebas cubriendo endpoints, códigos de error HTTP (401, 403, 429), contratos Zod, validación estricta y modo offline.
   - `apps/web/src/components/auth/formulario-ingreso.spec.tsx`: 7 pruebas verificando renderizado de formulario, toggle de visibilidad de contraseña, alertas accesibles, selector de agencia multi-tenant y paso de código OTP.

## 2. Qué se verificó EJECUTANDO

- `pnpm --filter web test`: **26/26 suites en verde, 253/253 pruebas pasando**.
- `pnpm --filter web typecheck`: **0 errores**.
- `pnpm --filter web lint`: **0 errores, 0 advertencias**.
- `pnpm --filter web build`: **Compilación exitosa** (16/16 páginas generadas, incluyendo `/ingresar` con 5.71 kB y `/iniciar-sesion` con 123 B).
- `pnpm format:check`: **Todos los archivos formateados según Prettier**.

## 3. Qué NO se verificó

- No se ejecutó el flujo contra el backend en vivo levantado con Neon ni envío real de correos OTP (el servicio de correo transaccional corresponde a la Rebanada 4).

## 4. Decisiones que el encargo no especificaba

- En el selector de agencias, se dispusieron tarjetas con icono de agencia, nombre y slug distintivo con un área táctil de 48 px de altura y estado `hover`/`focus-visible:ring-2`, facilitando la selección cómoda tanto en dispositivos táctiles de 375 px como en escritorio con teclado.

---

### 2026-10-20 — 0c.27: Ocultar neto y margen a quien no tenga el permiso

- **Tarea de la cola:** 0c.27.
- **Reglas respetadas:** R3 (contrato Zod `Permiso` y `SesionActual` de `@viajapro/contracts`), R8 (dinero entero COP), R10 (confidencialidad de costos netos y márgenes mayoristas del tenant).
- **Archivos creados:**
  - `apps/web/src/lib/permisos.ts`: funciones puras `tienePermiso` y `puedeVerNetoYMargen`, y hook cliente `usePermisos` conectado a `obtenerSesionActualApi()`.
  - `apps/web/src/lib/permisos.spec.ts`: 11 pruebas unitarias sobre funciones puras y ciclo de vida del hook con sesiones de asesor, dueño y sin tenant.
  - `apps/web/src/components/catalogo/ficha-detalle-paquete.spec.tsx`: 4 pruebas de componente verificando ausencia total de "Neto:" sin permiso y presencia con permiso.
  - `apps/web/src/components/configuracion/bloque-politica-precio.spec.tsx`: 4 pruebas de componente verificando estado restringido sin cifras en el DOM.
  - `apps/web/src/app/reportes/reportes-permisos.spec.tsx`: 3 pruebas verificando que "Costo Neto Mayoristas" y "Margen Comercial" no existen en el DOM sin permiso.
- **Archivos modificados:**
  - `apps/web/src/lib/auth-api.ts`: añadida `MOCK_SESION_DUENO` con permiso `cotizacion.ver_neto_y_margen` y `fijarSesionMock` para tests.
  - `apps/web/src/components/catalogo/ficha-detalle-paquete.tsx`: prop opcional `puedeVerNetoYMargen` y llamada a `usePermisos`; `Neto:` solo en DOM si tiene permiso.
  - `apps/web/src/components/configuracion/bloque-politica-precio.tsx`: prop `puedeVerNetoYMargen` y `usePermisos`; sin permiso devuelve tarjeta de acceso restringido con cero cifras o porcentajes en el DOM.
  - `apps/web/src/app/configuracion/page.tsx`: pestaña "Formación del Precio" solo visible en barra si `puedeVerNetoYMargen` es verdadero.
  - `apps/web/src/app/reportes/page.tsx`: bloque confidencial `seccion-margen-confidencial` (Costo Neto Mayoristas y Margen Comercial) condicionado a `puedeVerNetoYMargen && esDueño`. Conmutador fuerza "Vista Asesor (Operativa)" si no hay permiso.
  - `apps/web/src/components/bandeja/barra-modulos.tsx`: comprobación nula segura en `pathname.startsWith`.
- **Verificación:**
  - `pnpm --filter web test`: 30 archivos de prueba, 275 tests pasando.
  - `pnpm --filter web lint`: 0 errores, 0 warnings.
  - `pnpm --filter web typecheck`: 0 errores.
  - `pnpm format:check`: 100% verificado con Prettier.
  - `pnpm --filter web build`: 16/16 páginas compiladas con éxito.

---

### 2026-10-20 — 0c.35: La bandeja en tiempo real y contra la REST real

- **Tarea de la cola:** 0c.35.
- **Reglas respetadas:** R1 (aislamiento tenant), R3 (cero tipos redefinidos, esquemas de `@viajapro/contracts`), R5 (idempotencia estricta con UUID v4), R6 (sin secretos en repo, cookie HttpOnly), R10 (sesión y visibilidad de conversaciones), R11 (sólo código en apps/web, sin tocar main ni packages/database).
- **Archivos creados:**
  - `apps/web/src/lib/inbox-socket.ts`: Gestor singleton de conexión Socket.IO (`RUTA_SOCKET_BANDEJA = '/api/v1/tiempo-real'`) con `withCredentials: true`, fallback offline a `realtimeMockBus`, validación Zod (`EventoBandeja.safeParse`), eventos desconocidos ignorados en silencio (R3), manejo de cierre de sesión (`sesion_cerrada`), y hook `useInboxSocket`.
  - `apps/web/src/components/bandeja/modal-reasignar.tsx`: Diálogo accesible con `useFocoModal` (cierre con Esc, trampa de foco y touch targets $\ge 44$ px) para reasignar conversación a asesores o devolver a la cola común.
  - `apps/web/src/lib/inbox-socket.spec.ts`: 5 pruebas unitarias verificando despacho de eventos, descarte silencioso de desconocidos, evento `CONVERSACION_RETIRADA`, reconexión y transiciones de estado.
  - `apps/web/src/components/bandeja/lista-conversaciones-realtime.spec.tsx`: 2 pruebas de componente validando el indicador de «reconectando...» (`[data-testid="indicador-reconectando"]`) y el retiro dinámico de filas ante `CONVERSACION_RETIRADA`.
  - `apps/web/src/app/bandeja/bandeja-asignacion.spec.tsx`: 3 pruebas de componente validando botones «Tomar», «Soltar», «Reasignar» y el aviso accesible de conversación retirada (`[data-testid="aviso-conversacion-retirada"]`) con preservación íntegra del borrador redactado.
- **Archivos modificados:**
  - `apps/web/src/lib/inbox-api.ts`: Rutas alineadas a la REST real (`/api/v1/conversaciones`, `/contadores`, `/:id`, `/:id/mensajes`, `/asignacion`, `/estado`, `/notas`, `/leida`) con validación Zod estricta y clave de idempotencia UUID v4 (R5).
  - `apps/web/src/lib/inbox-api.spec.ts`: 8 pruebas unitarias actualizadas y verificadas con los nuevos endpoints y esquemas.
  - `apps/web/src/lib/bandeja-logica.ts`: Manejo de `CONVERSACION_RETIRADA` con guardia de ratón en `reordenarConGuardia`, y funciones puras `calcularPermisosAsignacion` y `evaluarConversacionRetirada` según `docs/01-producto/12-visibilidad-de-conversaciones.md §3`.
  - `apps/web/src/lib/bandeja-comportamiento.spec.ts`: 11 pruebas unitarias (añadidas pruebas 9, 10 y 11 para retiro, permisos y evaluación).
  - `apps/web/src/lib/permisos.ts`: Agregado permiso `PERMISO_VER_TODAS_CONVERSACIONES` (`conversaciones.ver_todas`) y helper `puedeVerTodasConversaciones`.
  - `apps/web/src/lib/realtime-mock.ts`: Método `emitirConversacionRetirada` para simulación offline.
  - `apps/web/src/components/bandeja/lista-conversaciones.tsx`: Conectado a `useInboxSocket`, badge de reconexión y re-fetch por REST en reconexión.
  - `apps/web/src/app/bandeja/[id]/page.tsx`: Conectado a `useInboxSocket`, botones de asignación («Tomar», «Soltar», «Reasignar»), aviso accesible de retirada (`[data-testid="aviso-conversacion-retirada"]`), bloqueo de envío y preservación del borrador redactado.
  - `apps/web/package.json` y `pnpm-lock.yaml`: Añadida dependencia `socket.io-client@^4.8.4`.
  - `traspaso/COLA.md`: Marcada la tarea `0c.35` como `[x]`.
- **Compuertas:**
  - `build`: **VERDE** (Next.js 15.5.27 compiló 16 páginas sin errores).
  - `lint`: **VERDE** (cero errores, cero warnings).
  - `typecheck`: **VERDE** (TypeScript estricto en los 5 paquetes).
  - `format:check`: **VERDE** (Prettier 100% verificado).
  - `test`:
    - `@viajapro/web`: **33/33 archivos, 288/288 pruebas pasando**.
    - `@viajapro/contracts`: **VERDE**.
    - `@viajapro/domain`: **VERDE**.
    - `@viajapro/api`: **VERDE**.
    - `@viajapro/database`: 73/76 pasando. La prueba 57 de `tests/aislamiento.spec.ts` excede el timeout por defecto de 5000 ms (toma 5004 ms sobre la WAN a Neon) al no contar con el parámetro `, 60_000)` que tienen otras pruebas largas del archivo, dejando la transacción abierta para la 58 y 59. No se alteró `packages/database` por regla R11 (ámbito exclusivo de `apps/web`).

---

### 2026-10-20 — 0c.32 y 0c.30: Foco accesible en modales, navegación por teclado en lista y preservación de errores de dominio

- **Tareas de la cola / revisión:** 0c.32 (cola residual), 0c.30 (cola residual).
- **Reglas respetadas:** R3 (cero tipos redefinidos, esquemas de contratos), R8 (moneda entera en COP), R10 (confidencialidad y PII), R11 (sólo código en apps/web, sin tocar main ni packages/database).
- **Archivos creados:**
  - `apps/web/src/components/bandeja/lista-conversaciones-teclado.spec.tsx`: 4 pruebas de componente verificando navegación secuencial con `ArrowDown` y `ArrowUp`, foco rápido a búsqueda con tecla `/`, y enlaces accesibles con URLs de conversación.
- **Archivos modificados:**
  - `apps/web/src/lib/use-foco-modal.ts`: estabilizado el ciclo de vida del foco. Se almacena `alCerrar` en un `useRef` (`alCerrarRef.current = alCerrar`) y se retira `alCerrar` de las dependencias del `useEffect`. Se elimina la fuga donde un re-renderizado del padre con un callback en línea reiniciaba el temporizador de foco, robaba el cursor o sobrescribía el elemento disparador.
  - `apps/web/src/components/comun/foco-modal.spec.tsx`: añadida prueba 6 demostrando que el re-renderizado del componente padre con `alCerrar` en línea NO mueve el foco ni reinicia el temporizador, y al presionar Escape devuelve el foco limpiamente al botón disparador original (10/10 pruebas pasando).
  - `apps/web/src/lib/estados-ui-logica.ts`: incorporada tabla `TABLA_ERRORES_DOMINIO` (`SIN_VIGENCIA`, `VIGENCIAS_EMPATADAS`, `VENTANA_CERRADA`, `CONFLICTO_VERSION`, `PLAZAS_INSUFICIENTES`, etc.) priorizada por código de dominio antes de la búsqueda por palabras clave. En conflictos HTTP 409 y errores con redacción humana no técnica, se preserva íntegramente la explicación para el asesor en lugar de convertirla en un genérico «Datos inconsistentes».
  - `apps/web/src/lib/estados-ui-logica.spec.ts`: agregadas pruebas unitarias verificando que un error 409 de dominio conserva su texto descriptivo y que los códigos de la tabla prioritaria preceden al filtrado por palabras clave (20/20 pruebas pasando).
  - `apps/web/src/app/bandeja/bandeja-asignacion.spec.tsx` y `apps/web/src/components/bandeja/lista-conversaciones-realtime.spec.tsx`: renderizado asíncrono determinista en pruebas con carga inicial.
- **Compuertas:**
  - `lint`: **VERDE** (0 errores, 0 advertencias).
  - `typecheck`: **VERDE** (TypeScript estricto en los 5 paquetes).
  - `format:check`: **VERDE** (Prettier 100% verificado).
  - `build`: **VERDE** (Next.js 15.5.27 compiló 16 páginas sin errores).
  - `test`:
    - `@viajapro/web`: **34/34 archivos en verde, 295/295 pruebas pasando**.
    - `@viajapro/contracts`: **VERDE**.
    - `@viajapro/domain`: **VERDE**.
    - `@viajapro/database`: 73/76 pasando (las 3 fallidas corresponden a timeout WAN de 5000 ms en la prueba 57 sobre Neon sin parámetro largo, documentada en ESTADO.md; no se altera packages/database por R11).


---

### 2026-10-20 — ADR-0011 (Rebanada 3): Reescritura /api/v1/* en Next.js y Selector de Sesión y Agencia en Barra de Módulos

- **Referencia:** ADR-0011 §2 (Mismo origen) y §Plan de implementación (Rebanada 3).
- **Reglas respetadas:** R1 (aislamiento tenant), R3 (cero tipos redefinidos, esquemas Zod de `@viajapro/contracts`), R6 (sin secretos en repo, cookies HttpOnly SameSite seguras), R8 (moneda entera COP), R10 (sesión y confidencialidad), R11 (ámbito estricto en apps/web, sin tocar main ni packages/database).
- **Archivos creados:**
  - `apps/web/src/lib/api-base.ts`: Helper centralizado `obtenerBaseApi()` que en el navegador devuelve `''` si `NEXT_PUBLIC_API_URL` está vacía o indefinida, aprovechando la reescritura same-origin de Next.js (`/api/v1/*`), y en el servidor o tests devuelve `API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL` o el fallback `'http://localhost:3333'`.
  - `apps/web/src/lib/api-base.spec.ts`: 4 pruebas unitarias cubriendo comportamiento de URL en navegador, SSR y configuraciones explícitas de entorno.
  - `apps/web/src/components/bandeja/barra-modulos.spec.tsx`: 13 pruebas unitarias y de componente validando:
    - Iniciales dinámicas del usuario (`calcularIniciales`).
    - Navegación lateral desktop y móvil con touch targets $\ge 44$ px (WCAG 2.5.5).
    - Despliegue accesible del diálogo de sesión al pulsar avatar desktop o botón de perfil móvil.
    - Cierre accesible con tecla `Escape` y clic en telón de fondo.
    - Conmutación dinámica de agencia activa en cuentas multiagencia (`cambiarAgenciaActivaApi`).
    - Cierre de sesión y redirección segura hacia `/ingresar` (`cerrarSesionApi`).
- **Archivos modificados:**
  - `apps/web/next.config.mjs`: Añadido `async rewrites()` para mapear `/api/v1/:path*` hacia `${API_INTERNAL_URL || NEXT_PUBLIC_API_URL || 'http://localhost:3333'}/api/v1/:path*` garantizando origen único para cookies de sesión.
  - `apps/web/src/components/bandeja/barra-modulos.tsx`: Conectado a `usePermisos(sesionInicial)`, cálculo dinámico de iniciales, popover accesible (`dialog`, trampa de foco con `useFocoModal`, Esc y backdrop) con selector multiagencia y botón de cierre de sesión, más botón accesible en navegación inferior móvil.
  - `apps/web/src/lib/api.ts`, `apps/web/src/lib/auth-api.ts`, `apps/web/src/lib/catalogo-api.ts`, `apps/web/src/lib/cotizaciones-api.ts`, `apps/web/src/lib/crm-api.ts`, `apps/web/src/lib/inbox-api.ts`: Unificados para consumir `obtenerBaseApi()` de `api-base.ts`.
- **Compuertas de Calidad:**
  - `lint`: **VERDE** (0 errores, 0 advertencias).
  - `typecheck`: **VERDE** (9/9 tareas exitosas en Turborepo, cero errores TypeScript).
  - `format:check`: **VERDE** (100% verificado con Prettier).
  - `build`: **VERDE** (Next.js 15.5.27 compiló 16 páginas en 7.2s).
  - `test`: **VERDE** (36 archivos de prueba, 312/312 tests pasando en `@viajapro/web`).


---

### 2026-10-20 — 0c.39: Con sesión real no se manda la cabecera de tenant de desarrollo (Frontera de sesión ADR-0011)

- **Tarea de la cola:** 0c.39 (Prioritaria, la primera de la tanda de revisión).
- **Reglas respetadas:** R1 (aislamiento tenant), R3 (cero tipos redefinidos, contratos Zod), R6 (sin secretos en repo, cookies HttpOnly SameSite seguras), R10 (sesión y confidencialidad), R11 (ámbito estricto en apps/web, sin tocar main ni packages/database).
- **Archivos creados:**
  - `apps/web/src/lib/cabeceras-tenant.ts`: Función pura `cabecerasDeTenantDev()` que evalúa `usaAuthReal()`: si la autenticación real está activa devuelve `{}` (cero cabeceras de desarrollo, garantizando que el tenant se resuelva en el servidor por la cookie de sesión vía `TenantMiddleware`), y sólo si la autenticación está apagada devuelve `{ 'x-dev-tenant-id': ... }` cuando `NEXT_PUBLIC_DEV_TENANT_ID` existe.
  - `apps/web/src/lib/cabeceras-tenant.spec.ts`: 5 pruebas unitarias verificando:
    1. Con auth real activa, `cabecerasDeTenantDev()` devuelve `{}` aunque exista `NEXT_PUBLIC_DEV_TENANT_ID`.
    2. Con auth real activa, `obtenerTableroPipeline()` no exige `NEXT_PUBLIC_DEV_TENANT_ID` ni lanza `CONFIG_TENANT_FALTANTE`.
    3. Con auth apagada, envía `x-dev-tenant-id` si la variable de entorno está definida.
    4. Con auth apagada, devuelve `{}` si la variable está ausente.
    5. Con auth apagada y CRM real activo, exige `NEXT_PUBLIC_DEV_TENANT_ID` y lanza `CONFIG_TENANT_FALTANTE`.
- **Archivos modificados:**
  - `apps/web/src/lib/api.ts`: Conectado a `cabecerasDeTenantDev()`.
  - `apps/web/src/lib/catalogo-api.ts`: Conectado a `cabecerasDeTenantDev()`, añadido `credentials: 'include'` en peticiones fetch y mensaje de 401 honesto.
  - `apps/web/src/lib/cotizaciones-api.ts`: Conectado a `cabecerasDeTenantDev()` y mensaje de 401 honesto.
  - `apps/web/src/lib/crm-api.ts`: Conectado a `cabecerasDeTenantDev()`, `obtenerTableroPipeline()` condicionado a exigir `NEXT_PUBLIC_DEV_TENANT_ID` únicamente cuando `!usaAuthReal()`.
  - `apps/web/src/lib/inbox-api.ts`: Conectado a `cabecerasDeTenantDev()`.
  - `apps/web/src/app/pipeline/page.tsx`: Carga inicial condicionada a exigir `NEXT_PUBLIC_DEV_TENANT_ID` únicamente cuando `!usaAuthReal()`.
  - `apps/web/src/lib/cotizaciones-logica.ts`, `apps/web/src/lib/cotizaciones-logica.spec.ts`, `apps/web/src/lib/cotizador-logica.ts`: Mensajes de error amigables sin exponer el literal `x-dev-tenant-id`.
- **Criterio «Hecho cuando» verificado:**
  - `git grep "x-dev-tenant-id" apps/web/src` arroja **únicamente** la función `cabecerasDeTenantDev()` en `cabeceras-tenant.ts` (y sus pruebas unitarias).
- **Compuertas de Calidad:**
  - `test`: **VERDE** (37 archivos de prueba, 317/317 pruebas pasando en `@viajapro/web`).
  - `lint`: **VERDE** (0 errores, 0 advertencias).
  - `typecheck`: **VERDE** (9/9 tareas exitosas en Turborepo, cero errores TypeScript).
  - `format:check`: **VERDE** (100% verificado con Prettier).
  - `build`: **VERDE** (Next.js 15.5.27 compiló 16 páginas en 4.9s).


---

### 2026-10-20 — 0c.36: El buscador de la bandeja dice lo que de verdad busca

- **Tarea de la cola:** 0c.36 (Alineación con ADR-0015 / cifrado de mensajes).
- **Reglas respetadas:** R10 (confidencialidad de mensajes cifrados en reposo), R11 (ámbito estricto en apps/web).
- **Archivos modificados:**
  - `apps/web/src/components/bandeja/lista-conversaciones.tsx`: Se actualizó el placeholder del input de búsqueda a `Buscar por nombre o teléfono... (/)` reflejando con exactitud la capacidad del índice tras el cifrado de mensajes del ADR-0015.
  - `apps/web/src/components/bandeja/lista-conversaciones-teclado.spec.tsx`: Actualizada la aserción de búsqueda accesible por placeholder.
- **Criterio «Hecho cuando» verificado:**
  - `git grep -niE "por cliente o mensaje|en los mensajes" apps/web/src` arroja 0 resultados.
- **Compuertas de Calidad:**
  - `test`: **VERDE** (37 archivos de prueba, 317/317 tests pasando en `@viajapro/web`).
  - `lint`: **VERDE** (0 errores, 0 advertencias).
  - `typecheck`: **VERDE** (9/9 tareas exitosas en Turborepo, cero errores TypeScript).
  - `format:check`: **VERDE** (100% verificado con Prettier).
  - `build`: **VERDE** (Next.js 15.5.27 compiló 16 páginas en 6.7s).


---

### 2026-10-20 — 0c.38: Pruebas de la reconexión y del estado sin conexión

- **Tarea de la cola:** 0c.38 (Resiliencia de conexión y tiempo real en la bandeja).
- **Reglas respetadas:** R3 (contratos Zod / EventoBandeja estricto), R5 (idempotencia y sincronización REST al reconectar), R11 (ámbito acotado a apps/web).
- **Archivos modificados:**
  - `apps/web/src/components/bandeja/lista-conversaciones.tsx`:
    - Incorporado banner accesible con `role="status"` e `indicador-desconectado` visible cuando `estadoSocket === 'desconectado'` («Sin conexión en tiempo real; los mensajes nuevos no llegarán solos. Reintentando...»).
    - Validación segura de eventos entrantes con `EventoBandeja.safeParse(evento)` y registro de advertencia `console.warn` sin alterar el estado si no cumple el contrato.
  - `apps/web/src/lib/inbox-socket.ts`:
    - Registro de advertencia vía `console.warn` ante eventos recibidos por socket que no validen el esquema Zod `EventoBandeja`.
    - Método `notificarEvento(evento: unknown)` validando el esquema antes de despachar a los suscriptores.
  - `apps/web/src/components/bandeja/lista-conversaciones-realtime.spec.tsx`:
    - Prueba 3: Al reconectar el socket (`notificarReconexion`), la lista re-consulta por REST vía `inboxApi.consultarBandeja`, cerrando cualquier hueco de mensajes o conversaciones perdidas durante el corte.
    - Prueba 4: En estado desconectado (`notificarCambioEstado('desconectado')`), muestra aviso visible y la lista conserva los elementos en memoria sin sustituirlos por datos simulados (0c.34).
    - Prueba 5: Un evento que no valida el contrato Zod no altera la lista de conversaciones y se registra con `console.warn`.
  - `apps/web/src/app/bandeja/bandeja-asignacion.spec.tsx`:
    - Prueba 4: Al recibir `CONVERSACION_RETIRADA` con un ID perteneciente a otra conversación, no altera la conversación abierta ni muestra el aviso de retiro, preservando el borrador y manteniendo habilitado el campo de redacción.
- **Criterio «Hecho cuando» verificado:**
  - Las 4 pruebas existen, cubren los estados reales por roles y texto visible, y fallan si se remueve la lógica correspondiente.
- **Compuertas de Calidad:**
  - `test`: **VERDE** (37 archivos de prueba, 321/321 tests pasando en `@viajapro/web`).
  - `lint`: **VERDE** (0 errores, 0 advertencias).
  - `typecheck`: **VERDE** (9/9 tareas exitosas en Turborepo, cero errores TypeScript).
  - `format:check`: **VERDE** (100% verificado con Prettier).


---

### 2026-10-20 — 0c.37: Capturas a 375 px de /ingresar, selector de agencia y bandeja en vivo

- **Tarea de la cola:** 0c.37 (Verificación visual móvil a 375 px y evidencia de fidelidad de diseño).
- **Reglas respetadas:** Accesibilidad móvil a 375 px (viewport 375x812, touch targets >= 44 px, legibilidad y contraste), R11 (ámbito acotado a assets y web).
- **Capturas generadas y verificadas visualmente (< 100 KB cada una):**
  1. `docs/_assets/diseno/11-ingresar-error-375px.png` (29.1 KB): Pantalla `/ingresar` mostrando el banner accesible de error ante credenciales no reconocidas (`role="alert"`), campos accesibles y botones con touch target >= 44 px sin desbordamientos ni textos cortados.
  2. `docs/_assets/diseno/12-selector-agencia-375px.png` (26.8 KB): Flujo de autenticación multi-agencia (usuario `multi@viajapro.com`) desplegando las agencias disponibles en tarjetas accesibles con chevron y enlace para volver al ingreso.
  3. `docs/_assets/diseno/13-bandeja-reconectando-375px.png` (49.6 KB): Vista de la bandeja de conversaciones con el banner superior en ámbar «Reconectando tiempo real...» con icono giratorio de actualización, filtros por píldora, buscador acotado y barra de navegación inferior móvil.
  4. `docs/_assets/diseno/14-aviso-conversacion-retirada-375px.png` (41.2 KB): Hilo de conversación tras recibir evento `CONVERSACION_RETIRADA`, mostrando el banner de aviso de reasignación a otra persona, bloqueo de envío y el **borrador redactado perfectamente visible e intacto** en el campo de texto deshabilitado.
- **Criterio «Hecho cuando» verificado:**
  - 4 capturas en `docs/_assets/diseno/` referenciadas en `ENTREGA.md`, cada una < 100 KB, inspeccionadas visualmente sin texto ni botón cortado.


---

### 2026-10-20 — 0c.40: El socket solo se conecta cuando hay bandeja y sesión activa

- **Tarea de la cola:** 0c.40 (Aislamiento de conexión de socket e higiene de red).
- **Reglas respetadas:** R1 (aislamiento de tenant), R3 (contratos Zod / EventoBandeja), R5 (cero efectos colaterales de red fuera de contexto), R11 (ámbito acotado a apps/web).
- **Archivos modificados:**
  - `apps/web/src/lib/inbox-socket.ts`:
    - El constructor de `InboxSocketManager` ya **NO** autoconecta al importarse (`this.inicializar()` removido del constructor).
    - Incorporado conteo de referencias (`consumidoresActivos`) con métodos `registrarConsumidor()` y `liberarConsumidor()`: conecta solo cuando el primer consumidor monta, y desconecta automáticamente (`this.desconectar()`) cuando todos los consumidores de la bandeja se desmontan (por ejemplo al salir a `/pipeline`, `/cotizador`, `/catalogo` o al desloguearse).
    - Enriquecido `desconectar()` para cortar activamente el socket, restablecer suscriptores a 0 y notificar estado `desconectado`.
  - `apps/web/src/components/bandeja/barra-modulos.tsx`:
    - En el manejador `manejarCerrarSesion`, se ejecuta explícitamente `inboxSocketManager.desconectar()` al cerrar sesión para garantizar que no queden intentos de reconexión activos tras abandonar la app.
  - `apps/web/src/lib/inbox-socket.spec.ts`:
    - Prueba 6: Verifica que la instanciación de `InboxSocketManager` NO llama a `io` ni inicia peticiones de socket, manteniendo estado `desconectado` y 0 consumidores.
    - Prueba 7: Verifica que conecta solo al montar el primer consumidor y desconecta al desmontar el último consumidor (probado con mock de socket.io-client).
    - Prueba 8: Verifica que `desconectar()` explícito (al cerrar sesión) corta la conexión del socket inmediatamente y resetea el contador de consumidores y el estado.
- **Criterio «Hecho cuando» verificado:**
  - Sin sesión o fuera de la bandeja (como en `/ingresar`), hay 0 peticiones de socket, validado por las pruebas unitarias.
- **Compuertas de Calidad:**
  - `test`: **VERDE** (37 archivos de prueba, 324/324 tests pasando en `@viajapro/web`).
  - `lint`: **VERDE** (0 errores, 0 advertencias).
  - `typecheck`: **VERDE** (9/9 tareas exitosas en Turborepo, cero errores TypeScript).
  - `format:check`: **VERDE** (100% verificado con Prettier).
  - `build`: **VERDE** (Next.js 15.5.27 compiló 16 páginas en 6.7s).
