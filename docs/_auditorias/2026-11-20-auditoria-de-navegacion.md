# Auditoría de navegación y arquitectura de información — web de ViajaPro (2026-11-20)

Método: web sola en modo demo (`next dev -p 3456`, `NEXT_PUBLIC_USE_REAL_CRM=false`,
`NEXT_PUBLIC_USE_REAL_INBOX=false`, `NEXT_PUBLIC_AUTH_MAQUETA=true`, sin API ni Postgres), recorrida con
Playwright a 1440×900 y 390×844 (`deviceScaleFactor` 1). Una segunda pasada con
`NEXT_PUBLIC_USE_REAL_AUTH=true` y sin API sirvió para ver qué pasa sin sesión. Las capturas y los
scripts no se versionan; los nombres citados (`a14-…`, `m07-…`) son los de esa sesión.

**[V]** visto en captura o en la URL/DOM del navegador. **[C]** solo leído en el código. **[S]** supuesto.

No repito la auditoría UX del mismo día (`2026-11-20-auditoria-ux.md`); la cito solo donde toca la
navegación. `docs/00-vision/03-personas.md` y `docs/01-producto/04-flujos-criticos.md` **son marcadores
vacíos**: las personas y las tareas de abajo salen del encargo, de `CLAUDE.md` y de
`06-diseno-y-ux.md`, no de un documento de producto.

**Lo que no pude verificar:** API real (reportes contra la base, redirección 401 → `/ingresar`,
envío real por WhatsApp), menú por rol (la demo muestra lo mismo a todos) y foco de teclado en la barra.

---

## 1. Mapa de rutas

«Barra» = barra lateral en escritorio / barra inferior en móvil. «Activo» = el ítem del menú queda marcado.

| Ruta | Título en pantalla (H1) | ¿En menú? | Barra (esc / móvil) | ¿Migas? | Cómo se llega |
|---|---|---|---|---|---|
| `/` | «¡Buenas tardes, Asesor ViajaPro!» (Inicio) | **No** | sí / sí, **ningún ítem activo** | No | Solo por la miga «Inicio» de otras pantallas. El logo lleva a `/bandeja` y el ingreso también [V][C] |
| `/bandeja` | Conversaciones | «Bandeja de WhatsApp» / «Bandeja» | sí / sí | No | Menú, logo, destino tras ingresar [V][C] |
| `/bandeja/[id]` | (nombre del contacto) | bajo Bandeja | sí / **pantalla completa, sin barra** | «Inicio › Bandeja › nombre» | Lista, campana, paleta, Seguimientos, Cotización, Ficha, Archivo [V] |
| `/pipeline` | Pipeline de Oportunidades | «Pipeline / Oportunidades» | sí / sí | No | Menú, Inicio [V] |
| `/cotizador` | Cotizador Comercial | «Cotizador de Paquetes» / «Cotizar» | sí / sí | No | Menú, «Cotizar» del chat y del catálogo, Inicio [V] |
| `/cotizaciones` | Directorio de Cotizaciones | **No** | sí, **sin activo** / sí | No | Inicio «Revisar», miga y «Volver» del detalle [V]; enlace en Reservas [C]. La paleta no lo ofrece [V] |
| `/cotizaciones/[id]` | título de la cotización | No | sí, **sin activo** / sí | «Inicio › Cotizaciones › X» + «Volver a Cotizaciones» | Tras guardar, chat, ficha, archivo, campana, paleta [V] |
| `/cotizaciones/[id]/imprimir` | propuesta al viajero | No | no / no | «Volver a la cotización» [C] | «Imprimir / PDF» [V] |
| `/viajes` | **Reservas** | «Archivos de viaje» / «Viajes» | sí / sí | No | Menú, «File N» de cotización y chat, campana, paleta [V] |
| `/contactos` | Contactos y Viajeros | «Contactos y Viajeros» | sí / sí | No | Menú, paleta [V]; miga «CRM» de Seguimientos [C] |
| `/contactos/[id]` | nombre del contacto | bajo Contactos | sí / sí | No: «← Directorio de Contactos» | Lista, cotización, archivo, Seguimientos, paleta [V] |
| `/catalogo` | Catálogo de Paquetes y Tarifarios | «Catálogo de Mayoristas» | sí / sí | No | Menú, «Ver Salidas en Catálogo» del cotizador, Inicio [V] |
| `/reportes` | Reportes y Rendimiento Comercial | «Reportes y Cierres» | sí / sí | No | Menú, Inicio [V] |
| `/configuracion` | Equipo y Configuración de Agencia | «Configuración de Agencia» | sí / sí | No | Menú [V] |
| `/configuracion/whatsapp` | Conexión Oficial de WhatsApp | No (activo: Configuración) | sí / sí | No | Solo desde el aviso de ventana de 24 h [C]. **Además** existe la pestaña «Canal WhatsApp (WABA)» en `/configuracion` [V] |
| `/seguimientos` | Seguimientos del Asesor | **No** | **no / no** | Texto «Inicio / CRM / Seguimientos» («CRM» lleva a `/contactos` [C]) | Inicio «Ver todos los seguimientos», campana «Gestionar» [V][C] |
| `/bienvenida` | Bienvenido a ViajaPro: Configura tu Agencia | No | sí / sí | No | Perfil «Asistente de Inicio», Configuración, Inicio [V][C] |
| `/ensayo` | Lista de ensayo de jornada | No | sí / sí | No | **Nada la enlaza** (huérfana, herramienta interna) [C] |
| `/ingresar` (+ `/login`, `/iniciar-sesion`) | ViajaPro | — | no | — | Pública; los alias redirigen [V] |
| `/aceptar-invitacion` | ViajaPro | — | no | — | Pública, desde el correo [C] |
| `/terminos`, `/privacidad`, `/cookies`, `/politica-cookies` | legales | — | no | — | Pie de página. Hay **dos** páginas de cookies con títulos distintos [V] |
| 404 (`not-found`) | «Esta ruta no está en nuestro mapa» | — | no | — | Botón «Volver a la Bandeja» + Cotizador, Catálogo, Pipeline [V] |

Más [V]: `document.title` es «ViajaPro» en **todas** las pantallas de trabajo; solo las legales, el
ingreso y la 404 tienen un título propio. Con varias pestañas abiertas o en el historial no se
distinguen. El menú no pone `aria-current` en ningún ítem: lo marca solo por estilo.

Lo que adelantaba el encargo, verificado: (a) cierto, 12 páginas montan su propia `BarraModulos` y
`/seguimientos` no la monta [V]; (b) cierto [V]; (c) cierto, y es peor de lo descrito: ver §3.4 [V];
(d) el hilo existe en datos, pero la navegación lo rompe en tres puntos: ver §2 y §3.2 [V].

---

## 2. Recorridos

### Persona 1 — asesora de ventas, 40 chats al día (escritorio)

**T1. Responder un chat y cotizar desde él.** Tras ingresar cae en `/bandeja` [C]. Clics contados
desde ahí:
1. Abre la conversación de Juan Pérez [V `a10`]. Escribe y envía con Enter (0 clics) [V].
2. «Cotizar», en el panel «Solicitud de viaje» → `/cotizador` con el paquete, el 15/12/2026 y
   2 ADT + 2 CHD ya cargados [V `a12`].
3. «Guardar Cotización Oficial» → modal con Juan Pérez ya elegido [V `a13`].
4. «Confirmar y Guardar» → `/cotizaciones/[id]` [V `a14`].
5. «Enviar por WhatsApp» [C: no lo pulsé].
6. «Abrir conversación» para volver al chat [V, el enlace existe].

Son 6 clics desde la bandeja. Cumple los «3 clics» por tramo, pero no el principio 1: **cotizar saca a
la asesora de la conversación.** Dónde se pierde:
- En el cotizador, el menú marca «Cotizador» y la pantalla no dice para quién cotiza ni que viene de un
  chat: el nombre del viajero solo aparece en el modal de guardar [V `a12`]. Si la llaman a otro chat
  en ese momento, al volver no sabe de quién era el cálculo.
- Lo que vio no es lo que guardó: el cotizador muestra **$ 10.800.000** y la versión guardada
  **$ 8.330.000**, con otra acomodación (DOBLE) [V `a12` vs `a14`]. Es un problema de credibilidad, no de
  navegación, pero aparece justo en la costura entre las dos pantallas.
- El botón Atrás del navegador sí vuelve al chat [V].

**T2. De una cotización aceptada al archivo y su time limit.** El listado `/cotizaciones` no está en el
menú ni en la paleta. Solo se llega por Inicio, que tampoco está en el menú (ver T3), o tecleando la URL.
Ya en el listado son 2 clics: fila ACEPTADA → «Ver» (1) → «File 1044» (2). Se abre Reservas con el
archivo seleccionado: time limit, pago total hasta, localizador y enlaces de vuelta a conversación,
contacto y cotización [V `a21`]. **Este tramo está bien resuelto.** Dónde se pierde:
- El menú dice «Archivos de viaje», el título «Reservas» y cada fila «File 1044» [V]. Tres nombres
  para una sola cosa.
- En Reservas, al elegir otro archivo la URL se **reemplaza** (`router.replace`) [C, línea 127 de
  `viajes/page.tsx`]. Atrás no vuelve al archivo anterior: sale del módulo [V: tras elegir 1043 y
  1044, Atrás llevó a la cotización].

**T3. Qué hay que hacer hoy.** Es donde más se pierde.
- La pantalla que lo responde es Inicio, con los seguimientos del día y las cotizaciones por vencer
  [V `a01`]. Pero el ingreso lleva a la bandeja [C], el logo lleva a la bandeja [V] e Inicio no está
  en el menú [V]. En la práctica no existe.
- Seguimientos no está en el menú. Al abrirlo desde Inicio, la pantalla **pierde la barra lateral**
  [V `m-esc_seguimientos`]. Para salir quedan la miga «Inicio» o el botón Atrás.
- La campana se abre en 1 clic y tiene pestañas útiles [V `a23`], pero sus cifras no cuadran:
  - El distintivo marca 45 y las pestañas suman 6 (Plazos 2, WhatsApp 2, Seguimientos 1,
    Cotizaciones 1) [V].
  - Dice «Seguimiento comercial vencido» mientras Inicio y Seguimientos muestran «Vencidos (0)» [V].
  - Avisa del «Pago total del file 1038», que no aparece en la lista de Reservas (solo 1043 y 1044) [V].
    No lo pulsé [S: probablemente termine en el error del §2 T5].
- En la parte visible de Inicio no hay time limits [V `a01`], aunque son el dato que más dinero cuesta.

**T4. Encontrar un contacto y su historial.** Por el menú: Contactos (1) → fila (2) → ficha con línea de
tiempo, viaje vigente y enlaces a chat y cotización [V `a28`]. Por la paleta: Ctrl+K, escribir «Ana»
y Enter [V `a27`]. Bien resuelto. La única pega es el «volver»: la ficha usa «← Directorio de
Contactos», sin migas.

**T5. Buscador / paleta (Ctrl+K).**
- Se abre con Ctrl+K y con la lupa de la barra [V `a24`].
- Sus «Acciones rápidas» son los 8 módulos del menú, con un tercer juego de nombres: «Ir al Pipeline
  Kanban», «Abrir Cotizador de Paquetes», «Directorio de Contactos y Viajeros» [V].
- «seguim» y «cotizaciones» dan «No se encontraron resultados» [V `a25`, `a26`].
- **Un enlace profundo roto:** al buscar «1043» la paleta ofrece «EXP-2026-1043 — Cancún y Riviera
  Maya, Titular: Dian…». Al abrirlo, Reservas muestra «No se pudo abrir el archivo» [V `a32-…-exp`].
  En Reservas, el File 1043 es San Andrés, de Felipe Morales. La paleta busca archivos en otra fuente
  de datos que la pantalla [S sobre la causa: `mock-viajes` frente a `mock-archivos`].
- Un paquete lleva a `/catalogo?id=…` y una oportunidad a `/pipeline?op=…`. Ninguna de las dos
  pantallas lee ese parámetro [C: solo `viajes` y `cotizador` usan `useSearchParams`]. El catálogo
  se abrió sin el paquete seleccionado [V `a32-…-paq`]. La oportunidad no navegó en la prueba
  [V, causa sin aislar].

**T6. Volver atrás desde cada pantalla.** Hay cuatro patrones de «volver» [V]:
- migas con flechas (conversación, detalle de cotización);
- migas en texto con un «CRM» que no es ninguna pantalla (Seguimientos);
- «← Directorio de Contactos» (ficha de contacto);
- nada (los ocho módulos de primer nivel y Reservas).

El botón Atrás del navegador funciona salvo en Reservas (T2). Tampoco hay estado en la URL para las
pestañas de Configuración, Reportes, la ficha de contacto ni el catálogo [C]: no se puede compartir
«mira la pestaña Respuestas rápidas» ni volver a ella.

### Persona 2 — la dueña de la agencia (escritorio)

**Ver cómo va el mes.** Reportes está a 1 clic [V `m-esc_reportes`]. Abre en «Últimos 30 días», no en
«este mes»; ver el mes en curso exige cambiar el periodo [V]. No pude verificar contra la API.
Llegar a «quién vende más» o a una oportunidad concreta desde un KPI no lo probé [S].

**Cambiar una configuración.** Configuración (1) + pestaña (2) [V `m-esc_configuracion`]. Dónde se pierde:
- Hay 8 pestañas y dos de ellas duplican sitios que existen por su cuenta:
  - «Catálogo», que también es el módulo Catálogo;
  - «Canal WhatsApp (WABA)», que convive con la ruta `/configuracion/whatsapp`, de otro aspecto y
    a la que solo se llega desde el aviso de 24 h [V][C].
- El menú es el mismo para asesora y dueña [C: todos los módulos tienen `disponible: true`]. Reportes
  y Configuración ocupan sitio fijo en la herramienta de la asesora.

### Móvil (390 px), cualquiera de las dos

- **Barra inferior:** Bandeja, Pipeline, Cotizar, Viajes, Buscar, Perfil [V `m01`].
- **Solo por la paleta:** Contactos, Catálogo, Reportes y Configuración. En la primera pantalla de la
  paleta se ven Contactos y Catálogo [V `m02`]; Reportes y Configuración quedan más abajo [C].
- **Inalcanzables una vez que se sale de Inicio:** Inicio, Cotizaciones (listado) y Seguimientos. No
  están en la barra, la paleta ni Perfil [V `m02`, `m03`].
- **Campana:** está dentro de Perfil, en «Notificaciones y Alertas 45», a 2 toques [V `m03`]. La
  auditoría previa lo dejó como [S]; queda confirmado.
- **Callejones:**
  - `/seguimientos` no tiene barra inferior [V `m-mov_seguimientos`].
  - Una conversación inexistente muestra un error con «Reintentar», sin flecha de volver y sin
    barra [V `m-mov_bandeja_no-existe`].
- **Cotizar desde el chat:** el móvil no muestra un enlace «Cotizar» visible; queda tras el botón
  «Viaje», que abre el panel [V `m05`; S: 2 toques].
- **Reservas:** el botón «Volver a la lista» existe [V `m07`]. Pero el Atrás del sistema (el gesto de
  Android) sacó del módulo y llevó a la conversación anterior [V].

### Sin sesión y errores

- La 404 en demo está bien: dice qué pasó y ofrece la bandeja y tres atajos [V].
- Con la autenticación real y la API caída, **cualquier** ruta, la 404 incluida, muestra solo «No
  pudimos verificar tu sesión» con «Reintentar». No hay enlace a ingresar ni a las páginas públicas
  [V `s-*`].
- La redirección a `/ingresar?redirigir=…` conservando el destino está en el código [C]; sin API no se
  puede provocar un 401.
- En demo, una ficha de contacto inexistente pinta «Viajero Simulado» en vez de «no encontrado» [V].
  Y un detalle de cotización inexistente muestra «Cotización Oficial Guardada» junto al error [V].

---

## 3. Diagnóstico: lo que más pesa, por impacto en el día de la asesora

1. **No hay un «Hoy».** La pantalla que dice qué hacer existe (Inicio) y está escondida: no está en
   el menú, no es el destino tras ingresar y en móvil no tiene vuelta. Seguimientos no está en el
   menú y pierde la barra. La campana da cifras que no cuadran con Inicio ni con Reservas. La asesora
   arranca el día en una bandeja con 270 chats y sin su lista de compromisos ni de time limits. Es
   probablemente lo que el propietario siente como «no me cuadra».
2. **El hilo chat → cotización → archivo se corta al navegar.** Los enlaces entre piezas existen
   (mejoraron desde la auditoría UX).
   Pero:
   - cotizar abre un módulo sin contexto de conversación;
   - el listado de cotizaciones no está en ningún menú;
   - Atrás en Reservas sale del módulo;
   - la paleta lleva a un archivo que «no existe».
3. **No hay un marco común.** Cada página monta su barra, y eso produce:
   - una pantalla sin barra (Seguimientos);
   - pantallas en las que la barra no llega abajo y la campana y el avatar cambian de altura
     (Cotizaciones, Reservas) [V `a15`, `a21`];
   - tres pantallas sin ítem activo (`/`, `/cotizaciones`, `/cotizaciones/[id]`);
   - errores sin salida en móvil.

   Es la causa técnica de buena parte del resto.
4. **Una pantalla, cuatro nombres.** Menú, título, barra móvil y paleta no coinciden:

   | Menú | Título (H1) | Barra móvil | Paleta |
   |---|---|---|---|
   | Archivos de viaje | Reservas | Viajes | Archivos de viaje / «Expedientes operativos, bookings» |
   | Pipeline / Oportunidades | Pipeline de Oportunidades | Pipeline | Pipeline Kanban |
   | Cotizador de Paquetes | Cotizador Comercial | Cotizar | Cotizador de Paquetes |
   | Catálogo de Mayoristas | Catálogo de Paquetes y Tarifarios | — | Catálogo de Mayoristas |

   «Reservas» además **choca con el lenguaje ubicuo**: una *Reserva* es la confirmación con un
   mayorista *dentro* de un archivo; la lista es de archivos de viaje. Lo mismo pasa con
   «Directorio», «Kanban», «Cierres» o «del Asesor», que no son términos del dominio. Y el
   `document.title` es «ViajaPro» en todas.
5. **Móvil a medias.** La asesora trabaja con el teléfono en la mano. Cuatro módulos solo se alcanzan
   escribiendo en un buscador, tres no se alcanzan y la campana está dentro de Perfil.
6. **La URL no guarda el estado.** Selección en Reservas, catálogo y pipeline; pestañas de
   Configuración, Reportes y la ficha. Atrás, recargar y compartir un enlace pierden el sitio, y los
   enlaces de la paleta y de la campana dependen de parámetros que la mitad de las pantallas ignora.
7. **La paleta no cubre la app.** No ofrece Inicio, Seguimientos, Cotizaciones ni Ingresar. No
   encuentra módulos por su nombre («cotizaciones», «seguimientos») y busca archivos en otra fuente
   de datos que la pantalla.
8. **Errores y sesión sin salida.** El error de sesión tapa incluso la 404 y no ofrece ir a ingresar.
   Por debajo están los «volver» inconsistentes y las migas con niveles inventados («CRM»).

---

## 4. Propuesta de estructura

### 4.1 Menú por tarea del día, con nombres del lenguaje ubicuo

| Grupo | Ítem (= H1 = título de pestaña = paleta) | Ruta (no cambia) | Notas |
|---|---|---|---|
| — | **Hoy** | `/` | Seguimientos de hoy y vencidos, time limits y pagos totales de las próximas 48 h, chats con SLA vencido. Destino tras ingresar. Con contador |
| Atender | **Conversaciones** | `/bandeja` | Contador de sin leer o SLA |
| Vender | **Oportunidades** | `/pipeline` | |
| | **Cotizaciones** | `/cotizaciones` (+ detalle) | El cotizador deja de ser módulo: es la acción «Cotizar» (desde el chat, el catálogo, la oportunidad y un botón «+ Cotizar» en Cotizaciones). `/cotizador` sigue existiendo como ruta |
| Operar | **Archivos de viaje** | `/viajes` | H1 «Archivos de viaje», no «Reservas». Las reservas por mayorista quedan dentro del detalle |
| | **Seguimientos** | `/seguimientos` | Contador de vencidos |
| Clientes | **Contactos** | `/contactos` | |
| | **Catálogo** | `/catalogo` | |
| Agencia | **Reportes**, **Configuración** | `/reportes`, `/configuracion` | Abajo y separados. Visibles según permiso [S: el `dueno-de-producto` decide si la asesora ve Reportes] |

Todo esto es una propuesta. Que «Hoy» sea el destino tras ingresar y que el cotizador deje de ser
módulo son decisiones de alcance del `dueno-de-producto`, con el `analista-producto` y el
`experto-turismo`. Antes conviene escribir `04-flujos-criticos.md` y `03-personas.md`, hoy vacíos.

### 4.2 Fijo en todas las pantallas de trabajo

- Barra lateral (escritorio), con el ítem activo también en las subrutas (`/cotizaciones/*` →
  Cotizaciones) y `aria-current="page"`.
- Buscador (Ctrl+K y lupa) y campana en el mismo sitio en todas las pantallas. La campana cuenta lo
  mismo que suman sus pestañas.
- «Hoy» con su contador visible desde cualquier pantalla: el estado que cuesta dinero no vive en un
  submenú (principio 3).
- Un único patrón de «volver»: migas de pan solo en el segundo nivel (detalle de cotización,
  conversación, ficha, archivo), con niveles que son pantallas reales. Nada de «CRM».
- `document.title` = «{pantalla} · ViajaPro» y, en los detalles, «{nombre o file} · ViajaPro».

### 4.3 Móvil

- Barra inferior de 5: **Hoy · Conversaciones · Archivos · Buscar · Más**.
- «Más» abre una hoja con todos los demás módulos y la campana. Ninguna pantalla queda a más de
  2 toques.
- Las pantallas de detalle a pantalla completa (conversación, archivo) llevan siempre una flecha de
  volver, también en su estado de error.
- Que Oportunidades o Cotizar ocupen un sitio fijo en lugar de Archivos lo decide producto [S].

### 4.4 Layout compartido

- Un grupo de rutas `app/(app)/layout.tsx` que monte una sola vez `GuardaSesion`, `BarraModulos`
  (escritorio y móvil) y la región `main`. Las páginas pintan solo su contenido. Las URL no cambian.
- Una tabla única de navegación (`lib/navegacion.ts`): id, etiqueta, ruta, icono, grupo, permiso y
  prefijos activos. De ella leen la barra lateral, la barra móvil, la paleta, las migas y el
  `title`.
- **Ojo:** `CLAUDE.md` §5 describe `apps/web/src/app/<ruta>/` como «plano, sin (dashboard)/». Cambiar
  eso es estructura del frontend. Hay que consultar al `arquitecto` si basta con actualizar
  `docs/02-arquitectura/08-frontend.md` y §5 o si pide ADR (R7).

---

## 5. Plan por pasos (cada uno, un PR de 1–3 días)

| # | Paso | Dueño | Qué lo prueba |
|---|---|---|---|
| N0 | Escribir `04-flujos-criticos.md` (al menos primer contacto → cotización → archivo) y las dos personas. Validar el menú de §4.1 | `analista-producto` + `diseno-ux` (+ `experto-turismo`) | Revisión del `dueno-de-producto` |
| N1 | Layout compartido `(app)` y fuera las 12 importaciones de `BarraModulos`; `/seguimientos` gana barra; altura uniforme; ítem activo por prefijo con `aria-current` | `frontend` | `e2e/03-paginas`, ampliado: en cada ruta privada, barra lateral visible a 1440 y barra inferior a 390; spec unitaria de ruta → módulo activo |
| N2 | Tabla única de navegación y nombres de §4.1 en menú, H1, barra móvil, paleta y `title`; «Archivos de viaje» en lugar de «Reservas» | `diseno-ux` (nombres) + `frontend` | Spec: para cada módulo, etiqueta del menú = comando de la paleta = H1; e2e: `page.title()` por ruta |
| N3 | «Hoy», «Cotizaciones» y «Seguimientos» en el menú y en la paleta; destino tras ingresar según decida N0; time limits en «Hoy» | `frontend` | Spec de `formulario-ingreso` (destino por defecto); e2e: desde `/` se llega a Seguimientos y a Cotizaciones en 1 clic |
| N4 | Móvil: barra de 5 + hoja «Más» con la campana; flecha de volver en el error de la conversación | `frontend` | e2e a 390: cada módulo en ≤ 2 toques; `/bandeja/inexistente` tiene una salida |
| N5 | La URL como estado: Reservas usa `push` al elegir un archivo; leer `?id` en Catálogo y `?op` en Pipeline; pestañas de Configuración y de la ficha en `?pestana=` | `frontend` | e2e: elegir 1043 → 1044 → Atrás vuelve a 1043; `/catalogo?id=X` abre el paquete X |
| N6 | Paleta: buscar archivos en la misma fuente que Reservas; comandos para todos los módulos; «cotizaciones» y «seguimientos» devuelven su módulo | `frontend` | Spec de `buscador-global-logica`: buscar «1043» devuelve un id que `obtenerArchivo` resuelve; e2e de la paleta |
| N7 | Contexto en el cotizador: «Cotizando para Juan Pérez · desde la conversación», con volver al chat. Tras guardar, la acción principal es «Enviar por WhatsApp» y regresa al chat. Mismo total en cotizador y versión guardada | `diseno-ux` (flujo) + `frontend` | e2e: chat → Cotizar → guardar → enviar → de vuelta en el chat en ≤ 6 clics, con el mismo total |
| N8 | La campana cuenta lo que suman sus pestañas y sus avisos apuntan a archivos que existen. El error de sesión ofrece «Ir a ingresar» y no tapa la 404 | `frontend` (la guardia, con revisión de `auditor-seguridad`) | Specs de `notificaciones-web` y `guarda-sesion` |

Orden: N1 → N2 → N3 → N5 → N6 → N4 → N7 → N8. N0 corre en paralelo y debe cerrarse antes de N3.
- N1 y N2 quitan la sensación de «cada pantalla es de un sitio distinto».
- N3 da el «Hoy» a la asesora.

---

## 6. Qué NO tocar

- **Las URL existentes** (`/viajes`, `/bandeja/[id]`, `/cotizaciones/[id]`, `/viajes?id=`). Las usan
  los avisos del servidor, la paleta, las pruebas e2e y los enlaces ya compartidos. Se cambian las
  etiquetas, no las rutas.
- La bandeja de tres columnas y sus atajos (`j`/`k`, `/`, `?`). El panel «Solicitud de viaje» con su
  «Cotizar» prellenado. Los enlaces conversación ↔ cotización ↔ archivo que ya funcionan
  (`a14`, `a21`, `a28`).
- La lógica de `GuardaSesion` y `rutas-publicas` (qué exige sesión): solo se toca la presentación del
  error, y con el `auditor-seguridad`.
- La 404, los alias `/login` y `/iniciar-sesion`, y las páginas legales. Unificar las dos de cookies
  va a la cola, no a este lote.
- Meter el cotizador como panel dentro del chat. Es un cambio de alcance con su propio diseño: va a la
  cola del `dueno-de-producto`, no se cuela en estos PR.
