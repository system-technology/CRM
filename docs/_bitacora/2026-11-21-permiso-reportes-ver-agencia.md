# 2026-11-21 — T-341: el permiso `reportes.ver_agencia`

**Tarea:** T-341 (Eje F del roadmap JD Tours). **Dueño:** `datos`. **Decide:** ADR-0035 §3.
**Base:** `origin/main` en `f12c3c7`. **Rama:** `feat/datos-T-341-permiso-reportes-ver-agencia`.

## Qué se hizo

Un **solo** permiso nuevo en el catálogo de autorización, `reportes.ver_agencia`, y nada más. Su
**ausencia** es el nivel «propio»: no se creó ningún permiso para ver lo de uno, porque es el mínimo
de cualquier miembro (ADR-0035, opción D descartada).

| Dónde | Qué |
|---|---|
| `packages/database/prisma/migrations/20261121160000_permiso_reportes_ver_agencia/` | `CHECK roles_permisos_del_catalogo` de **catorce a quince** (`DROP` + `ADD ... NOT VALID` + `VALIDATE`, con aserción final de que quedó validado); relleno del rol con clave `DUENO` de **cada** agencia, por `tenant_id`, con `app.current_tenant`; cinturón |
| `packages/contracts/src/identidad.ts` | `PERMISOS` con el permiso y su comentario (R3: una sola fuente de verdad) |
| `packages/contracts/src/identidad.spec.ts` | El reflejo exacto del CHECK: quince, sin repetidos |
| `packages/database/prisma/siembra-de-tenant.ts` | `ROLES_SEMBRADOS`: a `DUENO`. **Ni `ASESOR` ni `OPERACIONES`** |
| `apps/web/src/lib/permisos.ts` (+ su spec) | Etiqueta legible «Ver reportes de la agencia», categoría `reportes`, constante y `puedeVerReportesDeLaAgencia` |
| `packages/database/tests/permisos-de-reportes.spec.ts` | Prueba nueva (abajo) |
| `docs/02-arquitectura/03-modelo-de-datos.md` | Sección con el reparto por rol y el porqué |

**`aislamiento.spec.ts` no cambia:** no hay tabla nueva ni excepción de RLS que declarar (R1).

## Lo que NO se hizo, a propósito

El permiso **nace inerte**: hoy nadie lo lee. Quien deriva el alcance de la sesión es **T-342**
(`alcanceDeReporte`, puertos de reportes, contrato con unión discriminada, 403 con `asesorId`
ajeno). Hasta que entre, el resumen sigue con el gate provisional de #395
(`conversaciones.ver_todas`) y la API se comporta igual que antes de esta migración. El orden
inverso —el alcance antes que el permiso— sí habría dejado un hueco.

## Verificación

- Migración **ejecutada de verdad** contra un PostgreSQL 16 efímero local (`prisma migrate deploy`,
  las 41 migraciones desde cero): aplicada sin errores, con su cinturón.
- `packages/database/tests/permisos-de-reportes.spec.ts`, 4 pruebas en verde contra esa base:
  el CHECK vigente admite el permiso, está `convalidated` y **conserva los catorce anteriores**;
  el relleno reejecutado sobre agencias «como eran antes» (una normal, una que renombró su rol y ya
  lo tenía a mano, una **sin rol `DUENO`**) se lo da solo al dueño, es idempotente y no toca roles
  propios; **aborta** si un `ASESOR` acaba con el permiso; `reportes.ver_propio` lo rechaza la base
  con `23514`; y el relleno no deja `app.current_tenant` colgado.
- `permisos-de-archivo`, `permisos-de-mutacion` y `etiquetas-por-agencia` siguen en verde contra la
  misma base; `@viajapro/contracts` (199) y `permisos.spec.ts` de la web (18), también.
- `pnpm typecheck` del monorepo en verde (`MAPA_ETIQUETAS_PERMISOS` es `Record<Permiso, …>`: olvidar
  la etiqueta de la web no compila).
- Lo que **no** se ejecutó aquí: `aislamiento.spec.ts` completo (exige los roles de login con
  contraseña; lo corre el job `aislamiento-tenants` del CI, que es quien ejecuta la migración de
  verdad sobre la cadena desde cero).

## Autocomprobación contra la lista de nueve de ADR-0035 §9

| # | Qué pide | Aquí |
|---|---|---|
| 1 | Ningún puerto de reportes lee `asesorId`/`alcance` del cliente sin `alcanceDeReporte` | **No aplica (T-342).** Esta tarea no toca un solo puerto ni endpoint |
| 2 | 403 con `asesorId` ajeno en reportes y seguimientos, idéntico con un id inexistente | **No aplica (T-342)** |
| 3 | La rama `PROPIO` del contrato sin claves de agencia, salida validada | **No aplica (T-342)** |
| 4 | El margen no se calcula ni viaja sin `cotizacion.ver_neto_y_margen` | **No aplica (T-342).** Lo vigente no cambia: el permiso nuevo no abre neto ni margen, y así está escrito en su comentario del contrato |
| 5 | **La migración de T-341:** CHECK ampliado y validado; relleno solo del rol `DUENO` de cada agencia por `tenant_id`; sin `UPDATE` sin filtro; sin tocar roles personalizados | **Cumple, y es lo propio de esta tarea.** `VALIDATE` explícito + aserción `convalidated`; el único `UPDATE` lleva `tenant_id = t.id AND clave = 'DUENO'` dentro de un bucle por agencia con `app.current_tenant`; los roles sin `clave` no entran en el `WHERE`; el cinturón aborta si un `ASESOR`/`OPERACIONES` o cualquier otro rol sembrado acaba con el permiso, o si un DUENO queda con repetidos. Probado reejecutando el bloque (marcas `[relleno-reportes]`) |
| 6 | Cada `$queryRaw` de reportes con `tenant_id` en cada `JOIN` y su e2e de dos agencias | **No aplica (T-342).** No se añadió SQL de lectura de reportes |
| 7 | Las filas de detalle respetan `visibilidadDe` | **No aplica (T-342)** |
| 8 | CSV en el servidor, escapado, sin PII | **No aplica (T-345 con T-483)** |
| 9 | La web no es la única barrera; probar contra la API | **Cumple en lo que toca.** La web solo gana una etiqueta legible y un `puedeVerReportesDeLaAgencia` que **nadie usa todavía** para ocultar nada: no hay barrera de web que pudiera ser la única. Lo que esta tarea añade se probó contra la base real, no contra la pantalla |

**Resumen:** de los nueve, el que es de esta tarea es el 5, y se cumple; el 9 se cumple en lo que le
toca; los otros siete son de T-342, T-345 y T-483 y siguen abiertos. La auditoría de seguridad
previa a integrar no recorta vueltas (R13): esto es catálogo de autorización.

## Riesgos y lo que queda

- **Lo que un dueño ve no cambia hoy**, y por eso el permiso no abre nada entre T-341 y T-342. Lo
  que sí cambia es que una agencia ya puede componer un rol propio con él desde Ajustes.
- Una agencia que renombró o recompuso sus roles (sin la clave `DUENO`) **no recibe el permiso**: se
  lo asigna desde Ajustes. Es deliberado (R12) y está probado.
- **Sigue abierto:** T-342 (alcance en el servidor), T-343/T-344/T-485 (web), T-345 con T-483 (CSV),
  T-346 (e2e con dos asesores y dos agencias). H1 y H2 del ADR siguen con el cierre provisional
  de #395 hasta T-342.
