# Cola de trabajo — Antigravity

> **Cómo funciona.** Al empezar una sesión: `git pull`, lee `REVISION.md` si existe, y toma de
> aquí **la primera tarea sin marcar**. Al terminarla, márcala `[x]`, escribe `ENTREGA.md` y
> empuja. Claude verifica, escribe la revisión y rellena esta cola.
>
> **Nunca te quedes sin tarea.** Si llegas al final y todo está marcado, dilo en `ENTREGA.md` y
> coge la primera de «Reserva» al final del archivo.
>
> Las tareas están ordenadas por valor, no por dificultad. Haz la de arriba.
>
> **Si una entrega tuya fue rechazada, su corrección entra aquí arriba y bloquea todo lo demás.**
> No se construye encima de algo que no funciona: lo que se apile sobre ello hay que rehacerlo.

**El diseño no es opcional y hasta ahora faltaba en esta cola — culpa mía.** Antes de dar por
lista cualquier pantalla, mira `docs/_assets/diseno/01-bandeja.png`, que es la bandeja acordada, y
pasa la lista de `docs/01-producto/06-diseno-y-ux.md` §6:

- [ ] La acción principal es la más prominente. *(En la bandeja es «Crear cotización»: una
      conversación que no se convierte en cotización no le sirve a la agencia.)*
- [ ] Clics hasta responder un mensaje: contados y ≤ 3.
- [ ] Funciona a 375 px.
- [ ] Navegable por teclado, con foco visible.
- [ ] Contraste AA, en claro y en oscuro.
- [ ] Los tres estados: vacío, cargando, error.
- [ ] Probada con volumen real: 500 conversaciones, nombres largos, cero resultados.
- [ ] El estado que cuesta dinero está visible sin abrir nada.
- [ ] Un asesor nuevo entiende qué hacer sin que nadie le explique.

Los tokens y la tipografía ya están en `globals.css`. Si Stitch propone otro azul, gana el nuestro.
El código que genera Stitch **no se copia**: es referencia visual.

**Siempre, en cada tarea:** solo tocas `apps/web/`. Nunca escribes en `main`. No tocas
`ESTADO.md`. Cero tipos redefinidos: todo de `@viajapro/contracts` — si falta un campo, **para y
dilo**, no lo inventes. `lint`, `typecheck`, `build` y `format:check` en verde antes de cada
commit. Y funciona a 390 px.

---

## [ ] 0. BLOQUEANTE — arreglar lo que se rechazó en `2cfe439`

**Esto va antes que todo lo demás y antes de cualquier funcionalidad nueva.** La entrega de
tiempo real no pasó la revisión y desde entonces se han construido cuatro cosas encima: densidad,
casos límite, atajos de teclado y modo oscuro. Todas descansan sobre una bandeja en la que **no
llega ni un solo evento**. Está escrito con detalle en `REVISION.md`; aquí va lo mínimo.

**0.1 — El emisor fabrica un UUID inválido y su propio `safeParse` lo tira.**
`apps/web/src/lib/realtime-mock.ts`, en `emitirMensajeNuevo`:

```ts
const id = '00000000-0000-4000-8000-' + Date.now().toString(16).slice(-12);
```

`Date.now().toString(16)` mide **11** caracteres y el último grupo de un UUID necesita **12**.
`slice` no rellena. Medido en el navegador: sufijo `1a1265c1536`, longitud 11. Cada
`MENSAJE_NUEVO` sale por la consola como «descartado en silencio».

Usa `crypto.randomUUID()`.

**0.2 — El búfer del guardián de ratón pisa en vez de acumular.**
`apps/web/src/app/bandeja/page.tsx`: `listaActualizada` se construye desde `prev`, y como con el
ratón encima se devuelve `prev` sin cambiarlo, el evento siguiente vuelve a partir de cero. Con
el ratón sobre la lista —la postura normal de un asesor— llegan dos mensajes de dos viajeros y
**solo sobrevive el segundo**. El primero desaparece: texto, contador y posición.

Deriva del búfer cuando existe: `const base = bufferConversacionesRef.current ?? prev;`

**0.3 — El contador cuenta el doble.** Tres clics mostraron «Hay 6 actualizaciones».
`setPendientesReorden` vive dentro del actualizador de `setConversaciones`, y React ejecuta los
actualizadores dos veces en desarrollo precisamente para delatar esto. Saca el efecto del
reductor.

**Criterio de aceptación, y es el que importa:** una prueba `*.spec.ts` junto a `realtime-mock.ts`
que emita un `MENSAJE_NUEVO` y **afirme que el suscriptor lo recibe**. Con el código de hoy tiene
que salir **en rojo**; si sale verde, la prueba no sirve y hay que rehacerla. Otra para 0.2: dos
eventos seguidos con el guardián activo, y el estado final contiene **los dos**.

Dilo en `ENTREGA.md`: la prueba en rojo antes, en verde después.

> La lección de todo esto no es tuya sola. `lint`, `typecheck`, `build` y `format:check` estaban
> los cuatro en verde sobre una funcionalidad que no hacía absolutamente nada. Compilar no es
> funcionar; lo único que los distingue es una aserción que se pone roja cuando el comportamiento
> desaparece.

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

## [ ] 5. Pruebas automáticas de la bandeja — la deuda más cara que tenemos

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

## [ ] 6. La ventana de 24 horas, de verdad

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

## [ ] 7. La ficha del viajero junto al hilo

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
- **Atajos de teclado del hilo:** responder con `r`, cerrar conversación con `c`, buscar con `/`.
  Con una ayuda visible, porque un atajo que nadie conoce no existe.
- [x] **Modo oscuro**, usando los tokens que ya están en `globals.css`. Un asesor que atiende de
  noche lo agradece, y la densidad alta en blanco cansa.
