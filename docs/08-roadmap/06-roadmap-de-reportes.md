# Roadmap de reportes

| | |
|---|---|
| Fecha | 2026-11-04 |
| Autor | `analista-datos`, a pedido del propietario |
| Base verificada | `origin/main` en `c908656` (merge del PR #205). Solo lectura: no se ejecutó base ni servicios |
| Relación | Detalla la fila «Reportes» de `02-roadmap-producto-v3.md` (Fase 3 allí) y la adelanta: lo vital entra con la piloto |
| Tareas | `roadmap/tasks.yaml`, T-131 a T-151 (campo `owner`) |
| Estado vivo | `ESTADO.md` y `roadmap/tasks.yaml` mandan sobre este documento |

## 0. Resumen

Una agencia pequeña que vende por WhatsApp se gobierna con **ocho preguntas**. Hoy el esquema
responde bien cuatro (pendientes de atención ahora, seguimientos vencidos, carga por asesor y la foto
del embudo) y a medias tres (primera respuesta, cotizaciones y su antigüedad, ventas y margen). La
octava, el origen del lead, **no tiene dato**. Las que quedan a medias tienen el mismo problema: el
sistema guarda el **estado actual**, pero no **cuándo cambió**.

Lo urgente no es la pantalla, es la captura. Un reporte se puede construir en una semana, pero los
meses de historial que no se guardaron no se recuperan nunca. Por eso las tareas P0 de este roadmap
son de captura (T-131 a T-136), y las de reporte son P1.

La pantalla `/reportes` actual **no sirve para decidir**. Calcula todo con las 20 tarjetas más
recientes de cada columna del tablero, ignora el periodo que se elige, fuerza la moneda a COP y
(en `main`) inventa un margen del 20 %. Ver §7.

**El PR #213** (rama `a/T-000-api-reportes-resumen`, abierto) construye `GET
/api/v1/reportes/resumen` en un módulo `analytics` nuevo. Cubre cotizaciones creadas, enviadas y
aceptadas; ventas por moneda sin mezclar (neto y margen solo con permiso); oportunidades por etapa
con su conversión; y el tiempo de primera respuesta (promedio y mediana). Este roadmap **no
duplica** ese endpoint: lo extiende donde le falta algo (§7) y pone la web a consumirlo (T-142).
Su autor llegó a los mismos huecos de captura que esta revisión (D1 a D3), y por eso son P0.

---

## 1. Cómo trabaja de verdad la agencia y qué tiene que ver cada quien

El ciclo de una agencia pequeña de excursiones y paquetes (JD Tours es el caso):

```
Mensaje de WhatsApp ─► primera respuesta ─► oportunidad ─► cotización enviada ─► seguimiento(s)
   (anuncio, orgánico,      (minutos: si tarda,              (versión que vio       (el cliente
    referido, recompra)      el cliente le escribe            el cliente)            «lo piensa»)
                             a otra agencia)                          │
                                                   aceptada ─► salida / archivo de viaje ─► cobro
                                                   rechazada / vencida / sin respuesta ─► motivo de pérdida
```

Dónde se pierde la plata, en orden:
1. **Respuesta lenta.** En WhatsApp el cliente escribe a tres agencias a la vez, y suele quedarse
   con la que contesta primero.
2. **Cotización enviada y olvidada.** El cliente no dice que no: deja de contestar. Si nadie le
   hace seguimiento en 48 horas, la venta se va.
3. **No saber qué se vende ni con qué margen.** El dueño reparte esfuerzo por intuición entre
   destinos, mayoristas y asesores.
4. **No saber de dónde vienen los clientes.** Se paga pauta en Meta sin saber cuántas ventas trae.

| Rol (rol sembrado) | Qué necesita | Horizonte |
|---|---|---|
| **Asesor** (`ASESOR`) | Qué tengo que hacer ya: conversaciones sin responder, ventanas de 24 h por cerrarse, cotizaciones abiertas, seguimientos vencidos. Sus propias cifras | Hoy y esta semana |
| **Dueño** (`DUENO`) | Si el negocio funciona: atención, conversión, ventas y margen por moneda, motivos de pérdida, origen, carga del equipo | Semana, mes y cohorte |
| **Operaciones** (`OPERACIONES`) | Qué sale y con cuántos pasajeros: salidas próximas, pasajeros por fecha y punto de encuentro, cotizaciones aceptadas sin trámite | Próximos 7 a 30 días |

---

## 2. Reglas comunes a todos los reportes

1. **Toda cifra lleva su `n` y su periodo.** Si `n < 5`, la API devuelve el conteo pero **no**
   devuelve porcentajes ni percentiles (`muestraInsuficiente: true`). Una mediana de tres datos es
   peor que no mostrar nada.
2. **Mediana y p90, nunca promedio**, en tiempos y en valores de venta. Las colas largas son la
   norma: una conversación del viernes a las 22:00 que se responde el lunes.
3. **Cohortes y no acumulados.** Las tasas de cierre y de aceptación se calculan por mes de creación
   (o de envío). Un acumulado siempre sube y no enseña nada.
4. **El dinero se agrupa por `moneda_iso`, siempre.** La API devuelve una lista `Dinero[]` con una
   entrada por moneda y no tiene ningún campo «total» que mezcle monedas. No se convierte por TRM:
   esa conversión es otra métrica, se declara aparte y se hace con la TRM congelada (R8).
5. **Margen nulo es «desconocido», no cero.** Cada cifra de margen viene con su cobertura («margen
   conocido en 31 de 40 ventas»), y el porcentaje de margen se calcula solo sobre ese subconjunto:
   Σ margen / Σ venta **de las mismas filas**.
6. **Lo borrado no cuenta** (`eliminado_en IS NULL`), y se dice.
7. **Permisos.** **Hoy no existe ningún permiso de lectura de reportes**: con el PR #213, cualquier
   miembro de la agencia lee el resumen de toda la agencia (no hay fuga entre agencias, porque es
   todo del mismo tenant, pero es una decisión de política que nadie ha tomado). Propuesta (T-141):
   un permiso nuevo, `reportes.ver_equipo`, sembrado en `DUENO` y `OPERACIONES`. Exige migración del
   `CHECK` de permisos de `roles`. Sin ese permiso, el reporte se limita a lo del propio asesor.
   Mientras no exista, el alcance de equipo se puede atar a `conversaciones.ver_todas`. Neto y margen exigen `cotizacion.ver_neto_y_margen`, y sin él
   **la API no calcula ni devuelve** esos campos: ocultarlos en la web no basta (ADR-0011).
   Ningún reporte devuelve texto de mensajes, preferencias ni documentos de viajeros (R10). La
   lista de detalle muestra el nombre del contacto, y solo dentro del alcance que el usuario ya ve
   en la bandeja.

---

## 3. Catálogo de reportes

Leyenda del dato: **SÍ** (existe y se escribe), **PARCIAL** (existe pero incompleto o no se
escribe), **NO** (no existe).

### R1. Primera respuesta y SLA — Dueño, y Asesor (lo suyo)

- **Pregunta.** ¿Cuánto tardamos en contestar al cliente que escribe y cuántas veces incumplimos el
  plazo comprometido?
- **Métrica.** Un **episodio** empieza con un mensaje `ENTRANTE` cuyo mensaje anterior en la
  conversación es un `SALIENTE` humano, o que no tiene mensaje anterior. Para buscar el anterior
  solo se miran entrantes y salientes con `autor_id` no nulo y `estado <> 'FALLIDO'`.
  - Tiempo de primera respuesta = `ocurrido_en` del primer `SALIENTE` humano no fallido posterior −
    `ocurrido_en` del entrante que abre el episodio.
  - Se reportan la **mediana** y el **p90** en minutos sobre los episodios **respondidos**, y aparte
    el número de **episodios sin respuesta** con su antigüedad. Excluirlos sin decirlo baja la
    mediana y miente.
  - % en SLA = episodios respondidos dentro del SLA ÷ (episodios respondidos + episodios sin
    respuesta cuyo plazo ya venció).
  - Denominador y ventana: episodios cuyo inicio cae en el periodo, en la zona del tenant.
- **Dimensiones y filtros.** Asesor que respondió (`autor_id` de la respuesta), canal, día de la
  semana y hora local de inicio, dentro o fuera del horario de atención.
- **Dato.**
  - `mensajes.direccion`, `ocurrido_en`, `autor_id`, `estado`: **SÍ**.
  - `conversaciones.primera_respuesta_en`: **PARCIAL**. Se fija una sola vez en toda la vida de la
    conversación (`conversaciones.prisma.ts` L435), y como hay una conversación por (contacto,
    canal), el cliente que vuelve tres meses después nunca se mide. Por eso no sirve como fuente.
  - `conversaciones.sla_vence_en`: **NO**. La columna existe y **ningún código la escribe**:
    solo la migración `20261011090000` la crea. **Consecuencia actual:** el filtro `SLA_VENCIDO`
    de la bandeja (`conversaciones.prisma.ts` L137) nunca devuelve nada.
  - Política de SLA por agencia: **NO**. La pantalla de Configuración que la muestra es maqueta.
  - Horario de atención: **NO**.
- **Política (R12), tabla por agencia.** Minutos de SLA, horario de atención semanal y horas de
  silencio que abren un episodio nuevo aunque el último mensaje haya sido entrante. Valores por
  defecto que se declaran en pantalla: 15 minutos, lunes a sábado de 8:00 a 18:00, 12 horas.
- **Sesgos.** Si el asesor responde desde el celular con la app de WhatsApp Business en
  coexistencia, ese saliente no entra a la base y el episodio aparece sin respuesta (**no
  verificado** si recibimos ecos). Mientras no haya horario de atención, el reporte mide tiempo
  de calendario, y la consulta de un domingo pesa igual que la de un martes.

### R2. Pendientes de atención ahora — Asesor y Dueño

- **Pregunta.** ¿A quién hay que contestar ya, y a quién se le cierra la ventana de 24 h?
- **Métrica.**
  - Conversaciones con `ultimo_mensaje_direccion = 'ENTRANTE'` y `estado <> 'CERRADA'`, con
    antigüedad = ahora − `ultimo_mensaje_cliente_en`, en tramos de < 15 min, 15–60 min, 1–4 h y
    > 4 h.
  - Ventana por cerrarse: `ultimo_mensaje_cliente_en + 24 h` entre ahora y ahora + 4 h.
  - Sin asignar: `asignado_a_id IS NULL`.
- **Dimensiones.** Asesor asignado y canal.
- **Dato.** `conversaciones.ultimo_mensaje_direccion`, `ultimo_mensaje_cliente_en`,
  `asignado_a_id`, `estado`: **SÍ**. Hay índices `idx_conversaciones_ventana` y
  `(tenant_id, asignado_a_id, ultimo_mensaje_en)`.
- **Permisos.** Visibilidad de conversaciones: lo que el asesor ve en la bandeja y nada más.
- **Política.** El umbral de los tramos sale del SLA de R1.
- **Sesgo.** `ultimo_mensaje_direccion` avanza con mensajes automáticos. Una automatización que
  contesta «ya te atendemos» saca la conversación de los pendientes. Hoy no hay automatizaciones,
  pero al construirlas hay que filtrar por autor humano.

### R3. Cotizaciones enviadas, aceptadas y su antigüedad — Asesor y Dueño

- **Pregunta.** ¿Cuántas cotizaciones están en la calle sin respuesta, desde cuándo, y qué fracción
  de lo enviado se acepta?
- **Métrica.**
  - Abiertas: `estado = 'ENVIADA'`, con antigüedad = hoy − `enviada_en` en tramos de 0–2, 3–7,
    8–14 y > 14 días.
  - Vencidas de hecho: `ENVIADA` y `versiones_cotizacion.vigente_hasta < hoy (zona del tenant)` de
    la versión enviada. **No** se usa `estado = 'VENCIDA'`, porque ese estado solo se marca a mano.
  - Tasa de aceptación por **cohorte de mes de envío** = cotizaciones de la cohorte con
    `estado = 'ACEPTADA'` ÷ cotizaciones de la cohorte con `enviada_en` no nulo. Se publica con
    retraso: la cohorte del mes en curso se marca «abierta».
  - Tiempo hasta la decisión: mediana de `decidida_en − enviada_en`.
  - Versiones por cotización aceptada: cuántas veces se recotizó.
- **Dimensiones.** Asesor (`cotizaciones.creado_por`), paquete, destino, moneda y tramo de valor.
- **Dato.**
  - `cotizaciones.estado`, `enviada_en`, `version_enviada`; `versiones_cotizacion.*`: **SÍ**.
  - Instante de aceptación o rechazo: **NO**. Solo existe `actualizado_en`, que se mueve con
    cualquier edición. Se captura con T-132.
- **Permisos.** El valor de venta lo ve todo el que ve la cotización. Neto y margen, no (regla 7).
- **Política.** Los tramos de antigüedad son tabla por agencia en V1. En piloto van fijos y se
  declaran.

### R4. Seguimientos vencidos y oportunidades sin próximo paso — Asesor y Dueño

- **Pregunta.** ¿Qué compromisos con clientes se nos pasaron, y qué oportunidades vivas no tienen
  a nadie detrás?
- **Métrica.**
  - Vencidos: `seguimientos.completado_en IS NULL AND vence_en < ahora`, con días de atraso en la
    zona del tenant.
  - % cumplido a tiempo (por semana de vencimiento) = `completado_en <= vence_en` ÷ seguimientos que
    vencieron en la semana.
  - Oportunidades huérfanas: oportunidades vivas (etapa ni ganada ni perdida, sin borrar) sin
    ningún seguimiento pendiente.
- **Dimensiones.** Asesor (`seguimientos.asesor_id`) y etapa de la oportunidad.
- **Dato.** `seguimientos.vence_en`, `completado_en`, `asesor_id`, `oportunidad_id`: **SÍ**, con el
  índice parcial `idx_seguimientos_pendientes_por_asesor`. `/seguimientos` y el inicio ya listan
  los del día con la API real.
- **Política.** Días de gracia antes de llamarlo vencido (por defecto 0).

### R5. Embudo — foto actual y conversión por cohorte — Dueño

- **Pregunta.** ¿Dónde se atascan las oportunidades y cuántas de las que entran se ganan?
- **Métrica.**
  - Foto: oportunidades vivas por etapa, con conteo y Σ `valor_estimado_unidades` **por
    `moneda_iso`** (las que no tienen valor se cuentan aparte).
  - Tasa de cierre por cohorte de mes de creación = oportunidades de la cohorte en etapa
    `es_ganada` ÷ oportunidades creadas en la cohorte. La tasa de pérdida, igual con `es_perdida`.
    El resto queda abierto y se muestra.
  - En V1, con historial: conversión de cada etapa a la siguiente, en un plazo de N días, y
    mediana de días por etapa.
- **Dimensiones.** Asesor, origen (cuando exista), destino y paquete.
- **Dato.**
  - `oportunidades.etapa_id`, `creado_en`, `valor_estimado_unidades`, `moneda_iso`;
    `etapas_pipeline.es_ganada`, `es_perdida`, `orden`: **SÍ**.
  - `oportunidades.cerrada_en`: **PARCIAL**. Existe desde la migración inicial y **nada lo
    escribe**: `moverOportunidad` (`crm.prisma.ts`) solo cambia `etapa_id` y el motivo.
  - Historial de cambios de etapa: **NO**. No hay tabla, ni evento en `outbox`, ni registro en
    `registros_auditoria` para el movimiento: se pierde el «cuándo» y el «desde dónde». Se captura
    con T-131.
- **Política.** Etapas y probabilidad por etapa: ya son tabla por agencia (`etapas_pipeline`).
- **Sesgo.** Sin historial, una oportunidad que pasó por «Cotizada» y volvió a «Contactado» no se
  ve. Además, la foto cambia en cuanto alguien arrastra una tarjeta.

### R6. Ventas y margen — Dueño (margen) y Asesor (sus ventas, sin margen)

- **Pregunta.** ¿Cuánto vendimos, de qué, quién lo vendió y cuánto nos quedó?
- **Métrica.** «Venta», mientras no exista el archivo de viaje, es **una cotización `ACEPTADA`**,
  valorada por **la versión que vio el cliente** (`version_enviada`). Esto se declara en pantalla.
  - Ventas = Σ `versiones_cotizacion.venta_unidades` por `moneda_iso`.
  - Margen = Σ `margen_unidades` (no nulos) por moneda, con su cobertura (regla 5).
  - Ticket mediano = mediana de `venta_unidades` por moneda.
  - Periodo = mes de **decisión** (`decidida_en`, T-132), en la zona del tenant.
- **Dimensiones.** Destino (`versiones_cotizacion.destino`, que es copia congelada; no
  `oportunidades.destino`, que es texto libre), paquete (`paquete_nombre`), mayorista, asesor y
  fecha de salida.
- **Dato.**
  - Venta, neto, margen y moneda congelados en la versión: **SÍ**. Un `CHECK` impone
    `margen = venta − neto`.
  - Fecha de venta: **NO** (es la misma carencia de R3, T-132).
  - Mayorista: **PARCIAL**. Se llega por `paquetes.mayorista_id`, que es el valor **actual** y no
    está congelado en la versión. Si se cambia el mayorista del paquete, se reescribe la historia.
    T-149 lo congela.
  - Asesor: **PARCIAL**. `oportunidades.asesor_id` es el asesor actual (una reasignación lo pisa) y
    `cotizaciones.creado_por` es quien la creó. Atribución propuesta: el asesor registrado en el
    historial de etapas en el momento de pasar a ganada (T-131).
- **Permisos.** Margen y neto: solo `cotizacion.ver_neto_y_margen`. La vista de asesor muestra sus
  ventas sin margen.
- **Sesgo.** Si los asesores no marcan `ACEPTADA` (es un clic manual), las ventas salen bajas. El
  indicador de calidad «oportunidades ganadas sin cotización aceptada» lo deja a la vista (§5).

### R7. Motivos de pérdida — Dueño

- **Pregunta.** ¿Por qué se nos van los clientes?
- **Métrica.** Distribución de `motivo_perdida` entre las oportunidades en etapa `es_perdida`, por
  mes de pérdida (`cerrada_en`, T-131) y por asesor. Para `OTRO` se muestra la nota.
- **Dato.**
  - `oportunidades.motivo_perdida`, `nota_perdida`: **SÍ**. El motivo es **obligatorio** al mover
    a una etapa de pérdida (`regla-de-perdida.ts`, `PerdidaSinMotivoError`), y para `OTRO` un
    `CHECK` exige la nota.
  - Fecha de pérdida: **PARCIAL** (`cerrada_en` no se escribe).
- **Política (R12).** Hoy los motivos son `enum` del motor (`MotivoPerdida`, 7 valores), y el
  esquema razona por qué. Si la piloto usa `OTRO` en más del 20 % de las pérdidas en un mes, eso
  dispara convertirlos en tabla por agencia.
- **Sesgo.** Un asesor puede marcar «no responde» por defecto. Si `NO_RESPONDE` supera la mitad de
  las pérdidas, el motivo está diciendo poco sobre el negocio y mucho sobre el seguimiento (R4).

### R8. Carga y productividad por asesor — Dueño

- **Pregunta.** ¿Quién está sobrecargado, quién atiende rápido y quién convierte?
- **Métrica, por asesor.**
  - Carga, hoy: conversaciones asignadas abiertas, de ellas pendientes de respuesta (R2),
    oportunidades vivas y seguimientos vencidos (R4).
  - Productividad, en el periodo: episodios respondidos (R1) con su mediana, cotizaciones enviadas
    (R3), aceptadas y ventas por moneda (R6). En V1 se suma la tasa de cierre por cohorte.
- **Dato.** Carga: **SÍ**. Productividad: lo mismo que R1, R3 y R6.
- **Permisos.** La tabla de equipo exige `conversaciones.ver_todas`. Las columnas de margen exigen
  además `cotizacion.ver_neto_y_margen`. El asesor solo ve su fila.
- **Sesgo.** Comparar asesores con `n` distinto es injusto: cada fila lleva su `n` y el orden no se
  hace por porcentaje cuando `n < 5`.

### R9. Origen del lead y conversión por fuente — Dueño (V1)

- **Pregunta.** ¿De dónde vienen los clientes que compran, y cuánto rinde la pauta?
- **Métrica.** Oportunidades creadas, ganadas y tasa de cierre por cohorte, por origen. Ventas por
  origen y moneda.
- **Dato: NO.** Ni `contactos` ni `conversaciones` ni `oportunidades` tienen origen, y el webhook no
  extrae el `referral` que Meta envía en los mensajes que llegan de un anuncio Click-to-WhatsApp (no
  hay ninguna referencia a `referral` en `apps/api`). Se captura con T-133 (tabla por agencia y
  columna) y T-134 (`referral` automático).
- **Política (R12).** La lista de orígenes es tabla por agencia, con semilla («WhatsApp directo»,
  «Anuncio de Meta», «Instagram», «Referido», «Cliente que vuelve», «Otro»).

### R10. Pronóstico ponderado del pipeline — Dueño (V1)

- **Pregunta.** ¿Cuánto es razonable esperar que se venda en las próximas semanas?
- **Métrica.** Σ (`valor_estimado_unidades` × `coalesce(oportunidades.probabilidad,
  etapas_pipeline.probabilidad`) / 100) por moneda, sobre oportunidades vivas, agrupado por mes de
  `fecha_viaje_desde`. Las que no tienen valor o fecha se cuentan aparte.
- **Dato.** **PARCIAL**. Valor, moneda y probabilidad: sí. Fecha esperada de cierre: no existe (se
  usa la fecha de viaje como proxy y se declara).
- **Validación obligatoria.** Antes de mostrarlo como predicción, se compara el pronóstico de hace
  dos meses con lo vendido de verdad (requiere historial, T-131). Sin esa calibración se titula
  «pipeline ponderado», no «pronóstico».

### R11. Salidas próximas y ocupación — Operaciones (V1)

- **Pregunta.** ¿Qué sale en los próximos 7 a 30 días, con cuántos pasajeros, de dónde y cuánto
  cupo queda?
- **Métrica.** Por `fecha_salida` y paquete (y por opción de salida: hora y punto de encuentro),
  Σ `adultos`, `ninos` e `infantes` de las versiones enviadas de cotizaciones `ACEPTADA`. Ocupación
  = pasajeros ÷ `vigencias.cupo_total` cuando la vigencia publicada tiene cupo.
- **Dato.** **PARCIAL**. Pasajeros, fecha, opción y punto de encuentro: **SÍ** (en
  `versiones_cotizacion` y `opciones_de_salida`). Cupo: **PARCIAL**, porque es **informativo** por
  ADR-0009 y nada lo descuenta. Lista de viajeros: **NO** (no hay archivo de viaje).
- **Permisos.** Operaciones ve conteos, paquete, fecha, punto de encuentro y nombre del contacto.
  Nunca documentos (R10).

### R12. Después de V1

| Reporte | Por qué no antes | Dato que falta |
|---|---|---|
| Cuentas por cobrar (anticipos, saldos, vencidos antes de la salida) | No hay pagos | **NO**: no existe módulo `payments` ni tabla de pagos |
| Time limits por vencer (`Mayorista.dias_time_limit`) | Sin archivo de viaje no hay reserva que se libere | **NO**: no hay archivo de viaje |
| Recompra a 12 y 24 meses | Necesita archivos confirmados y al menos un año de datos | **NO** como venta confirmada; proxy: contactos con más de una cotización aceptada |
| Ocupación real con cupo controlado | ADR-0009 deja el cupo informativo | Requiere un ADR de cupos (Fase 2 del roadmap v3) |
| Metas de venta y avance | Pide la meta por agencia, por moneda y por mes | **NO**: no hay tabla de metas |
| Costo de Meta por conversación y por venta | Precios de Meta en COP no verificados (RG-13) | `codigo_error_meta` y plantillas sí; el costo no |
| Reportes por sede | Una sede por agencia hoy | Fase 4 |

---

## 4. Fases y criterio de salida

### Fase piloto: lo mínimo para que una agencia pequeña gobierne su operación

**Reportes:** R1, R2, R3, R4, R5 (foto y cohorte), R6, R7 y R8.

**Disparador de entrada:** **ya.** La captura (T-131 a T-136) entra antes que la agencia: cada día
sin historial es un día que el reporte no podrá contar.

**Criterio de salida**, comprobable durante dos semanas de operación real en la piloto:
1. Las ocho vistas salen de la API (`/api/v1/reportes/*`), **sin una sola cifra calculada en la web
   a partir del tablero** y sin constantes de negocio.
2. Para un día elegido al azar, el dueño cuenta a mano en la bandeja las conversaciones sin
   responder y los seguimientos vencidos, y coinciden con R2 y R4.
3. Una venta en USD y otra en COP aparecen en filas separadas en R6, y ninguna pantalla suma las
   dos.
4. Un asesor sin `cotizacion.ver_neto_y_margen` no recibe `margen` ni `neto` en ninguna respuesta
   JSON. Lo prueba un e2e (T-144).
5. El dueño toma al menos una decisión con R1 o R3 y queda en la bitácora: reasignar, cambiar el
   horario o perseguir cotizaciones viejas. Si no hay ninguna, los reportes no están respondiendo
   lo que la agencia pregunta, y hay que volver a la §1 antes de construir V1.

### Fase V1: entender por qué

**Reportes:** R9 (origen), R10 (pipeline ponderado), R11 (salidas próximas), embudo temporal y
tiempo en etapa (R5 con historial), tasa de cierre por cohorte en R8 y ventas por mayorista
congelado (R6).

**Disparador:** las ocho vistas de la piloto en uso **y** al menos **8 semanas** de historial
capturado por T-131 a T-134. Con menos, las cohortes tienen `n` de un dígito.

**Criterio de salida:** el dueño responde con la pantalla, sin hoja de cálculo, cuánto vendió por
fuente el mes pasado y cuánto pasajero tiene cada salida de la semana que viene. La segunda
respuesta coincide con la lista que Operaciones arma hoy a mano.

### Fase después

R12 completo. **Disparadores:** la existencia del dato. Pagos (ADR de pasarela, Fase 2 del roadmap
v3) para las cuentas por cobrar, archivo de viaje para los time limits y la recompra, ADR de cupos
para la ocupación real, y la segunda agencia con sedes para los reportes por sede.

---

## 5. Arquitectura de bajo costo

Los reportes son **consultas agregadas en la API, bajo demanda, sobre las tablas transaccionales y
bajo RLS**. No hay almacén de datos, ni Redis, ni caché, ni servicio aparte: es coherente con
ADR-0019 (un proceso, la cola sobre Postgres). El PR #213 ya fija la forma, y este roadmap la
adopta.

1. **Dónde.** `apps/api/src/modules/analytics/` compone. **Cada módulo dueño de los datos expone un
   puerto de lectura para reportes** (`shared/puertos/puertos-de-reportes.ts`): `crm` para
   oportunidades, `quoting` para cotizaciones e `inbox` para respuesta. Así `analytics` no lee
   tablas ajenas y no importa otros módulos (R4). Cada endpoint nuevo de este roadmap sigue el mismo
   patrón: un puerto en el módulo dueño y la composición en `analytics`. Si eso cuenta como
   decisión estructural que pide un ADR (R7), lo decide el `arquitecto` sobre el PR #213; no se
   crea tarea aparte.
2. **Aislamiento.** Cada consulta corre en `prisma.conTenant(...)`, con lo que RLS queda como
   barrera de fondo, **y** lleva `tenant_id = $tenant` explícito en cada tabla del `FROM` y de cada
   `JOIN` (el PR #213 lo hace así). `consultas-sin-filtro.spec.ts` solo inspecciona llamadas a
   delegados de Prisma (`findMany`, `aggregate`, `groupBy`…) y **no ve el SQL crudo de
   `$queryRaw`**: un `JOIN` sin tenant pasaría la guardia. Cada endpoint nuevo lleva su e2e de dos
   agencias (T-144).
3. **Protección de la bandeja.** Cada transacción de reporte fija `SET LOCAL statement_timeout =
   '5s'` y la consulta va acotada por periodo (máximo 13 meses). Un reporte lento falla solo, no
   bloquea al asesor.
4. **Monedas.** Todo `SUM` de dinero lleva `GROUP BY moneda_iso` y se devuelve con `::text` (los
   enteros de 64 bits viajan como cadena). El contrato Zod (`packages/contracts/src/reportes.ts`,
   R3) modela el dinero agregado como `z.array(Dinero)` y no tiene ningún campo que admita una suma
   entre monedas. Un e2e con COP y USD lo vigila. La unidad mínima de COP es el peso (R8).
5. **Periodos y zona horaria (R9).** Convención del PR #213: la API recibe **instantes UTC**
   (`desde` inclusivo, `hasta` exclusivo, máximo 366 días). **La web** convierte «este mes» a esos
   dos instantes con la zona horaria de la agencia, y el servidor no interpreta husos. Así, una
   venta del 31 a las 23:30 en Bogotá queda en ese mes y no en el siguiente.

   La excepción son los reportes que **agrupan** por día o por mes dentro del rango (cohortes de
   R3 y R5, series). Ahí el corte debe hacerse en la base con la zona del tenant
   (`date_trunc('month', ocurrido_en AT TIME ZONE tenants.zona_horaria)`), porque la web no puede
   partir un agregado que ya llegó sumado. La base sigue en UTC.
6. **Percentiles en la base.** `percentile_cont(0.5)` y `percentile_cont(0.9) WITHIN GROUP (ORDER
   BY segundos)`: no se traen filas a Node para calcularlos.
7. **Ejemplo:** el corazón de R1.
   ```sql
   WITH m AS (
     SELECT conversacion_id, direccion, autor_id, ocurrido_en, id,
            lag(direccion) OVER (PARTITION BY conversacion_id ORDER BY ocurrido_en, id) AS previa
       FROM mensajes
      WHERE tenant_id = $tenant AND eliminado_en IS NULL
        AND ocurrido_en >= $inicio_utc - interval '30 days'   -- contexto para el LAG
        AND ocurrido_en <  $fin_utc + interval '7 days'       -- respuestas tardías
        AND (direccion = 'ENTRANTE' OR (autor_id IS NOT NULL AND estado <> 'FALLIDO'))
   ), episodios AS (
     SELECT conversacion_id, ocurrido_en AS inicio FROM m
      WHERE direccion = 'ENTRANTE' AND (previa IS NULL OR previa = 'SALIENTE')
        AND ocurrido_en >= $inicio_utc AND ocurrido_en < $fin_utc
   )
   SELECT e.inicio, r.autor_id, r.ocurrido_en AS respuesta
     FROM episodios e
     LEFT JOIN LATERAL (
       SELECT autor_id, ocurrido_en FROM m
        WHERE m.conversacion_id = e.conversacion_id AND m.direccion = 'SALIENTE'
          AND m.ocurrido_en >= e.inicio
        ORDER BY ocurrido_en, id LIMIT 1) r ON true;
   ```
   La regla de las horas de silencio y la del horario de atención se suman en T-137.
8. **Cuándo materializar.** No antes de ver alguno de estos **disparadores**, medidos y anotados
   en la bitácora:
   - p95 de cualquier `/reportes/*` > 1,5 s para un tenant real, o
   - más de ~1 millón de filas de `mensajes` en un tenant, o
   - una consulta de reporte aparece en el log de lentas a la vez que una de la bandeja.

   Cuando ocurra, **no se usan vistas materializadas de PostgreSQL**: no admiten políticas RLS, y
   una vista materializada con `tenant_id` sin RLS es justo el defecto que R1 prohíbe (y lo detecta
   la prueba de aislamiento). Lo que se hace es una tabla normal `metricas_diarias` con
   `tenant_id`, RLS y una fila por (tenant, día local, métrica, dimensión, moneda). La alimenta un
   trabajo en la cola de Postgres de ADR-0019 que recalcula los últimos N días, porque los mensajes
   llegan desordenados. Antes que eso, índices. Para el cálculo de respuesta,
   `mensajes (tenant_id, conversacion_id, direccion, ocurrido_en)`, que propone el autor del PR
   #213. Para recorrer un periodo, `mensajes (tenant_id, ocurrido_en)`. El índice actual empieza por
   `(tenant_id, conversacion_id, ocurrido_en, id)`: con una agencia pequeña da igual, y con volumen
   obliga a filtrar la dirección fila por fila. Los índices se agregan **cuando el disparador se
   mida**, no antes (T-137 lo deja como criterio condicionado).
9. **Réplica de lectura:** cuando haya más de una agencia con volumen y una consulta de reporte
   compita con la bandeja. Neon ofrece réplicas de lectura (el costo está **no verificado** para
   este plan). Hasta entonces, el `statement_timeout` del punto 3 es la protección.

---

## 6. Calidad del dato y lo que hay que capturar desde hoy

### 6.1 Riesgos verificados en el código

| # | Riesgo | Evidencia | Efecto en reportes |
|---|---|---|---|
| D1 | **No hay historial de etapas** | Ninguna tabla. `moverOportunidad` hace un `UPDATE` de `etapa_id` y no deja auditoría ni evento | Sin embudo temporal, sin tiempo en etapa, sin fecha de ganada o perdida y sin pronóstico calibrable |
| D2 | **`cerrada_en` nunca se escribe** | Solo aparece en la migración inicial y en un filtro `cerradaEn: null` de la ficha | La ficha 360 trata como viva cualquier oportunidad ganada o perdida (el filtro siempre se cumple). Sin mes de venta ni de pérdida |
| D3 | **No hay instante de decisión de la cotización** | `cambiarEstado` solo escribe `estado` (y `enviada_en` al enviar) | Sin «vendido en octubre» y sin tiempo hasta la decisión |
| D4 | **`sla_vence_en` nunca se escribe** | Ningún escritor en `apps/api`; el filtro `SLA_VENCIDO` lo lee | El filtro de la bandeja siempre sale vacío. **Es un defecto de hoy**, no de reportes |
| D5 | **`primera_respuesta_en` se mide una vez por vida de la conversación** | `primeraRespuestaEn: conv.primeraRespuestaEn ?? ahora` | El cliente que vuelve no se mide. R1 se deriva de `mensajes` |
| D6 | **No hay origen del lead ni `referral` de Meta** | Sin columna y sin parseo | Imposible saber qué rinde la pauta. Se pierde **para siempre** el origen de cada lead que entra antes de capturarlo |
| D7 | Mayorista no congelado en la versión | `versiones_cotizacion` copia paquete y destino, no el mayorista | Ventas por proveedor reescritas si cambia el catálogo |
| D8 | Asignación sin historial | `asignado_a_id` y `asesor_id` se sobrescriben | Atribución por asesor ambigua tras reasignar |
| D9 | `oportunidades.destino` es texto libre | `VarChar(120)` sin catálogo | No sirve para agrupar: se usa `versiones_cotizacion.destino` |
| D10 | Venta = clic manual en `ACEPTADA` | Transición manual | Ventas subreportadas si el asesor no la marca |
| D11 | El tablero suma valores de monedas distintas | `tableroPorEtapa` hace `_sum.valorEstimadoUnidades` agrupado solo por etapa | El valor por columna del pipeline mezcla COP y USD hoy mismo |

### 6.2 Empezar a capturar desde hoy, aunque el reporte llegue después

| Captura | Tarea | Prioridad | Por qué ya |
|---|---|---|---|
| Historial de cambios de etapa: desde, hasta, banderas de ganada y perdida, motivo, **asesor en ese momento**, quién lo movió y cuándo. Además `cerrada_en` al llegar a una etapa terminal (y vaciarlo al reabrir) | T-131 | P0 | D1, D2, D8. El embudo temporal de V1 necesita 8 semanas de esto |
| Historial de estados de la cotización (`ENVIADA` → `ACEPTADA` / `RECHAZADA` / `VENCIDA`, con instante y usuario) | T-132 | P0 | D3. Sin esto no hay «ventas del mes» |
| Origen del lead: tabla por agencia, columna en oportunidad y elección obligatoria al crearla desde la web | T-133 | P0 | D6 |
| `referral` de Click-to-WhatsApp guardado en la conversación al primer entrante, y origen automático «Anuncio de Meta» | T-134 | P0 | D6. Los leads de pauta que entran sin capturarse no se pueden reconstruir |
| Política de atención por agencia (SLA, horario, horas de silencio) | T-135 | P0 | D4 y R12 |
| `sla_vence_en` armado en cada entrante que abre un episodio | T-136 | P0 | D4 (defecto de hoy en la bandeja) |
| Mayorista congelado en cada versión nueva de cotización | T-149 | P2 | D7. Solo afecta a reportes por proveedor |

**Motivo de pérdida obligatorio:** ya existe (dominio y `CHECK` para `OTRO`). No hace falta tarea.
T-131 sí guarda el motivo en el historial, para que reabrir una oportunidad no borre por qué se
perdió la primera vez.

**Marca de primera respuesta:** no hace falta una columna nueva para el reporte, porque se deriva
de `mensajes`. Lo que falta es lo operativo en vivo (D4), y eso cubren T-135 y T-136.

### 6.3 Indicadores de calidad que acompañan a los reportes (en T-140)

- Oportunidades en etapa ganada **sin** cotización aceptada.
- Cotizaciones `ENVIADA` cuya versión enviada ya venció.
- Ventas sin margen conocido (cobertura de R6).
- Oportunidades sin origen (desde que exista T-133).

Si un indicador supera el 20 % de su base, la cifra principal sale con una advertencia visible.

---

## 7. Estado hoy, sin adornos

Columnas: la pantalla `/reportes` en `origin/main` (`c908656`); el PR #207 abierto, que quita el
margen y las conversaciones inventadas y deja lo demás igual; y el PR #213 abierto, que hace el
endpoint `GET /reportes/resumen` (sin web que lo consuma todavía).

| Reporte | Pantalla hoy (`main`) | PR #213 | Dato en el esquema | Lo que falta |
|---|---|---|---|---|
| R1 Primera respuesta y SLA | «Aún sin datos» (`tiempoRespuestaPromedioMinutos: null`). Pide **promedio** | **Cubre parcial**: promedio y mediana, desde el **primer entrante de toda la conversación** hasta `primera_respuesta_en`, por conversaciones cuya respuesta cae en el rango. Sesgos: el cliente que vuelve no se mide (D5), y las no respondidas quedan fuera del cálculo, lo que baja la mediana. Sin p90 ni SLA | PARCIAL: derivable de `mensajes`; `sla_vence_en` vacío; sin política | T-135, T-136 (captura); T-137 (episodios, p90, sin respuesta, % SLA); T-142 (web) |
| R2 Pendientes ahora | No está. El inicio muestra contadores de la bandeja (`todas`, `mias`, `sinAsignar`, sin leer), que **no** son «sin responder» | No cubre | SÍ | T-138, T-143 |
| R3 Cotizaciones y antigüedad | No existe en reportes. `/cotizaciones` lista y filtra por estado | **Cubre** creadas, enviadas, aceptadas y tasa (cohorte de **envío**, porque la aceptación no guarda instante). No cubre la antigüedad de las abiertas ni las vencidas de hecho | PARCIAL: falta el instante de decisión (D3) | T-132 (captura); T-139 (antigüedad); T-142 y T-143 (web) |
| R4 Seguimientos vencidos | No está en reportes. `/seguimientos` y el inicio listan los del día con la API real | No cubre | SÍ | T-138, T-143 |
| R5 Embudo | «Conversión por etapa» = tarjetas por columna ÷ tarjetas totales, **contando solo las 20 más recientes de cada columna** (`TARJETAS_POR_COLUMNA = 20`). Es una foto truncada, no una conversión | **Cubre**: oportunidades **creadas** en el rango clasificadas por su etapa de hoy, y ganadas ÷ (ganadas + perdidas). No puede decir «cerradas en el periodo» (D2) | PARCIAL: sin historial (D1) ni `cerrada_en` (D2) | T-131 (captura); T-142 (web); T-145 (temporal, V1) |
| R6 Ventas y margen | Σ `valor_estimado` de ≤ 20 tarjetas ganadas, **etiquetado COP**. **Margen 20 % y neto 80 % inventados** (los quita el PR #207) | **Cubre por moneda** (`ventasPorMoneda`, sin mezclar; neto, margen y `cotizacionesSinNeto` solo con permiso). Cohorte de envío. Sin destino, paquete, mayorista ni asesor | PARCIAL: falta la fecha de decisión (D3); mayorista no congelado (D7) | T-132; T-140 (dimensiones); T-142 (web); T-149 |
| R7 Motivos de pérdida | No existe | No cubre | SÍ el motivo; PARCIAL la fecha (D2) | T-131, T-140 |
| R8 Por asesor | Ganadas y valor estimado de ≤ 20 tarjetas. En `main`, correo inventado y «conversaciones = ganadas × 3» (los quita el PR #207) | No cubre (no hay dimensión de asesor) | SÍ carga; PARCIAL productividad | T-138 (carga); T-140 (productividad); T-143 |
| R9 Origen | No existe | No cubre | **NO** | T-133, T-134 (captura); T-146 |
| R10 Pipeline ponderado | No existe | No cubre | PARCIAL | T-147 |
| R11 Salidas próximas | No existe (`/viajes` es maqueta) | No cubre | PARCIAL | T-148 |
| Selector de periodo | Cambia la etiqueta y **no filtra nada** | Acepta `desde` y `hasta` como instantes UTC | — | T-142 |
| Permiso para leer reportes | Gate solo de margen en la web | **Ninguno**: cualquier miembro lee el resumen de la agencia | — | T-141 |

**Hallazgos que no son de reportes y conviene saber:**
- El filtro «SLA vencido» de la bandeja nunca devuelve nada (D4). Lo corrige T-136.
- La ficha 360 considera viva una oportunidad ganada o perdida (D2). Lo corrige T-131.
- El valor por columna del tablero suma monedas distintas (D11). Lo corrige T-151.

---

## 8. Tareas

Todas en `roadmap/tasks.yaml`. El agente dueño va en el campo `owner`. **No hay tareas para el
endpoint del resumen**: ese es el PR #213. Las tareas lo amplían o lo consumen.

| Id | Qué | Owner | Prioridad | Fase | Depende de |
|---|---|---|---|---|---|
| T-131 | Captura: historial de etapas + `cerrada_en` | datos | P0 | 1 | — |
| T-132 | Captura: historial de estados de cotización (instante de aceptación) | datos | P0 | 1 | — |
| T-133 | Captura: origen del lead (tabla por agencia + columna) | datos | P0 | 1 | — |
| T-134 | Captura: `referral` de Click-to-WhatsApp | backend | P0 | 1 | T-133 |
| T-135 | Captura: política de atención por agencia (SLA, horario) | datos | P0 | 1 | — |
| T-136 | Captura: armar `sla_vence_en` por episodio (arregla el filtro de la bandeja) | backend | P0 | 1 | T-135 |
| T-137 | Resumen: respuesta por episodio, p90, sin respuesta, % SLA | backend | P1 | 1 | T-135 |
| T-138 | `/reportes/pendientes` (R2, R4, carga de R8) | backend | P1 | 1 | — |
| T-139 | `/reportes/cotizaciones-abiertas` (antigüedad de R3) | backend | P1 | 1 | — |
| T-140 | Resumen: ventas por dimensión, motivos de pérdida, cohorte por decisión y cierre, indicadores de calidad | backend | P1 | 1 | T-131, T-132 |
| T-141 | Permiso `reportes.ver_equipo` y alcance propio sin él | datos | P1 | 1 | — |
| T-142 | Web `/reportes` sobre `GET /reportes/resumen` (instantes UTC, `ventasPorMoneda`) | frontend | P1 | 1 | — (PR #213) |
| T-143 | Web: pendientes, cotizaciones abiertas y seguimientos vencidos | frontend | P1 | 1 | T-138, T-139 |
| T-144 | e2e de los endpoints nuevos: dos agencias, dos monedas, permisos, límites | qa | P1 | 1 | T-138, T-139 |
| T-145 | Embudo temporal y tiempo en etapa | backend | P2 | 2 | T-131 |
| T-146 | Conversión por origen | backend | P2 | 2 | T-133, T-134 |
| T-147 | Pipeline ponderado por moneda | backend | P2 | 2 | — |
| T-148 | Salidas próximas (Operaciones) | backend | P2 | 2 | T-132 |
| T-149 | Mayorista congelado en la versión | datos | P2 | 2 | — |
| T-150 | Pantallas V1 | frontend | P2 | 2 | T-145, T-146, T-147, T-148 |
| T-151 | Tablero: valor por columna agrupado por moneda (D11) | backend | P1 | 1 | — |

**Nota de ids.** T-120 a T-130 están tomados en la rama del PR #203 (`i/T-000-tareas-mvp-funcional`),
y por eso este roadmap empieza en T-131. Si otra rama toma ids en ese rango antes de integrar, se
renumera aquí y no se reutilizan.

**Coordinación.**
- El PR #203 trae T-124 (reportes sin cifras inventadas en la web, que es lo que hace el PR #207) y
  T-120 (API de etapas). Cuando T-120 permita borrar o renombrar etapas, el historial de T-131
  guarda las banderas `es_ganada` y `es_perdida` del momento, para no depender de la etapa viva.
- T-137 y T-140 tocan los archivos del PR #213: empiezan **después** de que se integre.
- T-142 puede empezar contra el contrato del PR #213, pero no se integra antes que él.
