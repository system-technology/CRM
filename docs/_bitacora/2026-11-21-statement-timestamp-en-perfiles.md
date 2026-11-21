# 2026-11-21 — Fechas de `perfiles_de_agencia` con `statement_timestamp` (T-375 y T-376)

Rama `a/T-375-statement-timestamp-en-perfiles`, integrada en #361 (`8bcd737`). Cierra los dos primeros
puntos de la cola que dejó la auditoría de seguridad de T-307 (ver
[la bitácora de T-307](2026-11-20-endurecer-perfiles-de-agencia.md)).

## Qué se hizo

- **Migración `20261120170000_perfiles_de_agencia_statement_timestamp`** (T-375). `pg_catalog.now()` es la
  hora de inicio de la transacción: `viajapro_app` podía abrir una, esperar y escribir, y `creado_en` y
  `actualizado_en` quedaban antedatados. El disparador `proteger_verificacion_del_perfil` usa ahora
  `pg_catalog.statement_timestamp()`. No es `clock_timestamp()` a propósito: cambiaría entre filas de una
  misma sentencia. La lógica de verificación (rnt, nit, dígito) no cambió.
- **Cinturón de esa migración** (T-376): comprueba el cuerpo entero de la función —cada asignación de
  fecha, su número exacto, ningún `now()`— y exige `proconfig` exactamente `search_path` vacío, función
  `SECURITY INVOKER`, sin `EXECUTE` para PUBLIC y disparador habilitado.
- **Pruebas P-8 y P-9** en `packages/database/tests/aislamiento.spec.ts`: una transacción de
  `viajapro_app` espera 1,2 s y escribe (INSERT y UPDATE), y la superficie de la función en el catálogo.

## Verificado

CI de #361: `aislamiento-tenants` en verde, que aplicó la migración y pasó 173 de 173 pruebas; P-8 tardó
2,4 s. El auditor de seguridad la dio por integrable, sin bloqueantes. Los dos archivos auditados
(`6a57080`) y los de la cabeza integrada (`f104c85`) son idénticos: la diferencia es solo la mezcla de
`main`.

## Sin verificar

Las mutaciones M22 y M23 siguen sin ejecutarse y ninguna cubre T-375 ni T-376 (T-377, aún abierta).
`regexp_count` (Postgres 15 o más) se probó en el Postgres 16 del CI, no en el de Neon: de ahí T-409.

## Cola que dejó la auditoría (no bloquea)

- **T-408** — el cinturón compara texto: no detecta `localtimestamp`, `current_time`, `localtime` ni
  `timeofday()`, ni distingue comentarios. Va con una migración nueva.
- **T-409** — la versión de Postgres de Neon no está escrita en ningún ADR ni documento de despliegue, y el
  esquema ya exige 15 o más. Fijarla y documentarla.
- **T-410** — P-8 tarda unos 2,4 s y vitest usa 5 s por defecto: darle un tiempo límite explícito.

`ESTADO.md` dice ahora 54 migraciones (decía 51; contadas en `packages/database/prisma/migrations`).
