# Auditoría automática 2026-10-26

> Generada por la sesión auditora del ciclo autónomo (modelos `nvidia/nvidia/nemotron-3-ultra-550b-a55b, opencode-go/kimi-k3.1-pro`, revisor `nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b, opencode-go/qwen3.8-max`, origin/main @ d4f25e6). tareas totales: 8; libres para el carril frontend: 0.

## Tareas nuevas
| ID | Prioridad/Esfuerzo | Título |
|---|---|---|
| T-009 | P2/M | Completar mutantes RLS al 100% (C1: USING y WITH CHECK en todas las tablas de negocio) |
| T-010 | P2/M | Prueba de arranque con roles prohibidos y asercion relforcerowsecurity (M1.2) |
| T-011 | P2/M | Test de integracion automatico del cotizador (punta a punta web -> API -> BD) |
| T-012 | P2/S | Aserciones de comportamiento para vigencias, tarifas, politicas_de_precio en aislamiento.spec.ts |
| T-013 | P2/S | Corregir politicaDePrecio.findFirst() sin where (riesgo de fuga silenciosa) |
| T-014 | P2/S | Sincronizar unique parcial etapas_pipeline en schema.prisma |
| T-015 | P2/M | Particiones automaticas de enrutamiento_historial (M5.2 / AUD-007) |

## Propuestas descartadas
- «REG-02: 50 peticiones concurrentes cruzadas con connection_limit=2 en »: toca workflows (no publicable por una app)
- «Declarar generate como dependencia de typecheck en turbo.json»: mezcla carriles o no pertenece a ninguno (divídela en una tarea por carril)
- «Subir no-explicit-any a error (compuerta real)»: ruta inexistente: packages/*/eslint.config.js
- «Purgar directorio: decidir implementacion o manual (tarea 4g)»: mezcla carriles o no pertenece a ninguno (divídela en una tarea por carril)
- «Portar fix de quoting: condiciones no evaluables, ruta antigua retirad»: revisor: Duplica la tarea T-007 de roadmap/tasks.yaml (estado backlog, prioridad P0, esfuerzo M, mismos archivos de apps/api y mismo acceptance: portar origin/fix/quoting-condiciones-y-salud, condiciones no evaluables, ruta antigua retirada y salud 503).
- «Adaptar cliente web a la retirada de la ruta antigua de cotizacion»: revisor: Duplica la tarea T-008 de roadmap/tasks.yaml (estado backlog, prioridad P1, esfuerzo S, depende de T-007: adaptar apps/web/src/lib/api.ts a la retirada de la ruta antigua de cotizacion).
- «Comprobar cabecera Origin en toda mutacion de la API (no solo auth y s»: revisor: Duplica la tarea T-001 de roadmap/tasks.yaml (estado backlog, prioridad P1, esfuerzo M: comprobar cabecera Origin en toda mutacion de la API, mismos archivos de shared/red y controladores).
- «Limite de tasa en la API fuera del flujo de autenticacion»: revisor: Duplica la tarea T-002 de roadmap/tasks.yaml (estado backlog, prioridad P1, esfuerzo M: limite de tasa en la API fuera de autenticacion, mismos archivos de shared/red y main.ts).
- «Escribir en registros_auditoria las lecturas de datos sensibles de via»: revisor: Duplica la tarea T-006 de roadmap/tasks.yaml (estado backlog, prioridad P1, esfuerzo M: escribir en registros_auditoria las lecturas de datos sensibles de viajeros, mismos archivos de crm).
- «Test de cabecera CSP en la web (completar T-003)»: revisor: Duplica la tarea T-003 de roadmap/tasks.yaml (estado done; la regla de no duplicar aplica 'en cualquier estado': cabecera CSP y test en apps/web).
- «Implementar cifrado de campos PII segun ADR-0014/0015 (mensajes.texto,»: revisor: Esfuerzo L, no S ni M (prohibido). Ademas toca varios carriles a la vez: schema.prisma, migraciones, shared/cifrado, infraestructura de inbox y crm, y aislamiento.spec.ts.
- «Crear GitHub Actions workflows fijadas por SHA (M1.5)»: revisor: Evidencia falsa: afirma que .github/ no existe, pero el repositorio ya tiene .github/workflows/ con ci.yml, deploy-staging.yml, cerrar-tarea.yml, mantener-ramas.yml y ownership.yml, además de .github/dependabot.yml. No es una tarea nueva.


---

# AUDITORÍA — ViajaPro (worktree auditoria-20261026-mvpol16d)

**Fecha:** 2026-10-26  
**Commit auditado:** `main` en `d4f25e6` (v0.38.2 según ESTADO.md)  
**Objetivo:** M1 del roadmap v2 — endurecer antes de la piloto, CRM mostrable

---

## Resumen ejecutivo

El monorepo compila, lintea y typecheckea limpio. Los tests unitarios pasan (280+ en domain/contracts, 200+ en api). La arquitectura multi-tenant con RLS forzada está implementada y verificada (39/39 aserciones de aislamiento). El cotizador funciona de punta a punta y ha sido verificado en navegador real.

**Lo que NO cumple los criterios de salida de M1 (roadmap v2 §2):**

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| C1: 100 % mutantes RLS muertos | **NO** | Solo 3 mutantes `WITH CHECK` existen (M3, M4, M9); faltan el resto |
| C2: Cero PII en claro | **NO** | `mensajes.texto`, `conversaciones.ultimo_mensaje_texto`, `contactos.preferencias`, `notas_internas.texto`, `adjuntos.nombre_archivo` están en claro (ADR-0014/15 aceptados, no implementados) |
| C3: Meta/Postmark reales en staging | **Bloqueado** | Cuentas del propietario; no hay `render.yaml` integrado |
| C4: Protección de `main` activa | **Bloqueado** | Plan GitHub Free no permite rulesets en repo privado |
| C5: Supresión operativa | **NO** | Depende de ADR-0014/15 y M2.4/M2.6 |

---

## Hallazgos por importancia

### P0 — Bloqueantes para producción (criteria C1–C5)

| # | Hallazgo | Evidencia (archivo:línea o comando) |
|---|----------|--------------------------------------|
| 1 | **Cifrado de PII no implementado** — ADR-0014/0015 aceptados pero sin migración ni código. 5 columnas con PII sensible (`mensajes.texto`, `conversaciones.ultimo_mensaje_texto`, `contactos.preferencias`, `notas_internas.texto`, `adjuntos.nombre_archivo`) se guardan en claro. | `docs/03-adr/0014-cifrado-del-texto-de-mensajes.md:3` (estado: *Superseded por ADR-0015*); `docs/03-adr/0015-cifrado-de-campos-sensibles.md:94-101` (tabla de alcance); `packages/database/prisma/schema.prisma` — columnas `text`/`varchar` sin cifrar |
| 2 | **Mutantes RLS incompletos (C1)** — Solo 3 mutantes `WITH CHECK` (M3, M4, M9) en `packages/database/tests/mutaciones-aislamiento.mjs`. Faltan mutantes para `USING` y para las tablas nuevas (`vigencias`, `tarifas`, `politicas_de_precio`, `mensajes`, `conversaciones`, `contactos`, etc.). | `packages/database/tests/mutaciones-aislamiento.mjs` — buscar `WITH CHECK`; `ESTADO.md:46` (AUD-014: «Mutantes `WITH CHECK` existentes (M3, M4 y M9); criterio de cierre: 100 % de los mutantes muertos») |
| 3 | **Comprobación `Origin` solo en auth y socket (T-001 / M1.6)** — `origenEsDeConfianza` se usa en `auth.controller.ts:153,226` y `bandeja-en-vivo.gateway.ts:104`. **No protege** mutaciones en `quoting`, `crm`, `inbox` (webhook POST, cotizaciones, contactos, pipeline). | `apps/api/src/shared/red/origen.ts`; `grep -r origenEsDeConfianza apps/api/src --include="*.ts"` → solo 2 usos |
| 4 | **Sin rate limiting fuera de auth (T-002 / M2.5)** — No existe `ThrottlerGuard` ni middleware de límite de tasa en endpoints de negocio ni webhook. | `grep -r "rate.limit\|limite.de.tasa\|throttle" apps/api/src --include="*.ts"` → 0 resultados |
| 5 | **GitHub Actions no existen / no fijadas por SHA (M1.5)** — No hay carpeta `.github/workflows/`. El CI que pasa en el repo remoto no está versionado aquí. | `ls -la .github/` → no existe |
| 6 | **Prueba de arranque con roles prohibidos (M1.2)** — Código de guardia existe (`prisma.service.ts`, `prisma-webhook.service.ts`, `prisma-identidad.service.ts`), pero **falta test e2e** que intente arrancar con `rolsuper`/`rolbypassrls` y verifique `relforcerowsecurity`. | `ESTADO.md:66` (AUD-013/015: «En verificación: prueba de arranque con roles prohibidos, aserción `relforcerowsecurity`... en el CI») |
| 7 | **REG-02 concurrencia no verificado en CI (M1.3)** — `reg-02-pool-concurrente.e2e-spec.ts` existe pero se salta (necesita `DATABASE_APP_URL` con pool de 2). No corre en CI. | `apps/api/src/shared/prisma/reg-02-pool-concurrente.e2e-spec.ts:89-90` |

---

### P1 — Funcionalidad comprometida / deuda de alta prioridad

| # | Hallazgo | Evidencia |
|---|----------|-----------|
| 8 | **Ruta antigua de cotización sigue viva (`POST /api/v1/paquetes/cotizar`)** — `CotizarPaqueteUseCase` y su endpoint en `catalogo.controller.ts` usan el modelo viejo (`temporada`/`precio` por acomodación) que **ignora condiciones de edad/silla**. La rama `origin/fix/quoting-condiciones-y-salud` la elimina y usa `CotizarSalidaUseCase` (vigencias + `seleccion-de-tarifas.ts`), pero no está en `main`. | `apps/api/src/modules/quoting/application/cotizar-paquete.use-case.ts:81-93` (no usa `seleccion-de-tarifas.ts`); `apps/api/src/modules/quoting/interface/catalogo.controller.ts:47-54`; `git diff main...origin/fix/quoting-condiciones-y-salud -- apps/api/src/modules/quoting/` |
| 9 | **Condiciones de tarifa no evaluables (edad, silla) se cotizan en silencio** — Sin el fix de la rama anterior, una tarifa con `edadMinima`/`edadMaxima`/`ocupaSilla` se aplica sin validar que la entrada tenga esos datos. La rama añade `condicionNoEvaluable` y error tipado `TarifasConCondicionNoEvaluableError`. | `apps/api/src/modules/quoting/domain/seleccion-de-tarifas.ts` (actual: NO tiene `condicionNoEvaluable`); `git show origin/fix/quoting-condiciones-y-salud:apps/api/src/modules/quoting/domain/seleccion-de-tarifas.ts` (sí la tiene) |
| 10 | **Health check `/salud/listo` no devuelve 503 en degradado** — Versión actual devuelve 200 con `estado: 'degradado'` en el cuerpo. Render (ADR-0013) mira el código HTTP. La rama fix lo corrige. | `apps/api/src/salud.controller.ts:26-39` (actual); `git show origin/fix/quoting-condiciones-y-salud:apps/api/src/salud.controller.ts` (con `@Res` y `HttpStatus.SERVICE_UNAVAILABLE`) |
| 11 | **Cliente web llama a ruta antigua** — `apps/web/src/lib/api.ts:76-84` usa `POST /api/v1/paquetes/cotizar`. Debe cambiar a la ruta de salidas o eliminarse si la web usa otro flujo. | `apps/web/src/lib/api.ts:76-84`; `git diff main...origin/fix/quoting-condiciones-y-salud -- apps/web/src/lib/api.ts` |
| 12 | **`registros_auditoria` existe pero NADA escribe en ella (R10, T-006)** — No hay acceso auditado a PII de viajeros ni cambios de permisos. | `ESTADO.md:84` («`registros_auditoria` existe, pero nada escribe en ella (R10)»); `grep -r registros_auditoria apps/api/src --include="*.ts"` → 0 resultados |
| 13 | **CSP implementado pero SIN test (T-003 acceptance)** — `next.config.mjs` emite cabeceras, pero no hay test en `apps/web` que las verifique. | `apps/web/next.config.mjs:26-36`; `grep -r "Content-Security-Policy" apps/web/src --include="*.test.ts"` → 0 resultados |
| 14 | **Sin prueba de integración automática del cotizador (ESTADO.md:127)** — «La verificación del cotizador fue manual: no hay prueba automática que la repita». | `ESTADO.md:127`; `apps/api/src/modules/quoting/` — solo unitarios y e2e saltados |

---

### P2 — Riesgos operativos / calidad

| # | Hallazgo | Evidencia |
|---|----------|-----------|
| 15 | **Tests e2e saltados por falta de BD** — 14 suites e2e en `apps/api` se saltan (`❯ 0 test`). El CI verde actual no prueba flujos reales contra Postgres. | `pnpm --filter @viajapro/api test 2>&1 | grep "❯"` → 14 suites con 0 tests |
| 16 | **Deriva `schema.prisma` vs BD (ESTADO.md:297)** — Unique parcial `(tenant_id, clave) WHERE clave IS NOT NULL` en `etapas_pipeline` existe en BD, Prisma no la modela. | `ESTADO.md:297`; `packages/database/prisma/schema.prisma` — buscar `etapas_pipeline` |
| 17 | **`politicaDePrecio.findFirst()` sin `where` (ESTADO.md:530)** — Acierta hoy por RLS; con otro rol o fuera de contexto devuelve política de otra agencia sin error. | `apps/api/src/modules/quoting/application/cotizar-salida.use-case.ts:113-117` |
| 18 | **`vigencias`, `tarifas`, `politicas_de_precio` sin aserciones de comportamiento en aislamiento (ESTADO.md:531)** — Cobertura estructural sí, pero quitar foránea compuesta no pone pruebas en rojo. | `ESTADO.md:531`; `packages/database/tests/aislamiento.spec.ts` — buscar `vigencia`/`tarifa`/`politicaDePrecio` |
| 19 | **`cotizaciones` no expone listado/envío/estados (ESTADO.md:126)** — Solo `POST /cotizaciones`, `POST /:id/versiones`, `GET /:id`. | `ESTADO.md:126`; `apps/api/src/modules/quoting/interface/cotizaciones.controller.ts` |
| 20 | **Migración ADR-0009 aplicada a Neon ANTES de compuerta (ESTADO.md:468)** — `salidas` → `vigencias` rompió a los otros worktrees. Patrón inseguro para despliegue futuro. | `ESTADO.md:468-470` |
| 21 | **`turbo` no declara `generate` como dependencia de `typecheck` (ESTADO.md:221, 472)** — `pnpm typecheck` falla en árbol limpio sin `pnpm --filter @viajapro/database generate` previo. | `turbo.json` — `pipeline.typecheck.dependsOn` no incluye `generate` |
| 22 | **`no-explicit-any` en `warn`, no compuerta (ESTADO.md:137)** — Cero `any` hoy, pero el primero entraría sin que `lint` falle. | `packages/*/eslint.config.js` — `no-explicit-any: 'warn'` |

---

### P3 — Mejoras / observaciones

| # | Hallazgo | Evidencia |
|---|----------|-----------|
| 23 | **Web sin autenticación real** — Tenant viaja por cabecera `x-dev-tenant-id` solo con `APP_ENV=local`. Rebanada 3 de ADR-0011 (pantalla ingreso + selector agencia) en Antigravity, no integrada. | `apps/web/src/lib/api.ts:25`; `ESTADO.md:135` (tarea 12: «Queda la 3: la pantalla de ingreso y el selector de agencia (Antigravity)») |
| 24 | **Inbox webhook: verificación contra Redis real faltante (ESTADO.md:118)** — Trabajador `ProcesarChange` probado 5/5 contra Neon, **sin verificar contra Redis real**. | `ESTADO.md:118` (tarea 4c) |
| 25 | **Purgar directorio no resuelto (ESTADO.md:122)** — Ninguna fila de `enrutamiento_canales` se puede borrar por código. Bloquea primer tenant en producción. | `ESTADO.md:122` (tarea 4g) |
| 26 | **Particiones automáticas de `enrutamiento_historial` (M5.2 / AUD-007)** — Tabla particionada pero sin creación automática de particiones futuras. | `docs/08-roadmap/01-roadmap.md:132`; `packages/database/prisma/migrations/` — buscar `enrutamiento_historial` |
| 27 | **Secrets expuestos en chat no rotados (ESTADO.md:131)** — Contraseña Neon y clave API Stitch pegadas en chat; rotación pendiente. | `ESTADO.md:131` |
| 28 | **Verificación Meta Business no iniciada (ESTADO.md:148)** — Bloquea lanzar con clientes reales (semanas). | `ESTADO.md:148`; `docs/10-onboarding/01-requisitos-para-la-agencia.md` |
| 29 | **Tarifario real y tarifa Meta en COP sin llegar (ESTADO.md:149-150)** — Modelo de precios validado contra datos inventados. | `ESTADO.md:149-150` |

---

## Qué NO se encontró (y se esperaba para M1)

| Qué | Esperado | Realidad |
|-----|----------|----------|
| Migración de cifrado (ADR-0014/15) | En `packages/database/prisma/migrations/` | No existe |
| Adaptador de cifrado compartido | `apps/api/src/shared/cifrado/` | No existe |
| Tests de mutantes RLS completos | 100 % cobertura `USING` + `WITH CHECK` | Solo 3 mutantes `WITH CHECK` |
| CI/CD workflows versionados | `.github/workflows/*.yml` fijados por SHA | Carpeta inexistente |
| Prueba e2e cotizador automática | En `apps/api/src/modules/quoting/*.e2e-spec.ts` | Solo manual |
| Rate limiting en API | `apps/api/src/shared/red/` o middleware global | No existe |
| Escritura en `registros_auditoria` | En casos de uso CRM/Inbox | No existe |
| Test CSP en web | `apps/web/src/**/*.test.ts` | No existe |
| Test `Origin` en mutaciones | `apps/api/src/shared/red/origen.spec.ts` (integración) | Solo unitario de la función pura |

---

## Conclusión

El código **compila y pasa compuertas**, y la arquitectura base es sólida. Pero **M1 no está cerca de "verde"**: 4 de 5 criterios de corte (C1–C5) están en rojo o bloqueados, y las tareas P0/P1 del roadmap (T-001, T-002, T-006, T-007, T-008, M1.2–M1.6) no están hechas.

**Prioridad inmediata:** portar el fix de `origin/fix/quoting-condiciones-y-salud` (T-007/T-008), implementar `Origin` en todas las mutaciones (T-001), rate limiting (T-002), auditoría PII (T-006), y definir el plan para ADR-0014/15 (migración + adaptador). Sin estos, no hay "CRM mostrable" seguro para piloto.
