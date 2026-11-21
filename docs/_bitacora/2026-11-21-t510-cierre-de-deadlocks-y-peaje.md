# 2026-11-21 — T-510: los deadlocks 40P01 y el peaje de la ejecución en serie

Sigue a [`2026-11-21-t510-estabilidad-e2e-api`](2026-11-21-t510-estabilidad-e2e-api.md) (#415). Aquí se
miden dos cosas que #415 dejó sin medir: de dónde venía el 40P01 y cuánto de los +40 % del job `test`
es necesario.

## 1. El 40P01 de `invitaciones.e2e-spec`: cerrado con evidencia

No se reprodujo en local (no hay Postgres en la sesión), pero **el CI ya lo había capturado**: el job `test`
de la corrida 44872868317 (2026-11-21 05:53Z, anterior a #408) trae el log del servidor.

```
Process 137: TRUNCATE versiones_cotizacion CASCADE          (espera AccessExclusiveLock)
Process 196/198: SELECT count(*) FROM versiones_cotizacion WHERE tenant_id = ANY($1)   (borrar-tenants.mjs)
```

- El `TRUNCATE ... CASCADE` es `packages/database/tests/aislamiento.spec.ts:4468`: afirma que el propietario no
  puede truncar `versiones_cotizacion`. El disparador lo rechaza, pero **`TRUNCATE` toma el
  `AccessExclusiveLock` antes de que el disparador lo rechace**.
- Los `SELECT count(*)` son `borrarTenants` (`packages/database/scripts/borrar-tenants.mjs:62`), la limpieza de
  agencias de las e2e de `apps/api`: ahí murió `invitaciones.e2e-spec.ts:237`. Es el proceso de otro paquete,
  inferido por los pid y las sentencias.
- Por tanto, **la hipótesis de la sesión anterior estaba bien en el mecanismo y mal en el detalle**: no era el
  reaplicado de políticas del caso 22, sino el `TRUNCATE` rechazado del caso de `versiones_cotizacion`. La
  causa sigue siendo la misma: dos paquetes (`database` y `api`) contra una base a la vez. La cierra
  `apps/api/turbo.json` (#408, 08:32Z): la api espera a la base.
- El propio test ya lo intuía: `aislamiento.spec.ts` reintenta ante 40P01 («en el CI las pruebas de la api
  corren a la vez»). Un reintento de ese lado no protege al otro: el motor eligió de víctima a la api.
- **`historial-de-etapas` no tiene log**: en las corridas que se revisaron no apareció su 40P01. Se atribuye por
  mecanismo (mismo paquete, misma base compartida con la api), **sin demostrar**.

Las 10 corridas con el job `test` en rojo entre 01:05Z y 09:10Z (antes de #415), por causa:

| Causa | Corridas |
|---|---|
| 40P01 (el de arriba) | 1 |
| `etiquetas_tenant_id_fkey`: el relleno de la migración recorre agencias que la api borra | 2 (+1 de `etiquetas.e2e-spec`, 3 pruebas, sin log atribuible) |
| Pruebas de la web (no tocan la base) | 2 |
| Errores de código/prueba del día: `seguimientos_exactamente_un_destino`, `travel_files_otro_exige_nota`, ráfaga de `apodo-ingreso`, `reportes.e2e` (unicidad `tenant,canal,contacto` en su propio fixture) | 4 |

Ninguna de las diez se atribuye a dos archivos e2e de la propia api pisándose.

## 2. Cinco corridas seguidas

Desde #415 (09:10Z) hasta las 11:58Z: **32 corridas del CI con el job `test` en verde, 0 en rojo**, 10 canceladas
por una corrida más nueva de la misma rama y 1 en curso. Los rojos de ese tramo fueron de otros jobs
(`navegador` ×6, `typecheck` ×1), ninguno de `test`. El criterio de cinco se cumple en serie. Se
cuenta lo observado, no se provocó nada.

## 3. Peaje: cuánto es de qué

Mediana del job `test` en corridas verdes (segundos; ruido de runner y de contenido de cada PR, no es un banco de
pruebas):

| Tramo | n | min | mediana | max |
|---|---|---|---|---|
| Antes de #408 (database y api a la vez) | 72 | 164 | 210 | 278 |
| #408 sin #415 (api espera a database; archivos de la api en paralelo) | 16 | 183 | 262 | 383 |
| #415 (además, archivos de la api en serie) | 32 | 264 | 328 | 409 |

El peaje son **dos**, de ~50-65 s cada uno. El de #408 está justificado por el log de arriba. El de #415 se
justificaba con una hipótesis (ninguna evidencia de dos archivos de la api pisándose; la ejecución paralela
era el modo de la api desde siempre). En el tramo intermedio hubo 16 verdes y 1 rojo, y ese rojo es de
fixture propio.

## 4. Qué se hace

Este PR **retira `fileParallelism: false` de `apps/api`** y deja el comentario con el porqué. Es una apuesta
con datos finos (n=17 en el tramo paralelo): no demuestra que sea seguro, solo que nada lo desmiente. Se valida
repitiendo el job `test` de este PR (ver el PR para el recuento) y, si **algún** rojo es un 40P01, una FK
ausente o una colisión entre archivos de la api, **se vuelve a la ejecución en serie en el mismo PR** y se
acepta el peaje.

Único candidato dentro de la api: `booking-archivos.e2e-spec.ts` emite `TRUNCATE reserva_cambios_estado`
(rechazado por privilegios, pero con el bloqueo tomado un instante). Si algo falla, empezar por ahí
(serializar solo ese archivo antes que toda la suite).

## Cola

- `aislamiento.spec.ts` (~4435) reintenta ante 40P01 y su comentario dice que la api corre a la vez: tras #408
  es falso. El reintento puede quedarse como cinturón; el comentario debe corregirse (ruta protegida, otro PR).
- `packages/database/vitest.config.ts` dice «sin reintentos» y la suite reintenta: reconciliar.
- `reportes.e2e-spec.ts:344` falló una vez con unicidad `(tenant,canal,contacto)` en un fixture propio; no se
  investigó (fuera de T-510).

## Sin verificar

Todo lo medido sale de la API del CI de GitHub (jobs, logs). Nada se corrió en local. La causa del rojo de
`reportes.e2e` y la del de `etiquetas.e2e-spec` (02:24Z) no se determinó.
