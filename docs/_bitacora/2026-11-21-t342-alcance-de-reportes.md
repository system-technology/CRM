# 2026-11-21 — T-342: el alcance de los reportes lo impone el servidor

> Rama `a/T-342-alcance-de-reporte`, carril `a` (API). Base: `main` en `3a494cd2`.
> Decisión de referencia: [ADR-0035](../03-adr/0035-niveles-de-acceso-a-reportes.md) §1, §2, §4 y §9.
> Es **autorización**: no se recortó ninguna vuelta de revisión (R13).

## Qué se hizo

**Una sola función decide el alcance.** `apps/api/src/shared/autorizacion/alcance-de-reporte.ts`
devuelve `{ nivel: 'AGENCIA', asesorId: string | null }` o `{ nivel: 'PROPIO', asesorId: string }`
a partir de la **sesión**, nunca del parámetro del cliente. Los tres puertos de
`puertos-de-reportes.ts` lo reciben como argumento obligatorio: un puerto nuevo no compila sin él,
que es la forma de que nadie se olvide del alcance (§9.1).

**El contrato del resumen es una unión discriminada por `alcance`.** En `packages/contracts` nacen
`ResumenPropio` y `ResumenDeAgencia`, los dos `strict()`, y `ResumenDeReportesPorAlcance` los une.
El caso de uso **valida su propia salida** con esa unión antes de devolverla (§9.3): el día que
existan métricas solo de administración (embudo por cohorte, comparación entre asesores, cobros de
la agencia), una de esas claves en una respuesta propia falla en la prueba y no en producción.

**403 y no silencio.** `asesorId` ajeno sin `reportes.ver_agencia` responde `403 PERMISO_DENEGADO`
en el resumen, y sin `conversaciones.ver_todas` también en `GET /crm/seguimientos` y
`/seguimientos/pendientes-del-dia`. Esto **cambia** lo que entregaba #395, que lo ignoraba en
silencio. El 403 no es un oráculo de existencia: se decide sin mirar la base, así que es idéntico
con un compañero, con un id inexistente y con uno de otra agencia. Pedirse a uno mismo (por id o
con `yo`) sigue permitido, y un `asesorId` mal formado es 400 para todo el mundo, antes de mirar
permisos.

**Se retiró el gate provisional de #395** del resumen: ya no exige `conversaciones.ver_todas`.
Cualquier miembro entra y ve lo suyo; el permiso decide **qué filas**, no si puede entrar.

**Atribución (§2).** Cotizaciones y ventas por `cotizaciones.creado_por`; oportunidades por
`oportunidades.asesor_id`; M9 (primera respuesta) por `mensajes.autor_id`, el autor del primer
saliente humano, porque `primera_respuesta_en` no guarda autor.

## Lo que apareció por el camino y hubo que arreglar

**`cotizaciones.creado_por` existía y nadie la escribía.** La columna estaba en el esquema desde
siempre, con su relación, pero `CotizacionesUseCase.guardar` nunca la rellenaba. Atribuir por ella
sin escribirla habría dejado el resumen propio de **todos** los asesores en cero: una pantalla
«Mis números» vacía y sin explicación. Entra en esta misma rama (`creadoPorId: usuarioId`). Las
cotizaciones anteriores quedan sin autor: no son «propias» de nadie y solo entran en los reportes
de agencia, igual que los archivos sin responsable del §2 del ADR. No hace falta relleno: no hay
nada desplegado.

**La hermana `actualizado_por` sigue sin escribirse.** No la usa ningún reporte, así que no
bloquea: va a la cola como **T-514**.

## Decisión incómoda: el contrato entra en dos piezas

El carril `a` no toca `apps/web`, y la web de hoy construye resúmenes sin `alcance`. Un
discriminante obligatorio rompía su compilación, que es un check requerido. Siguiendo la regla de
la casa (campo nuevo **opcional de forma transitoria**, y la web en un PR encadenado), el nombre
`ResumenDeReportes` queda como alias permisivo **solo para lo que la web importa**; el servidor
declara y valida `ResumenDeReportesPorAlcance`. Cuando T-343 lea `alcance`, el alias se borra:
**T-513**.

## Qué NO se verificó

- **Las e2e no se corrieron en local.** Esta sesión no puede levantar Postgres; las corre el CI.
  Sin verificar en local, pendiente del CI: `reportes.e2e-spec.ts` (dos asesores y dos agencias),
  `seguimientos-por-asesor.e2e-spec.ts` (403 en vez de silencio) y
  `respuesta-grupo-coherente.e2e-spec.ts`.
- Sí se corrieron aquí, en verde: `typecheck` y `lint` del monorepo, las 1590 pruebas unitarias de
  la API, las 199 de contratos y las 1821 de la web.
- La pantalla no se probó: la web no lee `alcance` todavía (T-343, T-485).

## Cola que deja

| Tarea | Qué |
|---|---|
| **T-513** | Retirar el alias transitorio `ResumenDeReportes` cuando la web lea `alcance` |
| **T-514** | `cotizaciones.actualizado_por` no se escribe nunca |

Las de la §Cola del ADR (T-490 a T-493) ya estaban registradas y no cambian.
