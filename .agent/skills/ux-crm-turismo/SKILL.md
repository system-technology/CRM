---
name: ux-crm-turismo
description: Reglas de experiencia e interfaz para que ViajaPro se vea y se use como un CRM de agencias de turismo, no como un panel genérico. Úsala antes de construir o cambiar cualquier pantalla de apps/web: bandeja, pipeline, catálogo, cotizador, contactos, viajes, reportes y configuración.
---

# UX de un CRM de agencias de turismo

Quien usa esto es un **asesor de viajes** con 6–15 conversaciones abiertas, muchas veces en el celular, con un cliente esperando. Vende **experiencias y fechas**, no «registros». La pantalla tiene que sentirse como una herramienta de agencia —destinos, salidas, cupos, pasajeros— y no como una hoja de cálculo con colores.

## Fuentes que mandan (léelas, no las reinventes)
- `docs/01-producto/09-especificacion-visual.json`: paleta, tipografía, alcance. Los tokens de ahí mandan.
- `docs/_assets/diseno/*.png`: referencia visual (bandeja, cotizador real, plazas sin usar, producto completo).
- `docs/01-producto/02-lenguaje-ubicuo.md`: vocabulario. `Salida`, `Archivo de viaje`, `Pasajero`, `Cotización`. Nunca `Booking`, `Order`, `Item`.
- `.claude/agents/diseno-ux.md`: los ocho principios de producto (la conversación es el centro, tres clics, estado siempre visible…).
- Componentes existentes en `apps/web/src/components/` y `packages/ui`: reutilízalos antes de crear uno nuevo.

## Lo que hace que se vea «de turismo»
1. **El destino es el protagonista.** Toda tarjeta de producto lleva imagen (o un degradado + icono de tipo de tour si no hay foto), nombre, duración («1 día», «5D/4N») y el precio. Nada de filas grises sin cara.
2. **Precio claro y honesto.**
   - «Desde $450.000» cuando hay varias tarifas; precio por persona explícito («por persona»).
   - Promo vigente: precio de la promo destacado y precio de lista tachado; muestra «hasta el 30 oct».
   - **Promo vencida: la decide cada agencia** con el ajuste `promo_vencida` (`ocultar` = solo el precio vigente, sin rastro de la promo; `tachar` = precio de lista tachado con la leyenda «promo vencida»). **Nunca lo fijes en el código**: léelo de la configuración de la agencia en toda pantalla que muestre precio (tarjeta, cotizador, cotización compartida). El precio no cambia solo en ninguno de los dos casos.
   - Cargos que se pagan en destino (impuesto de muelle, tasa portuaria) van aparte, con etiqueta «No incluido», y **nunca se suman al total**.
   - Sin precio publicado: «Consultar», nunca `$0`.
3. **Fechas y cupos a la vista.** Salidas como chips o calendario («sáb 3 oct»), con cupos («quedan 4») y estados: disponible, últimos cupos, agotado, cerrado. Una salida agotada se ve distinta, no desaparece.
4. **Composición del grupo en lenguaje de viaje:** adultos, niños (2–11), infantes. Avisos útiles en el momento: «1 plaza sin usar, se paga igual».
5. **Estado de la venta como recorrido**, no como etiqueta suelta: consulta → cotización → negociación → ganada (archivo de viaje). Un asesor debe ver en qué punto está cada cliente y qué sigue.
6. **WhatsApp es el centro.** Desde cualquier oportunidad o cotización se llega a la conversación en un clic, y desde la conversación se cotiza sin salir. Muestra la ventana de 24 h y el SLA cuando corren.
7. **Tono cálido y profesional, en español de Colombia.** Textos cortos y concretos («Aún no tienes excursiones. Carga tu catálogo o crea la primera»). Nada de jerga técnica ni de «algo salió mal».

## Identidad visual (pedido del propietario, 2026-10-26): limpio, pero con viaje
El diseño actual gusta por ordenado, pero se ve **genérico y plano**. Se mantiene la limpieza y se añade identidad de turismo:
- **Color.** Conserva el azul de marca `#2563EB` y los neutros, y suma una paleta caribeña: turquesa `#06B6D4`, océano profundo `#0B1F3A`, coral `#FB7185`, atardecer `#F97316`, arena `#FDE68A` y un **amarillo de resalte `#FACC15`** (estilo directo y vistoso de las agencias de excursiones: títulos fuertes con un resalte amarillo, e **insignias circulares con aro dorado** para cada dato clave como duración, salida o cupos). Degradados: *mar* (`#0EA5E9` a `#2563EB`) y *atardecer* (`#F97316` a `#F43F5E`). Cada tipo de producto tiene su color: isla o beach club = turquesa, reserva natural = verde, city tour = ámbar, excursión de ciudad = violeta, paquete con hotel = azul. Úsalos como acentos (chips, iconos, cabeceras, botón primario), no como fondos enormes: contraste AA siempre.
- **Iconos.** Un icono de color por módulo (bandeja = mensaje, pipeline = tablero, cotizaciones = documento, catálogo = brújula o palmera, contactos = personas, viajes = avión, reportes = gráfico, configuración = engranaje) en círculos de color suave, con la misma librería de iconos que ya usa el proyecto. Nada de emojis como iconos.
- **Movimiento** (CSS, sin dependencias nuevas salvo justificación en `ENTREGA.md`): entrada escalonada de listas y tarjetas (40 a 60 ms entre elementos), elevación de tarjetas al pasar el cursor, esqueletos con brillo, transiciones de página y paneles de menos de 300 ms, botón con estado de carga. **Siempre** respeta `prefers-reduced-motion`. Ninguna animación bloquea una acción ni dura más de 400 ms.
- **Imágenes.** Fotos de destino solo si son de la agencia o de uso libre y licenciado; mientras no haya foto, un degradado del color del tipo con su icono grande. Sin imágenes enlazadas de terceros.
- **Navegación.** Barra lateral con icono y etiqueta (se contrae), migas de pan en detalles, paleta de comandos con Ctrl+K, acción principal siempre visible y «siguiente paso» sugerido (de una conversación a cotizar en un clic). En móvil, barra inferior.
- **Pantalla de ingreso:** composición dividida; héroe con degradado de mar y atardecer, olas y un elemento de viaje animado (avión o lancha) y la promesa «Convierte conversaciones en viajes reales»; formulario con entrada animada y foco expresivo.
- **Marca por agencia:** cada agencia tendrá su propio logo y color de acento (tareas del backlog sobre «marca de la agencia»). Por eso el color de acento va siempre en variables CSS y nunca fijo en los componentes; los activos gráficos de una agencia se cargan desde su configuración y **jamás se copian al repositorio**.
- **Prueba de aceptación visual:** abre la pantalla y pregúntate si parece el CRM de una agencia de viajes o el panel de cualquier empresa. Si parece lo segundo, no está terminada.

## Formatos (es-CO, siempre vía helpers, nunca a mano)
- Dinero: `$1.250.000` (COP sin decimales, punto de miles). Se guarda en enteros en la unidad mínima (R8); se formatea solo al pintar.
- Fechas: «sáb 3 oct 2026», hora en la zona de la agencia (R9: se guarda UTC).
- Teléfonos: `+57 302 423 2965`. Porcentajes y cupos con números, no con barras ambiguas.

## Estados que toda pantalla debe tener
Cargando (**esqueleto**, no spinner), vacío (con una acción que lleve a resolverlo), error (qué pasó y qué hacer, con «Reintentar»), sin permiso (explica quién puede). Y un estado **«sin catálogo todavía»** que guíe a cargarlo: el CRM debe servir a una agencia que empieza de cero.

## Lo que NO puede pasar
- **Datos inventados visibles como si fueran reales** (Cancún, Europa, clientes ficticios). El modo demostración existe pero es explícito, etiquetado y desactivable; el comportamiento normal es el de la API real.
- **Catálogo escrito a mano en el código.** Todo producto, precio, temporada o campo viene de la API de la agencia (R12). Si falta un campo, se pide, no se inventa.
- Hacer que el asesor salga de la conversación para cotizar.
- Colores como único portador de significado (SLA vencido = color **y** icono **y** texto).

## Móvil y teclado
- Funciona a **375 px**: una columna, acciones frecuentes al alcance del pulgar, tarjetas en vez de tablas anchas (o tabla con scroll y primera columna fija).
- Objetivos táctiles ≥ 44 px. Foco visible y recorrido por teclado en toda la bandeja; atajos para el asesor experto.
- Contraste AA; `aria-label` en botones solo-icono; los modales atrapan y devuelven el foco.

## Antes de entregar una pantalla (checklist ejecutable)
1. `pnpm compuertas` en verde (build, lint, typecheck, test, formato).
2. Abre la pantalla en el navegador a **375 px y a 1280 px** (MCP `playwright` si lo tienes) y revisa los cuatro estados.
3. Cuenta los clics de la acción principal: tres o menos.
4. Busca texto en inglés, números sin formato y colores fuera de los tokens.
5. Declara en `traspaso/ENTREGA.md` qué no pudiste verificar en navegador.

## Flujo con Google Stitch (obligatorio en pantallas nuevas o rediseñadas)
Antigravity tiene Stitch: úsalo **antes** de escribir el componente, no después.
1. Proyecto ya creado: **«ViajaPro — CRM para agencias de turismo»**, id `8333038101997719867`. Reutilízalo; no abras otro.
2. Escribe el flujo y la jerarquía en texto (qué ve el asesor primero, qué acción es la principal).
3. `generate_screen_from_text` en ese proyecto, con la paleta y tipografía de `docs/01-producto/09-especificacion-visual.json`. Explora 2–3 direcciones. Las generaciones tardan: lanza y vuelve a consultar con `list_screens`/`get_screen`.
4. Critica la imagen contra esta skill (¿se ve de turismo? ¿precio, promo, cupos y cargos en destino bien resueltos? ¿375 px?).
5. Extrae el contexto de diseño y **reconcilia con nuestros tokens y componentes**: Stitch sugiere, no decide; los tokens del proyecto mandan.
6. Implementa con los componentes existentes y shadcn/ui, y deja en `traspaso/ENTREGA.md` el id de la pantalla de Stitch que usaste como referencia.

Encargo de partida para la primera pantalla (catálogo de excursiones): cuadrícula de tarjetas con foto caribeña, nombre, duración «1 día», horario de salida, «Desde $450.000 por persona» con precio de lista tachado y etiqueta de promo vigente, chips de lo que incluye, aviso «Impuesto de muelle no incluido», próximas salidas con cupos, estado vacío «Aún no tienes excursiones. Importa tu catálogo o crea la primera», y botones «Importar desde Excel» y «Nueva excursión».
