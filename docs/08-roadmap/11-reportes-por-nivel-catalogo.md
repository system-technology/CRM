# Reportes por nivel: catálogo, «Hoy» frente a Reportes y los dos dashboards

| | |
|---|---|
| Fecha | 2026-11-21 |
| Tarea | T-339 (F0 del Eje F del [roadmap JD Tours](08-roadmap-jd-tours-reservas-cobros-y-navegacion.md)) |
| Autor | `analista-datos`. Pendiente de contraste con `analista-producto`, `experto-turismo` y `diseno-ux` (dueños compartidos de T-339) |
| Base verificada | `origin/main` en `912f412`. Solo lectura del código: no se ejecutó base, API ni navegador |
| Se apoya en | [`06-roadmap-de-reportes.md`](06-roadmap-de-reportes.md) (R1 a R12, T-131 a T-151), [`03-personas.md`](../00-vision/03-personas.md), [`04-flujos-criticos.md`](../01-producto/04-flujos-criticos.md) (Flujo 2 y D3), [`12-visibilidad-de-conversaciones.md`](../01-producto/12-visibilidad-de-conversaciones.md), [ADR-0011](../03-adr/0011-autenticacion-y-tenant-de-sesion.md), [ADR-0024](../03-adr/0024-de-cotizacion-aceptada-a-archivo-de-viaje.md), [ADR-0034](../03-adr/0034-pagos-del-viajero-mvp-de-registro-manual.md) |
| Estado vivo | `ESTADO.md` y `roadmap/tasks.yaml` mandan sobre este documento |
| Actualización | Después de escribirse, entró en `main` el [ADR-0035](../03-adr/0035-niveles-de-acceso-a-reportes.md) (Propuesto): recoge las propuestas [P] de §1 a §4 como decisión a ratificar por el propietario. Donde este documento diga que T-340 «decidirá», léase «ADR-0035, pendiente de aceptación» |

**Marcas de este documento.** **[V]** verificado en el código de `912f412`, con la ruta. **[S]** supuesto
sin confirmar. **[P]** propuesta de este documento, que decide T-340 (ADR) o el propietario (§7). Los
nombres y cifras de los ejemplos son **ficticios**: el repositorio es público (R10).

---

## 0. Respuesta corta

1. **Dos niveles construibles hoy, no tres.** *Propio* (lo del usuario de la sesión) y *agencia* (todo
   el tenant). El nivel *equipo* (un subconjunto de asesores) **no tiene dato**: no existe ninguna tabla
   de equipos ni de sedes. Se deja nombrado en el ADR y no se construye hasta que una agencia lo pida
   (pregunta 1).
2. **Quién cae en cada uno, con los roles reales:** `DUENO` → agencia. `ASESOR` → propio.
   `OPERACIONES` → depende de la pregunta 2. La propuesta es «propio», y su trabajo de toda la agencia
   (salidas, cobros) lo ve en las pantallas operativas, no en Reportes.
3. **Un permiso nuevo y no un rol:** `reportes.ver_agencia` [P]. Sin él, el servidor fija el alcance a
   lo propio. El margen sigue aparte con `cotizacion.ver_neto_y_margen`, que ya existe. Son dos ejes que
   no se mezclan.
4. **«Hoy» es lo accionable ahora**, sin periodo ni porcentajes. Son listas cortas con un toque hasta el
   objeto. **Reportes es el análisis**, con periodo, cohorte, `n` y comparación.
5. **Hoy en `main` [V]:** un asesor que abre Reportes recibe del servidor el resumen **de toda la
   agencia**, sin margen. La «Vista Asesor» de la web solo cambia la presentación. Además, el endpoint
   de seguimientos acepta `?asesorId=` de cualquier compañero. Ninguno de los dos es una fuga entre
   agencias, pero ambos contradicen la decisión vigente (D3 reemplazada, Eje F). Detalle en §6.

---

## 1. Niveles de acceso

### 1.1 Definición

| Nivel | Qué filas entran | Cómo lo impone el servidor [P] | Construible hoy |
|---|---|---|---|
| **Propio** | Las atribuidas al usuario de la sesión según la tabla 1.3 | `ContextoTenant.obtener().usuarioId`. Nunca un parámetro del cliente | Sí |
| **Equipo** | Las de un subconjunto de asesores | Requiere una entidad «equipo» por agencia (R12, tabla con `tenant_id` y RLS) | **No**: no hay dato [V: ni `equipos` ni `sedes` en `schema.prisma`] |
| **Agencia** | Todas las del tenant de la sesión | RLS (`prisma.conTenant`) + `tenant_id` explícito en cada `FROM` y `JOIN`. Ya es así [V: `respuesta-para-reportes.prisma.ts`] | Sí |

Entre agencias no hay nivel: un usuario nunca ve otra agencia (R1, RLS). Los agregados entre tenants son
métricas internas del producto y no se muestran a ningún cliente.

**Regla de coherencia [P].** El alcance de un reporte puede ser **más estrecho** que lo que el usuario
ve en las pantallas, pero **nunca más amplio**. Un reporte no puede revelar una conversación que la
bandeja le oculta. Hoy esto se cumple por la otra punta: las pantallas de archivos y cotizaciones ya
muestran toda la agencia a cualquier miembro (§6, H6).

### 1.2 Quién cae en cada nivel (roles sembrados, sin inventar)

Fuente [V]: `ROLES_SEMBRADOS` en `packages/database/prisma/siembra-de-tenant.ts` y el `CHECK`
`roles_permisos_del_catalogo` (15 permisos desde la migración `20261121160000`, T-341; eran 14 en
`packages/database/prisma/migrations/20261121140000_pagos_del_viajero_libro_de_cobro/migration.sql`).
Los roles son tabla por agencia (R12). La agencia puede renombrarlos, cambiar sus permisos o componer
otros, así que **el nivel lo da el permiso y no la clave del rol**.

| Rol sembrado | Permisos que importan aquí [V] | Nivel propuesto [P] | Margen |
|---|---|---|---|
| `DUENO` | `conversaciones.ver_todas`, `cotizacion.ver_neto_y_margen`, `archivo.ver`, `cobro.ver` (y el resto) | **Agencia** (`reportes.ver_agencia` sembrado) | Sí |
| `ASESOR` | `bandeja.operar`, `crm.escribir`, `cotizacion.escribir`, `archivo.ver`, `archivo.operar`, `cobro.ver`, `cobro.registrar` | **Propio** | No |
| `OPERACIONES` | `conversaciones.ver_todas`, `catalogo.administrar`, `archivo.ver`, `archivo.operar`, `cobro.ver` | **Propio** por defecto. Agencia si la pregunta 2 dice «Sí» | No |

Por qué un permiso propio y no reutilizar `conversaciones.ver_todas`, como sugería de forma provisional
[`06-roadmap-de-reportes.md`](06-roadmap-de-reportes.md) §2.7: ese permiso decide **qué chats** se ven.
Atarle además las cifras de ventas de la agencia obliga a la dueña a elegir entre una coordinadora que
reparte chats sin ver ventas y una que ve ventas sin repartir chats. Son dos políticas distintas (R12).

**Nombre del permiso.** T-141 proponía `reportes.ver_equipo`. Aquí se propone `reportes.ver_agencia`
porque «equipo» queda reservado para el nivel intermedio. Lo decide T-340, que absorbe a T-141.

### 1.3 Atribución: qué es «propio» en cada dato

Este es el punto donde más fácil se miente. Cada entidad tiene un dueño distinto y hay que fijarlo antes
de medir.

| Dato | «Propio» significa | Columna [V en `schema.prisma`] | Por qué esa |
|---|---|---|---|
| Conversación pendiente | Asignada a mí. **Aparte**, la cola sin asignar, que también ve en la bandeja | `conversaciones.asignado_a_id` | Es la regla de visibilidad que ya existe [V: `visibilidad-de-conversaciones.ts`] |
| Tiempo de respuesta | Respondida **por mí**: autor del primer saliente humano | `mensajes.autor_id` | `primera_respuesta_en` no guarda el autor [V] |
| Seguimiento | Asignado a mí | `seguimientos.asesor_id` | Ya es el filtro de `pendientes-del-dia` [V] |
| Oportunidad viva (foto) | Asignada a mí ahora | `oportunidades.asesor_id` | Es el trabajo de hoy |
| Cierre (ganada o perdida) | Mía **en el instante** del cambio | `oportunidad_cambios_etapa.asesor_id` (copia del momento) | Reasignar después no reescribe la historia |
| Cotización y su venta | Cotizada por mí [P] (pregunta 3) | `cotizaciones.creado_por` | No cambia al reasignar: el crédito es de quien vendió |
| Archivo de viaje, sus plazos y su cobro | El asesor **actual** de su oportunidad | `travel_files.oportunidad_id` → `oportunidades.asesor_id` | Es la misma regla de los avisos de plazo [V: `aviso-de-plazo.ts`, `destinatariosDelAviso`]. El trabajo sigue al responsable actual |
| Pago registrado | Registrado por mí | `pagos.registrado_por` | Solo para auditoría. No es «mi venta» |

**Hueco [V].** `travel_files` no tiene columna de asesor, y `creado_por` es nulo a propósito, porque el
archivo lo abre el consumidor del evento. Un archivo sin oportunidad (`oportunidad_id` nulo) **no tiene
dueño**: no aparece en ningún «propio». En «Hoy» se comporta como los avisos: va a quien tenga
`archivo.operar`. Lo declara T-340.

**Regla [P]:** el trabajo vivo sigue al responsable actual, y el crédito histórico se queda con quien lo
ganó. Por eso «Hoy» usa la asignación actual y «Mis cierres» usa la de su momento.

---

## 2. Catálogo de reportes por nivel

**Columnas.** *Nivel*: P = propio, A = agencia. *API*: **SÍ** (existe en `GET /api/v1/reportes/resumen`
u otro endpoint), **PARCIAL**, **NO**. *Dato*: si la base ya guarda lo necesario.

**Reglas comunes**, heredadas de [`06-roadmap-de-reportes.md`](06-roadmap-de-reportes.md) §2 y vigentes:

- **Dinero.** Siempre `GROUP BY moneda_iso`, en enteros de la unidad mínima (en COP es el peso, en USD
  el centavo, R8). Se devuelve como texto y nunca se suman dos monedas. Sin conversión por TRM (pregunta 9).
- **Huso.** La API recibe instantes UTC `[desde, hasta)`. La web convierte «este mes» con la zona de la
  agencia (`tenants.zona_horaria`) [V: `reportes/page.tsx`, `convertirPeriodoAInstantesUtc`]. Lo que se
  agrupa por día o por mes se corta en la base con `AT TIME ZONE` de la agencia. «Hoy» y «vencido» se
  calculan con el día local de la agencia (R9).
- **Tiempos y valores.** Mediana y p90, nunca el promedio como cifra principal.
- **Muestra.** Toda cifra lleva su `n` y su periodo. Hoy la web no muestra el porcentaje con menos de 20
  [V: `N_MINIMO_TASA = 20` en `reportes-logica.ts`]. El 06 decía 5. **[P]** Se queda en 20, y por debajo
  se muestra la fracción «7 de 15», que es honesta con `n` pequeño (H4).
- **Margen nulo es desconocido, no cero.** Va con su cobertura («margen conocido en 31 de 40»).

### 2.1 Lo que ve el asesor (propio) y también la dueña (agencia)

| Id | Reporte | Fórmula exacta | Fuente | API | Nivel |
|---|---|---|---|---|---|
| M1 | **Conversaciones por responder, ahora** | Conversaciones con `ultimo_mensaje_direccion = 'ENTRANTE'`, `estado <> 'CERRADA'` y `eliminado_en IS NULL`. Antigüedad = ahora − `ultimo_mensaje_cliente_en`, en tramos `<15 min`, `15–60 min`, `1–4 h` y `>4 h`. Aparte, las de **SLA vencido**: `primera_respuesta_en IS NULL` y `sla_vence_en < ahora` | `conversaciones` [V] | **PARCIAL**: el filtro `SLA_VENCIDO` de la bandeja existe [V: `conversaciones.prisma.ts`]. `GET /inbox/conversaciones/contadores` no trae «por responder» [V: `ContadoresBandeja`]. Falta T-138 | P (asignadas + cola aparte), A |
| M2 | **Ventana de 24 h por cerrarse** | `ultimo_mensaje_cliente_en + 24 h` entre ahora y ahora + 4 h | `conversaciones` [V] | **NO** (T-138) | P, A |
| M3 | **Seguimientos vencidos y de hoy** | `completado_en IS NULL AND vence_en < fin del día local`. Vencido si `vence_en < inicio del día local` | `seguimientos` [V] | **SÍ**: `GET /crm/seguimientos/pendientes-del-dia` [V]. Ver el hueco de alcance en H2 | P, A |
| M4 | **Cotizaciones abiertas por antigüedad** | `estado = 'ENVIADA'`, antigüedad = hoy local − `enviada_en` en tramos 0–2, 3–7, 8–14 y >14 días. **Vencida de hecho:** `versiones_cotizacion.vigente_hasta < hoy local` en la versión enviada | `cotizaciones`, `versiones_cotizacion` [V] | **NO** (T-139) | P, A |
| M5 | **Plazos con el mayorista** (*time limit* y pago total) | Reservas con `time_limit` o `pago_total_vence_en` en `[ahora, ahora + 48 h)` o ya vencidos, de archivos `ABIERTO` | `bookings`, `travel_files` [V] | **PARCIAL**: los avisos llegan a la campana [V: `notifications`]. No hay lista para «Hoy» | P, A |
| M6 | **Cobros por cobrar** | Por archivo `ABIERTO`: `saldo = total − pagado` con las fórmulas de ADR-0034 §3. Estado `AL_DIA`, `SALDO_PENDIENTE`, `POR_VENCER` (0 ≤ d ≤ 7) o `VENCIDO` (d < 0), con `d` = fecha límite − hoy local. Se reporta, **por moneda**, Σ saldo > 0 y el número de archivos por estado | `pagos`, `plazos_de_cobro`, `parametros_de_cobro` [V: las tablas existen] | **NO**: no hay controlador de cobros (T-330, T-332) | P, A |
| M7 | **Mis cierres / cierres del periodo** | Cotizaciones con una fila `estado_hasta = 'ACEPTADA'` en `cotizacion_cambios_estado` cuyo `ocurrido_en` cae en el periodo, valoradas por la **versión enviada**: por moneda, `count(*)` y Σ `venta_unidades`. Las aceptadas sin esa fila (anteriores al historial) se cuentan aparte, sin fecha | `cotizacion_cambios_estado`, `cotizaciones`, `versiones_cotizacion` [V] | **SÍ** en agencia (`ventasPorMoneda`, `aceptadasSinFecha`) [V: `reportes.ts`]. **NO** en propio (T-342) | P, A |
| M8 | **Tasa de aceptación** | Cohorte de **mes de envío**: de las enviadas en el periodo, las que hoy están `ACEPTADA` ÷ enviadas en el periodo. La cohorte del mes en curso se marca «abierta» | `cotizaciones` [V] | **SÍ** en agencia (`tasaAceptacion`). **NO** en propio | P, A |
| M9 | **Primera respuesta** | Mediana y p90 en minutos de (primera respuesta − primer entrante), sobre las conversaciones **creadas** en el periodo. `sinResponder` va en el denominador | `conversaciones`, `mensajes` [V] | **SÍ** en agencia [V: `respuesta-para-reportes.prisma.ts`]. **NO** en propio: falta la atribución por `mensajes.autor_id` (tabla 1.3). Episodios por silencio y % en SLA: T-137 | P, A |
| M10 | **Seguimientos cumplidos a tiempo** | Por semana de vencimiento: `completado_en <= vence_en` ÷ seguimientos que vencieron en la semana | `seguimientos` [V] | **NO** | P, A |
| M11 | **Salidas próximas** | Archivos `ABIERTO` con `fecha_salida` en los próximos 30 días locales: por fecha, el número de archivos y Σ `adultos + ninos + infantes`. **Solo conteos** | `travel_files` [V] | **NO** como reporte. Lo cubren en parte la lista `/viajes` y T-148 | P, A |

**Ejemplo de consulta (M7 con alcance propio)**, sobre tablas que existen. Los parámetros salen de la
sesión, nunca de la URL:

```sql
-- $tenant y $usuario: de la sesión. $desde_utc y $hasta_utc: «este mes» en la zona de la agencia.
SELECT v.moneda_iso,
       count(*)::int                 AS cotizaciones_aceptadas,
       sum(v.venta_unidades)::text   AS ventas_unidades          -- R8: entero, sin mezclar monedas
  FROM cotizacion_cambios_estado h
  JOIN cotizaciones c         ON c.id = h.cotizacion_id AND c.tenant_id = $tenant
  JOIN versiones_cotizacion v ON v.cotizacion_id = c.id AND v.tenant_id = $tenant
                             AND v.numero = c.version_enviada
 WHERE h.tenant_id = $tenant
   AND h.estado_hasta = 'ACEPTADA'
   AND h.ocurrido_en >= $desde_utc AND h.ocurrido_en < $hasta_utc
   AND c.eliminado_en IS NULL
   AND c.creado_por = $usuario        -- SOLO en alcance propio; con reportes.ver_agencia no va
 GROUP BY v.moneda_iso;
```

Salvedad de M7: «venta» es la aceptación marcada a mano (D10 del 06). Si una asesora no marca
`ACEPTADA`, sus cierres salen bajos, y el indicador «ganadas sin cotización aceptada» (T-140) lo deja a
la vista. `ACEPTADA` es terminal [V: `estado-de-cotizacion.ts`, `ACEPTADA: []`], así que hay a lo
sumo una fila de aceptación por cotización y el `count(*)` no duplica.

### 2.2 Lo que solo ve la administración (agencia)

| Id | Reporte | Fórmula exacta | Fuente | API | Permiso extra |
|---|---|---|---|---|---|
| M12 | **Embudo por cohorte** | Oportunidades **creadas** en el periodo, por su etapa de hoy. Tasa de victoria = ganadas ÷ (ganadas + perdidas), `null` si ninguna se cerró | `oportunidades`, `etapas_pipeline` [V] | **SÍ** (`oportunidades.porEtapa`, `tasaConversion`) | — |
| M13 | **Embudo temporal** | Conversión de cada etapa a la siguiente en N días y mediana de días por etapa | `oportunidad_cambios_etapa` [V: la tabla existe] | **NO** (T-145) | — |
| M14 | **Ventas por dimensión** | M7 por destino (`versiones_cotizacion.destino`, que es copia congelada), paquete (`paquete_nombre`) y asesor (tabla 1.3) | [V] | **NO** (T-140) | — |
| M15 | **Margen** | Por moneda: Σ `margen_unidades` no nulos y % = Σ margen ÷ Σ venta **de las mismas filas**, con su cobertura. Es el margen cotizado, antes de comisión, y no el cobrado | `versiones_cotizacion` [V] | **SÍ**: las claves existen solo con el permiso [V: `obtener-resumen.use-case.ts`] | `cotizacion.ver_neto_y_margen` |
| M16 | **Carga y productividad por asesor** | Por asesor: M1, M3 y oportunidades vivas (carga, hoy), y M7, M8 y M9 (periodo). Cada fila lleva su `n`, y no se ordena por porcentaje con `n < 20` | Lo de M1 a M9 | **NO** (T-138, T-140) | — (margen por asesor: con el permiso) |
| M17 | **Motivos de pérdida** | Distribución por motivo de las oportunidades que pasaron a una etapa `es_perdida` en el periodo (`oportunidad_cambios_etapa`), por asesor | `oportunidad_cambios_etapa.motivo_perdida`, `motivos_de_perdida` [V] | **NO** (T-140) | — |
| M18 | **Cobros de la agencia** | M6 sin filtro de asesor, por estado y por moneda. Aparte, lo cobrado en el periodo: Σ `PAGO` − Σ `DEVOLUCION` vigentes con `pagado_el` en el periodo local | `pagos` [V] | **NO** (T-330, T-332) | `cobro.ver` |
| M19 | **Origen del lead** | Oportunidades creadas, ganadas y tasa por cohorte, por origen | — | **NO**: no hay dato (T-133, T-134) | — |

**Lo que no entra en ningún nivel por ahora:** pipeline ponderado (T-147, sin calibrar), recompra (hace
falta un año de archivos) y metas (no hay tabla de metas). Siguen en la cola del 06.

### 2.3 Consultas, filtros y exportación (administración)

| Capacidad | Propuesta [P] | Por qué |
|---|---|---|
| Filtros | Periodo, asesor, moneda. **Origen solo cuando exista T-133**: un filtro sin dato engaña | Lo pide el criterio de T-345 |
| Estado de los filtros | **En la URL** (`?desde=&hasta=&asesor=&moneda=`), igual que `?pestana=` [V: `hrefDePestana` en `reportes/page.tsx`]. Guardar = marcador del navegador | Cero tablas nuevas |
| Filtros guardados por usuario | **A la cola** hasta que una agencia lo pida. Exige una tabla por usuario con `tenant_id`, RLS y migración (ruta protegida) | §3.1: es un «el día que…» |
| Exportar CSV | Solo con `reportes.ver_agencia` y, para dinero confidencial, además `cotizacion.ver_neto_y_margen`. Celdas que empiecen por `=`, `+`, `-`, `@`, tabulador o retorno de carro llevan `'` delante. Sin PII de viajeros (ni pasaporte, ni nacimiento, ni edades de niños) y sin texto de mensajes. Una fila por moneda | Un CSV sale del sistema y no tiene RLS |
| Parámetro `asesor` | Solo con `reportes.ver_agencia`. Sin el permiso, si se pide otro asesor el servidor responde **403**, no recorta en silencio | Una pantalla titulada «Beto» con los datos de Valentina miente |

---

## 3. Qué va en «Hoy» y qué va en Reportes

| | **Hoy** (`/`) | **Reportes** (`/reportes`) |
|---|---|---|
| Pregunta | ¿Qué hago ahora? | ¿Cómo voy? ¿Cómo va la agencia? |
| Tiempo | Este instante. Sin selector de periodo | Un periodo (por defecto este mes, pregunta 7) y el anterior para comparar |
| Forma | Contador + las 3 primeras filas + «Ver todo» que abre la pantalla de destino ya filtrada | Tarjetas de cifras con su `n`, cohorte y comparación |
| Porcentajes | **Ninguno** | Sí, con el umbral de `n` |
| Cada fila | Lleva al objeto en un toque (conversación, archivo, cotización, seguimiento) | Lleva a la lista que explica la cifra |
| Dinero | Solo el saldo de un archivo concreto, en su moneda | Agregados por moneda |
| Margen | Nunca | Solo con permiso y solo en administración |

**Contenido de «Hoy»**, en el orden del Flujo 2 de [`04-flujos-criticos.md`](../01-producto/04-flujos-criticos.md),
de lo que más dinero cuesta a lo que menos:

| # | Bloque | Métrica | Asesor | Dueña |
|---|---|---|---|---|
| 1 | Plazos con el mayorista (48 h y vencidos) | M5 | Los de sus archivos | Todos, con el filtro «Míos» |
| 2 | Cobros vencidos y por vencer | M6 (`VENCIDO`, `POR_VENCER`) | Los de sus archivos | Todos |
| 3 | Por responder (SLA vencido primero) | M1 y M2 | Asignadas + la cola, contada aparte | Todas, más «Sin asignar» |
| 4 | Seguimientos vencidos y de hoy | M3 | Los suyos (ya funciona [V]) | Los de todos, con «Míos» |
| 5 | Cotizaciones enviadas sin respuesta hace más de 2 días o con vigencia por vencer | M4 | Las suyas | Todas |

Al pie de «Hoy», un único enlace: «Mis números» (asesor) o «Reportes de la agencia» (dueña). **No** van
en «Hoy» la tasa de aceptación, el embudo, las ventas del mes, el margen ni el catálogo. Hoy sí están
[V: `apps/web/src/app/(app)/page.tsx`] las tarjetas «Oportunidades en Pipeline» y «Catálogo de
excursiones», que no son accionables.

---

## 4. Qué NO se muestra a cada nivel y por qué

| Dato | Asesor (propio) | Operaciones (propuesta: propio) | Dueña (agencia) | Por qué |
|---|---|---|---|---|
| Cifras de otro asesor (con nombre o deducibles) | **No** | **No** (salvo pregunta 2) | Sí | Decisión del propietario: entre asesores es requisito de **seguridad**, no de presentación. Se prueba con dos asesores (T-346) |
| Totales de la agencia sin nombres | **No** (pregunta 4) | No | Sí | Con 3 asesores, total − lo mío ≈ lo de los otros dos |
| Ranking de asesores | **No** (pregunta 5) | No | Sí | Mismo motivo |
| Neto, margen, costo del mayorista, comisión | **No** sin `cotizacion.ver_neto_y_margen` | No | Sí, con el permiso | La tarifa neta es una condición comercial confidencial con el mayorista: si sale con un asesor que se va, sale hacia la competencia. Sin el permiso **la API no calcula ni devuelve** esas claves (ADR-0011) [V: `incluirMargen`]. Ocultarlas en la web no basta |
| PII de viajeros: documento, pasaporte, fecha de nacimiento, edades de niños | **Nunca** | **Nunca** | **Nunca** en reportes ni en CSV | R10 y Ley 1581. Un reporte muestra **conteos** de pasajeros; el detalle vive en el archivo, bajo `archivo.ver` |
| Texto de mensajes, notas y preferencias | Nunca | Nunca | Nunca | R10. Los reportes agregan y no citan |
| Nombre del contacto en una fila de detalle | Solo si ya lo ve en su bandeja o en el archivo | Ídem | Sí | Regla de coherencia §1.1 |
| Datos de otra agencia | Nunca | Nunca | Nunca | R1, RLS. Tampoco agregados entre agencias |
| Exportar | No | No | Sí | Un CSV no tiene RLS |

---

## 5. Los dos dashboards propuestos

Principios para los dos, a 390 px: una columna, tarjetas y no tablas anchas; cada cifra con su moneda en
una fila propia, nunca dos monedas sumadas en una línea; objetivos táctiles de al menos 44 px (el patrón
`min-h-[44px]` ya está en las pantallas [V]); sin interacciones que dependan del cursor; el periodo y la
zona horaria siempre visibles. Una cifra en COP se muestra completa, sin abreviar a «M», porque el
redondeo cambia el número que la dueña compara con su hoja.

### 5.1 Dashboard del asesor (móvil primero), T-343

**Pantalla A1: «Hoy» del asesor.** Los cinco bloques de §3, cada uno independiente.

```text
┌──────────── 390 px ────────────┐
│ Hola, Valentina    [🔍]        │  ← cabecera con lupa fija (D4)
│ Hoy, mar 24 nov · America/Bogota│
├────────────────────────────────┤
│ Plazos con mayorista       2 › │  ← contador; toca y abre /viajes filtrado
│  File 1043 · time limit 18 h   │
│  File 1051 · pago total vencido│
├────────────────────────────────┤
│ Cobros                     1 › │
│  File 1038 · vencido · saldo   │
│  $ 1.200.000 COP               │
├────────────────────────────────┤
│ Por responder              4 › │
│  2 con SLA vencido · cola: 3   │
├────────────────────────────────┤
│ Seguimientos               3 › │
├────────────────────────────────┤
│ Cotizaciones sin respuesta 5 › │
├────────────────────────────────┤
│ Mis números ›                  │
└────────────────────────────────┘
 [Hoy][Conversaciones][Cotizar][Archivos][Más]
```

(Datos ficticios.)

**Pantalla A2: Reportes › «Mis números».** Selector de periodo arriba (este mes por defecto) y tarjetas
apiladas:

1. **Mis cierres**: M7, una fila por moneda, con «n cotizaciones aceptadas» y la variación frente al
   periodo anterior solo si los dos tienen `n ≥ 20`.
2. **Mis cotizaciones**: M8 como fracción «7 de 15 aceptadas», y M4 en tramos.
3. **Mi primera respuesta**: M9 con mediana, p90, `n` y cuántas sin responder.
4. **Mis seguimientos a tiempo**: M10.
5. **Mis cobros por cobrar**: M6, por moneda y por estado. **No aparece** hasta que exista T-330: no se
   muestra una tarjeta en cero que finja un dato.
6. **Mis salidas próximas**: M11, solo conteos.

Hoy, `/reportes` tiene un conmutador «Vista Dueño / Vista Asesor» [V]. **[P]** Se retira. La vista la
decide el servidor con la sesión: el asesor ve «Mis números» y la dueña ve «Agencia», con una pestaña
«Mis números» porque también vende ([`03-personas.md`](../00-vision/03-personas.md) §2).

### 5.2 Dashboard de administración, T-344

**Pantalla B1: «Hoy» de la agencia.** Los mismos cinco bloques con alcance agencia, el filtro
«Míos / Todos» (Flujo 2, criterio ya escrito) y el nombre del asesor en cada fila.

**Pantalla B2: Reportes › Agencia.** En escritorio es una rejilla de 3 columnas. En tablet, 2. En móvil,
una, con estas secciones plegables y en este orden:

| Sección | Métricas | En escritorio | En móvil (390 px) |
|---|---|---|---|
| Resumen | M7, M8, M12 (tasa) y M9, con la variación frente al periodo anterior | 4 tarjetas en fila | 4 tarjetas apiladas |
| Margen | M15 | Fila por moneda con cobertura | Ídem, una tarjeta por moneda |
| Equipo | M16 | Tabla: asesor × (carga, cierres por moneda, aceptación «x de n», mediana de respuesta) | **Una tarjeta por asesor**, con un selector de métrica para ordenar. Sin tabla ancha |
| Embudo | M12 y luego M13 | Barras horizontales por etapa | Las mismas barras, a todo el ancho |
| Ventas por destino y paquete | M14 | Tabla de las 10 primeras por moneda | Lista de las 5 primeras por moneda + «Ver todo» |
| Pérdidas | M17 | Barras por motivo | Ídem |
| Cobros | M18 | Por estado y moneda | Ídem |
| Salidas próximas | M11 | Por semana | Por semana, en conteos |

**Pantalla B3: Consultas (T-345).** Filtros de §2.3 y el botón «Exportar CSV». En móvil, los filtros
van en una hoja inferior y la exportación se ofrece igual, porque descargar desde el celular es legítimo.

### 5.3 Estados de cada tarjeta (los dos dashboards)

| Estado | Qué se ve | Lo que no se hace |
|---|---|---|
| Cargando | Esqueleto **por tarjeta**, con el alto final para que nada salte | Una sola espera para toda la pantalla |
| Vacío (agencia nueva o periodo sin actividad) | «Aún no hay cierres este mes», y un enlace a la acción (Conversaciones, Cotizar) | Ceros que parecen un mal mes |
| Muestra insuficiente | «7 de 15» en lugar del porcentaje, con la nota «menos de 20» | Un porcentaje con `n` = 3 |
| Error de una fuente | La tarjeta afectada dice qué falló y ofrece «Reintentar». Las demás se muestran. «Hoy» ya separa el error de seguimientos [V] | Pantalla en blanco, ceros de respaldo o maqueta |
| Sin permiso (403) | Solo si se llega por URL a una vista de administración: «Esta vista es de administración». El menú del asesor nunca lleva ahí | Mostrar la vista vacía como si no hubiera datos |
| Dato no capturado | Solo en administración y solo donde se decida mostrarlo, por ejemplo «El origen se registra desde el 1 dic» | Un filtro o una tarjeta sin fuente |
| Sesión vencida (401) | Ir a ingresar [V: `esSesionExpirada` en `page.tsx`] | Ceros |

### 5.4 Verificación en celular, tablet y escritorio (T-346)

| Viewport | Asesor (A1, A2) | Administración (B1, B2, B3) |
|---|---|---|
| **390 × 844** (caso principal) | `document.documentElement.scrollWidth <= innerWidth`; los cinco bloques de «Hoy» con contador a la vista sin desplazarse de lado; objetivos ≥ 44 px; contraste AA; captura | Ídem; «Equipo» en tarjetas; la exportación es alcanzable |
| **768 × 1024** (tablet) | 2 columnas sin cortes de cifra | 2 columnas; tabla de equipo permitida si cabe sin desplazamiento lateral |
| **1440 × 900** (escritorio) | Un *time limit* a 30 h se ve sin desplazarse (criterio del Flujo 2) | Resumen, margen y equipo a la vista sin desplazarse |

En los tres: un periodo con COP y USD muestra dos filas y ningún total combinado; la zona horaria se lee
en la cabecera; el modo oscuro conserva el contraste.

---

## 6. Hallazgos verificados en el código que afectan a este eje

Clasificados según CLAUDE.md §3.1. Ninguno es una fuga **entre agencias**: todo ocurre dentro de un mismo
tenant y bajo RLS.

| # | Hallazgo [V] | Evidencia | Categoría |
|---|---|---|---|
| H1 | Cualquier miembro lee el resumen **de toda la agencia**. El menú «Reportes» no lleva permiso, así que hoy un asesor ve embudo, ventas por moneda y respuesta de la agencia, sin margen. La «Vista Asesor» de la web solo oculta el margen | `reportes.controller.ts` (sin `@RequierePermiso` ni alcance); `navegacion.ts` (entrada `reportes` sin `permiso`); `reportes/page.tsx` (`rolEfectivo`) | **Bloqueante del Eje F**, porque contradice la decisión vigente. Lo cierra T-342. Medida provisional: pregunta 12 |
| H2 | `GET /crm/seguimientos/pendientes-del-dia?asesorId=<uuid>` y `GET /crm/seguimientos?asesorId=` devuelven los seguimientos de **cualquier** asesor de la agencia, sin permiso | `crm.controller.ts` (`pendientesDelDia`), `gestionar-seguimientos.ts` | **Bloqueante del Eje F**. Va en T-342 y en el e2e de T-346 |
| H3 | Las cifras de «Hoy» no miden lo que dicen. «Conversaciones pendientes» = `sinAsignar + conversacionesSinLeer`, que no es «sin responder». «Cotizaciones por vencer» = `ENVIADA` o `BORRADOR` entre las **20 más recientes de la agencia**, sin mirar la vigencia. La tarjeta de reportes promete «ventas … en pesos COP» | `inicio-logica.ts` (`calcularResumenTrabajo`), `crm-api.ts` (`listarCotizacionesApi({ limite: 20 })`), `page.tsx` | **Bloqueante de T-343**: una cifra que no cuadra hace que la asesora deje de creerle a todas ([`03-personas.md`](../00-vision/03-personas.md) §1) |
| H4 | El umbral de muestra difiere: 20 en la web y 5 en el 06 | `reportes-logica.ts`; [`06-roadmap-de-reportes.md`](06-roadmap-de-reportes.md) §2.1 | Cola. Se resuelve con la fracción «x de n» (§2) |
| H5 | `roadmap/tasks.yaml` está desfasado: T-131 (`oportunidad_cambios_etapa` y `cerrada_en` escrito), T-132 (`cotizacion_cambios_estado`) y la parte de T-136 que arma `sla_vence_en` con 15 min fijos ya están en el código, pero siguen en `backlog` | `schema.prisma`; `crm.prisma.ts` (`cerradaEn`); `plazo-de-primera-respuesta.ts` | Cola, para el `dueno-de-producto` |
| H6 | Las pantallas de archivos de viaje y de cotizaciones muestran **toda la agencia** a cualquier miembro con el permiso de lectura. No hay filtro por asesor | `archivos.controller.ts` (`listar`), `cotizaciones.controller.ts` (`listar`), contrato `ListarCotizaciones` | Decisión de producto, no de reportes: pregunta 10 |
| H7 | `travel_files` no tiene asesor. Un archivo sin oportunidad no tiene dueño | `schema.prisma` (`TravelFile`) | Lo declara T-340 (tabla 1.3) |
| H8 | El periodo por defecto de `/reportes` son los últimos 30 días, no el mes calendario | `reportes/page.tsx` (`ultimos_30_dias`) | Cola: pregunta 7 |

---

## 7. Preguntas abiertas para el propietario

Cada una se responde con una palabra. Entre corchetes va lo que se construye si no hay respuesta.

1. ¿Alguna agencia piloto tiene un coordinador que supervise **solo a una parte** de los asesores
   (nivel «equipo»)? **Sí / No** [No: no se construye el nivel equipo]
2. ¿`OPERACIONES` ve los reportes comerciales de **toda la agencia** (ventas, embudo y respuesta por
   asesor, nunca margen)? **Sí / No** [No: su trabajo de agencia lo ve en Archivos de viaje y en Cobros]
3. ¿Una venta se le cuenta a **quien cotizó**, aunque después se reasigne la oportunidad?
   **Sí / No** [Sí: `cotizaciones.creado_por`]
4. ¿El asesor ve el **total de la agencia** sin nombres («la agencia cerró 18 este mes»)?
   **Sí / No** [No]
5. ¿El asesor ve un **ranking** de asesores? **Sí / No** [No]
6. ¿Algún asesor debe ver **margen**, aunque sea solo de sus ventas? **Sí / No** [No: hoy el permiso
   de margen es de toda la agencia y no existe un «margen propio»]
7. ¿El periodo por defecto es **este mes** calendario, en lugar de los últimos 30 días?
   **Sí / No** [Sí]
8. ¿Basta con comparar contra el **periodo anterior** del mismo largo, sin comparar con el año anterior?
   **Sí / No** [Sí]
9. ¿El dashboard de administración muestra un **total convertido a COP** con la TRM, además de las
   cifras por moneda? **Sí / No** [No]
10. ¿El asesor sigue viendo en **Archivos de viaje** los archivos de otros asesores (H6)?
    **Sí / No** [Sí, como hoy: no se toca en este eje]
11. ¿«Hoy» del asesor incluye la **cola sin asignar**? **Sí / No** [Sí, contada aparte]
12. Mientras llega T-342, ¿se **cierra ya** `GET /reportes/resumen` a quien no tenga
    `conversaciones.ver_todas`? El asesor vería «Esta vista es de administración» hasta tener «Mis
    números». **Sí / No** [Sí: es un cambio de una línea y cierra H1 sin esperar al ADR]
13. ¿**Exportar CSV** solo con alcance de agencia? **Sí / No** [Sí]
14. ¿Los **filtros guardados** por usuario esperan a que una agencia los pida (mientras tanto, filtros en
    la URL)? **Sí / No** [Sí]

---

## 8. Cómo se parte el trabajo (T-340 a T-346) y cambios propuestos a `tasks.yaml`

Esta propuesta se escribió sin tocar `roadmap/tasks.yaml`; las tareas T-340 a T-346 ya están
registradas en él y el ADR-0035 ya existe. Lo que sigue se conserva como razonamiento original.

### 8.1 Orden y dependencias

```text
T-339 (este doc) ─► T-340 ADR ─► T-341 permiso ─► T-342 alcance en servidor ─┬─► T-343 asesor ─┐
                                                                              │   (+T-138, T-139) ├─► T-346
     (pregunta 12: cierre provisional de H1, sin esperar) ──────────────────────┘                 │
                                                                              └─► T-344 admin ───┘
                                                                                  (+T-140) ─► T-345
```

### 8.2 Ajustes propuestos a los criterios de aceptación

| Tarea | Criterio actual (resumen) | Cambio propuesto |
|---|---|---|
| **T-340** ADR | Niveles, absorbe T-141, imposición en servidor; relación con visibilidad, margen y agencias | **Añadir:** (a) el nombre del permiso (`reportes.ver_agencia` o `reportes.ver_equipo`); (b) la tabla de atribución §1.3, también el archivo sin oportunidad; (c) «equipo» nombrado y no construido; (d) la regla de coherencia §1.1; (e) 403 explícito cuando el parámetro pide más que el alcance; (f) que H2 entra en su alcance; (g) dónde se calcula el saldo agregado de M6: en SQL, con riesgo de divergir del dominio, o con las funciones de `cobro` por archivo, válido mientras una agencia quepa en 500 archivos |
| **T-341** permiso | `CHECK` y sembrado (administrador todos; asesor lo propio) | **Precisar:** el `CHECK` pasa de 14 a 15 permisos; el relleno de las agencias existentes da `reportes.ver_agencia` a `DUENO` (y a `OPERACIONES` solo si la pregunta 2 dice Sí); se refleja en `PERMISOS` de `packages/contracts` y en `ROLES_SEMBRADOS`. El sembrado del asesor no recibe nada: «lo propio» es la **ausencia** del permiso, no otro permiso |
| **T-342** alcance | El servidor fuerza el asesor; e2e dos asesores y dos agencias; margen protegido | **Añadir:** (a) **una sola función** `alcanceDeReporte(contexto)` en `apps/api/src/shared/autorizacion/`, como `visibilidadDe`, que reciben todos los puertos de `puertos-de-reportes.ts`; (b) cubre también `seguimientos` y `pendientes-del-dia` (H2); (c) la atribución de M9 por `mensajes.autor_id`; (d) un e2e por cada puerto con un `$queryRaw` (la guardia de consultas sin filtro no ve SQL crudo, 06 §5.2). **Partir si pasa de 3 días:** T-342a resumen + seguimientos, T-342b los endpoints nuevos de T-138 y T-139 |
| **T-343** asesor | Pendientes, cotizaciones abiertas, seguimientos vencidos, cierres del mes y cobros; 390 px; estados | **Dependencias:** añadir T-138 y T-139 (sin ellas no hay M1, M2 ni M4). Cobros (M6) **condicionado a T-330**: hasta entonces el bloque no aparece. **Añadir:** corregir H3 (las cifras de «Hoy» miden lo que dicen) y retirar el conmutador «Vista Dueño / Vista Asesor». **Viewports:** 390, 768 y 1440 |
| **T-344** admin | Embudo, ventas por moneda, destino y asesor, respuesta, cobros, salidas; comparación; margen con permiso | **Partir:** T-344a con lo que ya da el resumen (M7, M8, M9, M12, M15) más la comparación de periodos, que ya existe en la web [V: `rangoAnterior`]; T-344b con M14, M16 y M17 cuando esté T-140, y M18 y M11 cuando estén T-332 y T-148. Así entra valor sin esperar a cobros |
| **T-345** consultas | Filtros (periodo, asesor, moneda, origen), filtros guardados, CSV con escapado y sin margen sin permiso | **Recortar:** filtros en la URL; **filtros guardados a la cola** (pregunta 14); **origen fuera** hasta T-133. **Añadir:** CSV sin PII de viajeros, una fila por moneda, solo con alcance de agencia |
| **T-346** pruebas | Capturas a 390 px; e2e: el asesor no ve lo de la agencia ni lo de otro asesor | **Añadir:** (a) el caso «asesor pide `?asesorId=` de un compañero → 403» en reportes **y** en seguimientos; (b) la ausencia de las claves de margen en **todas** las respuestas JSON y en el CSV; (c) capturas a 768 y 1440 además de 390; (d) agencia con COP y USD: ninguna pantalla suma las dos |

### 8.3 Tareas nuevas o de estado que conviene registrar

- **[P] T-nueva, P1, `backend`:** cierre provisional de H1 (pregunta 12). Una línea de permiso en
  `reportes.controller.ts` y su e2e. Se retira cuando T-342 entra.
- **[P] Actualizar el estado** de T-131, T-132 y T-136 en `roadmap/tasks.yaml` según H5, lo que hoy
  está en el código (`dueno-de-producto`).
- **[P] A la cola, sin dueño de construcción:** nivel «equipo» (si la pregunta 1 dice Sí) y filtros
  guardados (pregunta 14).

### 8.4 Qué podría sesgar este catálogo

- **Un solo cliente.** Lo que se sabe del uso viene de JD Tours (dos audios y la confirmación de que
  todo se hace desde el celular). `experto-turismo` debe validar que la atribución de §1.3 sirve en una
  agencia donde una persona cotiza y otra cierra.
- **Ventas por clic manual.** M7, M8, M14 y M16 dependen de que la asesora marque `ACEPTADA`.
- **Coexistencia sin verificar.** Si se responde desde WhatsApp Business en el celular y los ecos no
  entran a la base (T-337), M1 y M9 cuentan como sin responder conversaciones que sí se atendieron. Es
  justo el caso de JD Tours.
- **`n` pequeño por asesor.** Con 3 a 6 asesores y unas 40 conversaciones al día cada una
  ([`03-personas.md`](../00-vision/03-personas.md) §1, cifra de arquetipo), M9 tiene `n` suficiente al
  mes; M8 por asesor, casi nunca: por eso la fracción y no el porcentaje.

## 9. Aportes de la sesión de cobros (fundidos desde un borrador duplicado)

La sesión de cobros escribió en paralelo un borrador del mismo entregable (cerrado como duplicado; su
texto vive en la rama `i/T-339-reportes-por-nivel`, commit `da094f3`). Lo que traía de más, con su
estado:

1. **[V, por esa sesión] La exportación de hoy no deja rastro.** Los CSV actuales se generan en el
   navegador: el servidor no sabe que alguien exportó. Una exportación con datos personales (nombres,
   teléfonos) debe hacerse en el servidor, con permiso y auditoría (R10). Entra en T-345.
2. **[P] Tablet vertical a 768 px.** Con el menú lateral de 56 o 240 px quedan unos 528 px útiles: la
   tablet vertical se diseña como «celular ancho», no como escritorio pequeño. Complementa §5.4.
3. **Preguntas adicionales para el propietario** (sin valor por defecto escrito; responden al
   diseño de los dashboards): ¿qué mira cada asesor al empezar el día?; ¿qué tres cifras quiere el
   dueño en el celular?; ¿qué exporta hoy a su hoja, cada cuánto, para quién y desde qué dispositivo?;
   ¿otro asesor necesita ver el saldo de un archivo cuando el titular falta?; ¿compara meses o tiene
   metas de venta?; ¿alguna lista con nombres o teléfonos sale de la agencia?
4. **Tareas nuevas propuestas** (registradas en `roadmap/tasks.yaml`): reportes de cobros (saldo por
   cobrar por asesor y moneda, cobrado en el periodo por medio de pago, correcciones; depende de T-330 y
   T-342); ventas por mayorista a partir de `bookings.mayorista_nombre` y decidir qué queda de T-149;
   re-basar T-148 (salidas próximas) sobre `travel_files`.
5. **[V, ADR-0034] Precisión sobre cobros para M6 y M18.** El estado de pago es del archivo de viaje; el
   libro tiene AJUSTE y PENALIDAD (total = venta + ajustes vigentes si está abierto; suma de penalidades
   vigentes si está cancelado) y la situación POR_VENCER (0 a 7 días). `cobro.ver` está sembrado al
   ASESOR con alcance de toda la agencia: el ADR-0034 §6 deja «que el asesor vea solo lo suyo» a
   T-339 y T-340, con la atribución del archivo por `oportunidad.asesor_id` (un archivo sin
   oportunidad no aparece en el «propio» de nadie, §1). Las funciones puras del saldo viven en
   `packages/domain` (cobro.ts, en el PR de T-330 de esa sesión) y se citan en el ADR de T-340 para el
   saldo agregado.
