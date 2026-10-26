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

# Entrega — Bloque 2: Cotizador y Catálogo para Excursiones de un Día y Estados de UI — 2026-10-26

## Identificación
- **Rama:** `feat/web-cotizador-excursiones-dia` (empujada a `origin/feat/web-cotizador-excursiones-dia`)
- **Stitch Design Screen ID:** `e2bb94d1dd524750941d0c5643ce2acd` (Proyecto «ViajaPro — CRM para agencias de turismo», ID `8333038101997719867`, pantalla *Cotizador y Catálogo de Pasadías — ViajaPro CRM*)

## Qué construí

1. **Soporte y catálogo representativo para excursiones de un día (pasadías):**
   - Agregadas al catálogo de demostración (`apps/web/src/lib/mock-catalogo.ts`) 3 excursiones de 1 día (`noches: 0, dias: 1`) basadas en la agencia piloto real (JD Tours Cartagena: Pasadía Islas del Rosario & Barú VIP, Tour 5 Islas VIP con Snorkel y Plancton, Pasadía Mambo Beach Club Barú).
   - Precios íntegramente en COP en enteros (sin centavos ni coma flotante, R8), en el rango de 210.000 a 380.000 COP, con unidades mínimas y código `ISO-4217` COP.
   - Posicionados al final del array para preservar índices e integridad de pruebas previas.

2. **Detección y aviso obligatorio de «Impuesto de muelle no incluido»:**
   - Función pura `requiereAvisoImpuestoMuelle(destino, paqueteNombre)` en `apps/web/src/lib/cotizador-logica.ts` para identificar destinos insulares y tours náuticos (Cartagena, Islas del Rosario, Barú, Cholón, Tierra Bomba, lanchas/botes).
   - Aviso visual destacado con banner ámbar `data-testid="aviso-impuesto-muelle"` en el desglose de cotización de salidas (`apps/web/src/components/cotizador/desglose-cotizacion-salida.tsx`) y en la vista de cotización simulada (`apps/web/src/app/cotizador/page.tsx`).
   - Inclusión automática del aviso en los textos formateados para WhatsApp (`generarTextoPropuestaWhatsApp` y `generarTextoPropuestaWhatsAppSalida`): *«⚠️ Aviso importante: Impuesto de muelle no incluido (tasa portuaria requerida al abordar en taquilla del muelle, no incluida en el valor del tour)»*.

3. **Lógica de cálculo sin plazas desaprovechadas para pasadías:**
   - En `calcularCotizacionMock`: cuando `paquete.noches === 0` (excursión de 1 día), `plazasSinUsar` se fija en 0, ya que las excursiones no requieren asignación de habitaciones ni penalizan cupos de camas.

4. **Componentes y estados de UI en el Cotizador (`/cotizador`):**
   - **Estado vacío (`data-testid="cotizador-estado-vacio"`):** Si una agencia conectada a la API real no tiene salidas ni excursiones registradas, la pantalla no queda en blanco ni se rompe; muestra un estado vacío comprensivo con orientación y acciones claras:
     - Botón para activar el modo demostración y ver excursiones de muestra.
     - Botón directo para ir a la gestión de catálogo (`/catalogo`).
     - Botón de reintento de conexión.
   - **Estado cargando (`cargandoSalidas`):** Indicador visual accesible de carga mientras se consultan las salidas de la agencia.
   - **Píldora de pasadía:** Distintivo azul accesible `Excursión de 1 día (Pasadía)` cuando `noches === 0`.
   - **Badge de promo vigente (`data-testid="badge-promo-vigente"`):** Indicador cuando aplican tarifas promocionales o descuentos por grupo.
   - **Adaptación móvil a 375 px:** Espaciados densos, botones y campos con touch targets ≥ 44 px, formulario verticalizado responsive y desgloses legibles sin desbordamiento horizontal.

5. **Suites de pruebas completas:**
   - `apps/web/src/lib/cotizador-logica.spec.ts`: 13/13 pruebas pasando (incluye detección de impuesto de muelle, propuesta WhatsApp y pasadías sin plazas desaprovechadas).
   - `apps/web/src/components/cotizador/desglose-cotizacion-salida.spec.tsx` (nueva): 5/5 pruebas pasando (badge pasadía, banner aviso muelle, badge promo vigente, touch targets).
   - `apps/web/src/app/cotizador/page.spec.tsx` (nueva): 4/4 pruebas pasando (estado vacío sin salidas en API, activación de demo con 1 clic, visualización de impuesto de muelle en tour náutico, cálculo reactivo de pasajeros).

## Qué verifiqué ejecutando

- **Pruebas unitarias de la web:** `pnpm --filter @viajapro/web test` → **42 archivos de prueba pasados, 354/354 tests en verde (100%)**.
- **Typecheck estricto:** `pnpm --filter @viajapro/web typecheck` → **0 errores** TypeScript.
- **Linter:** `pnpm --filter @viajapro/web lint` → **0 errores, 0 advertencias**.
- **Prettier:** `pnpm exec prettier --write ...` → **100% formateado**.
- **Compilación de producción:** `pnpm turbo run build --filter=@viajapro/web...` → **16/16 páginas estáticas y dinámicas compiladas con éxito** en Next.js 15.5.27.

## Qué NO verifiqué

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
