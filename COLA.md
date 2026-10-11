# Cola de trabajo — Antigravity

> ## Hay UNA tarea. Es la de abajo. No hay otra.
>
> Esta cola tenía siete y la de abajo se saltó tres veces seguidas: entre medias llegaron
> densidad, casos límite, atajos de teclado, modo oscuro, pruebas y la ficha del viajero. No te
> lo reprocho — te lo estaba pidiendo mal, con siete tareas marcadas y una nota diciendo cuál.
> Ahora solo hay una.
>
> El resto está en `COLA-DESPUES.md`. **No trabajes de ahí.** Cuando ésta esté aceptada en
> `REVISION.md`, muevo yo la siguiente aquí.

**Siempre:** solo tocas `apps/web/`. Nunca escribes en `main`. No tocas `ESTADO.md`. Cero tipos
redefinidos: todo de `@viajapro/contracts` — si falta un campo, **para y dilo**, como hiciste con
las plantillas, que estuvo bien. `lint`, `typecheck`, `test`, `build` y `format:check` en verde
**ejecutados**, no supuestos, antes de escribir `ENTREGA.md`. Y funciona a 375 px.

**La referencia del aspecto** es `docs/01-producto/09-especificacion-visual.json` y
`docs/_assets/diseno/04-producto-completo.png`. La corrección detallada está en
`DISENO-BANDEJA.md`. El acento ya es azul en `globals.css`; el tono 500 no vale para texto.

---

## [ ] 0d. La ficha del viajero, atada a SU conversación

Lo demás del rediseño pasó — está en `REVISION.md`. Esto no.

Abrí tres conversaciones seguidas —Juan Pérez, Ana Martínez, Sonia López— y la ficha de la
derecha mostró las tres veces el mismo teléfono: `+573001234567`, el de Sofía Gómez. La cabecera
dice un nombre y treinta centímetros a la derecha hay otra persona, con otras etiquetas y una
oportunidad de 12.500.000 COP que no es suya.

**No es un detalle de datos simulados.** Un asesor cotiza Cancún para quien preguntó por San
Andrés. Y con datos reales sería el expediente de un viajero dentro de la conversación de otro.

**Qué hacer:** que el componente reciba el contacto de la conversación abierta en vez de una
constante. `FichaDeContacto` ya está en `@viajapro/contracts`, y el simulador debe devolver la
ficha **del id que se le pide**.

**Criterio de aceptación:** una prueba que abra dos conversaciones distintas y afirme que el
teléfono de la ficha es **distinto**. Con el código de hoy tiene que salir **en rojo**; si sale
verde, la prueba no sirve. Cuéntalo en `ENTREGA.md`: roja antes, verde después.

Cuando esté, rehaz las pruebas de la tarea 5 que te devolví — ahora que la pantalla está partida
en piezas ya hay funciones que importar, que era la mitad del problema.

---

## [x] 0b. El diseño — todo esto va antes que cualquier funcionalidad nueva

El propietario abrió la aplicación y dijo que la experiencia de usuario está por el suelo. Tiene
razón, y la causa fue mía: esta cola nunca mencionó el diseño acordado. El `diseno-ux` auditó la
bandeja contra `docs/_assets/diseno/01-bandeja.png` y dejó la corrección completa en
**`DISENO-BANDEJA.md`**, en esta misma rama. Léelo entero antes de empezar; aquí va el orden y lo
que no puedes saltarte.

**0b.1 — Sacar el instrumental de desarrollo de la pantalla.** Una hora, y es lo que más cambia.
Hoy un asesor de agencia lee «Mock Simulador», «Guard R5/UI», «Simular fallo de envío (Prueba
R5)» y «v0.1.0». Eso no es una pantalla de producto, es un banco de pruebas. Detrás de un
`process.env.NODE_ENV !== 'production'`, o fuera.

Y en `[id]/page.tsx:730`, la selección de plantillas —**la acción más cara del producto**, la
única forma de reabrir una conversación fuera de la ventana de 24 h— es un `alert()` del
navegador. Eso no se queda así ni un día más.

**0b.2 — El armazón de tres columnas.** Medio día, y va **antes** que lo demás: hoy cada página
es una pantalla completa con su propio `h-screen`, su cabecera y su scroll, y construir la ficha
del cliente dentro de esos cascarones es construirla para tirarla. Un `app/bandeja/layout.tsx`
con la rejilla; la lista vive en el layout, el hilo en `[id]/page.tsx`. Abrir una conversación
deja de ser navegar a otra página y perder la lista.

Condición para que lo demás llegue por partes sin rehacer nada: **las piezas nuevas reciben props
y no son dueñas ni de su layout ni de su scroll.**

**0b.3 a 0b.9 — El resto, en el orden del documento** y repartibles una vez puesto el armazón:
barra lateral de módulos con la meta de cierres · ficha del cliente a la derecha · iconos en vez
de emoji · cabecera con cuenta atrás de 24 h, SLA y «Nueva cotización» · tarjetas de cotización
en el hilo · acciones de cierre · móvil a 375 px, que incluye un defecto real de accesibilidad:
los chips miden unos 24 px de alto y el mínimo táctil son 44.

**Tres cosas del diseño que NO se construyen**, y el documento explica cada una: la cotización
como tipo de mensaje —`TipoContenido` solo admite lo que Meta entrega; hace falta un cambio de
contrato que pido yo—, «Detalles del viaje» como campos de `inbox` —pertenece a `crm`, se maqueta
simulado—, y el selector que duplica `FiltroBandeja`, donde gana el contrato.

**Sobre `packages/ui`, que hoy solo tiene un README:** hay 1 678 líneas de Tailwind en línea entre
dos archivos, el mismo badge escrito seis veces, y dos contadores de 24 h distintos cuyas reglas
de color no coinciden —la lista avisa a los 60 minutos y el hilo no avisa—. Extrae los tres
primitivos que propone el documento según los necesites. Moverlos a `packages/ui` después es
cambiar una ruta de importación.

---
