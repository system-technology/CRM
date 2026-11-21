# HU-inbox-1 — Etiquetar un chat con un toque y filtrar la bandeja por etiqueta

| | |
|---|---|
| Tarea | T-323 (B0 del [roadmap JD Tours](../../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md), eje B) |
| Fecha | 2026-11-21 |
| Contexto | `inbox` (la etiqueta se asigna a la conversación). `crm` no cambia |
| Siguiente | T-324 (base), T-325 (API), T-326 (pantalla). Esta historia dice **qué**; ellas, **cómo** |
| Validación de dominio | `experto-turismo` y `analista-producto`, §8 |

**Como** asesora de una agencia de turismo que atiende desde el celular
**quiero** marcar cada chat con etiquetas de color de mi agencia («Seguimiento», «Pago pendiente»…) con
un toque, verlas en la lista y filtrar la bandeja por ellas
**para** saber de un vistazo qué chats tengo que mover hoy, como hago ahora en WhatsApp Business, sin
cambiar de herramienta.

## 1. Lo que hay hoy (verificado en `main`, 2026-11-21)

- `Contacto.etiquetas` y `Conversacion.etiquetas`: dos `String[]` libres en
  `packages/database/prisma/schema.prisma`. La del contacto se edita como texto separado por comas en
  el modal del contacto (`apps/web/src/components/bandeja/modal-editar-contacto.tsx`) y se muestra en
  la ficha y en `/contactos`. La de la conversación **solo se lee** (`ConversacionResumen.etiquetas` en
  `packages/contracts/src/inbox.ts`); nada la escribe ni la pinta.
- Sin color, sin catálogo, sin filtro por etiqueta en la bandeja (`FiltroBandeja` no la incluye).
- **Archivar** existe en la base y en la API como estado `CERRADA` (`PATCH /conversaciones/:id/estado`,
  permiso `bandeja.operar`), pero **no hay botón en la web**. Un mensaje entrante devuelve la
  conversación a `ABIERTA` (`bandeja.prisma.ts`), igual que WhatsApp Business por defecto.

## 2. Decisión: a qué se asignan

**A la conversación, y solo a ella.** No al archivo de viaje; el contacto conserva lo que ya tiene.

| Opción | Por qué no / por qué sí |
|---|---|
| Archivo de viaje | **No.** El estado de cobro ya es del archivo y lo **calcula el servidor** (HU-payments-1). Una etiqueta «Pagado» en el archivo sería justo la duplicación que hay que evitar: dos verdades sobre el mismo saldo. Además, la mayoría de chats que hay que seguir **aún no tienen archivo** (consulta, cotización enviada) y la bandeja no lista archivos |
| Contacto | **No para esto.** Las etiquetas del contacto son atributos duraderos («VIP», «Corporativo»); las del chat son **estado de trabajo** que se pone y se quita. Ya existen y se usan en `/contactos`: se dejan como están |
| **Conversación** | **Sí.** Es lo que JD Tours etiqueta hoy (el chat), es la unidad que lista y filtra la bandeja, y es lo que se archiva y se reabre. Un solo sitio, un solo modelo |

**Lo que no duplica el estado de pago** (bloqueante para el diseño, no para esta entrega):

1. Las etiquetas «Pagado» y «Pago pendiente» son **ayuda visual manual** del chat
   (`docs/01-producto/04-flujos-criticos.md`, reglas del flujo). **Ningún saldo, estado de cobro,
   reporte ni aviso se calcula con ellas**, y ponerlas no toca ningún archivo de viaje.
2. Cuando exista el eje C, el encabezado del chat muestra el **estado de cobro calculado** de cada
   archivo abierto del contacto («File 1043 · Saldo pendiente»). Se dibuja distinto de una etiqueta
   (sin icono de etiqueta, con icono de moneda, no se puede poner ni quitar, enlaza al archivo). Es de
   T-331/T-333, no de este eje.
3. Límite conocido y aceptado: la conversación es una por contacto y canal y dura años; con dos viajes
   en curso, «Pagado» en el chat es ambiguo. Por eso (2) existe y la etiqueta no es la fuente.
4. A las 4 semanas de piloto, `dueno-de-producto` pregunta si la agencia sigue usando «Pagado» y «Pago
   pendiente» o ya mira el estado calculado; si no las usa, las borra ella (son editables).

**Relación con `Contacto.etiquetas` (sin perder datos):** no se toca. Sigue libre, en el modal y la
ficha. En la ficha del chat se ve como hoy, separada y titulada «Del contacto». Unificarla en el
catálogo con color es **cola** (T-324 no la migra).

**Relación con `Conversacion.etiquetas`:** T-324 copia cada valor distinto no vacío al catálogo de su
agencia (color `gris`) con su asignación, y deja la columna sin escribir. Se borra en una migración
posterior cuando T-325 cambie el contrato. Hoy no hay agencia real, pero la migración no asume que
esté vacía.

## 3. Modelo conceptual

**Etiqueta** (`Label` en el código, término nuevo del lenguaje ubicuo): marca con nombre y color que
**cada agencia** define (R12: tabla por agencia, nunca `enum`) y que se asigna a conversaciones.

| Pieza | Regla |
|---|---|
| `etiquetas` | `tenant_id`, `nombre` (1–30 caracteres, sin espacios a los lados), `color` (clave de la paleta), `orden`, fechas y autor. Única por agencia sobre `lower(btrim(nombre))`: «Pagado» y «pagado » chocan con el error tipado `ETIQUETA_DUPLICADA` |
| `conversacion_etiquetas` | `tenant_id`, `conversacion_id`, `etiqueta_id`, `asignada_en` (UTC), `asignada_por`. Clave (conversación, etiqueta): poner dos veces la misma no duplica (idempotente) |
| Integridad | Foráneas **compuestas con `tenant_id`** hacia la etiqueta y hacia la conversación, como el resto del esquema: una agencia no puede colgar su conversación de la etiqueta de otra ni aunque falle un `WHERE` |
| Topes (supuestos) | 50 etiquetas por agencia, 10 por conversación. Superarlos es un error tipado con texto que dice qué hacer |
| Paleta | Clave de un **conjunto fijo del sistema de diseño**: `gris`, `azul`, `turquesa`, `verde`, `ambar`, `naranja`, `rosa`, `dorado`. La paleta es invariante de accesibilidad del producto, no política de la agencia; la agencia elige cuál. **Sin rojo**: está reservado a vencido y destructivo (`.claude/skills/diseno-web/SKILL.md` §2). Sin hexadecimales libres |
| Contraste | Chip = fondo claro + texto oscuro del mismo tono + punto de color, cada par **≥ 4,5:1** (AA) con los tokens de `apps/web/src/app/globals.css`. Faltan tonos (p. ej. un `coral` de texto ≥ 700): T-326 los añade a `@theme` con nombre de dominio, nunca un hex en el componente |
| No solo color | Todo chip lleva **el nombre escrito** y el icono de etiqueta. Con escala de grises la pantalla se entiende igual |
| Sembrado | Toda agencia nueva y las existentes reciben: **Pagado** (`verde`), **Pago pendiente** (`ambar`), **Seguimiento** (`azul`). Editables y borrables como cualquier otra |
| Renombrar / recolorear | Conserva las asignaciones (van por id) |
| Borrar en uso | Confirmación con el número: «“Seguimiento” está en 14 conversaciones. Al eliminarla se quita de todas. No se puede deshacer». Borra la etiqueta y sus asignaciones |

**Permisos** (catálogo de ADR-0011):

- `bandeja.operar` (ya existe): poner y quitar etiquetas en las conversaciones **que el usuario puede
  ver**. Una conversación ajena sin `conversaciones.ver_todas` responde 404, como las demás mutaciones
  (`docs/01-producto/12-visibilidad-de-conversaciones.md`).
- `etiquetas.administrar` (**nuevo**, supuesto de nombre): crear, renombrar, recolorear, ordenar y borrar.
  Sembrado al rol `DUENO`. La agencia puede dárselo a `ASESOR`.
- Leer el catálogo: cualquier usuario de la agencia.

**Aislamiento entre agencias (R1, requisito explícito, no se recorta):**

- Las dos tablas llevan `tenant_id` y la política `tenant_isolation` canónica, **`USING` y `WITH CHECK`
  idénticos** (los vigila `packages/database/prisma/policies/003-politica-canonica.sql`), RLS forzada.
- Casos nuevos en `packages/database/tests/aislamiento.spec.ts` y e2e con dos agencias: A no lista, no
  asigna, no filtra por, no renombra ni borra etiquetas de B, ni adivinando el id (la API responde como
  si no existiera); el filtro con un id de B devuelve cero filas, no error que confirme su existencia.
- **Auditoría de seguridad de T-324 y T-325 sin recortar vueltas** (R13, roadmap §5).
- Logs, eventos y outbox llevan **solo ids**, nunca el nombre de la etiqueta (es texto libre de la
  agencia y podría contener un nombre de persona).

## 4. Interacción (móvil primero a 390 px, escritorio a 1440 px)

Clics contados, no estimados. Datos ficticios.

### 4.1 Lista de la bandeja

```
390 px                                         1440 px (columna de lista, 360 px)
┌──────────────────────────────────────┐       ┌──────────────────────────────────┐
│ Conversaciones          [lupa] [Filt]│       │ Buscar…      [Etiquetas ▾] [Mías]│
│ (Pago pendiente ×) (Seguimiento ×)   │ ←fila │ (Pago pendiente ×)  Limpiar      │
│  Cualquiera ▾            Limpiar     │  solo │──────────────────────────────────│
│──────────────────────────────────────│  con  │ Contacto Demo A        10:42  2  │
│ Contacto Demo A            10:42  (2)│ filtro│ ¿Me confirmas el hotel?          │
│ ¿Me confirmas el hotel?              │       │ ●Pago pendiente ●Seguimiento     │
│ ●Pago pendiente  ●Seguimiento        │       │──────────────────────────────────│
│──────────────────────────────────────│       │ Contacto Demo B          ayer    │
│ Contacto Demo B              ayer    │       │ Gracias, quedo atento            │
│ Gracias, quedo atento                │       │ ●Seguimiento  +2                 │
│ ●Seguimiento  +2                     │       └──────────────────────────────────┘
└──────────────────────────────────────┘
```

- Chips en la **tercera línea** de la fila, debajo de la vista previa; como mucho **2 + «+N»**, sin
  desplazamiento lateral. Un nombre de 30 caracteres se corta con «…» y el nombre completo va en el
  `aria-label` de la fila. Sin etiquetas, la fila no reserva la línea (densidad).
- En la lista los chips **no son botones**: tocar la fila abre el chat. Por eso no necesitan 44 px.
- Orden de los chips: el `orden` de la agencia, no el de asignación (siempre en el mismo sitio).

### 4.2 Encabezado del chat: poner y quitar

```
390 px
┌──────────────────────────────────────┐
│ ←  Contacto Demo A   Ventana 3 h  [⋮]│   [⋮] → Archivar · Editar contacto · …
│ (●Pago pendiente ×) (+ Etiqueta)     │   tira de chips, 44 px de alto
│──────────────────────────────────────│
│                 …hilo…               │
└──────────────────────────────────────┘
          toca «+ Etiqueta»
┌──────────────────────────────────────┐
│ Etiquetas                       Listo│   hoja inferior, la mitad de la pantalla
│──────────────────────────────────────│
│ [✓] ● Pago pendiente                 │   filas de 48 px; un toque pone o quita
│ [ ] ● Pagado                         │   (optimista; se queda abierta para
│ [ ] ● Seguimiento                    │    marcar varias)
│──────────────────────────────────────│
│ Gestionar etiquetas →                │   solo con etiquetas.administrar
└──────────────────────────────────────┘
```

| Acción | Toques | Cómo |
|---|---|---|
| Poner una etiqueta | **2** | «+ Etiqueta» → tocar la etiqueta. Cada etiqueta más, +1 |
| Quitar una etiqueta | **1** | La «×» del chip en el encabezado (área táctil de 44 × 44 px aunque el dibujo sea menor) |
| Quitar varias | 2 + 1 por cada una | Desde la hoja |

- **Optimista** (principio 4 de diseño): el chip aparece o desaparece al toque. Si el servidor rechaza,
  vuelve a su estado y un aviso dice qué pasó y qué hacer: «No se pudo poner “Pagado”: sin conexión.
  Toca para reintentar». Sin permiso o sin la conversación visible: «Ya no tienes acceso a esta
  conversación».
- Los otros asesores que ven la conversación reciben el cambio en vivo (el evento de conversación
  actualizada que ya existe).
- **Escritorio 1440:** el mismo «+ Etiqueta» abre un **popover** con buscador (combobox accesible:
  flechas, Enter pone o quita, Esc cierra). Atajo **`e`** con el chat abierto (libre en
  `apps/web/src/lib/atajos-teclado-bandeja.ts`); se añade a la ayuda de atajos.
- Accesibilidad: cada opción es `role="menuitemcheckbox"` con `aria-checked`; el chip quitable dice
  «Quitar etiqueta Pagado»; foco visible; contraste AA.

### 4.3 Filtrar la bandeja por etiqueta

- **Móvil:** botón «Filtros» de la cabecera de la bandeja → hoja con secciones *Vista* (Todas, Mías, Sin
  asignar, Sin leer, SLA vencido: lo que ya existe), *Estado* (Bandeja / Archivadas) y *Etiquetas*
  (filas de 48 px con casilla). Con dos o más etiquetas aparece **«Cualquiera de estas» (o) / «Todas
  estas» (y)**; por defecto **cualquiera**. Activo el filtro, la fila de chips quitables va encima de la
  lista con «Limpiar». Tres toques para filtrar por una etiqueta: Filtros → etiqueta → Ver resultados.
- **Escritorio:** «Etiquetas ▾» en la barra de filtros, mismo comportamiento, sin hoja.
- Se combina **en y** con la vista y el estado, y respeta la visibilidad por asesor: un asesor sin
  `conversaciones.ver_todas` filtra solo dentro de lo que ya ve. El filtro vive en la URL
  (`?etiquetas=…&modo=cualquiera`) para que volver atrás lo conserve.

### 4.4 Convivencia con «archivar»

- Archivar = estado `CERRADA`; sale de la vista *Bandeja* y aparece en *Archivadas*. **Las etiquetas se
  conservan al archivar** (como en WhatsApp Business) y el filtro por etiqueta funciona también en
  *Archivadas*.
- Si el cliente vuelve a escribir, el chat vuelve a la bandeja **con sus etiquetas** (comportamiento
  actual del webhook). La asesora decide si quita «Pagado».
- «Archivar» va en el menú [⋮] del encabezado del chat (2 toques) y deshacer en el aviso. Es un botón
  sobre una API que ya existe; si `dueno-de-producto` no lo quiere en T-326, es una tarea propia y no
  bloquea las etiquetas.

### 4.5 Estados

| Estado | Qué se ve |
|---|---|
| Cargando la lista | Esqueleto de filas con la tercera línea de chips; nunca un spinner |
| Catálogo vacío (la agencia borró todas) | En la hoja: «Tu agencia no tiene etiquetas.» + «Crear etiqueta» si tiene permiso; si no, «Pídele a quien administra la agencia que cree una» |
| Filtro sin resultados | «Ninguna conversación tiene “Pagado” en Bandeja.» + «Buscar en Archivadas» + «Quitar filtro» |
| Error al cargar etiquetas | «No se pudieron cargar las etiquetas. Revisa tu conexión.» + «Reintentar». La bandeja sigue usable sin el filtro |
| Etiqueta borrada por otro mientras filtro | Desaparece del filtro activo con el aviso «La etiqueta “X” ya no existe» |
| Sin permiso de gestión | No se muestra «Gestionar etiquetas»; la API responde 403 |

### 4.6 Gestionar etiquetas

En **Configuración → Etiquetas** (y el enlace de la hoja): lista con nombre, chip de muestra y,
solo para quien tiene `conversaciones.ver_todas`, el número de conversaciones que la usan. Crear,
renombrar, elegir color de la paleta (8 muestras de 44 px con nombre accesible: «Verde»), reordenar
con botones subir/bajar (no solo arrastrar) y borrar con la confirmación de §3. A 390 px sin
desplazamiento lateral.

## 5. Coexistencia con WhatsApp Business

Fuente: [investigación de coexistencia](../../_investigacion/2026-11-20-coexistencia-whatsapp-business-app.md)
(2026-11-20). Lo verificado y lo no verificado es de ese documento; T-337 lo cierra. Aquí no se duplica.

- Según terceros, al conectar por coexistencia el dueño **conserva** sus etiquetas en la app del
  celular. **No se verificó en Meta** el detalle por función.
- Los eventos descritos son `history`, `smb_message_echoes` y `smb_app_state_sync` (contactos). Ninguna
  fuente menciona etiquetas.
- **Supuesto S-B1 (depende de T-337):** las etiquetas de WhatsApp Business **no llegan** a la API ni
  vuelven a la app. Son dos juegos independientes: lo que la asesora marque en el celular no se ve en
  ViajaPro y viceversa. Diseño consecuente: no se construye sincronización; la agencia arranca con las
  tres sembradas y las ajusta en Configuración. Al pasar, se le recomienda **etiquetar solo en
  ViajaPro**.
- Si T-337 encuentra que sí se sincronizan, una tarea nueva decide si se importan **una vez** al
  catálogo por nombre. No cambia el modelo de §3.
- Sin coexistencia (número nuevo solo para el CRM, opción 8 de la investigación) nada de esto aplica.

## 6. Alcance mínimo para la demo y lo que queda fuera

**Dentro:** catálogo por agencia con las tres sembradas; poner y quitar desde el chat (§4.2); chips en
lista y encabezado; filtro por una o varias etiquetas con cualquiera/todas; gestión en Configuración;
permisos y aislamiento de §3; «Archivar» si `dueno-de-producto` lo deja en T-326 (§4.4).

**Fuera (cola, con dueño al crearla):**

- Automatizaciones (poner «Pago pendiente» al abrir un archivo, quitar al archivar), reglas, recordatorios.
- Etiquetado o sugerencia de etiquetas por IA.
- Etiquetas en archivos de viaje, oportunidades o mensajes sueltos.
- Unificar `Contacto.etiquetas` en el catálogo con color.
- Sincronizar con las etiquetas de WhatsApp Business (§5).
- Filtro «Sin etiqueta», contadores por etiqueta en la bandeja, etiquetas en reportes.
- Deslizar para archivar o etiquetar (gesto poco descubrible y difícil de hacer accesible).
- Comparación de nombres sin tildes («Seguimíento» = «Seguimiento»).

## 7. Supuestos para las preguntas al dueño (roadmap §4)

No bloquean. Si la respuesta los contradice, cambia la semilla o un tope, no el modelo.

| Pregunta | Supuesto | Si responde otra cosa |
|---|---|---|
| ¿Qué etiquetas usa exactamente? | Las tres que nombró: «pagó», «pago pendiente», «hacer seguimiento», sembradas como **Pagado**, **Pago pendiente**, **Seguimiento** | Se renombran en Configuración o se ajusta la semilla |
| ¿De qué color? | Verde, ámbar y azul. WhatsApp Business asigna colores propios; no los copiamos (la paleta es la del sistema de diseño) | Elige otro de los 8 en Configuración |
| ¿Quién crea etiquetas? | Solo el dueño (`etiquetas.administrar` en `DUENO`); las asesoras ponen y quitan | Se da el permiso al rol `ASESOR` |
| ¿Cuántas etiquetas por chat? | Varias; tope 10 | Se ajusta el tope |
| ¿Quita las etiquetas al archivar? | No: las conserva, como WhatsApp Business | Opción por etiqueta «se quita al archivar» (cola) |
| ¿Etiqueta en el celular tras conectar? | No; etiqueta en ViajaPro (S-B1) | Depende de T-337 |

## 8. Validación de dominio (`experto-turismo`, `analista-producto`)

- **Etiqueta de chat ≠ estado del viaje.** En una agencia pequeña «pago pendiente» en el chat es un
  recordatorio de a quién escribirle, no contabilidad. El dinero vive en el archivo (principio 2 del
  roadmap); la etiqueta nunca confirma ni cobra nada.
- **«Seguimiento» es preventa.** Se usa antes de que exista archivo: cotización enviada sin respuesta,
  cliente que «lo piensa». Por eso la etiqueta no puede colgar del archivo. No compite con los
  *Seguimientos* con fecha del CRM: la etiqueta marca, el seguimiento agenda.
- **«Luna de miel» y similares son del viaje, no de la persona** (motivo del viaje). Hoy viven en el
  contacto por herencia; moverlas a la oportunidad o al archivo es cola, no esta historia.
- **Generalización (riesgo §5 del roadmap):** un catálogo por agencia con color sirve a agencias
  medianas con más asesoras (filtro y/o, permiso de gestión aparte). Las de mucho volumen pedirán
  automatizaciones: quedan fuera a propósito.
- **Término nuevo:** *Etiqueta* (`Label`). Sin «tag» en pantalla.

### Cómo sabemos que funcionó

Semana 2 de piloto: la asesora etiqueta en ViajaPro y **no** en el celular (preguntado en la revisión
semanal). Semana 4: el dueño filtra por «Pago pendiente» o «Seguimiento» al menos una vez al día (uso
del filtro en el registro de la web, sin datos personales). Criterio de salida del roadmap §3.3.

## 9. Criterios de aceptación

Datos ficticios: «Agencia Demo» y «Agencia Otra», conversación de «Contacto Demo A».

- [ ] **Dado** una agencia nueva, **cuando** se da de alta, **entonces** tiene «Pagado» (verde), «Pago
  pendiente» (ámbar) y «Seguimiento» (azul); las agencias existentes las reciben con la migración.
- [ ] **Dado** el chat de Contacto Demo A abierto a 390 px, **cuando** la asesora toca «+ Etiqueta» y
  luego «Pago pendiente», **entonces** el chip aparece en el encabezado y en la fila de la lista sin
  esperar al servidor, y otro asesor que ve la conversación lo ve sin recargar.
- [ ] **Dado** el chip «Pago pendiente» en el encabezado, **cuando** toca su «×», **entonces** se quita
  con un toque; la zona táctil mide al menos 44 × 44 px.
- [ ] **Dado** que el servidor rechaza el cambio, **cuando** vuelve la respuesta, **entonces** el chip
  vuelve a su estado anterior y el aviso dice qué pasó y ofrece reintentar.
- [ ] **Dado** tres chats con «Pago pendiente», dos con «Seguimiento» y uno con ambas, **cuando** filtra
  por las dos en modo *cualquiera*, **entonces** ve 4; en modo *todas*, ve 1.
- [ ] **Dado** una asesora sin `conversaciones.ver_todas`, **cuando** filtra por «Seguimiento»,
  **entonces** solo ve las suyas y las de la cola común, nunca la de otra asesora.
- [ ] **Dado** un chat etiquetado «Seguimiento», **cuando** se archiva y luego el cliente escribe,
  **entonces** pasa a *Archivadas* y vuelve a la bandeja con «Seguimiento» puesto.
- [ ] **Dado** «Pagado» ya existe, **cuando** el dueño crea « pagado », **entonces** recibe
  `ETIQUETA_DUPLICADA` con el mensaje «Ya existe “Pagado”. Usa otro nombre» y nada se guarda.
- [ ] **Dado** «Seguimiento» en 14 conversaciones, **cuando** el dueño la borra y confirma, **entonces**
  desaparece del catálogo y de las 14; sin confirmar no pasa nada.
- [ ] **Dado** una asesora sin `etiquetas.administrar`, **cuando** intenta crear, renombrar o borrar por la
  API, **entonces** recibe 403 y en la web no ve «Gestionar etiquetas».
- [ ] **Dado** un usuario de Agencia Demo y el id de una etiqueta de Agencia Otra, **cuando** intenta
  asignarla, filtrar por ella, renombrarla o borrarla, **entonces** la API responde como si no existiera
  y la base lo impide también (RLS con `USING` y `WITH CHECK`, foránea compuesta).
- [ ] Ponerle a un chat una etiqueta **no** cambia ningún archivo de viaje, saldo ni estado de cobro.
- [ ] Cada chip muestra el nombre escrito y el icono de etiqueta; cada par de colores de la paleta mide
  ≥ 4,5:1; a 390 px no hay desplazamiento lateral en la lista, el chat, la hoja ni Configuración.
- [ ] Logs, eventos y outbox llevan ids de etiqueta, nunca su nombre.

## 10. Tareas siguientes (no se edita `roadmap/tasks.yaml` aquí)

| Tarea | Debe cumplir |
|---|---|
| **T-324** B1 base (`datos`) | Tablas `etiquetas` y `conversacion_etiquetas` de §3 con `tenant_id`, RLS forzada y política canónica (`USING` = `WITH CHECK`), foráneas compuestas, índice único `(tenant_id, lower(btrim(nombre)))` e índice `(tenant_id, etiqueta_id, conversacion_id)` para el filtro; `CHECK` del color contra la paleta; sembrado de las tres en el alta y para las agencias existentes; copia de `conversaciones.etiquetas` al catálogo (§2); permiso `etiquetas.administrar` sembrado a `DUENO`; casos en `aislamiento.spec.ts`. **Auditoría de seguridad sin recortar vueltas.** Entrada *Etiqueta* en el lenguaje ubicuo |
| **T-325** B2 API (`backend`) | Contratos Zod en `packages/contracts` (catálogo, asignar/quitar idempotente, `ConversacionResumen.etiquetas` pasa a `{id, nombre, color}[]`, filtro `etiquetas` + `modo` en `ConsultarBandeja`); errores tipados (`ETIQUETA_DUPLICADA`, topes); permisos de §3; visibilidad por asesor en el filtro; evento en vivo de conversación actualizada; logs solo con ids; e2e con sesiones reales, permiso y la otra agencia. Luego, migración que borra `conversaciones.etiquetas` |
| **T-326** B3 pantalla (`frontend`, tras T-315) | §4 completo a 390 y 1440 px con capturas; optimista con reversión; hoja y popover accesibles; atajo `e`; filtro en la URL; Configuración → Etiquetas; tokens de color que falten en `@theme`; estados de §4.5; e2e «etiquetar una conversación y filtrar». «Archivar» y la vista *Archivadas* si `dueno-de-producto` las deja aquí (§4.4) |
