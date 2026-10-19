# 2026-10-19 — Arnés de aislamiento en paralelo (rama fix/qa-arnes-paralelo)

Causas raíz medidas:
1. `afterAll` de la suite borraba `recepciones_webhook` entera. Ahora solo las recepciones de la corrida (`nuevaRecepcion()`).
2. Las aserciones 18 y «extra» llamaban `purgar_recepciones`/`purgar_payloads` (globales por diseño) con plazo en el futuro: barrían filas de otras corridas y de la e2e de inbox. Ahora envejecen su propia recepción 2 días, purgan con plazo de 1 día y corren bajo `pg_advisory_lock` fijo.
3. Aserción 22 (reaplicar 001/002): DDL global; dos corridas = deadlock 40P01. Ahora `pg_advisory_xact_lock` fijo solo en ese bloque.
4. `inbox-relay.e2e-spec` no limpiaba sus recepciones (las limpiaba por casualidad el DELETE global). Ahora borra las suyas.

Hallazgo de entorno, NO del arnés: `mutaciones-aislamiento.mjs` muta la base compartida (quita RLS, cambia FK compuestas). Una corrida de mutaciones de otra sesión en paralelo pone en rojo cualquier suite (39, 47, 48, 22 por deadlock). Quedó la FK `conversaciones_contacto_id_tenant_id_fkey` rota ~4 min y luego restaurada. Además la base compartida ya tiene la migración 20261019230000 (identidad) y la aserción 11 falla en main hasta que se integre.
Cola: las mutaciones deberían correr contra una base efímera o bajo un lock que las suites respeten.
