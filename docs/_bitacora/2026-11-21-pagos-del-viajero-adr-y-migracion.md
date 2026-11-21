# 2026-11-21 — Pagos del viajero: ADR-0034 y migración del libro de cobro (T-328 y T-329)

Eje C del roadmap de JD Tours: «quién pagó y quién debe». Dos piezas, cada una en su PR y cada una con
auditoría de seguridad antes de integrarse (dinero y aislamiento entre agencias, R13):

- **T-328 — ADR-0034**, integrado en #378 (`6870074`), estado *Propuesto*.
- **T-329 — migración `20261121140000_pagos_del_viajero_libro_de_cobro`**, integrada en #382 (`2b66608`).

## Qué quedó decidido y hecho

- **Un libro de movimientos que solo se añade** (`pagos`), no una columna `pagado`. Cinco tipos (`PAGO`,
  `DEVOLUCION`, `REVERSO`, `AJUSTE`, `PENALIDAD`); monto `bigint` en unidad mínima (R8) con moneda ISO-4217.
  Saldo, situación y estado de cobro se calculan en el servidor; el estado es del archivo, no del contacto.
- **Aislamiento por la base**: foráneas compuestas con `tenant_id` y `moneda_iso` (un pago no puede ligarse al
  archivo de otra agencia ni en otra moneda), reverso atado al original con índice único parcial contra el
  doble reverso, RLS forzada en las tres tablas (`pagos`, `plazos_de_cobro`, `parametros_de_cobro`).
- **Inmutabilidad**: `viajapro_app` solo SELECT e INSERT en `pagos`; disparadores contra UPDATE, DELETE y
  TRUNCATE; y `travel_files_venta_inmutable`, que impide cambiar `id`, `tenant_id`, `venta_unidades` y
  `moneda_iso` del archivo (el total es la venta más los ajustes del libro).
- **Permisos** `cobro.ver`, `cobro.registrar` y `cobro.corregir`: `ASESOR` ve y registra solo `PAGO`;
  devolución, ajuste, penalidad, reverso y plazos son `cobro.corregir`, que solo siembra `DUENO`.
- **PUNTO B**: `tenants.id` es inmutable por diseño. El disparador de `travel_files` no tiene excepción para
  la cascada: una excepción con `pg_trigger_depth()` sería una puerta, porque la acción referencial corre
  como dueño de la hija, y las foráneas compuestas entre tablas de agencia ya son `ON UPDATE RESTRICT`.

## Cómo se integró (para no repetirlo)

- #382 tocaba `apps/web/src/lib/permisos.ts` (carril `b/`) porque el mapa de etiquetas es
  `Record<Permiso, …>` y sin las tres entradas la web no compilaba: `Carril y tarea` en rojo. Sin
  `override-lane` ni relajar el tipo, se sacó a un PR web previo (#383): la clave del mapa pasó a la unión
  `Permiso | 'cobro.ver' | 'cobro.registrar' | 'cobro.corregir'`, que compila antes y después del cambio del
  contrato y mantiene la exhaustividad. Con #383 en `main`, #382 se actualizó con `main` y se le quitó ese archivo.
- Las dos auditorías del ADR (seguridad y turismo) se aplicaron en **una sola vuelta**, sin segunda ronda (R13);
  la revisión fuerte fue sobre la migración.
- Los ids de tarea y los nombres de migración chocaron varias veces con otros PR en vuelo: `git fetch` y mirar
  `main` antes de numerar.

## Verificado

CI de #382 sobre `06ca56d`: 15 de 15 checks en verde, con `aislamiento-tenants` (aplicó la migración sobre una
base real y pasó las 13 pruebas de T-329, incluido el caso concurrente de dos conexiones) y `Carril y tarea`.
`auditor-seguridad`: integrable, sin bloqueantes.

## Sin verificar

- **Las mutaciones de T-329 no existen** y el script de mutaciones no corre en el CI (T-377).
- **El ADR sigue *Propuesto***: falta que el propietario lo acepte y responda las preguntas del roadmap 08 §4
  (¿cuotas o pagos libres?, ¿cobra en otra moneda?, ¿quién registra?, ¿guarda comprobantes?, ¿anticipo y saldo?,
  ¿penalidad al cancelar?, ¿un pago cubre a varios archivos?).
- Supuestos del ADR: que `OPERACIONES` reciba solo `cobro.ver`, el plazo legal de conservación del soporte
  contable (confirmar con el contador) y el umbral fijo de 7 días de `POR_VENCER`.

## Cola

- **T-330** (API) gana las reglas que la base no cubre: tipo según estado del archivo, lo pagado sin negativos,
  `registrado_por` de la sesión, idempotencia con contenido igual, carrera registrar-cancelar, `registrado_en`
  nunca del cliente, sumas como `bigint`, Luhn, y las demás de su nota.
- **T-377** gana las mutaciones de T-329.
- Nuevas: **T-425** guardia de arranque con las tres tablas, **T-426** `ON UPDATE RESTRICT` hacia `tenants`,
  **T-427** `cobro.*` en la semilla de aislamiento, **T-428** documentación (modelo de datos, lenguaje ubicuo,
  contextos), **T-429** endurecimiento menor de la migración, **T-430** purga declarada, **T-431** casos de
  aislamiento de `parametros_de_cobro` y P-B, **T-432** Ley 1581 y `pagador_id`.
- La unión temporal `ClaveConEtiqueta` de `permisos.ts` se quita en un PR web aparte.

`ESTADO.md` dice ahora 55 migraciones (decía 54; contadas en `packages/database/prisma/migrations`).
