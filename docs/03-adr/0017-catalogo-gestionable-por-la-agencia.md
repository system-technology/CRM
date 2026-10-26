# ADR-0017 — El catálogo lo gestiona la agencia: alta, edición e importación sin programador

- **Estado:** Propuesto
- **Fecha:** 2026-10-26
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta). Pendiente de pasar por `auditor-seguridad` (toca escritura
  bajo RLS, permisos y una vía de entrada masiva) y por `experto-turismo` (precio de lista, cargos en
  destino, excursiones de un día).
- **Supersede:** nada. Extiende ADR-0006 (inventario de lo configurable) y ADR-0009 (forma del
  catálogo) sin cambiar ninguna de sus decisiones. Ver §8.

---

## Contexto

### La fuerza

**Velocidad de incorporación de agencias, y es una fuerza de producto, no técnica.** El propietario
fijó como innegociable que el CRM sirva a cualquier agencia de turismo y que el catálogo no sea una
limitación. Hoy lo es, y no por el modelo sino por la **vía de entrada**: cada agencia nueva necesita
a un programador que escriba una semilla. Con eso el producto no se puede vender a la segunda agencia
sin que el equipo deje de construir.

### Lo que hay hoy, verificado contra el código

| Afirmación | Cómo se verificó |
|---|---|
| La API de `quoting` solo **lee** el catálogo: `GET /api/v1/paquetes`, `GET /api/v1/paquetes/:id`, `POST /api/v1/paquetes/cotizar`, `GET /api/v1/catalogo/salidas`, `POST /api/v1/catalogo/cotizar` | Lectura de `apps/api/src/modules/quoting/interface/catalogo.controller.ts` y `salidas.controller.ts`; `cotizaciones.controller.ts` gestiona cotizaciones, no catálogo |
| No existe ninguna ruta que cree, edite, desactive o importe paquetes, vigencias o tarifas | Mismos archivos; el módulo no tiene más controladores (glob de `apps/api/src/modules/quoting/**`) |
| El catálogo entra solo por semilla | `packages/database/prisma/seed.ts` y `semilla-catalogo-real.ts` hacen `prisma.tarifa.create(...)` directamente |
| Los contratos de alta **ya existen** y nadie los usa: `CrearVigencia` y `CrearTarifa` en `packages/contracts/src/vigencias.ts`; `CrearPaquete`, `CrearTemporada`, `CrearPrecio` en `catalogo.ts` | Grep de `CrearPaquete\|CrearVigencia\|CrearTarifa\|CrearTemporada`: solo aparecen en sus archivos de definición |
| `CrearPaquete` arrastra el modelo retirado por ADR-0009: lleva `temporadas` y `mayoristaId` | Lectura de `catalogo.ts` |
| El catálogo de permisos tiene cuatro entradas y ninguna es de catálogo | `PERMISOS` en `packages/contracts/src/identidad.ts` |
| **Añadir un permiso exige migración**: la base lo restringe con el `CHECK roles_permisos_del_catalogo` | `migrations/20261019230000_identidad_global_y_roles_por_agencia/migration.sql`, línea 229 |
| Una tabla nueva con `tenant_id` recibe RLS sola: `001-aislamiento-tenant.sql` recorre `pg_attribute` buscando `tenant_id` | Lectura de `policies/001-aislamiento-tenant.sql`, líneas 136-156 |
| `registros_auditoria` existe (tenant, usuario, acción, entidad, detalle jsonb) y **ningún código de la API escribe en ella todavía** | `schema.prisma` líneas 1265-1282; grep `-i auditoria` en `apps/api/src`: cero archivos |
| `versiones_cotizacion.paquete_id` es foránea `Restrict`; `vigencia_id` y las tarifas de `lineas` no tienen foránea | `schema.prisma` líneas 1810-1835 |
| No hay biblioteca de hojas de cálculo ni de CSV en ningún `package.json` | Grep de `xlsx\|exceljs\|papaparse\|csv-parse\|multer` en `**/package.json`: cero |
| La pantalla `apps/web/src/app/catalogo/page.tsx` pinta paquetes de **maqueta** (`MOCK_PAQUETES_CATALOGO`) y salidas reales | Lectura del archivo |
| El supervisor del ciclo autónomo **no lee** un campo `human_required` de la tarea: deduce el carril de `files` y una tarea con solo `packages/contracts` no la elige nadie | `scripts/ciclo.mjs` líneas 177-189 y 261-272; `ownership.json` |
| **No verificado:** que `viajapro_app` tenga `INSERT` y no `UPDATE/DELETE` sobre `registros_auditoria`, y que pueda tomar `pg_advisory_xact_lock` | Los privilegios se conceden por datos en `001`; no se ejecutó contra una base |

### Qué cubre ya el esquema (ADR-0009) y qué no

Contrastado contra dos catálogos reales y el caso de paquete con hotel.

**JD Tours Cartagena** (`jdtourscartagena.com`, consultado el 2026-10-26): 19 excursiones de un día,
COP por persona. 13 con «desde», 4 con precio de lista y precio promo (Santa Marta Clásico
320.000 → 270.000; City Tour VIP 250.000 → 200.000; PAUE 550.000 → 480.000; Rosario del Mar
500.000 → 420.000), 2 sin precio («consultar disponibilidad»: Mantas y Coco Liso), horario de salida
y regreso en 18 de 19, «impuesto de muelle no incluido» en casi todos los clubes de playa, y en Isla
Palma una **tasa portuaria de 29.000 COP por persona** con dos modalidades (vía marítima 5:00, vía
terrestre 4:30).

**André's Tours** (`docs/01-producto/10-catalogo-real-de-referencia.json`): 47 líneas, 34 productos,
8 grupos de salida con fecha fija; pasadías, pasanoches y excursiones; promo pareja. *Nota: el JSON
sitúa a esta agencia en el Eje Cafetero/Valle, no en Cartagena; la zona no cambia el análisis.*

| Necesidad | ¿El esquema la cubre? | Cómo |
|---|---|---|
| Excursión de un día | **Sí** | `dias = 1`, `noches = 0`; el contrato lo admite |
| Precio por persona en COP | **Sí** | `Tarifa` `POR_PERSONA`, `venta_unidades` en pesos (R8) |
| «Desde X» | **Sí, derivado** | Es la tarifa más barata aplicable. `SalidaPublicada.desde` ya lo calcula para salidas; falta para vigencia abierta. **No se guarda** |
| Producto sin precio publicado | **Sí** | Paquete activo **sin vigencia**: se lista «a consultar», cotizar devuelve `SIN_VIGENCIA` |
| Vende cualquier día del año | **Sí** | Una vigencia abierta de rango largo |
| Fechas fijas (André's) | **Sí** | Vigencias de un día publicadas |
| Promo pareja, menor, suplemento de sencilla | **Sí** | `POR_GRUPO`/`cubrePasajeros`, condición, `aditiva` |
| Hotel y habitaciones | **Sí** | Condición de acomodación; el eje 3 lo deriva del dato |
| Tarifas en USD para internacional | **Sí** | `moneda_iso` por tarifa |
| Impuesto que **cobra la agencia** | **Sí** | Tarifa `aditiva` («Impuesto de muelle», `POR_PERSONA`) |
| Plan de alimentación en un pasadía | **No: obliga a mentir** | `plan_alimentacion` es `NOT NULL`; la semilla pone `SIN_ALIMENTACION` a todo, incluso a los que incluyen almuerzo |
| Precio de lista tachado + precio promo | **No** | `tarifas` solo tiene `venta_unidades` |
| Cargo que se paga **en destino** y no cobra la agencia (tasa portuaria 29.000) | **Solo como texto** | `exclusiones` es una lista de cadenas: pierde el monto y la moneda |
| Hora de salida y de regreso | **No** | Ninguna columna |
| Campos propios de la agencia en el producto | **No** | `EntidadPersonalizable` no tiene `PAQUETE` y `paquetes` no tiene `campos_personalizados` |
| Identificar un producto entre dos importaciones | **No** | No hay código propio ni unicidad por nombre — y **el nombre no es clave** (ADR-0009, hecho 3: «Piangüita + Ballenas» es pasadía y pasanoche) |
| Formato de viaje (`TripFormat`) | **No** | ADR-0009 lo decidió tabla por tenant; nunca se construyó (el lenguaje ubicuo lo anota) |
| Quién puede tocar el catálogo | **No** | No hay permiso |

Conclusión: **el modelo de ADR-0009 aguanta los dos catálogos**; los huecos son siete atributos y un
permiso, no una forma distinta. Eso acota la decisión: no hace falta un catálogo nuevo, hace falta
una vía de entrada y un puñado de columnas.

## Opciones consideradas

### A — Importación asistida por el equipo (no hacer CRUD todavía)

El equipo recibe la hoja de cada agencia y la carga con un script parametrizado.

- **Gana:** cero superficie nueva en la API; sirve para la piloto mañana.
- **Cuesta:** cada cambio de precio de cada agencia pasa por nosotros. Con JD Tours cambiando promos
  cada semana, eso es un empleo.
- **Cierra:** la instrucción del propietario. **Descartada.**

### B — Catálogo de esquema libre: «objetos personalizados» con columnas que define la agencia

La agencia define sus propias entidades y columnas; el cotizador lee lo que haya.

- **Gana:** cualquier hoja entra tal cual.
- **Cuesta:** es el nivel 5 de ADR-0006, prohibido. El cotizador deja de poder razonar sobre neto,
  vigencia o unidad de cobro: son justo los invariantes que nos diferencian.
- **Cierra:** la tesis del producto. **Descartada.**

### C — Importación con estado: tablas de *staging* y procesamiento en el trabajador

`importaciones_catalogo` + `filas_importacion`; se sube el archivo, el trabajador lo procesa, la
agencia revisa y confirma días después si quiere.

- **Gana:** archivos enormes, reanudable, historial de importaciones consultable.
- **Cuesta:** dos tablas nuevas con RLS (migración), un consumidor en cola, un ciclo de vida
  `SUBIDA → VALIDADA → CONFIRMADA → ABANDONADA` con limpieza. Ningún catálogo real pasa de 50 líneas.
- **Cierra:** nada; es más de lo que hace falta. **Diferida**, con condición de entrada en
  «Cuándo revisar esta decisión».

### D — CRUD sobre el modelo de ADR-0009 + importación síncrona sin estado + siete atributos tipados (elegida)

- El CRUD usa los contratos que ya existen (`CrearVigencia`, `CrearTarifa`) y escribe bajo RLS.
- La importación es **dos llamadas puras**: previsualizar (no escribe nada) y confirmar (re-valida
  y aplica en una transacción). La idempotencia sale de la **convergencia**, no de una tabla.
- Los huecos del cuadro se cierran con **columnas tipadas**, no con un mecanismo genérico. Lo que de
  verdad es propio de cada agencia va a campos personalizados (nivel 2 de ADR-0006).

- **Gana:** la agencia carga y edita su catálogo sola; la primera rebanada visible no exige
  migración salvo el permiso; el cotizador no cambia ni una línea de su cálculo.
- **Cuesta:** una migración de columnas (del Owner) y una regla de identificación de productos que
  hay que explicarle a la agencia.
- **Cierra:** archivos de más de 2.000 filas en esta fase («Cuándo revisar» dice cuándo se abre).

## Decisión

**Opción D.** El modelo de ADR-0009 ya expresa los dos catálogos reales; lo que falta es la puerta.
Construir la puerta sobre el modelo existente es lo único que no duplica el cotizador ni abre el
nivel 5.

### 1. Gestión CRUD por la agencia

**Rutas**, todas bajo `api/v1/catalogo`, todas en `quoting` (ADR-0009 §1 ya le da la propiedad):

| Ruta | Qué hace |
|---|---|
| `GET paquetes` | Listado **de gestión**: incluye inactivos con filtro, y `desde` derivado (nulo = «a consultar») |
| `POST paquetes` · `PATCH paquetes/:id` · `POST paquetes/:id/desactivar` | Alta, edición, baja lógica |
| `GET paquetes/:id/vigencias` | Vigencias con sus tarifas; `neto` solo con permiso |
| `POST vigencias` · `PATCH vigencias/:id` | Alta con tarifas (`CrearVigencia`), edición, `activa = false` |
| `POST vigencias/:id/tarifas` · `PATCH tarifas/:id` · `DELETE tarifas/:id` | Tarifas |
| `GET tarifas/:id/historial` | Cambios de precio (§4) |

Reglas:

1. **Nunca se borra un paquete.** `versiones_cotizacion.paquete_id` es `Restrict`: un paquete
   cotizado no se puede borrar, y aunque se pudiera, la cotización congelada perdería su referencia.
   Baja = `activo = false`. Una tarifa **sí** se puede borrar: ninguna foránea la apunta y la
   cotización congela sus números en `lineas` (ADR-0009 §3). El borrado deja su fila de auditoría.
2. **El empate se rechaza al escribir, no al cotizar.** Hoy dos vigencias abiertas de igual longitud
   que se solapan revientan en la cotización con `VIGENCIAS_EMPATADAS`. Con altas en manos de la
   agencia eso llegaría al asesor en mitad de una conversación. El alta y la edición llaman a
   `resolverVigencia` de `@viajapro/domain` sobre las fechas afectadas y responden **409
   `VIGENCIA_EMPATADA`** antes de guardar. **Una sola función de resolución**, usada en los dos
   sitios: el invariante de ADR-0009 se mantiene.
3. **`tenantId` no viaja en ninguna firma** (como hoy). Todo pasa por `prisma.conTenant()`. Las
   foráneas compuestas existentes (`vigencia → paquete`, `tarifa → vigencia`, `tarifa → mayorista`)
   impiden colgar nada de otra agencia aunque el código se equivoque. Aislamiento por RLS, no por
   memoria del programador.
4. `CrearPaquete` se rehace sin `temporadas` ni `mayoristaId` (ADR-0009 los retiró). **No es un
   cambio rompiente en la práctica**: ningún consumidor lo importa (verificado). `CrearPrecio` y
   `CrearTemporada` quedan marcados obsoletos, sin uso nuevo.

**Permisos.** Un permiso nuevo, `catalogo.administrar`: crear, editar, desactivar e importar.
Escribir o leer **`neto`** exige además `cotizacion.ver_neto_y_margen`, que ya existe: quien no puede
ver el neto tampoco puede escribirlo, porque escribirlo a ciegas es igual de peligroso. Sin el
segundo, el alta acepta la tarifa sin neto (margen desconocido, que ADR-0009 §5 ya admite) y una
petición que **traiga** neto responde 403, no lo ignora. Añadir el permiso es **migración** (el
`CHECK` de roles): es la primera tarea del Owner.

No se crea un permiso aparte para «cambiar precios»: separar «editar el nombre» de «editar el
precio» no pasa la primera pregunta de ADR-0006 (dos agencias reales que lo pidan). Queda como
decisión del propietario (§10, D2), con valor por defecto.

### 2. Importación desde hoja de cálculo

**Forma de la hoja: una fila = una tarifa.** Paquete y vigencia van repetidos en cada fila; las
filas con el mismo producto se agrupan. Es como ya escriben su lista las dos agencias: una línea por
producto y precio. Una hoja de paquete con hotel tiene una fila por acomodación.

**El archivo se lee en el navegador, no en el servidor.** La web convierte CSV (y, si el propietario
lo aprueba, `.xlsx`) en una tabla de celdas de texto y envía JSON:
`{ encabezados: string[], filas: string[][], mapeo }`. Razones: el servidor no carga ningún
analizador de archivos —un `.xlsx` es un zip y un zip es una superficie de ataque (bomba de
descompresión)—, no hace falta `multipart` ni dependencia nueva en la API, y **la seguridad no
depende del cliente**: el servidor valida cada celda con Zod como si viniera de un desconocido.
Tope: **2.000 filas × 40 columnas, 2 MB de cuerpo**.

**Dos llamadas, ninguna con estado:**

1. `POST api/v1/catalogo/importaciones/previsualizar` — **no escribe nada.** Aplica el mapeo,
   convierte cada celda (dinero con la moneda y sus decimales de la tabla `monedas`: `$ 1.236.000`
   en COP son 1.236.000 unidades; fechas en el formato declarado en el mapeo), valida fila a fila
   con los mismos esquemas del CRUD y compara contra el catálogo actual. Devuelve un **informe**:
   por fila, `OK | AVISO | ERROR`, la acción prevista `CREAR | ACTUALIZAR | SIN_CAMBIOS`, y los
   errores con columna, código estable y mensaje. Más una **huella**: `sha256` de la tabla
   canónica + mapeo + `tenantId`.
2. `POST api/v1/catalogo/importaciones/confirmar` — mismo cuerpo + huella. El servidor **recalcula**
   todo (no confía en la previsualización), rechaza con 409 `IMPORTACION_CAMBIO` si la huella no
   coincide, y rechaza si queda algún `ERROR`. Aplica en **una transacción** bajo `conTenant`, con
   `pg_advisory_xact_lock` por tenant para que dos importaciones simultáneas no creen el mismo
   paquete dos veces. Escribe una fila `catalogo.importado` en auditoría con la huella y el resumen.

**Idempotencia (R5) por convergencia.** Cada fila se aplica como *upsert* por clave natural; aplicar
dos veces la misma hoja deja el catálogo igual y la segunda respuesta dice `0 creados, 0
actualizados, N sin cambios`, sin filas de auditoría de precio nuevas. No hace falta tabla de
claves de idempotencia porque **no hay efecto externo**: es una escritura en nuestra propia base,
y repetirla converge.

**Clave natural** (la parte que hay que explicarle a la agencia):

| Entidad | Clave |
|---|---|
| Paquete | `codigo` propio de la agencia si la hoja lo trae; si no, **nombre normalizado + noches** (sin tildes, minúsculas, espacios colapsados). Así «Piangüita + Ballenas» de 0 noches y de 1 noche son dos productos, como deben |
| Vigencia | `(paquete, desde, hasta)` — ya es único en la base |
| Tarifa | `(vigencia, nombre normalizado)` — unicidad de aplicación, protegida por el bloqueo |
| Mayorista | nombre normalizado; si no existe se crea, y la previsualización lo dice |

Si la clave de un paquete casa con **más de uno** existente, la fila es `ERROR` con código
`PAQUETE_AMBIGUO` y la previsualización lo nombra. No se elige en silencio — misma filosofía que el
desempate de ADR-0009.

**Qué no hace la importación:** no borra. Un producto que estaba en el catálogo y no viene en la hoja
**no se toca**; la previsualización lo lista como «no incluido en la hoja» para que la agencia decida
desactivarlo a mano. Una importación que borra lo que falta convierte una hoja parcial en un
catálogo vacío.

**Validación de lo que no cabe en una celda.** Una fila sin precio no es error: es `AVISO`, y el
paquete se crea sin vigencia («a consultar»), que es exactamente Mantas y Coco Liso. Una fila con
`noches > dias`, fecha imposible, precio no numérico, moneda no habilitada o tarifa por persona con
`cubrePasajeros ≠ 1` es `ERROR`.

### 3. Promos, «desde», impuestos, excursiones de un día y campos propios — sin tocar el código

| Caso | Representación | ¿Migración? |
|---|---|---|
| **Excursión de un día** | `dias 1, noches 0`. Sin acomodación en la tarifa, el cotizador no pregunta habitaciones (eje 3 de ADR-0009) | No |
| **Plan de alimentación** en un pasadía | `plan_alimentacion` pasa a **nulable**: «no aplica» no es `SIN_ALIMENTACION`. El almuerzo va en inclusiones | **Sí** |
| **«Desde»** | **Derivado, nunca guardado**: mínimo per cápita de las tarifas aplicables de las vigencias activas futuras; si viene de una tarifa de grupo se marca (como `desdeEsDeGrupo` hoy). Guardarlo sería una segunda verdad que se desincroniza con la primera edición | No |
| **Sin precio** | Paquete sin vigencia → «a consultar» | No |
| **Precio de lista y promo** | `tarifas.lista_unidades` (nulable; `CHECK lista > venta`) y `tarifas.promo_hasta` (`date`, nulable). **`venta` es siempre lo que se cobra.** `lista` es informativa: se muestra tachada, **nunca entra en el cálculo**, nunca en la cotización congelada | **Sí** |
| **Promo vencida** | Pasada `promo_hasta` (fin del día en la zona del tenant, R9) el precio de lista **deja de mostrarse tachado** y la ficha avisa «promo vencida». La `venta` **no cambia sola**. Ver por qué abajo | (misma) |
| **Impuesto que cobra la agencia** | Tarifa `aditiva` | No |
| **Cargo en destino** (impuesto de muelle, tasa portuaria 29.000 por persona) | `paquetes.cargos_en_destino jsonb`, validado por Zod: `[{ concepto, monto: Dinero \| null, unidad: POR_PERSONA \| POR_GRUPO, nota }]`. **Nunca se suma al total**; la cotización lo lista aparte («no incluye: impuesto de muelle, $29.000 por persona, se paga en el muelle») | **Sí** |
| **Hora de salida y de regreso** | `paquetes.hora_salida`, `paquetes.hora_regreso`, tipo `time` **sin zona**. Es la hora local del punto de encuentro, como la fecha de viaje es `date`: no es un instante, y convertirla a UTC la rompería con el cambio de huso. Dos modalidades con horario distinto (Isla Palma) son dos paquetes | **Sí** |
| **Código propio** | `paquetes.codigo varchar(64)` nulable, único por tenant entre los no eliminados | **Sí** |
| **Campos propios de la agencia** («nivel de actividad», «apto para niños», «punto de encuentro») | `PAQUETE` entra en `EntidadPersonalizable` y `paquetes.campos_personalizados jsonb` con índice GIN, igual que `contactos` y `oportunidades`. Las definiciones ya son tabla por tenant | **Sí** |
| **Formato de viaje** («beach club», «city tour», «pasadía») | La tabla `formatos_de_viaje` que ADR-0009 §4 ya decidió, y `paquetes.formato_id` con foránea compuesta. Solo etiqueta: **ninguna ruta de cálculo ramifica sobre ella** | **Sí** (tabla nueva: RLS automática por `001`) |

**Por qué la promo vencida no revierte el precio sola.** Que la venta baje o suba según la **fecha
de compra** es la segunda dimensión que ADR-0009 («El límite») dejó fuera y reservó para un ADR
propio. Revertirla automáticamente metería esa dimensión en el cálculo por la puerta de atrás, y
además cambiaría el precio de una agencia sin que nadie lo decidiera. Lo que sí se hace es dejar de
**anunciar** un precio tachado caducado, que es lo que podría ser publicidad engañosa (*no verificado*
contra el Estatuto del Consumidor, Ley 1480 de 2011; pregunta para `investigador`).

### 4. Auditoría de cambios de precio

Todo alta, cambio o borrado de una tarifa escribe en `registros_auditoria`, **en la misma
transacción** que el cambio: `accion` (`catalogo.tarifa.creada | .modificada | .eliminada`),
`entidad = 'tarifa'`, `entidad_id`, `usuario_id` del contexto, y `detalle` con
`{ campo, antes, despues, moneda, origen: 'manual' | 'importacion', huella? }` para `venta`, `neto`,
`lista` y `promo_hasta`. Paquetes y vigencias registran alta, desactivación y cambio de fechas.

- **Misma transacción, no evento.** Un registro de auditoría que se pierde porque la cola se cayó no
  es auditoría. No existe hoy módulo `audit` ni consumidor del outbox para él (verificado), así que
  `quoting` declara un puerto **`RegistroDeCambios`** en su propio módulo y su adaptador inserta en
  la tabla con el mismo `tx`. El día que exista `audit`, se queda con el adaptador; `quoting` no
  cambia (R4).
- El historial (`GET tarifas/:id/historial`) **redacta `neto`** si quien consulta no tiene
  `cotizacion.ver_neto_y_margen`: el historial no puede ser la puerta trasera del neto.
- Una importación que no cambia un precio **no** escribe fila de precio: la convergencia es
  silenciosa, y así el historial solo cuenta cambios reales.
- La tarea T-006 (lecturas de datos sensibles) también escribe en esta tabla. Si llega antes,
  `RegistroDeCambios` reutiliza su escritor; si no, el escritor nace aquí. No bloquea a ninguna.

### 5. Ayuda por IA para mapear columnas: **se difiere**, con el puerto puesto hoy

Se construye ahora el puerto **`SugeridorDeMapeo`** (`encabezados + 5 filas de muestra → mapeo
sugerido con confianza por columna`) con un único adaptador **por sinónimos**: «tour», «producto»,
«plan» → nombre; «precio», «valor», «pvp», «tarifa» → venta; «neto», «costo» → neto; «fecha»,
«salida» → desde; etc. La sugerencia **llega como mapeo pre-rellenado que la persona confirma**;
nunca se aplica sin que alguien pulse «confirmar» sobre la previsualización. Es la misma regla que
regiría la IA.

Por qué no la IA ahora:

1. **Los dos catálogos reales tienen encabezados triviales.** Un diccionario de sinónimos los
   resuelve; la IA no tiene trabajo que hacer todavía.
2. **Es un flujo de datos nuevo hacia un tercero**, con netos de mayorista —información comercial
   de la agencia— dentro de las filas de muestra. CLAUDE.md §10 exige ADR y adaptador detrás de
   puerto para cualquier servicio externo, y `auditor-seguridad` tiene que mirarlo.
3. No hay módulo de IA ni dependencia de Anthropic en el monorepo (verificado: ningún `package.json`
   la declara).

**Cuándo entra:** cuando el informe de importaciones muestre que **más del 20 % de las
importaciones exigen corregir a mano 3 o más columnas** de la sugerencia. Para poder medirlo, la
fila `catalogo.importado` guarda en `detalle` el mapeo sugerido y el confirmado. Entra como un
segundo adaptador del mismo puerto, sin tocar el flujo, y con su propio ADR corto.

### 6. Lo que **no** se parametriza (se suma a la lista de ADR-0009 §3)

| Invariante | Por qué |
|---|---|
| La importación **no borra** | Una hoja parcial no puede vaciar un catálogo |
| Una importación con errores **no se confirma a medias** (por defecto; ver D4) | Medio catálogo cargado es peor que ninguno: el asesor no sabe qué falta |
| `lista` **nunca entra en el cálculo** | Es anuncio, no precio |
| Los cargos en destino **nunca se suman al total** | No los cobra la agencia |
| Escribir `neto` exige el permiso de verlo | El neto no sale del tenant y no lo toca quien no lo ve |
| El empate de vigencias se rechaza al escribir | Una sola función de resolución, ahora también como validación |

### 7. Qué cambia en el esquema

**Sin migración** (lo que hacen las tareas del ciclo autónomo):

- Todo el CRUD de paquetes, vigencias y tarifas con las columnas actuales.
- «Desde» derivado, paquete «a consultar», excursión de un día, impuesto cobrado como tarifa aditiva.
- Importación completa (previsualizar y confirmar) sobre las columnas actuales.
- Auditoría en `registros_auditoria` (tabla existente).
- Sugerencia de mapeo por sinónimos.
- **Mientras no llegue la migración 2:** el plan de alimentación de un pasadía se sigue guardando como
  `SIN_ALIMENTACION` (lo que ya hace la semilla), el precio de lista no se representa, y los cargos
  en destino van como texto en `exclusiones`. Es deuda declarada, no oculta.

**Con migración — del Owner** (dos, en este orden):

| # | Contenido | Por qué no espera |
|---|---|---|
| **M1** | Permiso `catalogo.administrar` en el `CHECK roles_permisos_del_catalogo` y en `PERMISOS`; concedido a los roles sembrados `DUENO` y `OPERACIONES` (valor por defecto de D2; `ASESOR` no) de los tenants existentes y de la semilla | Sin él ninguna ruta de escritura es usable. Es pequeña |
| **M2** | `paquetes`: `plan_alimentacion` nulable, `codigo` + índice único parcial `(tenant_id, codigo) WHERE codigo IS NOT NULL AND eliminado_en IS NULL`, `hora_salida time`, `hora_regreso time`, `cargos_en_destino jsonb default '[]'`, `campos_personalizados jsonb default '{}'` + GIN, `formato_id` con foránea compuesta. `tarifas`: `lista_unidades bigint`, `promo_hasta date`, `CHECK (lista_unidades IS NULL OR lista_unidades > venta_unidades)`. `entidad_personalizable` + `PAQUETE`. Tabla `formatos_de_viaje (id, tenant_id, nombre, orden, activo)` con `UNIQUE (id, tenant_id)` y `UNIQUE (tenant_id, nombre)` | Todas son nulables o con valor por defecto: **no reescriben filas existentes** y no exigen dato. Hacerlas ahora, sin datos de producción, es lo barato |

Nota para M2: `ALTER TYPE ... ADD VALUE` no puede usarse en la misma transacción que lo añade. La
migración debe añadir el valor y no usarlo; la prueba de aislamiento debe incluir
`formatos_de_viaje` en sus aserciones de comportamiento y en los mutantes (relación con T-009).

**Diferido sin migración prevista:** tablas de *staging* de importación (opción C), precio por fecha
de compra, días de operación por semana («DJ los fines de semana»), CRUD de mayoristas fuera de la
importación.

### 8. Relación con ADRs anteriores

- **ADR-0006:** no cambia su regla. Amplía su inventario: «Datos: campos personalizados en contacto,
  viajero, oportunidad y archivo de viaje» pasa a incluir **paquete**. Nivel 2, que ya estaba en v1.
- **ADR-0009:** no cambia ninguna de sus seis resoluciones. Construye `TripFormat`, que decidió y no
  se hizo, y usa `resolverVigencia` también para validar altas. El precio de lista **no** abre la
  dimensión de fecha de compra (§3).
- **ADR-0011:** un permiso más en el catálogo de código, por el mismo mecanismo.
- **R5:** la importación no tiene efecto externo; su idempotencia es la convergencia del *upsert*.

## Consecuencias

### Positivas
- Una agencia carga su catálogo sola, desde la hoja que ya tiene, en minutos.
- JD Tours y André's Tours caben sin inventar datos; el paquete con hotel sigue igual.
- El cotizador no cambia su cálculo: todo lo nuevo es entrada, presentación o auditoría.
- Los cambios de precio quedan con autor, hora, antes y después: resuelve la disputa «¿quién bajó
  la promo?».
- La primera rebanada visible solo espera a una migración pequeña (M1).

### Negativas
- **La clave natural es heurística cuando no hay código.** Renombrar un producto en la hoja crea uno
  nuevo en vez de actualizar el viejo. La previsualización lo enseña como `CREAR` y lista el viejo
  como «no incluido en la hoja», pero depende de que alguien lo lea.
- **Superficie de escritura nueva bajo RLS**, con un permiso nuevo. Pasa por `auditor-seguridad`
  antes de integrarse; las pruebas de cada ruta incluyen el caso «tenant B no ve ni toca».
- **Importar dos veces cuesta dos validaciones completas** (previsualizar y confirmar re-validan).
  Con 2.000 filas es irrelevante; con 50.000 sería el motivo de la opción C.
- **Entre M1 y M2 hay deuda visible:** plan de alimentación falso en pasadías, sin precio tachado,
  cargos como texto.
- Un `jsonb` más (`cargos_en_destino`) cuya forma solo protege Zod, no la base.

### Qué habría que cambiar para revertir esto
Quitar las rutas de escritura y volver a semillas. Las columnas de M2 son nulables y se pueden dejar
sin uso. Lo único caro de revertir es `formatos_de_viaje` una vez que las agencias la hayan llenado,
y eso ya lo había decidido ADR-0009.

## Cuándo revisar esta decisión

- **Una hoja real de más de 2.000 filas**, o que tarde más de 10 s en confirmar: se construye la
  opción C (*staging* y trabajador).
- **Más del 20 % de importaciones con 3 o más columnas remapeadas a mano:** entra la IA (§5).
- **Dos agencias que pidan separar «editar producto» de «cambiar precio»:** permiso propio.
- **Una agencia cuyo precio cambie solo por fecha de compra** (*early bird*, promo que revierte
  sola): es el ADR que ADR-0009 ya reservó, no un campo más aquí.
- **`PAQUETE_AMBIGUO` o productos duplicados por renombre en más de una de cada diez
  importaciones:** hacer obligatorio el `codigo`.

---

## 9. Fuera de alcance

Importación de netos desde PDF del mayorista · sincronización con sistemas de mayoristas · pieza de
WhatsApp generada desde el catálogo · fotos del producto (S3) · días de operación por semana ·
precio por fecha de compra · CRUD independiente de mayoristas · IA de mapeo (§5).

## 10. Decisiones que solo puede tomar el propietario

Cada una con el valor que se aplica si no responde.

| # | Pregunta | Por defecto |
|---|---|---|
| D1 | **Formato de hoja**: ¿solo CSV, o también `.xlsx`? El `.xlsx` exige una dependencia nueva en la web (p. ej. `exceljs`; *no verificado* cuál conviene ni su licencia) | **Solo CSV** (UTF-8, separador `,` o `;` detectado). Excel guarda CSV con «Guardar como». `.xlsx` cuando una agencia real no pueda hacerlo |
| D2 | **Quién puede cambiar precios**: ¿`catalogo.administrar` va a `DUENO` solamente o también a `OPERACIONES`? ¿Permiso separado para precio? | `DUENO` y `OPERACIONES`; `ASESOR` no. Sin permiso separado. Cada agencia puede reasignarlo en sus roles |
| D3 | **Promos vencidas**: ¿se deja de mostrar el tachado y se avisa, o la venta vuelve sola al precio de lista? | **Se deja de mostrar el tachado y se avisa.** La venta no cambia sola (§3) |
| D4 | **Importación con errores**: ¿todo o nada, o «importar solo las filas válidas»? | **Todo o nada.** El informe dice qué corregir |
| D5 | **Lo que no viene en la hoja**: ¿se deja, se desactiva o se pregunta? | **Se deja** y se lista en la previsualización |
| D6 | **Neto en la importación**: ¿quien importa sin permiso de neto puede subir una hoja con columna de neto? | **No**: la confirmación responde 403 si el mapeo incluye neto y falta el permiso |
| D7 | **IA para mapear columnas** en esta fase | **Diferida** con el criterio de §5 |
| D8 | **Orden de las migraciones**: ¿M1 hoy y M2 tras la primera rebanada visible, o las dos juntas? | **M1 hoy, M2 en cuanto acabe la rebanada de importación**, antes de cargar el catálogo de la piloto |

## Entradas propuestas al lenguaje ubicuo

No se edita el diccionario en este ADR. Para aprobación: **Precio de lista** (`listPrice`) — el
precio anterior a la promo, solo de anuncio, nunca cobrado ni calculado · **Promo hasta**
(`promoUntil`) · **Cargo en destino** (`OnSiteCharge`) — lo que el viajero paga en destino y la
agencia no cobra · **Importación de catálogo** (`CatalogImport`) · **Previsualización**
(`ImportPreview`) · **Huella de importación** (`importFingerprint`). Y se retira la nota «aún no existe
como tabla» de **Formato de viaje** cuando M2 se aplique.
