# 2026-10-20 — Cierres de la auditoría externa con pruebas (qa)

**Qué pasó:** se cerraron con pruebas cuatro hallazgos de la auditoría externa que ya estaban
implementados pero no demostrados. Rama `test/auditoria-externa-cierres`. Validado en el CI con
Postgres y Redis reales y limpios; nada contra Neon, ninguna migración.

## Hallazgo → prueba → run id

| Hallazgo | Prueba | Run |
|---|---|---|
| AUD-013 (P0) los tres servicios abortan | `apps/api/src/shared/prisma/arranque-seguro.e2e-spec.ts`: 22 casos (3 servicios × contraprueba, rol ajeno, `rolsuper`, `rolbypassrls`, rol de prueba superusuario, rol de prueba con BYPASSRLS, propietario). Paso propio del CI, porque muta roles | verde 39529651028 |
| AUD-013 RLS forzada | `aislamiento.spec.ts`, «AUD-013 — ninguna tabla con relrowsecurity deja de tener relforcerowsecurity» (`pg_class`, todos los esquemas) y su contraprueba en transacción revertida | verde 39529651028 |
| AUD-015 (P0) REG-02 | `apps/api/src/shared/prisma/reg-02-pool-concurrente.e2e-spec.ts`: `AppModule` real, `connection_limit=2`, 50 peticiones de dos agencias, `pg_backend_pid()` ≤ 2, `current_setting('app.current_tenant', true)` vacío en sondas sin tenant y sueltas | verde 39529651028; mutación (`set_config(..., false)`) en rojo 39530861775 |
| AUD-008 dinámico | `aislamiento.spec.ts`, «AUD-008 — viajapro_identidad solo tiene privilegios de fila sobre sus cinco tablas, y exactamente los declarados» (`has_table_privilege` SELECT/INSERT/UPDATE/DELETE sobre toda relación de `public`) y contraprueba | **rojo 39530859114** (commit `c2383db`: tabla nueva con GRANT) y **verde 39529651028** (commit `8659343`) |
| AUD-017 cola | `cola-de-changes.bullmq.ts`: `removeOnFail.count = 5000`; `cola-de-changes.spec.ts` | verde 39529651028 |
| AUD-017 413 | `inbox-webhook.e2e-spec.ts`: más de 1 MB con firma válida, sin firma, y justo 1 MB | rojo 39529066719 (500, ver abajo), verde 39529651028 |
| AUD-017 concurrencia | Ya era explícita y acotada: `concurrency: 5` en `consumidor-de-changes.ts:79` y `consumidor-de-correo.ts:50`. No se cambió | — |

## Defecto real que salió

La prueba del 413 falló en el CI con **500**: el filtro global convertía el error de `body-parser`
(`http-errors`, no `HttpException`) en «error interno». Meta reintenta los 5xx. Se corrigió con
un cambio mínimo en `dominio-excepcion.filter.ts` (4xx exponible de `http-errors` conserva su
estado) y se movió el tope a `shared/red/cuerpo-crudo-de-webhooks.ts` para que `main.ts` y las
pruebas monten **la misma** línea; antes cada prueba copiaba el literal. **`backend` debe revisar
ese cambio.**

## Cómo se demostró el rojo

Ramas desechables, no integrables: `test/aud-008-rojo` (un paso del CI crea
`zz_tabla_nueva_de_negocio` y la concede a `viajapro_identidad`) y `test/reg-02-mutacion`
(`set_config(..., false)`, sin `is_local`). Las dos pusieron en rojo la prueba que debían.

## Pendiente (cola, no bloquea)

- La guardia de arranque de `PrismaIdentidadService` sigue usando la lista fija de cinco tablas de
  negocio; la prueba es dinámica, el aborto de arranque no. Dueño: `backend`.
- `arranque-seguro` solo corre contra loopback con `VIAJAPRO_BASE_DESECHABLE=1`; en `pnpm test`
  queda omitida (a propósito, muta roles). El paso del CI exige que corra
  (`VIAJAPRO_EXIGIR_ARRANQUE_SEGURO=1`). Dueño: `devops`.
- `concurrency` está escrita en el código (5), no en una variable. Si se quiere ajustar sin
  desplegar, `backend`.
