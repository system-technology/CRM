# ADR-0017 — El catálogo lo gestiona la agencia: cuatro canales de alta sobre un solo núcleo

- **Estado:** Aceptado por el propietario (2026-10-26). Autoriza las migraciones **M1 y M2**. Los
  canales de **API pública** (§6) e **ingesta por IA** (§7), y la migración **M3** que los habilita,
  quedan **sujetos a la revisión de `auditor-seguridad`** antes de implementarse.
- **Revisión (una vuelta, R13), 2026-10-26:** `auditor-seguridad` y `experto-turismo`, ambos
  «aceptar con cambios». Incorporados aquí los bloqueantes: «desde» solo sobre tarifas base y por
  moneda (§9), **opciones de salida** en lugar de dos columnas de hora (§3.1, cambia M2), directorio
  global de claves con rol propio (§6.2, cambia M3), ámbitos acotados por los permisos de quien crea
  la clave (§6.2) y alineación con la ingesta por IA (§7). Lo no bloqueante está en «Cola». **M1 y
  M2 siguen autorizadas; M3 y la activación de la IA siguen bloqueadas** hasta implementar §6.2 y §7
  tal como quedan.
- **Fecha:** 2026-10-26
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta). `ingeniero-ia` diseña en paralelo la ingesta por IA en
  `docs/09-ia/09-ingesta-de-catalogo-con-ia.md` (este ADR fija solo su contrato de salida y su
  frontera). Pendiente: `auditor-seguridad` (escritura bajo RLS, claves de API, entrada masiva,
  contenido externo hacia un modelo) y `experto-turismo` (precio de lista, cargos en destino,
  plantillas por tipo de producto).
- **Supersede:** nada. Extiende ADR-0006 (inventario de lo configurable) y ADR-0009 (forma del
  catálogo) sin cambiar ninguna de sus decisiones. Ver §11.
- **Historia de este documento mientras estuvo «Propuesto»:** la primera redacción (PR #31) tenía un
  solo canal de entrada además del CRUD (CSV) y difería la IA. El propietario decidió el 2026-10-26
  **cuatro canales**, `.xlsx` incluido, y que la promo vencida sea **política por agencia**. Esta
  versión es la aceptada; la anterior no rigió nunca.

---

## Contexto

### La fuerza

**Velocidad de incorporación de agencias, y es una fuerza de producto, no técnica.** El propietario
fijó como innegociable que el CRM sirva a cualquier agencia de turismo y que el catálogo no sea una
limitación. Hoy lo es, y no por el modelo sino por la **vía de entrada**: cada agencia nueva necesita
a un programador que escriba una semilla.

Y las agencias no tienen su catálogo en un solo sitio: lo tienen en una hoja (André's Tours), en su
web (JD Tours), en el ERP del mayorista o en un PDF que les mandan. Por eso el propietario pide
**cuatro puertas**: pantalla, plantilla (CSV/Excel), API pública e IA sobre contenido no
estructurado.

**La fuerza arquitectónica secundaria es el acoplamiento:** cuatro puertas implementadas por
separado son cuatro validadores de catálogo que divergen a la primera regla nueva. La decisión
central de este ADR es que **no lo sean**.

### Lo que hay hoy, verificado contra el código

| Afirmación | Cómo se verificó |
|---|---|
| La API de `quoting` solo **lee** el catálogo | `apps/api/src/modules/quoting/interface/` tiene tres controladores: `catalogo.controller.ts`, `salidas.controller.ts`, `cotizaciones.controller.ts` (glob) |
| El catálogo entra solo por semilla | `packages/database/prisma/seed.ts` y `semilla-catalogo-real.ts` |
| Los contratos de alta existen y nadie los usa: `CrearVigencia`, `CrearTarifa` (`vigencias.ts`); `CrearPaquete` arrastra `temporadas` y `mayoristaId` (`catalogo.ts`) | Lectura en la redacción anterior; no re-verificado en esta |
| `PERMISOS` tiene cuatro entradas y ninguna es de catálogo; añadir una exige migración (`CHECK roles_permisos_del_catalogo`, migración `20261019230000`) | Grep de `PERMISOS` en `packages/contracts/src/identidad.ts` (líneas 7-23) |
| Una tabla nueva con `tenant_id` recibe RLS sola (`policies/001-aislamiento-tenant.sql` recorre `pg_attribute`) | Lectura en la redacción anterior |
| `registros_auditoria` tiene `usuario_id` **nulable**, `detalle jsonb` e `ip inet` | `schema.prisma` líneas 1265-1282 |
| `politicas_de_precio` es **una fila por tenant** (`tenant_id` es la clave primaria), ya agrupa política de presentación (`modo_de_catalogo`: «afecta a las altas y a la interfaz, nunca al cálculo») | `schema.prisma` líneas 835-860 |
| El contrato `ActualizarPoliticaDePrecio` existe; la web tiene `components/configuracion/bloque-politica-precio.tsx`, que dice que **la API aún no expone la ruta de persistencia** | Grep en `packages/contracts/src/politica-de-precio.ts` y en el componente (línea 322) |
| `EntidadPersonalizable` = `CONTACTO, VIAJERO, OPORTUNIDAD, ARCHIVO_VIAJE`; no tiene `PAQUETE` | `schema.prisma` líneas 550-557 |
| No existe `formatos_de_viaje` | Grep de `FormatoDeViaje` en `schema.prisma`: cero |
| No hay biblioteca de CSV, `.xlsx` ni SDK de Anthropic en ningún `package.json` | Grep `exceljs\|xlsx\|anthropic\|throttler` en `**/package.json`: cero |
| `apps/api` ya depende de `bullmq` e `ioredis`: hay Redis disponible para la API | `apps/api/package.json` líneas 24 y 26 |
| No existe ningún mecanismo de clave de API ni de `Idempotency-Key` en `apps/` | Grep `api[_-]?key\|claves_api\|x-api-key\|Idempotency-Key`: solo aparece en docs y `.env.example` |
| El `tenantId` se deriva **solo de la sesión** en `TenantMiddleware`; las rutas sin tenant son una lista exacta (`auth`, `/salud`, `/webhooks/`) y lo demás falla cerrado | `apps/api/src/shared/tenant/tenant.middleware.ts` líneas 8-11 y 44-60 |
| El límite de tasa de la API **no existe todavía**: es la tarea T-002 (`backlog`) | `roadmap/tasks.yaml` |
| No existe hoy PDF ni enlace público de cotización en `apps/` | Grep `pdf\|enlacePublico` en `apps/`: solo mocks de la web e `inbox` |
| `packages/contracts/src/plantillas.ts` ya existe y es de **plantillas de WhatsApp** | Grep: exporta `PlantillaWhatsApp`. Por eso aquí se dice «plantilla de catálogo» y el archivo será `plantillas-de-catalogo.ts` |
| `ownership.json` marca `**/package.json` como `humanRequired`: añadir una dependencia la hace una persona | Lectura de `ownership.json` |
| El supervisor deduce el carril de `files` (`carrilDeTarea`) y no lee `human_required` | `scripts/ciclo.mjs` línea 181 y grep de `human_required`: cero |
| Las funciones `SECURITY DEFINER` del repositorio son **once**, no las ocho de ADR-0010 §1.2 | Recuento de `auditor-seguridad` (revisión del 2026-10-26). Un grep `-i "security definer"` en `packages/database/prisma` da 40 menciones en 10 archivos, comentarios incluidos; el recuento de funciones distintas **no lo verifiqué yo** |
| Las tablas globales sin `tenant_id` se declaran en `excepciones_rls`, y el patrón de disparador que mantiene una tabla global desde una de negocio ya existe (`sincronizar_acceso_identidad`) | Grep de `excepciones_rls\|sincronizar_acceso_identidad` en `packages/database`: migraciones `20261007120100`, `20261019230000` y `aislamiento.spec.ts` |
| `permisoQueFalta` ya existe y ya impide dar más permisos de los que se tienen | `apps/api/src/modules/identity/domain/permisos-incluidos.ts` línea 5; lo usa `invitar-miembro.use-case.ts` línea 54 |
| **No verificado:** que `viajapro_app` pueda tomar `pg_advisory_xact_lock` y tenga solo `INSERT` sobre `registros_auditoria` | No se ejecutó contra una base |

### Qué cubre ya el esquema (ADR-0009) y qué no

Contrastado contra **JD Tours Cartagena** (`jdtourscartagena.com`, consultado el 2026-10-26: 19
excursiones de un día en COP por persona; 13 con «desde», 4 con precio de lista y promo, 2 sin
precio, horario en 18 de 19, «impuesto de muelle no incluido», tasa portuaria de 29.000 COP en Isla
Palma con dos modalidades) y **André's Tours** (`docs/01-producto/10-catalogo-real-de-referencia.json`:
47 líneas, 34 productos, 8 grupos de salida con fecha fija).

| Necesidad | ¿El esquema la cubre? | Cómo / qué falta |
|---|---|---|
| Excursión de un día, precio por persona en COP, sin precio («a consultar»), cualquier día del año, fechas fijas, promo pareja, hotel y acomodación, USD, impuesto que cobra la agencia | **Sí** | Modelo de ADR-0009 tal cual |
| «Desde X» | **Sí, derivado** | Nunca se guarda |
| Plan de alimentación en un pasadía | **No: obliga a mentir** | `plan_alimentacion NOT NULL` → nulable (M2) |
| Precio de lista tachado + promo | **No** | `lista_unidades`, `promo_hasta` (M2) |
| Cargo pagado en destino | **Solo como texto** | `cargos_en_destino jsonb` (M2) |
| Hora de salida y regreso, **varias por producto** (City Tour VIP: turnos 7:30-12:50 y 14:50-19:50; Isla Palma: lancha o terrestre por Tolú, recogida Marbella 4:30, Bocagrande 4:45, Centro 5:00) | **No** | Tabla `opciones_de_salida` (M2, §3.1) |
| Identificar un producto entre dos cargas | **No** | `codigo` (M2); el nombre no es clave (ADR-0009, hecho 3) |
| Campos propios de la agencia | **No** | `PAQUETE` en `EntidadPersonalizable` + `campos_personalizados` (M2) |
| Tipo de producto (`TripFormat`) que defina sus campos | **No** | `formatos_de_viaje` con su `plantilla` (M2) |
| Quién puede tocar el catálogo | **No** | Permiso `catalogo.administrar` (M1) |

Conclusión: **el modelo de ADR-0009 aguanta los dos catálogos**. Lo que falta es una vía de entrada,
un puñado de columnas y un permiso; no un catálogo nuevo.

## Opciones consideradas

Descartadas en la redacción anterior y que siguen descartadas: **importación asistida por el
equipo** (cada cambio de precio pasa por nosotros) y **catálogo de esquema libre** (nivel 5 de
ADR-0006: el cotizador deja de razonar sobre neto, vigencia y unidad de cobro). La pregunta nueva es
**cómo se organizan cuatro canales**.

### A — Cuatro canales independientes

Cada canal valida y escribe a su manera: el CRUD con sus casos de uso, la importación con los suyos,
la API pública con un controlador propio, la IA escribiendo con su propio adaptador.

- **Gana:** cada canal avanza sin esperar a los otros.
- **Cuesta:** cuatro validadores. La regla «el empate de vigencias se rechaza al escribir» tendría que
  vivir en cuatro sitios; la auditoría de precio, también. El primer canal que olvide una regla es
  una vía para meter un catálogo que el cotizador no puede resolver.
- **Cierra:** la coherencia del catálogo. **Descartada.**

### B — Un núcleo común síncrono: «propuesta de catálogo» → validar → planificar → aplicar (elegida)

Los cuatro canales son **adaptadores de entrada** que producen el mismo objeto, `PropuestaDeCatalogo`.
Un único núcleo en `quoting` lo valida, calcula el plan de cambios contra el catálogo actual y lo
aplica en una transacción idempotente con auditoría. Sin tablas de *staging*.

- **Gana:** una sola implementación de las reglas; añadir un quinto canal (un conector con un
  mayorista) es escribir un adaptador. La previsualización es el mismo plan que se aplicará.
- **Cuesta:** el contrato común tiene que ser lo bastante rico para la IA (procedencia, confianza) y
  lo bastante estricto para la API (código obligatorio). Se resuelve con un objeto y dos refinamientos
  por origen (§2).
- **Cierra:** cargas de más de 2.000 productos-tarifa por llamada en esta fase.

### C — Núcleo común con estado: tablas de *staging* y procesamiento en el trabajador

`importaciones_catalogo` + `filas_importacion`; todo canal deposita y el trabajador procesa.

- **Gana:** archivos enormes, reanudable, historial.
- **Cuesta:** dos tablas con RLS, un consumidor, un ciclo de vida con limpieza, y la previsualización
  pasa a ser asíncrona para canales que no lo necesitan (el CRUD de un solo producto).
- **Cierra:** nada; es más de lo que hace falta. **Diferida** («Cuándo revisar»). La única pieza que
  podría necesitar estado es la propuesta de la IA, que es lenta de generar: ver M4 condicional (§9).

## Decisión

**Opción B.** Un contrato, un núcleo, cuatro adaptadores de entrada. Ningún canal escribe en
`paquetes`, `vigencias` o `tarifas` por otro camino.

### 1. El núcleo: validar → planificar → aplicar

```
 pantalla (CRUD) ─┐
 plantilla CSV/XLSX ─ tabla+mapeo ─► convertir ─┐
 API pública ─────────────────────────────────┤
 IA (docs/09-ia/09-…) ── propuesta ───────────┤
                                              ▼
                               PropuestaDeCatalogo (Zod, contracts)
                                              │
                             1. validar  (Zod + invariantes de dominio)
                             2. planificar (diff contra el catálogo actual → Plan + Informe + huella)
                             3. aplicar  (una tx, conTenant, advisory lock, upsert, auditoría)
```

Todo en `quoting` (ADR-0009 §1 le da la propiedad del catálogo):

1. **Validar** — función pura en `quoting/domain/`. Esquema Zod + invariantes: `noches ≤ dias`;
   `POR_PERSONA` ⇒ `cubrePasajeros = 1`; moneda habilitada (tabla `monedas`, R8: unidad mínima, en COP
   el peso); **empate de vigencias rechazado al escribir** con `resolverVigencia` de
   `@viajapro/domain` (la misma función que usa el cotizador: el invariante de ADR-0009 no se
   duplica); `lista > venta` si hay lista; neto solo si el actor tiene permiso de neto (§5).
2. **Planificar** — compara contra el catálogo actual por **clave natural** (§3) y produce el
   `Plan` (`CREAR | ACTUALIZAR | SIN_CAMBIOS` por entidad) y el `InformeDeCatalogo` (por elemento:
   `OK | AVISO | ERROR`, código estable, ubicación —fila y columna en archivo, ruta JSON en API,
   evidencia en IA—, mensaje), la lista de «no incluidos en la propuesta» y una **huella**:
   `sha256` de la propuesta canónica + `tenantId` + versión del núcleo. **No escribe nada.**
3. **Aplicar** — recalcula 1 y 2 en el servidor (no confía en ninguna previsualización), compara la
   huella si el canal la trae (409 `PROPUESTA_CAMBIO`), rechaza si queda algún `ERROR` (**todo o
   nada**, D4), y aplica en **una** `prisma.conTenant` con `pg_advisory_xact_lock` por tenant y
   *upsert* por clave natural. Escribe la auditoría en la misma transacción (§8).

**Idempotencia (R5) por convergencia.** Aplicar dos veces la misma propuesta deja el catálogo igual
y responde `0 creados, 0 actualizados, N sin cambios`, sin filas de auditoría de precio nuevas. No
hay efecto externo: es escritura en nuestra base, y repetirla converge. La API pública añade
`Idempotency-Key` encima (§6.4) para devolver la misma respuesta, no para la corrección.

**Qué no hace el núcleo, en ningún canal:** no borra. Lo que estaba y no viene en la propuesta **no
se toca**; el informe lo lista como «no incluido» (D5). Una baja es una operación explícita
(`desactivar`), nunca una ausencia.

**Topes de una propuesta:** 2.000 tarifas, 500 productos, 2 MB de cuerpo. Por encima, 413 con el
tope en el cuerpo de error. Es a la vez dimensionamiento y defensa contra DoS (§10).

### 2. El contrato común: `PropuestaDeCatalogo`

Vive en `packages/contracts/src/propuesta-de-catalogo.ts` (R3). Es **la** entrada del núcleo y el
contrato de salida de la IA que `ingeniero-ia` propondrá en `docs/09-ia/09-ingesta-de-catalogo-con-ia.md`.
Forma (nombres de código en inglés del lenguaje ubicuo donde existen; los campos ya usados en
`catalogo.ts` y `vigencias.ts` se reutilizan, no se redefinen):

```ts
PropuestaDeCatalogo = {
  version: 1,
  origen: 'PANTALLA' | 'ARCHIVO' | 'API' | 'IA',
  productos: ProductoPropuesto[]          // 1..500
}
ProductoPropuesto = {
  codigo?: string,                        // obligatorio si origen = API (refinamiento)
  nombre, destino, dias, noches,
  formato?: string,                       // nombre del formato de viaje del tenant
  planAlimentacion?: PlanAlimentacion | null,
  inclusiones?: string[], exclusiones?: string[],
  opcionesDeSalida?: { etiqueta, horaSalida?: 'HH:MM', horaRegreso?: 'HH:MM',
                       puntoDeEncuentro?: string }[],     // §3.1; etiqueta única en el producto
  cargosEnDestino?: { concepto, monto: Dinero | null, unidad: 'POR_PERSONA' | 'POR_GRUPO', nota? }[],
  camposPersonalizados?: Record<string, unknown>,
  vigencias: { desde, hasta, publicada?, tarifas: TarifaPropuesta[] }[],   // [] = «a consultar»
  procedencia?: Procedencia
}
TarifaPropuesta = CrearTarifa + { lista?: Dinero | null, promoHasta?: FechaViaje | null,
                                  opcionDeSalida?: string,   // etiqueta de una opción del mismo producto
                                  procedencia? }
Procedencia = { fila?: number, columna?: string,                 // ARCHIVO
                fuente?: string, fragmento?: string,             // IA: URL/archivo y cita literal ≤ 300 car.
                confianza?: number }                             // IA: 0..1, solo informativo
```

Reglas del contrato:

- **Todo valor está tipado**, no es texto: dinero en unidades mínimas + ISO-4217, fechas `date`,
  horas `HH:MM` locales. Convertir texto a tipos es trabajo del **adaptador** (archivo, IA), no del
  núcleo.
- **No lleva `tenantId` ni ningún identificador interno** (`paqueteId`, `vigenciaId`). Una propuesta
  se resuelve por clave natural dentro del tenant de quien la presenta. Un `tenantId` en el cuerpo
  es un campo desconocido y Zod lo rechaza (`.strict()`).
- **Refinamiento por origen:** `API` exige `codigo` en cada producto (una máquina no debe depender
  de la heurística de nombre); `IA` exige `procedencia.fuente` y `procedencia.fragmento` en cada
  precio (sin cita no hay precio: es la defensa contra alucinaciones). `procedencia.confianza` **no
  cambia nunca** lo que se aplica: solo ordena la revisión.
- **Este es el único contrato de la propuesta.** `confianza` es un número `0..1`, no un enum. El
  borrador de `docs/09-ia/09-ingesta-de-catalogo-con-ia.md` (PR #37) usa otro nombre
  (`PropuestaCatalogo`) y una confianza enumerada: **el PR #37 debe alinearse con este contrato**
  antes de integrarse. Si la IA quiere mostrar «alta/media/baja», lo deriva del número en la pantalla.
- Los campos que dependen de M2 (`codigo`, `lista`, `promoHasta`, opciones de salida, cargos, campos
  propios, formato) existen en el contrato desde el día uno; mientras M2 no se aplique, el núcleo responde
  `AVISO CAMPO_NO_SOPORTADO_AUN` y los ignora. Así el contrato no rompe al aplicar M2.

### 3. Clave natural

| Entidad | Clave |
|---|---|
| Paquete | `codigo` si viene; si no, **nombre normalizado + noches** (sin tildes, minúsculas, espacios colapsados). «Piangüita + Ballenas» de 0 y de 1 noche son dos productos |
| Vigencia | `(paquete, desde, hasta)` — ya único en la base |
| Tarifa | `(vigencia, nombre normalizado)` — unicidad de aplicación, protegida por el bloqueo |
| Mayorista | nombre normalizado; si no existe se crea y el informe lo dice |

Si la clave casa con más de un paquete: `ERROR PAQUETE_AMBIGUO`. No se elige en silencio. La
opción de salida se identifica por `(paquete, etiqueta normalizada)`.

### 3.1 Opciones de salida (corrección de la revisión de `experto-turismo`)

Un producto tiene **cero o más opciones de salida**: la variante de operación que el viajero elige
dentro del mismo producto — un turno (City Tour VIP mañana o tarde), una modalidad con su punto de
recogida (Isla Palma por lancha, o terrestre por Tolú con recogida en Marbella 4:30, Bocagrande 4:45
o Centro 5:00), o el hotel en un paquete con hotel. Cada una: `etiqueta`, `hora_salida` y
`hora_regreso` (`time` **sin zona**: hora local del punto de encuentro, como la fecha de viaje es
`date`; convertirla a UTC la rompería con el cambio de huso), `punto_de_encuentro` (texto), `orden`,
`activa`. Una tarifa **puede** referenciar una opción (la lancha y el terrestre cuestan distinto; cada
hotel tiene su precio); una tarifa sin opción vale para todas.

**Tabla, no JSON.** Se decide `opciones_de_salida (id, tenant_id, paquete_id, …)` con
`UNIQUE (id, tenant_id)`, `UNIQUE (paquete_id, etiqueta)`, foránea compuesta
`(paquete_id, tenant_id) → paquetes`, y `tarifas.opcion_de_salida_id` con foránea compuesta
`(opcion_de_salida_id, tenant_id) → opciones_de_salida`. Razones: **una tarifa la referencia**, y una
referencia dentro de un `jsonb` no tiene integridad (borrar la opción dejaría tarifas colgando sin que
la base lo impida); y una tabla con `tenant_id` recibe RLS `USING` y `WITH CHECK` sola por `001`. Que
la opción de una tarifa sea **del mismo paquete** que su vigencia no lo expresa una foránea: lo valida
el núcleo, y es coherencia de dominio, no aislamiento (la foránea compuesta ya impide colgar una
opción de otra agencia). Una opción referenciada por tarifas no se borra: se desactiva.

**Consecuencia en el cotizador, dicha en voz alta.** Es el único punto en que este ADR toca la
selección de tarifas: si un producto tiene tarifas atadas a opciones, la cotización necesita
`opcionDeSalidaId`; sin ella responde `OPCION_DE_SALIDA_REQUERIDA` (no cotiza en silencio la más
barata). La selección filtra tarifas por opción antes de las condiciones existentes; el cálculo de
precio no cambia. Es un eje más de selección, como la acomodación del eje 3 de ADR-0009.

Sustituye a las columnas `hora_salida` y `hora_regreso` de la redacción anterior, que nunca se
aplicaron.

### 4. Los cuatro canales

#### 4.1 Pantalla (CRUD)

Rutas bajo `api/v1/catalogo`, sesión de usuario, permiso `catalogo.administrar`:

| Ruta | Qué hace |
|---|---|
| `GET paquetes` | Listado de gestión: incluye inactivos con filtro; `desde` derivado según §9 (lista vacía = «a consultar») |
| `POST paquetes` | Alta: el formulario arma una `PropuestaDeCatalogo` de **un** producto (`origen: PANTALLA`) y la aplica directamente: el formulario ya es su previsualización |
| `PATCH paquetes/:id` · `POST paquetes/:id/desactivar` | Edición y baja lógica. **Nunca se borra un paquete** (`versiones_cotizacion.paquete_id` es `Restrict`) |
| `GET paquetes/:id/vigencias` · `POST vigencias` · `PATCH vigencias/:id` | Vigencias; `neto` solo con permiso |
| `POST vigencias/:id/tarifas` · `PATCH tarifas/:id` · `DELETE tarifas/:id` | Tarifas. Una tarifa sí se borra: la cotización congela sus números (ADR-0009 §3) |
| `GET tarifas/:id/historial` | Cambios de precio (§8) |

Las ediciones por id son operaciones puntuales, pero **pasan por el mismo validador y el mismo
escritor auditado** del núcleo: un `PATCH` de tarifa construye el estado resultante, lo valida con
las mismas funciones (incluido el empate) y lo escribe por el mismo `AplicadorDeCatalogo`. No existe
un segundo camino de escritura. `CrearPaquete` se rehace sin `temporadas` ni `mayoristaId`
(ADR-0009 los retiró); `CrearPrecio` y `CrearTemporada` quedan `@deprecated`.

#### 4.2 Plantillas (CSV y Excel)

**Dos cosas distintas que conviene no confundir:**

- **Plantilla de tipo de producto** = la fila de `formatos_de_viaje` (ADR-0009 §4, que la decidió
  como etiqueta por tenant). Este ADR le añade una columna **`plantilla jsonb`** validada por Zod
  (`PlantillaDeFormato`): qué campos estándar se piden y cuáles son obligatorios, qué campos
  personalizados de `PAQUETE` aplican, y valores por defecto (`dias`, `noches`, unidad de cobro,
  acomodaciones ofrecidas). Es **solo de entrada y presentación**: sigue sin haber ruta de cálculo
  que ramifique sobre el formato (ADR-0009). Cada tenant recibe al darse de alta copias editables de
  los formatos de sistema —**excursión de un día, pasadía, pasanoche, paquete con hotel**—, igual
  que recibe los roles sembrados. No hay tabla global: nada nuevo para `excepciones_rls`.
- **Plantilla descargable** = el archivo CSV o `.xlsx` que se genera **desde** un formato.

**Generación.** La API expone `GET api/v1/catalogo/formatos/:id/plantilla`, que devuelve un
`DescriptorDePlantilla` JSON (columnas con clave estable, etiqueta, tipo, obligatoriedad, ejemplo,
`version`). **La web renderiza el archivo** a partir del descriptor. Hasta que M2 cree
`formatos_de_viaje`, los descriptores de los cuatro formatos de sistema viven como constantes en
`packages/contracts/src/plantillas-de-catalogo.ts` (`PLANTILLAS_DE_SISTEMA`), y M2 siembra la tabla
desde esas mismas constantes: una sola fuente.

**Formato del archivo.** Una fila = una tarifa; producto y vigencia repetidos; filas del mismo
producto se agrupan. Encabezados = las claves estables del descriptor (`nombre`, `noches`,
`precio_venta`, …). Las opciones de salida van como columnas de la fila (`opcion_salida`,
`hora_salida`, `hora_regreso`, `punto_encuentro`): la City Tour VIP es una fila por turno y por
tarifa; filas con el mismo producto y la misma `opcion_salida` describen la misma opción, y si sus
horas difieren es `ERROR OPCION_INCOHERENTE`. Versionado:

- CSV: primera línea `#viajapro;plantilla=<clave-formato>;version=<n>`. UTF-8 con BOM, separador `;`
  (el que Excel en español abre sin preguntar), y el lector acepta también `,`.
- `.xlsx`: hoja `Catalogo` con los datos y hoja oculta `_viajapro` con `{formato, version}`; celdas
  de dinero y fecha con validación de datos de Excel como ayuda, **no** como control.
- Si el marcador está presente y los encabezados coinciden, el mapeo es automático (confianza 1).
  Sin marcador (la hoja propia de la agencia), el mapeo lo sugiere el `SugeridorDeMapeo` por
  sinónimos y la persona lo confirma. **Cambio incompatible de columnas = `version` nueva**; el
  servidor acepta la versión anterior durante 6 meses.

**Lectura y validación.** El archivo **se lee en el navegador** (CSV con lector propio; `.xlsx` con
una biblioteca que añade una persona, porque `**/package.json` es `humanRequired`; *no verificado*
cuál conviene ni su licencia — `exceljs` y SheetJS son candidatas, y la decisión va en la tarea). La
web envía `{ tabla: { encabezados, filas: string[][] }, mapeo }`; el servidor la convierte en
`PropuestaDeCatalogo` con un adaptador puro (`origen: ARCHIVO`, `procedencia.fila/columna`) y la pasa
al núcleo. Razones de leer en el navegador: el servidor no carga analizadores de zip (bomba de
descompresión) ni `multipart`, y la seguridad no depende del cliente porque el servidor valida cada
celda como si viniera de un desconocido. El navegador rechaza archivos de más de 5 MB antes de
abrirlos. Topes de la tabla: 2.000 filas × 40 columnas.

Desglose en tareas: `docs/_backlog/catalogo-gestionable-tareas.yaml` (T-032 en adelante; las
pantallas son tareas del carril frontend T-017, T-018 y T-028 a T-031 de `roadmap/tasks.yaml`).

Rutas: `POST api/v1/catalogo/importaciones/previsualizar` (sin escritura) y
`.../confirmar` (mismo cuerpo + huella). **Ambas aceptan `{ tabla, mapeo }` o `{ propuesta }`**: la
pantalla de revisión de la IA usa las mismas dos rutas. D4: todo o nada.

#### 4.3 API pública — ver §6.

#### 4.4 IA — ver §7.

### 5. Permisos

| Permiso | Qué permite | Migración |
|---|---|---|
| `catalogo.administrar` (nuevo) | Crear, editar, desactivar, importar, confirmar propuestas de la IA, cambiar la política `promo_vencida` | M1 |
| `cotizacion.ver_neto_y_margen` (existe) | Además, **leer y escribir neto**. Una petición que trae neto sin él responde 403; no lo ignora (D6) | — |
| `integraciones.administrar` (nuevo) | Crear, rotar y revocar claves de API | M3 |

Por defecto (D2) `catalogo.administrar` va a `DUENO` y `OPERACIONES`; `integraciones.administrar`
solo a `DUENO`, porque una clave cambia precios sin que una persona pulse nada. No hay permiso
separado para «cambiar precios» (no pasa la primera pregunta de ADR-0006).

### 6. API pública de catálogo

#### 6.1 Rutas y versionado

Prefijo **`/api/v1/publica/catalogo`**. El prefijo `publica` separa dos mundos que no se mezclan:
estas rutas **solo** aceptan clave de API y rechazan cookie de sesión; las demás rutas **rechazan**
`Authorization: Bearer vjp_…`. Un cambio incompatible es `/api/v2/publica/…`, con `v1` vivo 12 meses.

| Ruta | Ámbito | Qué hace |
|---|---|---|
| `GET productos` · `GET productos/:codigo` | `catalogo:leer` | Catálogo del tenant de la clave; neto solo con `catalogo:neto` |
| `POST propuestas?simular=true` | `catalogo:escribir` | Valida y planifica; devuelve el informe. No escribe |
| `POST propuestas` | `catalogo:escribir` | Aplica (todo o nada) y devuelve informe. Exige `Idempotency-Key` |
| `POST productos/:codigo/desactivar` | `catalogo:escribir` | Baja lógica explícita |

Escribir o leer neto exige además el ámbito `catalogo:neto`. Los contratos de respuesta viven en
`packages/contracts` y se publican como OpenAPI generado de los mismos Zod (`packages/sdk`).

#### 6.2 Claves por agencia y R1

- **Formato:** `vjp_live_<prefijo 10>_<secreto 32 bytes base64url>`. El prefijo `vjp_` permite a
  los escáneres de secretos (regla de `gitleaks`) detectarla si se filtra a un repositorio.
- **Almacenamiento:** tabla `claves_api` (M3) con `tenant_id`, `nombre`, `prefijo` (único global),
  `hash_secreto` = `sha256(secreto)` (el secreto tiene 256 bits de entropía: no necesita KDF lento),
  `ambitos text[]`, `creada_por`, `creada_en`, `expira_en` (nulable), `revocada_en`, `revocada_por`,
  `ultimo_uso_en`. **El secreto se muestra una vez** al crearla y no se guarda en ninguna parte.
  Comparación en tiempo constante.
- **R1, el tenant sale de la clave y de nada más.** Hay que encontrar la clave *antes* de conocer el
  tenant. **La redacción anterior no funcionaba** (hallazgo crítico de `auditor-seguridad`): una
  función `SECURITY DEFINER` que lee `claves_api` —tabla de negocio con `tenant_id` y RLS forzada— ve
  cero filas si su dueño no tiene `BYPASSRLS`, y darle `BYPASSRLS` es la escalada que ADR-0008
  prohíbe. ADR-0008 y ADR-0011 resuelven siempre sobre **tablas globales** declaradas en
  `excepciones_rls` (`enrutamiento_canales`, `accesos_identidad`). Se hace igual:
  1. **`claves_api`** sigue siendo tabla **por tenant con RLS** (la gestionan las pantallas, bajo
     `conTenant`).
  2. **`directorio_claves_api`**, tabla **global sin `tenant_id`**: `prefijo` (PK), `hash_secreto
     bytea`, `tenant_resuelto_id`, `clave_id`, `ambitos`, `expira_en`, `revocada_en`. Declarada en
     `excepciones_rls` con `'{}'` para `viajapro_app`, `viajapro_altas`, `viajapro_webhook` y
     `viajapro_identidad`: **ningún rol de login la lee ni la escribe**.
  3. Su dueño es un rol nuevo **`viajapro_claves`**, `NOLOGIN` y `NOBYPASSRLS`, del que ningún rol de
     login es miembro (mismo patrón que `viajapro_accesos`, R2).
  4. Un **disparador `SECURITY DEFINER` de `viajapro_claves` sobre `claves_api`** mantiene el
     directorio en `INSERT` y `UPDATE` (revocar, vencer) —patrón de `sincronizar_acceso_identidad`—
     y **rechaza todo `UPDATE` de `tenant_id`** en `claves_api`.
  5. **`resolver_clave_api(p_prefijo, p_hash)`**, propiedad de `viajapro_claves`, `LANGUAGE sql
     STABLE STRICT`, `SET search_path = ''`, nombres calificados, sin SQL dinámico. Filtra por
     prefijo **y** hash, no revocada, no vencida y tenant no suspendido; devuelve
     `(clave_id, tenant_id, ambitos)`. Orden fijo en la migración: `REVOKE ALL ... FROM PUBLIC`,
     `GRANT EXECUTE ... TO viajapro_app`, **después** `OWNER TO viajapro_claves`.
  6. Aserciones en `aislamiento.spec.ts`: ningún rol de login lee `directorio_claves_api`; el dueño
     no tiene `BYPASSRLS` ni `LOGIN`; nadie es miembro de `viajapro_claves`; la función solo es
     ejecutable por `viajapro_app`.

  `TenantMiddleware` gana una rama para `/api/v1/publica/**`: resuelve la clave por la función y
  establece el contexto con ese `tenantId`, igual que hoy con la sesión. **Ningún `tenantId` del
  cuerpo, la ruta o una cabecera se lee nunca**; la propuesta no tiene campo para él (§2). Son dos
  funciones `SECURITY DEFINER` más (disparador y resolutor) sobre las **once** que ya hay, y pasan
  por `auditor-seguridad` como las demás.
- **Los ámbitos no superan los permisos de quien crea la clave** (hallazgo alto de
  `auditor-seguridad`). Tener `integraciones.administrar` no basta: `catalogo:escribir` exige además
  `catalogo.administrar`, y `catalogo:neto` exige `cotizacion.ver_neto_y_margen`; `catalogo:leer` no
  exige más. Se comprueba con `permisoQueFalta` (`identity/domain/permisos-incluidos.ts`), el mismo
  patrón que impide invitar a alguien con más permisos de los propios; si falta uno, 403.
- **Propiedad:** las claves son credenciales, así que su gestión (crear, listar, rotar, revocar) y su
  resolución viven en **`identity`**, junto a sesiones e invitaciones. El middleware las consulta por
  el puerto `ResolutorDeAcceso` que ya usa para la sesión (`shared/puertos/puerto-de-acceso.ts`),
  ampliado con una entrada `clave`. `quoting` no sabe que existen claves: recibe un contexto con
  tenant, actor y ámbitos.
- **Rotación:** crear una clave nueva, desplegarla en el sistema cliente, revocar la vieja. Las dos
  conviven el tiempo que la agencia quiera; `expira_en` opcional para forzarlo.
- **Revocación inmediata:** el disparador propaga `revocada_en` al directorio en la misma
  transacción, y no hay caché de la resolución (búsqueda por clave primaria). Si el volumen lo exige, caché de 30 s como máximo, y se escribe en el ADR que la supersede.
- `ultimo_uso_en` se actualiza como mucho una vez por minuto por clave (no una escritura por petición).

#### 6.3 Límites de tasa

Sobre el mecanismo de T-002, con **la clave** como sujeto además del tenant: 60 lecturas/min y 10
escrituras/min por clave por defecto, configurables por variable de entorno; 429 con `Retry-After`.
Una escritura además cuenta por sus tarifas: como mucho 10.000 tarifas/hora por tenant entre todas
sus claves. Contadores en Redis (ya en `apps/api`).

#### 6.4 `Idempotency-Key`

Obligatoria en `POST propuestas` (400 si falta). Se guarda en Redis
`(tenant, clave_id, idempotency-key) → { sha256 del cuerpo, respuesta }` durante 24 h:

- misma clave + mismo cuerpo → la respuesta guardada, sin re-aplicar;
- misma clave + cuerpo distinto → 422 `IDEMPOTENCY_KEY_REUTILIZADA`;
- petición en curso con la misma clave → 409.

**Redis y no una tabla**, a propósito: la corrección ya la da la convergencia (§1). Si Redis pierde
la entrada, re-aplicar converge al mismo catálogo; solo cambia que la respuesta diga «sin cambios»
en vez de repetir la original. Una tabla añadiría migración y limpieza para garantizar algo que no
hace falta garantizar.

#### 6.5 Auditoría del actor

Toda escritura por API registra en `registros_auditoria` `usuario_id = null` y **`clave_api_id`**
(columna nueva en M3, foránea compuesta a `claves_api`), más `ip`. «¿Quién bajó este precio?» se
responde con «la clave *ERP mayorista* de la agencia, creada por Fulana, el 3 de noviembre a las
14:02 desde 200.x.x.x». La creación, rotación y revocación de claves también se auditan.

### 7. Ingesta por IA: frontera y contrato

El diseño (modelo, *prompts*, extracción de PDF e imagen, coste, cola) es de `ingeniero-ia` en
`docs/09-ia/09-ingesta-de-catalogo-con-ia.md`; aquí no se duplica. Este ADR fija **la frontera**:

1. **La salida de la IA es una `PropuestaDeCatalogo` con `origen: IA`**, con `procedencia.fuente` y
   `procedencia.fragmento` en cada precio (§2). Nada más sale de la IA hacia el catálogo.
2. **La IA nunca escribe.** El adaptador de IA no tiene acceso al `AplicadorDeCatalogo`. La única
   vía es: propuesta → `importaciones/previsualizar` → pantalla de revisión → una **persona con
   `catalogo.administrar` en sesión** pulsa «Confirmar» → `importaciones/confirmar`. Una propuesta
   `origen: IA` **presentada con clave de API se rechaza** (403): la IA no se automatiza por la
   puerta de atrás.
3. La persona puede editar o descartar productos de la propuesta antes de confirmar; lo que se
   confirma es la propuesta resultante, todo o nada.
4. **La IA nunca propone neto.** Sin excepciones: el adaptador descarta cualquier neto que el modelo
   devuelva, sea cual sea la fuente o el permiso de quien la subió. El neto entra por pantalla,
   archivo o API, con su permiso. (Sustituye la excepción «documento subido con permiso» de la
   redacción anterior; unificado con `docs/09-ia/09-…`.)
4b. **El obtenedor de URLs es un proceso aparte**, no el consumidor de `apps/api`: sin variables de
   conexión a la base, sin secretos (ni siquiera la clave del modelo), cuya única salida a internet
   pasa por una regla de red que **niega los rangos privados**, *loopback*, *link-local* y metadatos
   de nube. Solo `https` (no `http`, no puerto 80). Devuelve bytes y metadatos; quien llama al modelo
   es otro componente. Si el PR #37 dice otra cosa, prevalece este punto y el PR #37 se alinea.
4c. **Condiciones de activación con agencias reales**, todas, antes de encenderla para una agencia
   que no sea de demostración: acuerdo de tratamiento de datos (DPA) firmado con el proveedor del
   modelo; aviso a la agencia, que es la responsable del tratamiento de lo que sube; pruebas de SSRF
   en verde en CI; y la regla de red de 4b verificada en el entorno desplegado. Sin las cuatro, la
   función queda apagada por configuración.
5. Es un servicio externo: va detrás de un puerto (`ExtractorDeCatalogo`, en `quoting/application/`),
   con su adaptador de Claude. CLAUDE.md §10: se integra con el ADR de `ingeniero-ia` y la revisión
   de seguridad, no antes.
6. El `SugeridorDeMapeo` por sinónimos (columnas de una hoja) se construye ya; un adaptador de IA de
   ese mismo puerto es una ampliación posterior que decide `ingeniero-ia`.

### 8. Auditoría de cambios de precio

Todo alta, cambio o borrado de tarifa escribe en `registros_auditoria`, **en la misma transacción**:
`accion` (`catalogo.tarifa.creada | .modificada | .eliminada`), `entidad = 'tarifa'`, `entidad_id`,
actor (`usuario_id` o `clave_api_id`), y `detalle` con
`{ campo, antes, despues, moneda, origen: 'PANTALLA' | 'ARCHIVO' | 'API' | 'IA', huella? }` para
`venta`, `neto`, `lista` y `promo_hasta`. Una confirmación de lote escribe además
`catalogo.propuesta_aplicada` con la huella, el resumen y —en archivo— el mapeo sugerido y el
confirmado. En `origen: IA` el actor es **la persona que confirmó**; la fuente va en el detalle.

- **Misma transacción, no evento:** no existe módulo `audit`; `quoting` declara el puerto
  `RegistroDeCambios` y su adaptador inserta con el mismo `tx` (R4). T-006 ya escribe en esta tabla
  desde `crm`: si conviene, se comparte el escritor por `shared/`, sin importar `crm`.
- El historial **redacta `neto`** sin `cotizacion.ver_neto_y_margen`.
- La convergencia es silenciosa: una carga que no cambia un precio no escribe fila de precio.

### 9. Promociones: «desde», precio de lista y la política `promo_vencida`

- **«Desde»**: derivado, nunca guardado, y **solo sobre tarifas base y por moneda** (corrección de
  `experto-turismo`). Tarifa base = sin condición de edad (adulto), ocupa silla, **no aditiva**, de
  una vigencia activa con `hasta ≥ hoy` en la zona del tenant. El mínimo per cápita se calcula **por
  separado en cada moneda**: `desde` es una lista `Dinero[]` (uno por moneda, nunca se suman ni se
  comparan COP con USD; no se convierte con TRM). Sin tarifas base, la lista es vacía y el producto
  se muestra «a consultar». Sin esta regla, una tarifa infante a 0 o un suplemento de sencilla
  aditivo darían «desde $0» o un precio que nadie puede comprar: publicidad engañosa. Una sola
  función pura, `calcularDesde` en `@viajapro/domain`, la usan el listado de gestión, las salidas
  publicadas (`SalidaPublicada.desde`, que hoy calcula el suyo) y la API pública.
- **Precio de lista**: `tarifas.lista_unidades` (nulable, `CHECK lista > venta`) y `tarifas.promo_hasta`
  (`date`, nulable; sin fecha = promo sin vencimiento). **`venta` es siempre lo que se cobra; `lista`
  nunca entra en el cálculo ni en la cotización congelada.**
- **El precio nunca cambia solo.** Al vencer `promo_hasta` (fin del día en la zona del tenant, R9) la
  `venta` sigue igual. Revertirla sola metería la dimensión «fecha de compra» que ADR-0009 reservó
  para un ADR propio, y cambiaría el precio de una agencia sin que nadie lo decidiera. Esto vale en
  todos los valores de la política.

**Política por agencia `promo_vencida` (R12, decisión del propietario que sustituye a la D3
anterior).** Qué se **muestra** cuando la promo venció es política de negocio, no invariante:

| Valor | Qué se muestra con la promo vencida |
|---|---|
| **`OCULTAR`** (por defecto) | Solo la venta vigente. Sin tachado, sin leyenda, sin rastro de la promo |
| `TACHAR` | La lista tachada junto a la venta, con la leyenda «promo vencida» |

Con la promo vigente, los dos valores muestran la lista tachada sin leyenda.

**Por qué `OCULTAR` por defecto.** Tras el vencimiento la `venta` no baja ni sube: lo que se cobra
sigue siendo el precio promocional. Mostrar un precio anterior tachado sugiere una rebaja que ya no
tiene fecha de fin, que es justo la práctica que una norma de protección al consumidor mira con
lupa (*no verificado* contra la Ley 1480 de 2011 ni la circular de la SIC sobre promociones;
pregunta para `investigador`). La opción conservadora es la que no puede leerse como anuncio
engañoso; la agencia que quiera tachar lo elige a sabiendas.

**Dónde vive.** Columna `politicas_de_precio.promo_vencida` (enum `OCULTAR | TACHAR`, `NOT NULL
DEFAULT 'OCULTAR'`) en **M2**. Razones: `politicas_de_precio` ya es la fila de política comercial del
tenant y ya contiene política de presentación (`modo_de_catalogo`, «afecta a la interfaz, nunca al
cálculo»); no existe otra tabla de configuración general del tenant (`tenants` guarda identidad y
mercado, no política); y un campo personalizado no sirve porque esos describen entidades, no a la
agencia. Al ser `DEFAULT` en una tabla de una fila por tenant, no reescribe nada.

**Quién lo cambia:** `catalogo.administrar`, por `GET/PATCH api/v1/catalogo/ajustes` (solo este
campo; no se abre aquí la persistencia completa de la política de margen, que sigue pendiente y es
otra decisión). El cambio se audita (`catalogo.ajustes.modificado`, antes y después).

**Una sola función decide, en todos los puntos que muestran precio.** `presentarPrecio(tarifa, hoy,
politica)` en `@viajapro/domain`, pura, devuelve `{ venta, listaTachada: Dinero | null,
leyenda: 'PROMO_VENCIDA' | null, promoVigente: boolean }`. **La API la aplica y devuelve el resultado
ya decidido** (`presentacion`) en: listado de gestión, salidas publicadas, cotización, y la vista de
revisión de propuestas (incluida la de la IA). La web **no decide**: pinta `presentacion`. El PDF y
el enlace público de cotización **no existen hoy** (verificado); cuando existan, consumen la misma
`presentacion` y su ADR o tarea lo cita como criterio. La cotización congelada guarda la `venta` y
**no** guarda la lista (ADR-0009 §3: la cotización es lo que se cobra).

**API pública:** expone los datos crudos **y** la decisión, para que el consumidor decida con
información explícita: `venta`, `lista`, `promoHasta`, `promoVigente: boolean`, y
`presentacionSugerida: 'SIN_PROMO' | 'TACHAR' | 'OCULTAR'` según la política de la agencia. Nunca se
omite `promoVigente`: un sistema externo que pinte `lista` sin mirarlo es un error suyo, documentado.

### 10. Amenazas nuevas y mitigación

| Amenaza | Canal | Mitigación |
|---|---|---|
| **Fuga entre agencias por tenant en el cuerpo** | API, archivo | La propuesta no tiene campo de tenant (`.strict()`); el tenant sale de la clave (§6.2) o la sesión; RLS + foráneas compuestas; prueba e2e «clave de A no lee ni escribe en B» en cada ruta pública |
| **Clave de API filtrada** | API | Solo hash en la base; mostrada una vez; prefijo detectable por escáneres; ámbitos mínimos (`catalogo:neto` aparte); revocación inmediata sin caché; `ultimo_uso_en` e IP auditadas; límite por clave; la pantalla de claves muestra último uso para detectar claves huérfanas |
| **Escalada desde las funciones `SECURITY DEFINER`** | API | Directorio global sin `tenant_id` en `excepciones_rls`, dueño `viajapro_claves` `NOLOGIN NOBYPASSRLS` sin miembros, disparador que prohíbe cambiar `tenant_id`; las reglas de ADR-0008 §1.4; aserciones en `aislamiento.spec.ts` (§6.2) |
| **Clave con más poder que quien la creó** | API | Ámbitos acotados por `permisoQueFalta` (§6.2) |
| **SSRF** cuando la IA obtiene una URL | IA | Lo detalla `ingeniero-ia`; mínimos que este ADR exige: solo `https`, puertos 443; resolución DNS hecha **antes** de conectar y rechazo de IP privadas, *loopback*, *link-local* y metadatos de nube (169.254.169.254), también tras cada redirección (máx. 3); sin cookies ni credenciales; tope de 5 MB y 15 s; el obtenedor es un **proceso aparte** sin acceso a la base ni a secretos, con salida a internet por una regla de red que niega rangos privados (§7.4b). Solo `https`: el borrador de `docs/09-ia/09-…` que admite `http`/80 se alinea con esto |
| **Inyección de instrucciones** en la página, PDF o imagen | IA | El contenido leído es **dato, nunca instrucción**: va delimitado y el modelo solo puede responder con el esquema `PropuestaDeCatalogo` (salida estructurada, validada por Zod; lo que no valida se descarta); el modelo **no tiene herramientas** que escriban ni que lean otros datos del tenant; y el control final es humano: nada se aplica sin previsualización y confirmación en sesión (§7). Cada precio exige su `fragmento` literal, que la pantalla muestra junto al valor |
| **Datos de la agencia hacia un tercero** (netos, lista de precios) | IA | Puerto + adaptador, ADR de `ingeniero-ia`, revisión de seguridad; la IA nunca propone neto; activación condicionada a DPA y aviso a la agencia (§7.4c) |
| **Importación masiva como DoS** | Archivo, API, IA | Topes por propuesta (§1); 413 antes de validar; límites por clave y por tenant (§6.3); `pg_advisory_xact_lock` por tenant serializa las escrituras de un tenant sin bloquear a los demás; tope de tiempo de la transacción (`statement_timeout` local de 10 s); en IA, tope de documentos por tenant y día (lo fija `ingeniero-ia`) |
| **Bomba de descompresión / analizador vulnerable** (`.xlsx`) | Archivo | El servidor nunca abre archivos: recibe JSON. El navegador rechaza más de 5 MB antes de abrir |
| **Inyección de fórmulas** en el CSV/XLSX que **descargamos** | Plantillas | Toda celda generada que empiece por `= + - @` o tabulador se prefija con `'` |
| **Reutilización de `Idempotency-Key` con otro cuerpo** | API | 422 `IDEMPOTENCY_KEY_REUTILIZADA` (§6.4) |
| **Cambio de precio sin autor** | Todos | Auditoría en la misma transacción con actor persona o clave (§8) |

### 11. Relación con ADRs anteriores

- **ADR-0006:** no cambia su regla; su inventario de campos personalizados pasa a incluir
  **paquete**, y `promo_vencida` entra como política de nivel 1 (valor por tenant).
- **ADR-0008:** la resolución de tenant por clave de API reutiliza su patrón de función
  `SECURITY DEFINER` y sus cuatro reglas.
- **ADR-0009:** no cambia ninguna de sus resoluciones. Construye `TripFormat` (que decidió y no se
  hizo) y le añade una plantilla de **entrada**, no de cálculo. El precio de lista no abre la
  dimensión de fecha de compra.
- **ADR-0011:** dos permisos más por el mismo mecanismo; `TenantMiddleware` gana una segunda fuente
  de identidad (clave), excluyente con la sesión.
- **R5:** el núcleo es idempotente por convergencia; la API pública añade `Idempotency-Key`.

### 12. Qué cambia en el esquema

**Sin migración** (tareas del ciclo autónomo): el contrato común y el núcleo; todo el CRUD con las
columnas actuales; «desde» derivado; plantillas CSV de los formatos de sistema desde constantes;
importación CSV completa; auditoría con usuario; `SugeridorDeMapeo` por sinónimos. Mientras no llegue
M2: el pasadía se guarda con `SIN_ALIMENTACION`, no hay precio de lista, los cargos en destino son
texto en `exclusiones`. Deuda declarada.

**Con migración — del Owner:**

| # | Contenido | Estado |
|---|---|---|
| **M1** | Permiso `catalogo.administrar` en el `CHECK roles_permisos_del_catalogo` y en `PERMISOS`; concedido a `DUENO` y `OPERACIONES` de los tenants existentes y de la semilla | **Autorizada** (2026-10-26) |
| **M2** | `paquetes`: `plan_alimentacion` nulable, `codigo varchar(64)` + único parcial `(tenant_id, codigo) WHERE codigo IS NOT NULL AND eliminado_en IS NULL`, `cargos_en_destino jsonb default '[]'`, `campos_personalizados jsonb default '{}'` + GIN, `formato_id` con foránea compuesta. Tabla **`opciones_de_salida`** (`id, tenant_id, paquete_id, etiqueta, hora_salida time, hora_regreso time, punto_de_encuentro, orden, activa`) con `UNIQUE (id, tenant_id)`, `UNIQUE (paquete_id, etiqueta)` y foránea compuesta `(paquete_id, tenant_id)` (§3.1; **sustituye** a las columnas `hora_salida`/`hora_regreso` en `paquetes`). `tarifas`: `lista_unidades bigint`, `promo_hasta date`, `CHECK (lista_unidades IS NULL OR lista_unidades > venta_unidades)`, `opcion_de_salida_id` nulable con foránea compuesta `(opcion_de_salida_id, tenant_id)`. `entidad_personalizable` + `PAQUETE`. Tabla `formatos_de_viaje (id, tenant_id, nombre, orden, activo, plantilla jsonb default '{}')` con `UNIQUE (id, tenant_id)` y `UNIQUE (tenant_id, nombre)`, sembrada con los cuatro formatos de sistema por tenant. `politicas_de_precio.promo_vencida` enum `OCULTAR | TACHAR` `NOT NULL DEFAULT 'OCULTAR'` | **Autorizada** (2026-10-26) |
| **M3** | Rol `viajapro_claves` (`NOLOGIN NOBYPASSRLS`, sin miembros); tabla `claves_api` por tenant con RLS y `UNIQUE (id, tenant_id)`; tabla global `directorio_claves_api` sin `tenant_id`, en `excepciones_rls` con `'{}'` para los cuatro roles de login; disparador `SECURITY DEFINER` de `viajapro_claves` que mantiene el directorio y prohíbe cambiar `tenant_id`; función `resolver_clave_api` de `viajapro_claves` (§6.2); `registros_auditoria.clave_api_id uuid` nulable con foránea compuesta; permiso `integraciones.administrar` en el `CHECK`, concedido a `DUENO`; literal de `aislamiento.spec.ts` ampliado con la excepción nueva (R1) | **Bloqueada** hasta implementar §6.2 tal como queda tras la revisión; del Owner |
| **M4** | *Condicional.* Tabla `propuestas_de_catalogo` (tenant, origen, contenido cifrado, huella, creada_por, expira_en) **solo si** `ingeniero-ia` concluye que la generación es asíncrona y la propuesta debe sobrevivir a la sesión. Si la IA responde en la misma petición, no existe | **Pendiente** de `docs/09-ia/09-…` |

Notas: todas las columnas de M2 son nulables o con valor por defecto y no reescriben filas.
`ALTER TYPE ... ADD VALUE` no puede usarse en la misma transacción que lo añade. `aislamiento.spec.ts`
debe incluir `formatos_de_viaje` y `opciones_de_salida` (M2), y `claves_api` y
`directorio_claves_api` (M3) en sus aserciones y mutantes (T-009).

**Diferido sin migración prevista:** *staging* de importación (opción C), precio por fecha de compra,
días de operación por semana, CRUD independiente de mayoristas, *webhooks* salientes de cambios de
catálogo hacia los sistemas cliente.

## Consecuencias

### Positivas
- Una agencia carga su catálogo sola, por la vía que tenga: formulario, hoja, su sistema o su web.
- **Una sola implementación de las reglas**: una regla nueva del catálogo se escribe una vez y la
  respetan los cuatro canales.
- El cotizador no cambia su cálculo de precio; gana un eje de selección (la opción de salida, §3.1).
- Todo cambio de precio tiene autor (persona o clave), hora, antes y después.
- La primera rebanada visible (excursión de un día desde la web + plantilla CSV) solo espera a M1.

### Negativas
- **La clave natural es heurística sin `codigo`** en pantalla y archivo; renombrar crea otro
  producto. La API lo evita exigiendo `codigo`.
- **Superficie nueva grande:** escritura bajo RLS, una segunda fuente de identidad (claves), una
  función `SECURITY DEFINER` más y contenido externo hacia un modelo. Cada pieza pasa por
  `auditor-seguridad`.
- **Una dependencia nueva en la web** para `.xlsx`.
- **Previsualizar y confirmar validan dos veces.** Irrelevante con 2.000 filas.
- `cargos_en_destino` y `formatos_de_viaje.plantilla` son `jsonb` cuya forma solo protege Zod.
- Entre M1 y M2 hay deuda visible (pasadía con plan falso, sin tachado, cargos como texto).

### Qué habría que cambiar para revertir esto
Quitar rutas y volver a semillas; las columnas de M2 quedan sin uso. Revocar todas las claves y
retirar `/publica` es inmediato. Lo caro de revertir es `formatos_de_viaje` cuando las agencias la
hayan llenado, y eso ya lo había decidido ADR-0009.

## Cuándo revisar esta decisión

- **Una carga real de más de 2.000 tarifas** o que tarde más de 10 s en confirmar: opción C.
- **Dos agencias que pidan separar «editar producto» de «cambiar precio»:** permiso propio.
- **Una agencia cuyo precio cambie solo por fecha de compra:** el ADR que ADR-0009 reservó.
- **`PAQUETE_AMBIGUO` o duplicados por renombre en más de una de cada diez cargas:** `codigo`
  obligatorio en todos los canales.
- **Una clave de API usada desde una IP que la agencia no reconoce**, o una agencia que lo pida:
  lista de IP permitidas por clave.
- **Más del 30 % de los precios propuestos por la IA corregidos a mano** en la revisión: se revisa el
  diseño de `ingeniero-ia` antes de ampliar fuentes.

---

## Cola (revisión del 2026-10-26; no bloquea, R13)

Van a `roadmap/tasks.yaml` o a `ESTADO.md` con su dueño cuando se planifiquen. Ninguna detiene M1 ni M2.

**Dominio (`experto-turismo`):**

| Pendiente | Dueño |
|---|---|
| Política de cancelación y condiciones por producto | `analista-producto` + `experto-turismo` |
| Adicionales opcionales con precio (Biopark +20.000, traslado al Oceanario) | `arquitecto` (ADR propio: toca el cálculo) |
| Restricción de admisión (Luxury Beach Club solo mayores de 12): el cotizador debe **rechazar**, no cotizar en silencio | `arquitecto` + `backend` |
| Tarifa por residencia o nacionalidad | `experto-turismo` |
| Comisión frente a neto por tarifa | `arquitecto` (relación con `politicas_de_precio.base`) |
| Precio de fin de semana o festivo | `arquitecto` (es la dimensión de calendario que ADR-0009 reservó) |
| Si el precio publicado incluye IVA | `experto-turismo` + `investigador` |
| `AVISO PROMO_SIN_VIGENCIA` al cargar una promo sin `promoHasta`: la Ley 1480 art. 33 parece exigir vigencia (**no verificado**) | `investigador`, luego `backend` |

**Seguridad (`auditor-seguridad`):**

| Pendiente | Dueño |
|---|---|
| `registros_auditoria` es modificable y borrable por los roles de login: disparador que lo impida | `datos` (migración del Owner) |
| `lock_timeout` junto a `statement_timeout` en la transacción de aplicar | `backend` |
| Tope de 2 MB por ruta y límite por IP **antes** de autenticar en `/api/v1/publica/**` | `backend` + `devops` |
| Redacción de `Authorization` y `Cookie` en los registros, y prueba de que `vjp_` nunca aparece en ellos | `devops` |
| Qué pasa con las claves cuando se da de baja a quien las creó | `analista-producto` + `auditor-seguridad` |
| `origen` de la propuesta lo deriva el servidor del canal (ruta y credencial), no lo declara el cliente | `backend` (en T-037 y T-047) |
| El atajo `x-dev-tenant-id` no aplica en `/api/v1/publica/**`, ni siquiera con `APP_ENV=local` | `backend` (en T-046) |
| Fórmulas en `.xlsx` generado: escribir las celdas como texto, no solo prefijar `'` | `frontend` (en T-044) |

## 13. Fuera de alcance

Sincronización bidireccional con sistemas de mayoristas · *webhooks* salientes · pieza de WhatsApp
generada desde el catálogo · fotos del producto (S3) · días de operación por semana · precio por
fecha de compra · CRUD independiente de mayoristas · PDF y enlace público de cotización (cuando
existan, respetan §9).

## 14. Decisiones del propietario

| # | Pregunta | Resolución (2026-10-26) |
|---|---|---|
| D1 | Formato de hoja | **CSV y `.xlsx`**, con plantillas descargables por tipo de producto (§4.2). Sustituye el valor por defecto «solo CSV» |
| D2 | Quién puede cambiar precios | Por defecto: `DUENO` y `OPERACIONES`; `ASESOR` no; sin permiso separado |
| D3 | Promos vencidas | **Política por agencia `promo_vencida`: `OCULTAR` (por defecto) o `TACHAR`**; la cambia quien tiene `catalogo.administrar`; **la venta nunca cambia sola** (§9). Sustituye el comportamiento fijo anterior |
| D4 | Carga con errores | **Todo o nada** en archivo y API (transaccional, con informe). La IA siempre pasa por previsualización y confirmación humana |
| D5 | Lo que no viene en la carga | Por defecto: se deja y se lista |
| D6 | Neto sin permiso | Por defecto: 403 |
| D7 | IA | **Canal de alta completo** sobre contenido no estructurado (URL, PDF, imagen, texto), siempre como propuesta revisada (§7). Sustituye «diferida» |
| D8 | Orden de migraciones | Por defecto: M1 ya; M2 al acabar la rebanada de importación CSV. M3 tras la revisión de seguridad |
| D9 | Canales | **Cuatro:** pantalla, plantillas, API pública, IA, sobre un solo núcleo |

## Entradas propuestas al lenguaje ubicuo

No se edita el diccionario en este ADR. Para aprobación: **Precio de lista** (`listPrice`) ·
**Promo hasta** (`promoUntil`) · **Política de promo vencida** (`expiredPromoDisplay`) · **Cargo en
destino** (`OnSiteCharge`) · **Propuesta de catálogo** (`CatalogProposal`) — lo que cualquier canal
presenta para cambiar el catálogo; nunca se aplica sin validar · **Previsualización**
(`ProposalPreview`) · **Huella de propuesta** (`proposalFingerprint`) · **Plantilla de catálogo**
(`CatalogTemplate`) — distinta de la plantilla de WhatsApp · **Clave de API** (`ApiKey`) ·
**Opción de salida** (`DepartureOption`) — variante de operación que el viajero elige dentro de un
mismo producto: turno, modalidad con su punto de recogida, u hotel; puede tener tarifas propias ·
**Adicional opcional** (`OptionalExtra`) — algo que se contrata aparte del producto con su propio
precio (Biopark, traslado al Oceanario); aún no modelado, ver «Cola» · **Restricción de admisión**
(`AdmissionRestriction`) — condición que impide vender el producto a un viajero (edad mínima); no es
una tarifa: si no se cumple, no se cotiza; aún no modelada, ver «Cola». Y se retira
la nota «aún no existe como tabla» de **Formato de viaje** cuando M2 se aplique.
