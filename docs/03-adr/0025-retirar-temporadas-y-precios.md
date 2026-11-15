# ADR-0025 — Retirar `Temporada` y `Precio`: el precio vive solo en vigencias y tarifas

- **Estado:** Propuesto
- **Fecha:** 2026-11-15
- **Decide:** propietario, a propuesta de `datos`
- **Consultados:** `datos`. Pendientes: `arquitecto` (forma), `frontend` (ficha del paquete),
  `auditor-seguridad` (dos tablas con RLS que desaparecen; `aislamiento.spec.ts` y
  `verificar-fronteras.mjs` las listan)
- **Tarea:** T-180 (hallazgo A9 de la auditoría integral del 2026-11-15). Continúa
  [ADR-0009](0009-salida-programada-como-unidad-de-venta.md) y
  [ADR-0017](0017-catalogo-gestionable-por-la-agencia.md)

---

## Contexto

ADR-0009 (revisión 2) decidió que `Temporada` no se retiraba como **concepto** sino que se
**generalizaba** a `Vigencia`, y que el precio pasaba de `Precio` (matriz fija acomodación × tipo de
pasajero) a `Tarifa` (condición declarativa y abierta). ADR-0017 marcó `CrearTemporada` y
`CrearPrecio` como `@deprecated`. Desde entonces el cotizador (`CotizarSalidaUseCase`), el
importador, la gestión por id, el historial de precios y la semilla del catálogo real leen y
escriben **solo** `vigencias`/`tarifas`.

Las tablas físicas `temporadas` y `precios` siguieron vivas. Consecuencia, encontrada en la
auditoría integral (A9): los tres paquetes con hotel de la semilla (San Andrés, Cartagena, Punta
Cana) estaban cargados en `temporadas`/`precios` y **no se podían cotizar**; eran justo los que
ejercitan acomodación, menor con edad de corte e infante gratis. T-180 ya los migró en la semilla a
vigencias y tarifas. Queda decidir qué se hace con las tablas.

**Estado verificado el 2026-11-15 (grep sobre `apps/` y `packages/`).** Las tablas **todavía tienen
lectores**, así que no se pueden borrar hoy:

| Quién | Qué usa |
|---|---|
| `apps/api/.../listar-paquetes.use-case.ts` (`detalle`) | `GET` del detalle de paquete incluye `temporadas` con sus `precios` |
| `packages/contracts/src/catalogo.ts` | `Temporada`, `CrearTemporada`, `CrearPrecio` (los dos últimos `@deprecated`) |
| `apps/web` (`ficha-detalle-paquete.tsx`, `catalogo/page.tsx`, `mock-catalogo.ts`) | pinta `paquete.temporadas` |
| `apps/api/.../identity.e2e-spec.ts`, `quoting/paquetes-sin-margen.e2e-spec.ts` | crean filas en `temporada`/`precio` como fixture |
| `scripts/verificar-fronteras.mjs` | lista `temporadas` y `precios` como tablas de `quoting` |
| `packages/database/tests/aislamiento.spec.ts` | las recorre como cualquier tabla de negocio con RLS |

Nada **escribe** en ellas fuera de fixtures de prueba: la semilla dejó de hacerlo con T-180, y no hay
ruta de alta.

## Opciones consideradas

### A — Borrar las tablas ya
- **Gana:** una sola fuente de verdad del precio desde hoy.
- **Pierde:** rompe el detalle de paquete de la API y la ficha de la web, dos e2e y el verificador
  de fronteras en el mismo cambio, que además toca rutas de otros dueños (web, `scripts/`).

### B — Dejarlas para siempre, sin escritores
- **Gana:** nada que hacer.
- **Pierde:** dos modelos de precio en el esquema. El siguiente que lea `schema.prisma` encuentra
  `Precio` con un comentario que dice «aquí está la trampa del dominio» y lo usa. Eso es exactamente
  lo que dejó la semilla sin cotizar.

### C — Retirarlas en tres pasos, con los lectores primero (elegida)

## Decisión

**Se retiran `Temporada` y `Precio` (tablas `temporadas` y `precios`). El precio vive solo en
`Vigencia` + `Tarifa`.** En tres pasos, cada uno integrable por separado:

1. **Congelar (hecho con T-180).** Nadie escribe: la semilla siembra vigencias y tarifas. Los
   contratos `CrearTemporada`/`CrearPrecio` siguen `@deprecated`. No se añade ningún escritor nuevo.
2. **Quitar los lectores.** El detalle de paquete deja de incluir `temporadas` y expone las
   vigencias con sus tarifas (con el neto solo bajo `incluirMargen`, como hoy). La ficha de la web
   pasa a pintar vigencias. Los dos e2e cambian sus fixtures a vigencia + tarifa. Se borran
   `Temporada`, `CrearTemporada` y `CrearPrecio` de `contracts`.
3. **Borrar las tablas**, en una migración nueva y solo cuando el paso 2 esté en `main`:
   - `DROP TABLE "precios"`, luego `DROP TABLE "temporadas"` (la foránea va de `precios` a
     `temporadas`); quitar los modelos y la relación `Paquete.temporadas` del esquema.
   - Antes del `DROP`, un cinturón que **aborta si alguna de las dos tiene filas** de una agencia
     que no sea de fixture: con datos de una agencia real el `DROP` no se hace a ciegas, se migra
     primero a tarifas (misma correspondencia que la semilla, abajo).
   - Quitar las dos tablas de `verificar-fronteras.mjs` y de cualquier declaración por datos
     (privilegios declarados, auditoría) que las nombre; el cinturón de aislamiento
     (`tablas_sin_aislamiento`) debe seguir vacío.
   - El tipo `tipo_pasajero` y `acomodacion` **no** se borran: los usa `tarifas`.

**Correspondencia temporada/precio → vigencia/tarifa** (la que aplicó la semilla y la que aplicaría
una migración de datos si hiciera falta):

| `temporadas` / `precios` | `vigencias` / `tarifas` |
|---|---|
| temporada (`desde`, `hasta`) | vigencia de rango, `publicada = false` |
| `temporada.nombre` («Temporada baja») | se pierde: `vigencias` no tiene nombre (ver Negativas) |
| precio | tarifa `POR_PERSONA`, `cubre_pasajeros = 1`, `aditiva = false` |
| `acomodacion`, `tipo_pasajero`, `edad_minima`, `edad_maxima` | los mismos campos, ahora nulables |
| `neto_unidades`, `venta_unidades`, `moneda_iso` | los mismos |
| mayorista del paquete | `tarifas.mayorista_id` |

Una temporada que cae dentro de otra (Puente de Reyes dentro de la alta) no necesita nada especial:
`resolverVigencia` elige la más corta.

## Consecuencias

### Positivas
- Un solo modelo de precio. Lo que se siembra, se importa o se edita es lo que se cotiza.
- Dos tablas menos bajo RLS: menos superficie de aislamiento que vigilar.
- El detalle de paquete muestra lo que el cotizador realmente usa, en vez de una matriz que ya no
  manda.

### Negativas
- `vigencias` no tiene nombre: «Temporada baja» o «Puente de Reyes» desaparece de la ficha. Si la
  agencia lo echa de menos, se añade `vigencias.etiqueta` nulable (migración aditiva), no se
  resucita `temporadas`.
- El paso 2 toca web, contratos y e2e de otros dueños: hay que coordinarlo.
- El `DROP` es **irreversible** en datos (ver abajo).

### Qué habría que cambiar para revertir esto
- Pasos 1 y 2: revertir los commits; no hay pérdida de datos.
- Paso 3: el `DROP TABLE` no se deshace. La reversión es recrear las dos tablas con la migración
  inicial y sus foráneas compuestas (`20261019220000`), y repoblarlas desde `tarifas` con la
  correspondencia inversa (solo las tarifas con `acomodacion` y `tipo_pasajero` no nulos caben en la
  matriz vieja). Por eso el cinturón del paso 3 aborta con datos reales.

## Cuándo revisar esta decisión

- Si una agencia necesita nombrar sus temporadas: `vigencias.etiqueta`, no volver atrás.
- Si al quitar los lectores aparece uno que no estaba en la tabla de arriba: se añade al paso 2 y se
  vuelve a verificar con grep antes de la migración del paso 3.
