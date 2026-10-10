# Cola de trabajo — Antigravity

> **Cómo funciona.** Al empezar una sesión: `git pull`, lee `REVISION.md` si existe, y toma de
> aquí **la primera tarea sin marcar**. Al terminarla, márcala `[x]`, escribe `ENTREGA.md` y
> empuja. Claude verifica, escribe la revisión y rellena esta cola.
>
> **Nunca te quedes sin tarea.** Si llegas al final y todo está marcado, dilo en `ENTREGA.md` y
> coge la primera de «Reserva» al final del archivo.
>
> Las tareas están ordenadas por valor, no por dificultad. Haz la de arriba.

**Siempre, en cada tarea:** solo tocas `apps/web/`. Nunca escribes en `main`. No tocas
`ESTADO.md`. Cero tipos redefinidos: todo de `@viajapro/contracts` — si falta un campo, **para y
dilo**, no lo inventes. `lint`, `typecheck`, `build` y `format:check` en verde antes de cada
commit. Y funciona a 390 px.

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

## [ ] 2. Tiempo real en la bandeja

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

## [ ] 3. Conectar con la API real, detrás de un interruptor

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

## [ ] 4. El vacío y el error de la lista, con datos de verdad

Hoy existen pero no se han visto con casos reales. Comprueba y arregla:

- Buscar algo que no existe entre 500 conversaciones.
- Filtro `SLA_VENCIDO` cuando ninguna lo está.
- Un contacto sin nombre **y** sin etiquetas y sin último mensaje: la fila más pobre posible.
- Un texto de último mensaje de 4.000 caracteres sin espacios — que no rompa la fila.
- Un nombre de contacto muy largo en 390 px.

Son los casos que nadie prueba y que un asesor encuentra el primer día.

---

## Reserva

Si todo lo de arriba está marcado:

- **Densidad configurable:** un conmutador compacta/cómoda que cambie el alto de fila. Un asesor
  con pantalla pequeña y otro con monitor grande no quieren lo mismo.
- **Atajos de teclado del hilo:** responder con `r`, cerrar conversación con `c`, buscar con `/`.
  Con una ayuda visible, porque un atajo que nadie conoce no existe.
- **Modo oscuro**, usando los tokens que ya están en `globals.css`. Un asesor que atiende de
  noche lo agradece, y la densidad alta en blanco cansa.
