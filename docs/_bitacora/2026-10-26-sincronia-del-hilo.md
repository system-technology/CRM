# 2026-10-26 — Sincronía del hilo y estado real del proyecto

**Participantes:** `documentador` (Claude) por encargo del propietario; el resto de lo ocurrido hoy lo hicieron el propietario, otros agentes de Claude y Antigravity.
**Duración / alcance:** el día completo, a partir de `origin/main` en `e802990`. Esta sesión solo toca documentación.

## Qué se hizo

Lo ocurrido hoy, verificado donde se indica.

- **Repositorio público y protección de `main`.** `system-technology/CRM` es público (antes privado en `Alfavear`). `main` exige PR, 8 checks, rama al día y se aplica a administradores. Verificado con `gh repo view` y `gh api repos/system-technology/CRM/branches/main/protection`. Ver también [`2026-10-26-ciclo-fase-1.md`](2026-10-26-ciclo-fase-1.md).
- **CI funcionando.** La última corrida de `main` tiene 10 jobs, todos en éxito: `secretos`, `aislamiento-tenants`, `fronteras-entre-modulos`, `imagenes-de-despliegue`, `typecheck`, `test`, `politica-de-rama`, `lint`, `build`, `convencion-de-commits`. Verificado con `gh run view`.
- **Ciclo autónomo de OpenCode (ADR-0016).** Se montó y entregó tres PRs de backend (#21, #23, #25). El propietario lo **detuvo**: la cuota de OpenCode Go se agotó y los ciclos eran lentos (el PR #19 ya había puesto NVIDIA primero por eso). El trabajo pasa a los agentes de este repo (Claude) y a Antigravity. La cola de frontend (T-016 a T-031) está en `roadmap/tasks.yaml`; el prompt, en `docs/09-ia/08-prompt-antigravity.md`; la skill, en `.agent/skills/ux-crm-turismo`.
- **ADR-0017** (catálogo gestionable, cuatro canales de alta) **aceptado**. Migraciones M1 y M2 integradas (PR #42), **no aplicadas a Neon**.
- **ADR-0018** (envío saliente de WhatsApp) en `main` como **propuesto**; implementación integrada (PR #44). Script de canal de prueba en el PR #46 y ajuste del nombre de variable en el PR #48, ambos abiertos.
- **Recepción de WhatsApp de punta a punta**, con la app de prueba de Meta y un túnel temporal: firma válida y mensaje guardado cifrado. La API real arrancó contra Neon con los roles verificados. *Estos dos hechos los aporta el encargo del propietario; esta sesión no los pudo reproducir ni dejaron registro en el repo.*
- **Roadmap de producto v3** con HubSpot como norte (PR #43) e investigación verificada (PR #41): abiertos, no están en `main`.
- **Sincronía del hilo (esta sesión).** `ESTADO.md` de 1491 líneas archivado íntegro en `docs/_bitacora/archivo/ESTADO-hasta-2026-10-20.md` y reescrito corto. `CLAUDE.md` y `AGENTS.md` corregidos donde mentían. Sección de sincronía en `docs/07-ingenieria/03-git.md`. Índice de `docs/README.md` al día.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| Detener el ciclo autónomo de OpenCode | Cuota agotada y ciclos lentos | Esta bitácora y `ESTADO.md` §2. El ADR-0016 sigue vigente en lo demás (protección de rama, carriles) |
| Antigravity toma la cola de frontend T-016 a T-031 | Es el único frontend activo | `roadmap/tasks.yaml`, `docs/09-ia/08-prompt-antigravity.md` |
| Catálogo gestionable con cuatro canales de alta | Ver ADR | ADR-0017 |
| R11 reformulada: en `main` entra lo que pasa PR + 8 checks | La protección de servidor sustituye a la disciplina de un solo escritor | `CLAUDE.md`, `AGENTS.md`, ADR-0016 §6 (propuesta; la aprueba el propietario en el PR) |

## Qué quedó pendiente

- [ ] Redis y trabajador local, para que los mensajes recibidos se conviertan en conversaciones.
- [ ] Probar el envío saliente contra Meta real.
- [ ] Aplicar M1 y M2 a Neon (propietario).
- [ ] Despliegue en Render y secretos del entorno `staging`.
- [ ] Verificación del negocio en Meta / Tech Provider.
- [ ] Integrar los PRs abiertos: #46, #47 (T-016), #48, #43, #41, #37, #29 (implementación del ADR-0015).
- [ ] Cerrar el ADR-0018 con `arquitecto`, `auditor-seguridad` y `datos`.
- [ ] Ratificar el ADR-0016 (figura «Propuesto») y reflejar en él que el ciclo está detenido.
- [ ] No verificado: que los commits del ciclo detenido y las GitHub Apps sigan válidos si se reanuda.

## Qué aprendimos

- **El `ESTADO.md` mentía por acumulación, no por error.** Seguía anotando integraciones, auditorías y colas hasta llegar a 123 KB; nadie podía distinguir lo vigente. La regla nueva: aquí solo el presente; la cola en `roadmap/tasks.yaml`; el historial, en la bitácora.
- **«Integrado» no es «probado» ni «desplegado».** El envío saliente está en `main` y no se ha enviado un solo mensaje a Meta real. El workflow `Deploy staging` sale en verde sin desplegar nada cuando faltan secretos: un verde ahí no demuestra un servicio vivo.
- **Las ramas largas envejecen.** Varios PRs abiertos están `BEHIND`. Ver la sección de sincronía en `docs/07-ingenieria/03-git.md`.
- **Hallazgo de documentación:** el índice de ADR en `docs/README.md` no incluía el 0016, 0017 ni 0018 y marcaba 0010 a 0013 como «Propuesto» cuando sus archivos dicen «Aceptado». Corregido.
