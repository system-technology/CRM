# REVISIÓN — 0c.34 `0dad07c`

## Veredicto: **CASI. Reabierta por dos `catch` en `crm-api.ts`; el resto está aceptado**

La siguiente sigue siendo la 0c.34, pero ahora son dos líneas; después, la 0c.30 (restos).

### Bloqueante (para el primer despliegue)

`crm-api.ts` conserva dos `try/catch` con salida al mock con el interruptor **encendido**:
`obtenerTableroPipeline` (~l. 114-122) y `obtenerFichaDeContacto` (~l. 163-169). Relanzan solo si el
error es `CrmApiError`; con un `ZodError` (la API responde 200 con una forma que el contrato no acepta)
caen al mock, y `pipeline/page.tsx` marca `setEsModoSimulado(false)`, o sea, el tablero falso se pinta
como real. Los fallos de red y 500 ya no llegan ahí (`pedirCrm` los envuelve en `CrmApiError`), por eso
las pruebas pasan; **ninguna prueba cubre una respuesta 200 malformada**.

### Comprobado

1. **Mocks solo con interruptor apagado:** `cotizaciones-api.ts` (4 funciones) e `inbox-api.ts` (6):
   correcto, sin `catch` que devuelva mock. `crm-api.ts`: `moverOportunidadDeEtapa` y
   `listarContactos` correctas; las otras dos, el bloqueante de arriba.
2. **Guardar y añadir versión con la API caída: cumple.** `cotizador/page.tsx` cierra el modal y navega
   solo tras el `await` correcto; el `catch` pinta el error y conserva el formulario; añadir versión
   igual (`setErrorModificar`).
3. **Pruebas:** las nuevas de `crm-api`, `inbox-api` y `cotizaciones-api` sí simulan `fetch` rechazado
   y 500 y comprueban `rejects` (no son solo el camino feliz), más el caso con el interruptor apagado.
   Falta el 200 malformado.
4. **Mocks iniciales:** `pipeline` y `contactos` empiezan con el mock en el `useState`, pero ante un fallo
   pintan el error accionable (`errorCarga` / `error` van antes que los datos), no el mock. El «demo
   forzado» del pipeline es una decisión explícita del asesor. Correcto.

### Ejecutado

Web: lint, typecheck (ahora limpio), `format:check` y 203 pruebas en 22 archivos, todo en verde.

---

# REVISIÓN — 0c.30 `ce1727f`

> ## LA SIGUIENTE ES LA 0c.34, SIN EXCEPCIÓN
> La 0c.34 era **PRIORITARIA y primera**, y se hizo antes la 0c.30. Con la API caída, «Guardar
> cotización» hoy muestra «guardada» con datos simulados (`cotizaciones-api.ts` cae al mock en silencio
> en guardar, añadir versión, consultar y listar; y `crm-api.ts` / `inbox-api.ts` por comprobar). **Eso
> bloquea el primer despliegue.** No se coge ninguna otra tarea antes. La 0c.30 se solapa con ella: las
> dos deciden qué ve el asesor cuando la API real falla, así que el error de la 0c.34 debe pasar por
> `clasificarError`/`AvisoErrorAccionable` de la 0c.30. La 0c.30 no tocó `cotizaciones-api.ts`: no
> adelantó nada de la 0c.34.

## Veredicto 0c.30: **ACEPTADA EN PARTE.** El «Hecho cuando» no se cumple del todo; los restos van a la cola

### Bloqueante

Ninguno propio de la 0c.30 (el bloqueante del despliegue es la 0c.34).

### Cola — con dueño (Antigravity; hazlos junto con la 0c.34, mismo código)

1. **Quedan mensajes crudos pintados**, con `git grep`:
   - `components/bandeja/lista-conversaciones.tsx` l. 81, 83 y 149: `setError(\`[${e.code}] ${e.message}\`)`
     y `e.message`. **Es la lista de la pantalla principal.**
   - `lib/cotizaciones-logica.ts:192` y `lib/cotizador-logica.ts:173`: el caso desconocido devuelve
     `error.message` tal cual como `mensaje`.
2. **La clasificación puede esconder lo que el asesor necesita.** `clasificarError` busca palabras
   («409», «conflicto», «inválido», «no existe», «tenant») **antes** de mirar si el texto ya es un error
   de dominio redactado, así que «El contacto no existe» o «Versión inválida: …» se convierten en el
   genérico «Datos inconsistentes» / «Recurso no disponible». `SIN_VIGENCIA` sí sigue diciendo qué
   pasa, pero porque `cotizador-logica.ts` lo trata antes de llegar aquí, no por `clasificarError`.
   Arreglo: tabla por **código de dominio** (`SIN_VIGENCIA`, `VIGENCIAS_EMPATADAS`, …) primero, y las
   palabras clave solo como último recurso.
3. En la prueba de `estados-ui-logica.spec.ts` falta un caso «409 de dominio conserva su texto».

### Verificado

- **Ejecutado:** lint limpio y 177 pruebas en verde. **Typecheck y `format:check` fallan, pero solo en
  archivos sin commitear de Antigravity** (`cotizaciones-api.ts` l. 82, `crm-api.ts` l. 73: `unknown` no
  asignable a `Record<string, unknown>`; Prettier en `crm-api.ts` y `pipeline/page.tsx`): es el trabajo en
  curso de la 0c.34, no el commit `ce1727f`. Lo commiteado no los provoca.
- `git pull` falló: `github.com:443` inalcanzable desde esta sesión (ver mensaje del push).

---

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

---

# REVISIÓN — 0c.25 `9da2b68`

## Veredicto: **ACEPTADA**, sin bloqueantes nuevos

## Cola — con dueño

1. **R10, anterior a esta entrega y ya en `main`:** `reportes/page.tsx` muestra «Costo Neto Mayoristas»
   y «Margen Comercial (%)» con un comentario «Solo Dueño» sin control de rol. No lo introdujo la
   0c.25 (el diff solo reindenta). Amplié la 0c.27 para incluirlo; mientras no exista el permiso, el
   dueño de producto debe decidir si se oculta ya. *(Dueño: dueno-de-producto.)*
2. **Mensajes crudos:** `err.message` se pinta al asesor en bandeja, catálogo y contactos, y
   `estados-ui-logica.ts` lo incrusta en el texto. Los errores de red sí se clasifican, el resto no.
   Es la 0c.30. *(Dueño: Antigravity.)*
3. La tabla de `ENTREGA.md` marca «Cumple» en 27 de 27 celdas, sin capturas; en `configuracion` y
   `viajes` la carga es «sin spinners» y no un esqueleto. Aceptable, con la 0c.26 como evidencia.
4. `ENTREGA.md` cuenta un `test` rojo en `aislamiento.spec.ts` por tablas de ADR-0011 en la base Neon
   compartida; no es de `apps/web` ni de esta entrega. *(Dueño: datos.)*

## Verificado

- **R3:** `reportes/page.tsx` y `viajes/page.tsx` no exportan tipos; el único tipo nuevo,
  `MensajeErrorDetallado`, es de la maqueta de estados de UI y no existe en los contratos.
- **Ejecutado:** web lint y typecheck limpios, test 21 archivos y 172 pruebas, `format:check` limpio.
  Sin navegador ni suite de aislamiento.

---

# REVISIÓN — 0c.26 `e3f4fa5`

## Veredicto: **DEVUELTA EN PARTE.** Objetivos táctiles aceptados; la evidencia contradice «sin desborde»

## Bloqueante (solo para cerrar la 0c.26; no detiene la integración del resto)

Miré las cuatro capturas con la vista. Todas miden de verdad 375 x 812, pero **el contenido se sale
por la derecha en tres**, lo que contradice `ENTREGA.md` («cero desbordes», `body.scrollWidth === 375`):

- `07-catalogo-salida-375px.png`: el badge «datos demo…» y el enlace «Pro…» cortados; la tarjeta de
  salida sin borde derecho; «Tarifa desde: $» con el importe fuera de pantalla.
- `08-ventana-24h-cerrada-375px.png`: la cabecera («+57300009876…», «24h Cerrada»), la hora «05:51», el
  texto de «Ventana de 24 horas cerrada…» y el botón «Usar borrado…» cortados. **El botón clave de
  0c.19 no se ve entero.**
- `10-cotizador-375px.png`: la tarjeta de parámetros y los campos de pasajeros sin borde derecho; el
  texto del paquete en el selector cortado.
- `09-pipeline-375px.png`: el kanban hace scroll interno (correcto, hay barra propia), pero el filtro
  «Todos…» de la cabecera también se corta.

Es el criterio 3 de la 0c.21 («funciona a 375 px»), marcado «Cumple», y hoy no se cumple. Nueva tarea
**0c.33**.

## Cola

1. La barra inferior de navegación tapa el pie de contenido (en `10-cotizador` los botones de abajo
   quedan detrás de ella): falta `padding-bottom` del alto de la barra. *(Dueño: Antigravity, 0c.33.)*
2. El botón flotante «N» es del modo desarrollo de Next, no del producto; ignorado.

## Verificado

- **Peso:** 36.8, 32.8, 42.1 y 37.0 KB; todas muy por debajo de 200 KB.
- **Neto y margen:** ninguna captura los muestra; solo venta, totales de etapa y «Tarifa desde».
- **Pantallas:** coinciden con la 0c.26 (catálogo, ventana 24 h cerrada, pipeline, cotizador).
- **Ejecutado:** web lint y typecheck limpios, 172 pruebas, `format:check` limpio.

---

# REVISIÓN — 0c.33 `4b69971` (cierra 0c.26)

## Veredicto: **ACEPTADA.** 0c.26 y 0c.33 en `[x]`

Sin bloqueantes. Abrí otra vez las cuatro PNG y comparé con las de antes:

- `07` catálogo: tarjeta, badge «4D/3N» y «Tarifa desde $ 1.340.000 por persona» enteros; filtros y
  «Probar API Real» visibles.
- `08` ventana de 24 h: cabecera completa («Cerrada» y los dos botones), horas visibles, y el botón
  «Usar borrador en plantilla» ocupa el ancho de la tarjeta, entero y táctil.
- `09` pipeline: el filtro «Todos los asesores» entero; el kanban solo desplaza dentro de su
  contenedor (las columnas siguientes asoman a propósito, con su barra).
- `10` cotizador: tarjeta con borde derecho, contadores `- 2 +` completos; el selector de paquete
  recorta el texto con elipsis dentro de su caja, que es correcto.
- Las cuatro miden 375 x 812 y pesan 36 a 41 KB. Sin neto ni margen.

## Cola

1. La barra inferior sigue cubriendo el pie en `07`, `09` y `10` (el botón morado del cotizador queda
   detrás): es una captura en el punto de scroll cero, y la página sí tiene espacio al final; solo
   confirma con una captura al fondo del scroll cuando toques esas pantallas. *(Antigravity.)*

## Verificado

Web lint y typecheck limpios, 172 pruebas en verde, `format:check` limpio. La rama quedó 40 commits por
delante tras fusionar `main`; sin conflictos pendientes. Abiertas: 0c.27 a 0c.32.

---

# REVISIÓN — 0c.28 `cba69d7`

## Veredicto: **ACEPTADA**, sin bloqueantes

1. **R3: cumple.** `git grep` no encuentra `PaginaResultado`, `paginarItems` ni ninguna redefinición de
   `ListarCotizaciones`, `FilaDeCotizacion` o `PaginaDeCotizaciones`: se importan de
   `@viajapro/contracts` y se validan con sus esquemas Zod (`EsquemaPaginaDeCotizaciones.parse`). Queda
   `ResumenVisualCotizacion` como modelo de vista derivado de la fila; es de la pantalla, no del contrato.
2. **Cursor: cumple.** `nextCursor` / `hasMore` en estado, botón «Cargar más cotizaciones»; ya no hay «Página N de M».
3. **Filtros: coinciden** con el contrato (`cursor`, `limite`, `estado`, `contactoId`, `desde`, `hasta`),
   los nombres exactos. La pantalla solo ofrece el filtro de estado; el resto está en la función.
4. **`incluirMargen`: nunca se envía** (grep: solo aparece en comentarios que lo prohíben).

## Cola — con dueño

1. **La búsqueda por texto filtra solo las filas ya cargadas**, no el servidor; con cursor, «sin
   resultados» puede ser falso si quedan páginas. Mostrar «Buscando en las N cargadas; carga más» o pedir
   al backend un filtro de texto. *(Dueño: Antigravity; backend si se quiere filtro de servidor.)*
2. **Con la API real activa, si falla cae en silencio al mock** (solo `console.warn`): el asesor vería
   cotizaciones simuladas como si fueran suyas. El patrón viene de antes, pero en un listado es más
   grave; debe mostrar el error accionable de la 0c.25 y no datos falsos. *(Dueño: Antigravity.)*
3. El mock ignora `desde`/`hasta`, y `listarCotizacionesApi` tiene dos bloques de comentario seguidos.
   Cosmético.

## Verificado

Web lint y typecheck limpios, test 21 archivos y 171 pruebas, `format:check` limpio. **No levanté la API
ni hice un GET real contra Neon**: no está verificado el listado contra el servidor.
