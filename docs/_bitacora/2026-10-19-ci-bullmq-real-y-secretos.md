# 2026-10-19 — BullMQ real en CI y arreglo de generar-secretos-locales

Rama `ci/bullmq-real-y-secretos`, desde `main` v0.27.0. Sin migraciones, sin escrituras a Neon.

## 1. BullMQ real

`apps/api/src/modules/inbox/inbox-bullmq.e2e-spec.ts`. Con Redis real (el job de CI ya levanta Redis 7)
y la cola NO inerte (`COLA_CHANGES=bullmq` dentro de la prueba, restaurado al terminar):

- POST firmado -> un trabajo con `jobId = <recepcion hex>-0`, en estado `waiting`, con datos
  `{recepcionId, indice}` y sin contenido del mensaje.
- El mismo POST reintentado (antes y después de procesar): un solo trabajo, una sola fila de
  recepción, un solo mensaje (R5).
- Se arranca el `ConsumidorDeChanges` real con `ProcesarChange` real: el mensaje queda en `mensajes`
  con el `tenant_id` de la agencia.
- Un error de procesamiento cargado de PII (mensaje tipo «Failing row contains (...)» con `code`)
  deja `failedReason` con `Error:23502` y sin teléfono, texto ni «Failing row» (R10, v0.21.2).

**Cuándo corre:** con `CI=true` o con `PRUEBA_BULLMQ=1` + `REDIS_URL` desechable. Si no, se salta y
lo dice por `console.warn` con el motivo. No hay Redis en esta máquina, así que localmente solo se
verificó el salto con aviso y el tipado; la ejecución real es la del CI.

## 2. scripts/generar-secretos-locales.ps1

Defecto: tomaba el primer árbol como referencia y, si le faltaban, generaba y pisaba los de todos.
Ahora, por secreto y mirando todos los árboles: valor en alguno -> se copia a los que no lo tienen;
valores distintos -> aborta (exit 2) sin escribir y sin imprimir valores; en ninguno -> genera.
Solo escribe en los árboles que lo necesitan. Se añadió `-Carpetas` (solo pruebas).
Probado con `.env` falsos en un temporal: copia en ambos órdenes, aborto, generación común e
idempotencia; ningún valor aparece en la salida.

## Pendiente (cola)

- `pnpm --filter @viajapro/database generate` falló en local con EPERM (dll del motor bloqueada
  por otro proceso); el tipado de `apps/api` local además muestra símbolos de `contracts` sin
  construir. Ajeno a esta rama.
