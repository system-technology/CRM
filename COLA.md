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

## [ ] 0b. El diseño — todo esto va antes que cualquier funcionalidad nueva

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

## [ ] 0c. El panel del contacto y el pipeline — ya tienes los contratos

**Reparto de trabajo, decidido por el propietario el 2026-10-10: tú haces el frontend, yo hago
el backend.** Los contratos son la costura y los pongo yo. Acaban de llegar a esta rama en
`packages/contracts/src/crm.ts`. Constrúyelo contra ellos con datos simulados; cuando la API
exista, cambias el origen y no la pantalla.

Y la referencia ya no es solo el PNG de la bandeja: está
**`docs/01-producto/09-especificacion-visual.json`**, que el propietario entregó con la
especificación completa —ocho pantallas, reglas de interacción, estados y lista de validación—
junto a `docs/_assets/diseno/04-producto-completo.png`. Es la fuente de verdad del aspecto y del
alcance. Léela antes de decidir nada por tu cuenta.

**El acento ya es azul.** Decidido y medido: `#2563eb` da 5.17 de contraste sobre blanco y el
700 da 6.70, con AA en 4.5. El 500 se queda en 3.68, así que **no lo uses para texto**. Está en
`globals.css` con los números escritos al lado.

**0c.1 — El panel lateral de la bandeja**, con `FichaDeContacto`. Es una sola petición a
propósito: contacto, oportunidad viva, cotizaciones y notas internas vienen juntos porque tres
llamadas encadenadas se notan al abrir una conversación. Las cotizaciones llegan **sin tarifa
neta** —`CotizacionResumen` no la tiene— porque este panel se mira delante del cliente.

**0c.2 — Las tarjetas de cotización en el hilo.** `Mensaje` ya trae `cotizacionId`. Para Meta
eso es un PDF normal; lo que lo convierte en tarjeta es que nuestro registro recuerda cuál era.
Cuando venga con `cotizacionId`, píntalo como propuesta: título, precio, vigencia y un botón.

**0c.3 — La pantalla de pipeline** (`/pipeline`), con `TableroPipeline` y `Oportunidad`. Cinco
columnas, tarjetas con contacto, destino, valor estimado, tiempo desde el último contacto,
próxima tarea y asesor.

Tres cosas de esa pantalla que no son opcionales:

- **El total de la columna viene del servidor y no se suma en el navegador.** Una columna con 40
  oportunidades muestra las primeras; sumar las visibles daría una cifra que encoge al paginar,
  que es peor que no darla.
- **Arrastrar necesita alternativa por teclado.** Un tablero que solo funciona con ratón deja
  fuera a quien no puede usarlo, y además es más lento para quien sí.
- **Soltar una tarjeta en «Perdida» abre un diálogo que exige motivo.** No es una validación de
  formulario: está en el contrato (`MoverOportunidad`), así que la API lo rechaza igual. Y
  «Otro» pide explicación. Sin eso el embudo dice cuántas se pierden y nunca por qué.

---
