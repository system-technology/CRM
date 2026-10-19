# 2026-10-19 — Un canal revocado ya no se resuelve como ACTIVO (tarea 4f)

Agente: `datos`. Rama: `fix/datos-canal-revocado`, desde `origin/main` (v0.20.0).

## El defecto

`enrutamiento_canales.estado` solo lo escribía `registrar_enrutamiento`. Dar de baja un canal es un
`UPDATE canales`, y nada llevaba el cambio al directorio: `resolver_enrutamiento` contestaba
`ACTIVO` y el trabajador habría persistido mensajes de una agencia sin contrato.

## La decisión

Opción (b) de las tres propuestas: un disparador. La (a), que el resolvedor lea `canales`, se
descarta porque el resolvedor corre sin contexto de tenant y su dueño (`viajapro_enrutador`) no
tiene privilegios sobre `canales` por diseño (ADR-0008 §1.1 y §1.3). Habría que darle una lectura
entre tenants sobre una tabla con RLS forzada, o sea una excepción nueva al aislamiento.

Migración nueva `20261019120000_propagar_estado_de_canal_al_directorio`:

- `propagar_estado_canal()`: `SECURITY DEFINER`, `search_path = ''`, dueño `viajapro_enrutador`, y
  `EXECUTE` revocado a `PUBLIC` sin concederlo a nadie. PostgreSQL no comprueba `EXECUTE` al
  disparar, y una función de disparador no se puede llamar directamente.
- Disparador `AFTER UPDATE OF estado ON canales WHEN (NEW.estado <> 'ACTIVO')`. Restringe las filas
  del directorio con `canal_id = NEW.id AND tenant_resuelto_id = NEW.tenant_id` a
  `max(actual, NEW.estado)` y deja un asiento en el historial.
- **Monótono**: nunca relaja. Sin esa regla, un `viajapro_app` podría reactivar el ruteo de un
  número con un `UPDATE` a su canal. Reactivar queda solo en `registrar_enrutamiento`.
- Para reconciliar lo que ya hubiera divergido, la migración ejecuta
  `UPDATE canales SET estado = estado WHERE estado <> 'ACTIVO'`, que dispara el disparador.
- La función resolvedora no cambia: conserva cuerpo, privilegios y propietario.
- Ninguna excepción nueva a RLS, así que `excepciones_rls` y su literal no cambian.

Primer intento de despliegue fallido: `ALTER FUNCTION ... OWNER TO viajapro_enrutador` exige que el
nuevo dueño tenga `CREATE` sobre `public`. Era transaccional y no dejó nada aplicado: se marcó
`rolled-back` y se corrigió el archivo con el mismo patrón de conceder, traspasar y revocar que usa
la migración del directorio. Nunca llegó a estar aplicada.

## Prueba

- Aserción 46 nueva. Alta `ACTIVO`, baja por la API (`viajapro_app` con su tenant): resuelve
  `REVOCADO`. Vuelta a `ACTIVO` por la API: sigue `REVOCADO`. Dos asientos en el historial.
- **Vista en rojo sin la migración**: `expected ['ACTIVO'] to deeply equal ['REVOCADO']`.
- `propagar_estado_canal` entra en `MATRIZ_FUNCIONES` con `[]` y en `PROPIETARIO_ESPERADO`. Las
  aserciones 12 y 13 pasan de 7 a 8 funciones.

## Verificación (base `neondb`, comprobada con `current_database()`; todo con `env -u DATABASE_URL -u DIRECT_URL`)

- Migración aplicada en Neon con `migrate:deploy`.
- Aislamiento: **51/51** cuatro veces sueltas, más una dentro de `pnpm test`. La 23, que levanta la
  cadena completa desde cero, incluye la migración nueva.
- Una corrida de `pnpm test` dio rojo en la 22 por `deadlock detected` al reaplicar `001`/`002`.
  Coincidió con la otra sesión que corre pruebas contra la misma base (DDL concurrente sobre todo
  el esquema). Al repetir, verde. Queda anotado como cola (abajo).
- `lint` 7/7, `typecheck` 9/9, `build` 5/5, `test` 6/6 (domain 70, contracts 56, api 218,
  database 51), `format:check` limpio.

## Cola (no bloquea)

- Las bajas de **cuenta** (`cuentas_whatsapp.estado`) no restringen las filas WABA del directorio.
  Sería el mismo disparador sobre `cuenta_id`. Dueño: `datos`.
- `registrar_enrutamiento` puede escribir `ACTIVO` para un canal que en `canales` sigue `REVOCADO`.
  Ese es el orden del re-alta, y solo `viajapro_altas` puede hacerlo. Cerrarlo dentro de la base
  exigiría que el dueño del directorio pudiera leer `canales`, y eso pide ADR. Dueño: `backend`
  (camino de alta).
- La aserción 22 puede bloquearse mutuamente con otra corrida simultánea contra la misma base.
  Dueño: `qa`.

## Pendiente

- Integración por `integrador`.
