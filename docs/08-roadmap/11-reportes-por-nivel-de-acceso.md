# Reportes por nivel de acceso: qué ve cada uno, qué va en «Hoy» y cómo se ve en el celular

| | |
|---|---|
| Fecha | 2026-11-21 |
| Autor | `analista-datos` (T-339, F0 del Eje F) |
| Base verificada | `main` en `912f412`. Solo lectura de código y documentos: no se ejecutó base ni servicios |
| Decide | Lo que aquí es **propuesta** lo cierran el ADR de T-340 (`arquitecto`, `auditor-seguridad`) y las respuestas del dueño de JD Tours ([roadmap JD Tours §4](08-roadmap-jd-tours-reservas-cobros-y-navegacion.md#4-preguntas-abiertas-para-el-dueño-antes-de-t-327-t-323-y-t-334)) |
| Se apoya en | [`06-roadmap-de-reportes.md`](06-roadmap-de-reportes.md) (R1 a R12, T-131 a T-151), [ADR-0034](../03-adr/0034-pagos-del-viajero-mvp-de-registro-manual.md) (cobros), [`04-flujos-criticos.md`](../01-producto/04-flujos-criticos.md) (Flujo 2 y D3), [`03-personas.md`](../00-vision/03-personas.md) |
| Estado vivo | `ESTADO.md` y `roadmap/tasks.yaml` mandan sobre este documento |

Convención: **[V]** = verificado en el código o en un documento (con su ruta); **[S]** = supuesto sin
verificar. Los nombres siguen el [lenguaje ubicuo](../01-producto/02-lenguaje-ubicuo.md).

## 1. Propósito y qué decidió el propietario

El 2026-11-20 el propietario decidió que los reportes se manejan **por niveles de acceso**: el asesor ve
lo pertinente a su operación en un dashboard propio; el administrador tiene todo el abanico, con
consultas, filtros y exportación; los dos se diseñan **móvil primero**. Esa decisión reemplaza D3 de
`04-flujos-criticos.md` («la asesora no ve Reportes»). El detalle está en el
[Eje F](08-roadmap-jd-tours-reservas-cobros-y-navegacion.md#eje-f--reportes-por-niveles-de-acceso-asesor-y-administración);
aquí no se repite.

Más tarde el propietario aclaró que el CRM se usa desde **celular, tablet y escritorio**. Por eso este
documento verifica tres anchos: **390 px**, **~768 px** y **≥ 1280 px**.

Este documento responde tres cosas, y nada más:

1. Qué reporte ve cada nivel: **lo suyo** (alcance propio) frente a **agencia y equipo**.
2. Qué va en «Hoy» (lo accionable del día) y qué va en Reportes (lo analítico).
3. Qué se ve en cada ancho sin desplazamiento lateral.

**No** diseña cómo se impone el alcance; eso es T-340 (§7).

## 2. Qué existe hoy (verificado en `912f412`)

### 2.1 API

| Pieza | Qué hay | Ruta |
|---|---|---|
| Endpoint de reportes | **Uno solo:** `GET /api/v1/reportes/resumen?desde=&hasta=` (instantes UTC, máximo 366 días) | `apps/api/src/modules/analytics/interface/reportes.controller.ts` [V] |
| Qué devuelve | Cotizaciones creadas, enviadas y aceptadas, con su tasa (más `aceptadasSinFecha`); `ventasPorMoneda` sin mezclar monedas; oportunidades **creadas en el rango** según su etapa de hoy, con ganadas, perdidas y conversión; respuesta: conversaciones nuevas y respondidas, promedio, mediana, p90 y `sinResponder` | `apps/api/src/modules/analytics/domain/resumen.ts` [V] |
| Neto y margen | Solo con `cotizacion.ver_neto_y_margen`. Sin el permiso, `quoting` ni los calcula y las claves no existen en el JSON | `apps/api/src/modules/analytics/application/obtener-resumen.use-case.ts` [V] |
| **Alcance** | **Ninguno.** El controlador no lleva `@RequierePermiso` y los puertos reciben solo `tenantId` y rango: **cualquier miembro lee el resumen de toda la agencia**. No hay dimensión por asesor | `apps/api/src/shared/puertos/puertos-de-reportes.ts` [V] |
| Seguimientos de «Hoy» | `GET /api/v1/crm/seguimientos/pendientes-del-dia` (vencidos y de hoy, en la zona de la agencia). Por defecto devuelve los del usuario de la sesión, **pero acepta `?asesorId=` de cualquier usuario sin comprobar ningún permiso** | `apps/api/src/modules/crm/interface/crm.controller.ts` L222-231 [V] |
| Contadores de la bandeja | `GET /conversaciones/contadores`: respetan la regla de visibilidad de conversaciones (asignadas y cola común, o todas con `conversaciones.ver_todas`) | `apps/api/src/modules/inbox/infrastructure/conversaciones.prisma.ts` L237 y `apps/api/src/shared/autorizacion/visibilidad-de-conversaciones.ts` [V] |
| Archivos de viaje | `GET /archivos` con `archivo.ver`: **toda la agencia**. Solo filtra por estado (`ABIERTO`, `CANCELADO`, `TODOS`) | `packages/contracts/src/archivos.ts` L178 [V] |
| Avisos de plazos | La campana avisa *time limits* y pagos al mayorista (`notifications`, con `archivo.ver`) | `apps/api/src/modules/notifications/application/notificaciones-del-usuario.use-case.ts` [V] |

### 2.2 Datos que ya se capturan (fuente de los reportes)

| Dato | Estado | Evidencia |
|---|---|---|
| Historial de etapas de la oportunidad, con el **asesor en ese momento**, y `cerrada_en` | **Existe y se escribe** | Migración `20261104150000_historial_de_etapas_de_oportunidad`; `apps/api/src/modules/crm/infrastructure/historial-de-etapas.prisma.ts` [V] |
| Historial de estados de la cotización (instante de aceptación) | **Existe y se escribe** | Migración `20261104160000_historial_de_estados_de_cotizacion`; lo lee `apps/api/src/modules/quoting/infrastructure/cotizaciones-para-reportes.prisma.ts` [V] |
| Historial de estados de la reserva | Existe | Migración `20261118120000_historial_de_estados_de_reserva` [V] |
| Archivo de viaje con fecha de salida, pasajeros por tipo, destino, venta y moneda congelados | Existe (`travel_files`) | `packages/database/prisma/schema.prisma`, modelo `TravelFile` [V] |
| Reservas con mayorista (id y **nombre congelado**), `time_limit` y `pago_total_vence_en` | Existe (`bookings`) | Modelo `Booking` [V] |
| Libro de cobro: `pagos`, `plazos_de_cobro`, `parametros_de_cobro` | **Tablas sí; API no.** No hay módulo `payments` ni rutas: T-330 está en `backlog` | Migración `20261121140000_pagos_del_viajero_libro_de_cobro`; `ls apps/api/src/modules` [V] |
| Origen del lead | **No existe** (ni columna ni `referral`) | `grep origen` en el esquema [V]; T-133 y T-134 |
| **Asesor del archivo de viaje** | **No hay columna.** Solo `travel_files.creado_por`, `cotizacion_id` (obligatorio, y de ahí `cotizaciones.creado_por`) y `oportunidad_id` (opcional, y de ahí `oportunidades.asesor_id`) | Modelo `TravelFile` [V] |

> **Desfase en la cola [V]:** T-131 y T-132 figuran en `backlog` en `roadmap/tasks.yaml`, pero sus
> tablas y escritores ya están en `main` (ver la tabla anterior). Lo reconcilia el `dueno-de-producto`;
> este documento no toca `tasks.yaml`.

### 2.3 Web

| Pantalla | Qué muestra hoy | Ruta |
|---|---|---|
| «Hoy» (`/`) | Saludo y agencia; cuatro tarjetas: **conversaciones pendientes** (contadores de la bandeja), **oportunidades por etapa** (tablero), **cotizaciones por vencer** (calculada **en la web** sobre las 20 cotizaciones más recientes) y **catálogo**; bloque de seguimientos vencidos y de hoy, con «completar»; accesos rápidos. Rejilla de 1, 2 y 4 columnas (`sm:`, `lg:`) | `apps/web/src/app/(app)/page.tsx` [V] |
| Reportes (`/reportes`) | Consume el resumen. Cuatro periodos (últimos 30 días, este mes, trimestre, año) en la zona de la agencia; tarjetas de ventas por moneda, cotizaciones, oportunidades y respuesta; embudo del periodo; sección de margen con permiso; botón Imprimir. **El conmutador «Vista Dueño / Vista Asesor» solo oculta la sección de margen: las cifras son las de toda la agencia en las dos vistas.** Sin exportación | `apps/web/src/app/(app)/reportes/page.tsx` [V] |
| Menú | «Reportes» sin permiso (visible para todos), en la hoja «Más» en móvil; «Hoy» en la barra inferior | `apps/web/src/lib/navegacion.ts` [V] |
| Marco y anchos | Barra inferior (56 px) y cabecera móvil (44 px) **por debajo de 768 px** (`md:hidden`); desde 768 px aparece el menú lateral, de 56 px plegado o 240 px desplegado | `apps/web/src/components/comun/barra-inferior-movil.tsx`, `apps/web/src/components/bandeja/barra-modulos.tsx` L439-440 [V] |
| Exportar CSV | Contactos, oportunidades y cotizaciones, generados **en el navegador**: formato es-CO (`;`, UTF-8 con BOM), con escapado contra inyección de fórmulas y neto o margen solo con permiso. **Al generarse en el cliente, el servidor no registra la exportación** | `apps/web/src/lib/exportar-csv.ts` [V] |

### 2.4 Permisos que importan aquí [V]

Están en `packages/contracts/src/identidad.ts` y su siembra en `packages/database/prisma/siembra-de-tenant.ts`:

| Permiso | DUENO | ASESOR | OPERACIONES | Relevancia |
|---|---|---|---|---|
| `cotizacion.ver_neto_y_margen` | sí | no | no | Neto y margen en cualquier reporte |
| `conversaciones.ver_todas` | sí | no | sí | Hoy es el único criterio de «equipo» que existe (06-roadmap §2, regla 7) |
| `archivo.ver` | sí | sí | sí | Archivos de **toda** la agencia |
| `cobro.ver` | sí | sí | sí | Cobros de **toda** la agencia. ADR-0034 §6: «que el asesor vea solo lo suyo es T-339» |
| `cobro.registrar` / `cobro.corregir` | sí / sí | sí / no | no / no | Quién registra y quién compensa |
| Permiso de reportes | — | — | — | **No existe.** T-141 proponía `reportes.ver_equipo`; lo absorbe T-341 tras el ADR T-340 |

### 2.5 Lo que falta, en una línea

Hoy no hay ningún reporte con alcance propio. El asesor que abre Reportes ve las cifras de toda la
agencia, `cobro.ver` le muestra los cobros de todos y `pendientes-del-dia` deja pedir los seguimientos
de otro. Faltan los endpoints de pendientes (T-138), de cotizaciones abiertas (T-139), las dimensiones
por asesor, destino y mayorista (T-140), la API de cobros (T-330) y cualquier exportación de reportes.

## 3. Catálogo de reportes por nivel

### 3.1 Qué es «lo suyo» (propuesta para que T-340 la cierre)

«Lo suyo» depende del objeto, y para el archivo de viaje **hoy no hay dato que lo diga**:

| Objeto | «Suyo» = | Estado |
|---|---|---|
| Conversación | `conversaciones.asignado_a_id` = el usuario. La cola sin asignar se muestra **aparte**, porque ya la ve en la bandeja | [V] la regla existe en `visibilidad-de-conversaciones.ts` |
| Seguimiento | `seguimientos.asesor_id` = el usuario | [V] columna existente |
| Oportunidad | `oportunidades.asesor_id` = el usuario (el asesor **actual**) | [V] columna existente |
| Cotización | `cotizaciones.creado_por` = el usuario | [V] columna existente |
| Venta atribuida | `oportunidad_cambios_etapa.asesor_id` al pasar a ganada; si no hay oportunidad, `cotizaciones.creado_por` | [V] columnas existentes; la regla es [S] |
| **Archivo de viaje y su cobro** | **Sin decidir.** Candidatos: `cotizaciones.creado_por` (siempre existe), `oportunidades.asesor_id` (puede faltar; cambia al reasignar) o `travel_files.creado_por` | [S] Lo decide T-340 con la pregunta 6 al dueño (§4 del roadmap). Sin esta decisión no hay «mis cobros» |

### 3.2 Catálogo

**Asesor (propio):** solo lo suyo según §3.1, **nunca neto ni margen**, aunque su rol tuviera
`cotizacion.ver_neto_y_margen`. Quien tiene el permiso lo ve en el nivel de agencia, no en el
dashboard del asesor.

**Administrador (agencia y equipo):** quien tenga el permiso de reportes que defina T-340/T-341 [S].
Ve toda la agencia y, además, el desglose por asesor. Neto y margen siguen exigiendo
`cotizacion.ver_neto_y_margen`.

Las reglas del [06-roadmap §2](06-roadmap-de-reportes.md#2-reglas-comunes-a-todos-los-reportes) aplican a
todas las filas: `n` y periodo en toda cifra, sin porcentajes con `n < 5`, mediana y p90, cohortes, dinero
por moneda sin sumar monedas y margen nulo = desconocido.

#### A. Atención

| # | Reporte | Pregunta de negocio | Fuente de datos | Asesor (propio) | Administrador (agencia y equipo) | ¿Existe hoy? | Tarea |
|---|---|---|---|---|---|---|---|
| A1 | Conversaciones sin responder (R2) | ¿A quién hay que contestar ya? | `conversaciones` (`ultimo_mensaje_direccion`, `ultimo_mensaje_cliente_en`, `asignado_a_id`, `estado`) | Las asignadas a él, por tramo de antigüedad; la cola sin asignar, aparte | Toda la agencia, por asesor y sin asignar | **Parcial:** los contadores de la bandeja (todas, mías, sin asignar, sin leer) no son «sin responder» | T-138, T-143 |
| A2 | Ventanas de 24 h por cerrarse (R2) | ¿A quién se le cierra la ventana gratuita? | `conversaciones.ultimo_mensaje_cliente_en` | Las suyas en las próximas 4 h | Toda la agencia | No | T-138 |
| A3 | Primera respuesta y SLA (R1) | ¿Cuánto tardamos en contestar? | `mensajes`, `conversaciones.primera_respuesta_en`; política de SLA (T-135) | Su mediana, su p90 y sus episodios sin respuesta (por autor de la respuesta) | Agencia y por asesor; % en SLA; por hora y día | **Parcial:** el resumen da mediana, p90 y sin responder **de toda la agencia**, por conversación (no por episodio), sin asesor ni SLA | T-137, T-342 |

#### B. Venta

| # | Reporte | Pregunta de negocio | Fuente de datos | Asesor (propio) | Administrador (agencia y equipo) | ¿Existe hoy? | Tarea |
|---|---|---|---|---|---|---|---|
| B1 | Seguimientos vencidos y de hoy (R4) | ¿Qué compromisos se nos pasaron? | `seguimientos` (`vence_en`, `completado_en`, `asesor_id`) | Los suyos | Todos, por asesor; % cumplido a tiempo | **Sí** para lo propio, en «Hoy». La vista de agencia no existe | T-138, T-143 |
| B2 | Oportunidades sin próximo paso (R4) | ¿Qué oportunidad viva no tiene a nadie detrás? | `oportunidades` + `seguimientos` | Las suyas | Todas, por asesor | No | T-138 |
| B3 | Cotizaciones abiertas por antigüedad (R3) | ¿Qué está en la calle sin respuesta, y desde cuándo? | `cotizaciones` (`estado`, `enviada_en`, `creado_por`), `versiones_cotizacion.vigente_hasta` | Las suyas, por tramo (0-2, 3-7, 8-14 y más de 14 días) y las vencidas de hecho | Todas, por asesor | **Parcial:** la tarjeta «por vencer» de «Hoy» se calcula en la web sobre las 20 más recientes | T-139, T-143 |
| B4 | Tasa de aceptación por cohorte (R3) | ¿Qué fracción de lo enviado se acepta? | `cotizaciones`, `cotizacion_cambios_estado` | La suya, con `n` | Agencia y por asesor, por mes de envío | **Parcial:** solo de toda la agencia | T-140, T-342 |
| B5 | Embudo: foto y cohorte (R5) | ¿Dónde se atascan las oportunidades? | `oportunidades`, `etapas_pipeline`, `oportunidad_cambios_etapa` | Sus oportunidades vivas por etapa (conteo y valor estimado por moneda) | Agencia; tasa de cierre por cohorte; en V1, tiempo en etapa | **Parcial:** el resumen clasifica las creadas en el rango por su etapa de hoy, de toda la agencia | T-140, T-145 |
| B6 | Mis cierres y ventas del mes (R6) | ¿Cuánto vendí, o vendimos? | `versiones_cotizacion.venta_unidades` y `moneda_iso`; instante de `cotizacion_cambios_estado`; `travel_files` | Sus ventas por moneda y su ticket mediano. **Sin neto ni margen** | Ventas por moneda, destino, paquete, mayorista, asesor y fecha de salida; comparación con el periodo anterior | **Parcial:** ventas por moneda de toda la agencia, sin dimensiones | T-140, T-149 |
| B7 | Margen y su cobertura (R6) | ¿Cuánto nos quedó? | `versiones_cotizacion.neto_unidades` y `margen_unidades` | **Nunca** | Con `cotizacion.ver_neto_y_margen`: por moneda, por asesor y destino; cobertura («margen conocido en X de Y») | **Sí**, por moneda y de toda la agencia | T-140 (dimensiones) |
| B8 | Motivos de pérdida (R7) | ¿Por qué se nos van? | `oportunidades.motivo_perdida`, `oportunidad_cambios_etapa` | Los suyos, en conteo [S: útil para corregirse; lo confirma el dueño] | Distribución por mes y por asesor | No | T-140 |
| B9 | Carga y productividad (R8) | ¿Quién está sobrecargado y quién convierte? | A1 + B1 + B3 + B6 | Solo su fila | Tabla de equipo; cada fila con su `n` | No | T-138, T-140 |
| B10 | Origen del lead (R9) | ¿De dónde vienen los que compran? | **No hay dato** | No | Sí, cuando exista el dato | No (sin captura) | T-133, T-134, T-146 |
| B11 | Pipeline ponderado (R10) | ¿Qué es razonable esperar vender? | `oportunidades`, `etapas_pipeline.probabilidad` | No | Sí, por moneda y mes de viaje | No | T-147 |

#### C. Cobros del viajero (definidos por ADR-0034 §3; no se inventa ningún estado)

Situación del saldo: `SIN_PAGOS`, `PARCIAL`, `PAGADO`, `SALDO_A_FAVOR`. Estado de cobro: `AL_DIA`,
`SALDO_PENDIENTE`, `POR_VENCER` (de 0 a 7 días), `VENCIDO`, `CANCELADO`. Los dos son **del archivo**
y se calculan en el servidor (`cobro.ts` (nuevo) en el paquete `domain`, T-330). Todas las filas exigen
`cobro.ver`.

| # | Reporte | Pregunta de negocio | Fuente de datos | Asesor (propio) | Administrador (agencia y equipo) | ¿Existe hoy? | Tarea |
|---|---|---|---|---|---|---|---|
| C1 | Quién pagó y quién debe | ¿Qué archivo tiene saldo y en qué estado de cobro? | `travel_files`, `pagos`, `plazos_de_cobro`, `parametros_de_cobro` (vía `GET /api/v1/cobros`, ADR-0034 §8) | Sus archivos (§3.1, sin decidir) | Todos, con filtro por asesor y estado de cobro; totales **por moneda** | No (tablas sí; API T-330, vista T-332) | T-330, T-332 |
| C2 | Cobros vencidos y por vencer | ¿Qué cliente ya debía haber pagado, o tiene que pagar esta semana? | Estado de cobro `VENCIDO` y `POR_VENCER` | Los suyos | Todos, por asesor | No | T-333 |
| C3 | Saldo por cobrar por asesor | ¿Cuánto falta por cobrar y en manos de quién está? | Σ saldo de archivos `ABIERTO` con saldo > 0, por moneda y asesor | Solo su cifra, por moneda | Tabla por asesor y por moneda | No | Nueva (§8) |
| C4 | Cobrado en el periodo | ¿Cuánto entró este mes, y por qué medio? | `pagos` tipo `PAGO` menos `DEVOLUCION` vigentes, por `pagado_el`, `moneda_iso` y `medio` | Lo cobrado en sus archivos | Agencia, por medio y por asesor | No | Nueva (§8) |
| C5 | Correcciones de cobro | ¿Qué devoluciones, ajustes, penalidades y reversos hubo, y quién los hizo? | `pagos` tipos `DEVOLUCION`, `AJUSTE`, `PENALIDAD` y `REVERSO`; `registrado_por` | No | Sí: es control de la separación de funciones (ADR-0034 §6). Sin `nota`, `referencia` ni `motivo` en la lista | No | Nueva (§8) |

#### D. Operación del viaje

| # | Reporte | Pregunta de negocio | Fuente de datos | Asesor (propio) | Administrador (agencia y equipo) | ¿Existe hoy? | Tarea |
|---|---|---|---|---|---|---|---|
| D1 | *Time limits* y pagos al mayorista | ¿Qué reserva se cae si nadie hace nada? | `bookings.time_limit`, `pago_total_vence_en`, `estado` | Los de sus archivos | Todos | **Parcial:** avisos en la campana, de toda la agencia | Ya en «Hoy» (Flujo 2, paso 2a); alcance: T-342 |
| D2 | Salidas próximas con pasajeros (R11) | ¿Qué sale en los próximos 7 a 30 días, y con cuántos pasajeros? | `travel_files` (`fecha_salida`, `adultos`, `ninos`, `infantes`, `paquete_nombre`, `destino`); nombre del titular desde `pasajeros` | Sus salidas de los próximos 7 días: conteos y titular | Todas, por fecha y paquete (también para Operaciones [S]) | No | T-148 (re-basar sobre `travel_files`, §8) |
| D3 | Ventas por mayorista | ¿Con quién vendemos más? | `bookings.mayorista_id` y `mayorista_nombre` (congelado en la reserva) | No | Sí, por moneda | No | T-140, T-149 (§8) |

**Operaciones [S].** El Eje F solo define dos niveles. El rol `OPERACIONES` tiene hoy
`conversaciones.ver_todas`, `archivo.ver` y `cobro.ver` y no vende. La propuesta es que vea A1, C1, C2,
D1 y D2 de toda la agencia, sin ventas (B6) ni margen (B7). Lo decide T-340.

## 4. Qué va en «Hoy» y qué en Reportes

**Regla:** en «Hoy» va lo que **se resuelve con un toque sobre un objeto concreto** (un chat, un
archivo, un seguimiento). En Reportes va lo que **se compara**: periodos, cohortes, asesores y dinero
agregado. Si una cifra no lleva a ninguna acción hoy, no va en «Hoy».

### 4.1 «Hoy»

El orden sigue el Flujo 2 de `04-flujos-criticos.md`, de lo que más dinero cuesta a lo que menos:

| Orden | Bloque | Reporte | Asesor | Administrador |
|---|---|---|---|---|
| 1 | *Time limits* y pagos al mayorista: próximas 48 h y vencidos | D1 | Los de sus archivos | Todos, con filtro «Míos» |
| 2 | Cobros vencidos y por vencer | C2 | Los suyos | Todos, con filtro «Míos» |
| 3 | Conversaciones sin responder y ventanas por cerrarse | A1, A2 | Las suyas, más la cola sin asignar | Todas |
| 4 | Seguimientos vencidos y de hoy | B1 | Los suyos (ya existe) | Todos, con filtro «Míos» |
| 5 | Cotizaciones enviadas sin respuesta hace más de 48 h, o por vencer | B3 | Las suyas | Todas |
| 6 | Salidas de los próximos 7 días | D2 | Las suyas | Todas |
| 7 | «Tu mes», en una línea: cierres y saldo por cobrar, con enlace a Reportes | B6, C3 | Lo suyo | De la agencia |

**Sale de «Hoy» [propuesta para T-343]:** la tarjeta de catálogo y la de oportunidades por etapa
(B5 es analítico: va a Reportes) y los «accesos rápidos», que duplican la barra inferior y el menú.
Además, la cifra de «cotizaciones por vencer» se dejaría de calcular en la web sobre 20 filas y se
leería de T-139.

El administrador tiene **la misma pantalla** con lo de toda la agencia y el filtro «Míos». Lo confirma
el Flujo 2 («Gloria, con la misma pantalla, ve lo de toda la agencia»), y además la dueña también vende
(`03-personas.md`).

### 4.2 Reportes

| Pestaña [S] | Asesor | Administrador |
|---|---|---|
| **Resumen** | Sus cifras del periodo: B6 sin margen, B4, A3, C3 y C4. Una tarjeta por cifra | Las mismas cifras de la agencia, comparadas con el periodo anterior; B7 con permiso |
| **Equipo** | No aparece | B9 y C3 por asesor; A3 por asesor |
| **Ventas** | Sus ventas por destino y paquete, sin margen | B6 por destino, paquete, mayorista (D3) y asesor; B8; B11 |
| **Atención** | Su A3 | A3 completo; A1 y B1 por asesor |
| **Cobros** | C1 y C4 de sus archivos | C1, C3, C4 y C5 |
| **Operación** | Sus salidas (D2) | D1 y D2 de toda la agencia |
| **Calidad del dato** | No | Indicadores de 06-roadmap §6.3 (T-140) |

La pestaña vive en `?pestana=` (T-318). El conmutador actual «Vista Dueño / Vista Asesor» desaparece:
la vista la decide el nivel que devuelve el servidor, no un botón [propuesta para T-344].

## 5. Consultas, filtros y exportaciones del administrador

### 5.1 Filtros

| Filtro | Valores | Fuente y nota |
|---|---|---|
| Periodo | Presets (hoy, esta semana, este mes, mes anterior, trimestre, año) y rango propio de hasta 366 días | La web convierte el periodo a instantes UTC con la zona de la agencia; las cohortes se cortan en la base con `tenants.zona_horaria` (06-roadmap §5.5) [V] |
| Asesor | Uno, varios o «sin asignar» | Según §3.1. **Solo en el nivel de agencia**; en el nivel del asesor, el servidor lo ignora |
| Moneda | COP, USD… | Nunca se suman monedas: el filtro elige qué filas se ven, no las convierte |
| Mayorista | Del catálogo de la agencia | En archivos: `bookings.mayorista_id`. En cotizaciones, el mayorista no está congelado hasta T-149 |
| Destino | Lista de valores usados | `versiones_cotizacion.destino` o `travel_files.destino`; **nunca** `oportunidades.destino`, que es texto libre (D9 del 06-roadmap) |
| Paquete | Lista | `paquete_nombre` congelado |
| Estado de cobro | `AL_DIA`, `SALDO_PENDIENTE`, `POR_VENCER`, `VENCIDO`, `CANCELADO` | ADR-0034 §3. Solo con `cobro.ver` |
| Estado del archivo | `ABIERTO`, `CANCELADO` | Ya existe en `ListarArchivos` |
| Fecha de salida | Rango | `travel_files.fecha_salida` |
| Etapa | Etapas de la agencia | `etapas_pipeline` |
| Origen | Lista por agencia | Cuando exista (T-133); antes, el filtro no se muestra |

Los **filtros guardados** (T-345) son por usuario y guardan **parámetros, nunca resultados**. Si van a
la base, la tabla lleva `tenant_id` y RLS (R1). Eso lo decide `datos`.

### 5.2 Exportaciones

**Formato:** CSV es-CO con las convenciones de `apps/web/src/lib/exportar-csv.ts` (`;`, UTF-8 con BOM y
escapado contra inyección de fórmulas). Dinero en enteros de la unidad mínima, con una columna de
moneda (R8). Fechas en la zona de la agencia (R9).

| Exportación | Columnas | Datos personales | Condición |
|---|---|---|---|
| Ventas | Número de archivo o cotización, fecha de decisión, asesor, destino, paquete, mayorista, fecha de salida, adultos, niños, infantes, moneda y venta. Neto y margen **solo si el servidor los envía** (con permiso) | No | Permiso de reportes de agencia |
| Equipo | Una fila por asesor: A3, B4, B6 y C3, cada uno con su `n` | No (nombres de asesores, que son usuarios) | Permiso de reportes de agencia |
| Cobros | Número de archivo, asesor, fecha de salida, moneda, total, pagado, saldo, situación, estado de cobro y fecha límite de cobro | **Sí si lleva el nombre o el teléfono del contacto** | Ver la regla R10 abajo |
| Salidas | Fecha, paquete, opción de salida, punto de encuentro y conteo de pasajeros | **Sí si lleva nombres de pasajeros** (pueden ser menores) | Ver la regla R10 abajo |

**Regla R10 para exportar:** cuando una exportación lleva datos personales de contactos o viajeros,
se cumplen dos condiciones:

1. Exige un permiso explícito, distinto del de leer el reporte. El nombre del permiso lo fija T-340.
2. Queda **auditada en el servidor**: quién, cuándo, qué filtros y cuántas filas, **sin** el contenido.

Por defecto, las exportaciones salen **sin** columnas de datos personales. Ninguna exportación lleva
nunca documentos, pasaporte, fecha de nacimiento, `nota`, `referencia` ni `motivo` de un pago (ADR-0034
§2.4 y §6).

Consecuencia [V]: el patrón de hoy genera el CSV en el navegador, y así no deja ningún registro en el
servidor. Para las exportaciones con datos personales, la generación tiene que pasar por la API.
Diseñar eso es T-340/T-345.

## 6. Móvil primero: 390 px, ~768 px y escritorio

**Lo que ocupa el marco [V]:** por debajo de 768 px, la cabecera ocupa 44 px y la barra inferior 56 px.
Desde 768 px aparece el menú lateral, de 56 o 240 px. A 768 px con el menú desplegado quedan **~528 px
útiles**, poco más que un celular grande. Por eso la tablet vertical se diseña como «celular ancho»,
no como escritorio.

**Reglas a 390 px:**

- Nada más ancho que la pantalla; sin tablas de varias columnas.
- Cifra grande, con su etiqueta, su `n` y su periodo.
- Listas de 3 a 5 elementos con «Ver todo (N)», que lleva a la pantalla dueña: bandeja, archivos o
  seguimientos.
- Dinero: una línea por moneda.
- Filtros en una hoja inferior, con los activos como chips.
- Objetivos táctiles de 44 px, como ya hace el código con `min-h-[44px]`.

| Pieza | 390 px (sin desplazamiento lateral) | ~768 px | ≥ 1280 px |
|---|---|---|---|
| «Hoy»: cada bloque (D1, C2, A1, B1, B3, D2) | Tarjeta con título, contador grande y las 3 más urgentes (nombre del contacto, una línea de contexto, plazo relativo «en 5 h»); «Ver todo (N)». Bloques vacíos colapsados en una línea («Nada vence hoy») | Igual, en 1 columna con el menú desplegado o en 2 con el menú plegado; 5 elementos por bloque | Rejilla de 2 o 3 columnas; los bloques 1 a 4 visibles sin desplazar a 1440×900 (criterio del Flujo 2) |
| «Hoy»: «Tu mes» (B6, C3) | Una línea con dos cifras y «Ver reportes» | Igual | Tarjeta pequeña al pie |
| «Hoy»: filtro «Míos» (administrador) | Interruptor en la cabecera del bloque | Igual | Igual |
| Reportes: periodo y filtros | Selector de periodo arriba; el resto de filtros en hoja inferior; chips de activos | Filtros en una fila que se parte en dos | Barra de filtros completa, con filtros guardados |
| Reportes: tarjetas de resumen | 1 columna; cifra grande con su variación frente al periodo anterior como texto («+3 frente a octubre, n=12») | 2 columnas | 4 columnas |
| Ventas por moneda (B6, C3, C4) | Una línea por moneda, nunca sumadas | Igual | Tabla con moneda como fila |
| Embudo (B5) | Lista de barras horizontales por etapa, con el conteo a la derecha | Igual | Barras más la tabla de cohortes |
| Equipo (B9, C3 por asesor) | **Lista de tarjetas por asesor** con 3 cifras (ventas por moneda, cotizaciones abiertas, saldo por cobrar); ordenar por una cifra elegida | Tarjetas en 2 columnas, o tabla de 3 o 4 columnas | Tabla completa con todas las columnas y su `n` |
| Cobros (C1) | Lista de archivos: número, contacto, saldo con moneda, chip del estado de cobro; filtro por estado | Igual, más la fecha límite | Tabla con todas las columnas de la exportación |
| Margen (B7, con permiso) | Una tarjeta por moneda con margen, porcentaje y cobertura | Igual | Tabla por moneda y dimensión |
| Cohortes (B4, B5) | Solo la última cohorte cerrada y la abierta, como dos cifras | Las últimas 3 | Matriz completa |
| Exportar | Botón en el menú de la pantalla [S: se usa poco en el celular] | Igual | Botón visible, con selección de columnas |

**Se difiere a escritorio:** la matriz de cohortes, la tabla de equipo completa, la exportación con
selección de columnas y la edición de filtros guardados. Siguen **accesibles** en el celular en forma
resumida, nunca ocultas por permiso de ancho.

Se propone que T-343 verifique también a **768 px**, además de 390 y 1440 (§8).

## 7. Cómo se impone el alcance (solo el requisito)

- El alcance (propio, o agencia y equipo) lo decide **el servidor con la sesión**. Ni el cliente ni el
  menú lo deciden: ocultar un ítem no es control de acceso (Eje F, D3).
- Con alcance propio, un parámetro del cliente (`asesorId` u otro) **no amplía** lo que se ve. Hoy
  `pendientes-del-dia` incumple este requisito (§2.1) y T-342 lo tiene que cubrir.
- Neto y margen: la API **no los calcula** sin `cotizacion.ver_neto_y_margen`, como ya hace el resumen.
- Cobros: `cobro.ver` hoy significa «toda la agencia». El nivel propio exige reinterpretarlo o
  partirlo. Lo decide T-340.
- Cada endpoint nuevo lleva su prueba de dos asesores en la misma agencia, además de la de dos agencias
  (Eje F; T-144, T-346).
- **El diseño de todo esto es T-340 (ADR)**, no de este documento.

## 8. Orden sugerido de construcción

```text
T-339 (este) ─► T-340 ADR ─► T-341 permisos ─► T-342 alcance en la API ─┬─► T-343 «Hoy» y dashboard del asesor
                    │                                                 ├─► T-344 dashboard de administración ─► T-345 consultas y exportar
                    │                                                 └─► T-346 revisión a 390/768/1280 y permisos entre asesores
                    └─► T-138, T-139 (nacen con el requisito de alcance de T-340) ─► T-143
T-330 API de cobros ─► T-332 vista ─► T-333 «Hoy» y campana avisan cobros ─► (C2 en T-343)
T-140 dimensiones (destino, asesor, mayorista) ─► T-344
V1: T-145, T-146 (tras T-133/T-134), T-147, T-148 ─► T-150
```

| Paso | Depende de | Por qué en este orden |
|---|---|---|
| T-340 | T-339 | Sin la definición de «suyo» para el archivo (§3.1) no hay «mis cobros» ni «mis salidas» |
| T-138, T-139 | T-340 (el ADR, no su código) | Si nacen sin alcance, habrá que reabrirlos. Pueden avanzar en paralelo a T-341 |
| T-342 | T-341 | Aplica el alcance a `/reportes/resumen` y a los nuevos endpoints, y cierra el `?asesorId=` libre |
| T-343 | T-342, T-138, T-139, T-333 | «Hoy» del asesor necesita pendientes, cotizaciones abiertas y cobros |
| T-344 | T-342, T-140, T-332 | El dashboard de agencia necesita las dimensiones y la vista de cobros |
| T-345 | T-344 y la decisión de T-340 sobre exportar datos personales | §5.2 |

**Tareas que se proponen (no se crean en `tasks.yaml`; las decide el `dueno-de-producto`):**

| Propuesta | Dueño | Depende de |
|---|---|---|
| Reportes de cobros: saldo por cobrar por asesor y moneda (C3), cobrado en el periodo por medio (C4) y correcciones (C5), con alcance | `backend` | T-330, T-342 |
| Re-basar T-148 (salidas próximas) sobre `travel_files` en lugar de cotizaciones aceptadas, ahora que el archivo existe | `analista-datos` (criterio), `backend` | — |
| Exportación en el servidor con auditoría para columnas con datos personales (§5.2) | `backend`, `auditor-seguridad` | T-340 |
| Ventas por mayorista desde `bookings.mayorista_nombre`, congelado en la reserva, y decidir si eso deja T-149 solo para cotizaciones no convertidas | `analista-datos` | — |
| Reconciliar el estado de T-131 y T-132 en `tasks.yaml` con lo que ya está en `main` (§2.2) | `dueno-de-producto` | — |
| Criterios nuevos en tareas existentes: T-342 cierra el `?asesorId=` libre de `pendientes-del-dia`; T-343 y T-344 se verifican también a 768 px; T-343 retira de «Hoy» lo no accionable (§4.1) | `dueno-de-producto` | — |

## 9. Riesgos y supuestos sin verificar

| # | Riesgo o supuesto | Efecto | Qué lo cierra |
|---|---|---|---|
| 1 | [S] El asesor no debe ver las ventas de sus compañeros | Si el dueño quiere un ranking, B9 se abre al asesor y cambia la política, no el diseño | Pregunta al dueño (roadmap §4) |
| 2 | [S] «Suyo» para un archivo = quien creó la cotización | Si se reasignan clientes, el cobro queda en el asesor equivocado | T-340 y la pregunta 6 al dueño |
| 3 | [V] `cobro.ver` está sembrado al asesor con alcance de agencia | Hasta T-342, el asesor ve los cobros de todos: lo contrario de lo que pide el Eje F | T-340, T-342 |
| 4 | [V] `pendientes-del-dia?asesorId=` sin comprobación | Un asesor puede leer los seguimientos de otro (dentro de la misma agencia, no entre agencias) | T-342 |
| 5 | [V] El resumen no tiene alcance y la «Vista Asesor» muestra cifras de la agencia | Hoy cualquier asesor ve ventas y embudo de toda la agencia | T-342 |
| 6 | [S] Con `n` pequeño (3 a 6 asesores, `03-personas.md`), las cifras por asesor tienen pocos datos | Se cumple la regla `n < 5`: conteo sí, porcentaje no | Regla del 06-roadmap §2 |
| 7 | [S] El SLA mide tiempo de calendario hasta T-135; si el asesor responde desde WhatsApp Business en coexistencia, la respuesta no entra a la base | A3 sale peor de lo real | T-135, T-337 |
| 8 | [S] Ventas = cotización `ACEPTADA` por clic manual (D10 del 06-roadmap) | B6 sale bajo si no se marca | Indicador de calidad, T-140 |
| 9 | [S] Exportar en el celular se usa poco | Si el dueño exporta desde el teléfono, la exportación sube de prioridad en móvil | Pregunta al dueño |
| 10 | [S] Altura útil a 390 px ≈ 740 px (pantalla de 844 px menos cabecera y barra) | Cabrían 2 o 3 bloques de «Hoy» sin desplazar; el resto, con desplazamiento vertical (permitido) | T-346 con capturas |
| 11 | Ninguna cifra de este documento sale de datos reales de JD Tours | — | Las respuestas del §4 del roadmap |
