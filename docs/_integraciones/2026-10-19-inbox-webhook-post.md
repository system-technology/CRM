# Integración 2026-10-19 (tercera) — `feat/inbox-webhook-post`, sin etiqueta

| Rama | Veredicto | Commit |
|---|---|---|
| `feat/inbox-webhook-post` @ `78e74cc` (1 commit, 2 archivos, +210) | **INTEGRADA** (`539c581`, `--no-ff`) | sin etiqueta |

**Por qué no lleva versión:** solo añade `apps/api/src/modules/inbox/inbox-webhook.e2e-spec.ts` y
una bitácora. No cambia el artefacto desplegable (`docs/07-ingenieria/03-git.md` §5).

## Compuertas — salida real

Se corrieron en un árbol limpio separado (`git worktree add --detach … 78e74cc`), porque
`D:\Projects\CRM-api` tenía trabajo de `feat/inbox-relay` sin commitear (incluido `pnpm-lock.yaml`).
La primera corrida, hecha sobre ese árbol sucio, **no cuenta**. Siempre con
`env -u DATABASE_URL -u DIRECT_URL`; la base es `neondb`.

| Compuerta | Resultado |
|---|---|
| `install --frozen-lockfile` · `generate` | limpios |
| `typecheck --force` | 9/9, 0 en caché |
| `lint --force` | 7/7 |
| `format:check` | limpio |
| `build --force` | 5/5 |
| `pnpm run test --force` | contracts 56 · domain 70 · api **224** (incluye `inbox-webhook.e2e-spec.ts` 6/6) · aislamiento **50/50** |
| `test:aislamiento` de nuevo | **50/50** |

Secretos: la prueba genera los suyos con `randomBytes` en memoria. Su `afterAll` borra las
recepciones que crea; después de la corrida, `recepciones_webhook` tenía 0 filas.

Había 4 tenants de fixture de otra sesión, con menos de 15 minutos. La limpieza no los tocó.
