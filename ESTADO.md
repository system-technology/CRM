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
| Última actualización | 2026-11-15 |
| Actualizado por | `documentador` (T-215: hilo al día con `main` y con el PR #256) |
| Fase | **Fase 1 del backlog: «Un CRM mostrable y endurecido»** (M1 del [roadmap v2](docs/08-roadmap/01-roadmap.md)). Sin agencia real todavía. Prioridad vigente: cerrar H1–H6 y la demo a JD Tours ([`MARCO.md`](docs/_contexto/MARCO.md) §6) |
| Avance | 93 tareas `done` en `roadmap/tasks.yaml` (`main` tenía 94; se reabrió T-079, cuyo runbook no es un despliegue vivo). El PR #256 no cierra ninguna: las deja `in_progress`. «Done» significa integrada en `main`, **no** probada de punta a punta con la web |
| Próximo hito | Integrar el PR #256 y correr el flujo H1–H6 en navegador contra la API real (T-126, en curso) |

---

## 1. Dónde estamos

Verificado el 2026-11-15 sobre `origin/main` (`762fb42`) y la rama `claude/repository-status-d4ug6p`
(23 commits por delante). Fuente: [auditoría integral 2026-11-15](docs/_auditorias/2026-11-15-auditoria-integral.md)
y [plan de corrección](docs/08-roadmap/02-plan-correccion-auditoria-2026-11-15.md). La matriz anterior
(2026-11-04) describía otro repositorio: presentaba como diseño lo que ya estaba integrado.

**Veredicto: sigue sin haber un flujo completo verificado en navegador por una agencia. Seguimos en
local.** El backend tiene pruebas e2e en CI; la web nunca se prueba contra la API (sin Playwright);
WhatsApp no se ha probado entrando y saliendo contra Meta real.

### Es real (en `main`)

`main` tiene 309 archivos de prueba (147 API, 138 web, 9 contracts, 8 database, 7 domain) y 32
migraciones. La rama los sube a 325. **No se ejecutaron en esta sesión**; la última cifra de pruebas
medida es la de la auditoría (1325 en la API) y no se repite como actual. Ninguna prueba abre un
navegador.

| Qué | Evidencia |
|---|---|
| Aislamiento entre agencias (RLS, cuatro roles, arranque que aborta con rol equivocado) | Job `aislamiento-tenants`, `arranque-seguro.e2e-spec.ts` |
| `main` protegida: PR, 8 checks obligatorios, rama al día, administradores incluidos | `.github/proteccion-main.json` |
| Permisos de mutación exigidos en los controladores (PR #191, integrado) | `apps/api/src/shared/autorizacion/mutaciones-con-permiso.spec.ts`; la única excepción documentada es marcar una conversación como leída |
| Modo de un solo proceso sin Redis (PR #211) y envíos sobre Postgres (PR #220); ADR-0019 | `apps/api/src/proceso-unico/`, `cola-de-envios.postgres.ts`, `reserva-de-envio.postgres.ts`; [runbook](docs/07-ingenieria/runbook-modo-unico.md) |
| Envío saliente a WhatsApp: cola, idempotencia, ventana de 24 h; ADR-0018 | `envio-whatsapp.graph.ts`, `enviar-cotizacion.e2e-spec.ts`; **contra Graph API falsa** |
| Identidad: sesión, OTP, invitaciones, baja de miembros; `GET /identidad/miembros` | `identity.e2e-spec.ts`, `invitaciones.e2e-spec.ts`, `miembros.controller.ts` |
| Ajustes de la agencia y estado del canal de WhatsApp | `agencia-ajustes.e2e-spec.ts`, `estado-del-canal.e2e-spec.ts` |
| CRM: contactos, oportunidades, pipeline, etapas configurables (`/crm/etapas`), seguimientos, consentimiento | `crm.e2e-spec.ts`, `etapas.e2e-spec.ts`, `contactos-y-seguimientos.e2e-spec.ts` |
| Catálogo y cotizador: el texto enviado no lleva neto ni margen | `apps/api/src/modules/quoting/*.e2e-spec.ts`, `enviar-cotizacion.e2e-spec.ts` |
| Bandeja: listar, notas, estado, asignación, visibilidad por asesor, tiempo real | `inbox-visibilidad`, `inbox-tiempo-real(-redis)` |
| Recepción: webhook firmado → cola → consumidor → mensaje (payload cifrado) | `inbox-webhook`, `inbox-bullmq.e2e-spec.ts` |
| Reportes con margen real: sale de la base y lo protege `cotizacion.ver_neto_y_margen` | `analytics/interface`, `reportes.e2e-spec.ts` (ya no son constantes del 20 % y 80 %) |
| Web contra la API en equipo y etapas | `equipo-api.ts` llama `/identidad/miembros`; `crm-api.ts` llama `/crm/etapas` y propaga el error en vez de simular |
| Una recepción manual real: botón «Probar» de Meta por túnel, 2026-10-26 | Sin registro en el repo; ver [bitácora](docs/_bitacora/2026-10-26-sincronia-del-hilo.md) |

**No probado:** web contra API (ni en CI ni en navegador documentado); envío contra `graph.facebook.com`;
un mensaje desde un celular real; correo con Postmark real.

### En el PR #256, sin integrar (rama `claude/repository-status-d4ug6p`)

Estas correcciones de la auditoría están en la rama, **no en `main`**. Su estado en `tasks.yaml` es
`in_progress` hasta que el PR entre.

| Tarea | Qué corrige | Hallazgo |
|---|---|---|
| T-173, T-174 | Error de hidratación en `/ingresar`; `/login` daba 404; redirección abierta en `redirigir` | H-3, H-4 |
| T-175 | El atajo `x-dev-tenant-id` solo atiende peticiones desde loopback | A1 |
| T-177, T-178 | Dinero en unidad mínima en la bandeja; sin datos inventados en modo real | A3, A4 |
| T-179, T-188, T-189, T-216 | Cotizar familias con edad por pasajero; filtrar por acomodación; no sumar monedas distintas; error tipado si un pasajero no tiene tarifa | C1, C2, M8 |
| T-181 | Totales del pipeline por moneda | A5 |
| T-182 | El SLA de primera respuesta se activa con mensajes reales | A6 |
| T-183, T-184, T-187 | Ventas por fecha de aceptación; métricas con n mínimo; primera respuesta sobre un mismo grupo, con p90 | A7, A8, M12 |
| T-185 | La bandeja muestra los errores de envío y no manda texto libre como plantilla | M1 |
| T-193 | `pnpm dev` construye `contracts` y `domain` antes de arrancar | A11 |
| T-195, T-197, T-200 | Pruebas: contratos en e2e, aislamiento HTTP del CRM, bordes de dinero | A14, M4, M7 |

T-176 quedó `dropped` (el permiso de «leída» es una excepción de diseño probada).

### Es maqueta (la pantalla no habla con la API, o finge)

| Qué | Cómo |
|---|---|
| `/configuracion`: SLA y plantillas oficiales; `/viajes` | `mock-configuracion.ts`, `mock-plantillas.ts`, `mock-viajes.ts`; no hay endpoint de plantillas |
| Campos personalizados, respuestas rápidas, filtros guardados, onboarding, preferencias de notificación | Solo `localStorage` |
| `/catalogo`, `/cotizador`, `/cotizaciones`, `/contactos` | Reales por defecto, pero conservan ramas y estado inicial mock |
| Con `.env.example` | Trae `NEXT_PUBLIC_USE_REAL_CRM`, `USE_REAL_INBOX` y `USE_REAL_AUTH` en `true`; el valor `false` vuelve a la maqueta |

### Es diseño o está a medias

| Qué | Dónde |
|---|---|
| Cifrado de campos sensibles: ADR-0015 aceptado, **sin implementar**; `mensajes.texto` está en claro. El PR #29 abierto es solo de documentación | [ADR-0015](docs/03-adr/0015-cifrado-de-campos-sensibles.md), T-212 |
| Despliegue en Render: `render.yaml` sigue con la topología de ADR-0013 (web, API, trabajador, Redis); el [runbook](docs/07-ingenieria/runbook-redis-staging.md) no despliega nada. `Deploy staging` termina en verde con el aviso «Faltan los secretos del Environment staging» (A10) | T-079 reabierta |
| Despliegue de ADR-0019 en Fly: sin ejecutar (pasos 8 a 10 del plan) | [ADR-0019](docs/03-adr/0019-despliegue-minimo-un-proceso-sin-redis.md) §7 |
| Operación antes del piloto: respaldo, costo y rotación de claves, **escritos como propuesta y sin ensayar** | [`docs/06-operacion/`](docs/06-operacion/): `respaldo-y-restauracion.md`, `costo-por-tenant.md`, `rotacion-de-claves.md` |
| Políticas de seguridad: borrador sin aprobar | [`docs/05-seguridad/00-indice-de-politicas.md`](docs/05-seguridad/00-indice-de-politicas.md) |

### Lo que NO existe

- **Ninguna prueba que ejercite la web contra la API** (sin Playwright ni equivalente; T-196 y vecinas siguen en la cola).
- **Un servicio desplegado:** no hay URL viva verificable.
- **Redis y trabajador corriendo en la máquina del propietario.** El trabajador es `apps/api/src/worker.ts`; `apps/worker` es un README. Con `MODO_DESPLIEGUE=unico` no hacen falta.
- **Un mensaje de celular real visto en la bandeja, ni una respuesta recibida en el celular.**
- **Plantilla de reapertura** fuera de la ventana de 24 h (T-078), **verificación del negocio en Meta** (T-080), Tech Provider.
- **Derechos del titular** (T-097), aviso de privacidad aprobado (T-093), RNBD (T-098).
- **API pública por claves e ingesta con IA** del catálogo (T-053 a T-058); **pagos**, **automatizaciones**, archivos de viaje reales; continuación tras `ACEPTADA` (A17).
- Una agencia real con datos reales (criterio C1–C5 del roadmap v2).

## 2. Cómo se trabaja

- **El ciclo autónomo de OpenCode (ADR-0016) está detenido** por decisión del propietario desde 2026-10-26 (cuota agotada, ciclos lentos). La infraestructura (`scripts/ciclo*.mjs`, GitHub Apps, `roadmap/tasks.yaml`, cierre automático de tareas) sigue en el repo; **nadie la ejecuta hoy**. Para reanudarla: [`docs/09-ia/07-ciclo-autonomo.md`](docs/09-ia/07-ciclo-autonomo.md).
- **Quién escribe código ahora:** los agentes de este repositorio (Claude), en todos los carriles. **Antigravity no está habilitado** (decisión del propietario, 2026-11-05): un agente `frontend` de Claude hace el carril `b/`.
- **Cómo entra algo en `main`:** solo por PR con los 8 checks obligatorios en verde y la rama al día, por auto-merge o por el `integrador`. Las rutas protegidas (migraciones, RLS, cifrado, `render.yaml`, `infra/`, `.github/`, `scripts/`, dependencias, `CLAUDE.md`, `AGENTS.md`, ADR) esperan la aprobación del propietario vía CODEOWNERS. Ver [`docs/07-ingenieria/03-git.md`](docs/07-ingenieria/03-git.md).
- **Carriles:** `a/` backend y datos, `b/` frontend, `i/` documentación e integración; un PR no los mezcla ([`MARCO.md`](docs/_contexto/MARCO.md) §5).

### Quién trabaja en qué

| Carril | Quién | En qué |
|---|---|---|
| Frontend (`apps/web`, `packages/ui`, `packages/sdk`) | Agente `frontend` (Claude) | Campaña funcional H1–H6 (T-126), lotes del PR #256 |
| Backend (`apps/api`) | Agentes `backend`, `whatsapp` | Cotizador, reportes, SLA (PR #256); cifrado de PII (T-212) en cola |
| Datos | Agente `datos` | 32 migraciones en `main`; función de zona horaria (PR #234, abierto) |
| Integración y documentación | `integrador`, `documentador` | Hilo, ADR, bitácora, `docs/06-operacion/` |
| Producto y estrategia | `jefe-de-producto`, `dueno-de-producto` | Roadmap v3; demo a JD Tours |
| Ciclo OpenCode | **Detenido** | Ver arriba |

## 3. Bloqueos reales

| Bloqueo | Qué impide | Dueño |
|---|---|---|
| PR #256 sin integrar | Las correcciones de la auditoría (seguridad del atajo de desarrollo, dinero, cotizador de familias) no están en `main` | `integrador`, propietario (rutas protegidas) |
| Sin prueba web↔API | Nada permite afirmar que una pantalla funciona con la API real | `qa`, `frontend` |
| Sin Redis ni trabajador en la máquina del propietario (no hay Docker) | Con `unico` no hace falta Redis; falta el recorrido real en Codespaces | Propietario, `devops` |
| Sin secretos del entorno `staging` ni servicio en Render o Fly | No hay nada que enseñar fuera de local | Propietario |
| Verificación del negocio en Meta / Tech Provider sin iniciar (T-080) | Solo número de prueba; no hay lanzamiento | Propietario |
| Cifrado de PII sin implementar (T-212, A2) | Texto de mensajes en claro; bloquea datos reales | `backend`, `datos`, `auditor-seguridad` |
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
| La cola de trabajo | [`roadmap/tasks.yaml`](roadmap/tasks.yaml): 93 `done`, 20 `in_progress`, 28 `ready`, 10 `blocked`, 65 `backlog`, 3 `dropped`. Ojo: `done` = integrada, no probada con la web (T-079 se reabrió: el runbook no es un despliegue vivo) |
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
