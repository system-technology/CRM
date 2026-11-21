# 2026-11-21 — T-510: resto de T-503

## Hecho

1. **e2e de `apps/api` en serie** (`apps/api/vitest.config.ts`: `fileParallelism: false`). Es lo más simple que
   funciona: una base o un esquema por archivo exige que Prisma, el rol de cada proceso y `RLS` apunten a otra
   base y cuesta más de lo que ahorra (ya descartado en T-503). Con la suite de `database` ya en serie y
   `api` esperando a `database` (T-503), ningún archivo de prueba comparte la base con otro en el mismo
   instante. Coste: el job `test` dura lo que sumen los archivos e2e; sin medir.
2. **La prueba «la línea de vida usa el índice»** (`packages/database/tests/historial-de-etapas.spec.ts`) ya no
   mira el plan: el planificador elige entre dos índices según las estadísticas, y eso es estado de la base.
   Ahora afirma sobre el índice: existe, es btree, no es parcial y sus columnas clave son
   `tenant_id, oportunidad_id, ocurrido_en, id`, y el `WHERE`/`ORDER BY` de la consulta es el prefijo que
   cubre. No prueba que el planificador lo *elija*; eso no se puede garantizar sin fijar estadísticas.

## Sin cerrar (sigue en cola)

- **Deadlocks 40P01** de `historial-de-etapas` e `invitaciones.e2e-spec`: **no se reprodujeron y no se cierran.**
  Hipótesis (sin demostrar): el bloqueo era entre procesos (`aislamiento.spec.ts` toma AccessExclusiveLock al
  reaplicar políticas mientras la api consulta esas tablas), que T-503 y el modo serial eliminan. No hay
  concurrencia interna en `invitaciones.e2e-spec.ts` (sin `Promise.all`). Si vuelve un 40P01 con ambos arreglos, la
  causa es otra y hay que capturar `pg_locks`/log del servidor.
- **Cinco ejecuciones seguidas del CI sin rojo**: pendiente; solo cuenta lo que el CI observe sobre este PR y
  los siguientes.

## Sin verificar

Sin Postgres local: ni la consulta del catálogo de la prueba nueva ni la suite en serie se ejecutaron aquí.
