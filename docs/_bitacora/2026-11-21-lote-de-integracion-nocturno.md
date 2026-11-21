# 2026-11-21 — Lote de integración nocturno

**Participantes:** sesión madre (orquestación, auditorías de integración), agentes `backend`, `qa`, `diseno-ux` y `arquitecto` en sus PR, `documentador` (este cierre).
**Duración / alcance:** la madrugada del 2026-11-21. Ocho PR integrados en `main`, de `7475d7b` (#388) a `c74b44d` (#395), y la cola que dejaron las auditorías. Cierra el lote por la regla R14.

## Qué se hizo

Integrado en `main`, en este orden:

| PR | Qué entró |
|---|---|
| #388 | Regla R14, tablero del orquestador, prompt de arranque y los skills `ahorro-de-tokens`, `modelo-y-esfuerzo` y `relevo-de-sesion` |
| #358 | Ingreso por apodo, tope por identificador y apodo de miembros (ADR-0031) |
| #397 | ADR-0035, niveles de acceso a reportes (T-340) |
| #393 | T-330: dominio y API de cobros del viajero (ADR-0034) |
| #398 | T-440: marco responsivo |
| #401 | Consolidación de la documentación; sustituyó a #384, #386, #389, #390, #392, #399 y #396 |
| #400 | Tablero al día y arreglo del hook |
| #395 | El resumen y los seguimientos ajenos solo con `conversaciones.ver_todas` (cierre provisional hasta T-342) |

Este PR registra la cola de las auditorías en `roadmap/tasks.yaml`, corrige un comentario de `reportes.controller.ts` y deja el estado al día.

**Abierto:** #402, sustituto de #362 (la web del ingreso por apodo). Espera el check «Carril y tarea» y la etiqueta `override-lane`, que solo pone el propietario. #362 se cierra al integrar #402.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| Ningún hallazgo de las auditorías de #393, #358 y #395 bloqueó la integración | Eran «el día que…» o cosméticos (R13); ninguno es una fuga entre agencias | `roadmap/tasks.yaml`: T-494..T-502, T-361, T-490 |
| Las pruebas inestables se tratan como P1 | Tapan la cola: cada PR puede salir rojo por azar | T-503 (base y e2e), T-504 (web, P2) |
| Ids T-494..T-504 | `main` llegaba a T-493; rangos ocupados: T-425..T-435, T-440..T-485, T-490..T-493 | `roadmap/tasks.yaml` |

Cola registrada:
- **Cobros (#393):** T-494 (`lock_timeout` de 5 s igual al timeout de Prisma: sale 500 y no 409), T-495 (invariantes de dinero solo en el dominio), T-496 (idempotencia por `(tenant, clave)`), T-497 (saldo releído tras confirmar), T-498 (Luhn y reverso idempotente).
- **Apodo (#358):** criterios nuevos en T-361; T-499 (aserción de ráfaga tautológica), T-500 (`tenant.count()` por intento), T-501 (reserva no liberada con 5xx), T-502 (sesión sin membresía).
- **Reportes (#395):** criterio nuevo en T-490 (`POST /crm/seguimientos/:id/completar`).
- **Estabilidad:** T-503 y T-504.

## Qué quedó pendiente

- [ ] Integrar #402 y cerrar #362 (propietario: `override-lane`).
- [ ] T-503 primero: es lo que más cuesta a la cola.
- [ ] Probar #402 a 390 px contra la API real.
- [ ] Redesplegar con `main` actual, solo con confirmación del propietario.

**No está verificado:** #402 a 390 px contra la API real; nada de esto está desplegado; la clave de la demo se da por perdida porque su sesión se archivó (se regenera resembrando).

## Qué aprendimos

- Las pruebas de `packages/database` e `invitaciones.e2e-spec.ts` fallan al azar con FK ausente y deadlock 40P01 y pasan al relanzar. Relanzar tapa el síntoma: el arreglo es aislar la base (T-503).
- El e2e de `bandeja/[id]/page.tsx` puede tumbar el job `test` con todas las pruebas en verde (`setState` tras el teardown de jsdom).
- Trampas nuevas, recogidas en [el tablero, §7](../_contexto/TABLERO-DEL-ORQUESTADOR.md): commitlint rechaza `merge:` (usar `chore:`); `gh pr checks` usa GraphQL y está bloqueado (usar `gh api …/commits/<sha>/check-runs`); una sesión hija sin `source_url` nace sin el repositorio; el clasificador deniega `git push --force-with-lease` (recrear la rama y abrir otro PR).
- El comentario de `reportes.controller.ts` decía que T-341 retira el gate. Lo retira T-342; T-341 solo crea el permiso (ADR-0035 §7).
