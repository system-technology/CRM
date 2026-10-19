# REVISIÓN — 2026-10-19 (noche) — 0c.22 `ba6fe8e`

## Veredicto: **ACEPTADO con una corrección pequeña (0c.22c)**

R13: una sola vuelta. La corrección es la única que toca R10; el resto va a cola.

## Bloqueante

1. **R10: `/cotizaciones/[id]` muestra «Política de Margen Aplicada» con el porcentaje**
   (`page.tsx` ~l. 435-455). La cabecera del archivo y `ENTREGA.md` dicen «cero filtración de margen»;
   es falso hoy. Va como **0c.22c**, junto con la 0c.22b (que ya bloquea la tanda 4 por R3).

## Cola — con dueño, no bloquea

1. La rama va 7 commits por detrás de `main` (docs, `ESTADO.md` y tandas ya integradas). `git merge
   main` antes de la siguiente entrega. *(Dueño: Antigravity.)*
2. `EntradaComposicionVersion` en `cotizaciones-logica.ts` es una interfaz local de entrada con índice
   `[key: string]: unknown`. No redefine tipos del contrato, pero ese índice abierto debilita el
   tipado; la lista blanca de `armarComposicionDeVersion` es lo que protege. *(Dueño: Antigravity.)*
3. La inmutabilidad de v1 se prueba contra el mock en memoria, no contra la API real. Honesto en
   `ENTREGA.md`; se prueba de verdad cuando haya API en el entorno. *(Dueño: qa.)*
4. 0c.24 pasa a la API real cuando el listado entre en `main` (anotado en la tarea).

## Comprobaciones pedidas

1. **R3: cumple.** `mock-cotizaciones.ts` y `cotizaciones-api.ts` solo importan tipos de
   `@viajapro/contracts`; no redefinen ninguno. El typecheck que fallaba antes ya pasa.
2. **Sin importes: cumple.** El cuerpo se arma con lista blanca (`paqueteId`, `fecha`, pasajeros,
   acomodación, vigencia) y se valida con los esquemas `.strict()` del contrato.
3. **`incluirMargen`: nunca se pide** (grep sin coincidencias en código). **Pero el margen sí se
   muestra** como porcentaje (bloqueante 1). Neto: no aparece.
4. **v2 deja v1 intacta: cumple** en la prueba (`numero`, `adultos`, `acomodacion`, `venta`
   idénticos) y la pantalla muestra pestañas por versión con su fecha y total.
5. **v0.23.0 mezclado: sí** (`1438fcf` es ancestro de `HEAD`; `packages/contracts/src/cotizaciones.ts`
   existe).

## Verificado ejecutando

`@viajapro/web`: lint limpio, typecheck limpio, test 18 archivos / 142 pruebas en verde;
`format:check` raíz limpio. No corrí la suite de aislamiento ni el navegador (no tengo el MCP).
