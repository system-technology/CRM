# 2026-10-27 — T-071: la auditoría distingue usuario de clave de API

**Quién:** agente `datos` (carril `a`, sesión `backend`). Migración autorizada por el propietario.

**Qué se hizo**

- Migración nueva `20261027140000_actor_en_la_auditoria`: tipo `tipo_de_actor`
  (USUARIO | CLAVE_DE_API); `registros_auditoria.tipo_de_actor` nulable con DEFAULT 'USUARIO'
  (lo existente queda NULL, lo nuevo nace USUARIO); `clave_de_api_id` nulable sin foránea hasta
  M3; CHECK de coherencia `NOT VALID` + `VALIDATE`; RLS reaplicada y cinturón. Ninguna migración
  existente se tocó.
- `quoting`: `ActorDelCambio.claveDeApiId` opcional; el registro de cambios escribe el tipo; el
  historial de precios devuelve `actor: { tipo, claveDeApiId } | null`, sin datos personales.
  Contrato: `TipoDeActor` y `CambioDePrecio.actor`.
- Pruebas: unitaria del historial (usuario, clave, registro anterior a T-071, conforme al
  contrato); e2e del historial (claves exactas + `actor` USUARIO); aserción `T-071` en
  `aislamiento.spec.ts`.

**Qué no se verificó aquí**

- La migración no se aplicó a ninguna base: se denegó el permiso para levantar un PostgreSQL local
  desechable y no se rodeó. La aserción y las e2e las corre el CI.

**Cola (no bloquea):** `registros_auditoria` no tiene foránea a `tenants` (preexistente).
