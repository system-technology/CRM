# 2026-11-20 — Endurecer `perfiles_de_agencia` (T-307)

Rama `a/T-307-endurecer-perfiles-de-agencia`, integrada en #354 (`1c93ae3`). Cierra los dos hallazgos
menores que dejó la auditoría de seguridad de T-261 sobre la tabla del RNT de la agencia.

## Qué se hizo

- **Migración `20261120160000_perfiles_de_agencia_fechas_de_auditoria`.** Reemplaza
  `proteger_verificacion_del_perfil` (la versión vigente era la de T-268) y conserva toda su lógica de
  verificación. Añade, solo para quien no es la plataforma (el dueño de la tabla): en INSERT,
  `creado_en` y `actualizado_en` quedan en `now()`; en UPDATE, `creado_en` conserva el valor anterior y
  `actualizado_en` queda en `now()`. Lo que el cliente manda se ignora, no se rechaza, así que el upsert
  de la API no cambió. La plataforma sigue pudiendo fijarlas.
- **Prueba P-7** en `packages/database/tests/aislamiento.spec.ts`: la API inserta y actualiza con fechas
  del año 2000 y no las falsea; la plataforma sí puede.
- **Mutaciones M22 y M23** en `packages/database/scripts/mutaciones-aislamiento.mjs`: `GRANT` del dueño
  de la tabla a `viajapro_app` y `DISABLE TRIGGER` del disparador.

## Dos choques de numeración (para no repetirlos)

- La migración nació como `20261120150000`, pero `main` ya tenía `20261120150000_apodo_de_ingreso`
  (#356, aplicada en staging). Se renumeró a `…160000` antes de integrar.
- La M21 del script también la había tomado el apodo: las de esta tarea quedaron como M22 y M23.
- Antes, en #347, la tarea del esquema legado se numeró T-306, que ya era de otra tarea; se renumeró
  T-348 (#350). **Antes de numerar migraciones, tareas o mutaciones: `git fetch` y mirar `main`.**

## Verificado

El CI de #354 sobre la rama ya actualizada con `main` (`2dce1fc`): 16 de 16 checks en verde, con
`aislamiento-tenants` (aplica la migración en una base real y pasan las 171 pruebas) y `navegador`.
El auditor de seguridad la dio por integrable, sin bloqueantes ni riesgo de aislamiento entre agencias.

## Sin verificar

**Las mutaciones M22 y M23 nunca se ejecutaron.** El script no corre en el CI y en la sesión no hubo
Postgres local. Además prueban T-261, no T-307. Es T-377.

## Cola que dejó la auditoría (no bloquea)

- **T-375** — `now()` es la hora de inicio de la transacción: `viajapro_app` puede abrir una, esperar y
  escribir, y las fechas quedan antedatadas. Usar `statement_timestamp()` en una migración nueva.
- **T-376** — el cinturón de la migración solo mira la línea del UPDATE y acepta `proconfig` con ajustes
  de más: comprobar las tres asignaciones y exigir exactamente `{search_path=""}`. Va con T-375.
- **T-377** — una mutación M24 que cubra T-307 (restaurar el cuerpo de T-268; P-7 debe ponerse en rojo),
  ejecutar por primera vez M22 y M23, y decidir si el script corre en el CI.

También se corrigió en la cola la ruta del script: `roadmap/tasks.yaml` decía
`scripts/mutaciones-aislamiento.mjs`; la real es `packages/database/scripts/mutaciones-aislamiento.mjs`.
`ESTADO.md` dice ahora 51 migraciones (decía 48).
