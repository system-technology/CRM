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
