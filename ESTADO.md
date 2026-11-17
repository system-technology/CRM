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
| Última actualización | 2026-11-16 (revisión de PR; `main` en `a7fb3d5`) |
| Actualizado por | Claude (hilo al día con los PR #256 a #279) |
| Fase | **Fase 1 del backlog: «Un CRM mostrable y endurecido»** (M1 del [roadmap v2](docs/08-roadmap/01-roadmap.md)). Sin agencia real todavía. Prioridad vigente: la demo a JD Tours ([`MARCO.md`](docs/_contexto/MARCO.md) §6) |
| Avance | 151 tareas `done` en `roadmap/tasks.yaml`. «Done» significa integrada en `main`, **no** desplegada ni probada con Meta real |
| Próximo hito | Que el propietario cargue la clave de cifrado y decida el despliegue; después, prueba con Meta real (T-080). Del lado del código solo queda cola menor: T-235 y T-226 (c), recifrado por lotes, que solo hace falta cuando haya una clave real que rotar |

---

## 1. Dónde estamos

Verificado el 2026-11-17 sobre `origin/main` (`68c3c38`, PR #293) con `git log`, `gh` y `roadmap/tasks.yaml`.
Fuente de la corrección de rumbo: [auditoría integral 2026-11-15](docs/_auditorias/2026-11-15-auditoria-integral.md)
y su [plan](docs/08-roadmap/02-plan-correccion-auditoria-2026-11-15.md). Entrada del día:
[bitácora](docs/_bitacora/2026-11-15-mvp-en-navegador-y-cierre-de-auditoria.md).

**Veredicto: el flujo H1–H6 ya se recorre en un navegador, en CI, contra la API real. Pero la Graph
API es falsa y no hay nada desplegado.** Ninguna agencia lo ha visto ni un mensaje de celular real ha
entrado. Seguimos en local.

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
| Modo demo sin dominio (opción C): la web en `*.vercel.app` reescribe `/api/v1` y el tiempo real (long-polling) a la API en Render | PR #289; [guía](docs/07-ingenieria/despliegue-neon-vercel-render.md). **Sin probar contra Vercel real** |
| Dependencias: `pnpm audit` de producción pasó de 3 críticas y 15 altas a 0 y 1 (queda zod v3; zod 4 lo decide el propietario) | PR #267 |

El repositorio tiene 43 migraciones. Cifras de pruebas: no se midieron en esta sesión y no se repiten.

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
| Permisos `archivo.ver` / `archivo.operar` (ADR-0024 §3.7): hoy las mutaciones de reservas exigen `cotizacion.escribir` y la lectura cualquier miembro | T-249 (datos) |
| ADR-0023 (fiscal): propuesto. Las fuentes de la DIAN del 0023 **no están verificadas** | [`docs/03-adr/`](docs/03-adr/) |

### Lo que NO existe

- **Un servicio desplegado:** no hay URL viva verificable.
- **Un mensaje de celular real visto en la bandeja, ni una respuesta recibida en el celular.**
- **Plantilla de reapertura** fuera de la ventana de 24 h (T-078), **verificación del negocio en Meta** (T-080), Tech Provider.
- **Derechos del titular** (T-097), aviso de privacidad aprobado (T-093), RNBD (T-098).
- **API pública por claves e ingesta con IA** del catálogo (T-053 a T-058); **pagos**, **automatizaciones**; aviso de plazos por WhatsApp o correo (T-254, parte externa; el aviso en la aplicación está en T-254 y su campana en T-255), historial de transiciones de reserva (T-250).
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
| Datos | Agente `datos` | 40 migraciones en `main` |
| Integración y documentación | `integrador`, `documentador` | Hilo, ADR, bitácora, `docs/06-operacion/` |
| Producto y estrategia | `jefe-de-producto`, `dueno-de-producto` | Roadmap v3; demo a JD Tours |
| Ciclo OpenCode | **Detenido** | Ver arriba |

## 3. Bloqueos reales

| Bloqueo | Qué impide | Dueño |
|---|---|---|
| `CAMPOS_SENSIBLES_KEY` y `_VERSION=1` sin cargar en Render, y sin copia guardada de la clave | Sin ella el cifrado no puede usarse desplegado; perder la clave pierde los datos | Propietario |
| `STAGING_DESPLIEGUE=desactivado` y sin secretos del entorno `staging` ni servicio en Render o Fly | No hay nada que enseñar fuera de local | Propietario |
| Verificación del negocio en Meta / Tech Provider sin iniciar (T-080); falta un mensaje desde un celular | Solo número de prueba y Graph falsa; no hay lanzamiento | Propietario |
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
