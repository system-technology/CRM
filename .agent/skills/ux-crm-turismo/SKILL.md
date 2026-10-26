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
   - Promo: precio vigente destacado y precio de lista tachado **solo mientras la promo esté vigente**; muestra «hasta el 30 oct».
   - Cargos que se pagan en destino (impuesto de muelle, tasa portuaria) van aparte, con etiqueta «No incluido», y **nunca se suman al total**.
   - Sin precio publicado: «Consultar», nunca `$0`.
3. **Fechas y cupos a la vista.** Salidas como chips o calendario («sáb 3 oct»), con cupos («quedan 4») y estados: disponible, últimos cupos, agotado, cerrado. Una salida agotada se ve distinta, no desaparece.
4. **Composición del grupo en lenguaje de viaje:** adultos, niños (2–11), infantes. Avisos útiles en el momento: «1 plaza sin usar, se paga igual».
5. **Estado de la venta como recorrido**, no como etiqueta suelta: consulta → cotización → negociación → ganada (archivo de viaje). Un asesor debe ver en qué punto está cada cliente y qué sigue.
6. **WhatsApp es el centro.** Desde cualquier oportunidad o cotización se llega a la conversación en un clic, y desde la conversación se cotiza sin salir. Muestra la ventana de 24 h y el SLA cuando corren.
7. **Tono cálido y profesional, en español de Colombia.** Textos cortos y concretos («Aún no tienes excursiones. Carga tu catálogo o crea la primera»). Nada de jerga técnica ni de «algo salió mal».

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
