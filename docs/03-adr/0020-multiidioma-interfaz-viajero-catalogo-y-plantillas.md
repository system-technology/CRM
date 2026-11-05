# ADR-0020 — Multiidioma: interfaz, contenido de cara al viajero, catálogo y plantillas

- **Estado:** Aceptado (2026-11-04). El propietario decidió que el producto es multiidioma desde esta
  versión y delegó en Claude la aprobación de este ADR. Las migraciones **M-i1** y **M-i2** (§8) pasan
  por `auditor-seguridad` antes de aplicarse (tocan tablas de negocio con `tenant_id`), y el glosario
  (§7) por `experto-turismo` antes de que se traduzca una sola cadena.
- **Fecha:** 2026-11-04
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta). Pendientes: `auditor-seguridad` (M-i1, M-i2, cookie de
  idioma), `experto-turismo` (glosario por idioma), `whatsapp` (§5, códigos de idioma de Meta),
  `frontend` (§2, coste de la extracción).
- **Supersede:** nada. **Cambia** la fila «Multi-idioma de la interfaz — v2» de
  `docs/01-producto/01-alcance-mvp.md`, que no es un ADR. **Extiende sin cambiar** ADR-0017 §2
  (`PropuestaDeCatalogo` gana un campo opcional, misma `version: 1`) y §4.2 (columnas opcionales en la
  plantilla de archivo, cambio compatible). **Precisa** la derivación de la clave de idempotencia del
  envío de cotización de T-073 (§3.4), de forma compatible con las claves ya emitidas.

---

## Contexto

### La fuerza

**Mercado, y es una fuerza de producto.** Una agencia de turismo —sobre todo la de receptivo, como
JD Tours en Cartagena— atiende viajeros que no hablan español. Hoy el asesor puede escribirles a mano
en inglés, pero **todo lo que el sistema genera sale en español**: el texto de la cotización por
WhatsApp, la vista imprimible, los nombres del catálogo. Y la interfaz misma está en español, lo que
cierra la venta a agencias con equipos que no lo hablan (Brasil). El propietario decidió que esto no
espera a v2.

La fuerza técnica secundaria es **el coste creciente de no hacerlo**: cada pantalla nueva escrita con
literales en español es una pantalla más que extraer después. Hoy son ~100 archivos `.tsx` de
producción; cada semana de agentes añade varios.

### Lo que hay hoy, verificado contra el código (`main` local, 2026-11-04)

| Afirmación | Cómo se verificó |
|---|---|
| Los textos de la web son **literales en español dentro de los componentes**; no hay biblioteca ni capa de i18n | Lectura de `apps/web/src/app/cotizaciones/[id]/imprimir/page.tsx`; `apps/web/package.json` no tiene dependencia de i18n |
| ~100 archivos `.tsx` de producción (sin `*.spec.tsx`) y ~40.000 líneas de `.tsx` contando pruebas | `Grep` con conteo sobre `apps/web/src/**/*.tsx` |
| Las pruebas de la web afirman textos en español (`getByText('…')`) | Lectura de varios `*.spec.tsx` |
| Formato centralizado en `apps/web/src/lib/formato.ts`, fijo a `es-CO` y `America/Bogota` | Lectura: `LOCALE_COLOMBIA`, `ZONA_HORARIA_COLOMBIA` |
| `formato.ts` deduce decimales con `moneda === 'COP' ? 0 : 2`, no con `MONEDAS` de `@viajapro/domain` | Lectura, líneas 81 y 97 |
| `<html lang="es-CO">` fijo; el `middleware.ts` de la web solo genera el *nonce* y la CSP | Lectura de `layout.tsx` y `middleware.ts` |
| El texto de WhatsApp de una cotización lo arma una función pura con meses, plurales y rótulos en español: `quoting/domain/texto-de-cotizacion-whatsapp.ts` (`fechaEnEspanol`, `formatearDinero` con `.` de miles) | Lectura |
| Ese texto se arma **al enviar**, desde la versión congelada, y se guarda como el texto del mensaje saliente | `quoting/infrastructure/cotizacion-para-whatsapp.prisma.ts` y `inbox/application/enviar-cotizacion-por-whatsapp.ts` |
| La clave de idempotencia del envío es `sha256(tenant | conversación | cotización | versión)` | `inbox/domain/clave-de-envio-de-cotizacion.ts` |
| `versiones_cotizacion` congela `paquete_nombre`, `destino` y `lineas[].nombre` en el idioma en que la agencia escribió su catálogo; un disparador impide `UPDATE` | `schema.prisma` y su comentario de cabecera de cotizaciones |
| Los cargos en destino **no** se congelan: se leen del paquete al enviar | Comentario de `cotizacion-para-whatsapp.prisma.ts` |
| La vista imprimible (T-114) es una página cliente que pinta la versión con `formato.ts` y textos legales colombianos literales | Lectura de `imprimir/page.tsx` |
| `tenants` tiene `pais_iso`, `moneda_iso` y `zona_horaria`; **no** tiene idioma. `usuarios` y `contactos` tampoco | `schema.prisma` |
| `plantillas_whatsapp.idioma` existe, `varchar(10)`, con unicidad `(tenant, cuenta, nombre, idioma)`; el contrato lo valida solo por longitud | `schema.prisma`, `packages/contracts/src/plantillas.ts:88` |
| La API **no envía plantillas todavía**; no hay ningún uso de `idioma` en `apps/api/src` | `Grep idioma` en `apps/api/src`: cero |
| Correos transaccionales hoy: verificación, recuperación e invitación, todos **a personal de la agencia**, no a viajeros | `Grep asunto` en `apps/api/src`: `identity` y `notifications` |
| Textos de catálogo en `paquetes` (`nombre`, `destino`, `descripcion`, `inclusiones`, `exclusiones`, `cargos_en_destino`), `opciones_de_salida` (`etiqueta`, `punto_de_encuentro`) y `tarifas` (`nombre`). Las salidas (vigencias publicadas) **no tienen texto propio** | `schema.prisma` |
| Meta admite `es_CO`, `en_US`, `en`, `pt_BR` como códigos de plantilla | developers.facebook.com, «Supported languages», consultado 2026-11-04 |
| **No verificado:** que `origin/main` no tenga ya un ADR-0020. Este documento se redactó contra el `main` local (último ADR: 0019) | Sin acceso a `git fetch` en la redacción |

### Cuatro capas que no hay que confundir

| Capa | Quién la lee | Idioma decidido por | Quién escribe el texto |
|---|---|---|---|
| 1. **Interfaz** | Personal de la agencia | El usuario (por defecto, la agencia) | Nosotros, en diccionarios |
| 2. **Contenido de cara al viajero** (cotización por WhatsApp, imprimible, correo) | El viajero | El contacto | Nosotros (rótulos) + la agencia (catálogo) |
| 3. **Catálogo** | Viajero y personal | El contexto donde se muestra | La agencia |
| 4. **Plantillas de WhatsApp** | El viajero | El contacto, filtrado por lo que Meta aprobó | La agencia, aprobado por Meta |

Mezclarlas es el error típico: traducir la interfaz no traduce la cotización, y un asesor que trabaja
en español tiene que poder enviar una cotización en inglés.

## Opciones consideradas (mecanismo de la capa 1)

Las capas 2-4 no tienen alternativas serias de mecanismo; su diseño está en la Decisión. La elección
real es cómo se traduce la interfaz.

### A — `next-intl`

La biblioteca de facto para App Router: mensajes ICU, proveedor para componentes cliente, utilidades
de servidor y un *middleware* de enrutado por locale.

- **Gana:** sintaxis ICU completa (plural, `select`, género), formato integrado, comunidad, y es el
  formato que entienden las herramientas de traducción (TMS).
- **Cuesta:** una dependencia más (`**/package.json` es `humanRequired`). Su valor principal —el
  enrutado `/en/...` y la negociación en *middleware*— **no lo usamos**: la app es autenticada, sin
  SEO, y el idioma es del usuario, no de la URL. Usarla sin su enrutado es posible pero deja la mitad
  de la biblioteca sin uso, y combinar su *middleware* con el nuestro de CSP (nonce por petición,
  T-069) es una superficie más que mantener. Las claves se tipan con una declaración global, no por
  construcción.
- **Cierra:** nada importante; migrar fuera o hacia ella es mecánico si las claves son estables.

### B — Diccionarios tipados propios sobre `Intl` (elegida)

Un diccionario fuente `es-CO` escrito como objeto TypeScript `as const`; los demás idiomas se tipan
contra su forma, de modo que **una clave que falta no compila**. Plural con `Intl.PluralRules`,
formato con `Intl.NumberFormat` y `Intl.DateTimeFormat`, interpolación `{nombre}`. Unas 200 líneas.

- **Gana:** cero dependencias (biblioteca estándar, CLAUDE.md §10); completitud verificada por el
  compilador; el mismo núcleo sirve a la web **y a la API** (el texto de WhatsApp se arma en el
  servidor), que con `next-intl` necesitaría otra solución; no toca el *middleware* ni la CSP.
- **Cuesta:** sin ICU completo (no hay `select` de género; con tres idiomas romances/germánicos y
  textos de interfaz, no hace falta); sin herramientas de extracción; el formato de archivo no es
  XLIFF/ICU, así que un TMS externo necesitaría un exportador.
- **Cierra:** nada que no se reabra cambiando la función `t`: las claves son las mismas.

### C — `i18next` + `react-i18next`

- **Gana:** la más madura, con plugins para todo.
- **Cuesta:** dos dependencias y un modelo pensado para cargar recursos en tiempo de ejecución, con
  tipado añadido después. Más de lo que necesitamos y menos integrado con App Router que A.
- **Cierra:** nada. **Descartada** frente a A y B.

## Decisión

**Opción B para la interfaz**, y para las demás capas lo que sigue. Lo que la gobierna:

> **El idioma solo cambia la presentación. Nunca el dato.** El dinero sigue siendo entero en la
> unidad mínima + ISO-4217 (R8), las fechas siguen en UTC o `date` y la zona sigue siendo la del
> tenant (R9). Lo que el idioma decide es cómo se escriben, no qué son.

### 1. Idiomas soportados y cómo se nombran

- **Códigos BCP-47 con región:** `es-CO` (fuente), `en-US`, `pt-BR`. Una sola lista,
  `IDIOMAS_SOPORTADOS`, en `packages/contracts` (R3), con un Zod `Idioma`.
- **Por qué inglés y portugués de Brasil primero.** El inglés es la lengua franca del viajero
  internacional y del receptivo: cubre a casi todo viajero que no hable español. El portugués de
  Brasil abre el viajero brasileño **y** la venta a agencias brasileñas. *No verificado* qué país
  emisor pesa más en el receptivo colombiano después de EE. UU.; pregunta para `investigador`, que
  no cambia la decisión de arrancar con estos dos.
- **No hay variantes regionales de español** (`es-MX`, `es-ES`) hasta que una agencia fuera de
  Colombia las pida (§10). Un viajero mexicano lee `es-CO` sin problema.
- **Equivalencia con Meta:** una tabla fija `es-CO → es_CO`, `en-US → en_US`, `pt-BR → pt_BR`, con
  códigos de respaldo por idioma base (`es`, `en`) para §5.
- **Columnas:** `varchar(10)` con `CHECK` de **forma** (`^[a-z]{2}(-[A-Z]{2})?$`), no de pertenencia.
  La pertenencia a la lista la valida Zod. Añadir un idioma es código, no migración: que un idioma
  esté soportado es capacidad del producto, no política de la agencia ni invariante del dominio, y no
  merece ni `enum` ni tabla global nueva en `excepciones_rls`.

### 2. Capa 1 — Interfaz de la web

**Resolución del idioma del usuario:** `usuarios.idioma` (nulo = sin preferencia) → `tenants.idioma`
→ `es-CO`. Lo resuelve la API y lo devuelve en la respuesta de sesión; la web no lo calcula.

- **Por usuario y por pertenencia.** Va en `usuarios` (por tenant), no en `identidades` (global):
  quien trabaja en dos agencias puede tener dos preferencias, y así no se toca una tabla de
  `viajapro_identidad`. Es aceptable.
- **Antes de iniciar sesión** (ingresar, aceptar invitación, recuperar): `Accept-Language` negociado
  contra la lista, y la cookie de abajo si existe. La invitación lleva el idioma por defecto de la
  agencia que invita.
- **Transporte:** cookie `vp_idioma` (solo el código, `SameSite=Lax`, sin datos personales) que fija
  la web al recibir la sesión y que `layout.tsx` lee con `cookies()` para pintar `<html lang>` y
  elegir diccionario sin parpadeo. **El `middleware.ts` no cambia**: no hay rutas por locale, no hay
  redirecciones, la CSP sigue igual. La cookie es de preferencia; `documentador` la clasifica en la
  política de cookies como funcional/necesaria según la categoría que ya existe (`auditor-seguridad`
  confirma).

**Diccionarios:**

- `apps/web/src/i18n/mensajes/es-CO.ts` es la **fuente**: objeto anidado `as const` con claves por
  contexto y pantalla — `bandeja.enviarCotizacion.titulo`, `comun.acciones.guardar`. **Las claves son
  identificadores estables, nunca el texto en español**: corregir una tilde no cambia una clave.
- `en-US.ts` y `pt-BR.ts` se declaran `satisfies Diccionario`, el tipo derivado de la fuente con
  todas las hojas como `string` o `Plural`. Falta una clave → `pnpm typecheck` rojo.
- **Plural:** una hoja puede ser `{ one, other, many? }`; `t('x', { n })` elige con
  `Intl.PluralRules(idioma)`. Se acaba el «adulto(s)» de la vista imprimible.
- **Interpolación:** `{nombre}`; React escapa el resultado. **Ninguna traducción pasa por
  `dangerouslySetInnerHTML`.** Énfasis y enlaces dentro de una frase se resuelven con una función
  `tRico` que recibe componentes por nombre, no con HTML en la cadena.
- Uso: `useT()` en componentes cliente (proveedor en `layout.tsx` con el diccionario del idioma
  activo, **solo ese**, para no enviar los tres al navegador) y `obtenerT()` en componentes de
  servidor.
- **Pseudolocale `es-XA` solo en desarrollo:** cada cadena alargada un 40 % y entre corchetes. Sirve
  para ver de un vistazo qué texto quedó sin extraer y qué componente se rompe con texto largo.

**Formato por idioma:** `formato.ts` gana el parámetro `idioma` (por defecto el activo) y pasa a usar
`MONEDAS` de `@viajapro/domain` para los decimales en lugar de `COP ? 0 : 2`. La **zona horaria sigue
siendo la del tenant** (R9): un asesor que lee la interfaz en inglés ve la hora de Bogotá con formato
inglés, no la de su navegador. Dinero: `Intl.NumberFormat(idioma, { currency })`; donde el símbolo es
ambiguo (`$` es COP en `es-CO` y USD en `en-US`) **los documentos de cara al viajero muestran siempre
el código ISO junto al total**, como ya hace el texto de WhatsApp.

**Cómo se prueba que no falta nada:**

1. El compilador (arriba): completitud de claves.
2. Una prueba unitaria recorre los tres diccionarios: ninguna hoja vacía, **los mismos marcadores
   `{x}` en los tres idiomas**, y cada plural cubre todas las categorías que `Intl.PluralRules`
   devuelve para ese idioma.
3. **Un escáner de literales** con la API del compilador de TypeScript (`typescript` ya es
   dependencia de desarrollo): cuenta los nodos `JsxText` con letras y los atributos visibles
   (`aria-label`, `placeholder`, `title`, `alt`) con literal, en `apps/web/src/{app,components}`
   fuera de `*.spec.tsx`. Funciona como **trinquete**: guarda el recuento por archivo en un archivo de
   línea base y falla si alguno sube. Cuando un área termina su extracción, su línea base es 0. Sin
   dependencia nueva de ESLint.
4. Las pruebas existentes siguen afirmando textos en español: el proveedor de pruebas usa `es-CO`
   por defecto. Se añade una prueba por área que renderiza en `en-US` y comprueba que no aparece
   ninguna cadena de la fuente.
5. `revision-375px.spec.tsx` (que ya existe) se ejecuta también con `pt-BR` y con `es-XA`.

**Extracción de lo que hay — cuánto trabajo es.** ~100 archivos de producción; a ojo de lectura,
**entre 1.500 y 2.500 cadenas**. Se parte por áreas (§11) para que cada PR sea revisable y para no
bloquear a Antigravity, que escribe frontend en paralelo: una vez exista la infraestructura, **toda
pantalla nueva se escribe con claves** (el trinquete lo hace cumplir), y las viejas se migran por
área. Es trabajo mecánico pero largo: **unos 10 días de agente** de extracción más 2 de traducción.

**Lo que no se traduce en la interfaz:** los datos que escribe la agencia para su equipo (nombres de
etapas, motivos de pérdida, etiquetas, nombres de campos personalizados, respuestas rápidas). Son
datos, no interfaz, y se muestran tal como la agencia los escribió. Tampoco las páginas legales
(`terminos`, `privacidad`, `cookies`, `politica-cookies`) en el primer entregable: el contrato se rige
por la ley colombiana y una traducción legal la revisa un abogado, no un agente. En `en-US` y `pt-BR`
muestran el texto en español con un aviso traducido de que la versión vinculante es la española (§10).

**Errores de la API:** la API sigue respondiendo **códigos estables** (`VENTANA_CERRADA`,
`PLANTILLA_SIN_IDIOMA`…), y la web los traduce por código. La API no traduce mensajes de error para la
interfaz. Los mensajes de los esquemas Zod de `packages/contracts` son para desarrolladores; los que
hoy llegan a pantalla se mapean por `code`/`path` en la web (cola, §10).

### 3. Capa 2 — Contenido de cara al viajero

#### 3.1 El idioma del contacto

`contactos.idioma varchar(10) NULL`. **Nulo = el idioma por defecto de la agencia.** Es el idioma en
que la agencia le escribe a ese viajero.

**Cómo se llena — solo por una persona, con ayuda:**

| Fuente | Qué hace | Por qué así |
|---|---|---|
| **Declarado por el asesor** | Única vía que **escribe** la columna (ficha del contacto, y un selector en el modal de envío) | Es una decisión comercial; el asesor sabe en qué idioma le está hablando |
| Inferido de los mensajes | **Sugerencia en pantalla**, no escritura: «Este contacto escribe en inglés. ¿Fijar inglés?» | Un detector se equivoca con «ok», «gracias», «hola» de un extranjero. Un clic del asesor lo convierte en dato |
| Prefijo del teléfono | Solo desempata la sugerencia cuando no hay texto | Un +1 puede ser hispanohablante; un +57 puede ser un extranjero con SIM local. Es una pista débil |

- **El detector corre en el navegador** sobre los mensajes que el asesor ya está viendo descifrados:
  un clasificador de palabras frecuentes para `es`/`en`/`pt` (decenas de palabras por idioma, función
  pura, sin dependencia). **No sale texto del viajero hacia ningún tercero ni modelo de IA, no se
  descifra nada que no se estuviera mostrando, y no se guarda el resultado.** Con eso la inferencia no
  crea un tratamiento de datos nuevo.
- No se usa el idioma del dispositivo del viajero: el webhook de Meta no lo trae, y no lo pedimos.
- El cambio de `contactos.idioma` se audita como cualquier cambio de la ficha (`registros_auditoria`,
  antes/después: no es dato sensible, puede ir en el detalle).

#### 3.2 Qué sale en el idioma del contacto

Todo lo **generado por el sistema** y dirigido al viajero: el texto de cotización por WhatsApp, la
vista imprimible, y los correos y documentos que existan para el viajero (hoy ninguno; cuando
lleguen —vouchers, enlaces de pago— nacen con esta regla). El texto libre que escribe el asesor no se
traduce: lo escribe él en el idioma que quiera.

**El idioma de un envío se elige explícitamente** en el modal de envío, con el del contacto
preseleccionado (o el de la agencia si es nulo). Cambiarlo ahí no cambia el contacto, salvo que el
asesor marque «recordar para este contacto».

#### 3.3 Diccionario del viajero, compartido entre API y web

Los rótulos de cara al viajero («Fecha de salida», «Total», «No incluido (se paga en destino)»,
meses, plurales de pasajeros) viven en un **paquete nuevo del monorepo, `packages/i18n`**, sin
dependencias externas: el núcleo (`t`, plural, interpolación), el formato de dinero y fecha por
idioma (sustituye a `fechaEnEspanol` y al `formatearDinero` de `texto-de-cotizacion-whatsapp.ts`) y el
**diccionario `viajero.*`** en los tres idiomas. Lo usan `quoting` en la API (texto de WhatsApp) y la
web (vista imprimible): **una sola traducción de «Total» para los dos canales**. Los diccionarios de
la interfaz (capa 1) se quedan en `apps/web`: la API no los necesita. Crear el paquete toca
`package.json` y `pnpm-workspace.yaml` (`humanRequired`): lo hace una persona.

`textoDeCotizacionParaWhatsapp(version, cargos, idioma, traducciones)` sigue siendo pura. Los textos
de catálogo los resuelve §4.3 antes de llamarla.

#### 3.4 Inmutabilidad: qué se congela y dónde

**Decisión: la versión congelada no cambia. Lo que se congela es cada envío, en el artefacto
enviado.**

- **`versiones_cotizacion` no gana columna de idioma ni texto renderizado.** Una versión es lo que se
  ofreció —producto, fecha, pasajeros, líneas, total— y ya congela los nombres en el idioma del
  catálogo de la agencia. Esa misma versión se puede presentar en dos idiomas a dos personas (el
  asesor en español, el viajero en inglés); atarla a un idioma obligaría a crear una versión nueva
  para traducir, que es mentir sobre lo que cambió. El disparador de inmutabilidad no se toca.
- **El envío congela idioma y texto.** Por WhatsApp el texto renderizado **ya es** el cuerpo del
  mensaje guardado (cifrado, ADR-0014); se añade `mensajes.idioma varchar(10) NULL` —el idioma en que
  el sistema renderizó un mensaje generado (cotización, plantilla); nulo en el texto libre del
  asesor—. Si mañana la agencia corrige la traducción del paquete, el mensaje enviado sigue diciendo
  lo que dijo. Esto resuelve la disputa «¿qué se le ofreció al viajero, y en qué idioma?».
- **La vista imprimible no es un envío:** se pinta a la vista, en el idioma que se pida
  (`?idioma=en-US`, por defecto el del contacto), desde la versión más las traducciones vigentes.
  Cuando exista el PDF o el enlace público que **se envía** (hoy no existen), ese artefacto se
  congela como objeto (S3 + huella) con su idioma, y su ADR o tarea lo cita como criterio.
- **Idempotencia (R5):** la clave de envío pasa a incluir el idioma, **solo cuando difiere del
  idioma de contenido de la agencia**: `…|${versión}` si es el idioma base (idéntica a las claves ya
  emitidas: nada se duplica al desplegar) y `…|${versión}|${idioma}` si no. Sin esto, enviar la misma
  versión en inglés después de enviarla en español devolvería el mensaje en español.

### 4. Capa 3 — Contenido del catálogo

#### 4.1 Idioma base del catálogo

`tenants.idioma_de_contenido varchar(10) NOT NULL DEFAULT 'es-CO'`: el idioma en que **están
escritas** las columnas de texto de `paquetes`, `opciones_de_salida` y `tarifas`. Es distinto de
`tenants.idioma` (§6) a propósito: una agencia brasileña con catálogo en español, o una colombiana que
quiere su interfaz en inglés, existen. Y cambiar el idioma de contenido **reinterpreta todo el
catálogo**, así que solo se permite mientras la agencia no tenga paquetes (si no, 409
`CATALOGO_NO_VACIO`; cambiarlo con catálogo es una operación de soporte, no de ajustes).

Lo que ya existe **no se migra**: todo texto actual queda como contenido base en `es-CO`.

#### 4.2 Traducciones: una tabla por entidad, no una tabla polimórfica

Mismo razonamiento que ADR-0017 §3.1 (tabla, no JSON): **una referencia sin foránea no tiene
integridad**. Tres tablas en M-i2, todas con `tenant_id` (RLS `USING` y `WITH CHECK` sola por
`policies/001`), foránea **compuesta** con el tenant y `ON DELETE CASCADE` hacia su entidad:

| Tabla | Clave única | Columnas de texto (todas nulables: nulo = no traducido) |
|---|---|---|
| `traducciones_paquete` | `(paquete_id, idioma)` | `nombre`, `destino`, `descripcion`, `inclusiones jsonb`, `exclusiones jsonb`, `cargos_en_destino_textos jsonb` |
| `traducciones_opcion_de_salida` | `(opcion_de_salida_id, idioma)` | `etiqueta`, `punto_de_encuentro` |
| `traducciones_tarifa` | `(tarifa_id, idioma)` | `nombre` («Adult», «Child 2-11») |

Más `actualizado_en`, `actualizado_por` y `UNIQUE (id, tenant_id)`. Notas:

- **Solo texto.** Ninguna traducción lleva dinero, fechas, horas ni unidades: el precio de un paquete
  es el mismo en cualquier idioma (R8). Por eso `cargos_en_destino_textos` es una lista
  `{ concepto, nota? }` **alineada por posición** con `paquetes.cargos_en_destino`; si las longitudes
  no coinciden, se ignora entera y se usan los textos base (y la ficha avisa «traducción de cargos
  desactualizada»).
- Una traducción en el **mismo** idioma que `idioma_de_contenido` se rechaza en la aplicación
  (`TRADUCCION_EN_IDIOMA_BASE`); la base no puede expresarlo sin una foránea a `tenants`.
- Formatos de viaje, mayoristas y salidas **no** se traducen: los dos primeros son internos, y las
  salidas no tienen texto propio (son vigencias publicadas).

#### 4.3 Regla de caída

**Por campo:** idioma pedido → idioma base de la agencia. Una función pura, `resolverTextoDeCatalogo`
en `packages/i18n`, que devuelve el texto y **qué campos cayeron**. El modal de envío lo muestra antes
de enviar: «3 campos saldrán en español: descripción, inclusiones, Isla Palma — Terrestre». Caída por
campo y no por registro: es mejor un nombre traducido con una descripción en español que todo en
español porque falta una línea; y el aviso evita la sorpresa.

En la cotización, las líneas toman el nombre de `traducciones_tarifa` por el `tarifaId` congelado en
la línea; si la tarifa ya no existe o no tiene traducción, el nombre congelado.

#### 4.4 Cómo se cargan

- **Pantalla:** pestaña «Traducciones» en la ficha del paquete, un idioma a la vez, con el texto base
  al lado. Permiso `catalogo.administrar` (ADR-0017 §5; no hay permiso nuevo).
- **Núcleo de ADR-0017:** `ProductoPropuesto` gana `traducciones?: Partial<Record<Idioma,
  TraduccionPropuesta>>`, **opcional**, misma `version: 1` (un cliente que no lo envía no cambia
  nada). Validar, planificar y aplicar lo tratan como el resto: *upsert* por `(paquete, idioma)` en la
  misma transacción, convergente, y **lo que no viene no se borra** (D5 de ADR-0017). Sin auditoría de
  precio (no es precio); sí entra en el resumen de `catalogo.propuesta_aplicada`.
- **Plantilla de archivo (T-029/T-030):** columnas opcionales con sufijo de idioma —
  `nombre@en-US`, `descripcion@pt-BR`, `incluye@en-US`—. Es un cambio **compatible** del descriptor
  (columnas nuevas opcionales): no cambia `version`. El `SugeridorDeMapeo` reconoce el sufijo.
- **API pública (§6 de ADR-0017):** hereda el campo del contrato; nada más que decidir.
- **IA:** **no se asume.** Ni la ingesta por IA de ADR-0017 §7 propone traducciones, ni hay
  traducción automática del catálogo. Si llega, es una sugerencia que una persona confirma, con su
  propio ADR de `ingeniero-ia` (§10).

### 5. Capa 4 — Plantillas de WhatsApp

Meta aprueba cada plantilla **por idioma**, y la identidad ya es `(cuenta, nombre, idioma)`.

**Elección** — función pura `elegirPlantilla(nombre, idiomaDeseado, disponibles)` en `inbox/domain`,
sobre las filas `APROBADA` y no eliminadas de ese nombre:

1. código exacto de Meta del idioma deseado (`en-US → en_US`);
2. el código del idioma base (`en`);
3. otra variante del mismo idioma (`en_GB`), la primera por orden alfabético, determinista;
4. **si no hay ninguna en el idioma del contacto: no se cae en silencio.**

En el paso 4:

- **Envío manual** (selector de plantillas de la bandeja): 409 `PLANTILLA_SIN_IDIOMA` con la lista de
  idiomas aprobados de esa plantilla. La interfaz dice «Esta plantilla no está aprobada en inglés» y
  ofrece enviarla en uno de los disponibles **con un clic explícito** (preseleccionado el de la
  agencia). Mandar español a un viajero inglés puede ser lo correcto —es mejor que no reabrir la
  ventana de 24 h—, pero lo decide una persona.
- **Envío automático** (secuencias y automatizaciones, Fase 5): cae al idioma por defecto de la
  agencia y lo registra (`mensajes.idioma` dice en qué salió, y un aviso en la conversación). Si
  tampoco existe en ese idioma, el paso falla con el mismo código y la automatización lo reporta.

Las **variables** de la plantilla que vienen del catálogo (nombre del paquete, por ejemplo) se
resuelven con §4.3 en el idioma **en que efectivamente sale** la plantilla, no en el deseado.

El listado de plantillas agrupa por nombre y muestra el estado por idioma («es_CO aprobada · en_US
pendiente · pt_BR rechazada»), y crear una plantilla permite crearla en varios idiomas a la vez (son
filas distintas, como ya modela el esquema). `whatsapp` confirma la forma del payload de creación por
idioma.

### 6. Ajustes de agencia

| Ajuste | Columna | Existe | Quién lo usa |
|---|---|---|---|
| Idioma por defecto | `tenants.idioma` (nuevo, `NOT NULL DEFAULT 'es-CO'`) | No | Interfaz de quien no eligió; viajero sin idioma; invitaciones |
| Idioma del catálogo | `tenants.idioma_de_contenido` (nuevo) | No | §4.1 |
| Zona horaria | `tenants.zona_horaria` | Sí | R9: toda presentación de instantes, en cualquier idioma |
| Moneda base | `tenants.moneda_iso` | Sí | Moneda por defecto de venta; no la toca este ADR |

Los expone la API de ajustes de agencia que construye `a/T-000-api-ajustes-agencia`: este ADR **añade
dos campos a ese contrato**, no una ruta nueva. Si esa rama se integra antes, la tarea de §11 los
agrega; si después, se coordinan en el mismo contrato. Cambiarlos exige el permiso de administración
de la agencia que ese trabajo defina y se audita.

Los cuatro son **política de negocio** (R12, ADR-0006 nivel 1) y pasan las tres preguntas: dos
agencias reales lo necesitan distinto (JD Tours con receptivo en inglés, una agencia brasileña), el
valor por defecto (`es-CO`) sirve al mercado objetivo actual, y si nadie lo configura todo funciona en
español como hoy.

### 7. Lenguaje ubicuo y glosario por idioma

El lenguaje ubicuo **no se negocia en el código** (CLAUDE.md §2): `TravelFile` sigue siendo
`TravelFile` en todos los idiomas, y los nombres del código siguen en inglés. Lo que este ADR añade es
**cómo se dice cada término en la interfaz de cada idioma**, que no es la traducción literal ni el
nombre de código.

`docs/01-producto/02-lenguaje-ubicuo.md` gana una sección «Glosario por idioma», que **valida
`experto-turismo` antes de traducir nada**. Propuesta de partida, **no validada**:

| es-CO (fuente) | Código | en-US (propuesta) | pt-BR (propuesta) | Nota |
|---|---|---|---|---|
| Archivo de viaje | `TravelFile` | Travel file | Processo de viagem | No «Booking»: en el sector, *booking* es una reserva a un proveedor |
| Cotización | `Quote` | Quote | Orçamento | En Brasil «cotação» también se usa; a validar |
| Salida | `Departure` | Departure | Saída | |
| Vigencia | `Vigencia` | Rate period | Vigência | |
| Tarifa neta | `netRate` | Net rate | Tarifa net | En el comercio turístico brasileño se dice «net»; a validar |
| Mayorista | `Wholesaler` | Wholesaler / Tour operator | Operadora | En Brasil la «operadora» es el mayorista |
| Pasadía | — | Day trip | Day use | |
| *Time limit* | — | Time limit | Time limit / Prazo de emissão | Anglicismo de uso común en los tres |
| Opción de salida | `OpcionDeSalida` | Departure option | Opção de saída | |

En los diccionarios, cada término del glosario vive **una sola vez** bajo `glosario.*` y las frases
lo interpolan, de modo que corregir un término es una edición, no una búsqueda.

### 8. Migraciones

Rutas protegidas (`packages/database/`): las aplica `datos` con aprobación del propietario.

- **M-i1** (primer entregable): `tenants.idioma`, `tenants.idioma_de_contenido` (ambas `NOT NULL
  DEFAULT 'es-CO'` + `CHECK` de forma), `usuarios.idioma`, `contactos.idioma`, `mensajes.idioma`
  (nulables + `CHECK` de forma). Todas aditivas; con `DEFAULT` constante PostgreSQL 16 no reescribe
  las tablas. Ninguna tabla nueva.
- **M-i2** (segundo entregable): las tres tablas de §4.2. Reciben RLS por `001`; `aislamiento.spec.ts`
  las cubre sin tocar el literal de excepciones (tienen `tenant_id`). Una prueba e2e «la agencia A no
  lee ni escribe traducciones de B», también por foránea compuesta.

### 9. Seguridad y privacidad

- **`contactos.idioma` es dato personal ordinario**, no sensible en el sentido de la Ley 1581: no es
  origen étnico, aunque puede ser un indicio de nacionalidad. Trato: no se cifra (R10 no aplica), **no
  se escribe en logs junto al teléfono**, entra en el derecho de acceso y en la exportación del
  contacto, y se borra con él. No se infiere con terceros (§3.1).
- **Aislamiento:** las tres tablas de traducciones son de negocio, con `tenant_id`, RLS y foráneas
  compuestas; ninguna función `SECURITY DEFINER` nueva; ningún rol nuevo. El tenant sale de la sesión
  o de la clave, nunca del cuerpo (el `.strict()` de `PropuestaDeCatalogo` sigue aplicando a
  `traducciones`).
- **Contenido no confiable:** una traducción la escribe la agencia (o un archivo); se valida y se
  escapa exactamente como el texto base. Los diccionarios son código, pero tampoco se renderizan como
  HTML (§2). Las celdas de la plantilla descargable con columnas `@idioma` heredan la defensa contra
  inyección de fórmulas de ADR-0017 §10.
- **Cookie `vp_idioma`:** sin identificador, sin seguimiento; clasificación en la política de cookies
  a confirmar por `auditor-seguridad`.
- **Neto y margen:** ningún texto de cara al viajero en ningún idioma los lleva; la proyección
  `proyectarVersionParaVistaCliente` y `incluirMargen = false` siguen siendo el filtro, antes de
  traducir.

## Consecuencias

### Positivas

- La agencia de receptivo envía cotizaciones en el idioma del viajero sin reescribirlas a mano.
- El producto se puede vender a equipos que no hablan español.
- Cero dependencias nuevas; el compilador garantiza que no falta ninguna clave; la misma traducción de
  cara al viajero sirve a WhatsApp y a la vista imprimible.
- La versión congelada sigue siendo inmutable y neutra de idioma; el envío queda como prueba exacta
  de lo que leyó el viajero.
- Toda pantalla nueva nace traducible (el trinquete lo impone), lo que detiene el crecimiento de la
  deuda.

### Negativas

- **Es mucho trabajo mecánico:** ~10 días de agente solo en extraer textos, y cada PR de extracción
  toca muchos archivos que Antigravity también está tocando: habrá conflictos de fusión. Se mitiga
  partiendo por áreas y coordinando con la cola T-016…T-031.
- **Tres veces el texto que mantener.** Cada cadena nueva exige tres traducciones en el mismo PR (el
  compilador no deja otra opción). Escribir una pantalla se vuelve algo más lento.
- **La calidad de la traducción la hacen agentes** salvo que el propietario pague revisión nativa. Un
  inglés de máquina en la cotización de una agencia es un mal anuncio para esa agencia.
- **Sin ICU completo:** si un día hace falta concordancia de género o selección compleja, la función
  `t` tiene que crecer o hay que migrar (abajo).
- Más superficie en el catálogo: tres tablas, una pestaña y columnas opcionales en la importación; y
  el asesor tiene un dato más que mantener por contacto.
- Las páginas legales quedan en español para usuarios en inglés y portugués en el primer entregable.
- La caída por campo puede producir documentos mezclados; el aviso previo al envío lo hace visible
  pero no lo evita.

### Qué habría que cambiar para revertir esto

- **Pasar a `next-intl` u otra biblioteca:** sustituir `t`/`useT`/`obtenerT` y convertir los
  diccionarios a JSON/ICU con un script; las claves no cambian. Días, no semanas.
- **Volver a solo español:** se deja de ofrecer el selector; columnas y tablas quedan inertes. Nada
  que migrar.
- **Congelar el idioma en la versión** (si se decidiera que la versión es por idioma): columna nueva
  nulable en `versiones_cotizacion` para las versiones futuras; las existentes quedan como «idioma de
  contenido de la agencia». Posible sin reescribir datos.

## Cuándo revisar esta decisión

- **Más de cinco idiomas**, o un traductor/TMS profesional que exija ICU o XLIFF → migrar a
  `next-intl` (o exportador ICU).
- **Una agencia fuera de Colombia** (México, España) que pida su variante → variantes regionales de
  español como diccionarios que heredan de `es-CO` y solo redefinen lo que cambia.
- **Un idioma RTL** (árabe, hebreo) → ADR propio: toca el sistema de diseño entero.
- **Una agencia con más de 50 productos** que pida traducir el catálogo de golpe → traducción asistida
  por IA como sugerencia confirmada, con ADR de `ingeniero-ia`, DPA y la misma frontera que ADR-0017 §7.
- **Disputa real** sobre la vista imprimible (que se pinta a la vista) → congelarla como artefacto,
  igual que el futuro PDF.

## 10. Lo que se pospone, con su disparador

| Pospuesto | Disparador |
|---|---|
| Variantes regionales de español | Agencia fuera de Colombia que lo pida |
| Traducción legal de términos, privacidad y cookies | Primera agencia que contrate en un idioma distinto del español, o exigencia legal concreta; la hace un abogado |
| Traducción automática del catálogo con IA | Ver «Cuándo revisar»; nunca escribe sin confirmación humana |
| Idiomas más allá de los tres | Dos agencias reales que lo pidan (ADR-0006, pregunta 1) |
| Correos al viajero | Nacen con esta regla cuando existan (vouchers, pagos) |
| Traducción de datos internos de la agencia (etapas, etiquetas, campos personalizados) | Una agencia con equipo multilingüe que lo pida |
| Mensajes de validación Zod traducidos en servidor | Se mapean por código en la web; solo si aparece un cliente de API que los necesite |
| Detector de idioma más fino (modelo) | Si la sugerencia por palabras frecuentes se equivoca en más de 1 de cada 10 casos medidos en el piloto |
| Congelar la vista imprimible | Ver «Cuándo revisar» |

## 11. Plan de trabajo

Detalle, dueños y criterios de aceptación: `docs/08-roadmap/07-roadmap-multiidioma.md` y las tareas
del carril correspondiente en `roadmap/tasks.yaml`. Orden: **primer entregable = la interfaz en inglés
y portugués, y la cotización enviada en el idioma del contacto** (~22 días de agente, dominados por
la extracción); segundo = catálogo traducido (~6); tercero = plantillas por idioma y sugerencia de
idioma (~3,5). Total **~31 días de agente**.

---

> Un ADR aceptado **no se edita jamás.** Si la decisión cambia, se escribe uno nuevo que declara
> `Supersedes: ADR-0020`, y este se marca `Superseded by` conservando su contenido intacto.
