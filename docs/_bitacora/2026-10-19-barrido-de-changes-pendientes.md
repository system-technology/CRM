# 2026-10-19 — El barrido de changes pendientes

Rama `feat/inbox-barrido-pendientes` (sobre la función `listar_changes_pendientes` de `datos`, y con
`main` fusionado para traer la e2e de BullMQ real). ADR-0008 §4 «relay», ADR-0010 punto 9.

## Qué hace

Cada 30 s, dentro del proceso trabajador, `BarrerPendientes` pide a la base los changes `PENDIENTE`
con contenido y más de 30 s de antigüedad (hasta 500, los más antiguos primero) y reencola los que no
tienen trabajo vivo con `jobId = <recepcion hex>-<índice>`.

- **Antes de reencolar quita el trabajo fallido o completado con ese id.** BullMQ descarta en silencio
  un `add` con `jobId` repetido. El completado cuenta: el consumidor puede devolver `RETENIDO` y el
  change sigue pendiente.
- **Temporizador del proceso, no trabajo repetible de BullMQ:** el barrido recupera lo que Redis no
  recibió; dispararlo desde la misma cola sería circular. Si Redis cae, el tick lo registra y reintenta.
- **Varios trabajadores:** gana el turno del intervalo uno solo (`SET NX PX`); y si dos barren a la vez,
  el `jobId` deja un solo trabajo. El turno ahorra trabajo; la corrección la da el `jobId`.
- **Tope de reintentos (decisión mía, con default):** un mismo change se reencola como mucho **10 veces**
  (contador en Redis, caduca a las 24 h; solo cuenta cuando de verdad se reencola, no cuando ya tiene
  trabajo vivo). Al pasarlo se registra **una vez** con nivel error y deja de reencolarse. **No se
  descarta ni se cierra como CLASIFICADO:** eso destruiría un mensaje de cliente que quizá solo esperaba a
  que se arreglara un defecto. Sigue pendiente en la base hasta que `purgar_payloads` anule el contenido
  por antigüedad.
- **Registro sin PII:** `Barrido: N candidatos, X reencolados, Y ya en cola, Z abandonados.` y, al
  abandonar, el prefijo de 12 caracteres del hash. Los errores del tick salen como `Clase:código`.
- Configurable: `BARRIDO_INTERVALO_MS`, `BARRIDO_ANTIGUEDAD_S`, `BARRIDO_LIMITE` (1-1000),
  `BARRIDO_MAX_REENCOLADOS`; validados al arrancar.

## Verificación

- Unitarias: `barrer-pendientes.spec.ts` (10: reencolado, ya en cola, borrado del fallido y del
  completado, dos barridos concurrentes -> un trabajo, tope y aviso único, sin PII),
  `planificador-de-barrido.spec.ts` (turno único, el tick nunca lanza ni filtra el mensaje del error).
- `inbox-barrido.e2e-spec.ts` con Redis real, solo en CI (como `inbox-bullmq`): POST guardado sin
  encolar -> barrido -> `mensajes`; dos barridos concurrentes -> un trabajo y un solo turno; un trabajo
  fallido con ese id se borra y el mensaje llega. Usa una cola propia y solo ve sus recepciones.
- No se aplicaron migraciones ni se escribió en Neon; la e2e se valida en CI.

## A cola

- Los changes abandonados quedan al principio de la lista (los más antiguos primero): con más de
  `BARRIDO_LIMITE` abandonados a la vez taparían a los nuevos. Hoy es teórico; el remedio es una columna
  de intentos en la base, que pide migración (`datos`).
- No hay métrica exportable, solo el registro: el contador de abandonados es el dato para una alerta.
