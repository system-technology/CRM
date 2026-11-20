# Lo que viene después — NO trabajes de aquí

> **Este archivo no es tu cola.** Tu cola es `COLA.md` y hoy tiene **una sola tarea**.
>
> Esto es el histórico y lo que viene después, para que sepas hacia dónde va la cosa. Cuando la
> tarea de `COLA.md` esté aceptada en `REVISION.md`, yo muevo aquí la siguiente. Tú no la cojas.

## [x] 0c. El panel del contacto y el pipeline — **construido; la auditoría final está en `COLA.md` 0c.21**

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

---

## [x] 1. La pantalla de conversación, terminada

Sigue contra datos simulados. La API real no existe todavía y no la necesitas.

**Los tres estados que le faltan.** La lista los tiene y la conversación no:

- **Cargando:** esqueleto con la forma de las burbujas, no un girador.
- **Vacío:** una conversación sin mensajes. Pasa de verdad — un contacto que abre el chat y no
  llega a escribir.
- **Error:** no se pudo cargar el historial, con botón de reintento.

**El envío, con su comportamiento real:**

- **Actualización optimista:** el mensaje aparece en el hilo al pulsar Enviar, con estado
  `PENDIENTE`, y luego pasa a `ENVIADO`. Esperar al servidor para pintarlo hace que la interfaz
  se sienta rota aunque funcione.
- **La clave de idempotencia se genera UNA vez por intento, no por reintento.** Si el envío falla
  y el asesor reintenta, va **la misma** clave: eso es lo único que impide que el viajero reciba
  el mensaje dos veces (R5). Generar una nueva en cada reintento hace que la idempotencia no
  exista y que el contrato mienta.
- **Fallo visible y recuperable:** si falla, el mensaje se queda en el hilo marcado en rojo con
  su motivo y un botón de reintentar. No desaparece — un mensaje que se esfuma deja al asesor sin
  saber si llegó.

**La misma accesibilidad que pusiste en la lista**, aplicada al hilo.

**Criterio que debe poder comprobarse sin leer el código:** un reintento tras un fallo reutiliza
la clave anterior.

---

## [x] 2. Tiempo real en la bandeja

El contrato `EventoBandeja` ya existe en `@viajapro/contracts`. Todavía no hay servidor que lo
emita, así que **móntalo contra un emisor simulado** que puedas disparar a mano desde la propia
interfaz (un botón de depuración sirve) o con un temporizador.

Los tres eventos: `MENSAJE_NUEVO`, `MENSAJE_ACTUALIZADO` y `CONVERSACION_ACTUALIZADA`.

**Lo que importa de verdad, y es de producto, no de interfaz:**

- **Un evento desconocido se ignora en silencio.** El contrato lo dice y hoy se incumpliría:
  `.parse()` de Zod **lanza**. Usa `safeParse` y descarta. El servidor publicará tipos nuevos
  antes de que la web sepa pintarlos, y romperse por eso sería absurdo.
- **Un mensaje nuevo en la conversación abierta no debe robar el desplazamiento** si el asesor
  está leyendo más arriba. Si está al final, sigue al final; si no, un aviso de «hay mensajes
  nuevos» que no le mueva la vista.
- **La fila de la lista se reordena**, pero no mientras el ratón está encima: reordenar bajo el
  cursor hace que el asesor abra una conversación que no quería.

---

## [x] 3. Conectar con la API real, detrás de un interruptor

Para cuando el backend exista. **Haz primero la parte que no depende de él.**

- Un cliente de API en `apps/web/src/lib/` que hable con los mismos contratos, **validando la
  respuesta** con el esquema —no solo la petición—, como ya hace `api.ts` para el cotizador.
  Mira ese archivo: es el patrón de la casa.
- Un interruptor por variable de entorno que elija entre el cliente simulado y el real, para que
  la pantalla no cambie cuando llegue el backend.
- Estados de error del contrato: `VENTANA_CERRADA` cuando se intenta escribir fuera de las 24 h
  debe mostrar algo útil, no un error genérico.

**No inventes endpoints.** Si necesitas una ruta que no está en los contratos, **para y dilo**.

---

## [x] 4. El vacío y el error de la lista, con datos de verdad

Hoy existen pero no se han visto con casos reales. Comprueba y arregla:

- Buscar algo que no existe entre 500 conversaciones.
- Filtro `SLA_VENCIDO` cuando ninguna lo está.
- Un contacto sin nombre **y** sin etiquetas y sin último mensaje: la fila más pobre posible.
- Un texto de último mensaje de 4.000 caracteres sin espacios — que no rompa la fila.
- Un nombre de contacto muy largo en 390 px.

Son los casos que nadie prueba y que un asesor encuentra el primer día.

---

## [x] 5. Pruebas automáticas de la bandeja — la deuda más cara que tenemos

Hoy **`apps/web` no tiene una sola prueba**. Todo lo construido se ha verificado mirándolo, y la
tarea 0 es exactamente lo que pasa cuando eso es todo lo que hay: cuatro compuertas en verde
sobre una funcionalidad muerta.

Monta Vitest con Testing Library en `apps/web` —mismo estilo que `apps/api`, `*.spec.ts`
co-localizados— y cubre **el comportamiento, no la pintura**:

| Qué | Por qué esa y no otra |
|---|---|
| Un `MENSAJE_NUEVO` llega al suscriptor | Es la 0.1. Sin ella el defecto vuelve |
| Dos eventos con el ratón encima: sobreviven los dos | Es la 0.2 |
| Reintentar un envío fallido **reutiliza** la clave de idempotencia | R5. Es la regla que impide cobrar o avisar dos veces |
| Un `EventoBandeja` de tipo desconocido se ignora sin romper nada | El contrato lo promete |
| Con el scroll arriba, un mensaje nuevo **no** roba la posición | Regla de producto |
| La ventana de 24 h cerrada deshabilita el envío libre | Regla de Meta, no estética |

**No busques cobertura.** Seis pruebas que muerden valen más que sesenta que acompañan. Para cada
una, rompe a propósito el código que protege y comprueba que se pone roja: si no se pone, la
prueba no existe. Cuéntalo en `ENTREGA.md`.

---

## [x] 6. La ventana de 24 horas, de verdad — **casi hecha; lo que falta está en `COLA.md` 0c.19**

Hoy el estado `24h Cerrada` es una etiqueta. Tiene que ser una restricción.

Meta no deja escribir texto libre pasadas 24 horas desde el último mensaje **del viajero**: solo
plantillas aprobadas. Un asesor que escribe y ve «enviado» cuando Meta lo rechazó es peor que uno
que no puede escribir.

- Con la ventana cerrada, el campo de texto se deshabilita y aparece un selector de plantillas.
- Decir **cuánto falta** para que se cierre cuando quedan menos de 2 horas: es la información por
  la que un asesor decide escribir ahora o después.
- Si la ventana se cierra **mientras** hay un borrador escrito, no se pierde: se avisa y se
  ofrece convertirlo en plantilla.
- Las plantillas salen de `@viajapro/contracts`. Si el contrato no las tiene, **para y dilo** en
  `ENTREGA.md`: lo añado yo. No inventes la forma.

---

## [x] 7. La ficha del viajero junto al hilo

Un asesor de agencia no vende mirando solo el chat. Necesita, sin salir de la conversación: quién
es, qué le cotizaron, qué tiene reservado.

Panel lateral plegable en `/bandeja/[id]` con nombre, teléfono, etiquetas, y los archivos de viaje
asociados —**`TravelFile`**, el término del lenguaje ubicuo, no `Booking` ni `Order`—. En móvil no
es un panel: es una pestaña.

Contra datos simulados mientras el módulo `crm` no exista. Mismo trato que arriba: si falta el
contrato, lo pides, no lo inventas.

---

## Reserva

Si todo lo de arriba está marcado:

- [x] **Densidad configurable:** un conmutador compacta/cómoda que cambie el alto de fila. Un asesor
  con pantalla pequeña y otro con monitor grande no quieren lo mismo.
- [x] **Atajos de teclado del hilo:** responder con `r`, cerrar conversación con `c`, buscar con `/`.
  Con una ayuda visible, porque un atajo que nadie conoce no existe.
- [x] **Modo oscuro**, usando los tokens que ya están en `globals.css`. Un asesor que atiende de
  noche lo agradece, y la densidad alta en blanco cansa.
