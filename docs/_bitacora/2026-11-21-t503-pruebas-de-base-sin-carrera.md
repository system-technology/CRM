# 2026-11-21 — T-503: las pruebas de base dejan de pisarse entre paquetes

## Qué pasaba

Tres pruebas fallaban al azar y pasaban al relanzar el job: `etiquetas-por-agencia.spec.ts`
(`etiquetas_tenant_id_fkey`), `historial-de-etapas.spec.ts` (deadlock `40P01`) e
`invitaciones.e2e-spec.ts` (`deadlock detected`).

## Causa raíz

`pnpm test` es `turbo run test`, y turbo ejecuta **en paralelo** las pruebas de `@viajapro/database` y de
`@viajapro/api` contra **la misma base**. `fileParallelism: false` en `packages/database` solo serializaba
dentro de ese paquete. Esos dos paquetes se estorban:

- Las pruebas de `database` reejecutan rellenos de migración que recorren **todas** las agencias
  (`FOR t IN SELECT id FROM tenants`) y `aislamiento.spec.ts` reaplica políticas (AccessExclusiveLock).
- Las e2e de `api`, en otro proceso, crean y borran agencias. Si una agencia se borra entre el `SELECT` del
  relleno y su `INSERT`, la clave foránea falla; si los bloqueos se toman en orden distinto, hay deadlock.

## Cómo se comprobó

- Con un proceso aparte que crea y borra agencias sin parar (lo que hace una e2e), 5 de 8 corridas de
  `etiquetas-por-agencia.spec.ts` fallaron con `etiquetas_tenant_id_fkey`. Sin ese proceso, 11 de 11 pasaron.
- En una tanda con `database` (3 pasadas) y `api` (1 pasada) a la vez hubo un fallo en cada paquete (`AP14` en `aislamiento.spec.ts`, un 500
  en `etiquetas.e2e-spec.ts`); `api` sola pasó. No se pudo atribuir esos dos a una causa concreta (no hubo log de deadlock): son indicio, no prueba.

- Con el arreglo (database y luego api, sin solaparse) sobre una base limpia: 3 pasadas completas seguidas, las
  3 en verde (database 262 passed, api 2163 passed). Turbo no arranca en el entorno de la sesión, así que el
  orden se emuló con `pnpm --filter`; el grafo se verificó con `turbo run test --dry=json`.
- Hallazgo aparte: `historial-de-etapas.spec.ts` («la línea de vida usa el índice») falló 3 de 3 en una base
  local ensuciada por varias corridas de `api` y por el proceso de churn: el plan elige entre dos índices según
  las estadísticas. `ANALYZE` dentro de la prueba no lo arregló. Sobre base limpia pasa. No se pudo reproducir
  en una base limpia; queda como riesgo para la cola (el CI arranca siempre limpio).

## Qué cambió

`apps/api/turbo.json` (nuevo, extiende el de la raíz): `@viajapro/api#test` depende de
`@viajapro/database#test`. Las dos suites ya no se solapan nunca; el resto de paquetes sigue en paralelo.
Comentario en `packages/database/vitest.config.ts` para que nadie quite la dependencia sin darle a cada paquete
su propia base.

## Pendiente (cola)

- Aislar de verdad (una base por paquete, creada con `CREATE DATABASE … TEMPLATE`) permitiría volver a
  paralelizar. Hoy cuesta más de lo que ahorra; no se hace.
- Dentro de `apps/api` las e2e corren en paralelo contra la misma base. No falló en las pasadas hechas; si
  `invitaciones.e2e-spec.ts` vuelve a dar deadlock con este arreglo, la causa es ahí y se abre otra tarea.
- Criterio de T-503 sin cerrar: cinco ejecuciones seguidas del CI sin rojo por esto.
