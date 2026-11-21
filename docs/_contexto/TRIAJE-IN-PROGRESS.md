# Triaje de las 20 tareas `in_progress` (T-542, causa 2)

> **Estado: PROPUESTA. No aplicada.** Lo decide el propietario (cerrar como `done` algo que no lo está
> convierte el roadmap en ficción). Hecho el 2026-11-21 sobre `main` en `98b303e2` por el agente
> `dueno-de-producto` (dos instancias, solo lectura) y recogido por la sesión integradora (carril `i`).

## Por qué existe

`roadmap/tasks.yaml` tiene **20** tareas `in_progress` y el validador (`tools/roadmap-mcp/roadmap.mjs`,
`validate`) exige **una sola**. Mientras eso siga así, `scripts/cerrar-tarea.mjs` sale con código 1 al
cerrar cualquier tarea abierta y el job «Marcar la tarea como hecha» queda en rojo tras cada merge. La
causa 1 (18 tareas con `type`/`effort` fuera del enum) ya está corregida en este PR; esta es la causa 2.

## Resumen de la propuesta

| Propuesta | Cuántas | Tareas |
|---|---|---|
| `done` | 13 | T-242, T-243, T-244, T-248, T-249, T-250, T-251, T-255, T-256, T-257, T-282, T-300, T-511 |
| `backlog` | 5 | T-213, T-226, T-247, T-254, T-372 |
| `blocked` | 1 | T-192 (hace falta `blocked_reason`: juicio fiscal del contador; si se prefiere, `backlog`) |
| `dropped` | 1 | T-126 |

**Comprobado (script, sobre una copia):** aplicando exactamente esta tabla a `tasks.yaml`, `validate` da 0
errores y una llamada a `completeTask` sobre otra tarea sigue validando. Es decir, aplicar estas 20 deja
verde la regla de `in_progress`.

## Cómo leer la evidencia (límites)

- El clon de la sesión es superficial (51 commits): `git log --grep=T-XXX` no encuentra los PR antiguos.
  La evidencia sale del **código en `main`** y de lo que `docs/_contexto/DIARIO.md`/`ESTADO.md` registran
  como verificado con `gh`. Donde un veredicto de auditoría se deduce del texto del diario, la tabla lo dice.
- La sesión integradora **no ha re-verificado** cada fichero:línea; los ha recogido tal cual de los agentes.
  Antes de aplicar, conviene que el propietario compruebe sobre todo las tres de más riesgo:
  **T-300** (P0, tope de fallos de OTP: `done`), **T-126** (`dropped`: se sustituye por el job `navegador`,
  que es una afirmación de criterio) y **T-372** (aislamiento: el arnés de mutaciones nunca se ejecutó).
- Una rama cuyo nombre contenga `T-126`, `T-300`… vuelve a cerrar la tarea sola (`cerrar-tarea.yml`).

## Grupo A (booking, comisión, reserva)

| Tarea | Título | Propuesta | Evidencia (código en `main`, PR, fichero:línea) | Criterios que faltan |
|---|---|---|---|---|
| T-192 | Comisión de la agencia como concepto propio (M10) | **blocked** | `docs/03-adr/0023-...md:3` «Estado: Propuesto». DIARIO.md:245 «ADR-0023 sigue Propuesto: juicio fiscal pendiente del contador del propietario». `schema.prisma:1128-1130` sigue diciendo «la agencia que cobre comision cambia este campo» (comisión = base del margen). Lo mismo en `02-lenguaje-ubicuo.md:109` | Los dos criterios. Razón del bloqueo: hace falta el juicio del contador para aceptar ADR-0023 (dependencia externa) |
| T-213 | De cotización aceptada a reserva con time limit y TRM congelada (A17) | **backlog** | ADR-0024 Aceptado (`0024-...md:3`). TRM congelada en la versión: #291 (DIARIO.md:209), `schema.prisma:2443-2452`. Time limit vigilado: #296 (T-244), `domain/plazos.ts` | «Historia del contexto booking»: no existe `docs/01-producto/03-historias/HU-booking-*`. Hay que dejar solo ese criterio, con dueño `analista-producto`. Prioridad baja: el código ya existe |
| T-242 | Booking F3: dominio y API del archivo de viaje | **done** | #292 (2167a2a) según DIARIO.md:211-215, con auditoría sin bloqueantes. Los 8 estados están en `booking/domain/reserva.ts:28-35`. El e2e de aislamiento A↔B en cada mutación está en `booking-archivos.e2e-spec.ts:7-8`. Neto con permiso: ver T-248 | — |
| T-243 | Booking F4: pantalla Reservas | **done** | #293 (68c3c38), DIARIO.md:213. `apps/web/src/app/(app)/viajes/page.tsx` lee la API real. `components/reservas/lista-archivos.tsx:20-59` muestra el semáforo de plazo y el mayorista por fila | — (la cola T-252 ya está anotada) |
| T-244 | Booking F5: vigilancia de los dos plazos | **done** | #296 (64ad344), DIARIO.md:178. La auditoría pidió correcciones y se aplicaron en el mismo PR (R5, lote 50, prueba de outbox cruzado). `infrastructure/vigilancia-de-plazos.prisma.ts:7,98-99` usa `ejecutarCon` + `conTenant` y no aparece `conPlataforma`. Eventos próximo/vencido en `domain/plazos.ts` | — (cola T-253 anotada). Un matiz: el veredicto de la auditoría de #296 se deduce de «Corregido en el PR». No vi un informe propio |
| T-247 | Robustez del despachador de eventos | **backlog** (recomendación: partirla, ver abajo) | Integrado en #301 (DIARIO.md:153). `booking/infrastructure/archivos.prisma.ts:32-35` pone `lock_timeout`. `shared/eventos/despachador-de-consumidor.ts:89` tiene `esErrorTransitorio`. La rotación está en `:98,115,141-142` (`rotar`) | Criterio 3 «Métrica o alerta de entregas abandonadas»: solo hay un log de error JSON (`:28`). No hay métrica ni alerta. Las propias notas de la tarea lo dejan como COLA. Si se pasa ese criterio a una tarea nueva, T-247 puede cerrarse como done |
| T-248 | Lectura omite netoUnidades sin cotizacion.ver_neto_y_margen | **done** | #292, DIARIO.md:211-212 («neto solo con permiso (T-242, T-248)»). Pruebas con y sin el permiso en `operar-archivo.use-case.spec.ts` (11 menciones). `archivo.mapper.ts` omite la clave | — |
| T-249 | Permisos archivo.ver y archivo.operar | **done** | #295 (1c71e0f), DIARIO.md:176. La auditoría lo aprobó y el propietario lo aprobó por delegación (DIARIO:188-189). Migración `20261118100000_permisos_del_archivo_de_viaje` con CHECK ampliado y relleno agencia por agencia (`:71-72`). PERMISOS en `contracts/src/identidad.ts:47,52`. Siembra en `siembra-de-tenant.ts:31-32`. El controlador usa `archivo.ver`/`archivo.operar` (`archivos.controller.ts:49-50,75-109`). `mutaciones-con-permiso.spec.ts:47` | — |
| T-250 | Historial de transiciones de reserva | **done** | #302 (DIARIO.md:153, «historial de estados»). Migración `20261118120000_historial_de_estados_de_reserva`: `tenant_id NOT NULL` y FK compuestas (`:40-78`), `aplicar_aislamiento_tenant` (`:88`), `viajapro_app` solo con `{SELECT,INSERT}` (`:94`). Pruebas en `aislamiento.spec.ts:435,9181` (aislamiento e inmutabilidad). Adaptador en `historial-de-reservas.prisma.ts` | — |
| T-251 | Pruebas de booking: neto por HTTP y fechas relativas | **done** | Integrado con T-250 (bitácora `2026-11-17-historial-de-reservas-y-pruebas-de-booking.md`). `booking-archivos.e2e-spec.ts:847,863` comprueba la lista, el detalle y las mutaciones sin `netoUnidades` con sesiones reales. `:56` calcula `hoyUtc` desde la fecha actual. `operacion-de-archivos.prisma.ts:262` ordena por plazo en el SQL antes del LIMIT | — |

## Grupo B (cifrado, avisos, web, identidad, pruebas)

| Tarea | Título | Propuesta | Evidencia (código en `main`, PR, fichero:línea) | Criterios que faltan |
|---|---|---|---|---|
| T-126 | Campaña de pruebas funcionales en local y bitácora de hallazgos | **dropped** | La sustituye el job `navegador` del CI: `apps/web/e2e/02-flujo-h1-h6.e2e-spec.ts:5` («Flujo H1-H6 (campana T-126) en navegador contra la API real»), que corre en modo único (`.github/workflows/ci.yml:396-402`) y da 55 passed en `main` 98b303e2 (run 44909986082). El único informe, `docs/_bitacora/hallazgos-funcionales-2026-11-05.md:1`, dice «recorrido NO ejecutado» | Tal como está escrita no se cumple: no hay bitácora de hallazgos de un recorrido manual ni prueba del correo de prueba. Se reconsidera antes de la primera demostración al piloto, como recorrido manual nuevo (tarea nueva, no esta). Aviso: una rama con «T-126» en el nombre la cierra sola (DIARIO.md:398) |
| T-226 | Rotación robusta de CAMPOS_SENSIBLES_KEY | **backlog** | (a) `cifrado-de-campos.spec.ts:255` y `cifrado-de-campos.ts:244`; (b) `comprobacion-de-claves.ts:2` y `comprobacion-al-arrancar.ts:16`. (c) figura como «PENDIENTE» en `cifrado-de-campos.ts:25-31` | (c) recifrado por lotes y contador del tope por clave derivada. ESTADO.md:17 dice que solo hace falta cuando haya una clave real que rotar. Conviene reducir el `acceptance` a (c) |
| T-254 | Notifications: consumir eventos de plazo (aviso activo al asesor) | **backlog** | Parte en la aplicación integrada (#298, DIARIO.md:182): `modules/notifications/interface/consumidores-de-avisos-de-plazo.ts`, `AvisoDePlazoV1` en `packages/contracts/src/eventos.ts:52`, sin imports de booking | Criterio 2, la parte externa: aviso por WhatsApp o correo con plantilla utility, opt-in y cola. Los consumidores no lo mencionan (grep de correo/whatsapp/opt vacío). Pregunta antes de priorizar: quién paga el mensaje de plantilla |
| T-255 | Web: campana y lista de notificaciones | **done** | Integrada (#299, DIARIO.md:184): `apps/web/src/lib/avisos-plazo-api.ts:5,12-15,118` (contratos `ListaDeNotificaciones`/`Notificacion` de `@viajapro/contracts`, POST de lectura), `avisos-plazo-logica.ts:39` (fecha en la zona de la agencia), `barra-modulos.tsx:138`, `panel-avisos-de-plazo.spec.tsx` | Ninguno de los criterios escritos. No verificado: la campana contra la API real en navegador (bitácora 2026-11-17-campana-de-avisos-de-plazo.md:27). Ver cola |
| T-256 | FK (reserva_id, archivo_id, tenant_id) en notificaciones | **done** | Migración `20261120090000_reserva_atada_a_su_archivo_y_ocurrido_en_de_la_base/migration.sql:74` (UNIQUE) y `:131-136` (retira las dos FK y crea la compuesta); aislamiento `packages/database/tests/aislamiento.spec.ts:8926,9072`. En `main` con `aislamiento-tenants` en verde (check obligatorio) | — |
| T-257 | Booking: endurecer historial y paginación de /archivos | **done** | Misma migración `:146-161` (disparador BEFORE INSERT `ocurrido_en := now()`) y `:127-128` (FK de tres columnas); orden sin plazo por número DESC en `booking/infrastructure/operacion-de-archivos.prisma.ts:267-291` y `domain/archivo.ts:148-153`; e2e `booking-archivos.e2e-spec.ts:1161` | — (el criterio 1 se cumple con la alternativa de disparador que el propio texto admite) |
| T-282 | Web: un solo sistema de acción, color y fecha; enlaces chat-cotización-file | **done** | Integrada en #314 (ESTADO.md:125); `@utility boton-primario` en `apps/web/src/app/globals.css:494`, usado en 56 ficheros; `formatearFecha`/`formatearFechaHora` en `lib/formato`; `components/comun/campo-fecha.tsx`; bitácora 2026-11-20-sistema-visual-y-enlaces.md | Ninguno de los escritos. Los límites conocidos (sin `conversacionId`, sin abonos ni saldo) ya están en T-283 (`ready`, backend) |
| T-300 | Tope diario de fallos de OTP por correo (P0) | **done** | `identity/application/limitador-de-envios.ts:22` (prefijo `viajapro:otp-fallos:`, separado del `otp-envio:` de :20), `:71` (10 en 24 h); `interface/auth.controller.ts:124-138` (bloqueado da `CODIGO_INVALIDO` antes de Better Auth; solo cuenta el fallo; uno inexistente también cuenta); `infrastructure/contador-de-fallos.postgres.ts:9-17` (filas de `verificaciones`, sin migración, falla cerrado); `identity.module.ts:82` (en la API y en el modo único); unitarias en `limitador-de-envios.spec.ts:86,95,213,309-319`; e2e en `invitaciones.e2e-spec.ts:645` (10.º fallo, código correcto rechazado, «reinicio» con instancia nueva, correo inexistente). PR #315 (ESTADO.md:130) | — (las pruebas de base solo corren en el CI, que es obligatorio y está en verde) |
| T-372 | ADR-0031 PR 1 datos: usuarios.apodo, disparador y CHECK .invalid | **backlog** (o done si se pasa el criterio a T-377) | Migración `20261120150000_apodo_de_ingreso/migration.sql:80-104` (columnas, CHECK, cuerpo del disparador) y `:20` (CHECK `.invalid`); AP1-AP12 = (a)-(l) en `aislamiento.spec.ts:11233-11720`; M21 y M17→prueba '64' en `packages/database/scripts/mutaciones-aislamiento.mjs:269-314`. Integrada en #358 | Criterio 2 sin ejecutar: el arnés de mutaciones no corre en el CI (`packages/database/package.json:23`, no aparece en `.github`) y no hay rastro de que M21 o M17 se ejecutaran tras el apodo. Las bitácoras de 2026-11-20/21 dicen que M22 y M23 «nunca se ejecutaron». Es aislamiento: no se cierra sin ejecutarlo. Salida barata: añadir M17 y M21 a T-377 (ejecutar el arnés por primera vez) y entonces cerrar esta como done |
| T-511 | Probar el ingreso por apodo a 390 px contra la API real | **done** | Commit e9ea9ba3; `apps/web/e2e/08-ingreso-por-usuario.e2e-spec.ts`. En `main` 98b303e2 el job `navegador` (job 136863550326) pasa las 4 pruebas 52-55 a 390 px, 55 passed | — (en el push de e9ea9ba3 la prueba 55 falló, run 44896088606, por el 429 del tope por agencia; inestabilidad ya en T-526) |

## Cola sin anotar (no es parte de las 20; decide el dueño de la cola)

### Del grupo A
1. **De T-247: métrica de entregas abandonadas por consumidor**, al estilo de `medir_cola_de_salida`, expuesta en `/salud`. Exige una función SECURITY DEFINER y una migración. Dueños: `datos` (función) y `backend` (exposición). No hay tarea en tasks.yaml: «abandonad» solo aparece en la propia T-247 y en una purga de agencias que no tiene que ver.
2. **De T-247: quitar el `LIMIT 500` fijo de `tenants_con_eventos_por_entregar`.** La rotación solo cubre la lista que se devuelve, no las agencias que se quedan fuera. T-246 solo pide *probar* el tope, no quitarlo, y T-253 trata otra función (la de plazos). Dueño: `datos`. Hoy no afecta: no hay ninguna agencia real.
3. **Hilo desactualizado, no es trabajo de código.** `ESTADO.md:174` pone el «historial de transiciones de reserva (T-250)» en «Lo que NO existe», pero está en main (migración 20261118120000). Hay que corregirlo cuando se cierre T-250.

### Del grupo B
1. **`ocurrido_en` de la base en los otros dos historiales** (`oportunidad_cambios_etapa`, `cotizacion_cambios_estado`). Dueño propuesto: `datos`, P3. La bitácora `docs/_bitacora/2026-11-20-reserva-atada-a-su-archivo.md:36-38` dice textualmente «No se tocó aquí ni se creó tarea: candidato a la cola». La función de T-257 es genérica y sirve para ambos. No hay tarea en `tasks.yaml`.
2. **La campana de avisos de plazo (T-255) contra la API real en navegador.** Dueño propuesto: `frontend`/`qa`, P3. No hay prueba en `apps/web/e2e` que abra el panel de notificaciones: solo `05-movil` comprueba el objetivo táctil de `mas-notificaciones`. Podría ser un caso más del job `navegador`, como se hizo con T-511.
3. **Si se acepta pasar el criterio de T-372 a otra tarea:** añadir «ejecutar M17 (prueba 64) y M21 (AP7)» al `acceptance` de T-377. Hoy T-377 solo nombra M22, M23, M24 y las de T-329.
4. **(Ya anotado, solo como referencia)** El tope de 600/min por agencia en el job `navegador` es T-526 (backlog). Los límites de T-282 son T-283 (ready).

## Cómo se aplicaría (una vez aprobado)

Con un script, no a mano ni con regex: cargar `tasks.yaml`, cambiar `status` solo de las 20 tareas por la
tabla de arriba (`blocked` lleva `blocked_reason`), ejecutar `node tools/roadmap-mcp/cli.mjs validate` y
comprobar que solo cambian esas líneas. Para las `done`, completar `evidence`/`commit` con el PR que
cita la tabla. Para T-226, T-247, T-372 y T-213 conviene además **reducir el `acceptance` a lo que falta**
(lo dice la columna «Criterios que faltan»). Corregir `ESTADO.md:174` (T-250 figura en «Lo que NO existe»).
