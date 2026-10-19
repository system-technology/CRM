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

---

# REVISIÓN — 0c.22c `fba0c96` y 0c.23 `7f38955`

## Veredicto: **ACEPTADAS**, sin bloqueantes

0c.22c: aceptada por el coordinador. 0c.23: la maqueta cumple (1) y (2); (3) cumple a medias y va a la
cola como 0c.29, que no bloquea.

## Cola — con dueño

1. **Forma frente al ADR-0011:** la maqueta tiene correo y contraseña, pero no el paso del código por
   correo ni el selector de agencia, y la ruta es `/iniciar-sesion` cuando el ADR fija `/ingresar`.
   Es la 0c.29. *(Dueño: Antigravity.)*
2. **Interruptor apagado:** la redirección a `/bandeja` es de cliente (`useEffect` + `router.replace`),
   y la ruta existe y se compila; no hay nada de la maqueta en el DOM salvo una pantalla de espera.
   Aceptable para una maqueta; en 0c.29 pasa a servidor.
3. Encoladas 0c.27 (ocultar neto y margen, espera al permiso) y 0c.28 (listado a la API real, espera
   a `feat/quoting-listado-y-estados`).

## Verificado

- **Sin credenciales guardadas:** grep de `localStorage`, `sessionStorage`, `document.cookie` y
  `fetch(` en la pantalla y en `auth-maqueta-logica.ts`: cero coincidencias. La contraseña solo pasa
  por `simularInicioSesion`, que no sale del navegador.
- **Interruptor:** `NEXT_PUBLIC_AUTH_MAQUETA`, apagado por defecto; apagado redirige a `/bandeja`.
- **Ejecutado:** `@viajapro/web` lint y typecheck limpios, test 19 archivos y 149 pruebas en verde,
  `format:check` limpio. No corrí navegador ni la suite de aislamiento.

---

# REVISIÓN — 0c.24 `21dfcab`

## Veredicto: **ACEPTADA**, sin bloqueantes

## Cola — con dueño

1. **Paginación por número de página, en el cliente** (`paginarItems`, «Página N de M»), no por cursor
   como el contrato `ListarCotizaciones` de `feat/quoting-listado-y-estados` (`e96e0ff`). Es provisional
   y la 0c.28 lo sustituye; ahora dice explícitamente «borrar los tipos locales e importar de
   `@viajapro/contracts`». `PaginaResultado` y `ResumenVisualCotizacion` no llevan comentario que
   apunte al contrato: añade uno de una línea. *(Dueño: Antigravity, 0c.28.)*
2. El listado no usa `FilaDeCotizacion`; deriva de `CotizacionGuardada` (que sí está en `main`).
   Su resumen incluye `contactoNombre` y `destino`, que la fila del contrato no trae. En 0c.28 el
   nombre del contacto se resuelve aparte o se omite. *(Dueño: Antigravity.)*

## Verificado

- **R3:** no redefine `FilaDeCotizacion`, `PaginaDeCotizaciones` ni `ListarCotizaciones`; el estado sale
  de `CotizacionGuardada['estado']`.
- **Estados:** BORRADOR, ENVIADA, ACEPTADA, RECHAZADA y VENCIDA, idénticos a `EstadoCotizacion` de
  `main` y de `e96e0ff`.
- **R10:** la pantalla y el resumen solo exponen `venta` (`totalUnidades`); sin neto, margen ni
  `politica` en el DOM (grep sin coincidencias en `page.tsx`).
- **Ejecutado:** web lint y typecheck limpios, test 20 archivos y 160 pruebas, `format:check` limpio.
  Sin navegador ni suite de aislamiento.
