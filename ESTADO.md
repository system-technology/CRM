# ESTADO — El hilo vivo de ViajaPro

> Primer archivo que se lee al abrir el proyecto. Responde tres preguntas: dónde estamos, qué
> bloquea, quién trabaja en qué. **La cola de trabajo ya no vive aquí:** vive en
> [`roadmap/tasks.yaml`](roadmap/tasks.yaml) (ADR-0016). El historial anterior al 2026-10-20 está
> íntegro en [`docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md`](docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md).
>
> **Al retomar tras compactar o en una sesión nueva, lee primero [`docs/_contexto/CONTEXTO.md`](docs/_contexto/CONTEXTO.md):**
> el entorno vivo, las trampas conocidas, las decisiones del propietario y la cola inmediata.

| Campo | Valor |
|---|---|
| Última actualización | 2026-11-21, cierre del segundo lote (`main` en `44d8673`, PR #408; [bitácora](docs/_bitacora/2026-11-21-segundo-lote-reportes-cobros-y-pruebas.md)) |
| Actualizado por | Claude, sesión madre (hilo al día con los PR #289 a #401) |
| Fase | **Fase 1 del backlog: «Un CRM mostrable y endurecido»** (M1 del [roadmap v2](docs/08-roadmap/01-roadmap.md)). Sin agencia real todavía. Prioridad vigente: la demo a JD Tours ([`MARCO.md`](docs/_contexto/MARCO.md) §6) |
| Avance | 178 tareas `done` en `roadmap/tasks.yaml` (405 en total). «Done» significa integrada en `main`, **no** desplegada ni probada con Meta real |
| Próximo hito | Que el propietario cargue la clave de cifrado y decida el despliegue; después, prueba con Meta real (T-080). Del lado del código solo queda cola menor: T-235 y T-226 (c), recifrado por lotes, que solo hace falta cuando haya una clave real que rotar |

---

## 1. Dónde estamos

Verificado el 2026-11-20 sobre `origin/main` (`9662e04`, PR #319) con `git log`, `gh` y `roadmap/tasks.yaml`.
Fuente de la corrección de rumbo: [auditoría integral 2026-11-15](docs/_auditorias/2026-11-15-auditoria-integral.md)
y su [plan](docs/08-roadmap/02-plan-correccion-auditoria-2026-11-15.md). Entrada del día:
[bitácora](docs/_bitacora/2026-11-15-mvp-en-navegador-y-cierre-de-auditoria.md).

**Veredicto: el flujo H1–H6 ya se recorre en un navegador, en CI, contra la API real. Pero la Graph
API es falsa y no hay nada desplegado.** Ninguna agencia lo ha visto ni un mensaje de celular real ha
entrado. Seguimos en local.

### Cierre del lote de la madrugada (2026-11-21)

Integrados en `main`, por orden: #388 (regla R14, tablero, skills), #358 (ingreso por apodo, tope por identificador, apodo de miembros), #397 (ADR-0035, niveles de acceso a reportes), #393 (T-330, dominio y API de cobros), #398 (T-440, marco responsivo), #401 (consolidación de la documentación; sustituyó a #384, #386, #389, #390, #392, #399 y #396), #400 (tablero al día, arreglo del hook) y #395 (el resumen y los seguimientos ajenos solo con `conversaciones.ver_todas`). Detalle y cola: [bitácora](docs/_bitacora/2026-11-21-lote-de-integracion-nocturno.md).

### Cierre del tercer lote (2026-11-21)

`main` en **`e16f5499`**, cero PR abiertos. Integrados en serie: #414 (relevo de la orquestadora y
aviso al despertar en el tablero), #416 (**T-505 `done`**: una prueba compara el `CHECK`
`roles_permisos_del_catalogo` con `PERMISOS` en los dos sentidos; el catálogo deja de vivir en tres
literales a mano), #415 (T-510, e2e de `apps/api` en serie y la prueba del índice sin depender del
planificador) y #410 (**T-331 `done`**: registrar un pago y ver el saldo en el archivo de viaje).
Detalle: [bitácora](docs/_bitacora/2026-11-21-tercer-lote-cobros-permisos-y-pruebas.md).

**#410 pasó por auditoría de seguridad independiente** por ser dinero en pantalla (R13), y volvió
con tres bloqueantes, los tres corregidos con prueba de regresión: el saldo a favor se pintaba en
negativo y la confirmación decía siempre «Falta por cobrar»; la clave de idempotencia vivía en el
diálogo, así que cerrarlo y reabrirlo tras un fallo de red permitía **cobrar dos veces**; y el aviso
decía que los números de tarjeta no se guardan cuando sí se guardan. Cola abierta por esa
auditoría: **T-515 a T-521**.

**En vuelo al cerrar el lote:** **#417** (T-342, `review`) deja que **el servidor imponga el alcance
de los reportes**: `alcanceDeReporte` sale de la sesión y nunca del parámetro del cliente, los tres
puertos lo reciben obligatorio, el resumen es una unión discriminada validada en el servidor, y un
`asesorId` ajeno sin permiso responde **403** en reportes y en seguimientos — lo que **cambia el
silencio provisional de #395**. Al implementarlo apareció que **`cotizaciones.creado_por` existía y
nadie la escribía**: atribuir por ella sin rellenarla habría dejado «Mis números» en cero para todos
los asesores, sin que fallara nada. Se arregla en la misma rama. Su rastro documental viaja en este
PR de cierre para que #417 quede de carril `a` puro y «Carril y tarea» no pida `override-lane`.

**No verificado:** **T-510 sigue abierta** — su criterio son cinco corridas de CI seguidas sin rojo
y van **cero**, y los deadlocks 40P01 no se reprodujeron ni se cerraron; un PR todavía puede salir
rojo por azar. **Ninguna sesión puede levantar Postgres en local** (lo deniega el clasificador), así
que todo lo que se diga «contra la API real» lo validó el CI, y lo visual salió de modo
demostración. Sigue sin desplegarse nada. El ingreso por apodo a 390 px contra la API real sigue
pendiente (T-511).

### Cierre del segundo lote (2026-11-21)

Integrados: #404 y #405 (ingreso con correo o usuario, apodo del miembro; sustituyen a #402 y #362), #406 (**T-485 `done`**: «Esta vista es de administración» y avisos de alcance en seguimientos y ficha; la llave vive en `apps/web/src/lib/alcance-de-vista.ts` y T-342 solo cambia esa función), #407 (**T-341 `done`**: permiso `reportes.ver_agencia`, catálogo de 14 a 15, migración `20261121160000`, solo al rol `DUENO`) y #408 (**T-503 `done`**: las pruebas de la api esperan a las de la base). Cero PR abiertos. Detalle y cola (T-505 a T-511): [bitácora](docs/_bitacora/2026-11-21-segundo-lote-reportes-cobros-y-pruebas.md).

**No verificado:** el ingreso por apodo (#405) no se probó a 390 px contra la API real (T-511); nada de esto está desplegado; la clave de la demo se perdió al archivarse la sesión de despliegue (se regenera resembrando). **Ojo:** T-503 se cerró con la carrera entre la base y la api, pero queda T-510 (las e2e de la api aún comparten base; un PR puede salir rojo por azar).

### Es real (en `main`)

| Qué | Evidencia |
|---|---|
| Suite de navegador (Playwright, job `navegador` del CI): ingreso, páginas, H2–H6 y, contra una Graph API falsa, responder desde la bandeja (queda ENVIADO por el webhook de estado `sent`) y enviar una cotización por WhatsApp sin neto ni margen | `apps/web/e2e/`; PR #263 y #266 |
| Aislamiento entre agencias (RLS, cuatro roles de aplicación, arranque que aborta con rol equivocado) | Job `aislamiento-tenants`, `arranque-seguro.e2e-spec.ts` |
| Función `SECURITY DEFINER` `medir_cola_de_salida` con dueño `NOLOGIN` `viajapro_metricas`; motivos de pérdida por agencia (RLS forzada, FK compuesta) | PR #268 y #272–#273; ADR-0026 y R2. La superficie del rol la fijan pruebas y migraciones de comprobación |
| Cifrado de PII en reposo (ADR-0015): `mensajes.texto` y campos sensibles cifrados; la demo se siembra con `demo:sembrar-cifrada` | PR #264 y #266. **La clave de producción no está cargada en ningún entorno** |
| `main` protegida: PR, 8 checks obligatorios (10 en total), rama al día, administradores incluidos | `.github/proteccion-main.json` |
| Permisos de mutación exigidos en los controladores | `mutaciones-con-permiso.spec.ts` |
| Modo de un solo proceso sin Redis y envíos sobre Postgres (ADR-0019) | `apps/api/src/proceso-unico/`; [runbook](docs/07-ingenieria/runbook-modo-unico.md) |
| Envío saliente a WhatsApp: cola, idempotencia, ventana de 24 h (ADR-0018) | `enviar-cotizacion.e2e-spec.ts`; **contra Graph API falsa** |
| Recepción: webhook firmado → cola → consumidor → mensaje cifrado | `inbox-webhook`, `inbox-bullmq.e2e-spec.ts` |
| Identidad, ajustes de la agencia, estado del canal, CRM con etapas configurables, catálogo, cotizador, bandeja con visibilidad por asesor y tiempo real | e2e de cada módulo en `apps/api/src/modules/` |
| Reportes con margen real, protegido por `cotizacion.ver_neto_y_margen` | `reportes.e2e-spec.ts` |
| Cotizador y catálogo consultan desde hoy en la zona del tenant y eligen la primera salida; el simulador trabaja sobre vigencias | PR #267 y #269 |
| `/salud/listo` público solo informa el estado de cada cola (T-228) | PR #269 |
| Motivos de pérdida por agencia: la agencia los gestiona en Configuración, el pipeline los ofrece al cerrar como perdida, un motivo de otra agencia da 404; motivos propios con nota; motivo desactivado rechazado también en la base | PR #271 y #272; `motivos-de-perdida.e2e-spec.ts`, `aislamiento.spec.ts` |
| Arranque seguro del cifrado: la API, el trabajador y el modo único abortan si hay datos con una versión de clave que no tienen, **antes** de que ningún consumidor o planificador tome trabajo | PR #273 y #274; `comprobacion-al-arrancar.spec.ts` |
| La agencia ve y cambia su zona horaria en Configuración, con permiso de dueño o administrador; la base lo hace con una función de permisos mínimos que solo toca la agencia propia | PR #277 (ADR-0027), #278 y #279; `agencia-ajustes.e2e-spec.ts`, Z1–Z5 de `aislamiento.spec.ts` |
| **Archivo de viaje (Booking, ADR-0024 Fase 1):** al aceptar una cotización, un evento `CotizacionAceptada` por outbox y un despachador por consumidor (modo único y escalado) abren el archivo con número de file por agencia y una reserva por mayorista con la TRM congelada; API `/api/v1/archivos` con estados de reserva, pasajeros y cancelación; el neto solo con `cotizacion.ver_neto_y_margen`; pantalla Reservas en `/viajes` con datos reales | PR #290–#293; `booking-apertura.e2e-spec.ts`, `booking-archivos.e2e-spec.ts` (aislamiento entre agencias en lectura y en cada mutación). Dos auditorías de seguridad sin bloqueantes. **La pantalla no se ha visto contra la API real en un navegador** |
| **Permisos `archivo.ver` / `archivo.operar`** (ADR-0024 §3.7): toda ruta de `/api/v1/archivos` exige `archivo.ver` y las mutaciones `archivo.operar`; DUENO, ASESOR y OPERACIONES los reciben; la web oculta las acciones a quien no los tiene | PR #295 y #297; `mutaciones-con-permiso.spec.ts`, e2e con sesiones reales (403 y fila intacta) |
| **Avisos de plazo** (ADR-0024 §3.6): un planificador por agencia emite `booking.time_limit_*` y `booking.pago_total_*` una sola vez por plazo; `notifications` los convierte en notificación en la aplicación para el asesor (o quien tenga `archivo.operar`) y la campana de la web los muestra | PR #296, #298 y #299; `booking-plazos.e2e-spec.ts`, `notificaciones-avisos.e2e-spec.ts`, N-1…N-7 de `aislamiento.spec.ts`. Tres auditorías sin bloqueantes. **La campana no se ha visto contra la API real** |
| Modo demo sin dominio (opción C): la web en `*.vercel.app` reescribe `/api/v1` y el tiempo real (long-polling) a la API en Render | PR #289; [guía](docs/07-ingenieria/despliegue-neon-vercel-render.md). **Sin probar contra Vercel real** |
| Dependencias: `pnpm audit` de producción pasó de 3 críticas y 15 altas a 0 y 1 (queda zod v3; zod 4 lo decide el propietario) | PR #267 |
| **Web más creíble y un solo sistema visual** (auditoría UX): sin restos de desarrollo ni datos que mienten, solicitud de viaje en la conversación, resumen del viaje en bandeja y pipeline, una sola acción, color y fecha, y chat, cotización y file enlazados | PR #304, #306, #308, #314 (T-258, T-259, T-282); skills `diseno-web` y `frontend-design` (PR #304, #307). **Visto solo en capturas con datos de demo, no contra la API real** |
| **Navegación y móvil (ADR-0032):** layout compartido `(app)` con tabla única de navegación, barra inferior de 5 y hoja «Más», lupa fija, la URL como estado (Atrás vuelve; `?id`, `?op`, `?pestana`), paleta que busca en la misma fuente que cada pantalla y cotizar completo a 390 px con envío por el canal sin estado falso | PR #359, #368, #369, #371, #374; job `navegador` en verde en cada uno. **Probado en celular solo emulado; tablet y escritorio, sin auditoría responsiva todavía** |
| **Etiquetas por agencia:** tablas `etiquetas` y `conversacion_etiquetas` (RLS, FK compuestas), API (gestionar, asignar, filtrar; topes 50 y 10; 404 idéntico con ids ajenos) y chips con color en la bandeja | PR #372, #379, #381; `aislamiento-tenants` y e2e contra Postgres real en CI. Dos auditorías sin bloqueantes |
| **Libro de cobro del viajero (T-329, ADR-0034):** tabla `pagos` que solo crece, `plazos_de_cobro` y `parametros_de_cobro` por agencia, disparador que fija el total y la moneda del archivo, permisos `cobro.ver`, `cobro.registrar` y `cobro.corregir` (este solo para el dueño). **Sin API ni pantalla todavía: nadie puede registrar un pago** | PR #378 y #382; `aislamiento-tenants` verde (primera ejecución real de la migración). Auditoría sin bloqueantes. API de pagos: T-330 |
| **Guarda de segunda agencia (PR 1b, ADR-0031 §4):** `crear_agencia` no da de alta una segunda agencia mientras el índice de apodos sea global | PR #363; AP14 se omite en el job `test` (intermitencia) |
| **Tope de 10 fallos diarios por correo** en el código de un solo uso, guardado en Postgres (sobrevive a reinicios y réplicas) | PR #315 (T-300); dos auditorías de seguridad. Las pruebas de base corren solo en el CI |
| **ADR-0030, registro autoservicio de agencias: Aceptado, sin código.** Alta atómica por `crear_agencia`, código de acceso del piloto, 14 días de prueba, solo Colombia y COP | PR #310 y #312; tres vueltas de seguridad. La migración es T-268 |
| **Base del registro de agencias (T-268, ADR-0030 F1):** rol `viajapro_registro`, `crear_agencia` y `codigo_de_acceso_vigente` (`SECURITY DEFINER`), tablas globales del registro y `perfiles_de_agencia` ampliada con NIT. Sin API ni web todavía: nadie puede registrarse aún | PR #323; la migración aplicó en Postgres 16 y `aislamiento.spec.ts` pasó 158/158 (R-1 a R-10); dos pasadas de auditoría sin fugas entre agencias. **El NIT está en claro bajo RLS: decisión de cifrado en T-309** |
| Propuesta al viajero, en sesión aparte | PR #309; `docs/_bitacora/2026-11-20-propuesta-al-viajero.md` |
| **El RNT de la agencia** (T-261, ADR-0030 §3.3): tabla `perfiles_de_agencia` con RLS y un disparador que niega por defecto la verificación; la agencia lo escribe en Configuración y la propuesta al viajero lo imprime **solo si está verificado**. **Hoy nadie lo verifica sin SQL a mano** (T-280); con la API real la propuesta sale sin RNT hasta que el propietario marque la agencia piloto | PR #321 (migración, aprobada por el propietario), #322 y #324; P-1…P-6 de `aislamiento.spec.ts`, `agencia-ajustes.e2e-spec.ts`, `page.rnt.spec.tsx`; [bitácora](docs/_bitacora/2026-11-20-rnt-de-la-agencia.md). Supuesto sin verificar: el RNT son solo dígitos, de 1 a 10 |
| Servidores MCP del proyecto (`.mcp.json`): 21st.dev, Neon, Render y Vercel, con la clave leída del entorno | PR #305 y #310; la sesión de despliegue confirmó que los cuatro conectan |
| `docs/` reorganizada sin romper nada: comprobador de enlaces con línea base (job `enlaces-de-documentacion`, en modo aviso, fuera de los 8 obligatorios), `_auditoria` fusionada en `_auditorias`, la carpeta de traspaso movida a `docs/_traspasos/`, índice con los huérfanos | PR #316 a #319 (T-302) |
| **Libro de cobro del viajero, solo la base (T-328, T-329; [ADR-0034](docs/03-adr/0034-pagos-del-viajero-mvp-de-registro-manual.md), Propuesto):** tablas `pagos` (solo crece), `plazos_de_cobro` y `parametros_de_cobro` con RLS forzada, disparadores de inmutabilidad y del total del archivo, permisos `cobro.ver`, `cobro.registrar` y `cobro.corregir`. **Sin API ni pantalla: nadie puede registrar un pago todavía** (T-330 en curso) | PR #378 (ADR) y #382 (migración `20261121140000`); CI 15/15 y `aislamiento-tenants` en verde. [Modelo de datos](docs/02-arquitectura/03-modelo-de-datos.md) |

El repositorio tiene 55 migraciones. Cifras de pruebas: no se midieron en esta sesión y no se repiten.

**Defecto real que halló la suite:** la bandeja nunca ofrecía cotizaciones para enviar con la API real,
porque la ficha de CRM las trae vacías (R4). Ahora la bandeja las pide a `quoting`. Antes, la suite
había hallado que el modal de guardado ignoraba título y contacto. Detalle en la bitácora.

**No probado:** envío contra `graph.facebook.com`; un mensaje desde un celular real; correo con
Postmark real; las migraciones contra una base de producción (solo corren en el CI).

### Es maqueta (la pantalla no habla con la API, o finge)

| Qué | Cómo |
|---|---|
| `/configuracion`: SLA y plantillas oficiales | `mock-configuracion.ts`, `mock-plantillas.ts`; no hay endpoint de plantillas. `mock-viajes.ts` solo lo usan aún el buscador global y las notificaciones de demo |
| Campos personalizados, respuestas rápidas, filtros guardados, onboarding, preferencias de notificación | Solo `localStorage` |
| Con `.env.example` | Trae `NEXT_PUBLIC_USE_REAL_CRM`, `USE_REAL_INBOX` y `USE_REAL_AUTH` en `true`; el valor `false` vuelve a la maqueta |

### Es diseño o está a medias

| Qué | Dónde |
|---|---|
| Despliegue de staging **configurado y sin ejecutar**: Neon + web en Vercel + API en un solo proceso en Render (ADR-0028). Falta que el propietario siga la guía de paneles; hasta entonces `Deploy staging` falla en voz alta por falta de secretos | [guía](docs/07-ingenieria/despliegue-neon-vercel-render.md), T-079, T-239 |
| Operación antes del piloto: respaldo, costo y rotación de claves, **propuestas sin ensayar** | [`docs/06-operacion/`](docs/06-operacion/) |
| Políticas de seguridad: borrador sin aprobar | [`docs/05-seguridad/00-indice-de-politicas.md`](docs/05-seguridad/00-indice-de-politicas.md) |
| ADR-0023 (fiscal): propuesto. Las fuentes de la DIAN del 0023 **no están verificadas** | [`docs/03-adr/`](docs/03-adr/) |
| **Reportes por nivel de acceso (ADR-0035):** el permiso `reportes.ver_agencia` existe en el catálogo y lo tiene el rol `DUENO` (T-341), y **el servidor ya impone el alcance** (T-342): sale de la sesión, los tres puertos lo reciben obligatorio y un `asesorId` ajeno sin permiso responde **403** en reportes y en seguimientos, en vez del silencio provisional de #395, que se retiró. **La web ya lee `alcance` (T-343, en revisión):** sin conmutador, «Mis números» para quien solo ve lo suyo y «Reportes de la agencia» con filtro «Míos»; el alias transitorio del contrato se retiró (T-513). **Falta** lo del asesor que la API aún no sirve por asesor: cotizaciones abiertas y cobros por cobrar propios (T-528) y «Sin responsable» (T-529) | PR de T-341 y #417; [ADR-0035](docs/03-adr/0035-niveles-de-acceso-a-reportes.md) §3 y §4; [modelo de datos](docs/02-arquitectura/03-modelo-de-datos.md) |
| **Dashboard de administración (T-344, en revisión):** comparación entre asesores, cobros por moneda, salidas próximas y destinos, ya **enganchados en `/reportes`** debajo de la vista de agencia, cuando la respuesta trae `alcance: 'AGENCIA'` y sin «Míos». Ventas, embudo y respuesta los pinta aún `ReportesListo`; los bloques equivalentes de `DashboardAdmin` están sin montar (duplicación, T-534). Margen solo si la API envía la clave. Probado contra API simulada; no contra la real. Comparar asesores son N consultas (T-531) y no hay ventas por destino del periodo (T-532) | [bitácora](docs/_bitacora/2026-11-21-dashboard-de-administracion.md); [ADR-0035](docs/03-adr/0035-niveles-de-acceso-a-reportes.md) §5 y §6 |
| **Cobros del viajero:** la API de T-330 (dominio puro, contratos, módulo `payments`, rutas, idempotencia, eventos) está **en curso y sin integrar**; después T-331 (pantalla de archivo), T-332 (vista «quién pagó y quién debe») y T-333 («Hoy» y campana avisan cobros vencidos), en ese orden | [Roadmap JD Tours, eje C](docs/08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md); [bitácora](docs/_bitacora/2026-11-21-t330-dominio-y-api-de-cobros.md) |

### Lo que NO existe

- **Un servicio desplegado:** no hay URL viva verificable.
- **Un mensaje de celular real visto en la bandeja, ni una respuesta recibida en el celular.**
- **Plantilla de reapertura** fuera de la ventana de 24 h (T-078), **verificación del negocio en Meta** (T-080), Tech Provider.
- **Derechos del titular** (T-097), aviso de privacidad aprobado (T-093), RNBD (T-098).
- **API pública por claves e ingesta con IA** del catálogo (T-053 a T-058); **API y pantallas de pagos** (el libro existe, T-330 en curso), **automatizaciones**; aviso de plazos por WhatsApp o correo (T-254, parte externa; el aviso en la aplicación está en T-254 y su campana en T-255), historial de transiciones de reserva (T-250).
- Una agencia real con datos reales (criterio C1–C5 del roadmap v2).

## 2. Cómo se trabaja

- **El ciclo autónomo de OpenCode (ADR-0016) está detenido** por decisión del propietario desde 2026-10-26 (cuota agotada, ciclos lentos). La infraestructura (`scripts/ciclo*.mjs`, GitHub Apps, `roadmap/tasks.yaml`, cierre automático de tareas) sigue en el repo; **nadie la ejecuta hoy**. Para reanudarla: [`docs/09-ia/07-ciclo-autonomo.md`](docs/09-ia/07-ciclo-autonomo.md).
- **Quién escribe código ahora:** los agentes de este repositorio (Claude), en todos los carriles. **Antigravity no está habilitado** (decisión del propietario, 2026-11-05): un agente `frontend` de Claude hace el carril `b/`.
- **Cómo entra algo en `main`:** solo por PR con los 8 checks obligatorios en verde y la rama al día, por auto-merge o por el `integrador`. Las rutas protegidas (migraciones, RLS, cifrado, `render.yaml`, `infra/`, `.github/`, `scripts/`, dependencias, `CLAUDE.md`, `AGENTS.md`, ADR) esperan la aprobación del propietario vía CODEOWNERS. Ver [`docs/07-ingenieria/03-git.md`](docs/07-ingenieria/03-git.md).
- **Carriles:** `a/` backend y datos, `b/` frontend, `i/` documentación e integración; un PR no los mezcla ([`MARCO.md`](docs/_contexto/MARCO.md) §5).

### Quién trabaja en qué

| Carril | Quién | En qué |
|---|---|---|
| Frontend (`apps/web`, `packages/ui`, `packages/sdk`) | Agente `frontend` (Claude) | Suite de navegador, vista previa del envío, UI de motivos de pérdida |
| Backend (`apps/api`) | Agentes `backend`, `whatsapp` | Cola menor: T-235 (prueba de arquitectura del arranque), T-226 (c) |
| Datos | Agente `datos` | 40 migraciones en `main`; T-341 (permiso `reportes.ver_agencia`) integrada; cola T-505, T-507, T-509 |
| Integración y documentación | `integrador`, `documentador` | Hilo, ADR, bitácora, `docs/06-operacion/` |
| Diseño y experiencia de usuario | Sesión de diseño (Claude) | Auditoría visual y responsiva (celular, tablet y escritorio) y plan de rediseño; Fase 2 con OK del orquestador |
| Cobros del viajero | Sesión de cobros (Claude) | T-330, API de pagos, con auditoría de seguridad antes de integrar |
| Orquestación | Sesión madre (Claude), despertada cada 2 h | Integra por ventanas, audita, reparte y registra; ver [roadmap maestro](docs/08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) |
| Producto y estrategia | `jefe-de-producto`, `dueno-de-producto` | Roadmap v3; demo a JD Tours |
| Ciclo OpenCode | **Detenido** | Ver arriba |

## 3. Bloqueos reales

| Bloqueo | Qué impide | Dueño |
|---|---|---|
| `CAMPOS_SENSIBLES_KEY` y `_VERSION=1` sin cargar en Render, y sin copia guardada de la clave | Sin ella el cifrado no puede usarse desplegado; perder la clave pierde los datos | Propietario |
| `STAGING_DESPLIEGUE=desactivado`. Neon `viajapro-staging` existe con 32 de 47 migraciones aplicadas y faltan 3 roles; **el proyecto de Vercel `viajapro-staging` ya existe** (dominio `viajapro-staging.vercel.app`, un despliegue en producción `READY` hecho desde `main` en el PR #321, del 2026-11-20, es decir, sin nada de lo posterior; verificado el 2026-11-21 con la herramienta de Vercel: la página responde 200 y muestra «Verificando tu sesión»). **Render: sin verificar** (la herramienta pide elegir el espacio de trabajo y eso lo decide el propietario). La sesión de despliegue espera tus decisiones: qué contraseñas de rol carga quién, `API_TRUST_PROXY` y los secretos que solo cargas tú | No hay nada que enseñar fuera de local | Propietario |
| Etiqueta `override-lane` y check «Carril y tarea» en #402 (sustituto de #362; se cierra #362 al integrarlo) | La web del ingreso por apodo no entra | Propietario |
| `navegador` como check obligatorio en la protección de `main` (contenido en el commit `27412e7`) | Hoy un PR puede integrarse con `navegador` rojo si cumple los 8 obligatorios | Propietario |
| Confirmación escrita para que la sesión de cobros trabaje sin supervisión | Hoy trabaja con un PR por tarea | Propietario |
| Verificación del negocio en Meta / Tech Provider sin iniciar (T-080); falta un mensaje desde un celular | Solo número de prueba y Graph falsa; no hay lanzamiento | Propietario |
| Decidir ADR-0033 (número de JD Tours: coexistencia con lista de exclusión o número separado; chats de proveedores y Ley 1581). Coexistencia verificada en Meta el 2026-11-21: no pierde la app, Colombia no excluida, pero todo chat individual entra al CRM | Conectar el número real de la agencia piloto (además de T-080) | Propietario |
| Decidir zod 4 y los ADR-0023 y 0024 | Queda 1 vulnerabilidad alta en producción; el trabajo fiscal no avanza | Propietario |
| Sin Redis ni trabajador en la máquina del propietario (no hay Docker) | Con `unico` no hace falta Redis; falta el recorrido real en Codespaces | Propietario, `devops` |
| Tarifario real de la agencia piloto | El catálogo sigue con datos verosímiles | Propietario / agencia |

## 4. Decisiones vigentes

| Decisión | Dónde |
|---|---|
| Stack, WhatsApp Cloud API, multi-tenancy RLS, monolito modular, parametrización, Neon | ADR-0001, 0002, 0003, 0004, 0006, 0007 |
| Webhook tal como es; trabajador en `apps/api` | ADR-0010 |
| Autenticación y tenant de sesión | ADR-0011 |
| Correo con Postmark; despliegue en Render (empezando por staging) | ADR-0012, ADR-0013 |
| Cifrado de campos sensibles (sustituye al 0014) | ADR-0015 |
| Ciclo con protección de servidor (R11 reformulada) | ADR-0016 |
| Catálogo gestionable por la agencia | ADR-0017 (Aceptado) |
| Envío saliente de WhatsApp: puerto, cola, idempotencia, credencial | [ADR-0018](docs/03-adr/0018-envio-saliente-de-whatsapp.md) (Aceptado 2026-11-15) |
| Despliegue mínimo: un proceso y la cola sobre Postgres, sin Redis | [ADR-0019](docs/03-adr/0019-despliegue-minimo-un-proceso-sin-redis.md) (Aceptado 2026-11-15) |
| Mercado base Colombia; el número de prueba de Meta basta para construir | [`docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md`](docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md) §2 |
| **Sin decidir:** nombre comercial, precios y planes | Mismo archivo, §2 |

El índice completo de ADR y su estado está en [`docs/README.md`](docs/README.md#03--decisiones-de-arquitectura-adr).

## 5. Dónde mirar

| Qué | Dónde |
|---|---|
| La cola de trabajo | [`roadmap/tasks.yaml`](roadmap/tasks.yaml): 143 `done`, 5 `in_progress`, 5 `ready`, 10 `blocked`, 65 `backlog`, 3 `dropped`. `done` = integrada, no desplegada (T-079 sigue reabierta) |
| Roadmap técnico v2 | [`docs/08-roadmap/01-roadmap.md`](docs/08-roadmap/01-roadmap.md); plan de la auditoría: [`02-plan-correccion-auditoria-2026-11-15.md`](docs/08-roadmap/02-plan-correccion-auditoria-2026-11-15.md) |
| Roadmap de producto v3 | [`docs/08-roadmap/02-roadmap-producto-v3.md`](docs/08-roadmap/02-roadmap-producto-v3.md); ruta a la Fase 1: [`04-ruta-al-entregable-fase-1.md`](docs/08-roadmap/04-ruta-al-entregable-fase-1.md) |
| Qué ocurrió cada día | [`docs/_bitacora/`](docs/_bitacora/) y [`docs/_contexto/DIARIO.md`](docs/_contexto/DIARIO.md); última auditoría: [2026-11-15 integral](docs/_auditorias/2026-11-15-auditoria-integral.md) |
| Operación (respaldo, costo, claves) | [`docs/06-operacion/`](docs/06-operacion/) |
| Historial completo anterior de este archivo | [`docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md`](docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md) |
| Auditorías | AUD-001…017 en el archivo de arriba; integrales en [`docs/_auditorias/`](docs/_auditorias/) |
| Qué árboles de trabajo están atrasados | `node scripts/estado-de-arboles.mjs` (en un PR en curso; ver [`docs/07-ingenieria/03-git.md`](docs/07-ingenieria/03-git.md#sincronía-cómo-no-trabajar-con-cosas-atrasadas)) |

## 6. Cómo actualizar este archivo

1. **Al cerrar cada sesión**, cambia la fecha y quién actualizó. Si hace más de dos semanas que no
   se toca y hay commits recientes en `main`, el archivo miente.
2. **Verifica antes de escribir.** Un hecho de infraestructura se comprueba con un comando
   (`gh repo view`, `gh api …/protection`, `gh pr list`, `git log origin/main`). Lo que no se pudo
   comprobar se escribe «no verificado».
3. **Mantenlo corto (máx. ~250 líneas).** Aquí va el presente. Lo que ocurrió va a
   `docs/_bitacora/AAAA-MM-DD-<tema>.md`; lo que viene, a `roadmap/tasks.yaml`; lo que se decidió,
   a un ADR. No dupliques: enlaza.
4. **Separa real, maqueta y diseño.** «Implementado en un PR abierto» no es «en `main`»; «en `main`»
   no es «probado contra el servicio real»; «integrado» no es «desplegado».
5. **Un bloqueo tiene dueño.** Sin dueño, no es un bloqueo: es un deseo.
6. Cuando crezca, archiva el excedente en `docs/_bitacora/archivo/` sin perder nada.
