# 2026-11-21 — El arnés de mutaciones de aislamiento entra al CI (T-377)

**Hallazgo.** `packages/database/scripts/mutaciones-aislamiento.mjs` (rompe RLS a propósito y exige que
la aserción correspondiente falle) no corría en ningún workflow: verificado con `grep` sobre
`.github/workflows/`. Una compuerta de aislamiento que no se ejecuta no es una compuerta (CLAUDE.md §3.1).

**Hecho.**
- **M24**: restaura el cuerpo de `proteger_verificacion_del_perfil` de T-268 (sin fijar `creado_en` ni
  `actualizado_en`) y espera que **P-7** (T-307) se ponga en rojo. Restaura la definición leída del catálogo.
- Workflow propio `.github/workflows/mutaciones-aislamiento.yml`: Postgres 16 como en `aislamiento-tenants`,
  se ejecuta en PRs que tocan `packages/database/prisma/**`, la prueba de aislamiento o el arnés; **cada noche**
  (06:17 UTC) sobre `main`; y a demanda.

**Por qué no en cada PR ni como check obligatorio.** El arnés arranca vitest sobre `aislamiento.spec.ts` una
vez por prueba del control y una vez por mutación (25+ arranques): minutos, no segundos (la duración se
registra en el resumen del job; aún no hay medida). Un check obligatorio con filtro de rutas dejaría sin
resultado a los PR que no lo disparan. Si falla en un PR, el integrador lo trata como bloqueante.

**Sin verificar localmente** (no hay Postgres aquí): que M24 ponga P-7 en rojo, y que M22/M23 (nunca
ejecutadas) lo hagan. Lo demuestra la primera corrida del workflow en este PR.

**Pendiente.** Mutaciones de T-329 (pagos), a cargo de la misma tarea.
