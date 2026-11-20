# Corrección de diseño — Bandeja

Comparación entre `docs/_assets/diseno/01-bandeja.png` (el diseño acordado) y lo construido en
`apps/web/src/app/bandeja/`. Ordenado por **cuánto cambia la percepción del producto por unidad de
trabajo**. Cada tarea es ejecutable sin volver a preguntar.

Dos restricciones que no se negocian:

- Los tokens y la tipografía ya están en `apps/web/src/app/globals.css`. Si Stitch propone otro
  azul, otro radio u otra escala, gana el nuestro. No se añaden colores nuevos a `@theme`.
- El código de Stitch es referencia visual. Se construye con Tailwind + shadcn/ui. No se pega HTML.

---

## Respuesta a la pregunta: ¿el armazón de tres columnas va primero?

**Sí, va primero — y por eso esto son dos días y no dos semanas.**

El armazón es barato (medio día) porque en Next.js es un archivo: `app/bandeja/layout.tsx` con la
rejilla, y `[id]/page.tsx` renderizando solo la columna central y la derecha dentro de ese layout.
Lo caro no es montarlo: es **no** montarlo. Hoy `page.tsx` y `[id]/page.tsx` son dos pantallas
completas de 707 y 971 líneas, cada una con su propio `h-screen`, su propio `<header>`, su propio
contenedor de scroll y su propio `max-w-*` centrado. Todo eso es chrome que el armazón borra. Si se
construye primero el panel del cliente o las tarjetas de cotización, se construyen dentro de dos
cascarones que van a desaparecer, y se pagan dos veces el scroll, el foco y los breakpoints.

**Con el armazón puesto, todo lo demás llega por partes sin rehacer nada**, con una condición:
las piezas nuevas se escriben como componentes presentacionales que reciben props y **no son dueñas
de su layout ni de su scroll** (`FichaCliente`, `TarjetaCotizacion`, `ListaConversaciones`,
`HiloMensajes`). El contenedor decide ancho y scroll; la pieza solo pinta. Cumplido eso, las tareas
3 a 9 son independientes entre sí y se pueden repartir.

Orden recomendado: **1 → 2 → (3, 4, 5 en paralelo) → 6 → 7 → 8 → 9**.

---

## 1. Sacar el instrumental de desarrollo de la pantalla (1 hora, el mayor retorno de la lista)

Media hora de trabajo y es, con diferencia, lo que más explica el veredicto del propietario: hoy
la pantalla **se ve como un banco de pruebas, no como un producto**. Un asesor que abre esto lee
literalmente «Mock Simulador», «Guard R5/UI» y «Prueba R5»: cosas que no significan nada para él y
que le dicen que el software no está terminado.

En `apps/web/src/app/bandeja/page.tsx`:

- Quitar el subtítulo `Monitoreo multi-tenant · Modos: ⚡ Mock Simulador · 390px` (línea ~317).
- Quitar `ViajaPro WhatsApp Inbox v0.1.0` del pie (línea ~560).
- El banner de reorden diferido (línea ~431) dice «Reordenamiento en pausa … (Guard R5/UI)». El
  comportamiento es correcto y se queda; el texto se reescribe en el idioma del asesor:
  **«3 conversaciones nuevas · Actualizar»**, discreto, sin `animate-ping`.
- `<SimuladorTiempoReal>` (línea ~539) se monta solo bajo
  `process.env.NEXT_PUBLIC_VIAJAPRO_DEMO === '1'`, nunca por defecto.

En `apps/web/src/app/bandeja/[id]/page.tsx`:

- Quitar la casilla «Simular fallo de envío (Prueba R5)» del redactor (línea ~765). La prueba de
  reintento optimista se cubre en el test, no en la interfaz del asesor.
- `alert('Selección de plantillas HSM aprobadas por Meta.')` (línea ~730) es un `alert()` del
  navegador en la acción **más cara del producto**: la única forma de reabrir una conversación
  fuera de la ventana de 24 h. Sustituir por un `Dialog` de shadcn/ui con la lista de plantillas
  (puede ser estática en esta iteración), o deshabilitar el botón con tooltip «Próximamente» —
  cualquiera de las dos, pero no un `alert`.
- El interruptor de modo oscuro ocupa hoy el lugar más prominente de la cabecera en **las dos**
  pantallas. Es la decisión menos importante que toma un asesor en todo el día. Se mueve al menú
  del usuario, abajo en la barra lateral (tarea 3). El modo oscuro se conserva.

## 2. El armazón de tres columnas (medio día)

Hoy, abrir una conversación es **navegar a otra página**: se pierde la lista, se pierde el
contexto, y volver a la bandeja cuesta un clic en «← Volver» más recargar. Un asesor con 6 a 15
conversaciones abiertas salta entre ellas cada pocos minutos: ese salto tiene que costar **un clic
y cero recargas**. Esta es la diferencia entre una herramienta de trabajo y un visor de mensajes.

Crear `apps/web/src/app/bandeja/layout.tsx`:

```
grid grid-cols-[56px_320px_1fr] xl:grid-cols-[56px_340px_1fr_340px] h-dvh overflow-hidden
```

- Columna 1: barra de módulos (tarea 3).
- Columna 2: `ListaConversaciones` — extraída de `page.tsx`. **Vive en el layout**, no en la
  página: así no se desmonta al abrir una conversación y conserva su scroll y su estado de filtro.
- Columna 3: `{children}` — el hilo.
- Columna 4 (≥1280 px): `FichaCliente` (tarea 4).

Refactor que habilita lo anterior, sin cambiar comportamiento:

- `apps/web/src/app/bandeja/page.tsx` queda como el **estado vacío de la columna central**: «Elige
  una conversación para empezar» más los tres atajos de teclado. Toda la lógica de lista (carga por
  cursor, filtros, búsqueda, tiempo real, teclado) se mueve tal cual a
  `apps/web/src/components/bandeja/lista-conversaciones.tsx`.
- `apps/web/src/app/bandeja/[id]/page.tsx` pierde su `h-screen`, su `max-w-4xl` centrado, su
  `<header>` de página y el enlace «← Volver»; conserva la cabecera de la conversación (tarea 6) y
  el redactor. El historial (`<main role="log">`) pasa a ser el único contenedor con scroll propio.
- Cada columna scrollea por separado: `min-h-0 overflow-y-auto` en cada una. Sin esto la rejilla
  se desborda y vuelve el scroll de página entera.
- Las dos páginas quedan por debajo de 300 líneas. No es higiene: un archivo de 971 líneas es la
  razón por la que nadie ha podido ajustar esta pantalla.

## 3. Barra lateral de módulos con la meta del asesor (2 horas)

El diseño trae una columna izquierda estrecha: logo, «Bandeja general», selector de agencia, los
módulos (Conversaciones, Clientes, Oportunidades, Cotizaciones, Reservas, Reportes, Equipo) y,
abajo, el bloque **«Meta de cierres»** con ventas confirmadas, progreso y porcentaje.

Importa por dos razones distintas, ambas de negocio:

- Sin ella, la bandeja **es** el producto: no se ve que exista un CRM alrededor. El propietario
  abrió la app y vio una sola pantalla porque no hay nada que insinúe las demás.
- La meta visible es la única parte de la interfaz que le habla al jefe del asesor — el que quiere
  números a fin de mes. Es información que **mueve conducta**: un asesor que ve 42 % el día 20 del
  mes prioriza distinto.

Archivo nuevo: `apps/web/src/components/bandeja/barra-modulos.tsx`. Iconos de `lucide-react` (ya
es dependencia transitiva de shadcn/ui), 56 px de ancho con tooltip, expandible a 200 px. Los
módulos que aún no existen van deshabilitados con tooltip «Próximamente», no ocultos: el asesor
tiene que ver hacia dónde va el producto. Abajo: avatar del asesor, nombre, estado «Activa» y el
menú con el interruptor de tema que sacamos en la tarea 1.

La meta se pinta con datos simulados en esta iteración (`apps/web/src/lib/mock-inbox.ts`), con un
`TODO` claro apuntando al contexto `analytics`. Es honesto y es media hora.

## 4. Panel derecho: ficha del cliente (medio día)

Es el agujero más grande respecto al diseño y el que más minutos le cuesta al asesor. Hoy, para
saber a dónde quiere viajar un cliente, cuántos pasajeros son o qué se le cotizó, **hay que leer el
hilo entero hacia arriba**. Con 15 conversaciones abiertas eso es la diferencia entre responder en
dos minutos o en veinte, y veinte minutos es una venta perdida.

Archivo nuevo: `apps/web/src/components/bandeja/ficha-cliente.tsx`. Secciones, en este orden:

1. **Identidad** — nombre, teléfono con `.cifra`, etiquetas, estado, asesor asignado y badge de
   ventana 24 h. Todo esto ya viene en `ConversacionResumen`; es pintarlo.
2. **Detalles del viaje** — destino, fechas, viajeros, presupuesto. *Esto no está en el contrato*
   (ver nota al final). Simulado en esta iteración, con el componente ya listo para recibirlo.
3. **Cotizaciones** — lista compacta: código, destino, monto, estado. Enlaza a `/cotizador`.
4. **Notas internas** — `ConversacionDetalle.notas` ya existe y hoy no se muestra en ningún panel.
   Fondo ámbar, igual que el modo nota del redactor: nunca debe confundirse con un mensaje al
   cliente.
5. **Registro de actividad** — derivable hoy de `detalle.mensajes` (primer contacto, último
   mensaje, cambios de asignación).

Por debajo de 1280 px el panel no se pinta en la rejilla: se abre con un `Sheet` de shadcn/ui desde
un botón en la cabecera de la conversación. En móvil es la tercera vista del diseño.

## 5. Iconos reales y avatares con iniciales (2 horas)

Dos cambios pequeños con efecto desproporcionado sobre la percepción de acabado:

- **Fuera los emoji como iconografía.** Hoy hay 💬 como logotipo, 🔍 en la búsqueda, ⚡ y 📖 en la
  densidad, 📥 en el estado vacío, ⚠️, 📌, ⬇️, ☀️/🌙. Los emoji se renderizan distinto en cada
  sistema operativo, no heredan el color del texto y gritan «prototipo». Sustituir por
  `lucide-react` (`MessageSquare`, `Search`, `Rows3`, `Inbox`, `AlertTriangle`, `StickyNote`,
  `ArrowDown`, `Sun`, `Moon`), tamaño 14-16 px, `currentColor`.
- **Avatar con iniciales por conversación**, como en el diseño: círculo de 32 px, iniciales,
  color derivado de forma determinista del `contactoId`. No es decoración: es el ancla visual que
  permite reencontrar una conversación recorriendo la lista sin leer los nombres. Afecta a
  `lista-conversaciones.tsx` y a la cabecera del hilo.

## 6. Cabecera de la conversación: la acción principal, visible (3 horas)

Pregunta de control: *¿cuál es la acción principal de esta pantalla y es la más prominente?* Hoy la
respuesta es «alternar el tema». La acción principal del asesor en una agencia de viajes es
**cotizar**: es la que genera dinero, y no existe en la interfaz.

En la cabecera de `[id]/page.tsx`, de izquierda a derecha, igual que el diseño:

- Avatar, nombre, teléfono, asesor asignado.
- **Cuenta atrás de la ventana de 24 h**, no un badge estático: `Ventana de respuesta · 6 h 12 min`,
  recalculado cada minuto (`setInterval` de 60 s, no por mensaje). Ámbar por debajo de 2 h, rojo
  cuando está cerrada. Cuesta dinero: si se cierra, reabrir exige una plantilla de pago.
- SLA de primera respuesta junto a ella, con el mismo criterio de color que ya usa la lista.
- `Transferir` (secundario) y **`Nueva cotización`** como único botón sólido de acento de la
  pantalla. Un solo botón primario visible a la vez; todo lo demás es contorno o fantasma.

## 7. Tarjetas de cotización dentro del hilo (medio día)

En el diseño, la propuesta enviada aparece **en el hilo** como tarjeta: código, destino, fechas,
noches, desglose de qué incluye, precio total en grande con `.cifra`, y «Ver propuesta». Es el
mensaje más importante de toda la conversación y hoy, si se envía, se vería como un renglón de
texto o un adjunto genérico.

- Archivo nuevo: `apps/web/src/components/bandeja/tarjeta-cotizacion.tsx`.
- Se engancha en `RenderMensajeContenido` (`[id]/page.tsx`, línea ~908).
- Precio con la clase `.cifra` de `globals.css`. Sin cifras tabulares, comparar dos cotizaciones de
  un vistazo deja de ser posible — y eso es lo que hace un asesor todo el día.
- Ancho máximo 420 px: es una tarjeta dentro de una columna, no un panel.

## 8. Acciones de cierre al pie de la ficha (1 hora)

El diseño cierra la columna derecha con **`Crear cotización`** (sólido) y **`Ver archivo completo`**
(contorno). Son el puente entre conversar y vender; sin ellas la bandeja es un chat caro.
`Ver archivo completo` apunta a `/archivos/[id]` — que aún no existe: se deja deshabilitado con
tooltip, no se oculta. En `ficha-cliente.tsx`, fijas al pie con `sticky bottom-0` y fondo sólido.

## 9. Móvil a 375 px (3 horas)

El asesor trabaja con el teléfono en una mano; si algo exige un ratón preciso, no lo hará. Las tres
columnas se vuelven tres vistas, y el hilo es la vista por defecto al abrir una conversación
(`docs/01-producto/06-diseno-y-ux.md` §3).

- `< 768 px`: una sola columna. `/bandeja` = lista; `/bandeja/[id]` = hilo con flecha de volver;
  la ficha es un `Sheet` a pantalla completa.
- La barra de módulos pasa a una barra inferior de 5 iconos.
- Objetivos táctiles de 44 px como mínimo. Hoy los chips de filtro y los botones de densidad
  quedan por debajo: `px-2.5 py-1` con texto de 11 px da unos 24 px de alto. Es el defecto de
  accesibilidad más frecuente de la pantalla.
- Verificar con la rejilla lateral: una fila de conversación con nombre de 60 caracteres, tres
  etiquetas y badge de SLA no debe romper el alto de fila. Hoy `flex-wrap` la hace crecer a tres
  líneas y la lista pierde la mitad de su densidad.

---

## Nota sobre deuda estructural: `packages/ui` está vacío

`packages/ui/` contiene solo `README.md`. No hay sistema de diseño: hay 1 678 líneas de Tailwind
en línea repartidas en dos archivos, con la misma clase de badge escrita cinco veces y ligeras
variaciones en cada una. Esa es la causa raíz de la inconsistencia visual, no un síntoma.

No hace falta resolverlo antes de las tareas 1 a 9, pero **las piezas nuevas de las tareas 3 a 8
se escriben ya como componentes aislados** en `apps/web/src/components/bandeja/`, con los tres
primitivos que se repiten extraídos desde el principio:

- `Badge` con variantes `ok | aviso | alerta | neutro` (mapeadas a los tokens semánticos; hoy el
  mismo badge está escrito a mano en seis sitios).
- `ContadorVentana24h` — una sola implementación. Hoy hay dos, con reglas de color distintas entre
  la lista (60 min) y el hilo (ninguna).
- `FilaDenso` — contenedor de fila con las dos densidades ya soportadas.

Mover esos tres a `packages/ui` después es un cambio de ruta de importación.

## Lo que ya no tiene sentido construir por fidelidad

- **La tarjeta de cotización como tipo de mensaje de WhatsApp.** El diseño se dibujó antes de
  `@viajapro/contracts`: `TipoContenido` (`packages/contracts/src/inbox.ts` línea 43) solo admite
  los tipos que Meta entrega (texto, imagen, documento, ubicación, plantilla…). No existe ni puede
  existir un `COTIZACION`. La tarjeta se renderiza desde la **referencia a la cotización**, no desde
  el contenido del mensaje: hace falta añadir `cotizacionId` opcional a `Adjunto` o
  `Mensaje.metadatos`. Cambio de contrato, dueño `backend`, bloquea la tarea 7 en datos reales
  pero no en maqueta.
- **«Detalles del viaje» en la ficha** (destino, fechas, viajeros, presupuesto) no está en
  `ConversacionDetalle`. Pertenece al contexto `crm` (Oportunidad), no a `inbox`. Se construye
  con datos simulados y se conecta cuando exista el contrato; **no se añaden esos campos a
  `inbox.ts`**, sería mezclar contextos delimitados.
- **El selector «Bandeja general / Por asesor / Por SLA»** de la cabecera del diseño se solapa con
  los filtros que ya existen (`FiltroBandeja`: TODAS, MIAS, SIN_ASIGNAR, SIN_LEER, SLA_VENCIDO).
  Gana el contrato: un solo mecanismo de filtrado, el que ya está construido. No duplicar.
