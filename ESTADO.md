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
| Última actualización | 2026-11-04 |
| Actualizado por | `documentador` (auditoría de veracidad) |
| Fase | **Fase 1 del backlog: «Un CRM mostrable y endurecido»** (M1 del [roadmap v2](docs/08-roadmap/01-roadmap.md)). Sin agencia real todavía |
| Avance | 86 tareas `done` en `roadmap/tasks.yaml`. «Done» significa integrada en `main`, **no** probada de punta a punta con la web: ver §1 y la [matriz](docs/_bitacora/2026-11-04-auditoria-de-veracidad.md) |
| Próximo hito | Correr la jornada completa **en local** (Redis, trabajador, túnel, web contra API real) antes de pagar hosting |

---

## 1. Dónde estamos

Auditado el 2026-11-04 sobre `origin/main` (`98c2a08`). Detalle y evidencia por capacidad:
[`docs/_bitacora/2026-11-04-auditoria-de-veracidad.md`](docs/_bitacora/2026-11-04-auditoria-de-veracidad.md).

**Veredicto: no hay hoy un flujo completo usable por una agencia. Seguimos en local.** Cada pieza del
backend tiene pruebas e2e en CI, pero la web nunca se prueba contra la API, WhatsApp no se ha probado
entrando y saliendo contra Meta real, y con `.env.example` la web arranca en maqueta.

### Es real (backend en `main`, probado en CI contra Postgres 16 y Redis 7)

El job `test` ejecuta 121 archivos y 965 pruebas; `aislamiento-tenants` prueba RLS. Última corrida de `main`
(run 41942116518): 9 jobs en verde. Ninguna prueba abre un navegador.

| Qué | Evidencia |
|---|---|
| Aislamiento entre agencias (RLS, cuatro roles, arranque que aborta con rol equivocado) | Job `aislamiento-tenants`, `arranque-seguro.e2e-spec.ts` |
| `main` protegida: PR, 8 checks, rama al día, administradores incluidos | `.github/proteccion-main.json` |
| Identidad: sesión, OTP, invitaciones, baja de miembros | `identity.e2e-spec.ts`, `invitaciones.e2e-spec.ts` |
| Catálogo: listar, crear, editar, tarifas, vigencias, historial, importar, ajuste de promoción | `apps/api/src/modules/quoting/*.e2e-spec.ts` |
| Cotizador: calcular, guardar, versiones, estados; el texto enviado no lleva neto ni margen | `cotizador-punta-a-punta`, `cotizaciones`, `enviar-cotizacion.e2e-spec.ts` |
| Bandeja: listar, notas, estado, asignación, visibilidad por asesor, tiempo real (Socket.IO con Redis) | `inbox-visibilidad`, `inbox-tiempo-real(-redis)` |
| Recepción: webhook firmado → Redis real → consumidor → mensaje (payload cifrado) | `inbox-webhook`, `inbox-bullmq.e2e-spec.ts` |
| CRM: contactos, oportunidades, pipeline, seguimientos con fecha, consentimiento | `crm.e2e-spec.ts`, `contactos-y-seguimientos.e2e-spec.ts` |
| Envío de texto y de cotización a WhatsApp: cola, idempotencia, ventana de 24 h | `enviar-cotizacion.e2e-spec.ts` (6); **contra Graph API falsa** |
| Una recepción manual real: botón «Probar» de Meta por túnel, 2026-10-26 | Sin registro en el repo; ver [bitácora](docs/_bitacora/2026-10-26-sincronia-del-hilo.md) |

**No probado:** web contra API (ni en CI ni documentado en navegador desde el 2026-10-27); envío contra
`graph.facebook.com`; un mensaje desde un celular real; correo con Postmark real; trabajador y Redis en una
máquina del propietario.

### Es maqueta (la pantalla no habla con la API, o finge)

| Qué | Cómo |
|---|---|
| Con `.env.example` tal cual, **toda la web** | Trae `NEXT_PUBLIC_USE_REAL_CRM=false` y `USE_REAL_INBOX=false`; `USE_REAL_AUTH` no está y sin él la sesión es mock |
| `/configuracion` (SLA, agencia, estado de WhatsApp, plantillas oficiales), `/viajes` | `mock-configuracion.ts`, `mock-viajes.ts`, `mock-plantillas.ts` |
| Equipo (lista de miembros) | Pide `GET /api/v1/identidad/usuarios`, que no existe; cae a `localStorage` o mock |
| Etapas del pipeline configurables (T-025) | La web llama `/api/v1/crm/etapas`, que no existe; ante 404 simula el guardado |
| Campos personalizados, respuestas rápidas, filtros guardados, onboarding, preferencias de notificación | Solo `localStorage` |
| Margen y costo neto de `/reportes` | Constantes del 20 % y 80 % de las ventas, no datos |
| `/catalogo`, `/cotizador`, `/cotizaciones`, `/contactos` | Reales por defecto en código, pero conservan ramas y estado inicial mock (nombres de contacto; teléfono `+573001234567` en el modal de `/cotizaciones`) |

### Es diseño (documentado, no construido o no integrado)

| Qué | Dónde |
|---|---|
| Permisos de mutación en la API: la migración está en `main`; **los controladores no los exigen** | PR #191 abierto. T-089 figura `done` solo por la migración |
| Despliegue mínimo de un proceso sin Redis (**Propuesto**) | PR #200, ADR-0019 |
| Cifrado de campos sensibles: ADR aceptado, sin implementar; `mensajes.texto` está en claro | [ADR-0015](docs/03-adr/0015-cifrado-de-campos-sensibles.md), PR #29 abierto |
| Envío saliente de WhatsApp (**Propuesto**, ya implementado) | [ADR-0018](docs/03-adr/0018-envio-saliente-de-whatsapp.md) |
| Despliegue en Render: `render.yaml` y [runbook](docs/07-ingenieria/runbook-redis-staging.md) | `Deploy staging` termina en verde con el aviso «Faltan los secretos del Environment staging» |
| Políticas de seguridad: borrador sin aprobar | [`docs/05-seguridad/00-indice-de-politicas.md`](docs/05-seguridad/00-indice-de-politicas.md) |

### Lo que NO existe

- **Ninguna prueba que ejercite la web contra la API** (sin Playwright ni equivalente).
- **Un servicio desplegado:** no hay URL viva verificable. T-079 está `done` por el runbook.
- **Redis y trabajador corriendo en la máquina de desarrollo.** El trabajador es `apps/api/src/worker.ts`; `pnpm dev` no lo arranca; `apps/worker` es un README.
- **Un mensaje de celular real visto en la bandeja, ni una respuesta recibida en el celular.**
- **Plantilla de reapertura** fuera de la ventana de 24 h (T-078), **verificación del negocio en Meta** (T-080), Tech Provider.
- **Derechos del titular** (exportar y suprimir datos, T-097), aviso de privacidad aprobado (T-093), RNBD (T-098).
- **API pública por claves e ingesta con IA** del catálogo (T-053 a T-058); **pagos**, **automatizaciones**, archivos de viaje reales.
- Una agencia real con datos reales (criterio C1–C5 del roadmap v2).

## 2. Cómo se trabaja desde el 2026-10-26

- **El ciclo autónomo de OpenCode (ADR-0016) se montó, entregó 3 PRs de backend (#21, #23, #25) y se detuvo por decisión del propietario:** la cuota de OpenCode Go se agotó y los ciclos eran lentos. La infraestructura (`scripts/ciclo*.mjs`, GitHub Apps, `roadmap/tasks.yaml`, cierre automático de tareas) sigue en el repo; **nadie la ejecuta hoy**. Para reanudarla: [`docs/09-ia/07-ciclo-autonomo.md`](docs/09-ia/07-ciclo-autonomo.md).
- **Quién escribe código ahora:** los agentes de este repositorio (Claude) en backend, datos, infraestructura y documentación; **Antigravity** en frontend.
- **Cómo entra algo en `main`:** solo por PR con los 8 checks en verde y la rama al día, por auto-merge o por el `integrador`. Las rutas protegidas (migraciones, RLS, cifrado, `render.yaml`, `infra/`, `.github/`, `scripts/`, dependencias, `CLAUDE.md`, `AGENTS.md`, ADR) esperan la aprobación del propietario vía CODEOWNERS. Ver [`docs/07-ingenieria/03-git.md`](docs/07-ingenieria/03-git.md).

### Quién trabaja en qué

| Carril | Quién | En qué |
|---|---|---|
| Frontend (`apps/web`, `packages/ui`, `packages/sdk`) | Antigravity | Cola de `roadmap/tasks.yaml` (ramas `b/`; pendientes T-118 y T-119). Prompt: [`docs/09-ia/08-prompt-antigravity.md`](docs/09-ia/08-prompt-antigravity.md). Skill: `.agent/skills/ux-crm-turismo`. Ramas `b/T-0NN-…` |
| Backend (`apps/api`) | Agentes de Claude (`backend`, `whatsapp`) | Permisos en controladores (PR #191, abierto) |
| Datos | Agentes de Claude (`datos`) | Migraciones al día en `main` (30) |
| Integración y documentación | `integrador`, `documentador` | Hilo, ADR, bitácora |
| Producto y estrategia | `jefe-de-producto`, `dueno-de-producto` | Roadmap v3 integrado; ADR-0019 propuesto (PR #200) |
| Ciclo OpenCode | **Detenido** | Ver arriba |

## 3. Bloqueos reales

| Bloqueo | Qué impide | Dueño |
|---|---|---|
| Sin Redis ni trabajador en la máquina del propietario (no hay Docker) | No se puede ver un mensaje convertirse en conversación ni enviar una respuesta | Propietario, `devops` |
| Sin prueba web↔API | Nada permite afirmar que una pantalla funciona con la API real | `qa`, `frontend` |
| Endpoints que la web llama y no existen: `identidad/usuarios`, `crm/etapas`, estado del canal, plantillas | Equipo, etapas y Configuración siguen en maqueta | `backend` |
| PR #191 (permisos en controladores) abierto | Cualquier miembro puede escribir en bandeja, CRM y cotizaciones | `backend` |
| Sin secretos del entorno `staging` ni servicio en Render | No hay nada que enseñar fuera de local | Propietario |
| Verificación del negocio en Meta / Tech Provider sin iniciar (T-080) | Solo número de prueba; no hay lanzamiento | Propietario |
| PR #29 (cifrado) abierto; ADR-0018 sin cierre de `auditor-seguridad` | Texto de mensajes en claro | `backend`, `datos`, `auditor-seguridad` |
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
| Mercado base Colombia; el número de prueba de Meta basta para construir | [`docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md`](docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md) §2 |
| **Sin decidir:** nombre comercial, precios y planes | Mismo archivo, §2 |

El índice completo de ADR y su estado está en [`docs/README.md`](docs/README.md#03--decisiones-de-arquitectura-adr).

## 5. Dónde mirar

| Qué | Dónde |
|---|---|
| La cola de trabajo | [`roadmap/tasks.yaml`](roadmap/tasks.yaml): 86 `done`. Ojo: `done` = integrada, no probada con la web (T-089 solo cubre la migración; T-117 sigue en `backlog` aunque el PR #198 está integrado) |
| Roadmap técnico v2 | [`docs/08-roadmap/01-roadmap.md`](docs/08-roadmap/01-roadmap.md) |
| Roadmap de producto v3 | [`docs/08-roadmap/02-roadmap-producto-v3.md`](docs/08-roadmap/02-roadmap-producto-v3.md); ruta a la Fase 1: [`04-ruta-al-entregable-fase-1.md`](docs/08-roadmap/04-ruta-al-entregable-fase-1.md) |
| Qué ocurrió cada día | [`docs/_bitacora/`](docs/_bitacora/) (hoy: [2026-11-04, auditoría de veracidad con la matriz por capacidad](docs/_bitacora/2026-11-04-auditoria-de-veracidad.md)) |
| Historial completo anterior de este archivo | [`docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md`](docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md) |
| Auditorías externas e integral (AUD-001…017) | Mismo archivo; informes en `roadmap/audits/` |
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
