# 2026-10-27 — T-062: la versión de cotización guarda la opción de salida

**Quién:** agente `datos` (carril `a`, sesión `backend`). Migración autorizada por el propietario.

**Qué se hizo**

- Migración nueva `20261027130000_opcion_de_salida_en_la_version`: columna nulable
  `versiones_cotizacion.opcion_de_salida_id`, índice `(tenant_id, opcion_de_salida_id)`, foránea
  COMPUESTA hacia `opciones_de_salida (id, tenant_id)` en `NO ACTION`, creada `NOT VALID` y
  validada; RLS reaplicada por `aplicar_aislamiento_tenant` y cinturón. Ninguna migración
  existente se tocó. Independiente de T-082.
- `armarVersion` guarda la opción con la que cotizó el servidor; el repositorio la persiste y el
  mapper la devuelve. Contrato: `VersionDeCotizacion.opcionDeSalidaId` (nullable, opcional en Zod).
- Pruebas: unitaria en `version-de-cotizacion.spec.ts`; e2e (guardar con Lancha, releer, recotizar
  con la opción devuelta = mismo total; B recibe 404); aserción `T-062` en `aislamiento.spec.ts`.

**Qué no se verificó aquí**

- La migración no se aplicó a ninguna base: se denegó el permiso para levantar un PostgreSQL local
  desechable y no se rodeó. La aserción de aislamiento y las e2e las corre el CI (contenedor
  `postgres:16`).

**Pendiente:** nada de este cambio.
