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
| Última actualización | 2026-10-28 |
| Actualizado por | Antigravity (`frontend`) |
| Fase | **Fase 1 del backlog: «Un CRM mostrable y endurecido»** (M1 del [roadmap v2](docs/08-roadmap/01-roadmap.md)). Sin agencia real todavía |
| Avance | Catálogo gestionable (T-031), importador masivo en 4 pasos (T-029, T-030), ajuste promo_vencida (T-028), tarjeta/ficha de excursión (T-018, T-051, T-019), inicio del asesor (T-020), cookies y banner (T-094, T-095), login oceánico (T-033), navegación enriquecida (T-034), animaciones fluidas con shimmer oceánico y movimiento reducido (T-035), tarjetas de producto por tipo de excursión (T-036), envío de cotización por WhatsApp (T-074) con CRM contacto y oportunidad (T-076), helpers únicos de formato es-CO (T-022), revisión a 375 px (T-023), accesibilidad de la bandeja y modales (T-024), etapas del pipeline configurables (T-025) y campos personalizados por agencia en contactos y oportunidades (T-026) completados |
| Próximo hito | Equipo e invitaciones: invitar asesores, asignar rol y ver quién tiene acceso (T-027) |

---

## 1. Dónde estamos

Verificado el 2026-10-26 contra GitHub y contra `origin/main` (`e802990`). Tres categorías, sin mezclar.

### Es real (en `main`, con CI)

| Qué | Evidencia |
|---|---|
| Repositorio **público** `system-technology/CRM` (antes privado en `Alfavear`) | `gh repo view`: `PUBLIC` |
| **`main` tiene protección de servidor:** PR obligatorio, 8 checks (`secretos`, `typecheck`, `lint`, `build`, `test`, `aislamiento-tenants`, `fronteras-entre-modulos`, `convencion-de-commits`), rama al día (`strict`), administradores incluidos, sin force-push, conversaciones resueltas, revisión de CODEOWNERS | `gh api .../branches/main/protection`; copia en `.github/proteccion-main.json` |
| **El CI funciona:** 10 jobs en la última corrida de `main` (los 8 obligatorios más `imagenes-de-despliegue` y `politica-de-rama`) | `gh run view` |
| Esquema del inbox, identidad global y roles por agencia, cotizaciones, auditoría de lecturas de datos sensibles (R10, T-006), cabecera `Origin` en toda mutación (T-001), CSP en la web (T-003) | PRs #1, #23, #25, #16 y anteriores |
| Cotizador, catálogo sembrado, bandeja web con pantalla de ingreso y asignación | PR #39 y anteriores |
| **Recepción de WhatsApp probada de punta a punta el 2026-10-26** con la app de prueba de Meta, mediante un túnel temporal: firma válida, mensaje guardado cifrado | Dato aportado por el encargo del propietario; no queda registro en el repositorio (el túnel era temporal). Ver la [bitácora de hoy](docs/_bitacora/2026-10-26-sincronia-del-hilo.md) |
| La API real arranca contra Neon con los roles de aplicación verificados (R2) | Dato aportado por el encargo; sin registro en el repo |
| Migraciones **M1 y M2** del catálogo gestionable, en el repositorio | PR #42 (integrado). **No aplicadas a Neon** |
| Envío saliente de WhatsApp implementado (cola, idempotencia, acuses de estado) | PR #44 (integrado). **Sin probar contra Meta real** |
| Workflow `Deploy staging` en `main` | Corre en verde, pero termina «en verde con un aviso» si faltan los secretos del entorno `staging` (diseño del workflow). **No verificado** que haya algo desplegado en Render |

### Es maqueta

La web enseña **datos de demostración** (Cancún, Europa…) en pipeline, contactos y reportes. Solo el
cotizador, el catálogo y la bandeja usan la API. El PR #47 (T-016) cambia el valor por defecto a
modo real, con la demostración explícita y visible; sigue **abierto**.

### Es diseño (documentado, no construido)

| Qué | Dónde |
|---|---|
| Catálogo gestionable por la agencia, cuatro canales de alta (**Aceptado**, 2026-10-26) | [ADR-0017](docs/03-adr/0017-catalogo-gestionable-por-la-agencia.md) |
| Envío saliente de WhatsApp (**Propuesto**) | [ADR-0018](docs/03-adr/0018-envio-saliente-de-whatsapp.md) |
| Cifrado de campos sensibles: ADR aceptado, **implementación sin integrar** (PR #29 abierto; no hay migración de cifrado en `main`) | [ADR-0015](docs/03-adr/0015-cifrado-de-campos-sensibles.md) |
| Roadmap de producto v3, HubSpot como norte (**propuesta**, PR #43 abierto) | rama `docs/roadmap-producto-v3` |
| Investigación verificada de HubSpot (PR #41 abierto) | rama `docs/investigacion-hubspot` |
| Políticas de seguridad (8 políticas + `SECURITY.md`), **borrador sin aprobar**, con el estado real de cada una | [`docs/05-seguridad/00-indice-de-politicas.md`](docs/05-seguridad/00-indice-de-politicas.md) |

### Lo que NO existe todavía

- **Redis y trabajador en local:** los mensajes recibidos no se convierten en conversaciones.
- **Despliegue en Render:** el blueprint existe; no hay servicio vivo verificado.
- **Verificación del negocio en Meta** y solicitud de Tech Provider: sin iniciar.
- **Web conectada de punta a punta a la API real:** T-016 está en el PR #47.
- **Catálogo gestionable** (M1/M2 sin aplicar; sin API ni pantallas), **pagos**, **automatizaciones**.
- Una agencia real con datos reales. El criterio C1–C5 del roadmap v2 sigue mandando sobre cuándo entra una.

## 2. Cómo se trabaja desde el 2026-10-26

- **El ciclo autónomo de OpenCode (ADR-0016) se montó, entregó 3 PRs de backend (#21, #23, #25) y se detuvo por decisión del propietario:** la cuota de OpenCode Go se agotó y los ciclos eran lentos. La infraestructura (`scripts/ciclo*.mjs`, GitHub Apps, `roadmap/tasks.yaml`, cierre automático de tareas) sigue en el repo; **nadie la ejecuta hoy**. Para reanudarla: [`docs/09-ia/07-ciclo-autonomo.md`](docs/09-ia/07-ciclo-autonomo.md).
- **Quién escribe código ahora:** los agentes de este repositorio (Claude) en backend, datos, infraestructura y documentación; **Antigravity** en frontend.
- **Cómo entra algo en `main`:** solo por PR con los 8 checks en verde y la rama al día, por auto-merge o por el `integrador`. Las rutas protegidas (migraciones, RLS, cifrado, `render.yaml`, `infra/`, `.github/`, `scripts/`, dependencias, `CLAUDE.md`, `AGENTS.md`, ADR) esperan la aprobación del propietario vía CODEOWNERS. Ver [`docs/07-ingenieria/03-git.md`](docs/07-ingenieria/03-git.md).

### Quién trabaja en qué

| Carril | Quién | En qué |
|---|---|---|
| Frontend (`apps/web`, `packages/ui`, `packages/sdk`) | Antigravity | Cola **T-016 a T-031** de `roadmap/tasks.yaml`. Prompt: [`docs/09-ia/08-prompt-antigravity.md`](docs/09-ia/08-prompt-antigravity.md). Skill: `.agent/skills/ux-crm-turismo`. Ramas `b/T-0NN-…` |
| Backend (`apps/api`) | Agentes de Claude (`backend`, `whatsapp`) | Envío saliente (PR #44 integrado; PRs #46 y #48 abiertos: canal de prueba y nombre de variable) |
| Datos | Agentes de Claude (`datos`) | M1/M2 integradas; aplicarlas a Neon espera al propietario |
| Integración y documentación | `integrador`, `documentador` | Hilo, ADR, bitácora |
| Producto y estrategia | `jefe-de-producto`, `dueno-de-producto` | Roadmap v3 (PR #43) |
| Ciclo OpenCode | **Detenido** | Ver arriba |

## 3. Bloqueos reales

| Bloqueo | Qué impide | Dueño |
|---|---|---|
| Sin Redis ni trabajador local | Mensajes recibidos no pasan a conversación; el envío saliente no se puede ejercitar completo | `backend`, `devops` |
| Sin servicio desplegado en Render ni secretos del entorno `staging` | Nada que enseñar a una agencia; el workflow `Deploy staging` no hace nada útil | Propietario (cuentas y secretos), `devops` |
| Verificación del negocio en Meta / Tech Provider sin iniciar | Solo se puede operar con el número de prueba; no hay lanzamiento | Propietario |
| M1 y M2 sin aplicar a Neon | El catálogo gestionable no puede empezar | Propietario (migraciones son ruta protegida) |
| PR #29 (implementación del ADR-0015) abierto | El texto de los mensajes y otros campos con PII no están cifrados con el esquema del ADR | `backend`, `datos` |
| Tarifario real del mayorista de la agencia piloto | El catálogo sigue con datos verosímiles | Propietario / agencia |
| ADR-0018 en estado «Propuesto»; pendientes `arquitecto`, `auditor-seguridad`, `datos` | Su implementación (PR #44) ya está integrada sin ese cierre | `arquitecto`, `auditor-seguridad` |
| Ramas atrasadas: varios PR abiertos aparecen `BEHIND` (p. ej. #46) | No integran hasta ponerse al día con `main` | Dueño de cada rama |
| Cuota del ciclo OpenCode agotada | Ciclo detenido | Propietario (decisión tomada: no se reanuda por ahora) |

El bloqueo de la protección de `main` y el del CI por facturación, que figuraban en la versión
anterior de este archivo, **están resueltos**.

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
| La cola de trabajo | [`roadmap/tasks.yaml`](roadmap/tasks.yaml): T-001, T-003, T-006 y T-007 hechas; T-004 y T-005 descartadas; el resto, en backlog; T-028 a T-031 bloqueadas |
| Roadmap técnico v2 | [`docs/08-roadmap/01-roadmap.md`](docs/08-roadmap/01-roadmap.md) |
| Roadmap de producto v3 | `docs/08-roadmap/02-roadmap-producto-v3.md` (en el PR #43; aún no está en `main`) |
| Qué ocurrió cada día | [`docs/_bitacora/`](docs/_bitacora/) (hoy: [2026-10-26](docs/_bitacora/2026-10-26-sincronia-del-hilo.md)) |
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
