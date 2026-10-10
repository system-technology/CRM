# Revisión — `0616084` — 2026-10-10

## Veredicto

**PASA.** Sin bloqueantes. El defecto que señalaba la revisión anterior está cerrado y la
solución es mejor que lo que se pidió.

## Bloqueante (está roto hoy)

Ninguno.

## A la cola (no bloquea — regla R13)

| Qué | Por qué no bloquea |
|---|---|
| La lista pagina de 30 en 30, así que **nunca se renderizan 500 filas a la vez**. El criterio «aguanta 500» se cumple por paginación, no por virtualización | Es una solución legítima y probablemente mejor. Se anota porque es una decisión de diseño que nadie declaró: con 500 conversaciones reales, llegar a la última exige ~17 pulsaciones de «cargar más» |
| La pantalla de conversación no tiene los tres estados —vacío, cargando, error— que la lista sí tiene | Hoy no se nota porque los datos son simulados y responden al instante. Con la API real sí |
| `EventoBandeja` del contrato dice que un evento desconocido «se ignora en silencio», pero `.parse()` lanza | No hay consumidor todavía. Cuando lo haya, tiene que usar `safeParse` |

## Lo que verifiqué, y cómo

Abriendo la página en un navegador real con Playwright, contra `0616084`. No es el servidor de
desarrollo respondiendo 200: es la pantalla funcionando.

**Compuertas:** `lint` 7/7 · `typecheck` 7/7 · `format:check` limpio.

**El arreglo del teclado, que era el defecto:**

| Comprobación | Resultado |
|---|---|
| `ArrowDown` **sin pulsar Tab antes** | Mueve la selección. Era el defecto exacto |
| `aria-selected="true"` en la fila elegida | Sí, y solo en una |
| `role="listbox"` con etiqueta, `role="option"` en las filas | Sí |
| **El foco real del DOM sigue a la selección** | Sí. Un lector de pantalla anuncia la conversación |

**La decisión que tomaste y nadie te pidió** —no interceptar las teclas cuando el foco está en
un campo— también la comprobé: con el cursor en el buscador, pulsar `j` escribe la letra y el
foco se queda ahí. Es correcta, y además necesaria: sin ella, buscar «Juan» saltaría tres filas.

## Siguiente bloque

**La pantalla de conversación, terminada.** Sigue contra datos simulados; la API real todavía no
existe y no la necesitas.

Tres cosas, en este orden:

**1. Los tres estados que le faltan.** La lista los tiene y la conversación no:

- **Cargando:** esqueleto con la forma de las burbujas, no un girador.
- **Vacío:** una conversación sin mensajes. Pasa de verdad — un contacto que abre el chat y no
  escribe nada todavía.
- **Error:** no se pudo cargar el historial, con botón de reintento.

**2. El envío, con su comportamiento real.** Hoy el botón manda al mock y ya. Falta:

- **Actualización optimista:** el mensaje aparece en el hilo en cuanto se pulsa Enviar, con
  estado `PENDIENTE`, y luego pasa a `ENVIADO`. Esperar al servidor para pintarlo hace que la
  interfaz se sienta rota aunque funcione.
- **La clave de idempotencia se genera UNA vez por intento**, no por reintento. Si el envío
  falla y el asesor reintenta, va **la misma** clave: eso es lo que impide que el viajero reciba
  el mensaje dos veces (R5). Si se genera una nueva en cada reintento, la idempotencia no existe
  y el contrato miente.
- **Fallo visible y recuperable:** si el envío falla, el mensaje se queda en el hilo marcado en
  rojo con su motivo y un botón de reintentar. No desaparece: un mensaje que se esfuma deja al
  asesor sin saber si llegó.

**3. La misma accesibilidad que acabas de poner en la lista**, aplicada al hilo: el historial
navegable con teclado, y el foco visible al moverse entre mensajes.

**Criterios de aceptación:**

- `lint`, `typecheck`, `build` y `format:check` en verde.
- Cero tipos redefinidos: todo de `@viajapro/contracts`. Si falta un campo, **se pide; no se
  inventa**.
- Con la ventana de 24 h cerrada, el envío sigue siendo imposible — no lo rompas al añadir el
  envío optimista.
- Funciona a 390 px.
- **Demuestra la idempotencia:** un reintento tras un fallo debe reutilizar la clave anterior, y
  tiene que poder comprobarse sin leer el código.

**Lo que no cambia:** solo tocas `apps/web/`, nunca escribes en `main`, no tocas `ESTADO.md`. Y
si algo del contrato te parece incompleto, **para y dilo** en vez de ajustarlo.
