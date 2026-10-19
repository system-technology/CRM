# 2026-10-19 — La función del relay de barrido

Rama `feat/inbox-barrido-pendientes`, desde `origin/main` (f5b6793). ADR-0010 §1.1 punto 9.
Agente `datos`, modo desatendido.

## Qué quedó

- **Migración `20261019210000_listar_changes_pendientes_para_el_barrido`.** Novena función
  `SECURITY DEFINER`: `listar_changes_pendientes(p_antiguedad_minima_s integer, p_limite integer)
  RETURNS TABLE(recepcion_id bytea, indice smallint, antiguedad_s integer)`. Dueño
  `viajapro_staging`, `EXECUTE` solo para `viajapro_webhook`, `search_path` vacío, `REVOKE` a
  `PUBLIC`. Más un índice parcial sobre los changes `PENDIENTE`.
- **Aserción 53** en `aislamiento.spec.ts`, y la función añadida a la matriz de la 20 y al
  recuento de la 12 y la 13 (de 8 a 9).

## Decisiones

- **Solo identificadores y antigüedad.** Es la primera función que lista el staging, que guarda
  contenido de varias agencias sin RLS. Ni payload ni tenant.
- **Límite obligatorio, 1..1000; nulos lanzan 22023** (sin `STRICT`, que devolvería cero filas y
  el barrido lo leería como «nada atascado»).
- **Excluye las recepciones con el contenido ya anulado** por `purgar_payloads`: reencolarlas sería
  un bucle sin fin. Siguen `PENDIENTE` como evidencia.
- **Más antiguas primero**, para que el límite no deje morir a las de cola.

## Verificación

Neon no se tocó. Solo CI (Postgres 16 limpio, cadena completa):
- Rojo `39340047807` (commit 6b0cfc1, aserción sin función): fallan 12, 13, 20, 22, 23 y 53.
- Verde `39340324970` (commit 299597f): las 58 de aislamiento y todos los jobs.

## Pendiente (cola, dueño `backend`)

- El trabajo programado del trabajador que llama a la función cada ~30 s y reencola con el mismo
  `jobId`, **borrando antes el trabajo fallido** si existe (si no, BullMQ descarta el reencolado).
- ADR-0010 sigue diciendo «ocho» funciones: los ADR no se editan; lo recoge el que lo supersede.
