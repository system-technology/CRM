# Auditoría visual y de experiencia de usuario — plan de rediseño (2026-11-21)

| | |
|---|---|
| Quién | Sesión de diseño (carril `b/`), por encargo del propietario: analizar, mejorar y rediseñar toda la interfaz |
| Cliente de referencia | JD Tours (Colombia). El asesor trabaja casi todo desde el **celular (390 px)**, también cotiza; hoy usa WhatsApp Business y una hoja de Google |
| Prioridad | Navegabilidad y usabilidad en **tres familias de dispositivo** (corrección del propietario, 2026-11-21): celular (360–430 px, vertical y horizontal; referencia 390), **tablet** (768, 820, 1024 y 1180 px, vertical y horizontal) y escritorio (1280, 1440, 1920). Mismo diseño adaptable, no «móvil que se estira». Comodidad con dedo **y** con ratón/teclado |
| Base | `origin/main` en `5c152a0a` (PR #383). Las auditorías del 2026-11-20 (UX y navegación) ya se ejecutaron en buena parte: este informe **no las repite**, mide qué quedó |
| Alcance de esta fase | Solo análisis. **No se tocó código de producto.** El rediseño (Fase 2) espera el OK del orquestador |

**Marcas:** **[V]** visto en captura de esta sesión · **[M]** medido con un script o con `grep` sobre el código ·
**[C]** leído en el código · **[S]** supuesto, sin verificar.

## 0. Cómo se hizo (y qué no se pudo)

- **Entorno:** solo la web, en modo demo con datos de maqueta (`next dev -p 3456`, `NEXT_PUBLIC_USE_REAL_CRM=false`,
  `…USE_REAL_INBOX=false`, `…AUTH_MAQUETA=true`, sin API ni Postgres). Mismo método que la auditoría del 2026-11-20. El «modo de un
  solo proceso» con Postgres no se levantó: pide Docker con daemon y esta máquina no lo tiene. Los datos son de demo; no hay datos reales.
- **Recorrido (primera pasada):** Playwright, 390×844 (móvil con táctil) y 1440×900, `deviceScaleFactor` 2, 14 rutas más detalle de
  conversación, cotización (y su vista imprimible), contacto, archivo de viaje, paleta y hoja «Más». Más de 120 capturas en el
  scratchpad de la sesión; **no se versionan** (los nombres citados abajo, como `m-det-conv`, son los de esa carpeta).
- **Matriz de dispositivos (segunda pasada, tras la corrección del propietario):** Playwright con 10 tamaños —celular 360×800 y 430×932,
  celular horizontal 844×390, tablet 768×1024, 820×1180 (vertical), 1024×768 y 1180×820 (horizontal), escritorio 1280×720 y 1920×1080,
  y un **zoom del 200 %** emulado con una ventana de 720×450 px CSS— sobre 8 rutas (Hoy, Conversaciones, conversación, Cotizador,
  Archivos de viaje, Oportunidades, detalle de cotización, Contactos). Se midió por ruta y tamaño: desbordes horizontales, controles < 44 px
  y qué `nav`/`aside` hay a la vista. Capturas con `deviceScaleFactor` 1 (nombres `caps3/<tamaño>-<ruta>.png`; no se versionan).
- **Navegadores:** solo hay **Chromium** instalado (`/opt/pw-browsers`). **Safari iOS/WebKit, Firefox y Edge: sin verificar** (no se instaló
  nada). Todo lo que depende de ellos queda como **[S]** en §3.5.
- **No se vio:** la pantalla de ingreso real (en demo `/ingresar` redirige a Hoy), la campana abierta, estados de carga y de error
  (la maqueta responde al instante), el foco de teclado recorrido a mano, el contraste real de los grises (no se midió con
  herramienta), una sesión con rol de dueña frente a asesora, y nada contra la API real. Cada uno queda como **[S]** donde se cita.
- **MCP de 21st.dev:** disponible, **todavía no usado**: se consultará en la Ola 1 con un brief por componente (ver §4), no antes
  de fijar los tokens.

## 1. Veredicto

1. **La navegación ya no es el problema; el problema es la densidad y la jerarquía en 390 px.** El marco común existe (barra
   inferior de cinco, hoja «Más», lupa fija, migas, `title` por ruta, «Hoy» con insignia). Lo que falla ahora es lo que ocurre
   *dentro* de cada pantalla móvil: cabeceras de 250 a 700 px de alto antes del trabajo, controles apilados, botones del mismo peso.
2. **Hay dos sistemas visuales en uno.** Los tokens semánticos existen (`acento`, `ok`, `aviso`, `alerta` en `globals.css`) pero el código
   usa sobre todo la paleta cruda de Tailwind: ver A1. El resultado es la sensación de «cada pantalla de un sitio distinto» que la
   auditoría anterior ya describía, ahora sin pantallas rotas pero con verdes, ámbares y rojos sin significado único.
3. **La ventaja de turismo ya aparece donde más se usa** (fila de bandeja con `Cancún · dic`, panel «Solicitud de viaje», tarjeta de
   oportunidad con `San Andrés · dic · 2+1` y «Time limit mañana»). No hay que inventar identidad: hay que **sostenerla** con un
   componente único de «línea del viaje» y una escala de plazos única, y quitar lo que la tapa.
4. **El producto tiene dos diseños (< 768 px y ≥ 768 px), no tres.** La tablet no tiene diseño propio: hereda el de escritorio con riel de
   iconos sin etiquetas y controles pensados para ratón (14 de 57 controles < 44 px en la bandeja a 768 px); el celular horizontal (844×390) cae
   en el mismo riel y se queda sin altura. El zoom del 200 % sí reflota bien. Detalle en §3.5.
5. **Lo que más le cuesta al cliente piloto hoy**, en este orden: el aviso de cookies que tapa el 40 % del móvil en la primera visita;
   la cabecera de la conversación rota a 390 px; el detalle de la cotización con la acción de enviar a cinco bloques de distancia; los datos
   de prueba extrema que abren la demo.

## 2. Lo que funciona y se conserva (no se toca)

- Barra inferior móvil de cinco (Hoy · Conversaciones · Cotizar · Archivos · Más) con la hoja «Más», que agrupa los otros módulos, la campana y el perfil [V `m-mas`].
- Filas de bandeja con `Cancún · dic`, etiquetas de color con punto y texto (no solo color) [V `m-bandeja`].
- Panel «Solicitud de viaje» con un solo «Cotizar» prellenado [V `d-det-conv`].
- Tarjeta de oportunidad: destino, mes, pasajeros, salida, «Time limit mañana», próxima tarea con vencimiento [V `m-pipeline`].
- Cotizador móvil con total y «Guardar cotización» fijos sobre la barra inferior [V `m-cotizador`].
- Archivos de viaje ordenados por el plazo que vence primero, con insignia de texto + icono («Menos de 24 h», «En plazo») [V `m-archivos`].
- Enlace de archivo roto con salida («Volver a la lista») [V `m-det-archivo`].
- `title` por ruta («Hoy · ViajaPro», «Conversaciones · ViajaPro» …) [M]. Dos desajustes menores: `/cotizador` tiene H1 «Cotizador Comercial» y `title` «Cotizaciones», y `/bienvenida` tiene `title` «Configuración»; Hoy tiene como H1 el saludo, no «Hoy» (entran en la pasada de texto 4.9). **Cero desbordes horizontales de página en las 14 rutas a 390 px** [M, `scrollWidth − clientWidth = 0`].

## 3. Hallazgos priorizados

Cada uno: pantalla · referencia de captura · causa · propuesta · en qué ola entra (§4).

### 3.1 Bloqueante para el cliente

**B1 — El aviso de cookies tapa el 40 % del móvil y la barra inferior, en cada primera visita.**
*Pantalla:* cualquiera, 390 px, primera visita [V `m-hoy` de la primera pasada: el panel ocupa desde y≈1000 hasta y≈1660 de 1688 px y esconde la barra].
*Causa:* panel de tarjeta con título, insignia «Ley 1581 / SIC», cuatro líneas de texto, enlace y tres botones apilados en dos filas.
*Propuesta:* franja de una línea y dos botones («Solo necesarias», «Aceptar todas») con «Configurar» como enlace de texto; ≤ 25 % de la altura, **encima** de la barra inferior sin ocultarla, que se cierra al elegir. El texto legal completo queda en `/cookies`. *Ola 1.* (Texto y botones son de privacidad: la redacción la valida quien lleve T-093; este cambio es de forma.)

**B2 — La cabecera de la conversación se rompe a 390 px.**
*Pantalla:* `/bandeja/[id]` [V `m-det-conv`].
*Causa:* flecha, avatar, número (dos veces: nombre y teléfono iguales cuando no hay nombre), «Sin asignar», dos botones de asignación apilados, estado de ventana y «Viaje» compiten en una cabecera de ≈ 260 px; además hay una fila aparte para «+ Etiqueta».
*Propuesta:* cabecera de 56 px: flecha · nombre (o teléfono, sin repetir) con la ventana debajo en una línea de texto («Ventana: quedan 34 min» / «Ventana cerrada») · botón «Viaje» · menú ⋯ con Tomar, Soltar, Reasignar. Etiquetas en una sola fila con desplazamiento, bajo la cabecera. *Ola 2.*

**B3 — Detalle de cotización en móvil: la acción de enviar queda a cinco bloques.**
*Pantalla:* `/cotizaciones/[id]` [V `m-det-cot`].
*Causa:* flecha de volver y migas (dos filas, ≈ 180 px), chip «Cotización Oficial Guardada», tarjeta con estado, título, viajero con teléfono en monoespaciada, tres enlaces (conversación, contacto, file) y **siete botones** («Enviar en esta conversación» verde, «Abrir en la app de WhatsApp», «Modificar» azul, «Imprimir / PDF», «Duplicar v2», «Comparar versiones», …). Hasta el «Enviar» hay ≈ 600 px; por debajo hay más botones.
*Propuesta:* una sola fila de cabecera (flecha + título corto); resumen del viaje en una línea; el total y el vencimiento arriba; **barra de acción fija sobre la barra inferior** con «Enviar por WhatsApp» (única primaria) y «⋯» (Modificar, Duplicar, Comparar, Imprimir, Abrir en la app). Los tres enlaces quedan como una fila de píldoras. *Ola 2.*

**B4 — La demo abre con filas de prueba extrema y con cifras infladas.**
*Pantalla:* bandeja y Hoy [V `m-bandeja`, `m-hoy`]: «+573000009999 · Sin mensajes», «Cliente Texto Extremo 4000 · AAAA…», «María Alejandrina de la Santísima Trinidad Rod…», 270 conversaciones y 45 notificaciones.
*Causa:* el sembrado de maqueta mezcla datos de prueba de estrés con los de demostración; son los primeros de la lista.
*Propuesta:* separar «sembrado de pruebas» de «sembrado de demo», con 8 a 12 conversaciones creíbles y distintas. Es **tarea aparte** (toca `mocks`/sembrado, no la interfaz): se propone en §6 como T-nueva. Hasta entonces la demo a JD Tours enseña lo que se ve en la captura.

### 3.2 Alto

**A1 — Dos sistemas de color.** [M, `grep` sobre `apps/web/src/**/*.tsx`] Clases de color por familia: `neutral` 6.499, `acento` 1.432, y **crudos de estado** `amber` 774, `emerald` 616, `rose` 395, `red` 288, `indigo` 22, `orange` 5, contra los tokens de estado `alerta` 82, `ok` 70, `aviso` 14. Además 67 hex sueltos en componentes. Consecuencias [V]: «Ventana cerrada» y el contador de tiempo («34 min», «11 h 59 min» **sin etiqueta**) en verde, el mismo verde de «Pagado» y de WhatsApp; ámbar para «Pago pendiente», para el distintivo de demo y para «Time limit»; azul para «Seguimiento» y para la acción.
*Propuesta:* (a) tokens **semánticos de plazo y de estado** en `@theme` (`plazo-vencido`, `plazo-hoy`, `plazo-proximo`, `plazo-ok`, `canal-whatsapp`, `demo`), no por tono; (b) migración mecánica por familia de pantalla, un PR por pantalla; (c) una prueba (`spec`) que falle si un componente nuevo usa `emerald|amber|rose|red` directos o un hex suelto, con lista de excepciones que se reduce. *Ola 1 (tokens y prueba) y olas 2–4 (migración).*

**A2 — Texto de 9 a 11 px.** [M] 442 usos de `text-[9px]`, `text-[10px]` y `text-[11px]` (19 + 159 + 264). A 390 px en un celular con la luz del exterior, que es donde trabaja el asesor, esto es el principal riesgo de lectura. [S] El contraste de los grises pequeños probablemente baja de AA; no se midió con herramienta.
*Propuesta:* mínimo **12 px** (`text-xs`) en cualquier texto que lleve información, 13 px en móvil para el cuerpo de filas; 11 px solo para el contador de insignia. Medir contraste con una herramienta en la Ola 1 y fijar los grises permitidos como tokens. *Ola 1.*

**A3 — «Hoy» en móvil gasta dos tercios de la pantalla antes del trabajo.** [V `m-hoy`] Saludo con avatar de anillo dorado, insignia de demo, agencia, «Nueva cotización», «Bandeja WhatsApp 270» y luego **tarjetas de métrica de ≈ 360 px cada una**; los seguimientos del día aparecen en la tercera pantalla. En escritorio [V `d-hoy`] la cuarta tarjeta («Catálogo de excursiones · Pasadías & Tours») sigue siendo un anuncio, y «Accesos rápidos operacionales» repite el menú.
*Propuesta:* «Hoy» es una **lista de trabajo ordenada por lo que vence primero** (seguimientos vencidos y de hoy, time limits y pagos totales de 48 h, chats con SLA vencido, cotizaciones por vencer), con una tira de cuatro cifras de una línea que lleva a cada lista. Fuera: saludo grande, tarjeta de catálogo, accesos rápidos. *Ola 2 (móvil) y Ola 3 (escritorio).*

**A4 — Bandeja móvil: el 52 % de la pantalla son controles.** [V `m-bandeja`] Título + distintivo de demo + «Cómoda» (fila 1), búsqueda + «Etiquetas» (fila 2), cinco chips (fila 3): ≈ 440 de 844 px antes de la primera conversación. Los chips «SLA Vencido» y los contadores de tiempo no dicen qué miden.
*Propuesta:* el título sale (la cabecera global ya dice «Conversaciones»); la búsqueda es la lupa de la cabecera, con atajo `/`; una sola fila de chips con desplazamiento (Todas · Mías · Sin asignar · Sin leer · Vencidas) y «Etiquetas» como un chip más; «Cómoda» pasa a ajustes. Contadores con texto: «Ventana 34 min», «Responder en 11 h». *Ola 2.*

**A5 — Escritorio: la barra lateral solo con iconos y sin nombres.** [V todas las `d-*`] 12 iconos sin etiqueta, un **punto amarillo sin nombre** (es el distintivo de demo), un icono de portátil sin nombre y un anillo dorado como estado activo. Una asesora nueva no sabe qué es cada icono sin pasar el ratón. [S] Se muestra colapsada por defecto; no verifiqué si recuerda la preferencia (`>` arriba la expande).
*Propuesta:* a 1440 px **expandida por defecto**, con etiqueta y contador, activo en `acento` con `aria-current`, sin anillo dorado; colapsar es una preferencia del usuario. *Ola 3.*

**A6 — Dos botones «azules» compiten en la conversación.** [V `d-det-conv`, `m-det-conv`] «Cotizar» aparece **dos veces** (panel derecho y barra bajo el redactor) y «Seleccionar plantilla aprobada» es otro primario. Mismo problema en escritorio y móvil.
*Propuesta:* una acción principal por estado: con la ventana abierta, el redactor manda y «Cotizar» es secundario junto al clip; con la ventana cerrada, la primaria es «Reabrir con plantilla» y «Cotizar» baja a secundaria. Quitar el duplicado. *Ola 2.*

**A7 — Tablas y tableros que no se adaptan a 390 px.**
- Contactos: tabla con desplazamiento horizontal interno, la columna Correo cortada [V `m-contactos`].
- Pipeline: columna de 340 px con scroll horizontal, tarjetas de ≈ 650 px, **una tarjeta y media por pantalla**; las siguientes columnas asoman cortadas [V `m-pipeline`].
- Cabecera de Contactos: «8 contactos» en dos líneas, dos píldoras de resumen, tres filtros y exportar: ≈ 770 px antes del primer contacto [V].
*Propuesta:* en móvil, **lista** (no tabla) con fila de dos líneas (nombre + próximo viaje/teléfono); en Pipeline, **selector de etapa** (pestañas con conteo) y una lista de tarjetas compactas de 3 líneas, kanban solo desde `md`. *Olas 2 y 4.*

**A8 — Pantallas de «tarjetas de una cifra».** [V `m-configuracion`, `m-seguimientos`, `m-det-contacto`] Configuración: cuatro tarjetas de ≈ 180 px para «Total usuarios 4 · Dueños 1 · Asesores 2 · Invitaciones 1» (una pantalla y media); Seguimientos: cuatro tarjetas 2×2 de ≈ 270 px y pestañas que se parten en dos líneas; Ficha de contacto: cuatro tarjetas 2×2. Contradice «densidad de herramienta» y «KPIs solo si llevan a una acción».
*Propuesta:* una tira de contadores de una línea (`4 usuarios · 2 asesores · 1 invitación pendiente`); en Seguimientos las pestañas (Vencidos · Hoy · Próximos · Hechos) **son** el resumen y llevan el conteo. *Ola 4.*

**A9 — Cotizador: contexto y salida.** [V `m-cotizador`, `d-cotizador`] Fecha de salida libre `03/10/2026` (en el pasado respecto de hoy, 21 nov 2026, con formato ambiguo) en lugar de las salidas del paquete; sin viajero ni conversación de origen en la página; el subtítulo es jerga («Cotización oficial por composición de grupo y tarifario vigente»); «Ver Salidas en Catálogo» sigue mandando al asesor fuera del flujo. A 1440, la mitad inferior derecha queda vacía y el botón de guardar queda separado del total.
*Propuesta:* selector de salidas (fecha · cupo o estado · precio «desde») con la próxima preseleccionada; línea «Cotizando para Juan Pérez · desde la conversación» con volver; subtítulo fuera; el total sticky también en escritorio. Esto se solapa con T-321 (N7) del roadmap funcional: **coordinar**, ver §5. *Ola 2.*

**A10 — Seguimientos conserva un nivel de miga inventado.** [V `m-seguimientos`] «Hoy / CRM / Seguimientos»: «CRM» no es una pantalla. *Propuesta:* migas solo en el segundo nivel real; aquí, ninguna. *Ola 4.*

### 3.3 Medio

**M1 — Mayúsculas de título contra el lenguaje de interfaz.** [V] «Agendar Seguimiento», «Nueva Oportunidad», «Paquete Turístico», «Fecha de Salida», «Composición del Grupo», «Total Usuarios», «Cotizador Comercial», «Ver Salidas en Catálogo», «Cotización Oficial Guardada», y píldoras en mayúsculas («TRANSACCIONAL», «PROMOCIONAL», «ENVIADA», «TODO INCLUIDO»). Las dos skills piden una sola capitalización de oración. *Propuesta:* una pasada de texto por pantalla dentro de cada PR; las insignias de estado de dominio (ENVIADA) pasan a «Enviada».

**M2 — «n insuficiente (n = 14)» como titular.** [V `m-reportes`] Jerga estadística en 28 px. *Propuesta:* «Aún pocas cotizaciones para dar un porcentaje» con **5 de 14** como dato destacado y «con 20 enviadas se muestra el porcentaje» debajo. Es texto de presentación; el criterio del servidor no cambia. *Ola 4.*

**M3 — Tres formatos de fecha.** [V] «Vigente hasta 2027-06-15» (ISO, Catálogo), `03/10/2026` (campo), «20 dic 2026» (resto). *Propuesta:* un solo formateador de fecha en toda la presentación (`20 dic 2026`; en campos, `dd/mm/aaaa`) y una prueba que impida `toISOString().slice` o ISO en JSX. *Ola 1.*

**M4 — Distintivo «datos de demostración» repetido.** [V] En cada cabecera (a veces dos veces en la misma pantalla: Configuración) y, en escritorio, un punto amarillo sin nombre. *Propuesta:* **un** indicador discreto en el marco (barra lateral y hoja «Más») con texto «Demo» y `title`; fuera de las cabeceras de pantalla. *Ola 1.*

**M5 — Estados de carga, error y vacío no recorridos.** [S] Existe `esqueletos.tsx`, `aviso-sin-conexion.tsx`, `estado-sin-catalogo.tsx`, pero la maqueta responde al instante y no se vieron. *Propuesta:* en la Ola 1, una página interna de estados (solo desarrollo) o un modo `?estado=` que fuerce cargando/error/vacío por pantalla para capturarlos antes y después de cada PR.

**M6 — Tamaño táctil.** [M, script sobre elementos interactivos renderizados con alto o ancho < 44 px, a 390 px] Hoy 6/52, Conversaciones 2/71, Catálogo 16/58, Contactos 16/54, Seguimientos 21/88, Configuración 9/48, Reportes 1/36. El código ya usa `min-h-[44px]` 549 veces: los incumplidores son pocos y puntuales (chips, enlaces de tabla, iconos de tarjeta). No se distinguió enlace dentro de un párrafo (exento) de control suelto: hay que revisarlos uno a uno en cada PR.

**M7 — Foco de teclado.** [C] 49 archivos usan `focus-visible`; 19 usan `focus:outline-none`. [S] No se recorrió con teclado; hay que verificar que cada `outline-none` tenga un anillo propio. Un anillo de foco **único** (token) en la Ola 1.

**M8 — Ficha de contacto.** [V `m-det-contacto`] Encabezado de tarjeta con avatar blanco sobre blanco (iniciales sin fondo), dos acciones de igual peso («Nueva Oportunidad» azul y «Agendar Seguimiento»), correo y teléfono sin acción de llamada o WhatsApp directa, KPIs que no llevan a nada. *Propuesta:* «Abrir WhatsApp» como acción primaria (ya está en la cabecera), viajes del contacto como lista con su línea de viaje. *Ola 4.*

### 3.4 Bajo

- **B-1.** Indicador de desarrollo de Next (la «N» redonda, a veces «1 Issue / 3 Issues» en rojo) tapa «Hoy» en la barra inferior en las capturas [V]. Es solo de desarrollo [S: no aparece en producción]; para capturas y e2e se apaga con la opción de Next.
- **B-2.** Hoja «Más»: los tres enlaces legales («Privacidad · Términos · Cookies») ocupan el pie con el peso de un módulo; pasarlos a texto pequeño al final de «Perfil» [V `m-mas`].
- **B-3.** Pasajeros del cotizador con «−» escrito como guion «-» [V]; usar «−» (menos real) y un `aria-label` («Quitar un adulto»).
- **B-4.** Hoy: tarea «Confirmar pago de anticipo $2.500.000» con hora «1:54 a. m.» [V `d-hoy`]: dato de demo incoherente con una jornada de trabajo; arreglo en el sembrado (§6).
- **B-5.** «Vista Asesor (Operativa)» en Reportes es una píldora gris sin aspecto de control [V `m-reportes`]; si cambia la vista debe verse como selector, si no, es texto.

### 3.5 Las tres familias de dispositivo (celular, tablet, escritorio)

**Cómo está resuelto hoy [C + V].** Hay **dos** diseños, no tres, y el corte es único:

| Ancho | Navegación | Bandeja | Quién cae aquí |
|---|---|---|---|
| < 768 px (`md`) | Cabecera de 44 px con lupa + barra inferior de 56 px + hoja «Más» | Una columna: lista **o** hilo | Celular vertical; **escritorio con zoom 200 %** (1440 → 720 px CSS) [V `zoom200-*`] |
| 768 – 1279 px | **Riel de iconos de 56 px, sin etiquetas** (el mismo de escritorio) | Riel + lista fija de 320 px + hilo; la ficha del viajero **no cabe** y pasa a cajón | **Tablet vertical y horizontal, y celular horizontal (844)** [V `tab768v-conv`, `tab1024h-conv`, `celH-bandeja`] |
| ≥ 1280 px (`xl`) | El mismo riel de 56 px (a 1920 también) | Lista de 340 px + hilo + ficha fija de 340 px | Escritorio 1280, 1440, 1920 [V `esc1920-bandeja`] |

Puntos de quiebre usados [M, `grep`]: `sm` 448 veces, `md` 151, `lg` 59, `xl` 14, `2xl` 2. Los de Tailwind v4 (640, 768, 1024, 1280, 1536) son los mismos que usa el layout `(app)` (conmuta en `md` y en `xl`): **son coherentes entre sí**, pero no hay ningún quiebre propio ni por altura ni por tipo de puntero. Resultado: la tablet no tiene diseño propio; hereda el de escritorio con controles pensados para ratón.

**Desbordes de página:** 0 en las 80 combinaciones medidas (10 tamaños × 8 rutas) [M]. Lo que falla no es el desborde, es la comodidad.

**Hallazgos por familia**

- **D1 · Tablet vertical (768 / 820): dos paneles sin aire.** [V `tab768v-conv`] Riel 56 + lista 320 + hilo de **392 px** (a 820: 444 px). En el hilo, el número de teléfono se trunca a «+…», «Tomar» y «Reasignar» se apilan, y el botón «Cómoda» de la lista queda **cortado** («Co»), cosa que ocurre en **todos** los anchos porque la lista mide siempre 320–340 px [V todas las `*-bandeja`]. *Propuesta:* regla por familia (ver «Reglas por familia» en §4.3): en 768–1023 la lista pasa a 300 px con controles en una fila y la cabecera del hilo se rehace a una línea (B2); la ficha, cajón. Si aun así el hilo queda < 440 px, patrón de **una columna** (lista → hilo con flecha de volver), con riel visible.
- **D2 · Celular horizontal (844×390) cae en el diseño de tablet/escritorio.** [V `celH-bandeja`, M] El riel necesita 428 px de alto dentro de una ventana de 390: los iconos de abajo (campana, perfil) quedan **fuera de pantalla**, la lista enseña **una conversación y media** (los controles gastan ≈ 300 de 390 px) y la cabecera de cotizar/archivo igual. *Propuesta:* regla por **altura** (`@media (max-height: 480px)`): cabecera y controles colapsados, riel con scroll o barra inferior compacta, bandeja en una columna.
- **D3 · Riel sin etiquetas, ahora también en tablet.** (A5, agravado) En tablet no hay ratón: no hay `title` ni tooltip que valga [C: Tailwind v4 solo aplica `hover:` donde el dispositivo tiene hover]. Doce iconos sin nombre y un punto amarillo. *Propuesta:* **riel con icono + etiqueta debajo** (≈ 72 px de ancho, objetivos de 44+ px) entre 768 y 1279; menú lateral **expandido con etiqueta al lado** desde 1280; el punto amarillo pasa a «Demo» (M4).
- **D4 · Objetivos táctiles en tablet.** [M] A partir de 768 px el DOM mide con densidad de ratón: controles < 44 px en la bandeja **14 de 57**, en la conversación **18 de 64** (73 a 1280), en Contactos **19 de 40**, en Hoy 9 de 38; en celular vertical son 2/45, 0/7, 16/30 y 6/28. O sea, la tablet táctil es la **peor** servida. *Propuesta:* utilidad única «objetivo» con `pointer-coarse:` de Tailwind v4 (≥ 44 px con dedo) y densidad compacta con `pointer-fine:` (ratón); una **tablet con teclado y ratón** debe poder compactarse sin que otra con dedo pierda 44 px.
- **D5 · Escritorio ancho (1920).** [V `esc1920-bandeja`] Con la bandeja sin conversación, **≈ 1.500 px vacíos**; con la ficha fija, el hilo se estira (línea de mensaje de ≈ 1.100 px: ilegible por largo) [S, no capturé una conversación a 1920]. *Propuesta:* columna de mensajes con ancho máximo ≈ 720 px centrada; páginas de lista con `max-w` ≈ 1600 px; en 1920 la ficha y una vista previa de la cotización caben a la vez.
- **D6 · Zona segura (notch y barra de inicio).** [C] No hay `viewport-fit=cover` ni un solo `env(safe-area-inset-*)`; la barra inferior (`h-14`, fija) y las barras de acción no reservan el inset inferior ni el lateral en horizontal. [S, **sin verificar en WebKit**] En iPhone con barra de inicio, en una PWA instalada o en horizontal con notch, la barra puede quedar bajo el gesto o bajo la muesca.
- **D7 · Alto de la ventana y teclado en pantalla.** [C] El marco privado usa `100dvh` (bien: sigue la barra del navegador). Las páginas públicas (ingreso, invitación, legales, 404, error, imprimible) usan `min-h-screen` / `100vh` (11+ usos): en Safari iOS `100vh` incluye la barra de herramientas y el botón del ingreso puede quedar tapado [S, sin WebKit]. El teclado virtual **no se pudo probar** (Playwright no lo emula): **sin verificar**. Sí hay un defecto verificable: el pie del hilo lleva `pb-24 md:pb-3` [C `bandeja/[id]/page.tsx:1299`], **96 px de relleno pensados para la barra inferior**, pero el hilo en celular es pantalla completa y **no tiene barra** [V `m-det-conv`: ≈ 95 px de vacío bajo «Cotizar»]; con el teclado abierto, ese relleno empuja el campo. *Propuesta:* quitar el relleno en el detalle móvil; `min-h-dvh` en las públicas; `interactive-widget=resizes-content` en el `viewport`; probar con teclado real en un dispositivo.
- **D8 · Zoom del 200 %.** [V `zoom200-*`, M] A 720 px CSS el diseño reflota a celular con barra inferior; **0 desbordes** en las 8 rutas y se puede operar. Pendientes: Contactos sigue con tabla de desplazamiento interno y 16 de 30 controles < 44 px (A7). Es resultado aceptable; a 400 % es un celular de 360 px.
- **D9 · Hover y teclado.** [C] 948 usos de `hover:`; Tailwind 4.3.5 los envuelve en `@media (hover: hover)`, así que **no hay «hover pegado» en táctil**. Foco de teclado: ver M7 (sin recorrer). Navegación por teclado en la bandeja: atajos `j/k`, `/`, `?` ya existen y se conservan.
- **D10 · Cotizador por familia.** [V `tab820v-cotizador`, `tab1024h`] Funciona: una columna con el resultado debajo en tablet vertical y total fijo al pie; en horizontal la columna de formulario baja a 285–370 px y el resultado ocupa el resto. Sigue valiendo A9 (salidas, contexto del viajero).
- **D11 · Navegadores.** Chrome/Chromium: medido. **Safari iOS, Firefox, Edge: sin verificar.** Riesgos conocidos por código que solo WebKit confirmaría: D6, D7, `dvh`, `backdrop-blur` en la hoja «Más», `100vh` en públicas y los `select` nativos del cotizador. Se pide una pasada manual en un iPhone y un iPad antes de dar por cerrada la Ola 2.

## 4. Dirección de diseño y plan de rediseño por olas

### 4.1 Plan de dirección (pasos 1 y 2 de `diseno-web` y `frontend-design`)

**Quién y qué trabajo.** La asesora de JD Tours, en el celular, con luz natural y una mano ocupada: contesta chats, cotiza, enviar, revisa qué le toca hoy. **Una frase por pantalla:** *Hoy* = qué me vence; *Conversaciones* = a quién contesto; *Cotizar* = cuánto cuesta y a quién se lo mando; *Archivo de viaje* = qué plazo me queda y qué me deben.

**Concepto (una sola idea que se nota): «la línea del viaje».** La identidad de turismo sale de la información, no de adornos. Un solo componente, `LineaDeViaje`, que dice `Cancún · 15 dic · 2+2` con el plazo más próximo a la derecha («Time limit mañana»), se usa **igual** en la fila de bandeja, la tarjeta de oportunidad, la cabecera de la conversación, la cotización, el archivo de viaje y «Hoy». El resto de la interfaz se queda callado.

**Paleta (nombres de dominio, ya en `@theme`; se reordena el uso, no se inventa otra):**

| Nombre | Hex | Uso único |
|---|---|---|
| `oceano-800` | `#0f2b4c` | Texto fuerte, barra lateral, cabeceras oscuras |
| `acento-600` | `#2563eb` | **La** acción principal de la pantalla, enlaces, ítem activo |
| `plazo-hoy` (aviso-700) | `#b45309` | Vence hoy o mañana; siempre con icono y texto |
| `plazo-vencido` (alerta-700) | `#b91c1c` | Vencido; nada más es rojo, salvo destructivo |
| `canal-whatsapp` | verde actual de la bandeja | **Solo** WhatsApp (enviar, ventana abierta). Nunca «pagado», «ok» ni «cerrada» |
| `ok-700` | `#15803d` | Confirmado, pagado (con texto) |

**Tipografía.** Se queda **Inter** (ya cargada, `font-sans`): cambiar de familia es churn sin ganancia en una herramienta de datos. Lo que sí cambia, y se nota: `font-variant-numeric: tabular-nums` en todo importe, total y contador, para que las columnas de dinero y los plazos alineen; escala con piso de 12 px (13 px en filas móviles); una sola jerarquía de titular (22/18/15). Sin mayúsculas de etiqueta, sin «eyebrows».

**Layout.** Móvil: cabecera de 56 px, contenido, barra de acción fija **solo cuando la pantalla tiene una acción principal** (cotizador, cotización, archivo), barra inferior de cinco. Escritorio: barra lateral expandida con etiquetas; bandeja de tres columnas y panel «Solicitud de viaje» se quedan; páginas de lista a ancho completo con filas densas.

**Revisión contra el pedido y contra el defecto genérico.** Primera idea descartada: un «tema playa» con fotos y degradados (cae en la lista de rasgos de plantilla y la skill `diseno-web` lo prohíbe en la herramienta de trabajo). Segunda: cambiar la tipografía a una serifa «con carácter» (se paga en legibilidad de cifras a 12 px). Se queda lo que **sí** diferencia a una herramienta de agencia: la línea del viaje, los plazos con significado único, cifras tabulares y una acción por pantalla. La libertad estética se reserva para la **propuesta al viajero** (la pieza que él reenvía): Ola 5, aparte.

### 4.2 Sobre un sistema de diseño o paquete nuevo (R7)

**Recomendación: no crear un paquete nuevo todavía.** `packages/ui` hoy es solo un README y hay **un único consumidor** (`apps/web`); extraer ahora es deuda sin beneficio (CLAUDE.md §10). Los componentes del sistema viven en `apps/web/src/components/comun/` (ya hay 30 ahí: `boton-turismo`, `insignia-turismo`, `cabecera-movil`, `hoja-mas`, `barra-inferior-movil`, `campo-fecha`…) y los tokens en `globals.css`. Eso **no cambia la estructura** del sistema → **no pide ADR**. Si el propietario prefiere que nazca `packages/ui` (por ejemplo para un segundo cliente web), **entonces sí** hace falta un ADR antes del código y lo escribo yo (ruta protegida: lo integra el orquestador con auditoría). **Decisión que pido al orquestador en el OK del plan.**

Sin dependencias nuevas en ninguna ola. `lucide-react` (ya presente) cubre los iconos.

### 4.3 Olas (cada PR es una pantalla o un componente; carril `b/`; todos sin auto-merge y con capturas antes y después de **celular, tablet en las dos orientaciones y escritorio**)

**Reglas por familia (propuesta que fija la Ola 1; se discute al aprobar el plan).** Un solo diseño adaptable con **tres modos** y dos
reglas ortogonales (altura y puntero), en lugar del corte único de hoy:

| Modo | Rango | Navegación | Bandeja | Puntero y densidad |
|---|---|---|---|---|
| **Celular** | < 768 px | Cabecera 44–56 px + barra inferior de 5 + hoja «Más» | Una columna (lista → hilo con flecha) | Táctil: objetivos ≥ 44 px |
| **Tablet** | 768 – 1279 px (vertical y horizontal) | **Riel de ≈ 72 px con icono + etiqueta**, sin barra inferior | 768–1023: lista 300 px + hilo, ficha en cajón; 1024–1279: lista 320 + hilo, ficha en cajón; si el hilo queda < 440 px, una columna | **Táctil por defecto**: objetivos ≥ 44 px; compacta solo con `pointer-fine` |
| **Escritorio** | ≥ 1280 px | **Menú lateral expandido** con etiqueta y contador (colapsable por preferencia) | Lista 340 + hilo (columna de mensajes ≤ 720 px) + ficha fija | Compacto con ratón; el foco de teclado siempre visible |

Reglas ortogonales: **altura ≤ 480 px** (celular horizontal) → cabecera y controles colapsados, riel con scroll, bandeja en una columna;
**`pointer-coarse` / `pointer-fine`** (variantes de Tailwind v4, sin dependencias nuevas) para el tamaño de objetivo, no el ancho;
**zonas seguras** (`viewport-fit=cover` + `env(safe-area-inset-*)`) en barras fijas; **`dvh`** en todas las alturas de ventana;
puntos de quiebre **los de Tailwind** (640 · 768 · 1024 · 1280 · 1536), declarados una vez en `@theme` con nombre de dominio y usados
también por el layout `(app)`. Todo cambio de ancho de panel se verifica con las diez ventanas de §0.

**Ola 1 — Sistema y layout responsivo: puntos de quiebre, marco, tokens y componentes base** *(lo primero: sin esto, cada PR siguiente pelea contra el color crudo y contra un corte único en 768 px)*

| PR | Contenido | Hallazgos | Archivos principales |
|---|---|---|---|
| 1.0a | **Marco responsivo:** tres modos, riel de tablet con etiquetas, menú lateral expandido en escritorio, regla de altura, `viewport-fit`/zonas seguras, `dvh` | D1–D3, D6, D7, A5 | `components/comun/marco-de-trabajo.tsx`, `components/bandeja/barra-modulos.tsx`, `app/layout.tsx` |
| 1.0b | **Utilidades de puntero:** objetivo ≥ 44 px con `pointer-coarse`, densidad con `pointer-fine`; revisar los controles < 44 px de cada ruta | D4, M6 | `app/globals.css` + componentes base |
| 1.0c | **Bandeja adaptable:** lista a 300/320/340 según modo, controles de la lista sin recorte («Cómoda»), hilo con columna de mensajes ≤ 720 px, quitar el relleno `pb-24` del hilo móvil | D1, D5, D7 | `app/(app)/bandeja/layout.tsx`, `bandeja/[id]/page.tsx`, `components/bandeja/` |
| 1.1 | Tokens semánticos de plazo/estado/canal/demo en `@theme`; escala tipográfica con piso de 12 px; `tabular-nums`; anillo de foco único. Sin tocar pantallas | A1, A2, M7 | `app/globals.css` |
| 1.2 | `LineaDeViaje` y `InsigniaDePlazo` (texto + icono + token, una escala de plazos: vencido · hoy · próximo · en plazo) con pruebas | A1 | `components/comun/` (nuevos) |
| 1.3 | Formateador único de fecha y de dinero visible, y prueba que bloquea ISO y colores crudos nuevos (con lista de excepciones que baja) | M3, A1 | `lib/` (formato), `*.spec.ts` |
| 1.4 | Aviso de cookies compacto (B1) y distintivo «Demo» único en el marco (M4) | B1, M4 | `components/privacidad/`, `components/comun/marco-de-trabajo.tsx`, `distintivo-datos-demo.tsx` |
| 1.5 | Modo `?estado=` para forzar cargando/error/vacío, solo en demo, para capturar estados | M5 | un helper de maqueta |

**Ola 2 — Celular y tablet: núcleo de JD Tours** *(lo que el asesor hace con el celular o la tablet; cada PR se verifica en celular vertical y horizontal y en tablet vertical y horizontal)*

| PR | Pantalla | Hallazgos |
|---|---|---|
| 2.1 | Conversación: cabecera de 56 px, ventana en una línea, menú ⋯, etiquetas en una fila, una sola acción principal | B2, A6 |
| 2.2 | Bandeja: controles en una fila con lupa, contadores con texto, «Ventana cerrada» con su color | A4, A1 |
| 2.3 | Detalle de cotización: cabecera de una fila, barra de acción fija, resto en ⋯ | B3 |
| 2.4 | Cotizador: selector de salidas, línea «cotizando para…», total fijo | A9 (con T-321) |
| 2.5 | Archivo de viaje (detalle): acción principal única, plazos con `InsigniaDePlazo`, enlaces a chat y cotización como fila | A1 |
| 2.6 | Hoy móvil: lista de trabajo por vencimiento | A3 |

**Ola 3 — Escritorio núcleo** *(1280, 1440 y 1920; con ratón y teclado, y con zoom al 200 %)*

| PR | Pantalla | Hallazgos |
|---|---|---|
| 3.1 | Barra lateral expandida con etiquetas y contadores; activo en `acento`; sin anillo dorado | A5 |
| 3.2 | Hoy escritorio: lista de trabajo + tira de cifras, sin tarjeta de catálogo ni accesos duplicados | A3 |
| 3.3 | Conversación escritorio: una «Cotizar», panel «Solicitud de viaje» con `LineaDeViaje` | A6 |
| 3.4 | Archivos de viaje escritorio: lista y detalle con densidad de tabla (se coordina con T-334, ver §5) | — |
| 3.5 | Cotizador y cotización a ancho de escritorio: total fijo y acción junto al total | A9, B3 |

**Ola 4 — El resto**

| PR | Pantalla | Hallazgos |
|---|---|---|
| 4.1 | Oportunidades: móvil con selector de etapa y tarjeta compacta; kanban desde `md` | A7 |
| 4.2 | Contactos: lista en móvil; cabecera de una fila | A7 |
| 4.3 | Ficha de contacto | M8, A8 |
| 4.4 | Catálogo: filtros en una fila, fecha en formato único, tarjeta con `LineaDeViaje` | A7, M3 |
| 4.5 | Seguimientos: sin miga «CRM», pestañas con conteo en lugar de tarjetas | A8, A10 |
| 4.6 | Reportes: «n insuficiente» y tira de cifras | M2 |
| 4.7 | Configuración: tira de contadores, un solo distintivo | A8, M4 |
| 4.8 | Ingreso, 404 y páginas legales (**tras** #362) | — |
| 4.9 | Pasada de texto: sentence case, «Agendar seguimiento», estados en minúscula | M1 |

**Ola 5 (aparte, propuesta)** — La propuesta al viajero y su versión imprimible: portada, itinerario, incluye / no incluye, RNT. Es donde sí cabe libertad estética (fotos, tipografía con carácter). Va después de que el propietario fije la marca y el logo.

**Criterio de salida del rediseño** (comprobado en navegador): en celular (390 px) y en tablet vertical (768 y 820), la primera pantalla de cada módulo muestra **trabajo** (filas, no controles) en ≥ 60 % de la altura; en cada pantalla hay **una** acción principal; los plazos usan la misma escala de cuatro estados; ningún texto informativo < 12 px; ningún `emerald|amber|rose|red` crudo fuera de la lista de excepciones; **cero desbordes horizontales de página en los diez tamaños de §0**; con dedo (`pointer-coarse`) ningún control < 44 px; cada PR trae captura antes y después de celular, tablet (vertical y horizontal) y escritorio, y deja anotado lo que **no** se pudo probar (WebKit, Firefox, teclado en pantalla).

### 4.4 Redacción propuesta del criterio de salida de JD Tours (celular, tablet y escritorio)

Hoy, `08-roadmap-jd-tours-reservas-cobros-y-navegacion.md` §3 dice, en el punto 9, «**Móvil de verdad (390 px, sin desplazamiento lateral)**…», y el
principio 7 de §1 habla del celular como único dispositivo. El documento lo edita el orquestador; esta es la redacción propuesta:

> **Principio 7 (ampliado).** El asesor trabaja desde el **celular, la tablet o el navegador de escritorio**, a veces los tres el mismo día. Todo lo que hace una asesora —responder, cotizar y enviar, poner una etiqueta, registrar un pago, ver quién debe y qué le toca hoy— debe poder hacerse en **cada** familia sin desplazarse de lado, con **dedo** (objetivos ≥ 44 px) y con **ratón y teclado** (foco visible, atajos), en vertical y en horizontal.
>
> **Criterio de salida, punto 9 (ampliado).** *Celular, tablet y escritorio de verdad.* En un navegador, con datos de demo creíbles y **en cada una de las tres familias** (celular 390 px; tablet 768 / 820 vertical y 1024 / 1180 horizontal; escritorio 1280 / 1440 / 1920) y sin desplazamiento lateral de página: una cotización completa (paquete, salida, pasajeros, total, guardar, enviar por WhatsApp y volver al chat), poner o quitar una etiqueta, registrar un pago y consultar el saldo de un archivo de viaje. Además: la navegación es la propia de cada familia (barra inferior, riel con etiquetas o menú lateral) y cualquier módulo está a dos toques o clics; con el zoom del navegador al 200 % se sigue pudiendo operar; y lo que no se probó en un dispositivo real (Safari en iPhone y iPad, Firefox, Edge, teclado en pantalla) consta como «sin verificar» en la bitácora, no como hecho.
>
> **Punto 1 (ajuste).** «… dos clics o menos (dos toques en celular y tablet)…».

## 5. Anticolisión con la sesión funcional (apps/web)

PR abiertos al 2026-11-21 que tocan `apps/web` [gh, archivos listados con `pulls/<n>/files`]: **#387** (solo `lib/permisos.ts`), **#385** (`feat/web-salida-en-el-error-de-sesion`: `error.tsx`, `not-found.tsx`, `guarda-sesion.tsx`, **`components/bandeja/barra-modulos.tsx`**, `panel-notificaciones.tsx` y librerías de notificaciones), **#362** (`a/T-000-apodo-ingreso-web`: `formulario-ingreso.tsx`, `bloque-equipo.tsx`, librerías de auth). Por eso:

- **#385 toca `barra-modulos.tsx`**, que la **PR 1.0a** (marco responsivo, riel con etiquetas) necesita reescribir: **1.0a espera a que #385 entre** (o se acuerda con su autora). Mientras tanto, 1.0b (utilidades de puntero, `globals.css`) y los componentes base de 1.1 a 1.3 no chocan con ningún PR abierto.
- **Ingreso (4.8), campana y guarda de sesión, 404 y error:** no se tocan hasta que #385 y #362 entren.
- **T-321 (N7, contexto del cotizador) y T-334 (tabla de archivos)** son de la sesión funcional y se solapan con 2.4, 3.4: **no empiezo ninguno sin acordar** el reparto por mensaje con la sesión del roadmap (`session_01R81Xh5cU4HFUZKTZJ7kcHe`). Propuesta: ella hace la lógica (qué datos, qué ruta); yo la presentación, en PR separados y en ese orden.
- Antes de editar cualquier archivo: `git fetch` y revisar `gh api repos/system-technology/CRM/pulls?state=open`, como en la regla 2 del encargo.

## 6. Cola propuesta (no bloquea; requiere dueño, la numera el orquestador tras `git fetch`)

| Propuesta | Dueño | Por qué no entra en el rediseño |
|---|---|---|
| Separar el sembrado de maqueta de **demo** del de **pruebas de estrés**; 8–12 conversaciones creíbles; horas coherentes | `frontend` (mocks) o `qa` | Toca datos de maqueta y e2e, no la presentación (B4, B-4) |
| Medir contraste AA de los grises y de las insignias con una herramienta y fijar la lista de grises permitidos | `diseno-ux` / `qa` | Necesita herramienta; se hace dentro de 1.1 si cabe |
| Foco de teclado recorrido a mano en bandeja, cotizador y archivos | `qa` | Verificación, no diseño (M7) |
| Decisión del propietario: **nombre comercial, logo y marca** | Propietario | Todo el sistema usa «ViajaPro» y el avión como logo provisional; condiciona la Ola 5 y la portada de ingreso |
| Decisión: ¿`packages/ui` ahora o después? (§4.2) | Orquestador / propietario | Define si hace falta ADR |

## 7. Qué NO se hace

- No cambia comportamiento, contratos, API, migraciones ni lógica de negocio. Si un cambio de UX lo exige (por ejemplo, salidas del paquete en el cotizador, si la API no las expone), se propone como tarea aparte.
- No se añaden dependencias.
- No se cambia la estructura de rutas ni las URL (ADR-0032 y §6 de la auditoría de navegación).
- No se versionan capturas.
- No se usan fotos ni degradados en la herramienta de trabajo; la imagen cuidada va en lo que ve el viajero.
