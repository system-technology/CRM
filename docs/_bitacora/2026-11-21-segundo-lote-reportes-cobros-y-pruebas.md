# 2026-11-21 — Segundo lote: apodo, alcance de reportes y pruebas sin carrera

**Participantes:** sesión madre `session_01R81Xh45hbFQHivoDJ8cbJQ` (orquestación), sesiones hijas de web, datos y qa, documentador.
**Duración / alcance:** del cierre del lote de la madrugada ([bitácora](2026-11-21-lote-de-integracion-nocturno.md)) hasta `main` en `44d8673`. Cero PR abiertos al cerrar.

## Qué se hizo

| PR | Qué | Tarea |
|---|---|---|
| #404 | El listado de miembros expone el apodo. El contrato lleva el campo como opcional, de forma transitoria, para no romper a la web mientras se integraba | parte del ingreso por apodo |
| #405 | Ingreso con correo o usuario y edición del usuario de un miembro | ingreso por apodo, registrado tarde bajo **T-512** (el PR lo nombró T-362; en `roadmap/tasks.yaml` T-362 es otra tarea, el subdominio por agencia, y **sigue en `backlog`**) |
| #406 | «Esta vista es de administración» y avisos de alcance en seguimientos y ficha del contacto | T-485, `done` |
| #407 | Permiso `reportes.ver_agencia`: el catálogo pasa de 14 a 15, migración `20261121160000`, relleno solo al rol `DUENO` de cada agencia | T-341, `done` |
| #408 | Las pruebas de la api esperan a las de la base: se acabó la carrera por compartir Postgres | T-503, `done` (ver pendientes) |

Cerrados por sustitución: #402 y #362. Su contenido entró en #404 y #405.

### Textos de T-485, tal como salen en pantalla

- Reportes, a quien no administra la agencia: **«Esta vista es de administración»** y, debajo, «Los reportes de la agencia los ve quien la administra. Tus conversaciones, cotizaciones y seguimientos los sigues viendo en Bandeja, Cotizaciones y Seguimientos.»
- Seguimientos: «Ves solo tus seguimientos. Los de tus compañeros los ve quien administra la agencia.»
- Ficha del contacto: «Aquí ves solo tus seguimientos de este contacto…».
- El menú Reportes sigue visible a todos (decisión D3).

El ingreso por apodo se registró tarde, bajo T-512 (#358, #404 y #405), porque las ramas usaron «T-362», que es otra tarea y sigue abierta. Aviso para no repetirlo: un id se numera tras `git fetch`, no se inventa.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| La llave del alcance de las vistas vive en una sola función, `alcanceDeVista`, en `apps/web/src/lib/alcance-de-vista.ts` | Hoy la llave es `conversaciones.ver_todas` (cierre provisional de #395). **T-342 solo tendrá que cambiar esa función**: las pantallas y los textos no se tocan | Comentario del archivo; T-485 en `roadmap/tasks.yaml` |
| El relleno de `reportes.ver_agencia` da el permiso solo al rol `DUENO`, nunca a `ASESOR` ni `OPERACIONES`; un cinturón aborta la migración si alguno lo lleva | Mínimo privilegio: quien no administra no ve los reportes de la agencia | ADR-0035 §3 |
| Las pruebas de la api esperan a las de la base (`apps/api/turbo.json`) | Las de la base reejecutan rellenos que recorren todas las agencias y toman `AccessExclusiveLock`; las e2e de la api crean y borran agencias en otro proceso contra la misma base | T-503, [bitácora de T-503](2026-11-21-t503-pruebas-de-base-sin-carrera.md) |

## Qué quedó pendiente

- [ ] T-505 (`datos`, P2): una prueba que compare el `CHECK` de permisos (`pg_get_constraintdef`) con `PERMISOS`. El catálogo vive en tres literales a mano y nada los compara.
- [ ] T-510 (`qa`, P2): resto de T-503. Las e2e dentro de `apps/api` siguen compartiendo base. Los deadlocks 40P01 de `historial-de-etapas` y de `invitaciones.e2e-spec` no se reprodujeron. La prueba «la línea de vida usa el índice» depende de las estadísticas del planificador: falla en base ensuciada y pasa en limpia, y `ANALYZE` dentro de la prueba no lo arregló.
- [ ] T-511 (`frontend`, P2): probar el ingreso por apodo a 390 px contra la API real. Quedó sin verificar en #405.
- [ ] T-506 (`frontend`, P3): `ResultadoPermisos` del hook `usePermisos` es un contrato de facto con cada prueba que lo simula. Ampliarlo rompe en silencio.
- [ ] T-507 (`datos`, P3): el relleno de la migración hace dos recorridos de `tenants` en una transacción; por lotes si hay cientos de agencias.
- [ ] T-508 (`frontend`, P3): `puedeVerReportesDeLaAgencia` (`apps/web/src/lib/permisos.ts:334`) no tiene consumidor ni prueba. Entra con su caso en T-343/T-344 o se borra.
- [ ] T-509 (`datos`, P3): el `CHECK` no prohíbe permisos repetidos en el arreglo.
- [ ] Siguiente sin dependencias: T-342 (alcance de reportes en el servidor; retira el gate provisional de #395 y usa el permiso nuevo), T-343 y T-344.

## Qué aprendimos

- Pide siempre el mensaje de error completo de `tsc` antes de dar por buena una causa.
- Una sesión hija creada sin `source_url` nace sin repositorio.
- Las sesiones no pueden levantar Postgres en local (el clasificador lo deniega), así que «probado en navegador» casi siempre significa contra API simulada. Eso limita toda verificación de pantalla; está en [`PENDIENTES-DEL-PROPIETARIO.md`](../_contexto/PENDIENTES-DEL-PROPIETARIO.md).
- El clasificador también deniega `git push --force-with-lease`: para corregir el asunto de un commit ya empujado se recrea la rama y se abre otro PR. Pasó dos veces esta madrugada.
