# 2026-11-17 - Robustez del despachador de eventos (T-247)

**Participantes:** agente `backend`. **Origen:** auditoria de seguridad de T-241 (cola R13).

## Que se hizo

- **`lock_timeout`** de 5 s (`set_config(..., true)`, como el catalogo) antes del advisory lock del
  numero de file en `archivos.prisma.ts`: una apertura que espera demasiado falla con 55P03 en lugar
  de agotar la transaccion interactiva (P2028).
- **Errores transitorios** (`esErrorTransitorio`): Prisma P1001, P1002, P1008, P1017, P2024, P2028,
  P2034 y SQLSTATE 40001, 40P01, 55P03 (en consultas crudas Prisma los envuelve en P2010 y el SQLSTATE
  va en `meta.code`; tambien se detecta en el texto). No suman `intentos`: se deja un `warn` con el
  codigo y se reintenta en la siguiente pasada.
- **Abandono visible:** al llegar a 10 intentos, un `error` JSON con consumidor, tenantId, outboxId,
  intentos y codigo. Sin mensajes ni payload.
- **Rotacion:** `barrer()` empieza cada pasada por una agencia distinta (`rotar`).
- Pruebas unitarias en `shared/eventos/eventos.spec.ts`. Sin e2e nuevo (no hay Postgres aqui).

## Cola (no hecho a proposito)

- Metrica de abandonadas por consumidor: exige funcion `SECURITY DEFINER` y migracion.
- `tenants_con_eventos_por_entregar` tiene `LIMIT 500` fijo: la rotacion solo reparte turno dentro de
  lo que la funcion devuelve.
