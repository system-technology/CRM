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
