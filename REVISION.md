# Revisión — `2cfe439` — 2026-10-10

Entrega: *Tiempo real en la bandeja (EventoBandeja, safeParse y Mouse Hover Guard)*.

## Veredicto: **NO PASA**

No por el diseño, que es bueno. Por una línea que deja la funcionalidad **muerta en ejecución**:
ningún `MENSAJE_NUEVO` llega nunca a la pantalla. Las compuertas estaban verdes igual.

---

## 1. Bloqueante — el emisor fabrica un UUID inválido y su propio `safeParse` lo descarta

`apps/web/src/lib/realtime-mock.ts`, en `emitirMensajeNuevo`:

```ts
const id = '00000000-0000-4000-8000-' + Date.now().toString(16).slice(-12);
```

`Date.now().toString(16)` mide **11 caracteres**, no 12. `slice(-12)` no rellena: recorta o
devuelve lo que hay. El último grupo de un UUID necesita 12.

Medido en el navegador, ahora mismo:

| | |
|---|---|
| Sufijo generado | `1a1265c1536` |
| Longitud | **11** |
| Requerida | 12 |
| `id` resultante | `00000000-0000-4000-8000-1a1265c1536` |
| ¿UUID válido? | **No** |

Así que `Mensaje.id` no pasa el contrato, `EventoBandeja.safeParse` devuelve `success: false`, y
el mensaje se tira a la basura. Tres clics en «📩 Mensaje Nuevo (Entrante)» con el ratón sobre la
lista dejaron esto en la consola, tres veces:

```
[RealtimeMockBus] Evento descartado en silencio (no coincide con EventoBandeja)
```

La fila no cambió, el contador no subió, no apareció ningún aviso. **Nada.**

**Lo grave no es el error de un carácter.** Es que la entrega afirma haber implementado y
verificado dos reglas de producto —no robar el scroll al llegar un mensaje, no reordenar bajo el
cursor al llegar un mensaje— que **sólo se disparan con `MENSAJE_NUEVO`**. Con el emisor roto,
esas dos reglas no se pueden haber visto funcionar ni una vez. Lo único que sí se probó, y por eso
pasó, es el descarte silencioso: ahora mismo es lo que hace el sistema con todo.

El silencio del contrato, que está bien implementado, es lo que escondió el defecto. El
`console.warn` que pusiste en desarrollo es la única razón por la que lo encontré en treinta
segundos. Déjalo donde está.

**Corrección:** `Date.now().toString(16).padStart(12, '0')`, o `crypto.randomUUID()`, que es lo que
hay que usar de todos modos.

## 2. Bloqueante — el búfer no acumula: pierde todo menos el último evento

`apps/web/src/app/bandeja/page.tsx:148`

```ts
if (isHoveringListRef.current) {
  bufferConversacionesRef.current = listaActualizada;
  setPendientesReorden((p) => p + 1);
  return prev;          // el estado no cambia…
}
```

…y `listaActualizada` se construye en la línea 143 a partir de `prev`, que **nunca incluye lo ya
acumulado**, precisamente porque se devolvió `prev` sin cambiarlo. Cada evento reescribe el búfer
partiendo de cero.

Con el ratón sobre la lista —la postura normal de un asesor mientras lee— llegan dos mensajes de
dos viajeros distintos y **sólo sobrevive el segundo**. El primero desaparece: ni texto, ni
contador de no leídos, ni posición. El aviso, mientras tanto, dice que hay dos actualizaciones
esperando.

La entrega lo describe como «los reordenamientos se acumulan en un búfer visual». No se acumulan.
Se pisan.

**Corrección:** derivar del búfer cuando existe.

```ts
const base = bufferConversacionesRef.current ?? prev;
```

y construir `listaActualizada` sobre `base`, no sobre `prev`.

## 3. Bloqueante menor — el contador cuenta el doble

Tres clics en «📌 Actualizar Conversación» con el ratón encima:

> 📌 Hay **6** actualización(es) de mensajes. Reordenamiento en pausa…

`setPendientesReorden((p) => p + 1)` vive **dentro** del actualizador de `setConversaciones`. React
ejecuta los actualizadores dos veces en desarrollo, a propósito, para delatar justo esto: un
actualizador tiene que ser una función pura de `prev`, sin efectos. En producción contaría bien, lo
que es peor, porque el síntoma desaparece donde nadie lo mira.

**Corrección:** sacar el efecto del reductor —calcular el pendiente en el propio búfer y derivar el
número de ahí, o subirlo en un `useEffect`.

---

## Lo que sí quedó bien, y no es poco

- **El guardián del ratón retiene y aplica.** Comprobado con el ratón real sobre la lista: las
  filas no se movieron con tres eventos encima, el aviso apareció, y al salir el ratón la
  actualización entró y el aviso se fue. La mecánica es correcta; lo que falla es con qué datos.
- **El scroll no se roba.** `[id]/page.tsx:130` sólo baja si `isNearBottomRef` dice que ya estabas
  abajo; si no, acumula en el contador flotante. Y deduplica por `id` antes de insertar, que es lo
  que impide el mensaje repetido cuando el servidor reenvía.
- **`safeParse` y no `.parse`.** Segunda entrega seguida que acierta en esto.
- **La codificación del documento está limpia.** La entrega anterior llegó con «Vacéo» y «EnvÁo».
  Ésta no. Corregido.

## A la cola — no bloquea (R13)

| | Qué | Dónde |
|---|---|---|
| 1 | Un `MENSAJE_NUEVO` de una conversación que no está en la lista se descarta en silencio; un viajero que escribe por primera vez no aparece | `bandeja/page.tsx:120` |
| 2 | `MENSAJE_ACTUALIZADO` sube el contador de pendientes aunque no cambie nada en la lista | `bandeja/page.tsx:146` |
| 3 | `toggleAutoSimulacion` guarda el `setInterval` en el singleton; nadie lo limpia al desmontar | `realtime-mock.ts:120` |
| 4 | El simulador siempre dispara sobre `conversaciones[0]`; no deja probar dos conversaciones distintas, que es justo el caso del punto 2 | `SimuladorTiempoReal.tsx:25` |

---

## Un apunte que es mío, no tuyo

Tenías un **`.env.bak` sin ignorar** en el worktree, con las credenciales anteriores en claro. Lo
dejó ahí mi script de rotación, en los tres árboles, y `.gitignore` sólo nombraba `.env`,
`.env.local` y `.env.*.local`. Un `git add -A` lo habría subido.

Corregido en este mismo commit: ahora es `.env.*` con `!.env.example`. Comprobadas las dos mitades
—que `.env.bak` queda ignorado y que `.env.example` sigue siendo versionable—, porque una lista de
permitidos que nadie ha intentado romper no está verificada.

---

## Siguiente bloque

**Primero, y antes que cualquier cosa nueva: los tres puntos de arriba.** Son tres correcciones
pequeñas en dos archivos.

Y la que convierte esto en algo que no vuelve a pasar: **una prueba que falle hoy**. Un
`*.spec.ts` junto a `realtime-mock.ts` que emita un `MENSAJE_NUEVO` y afirme que el suscriptor
**lo recibe**. Con el código actual tiene que salir en rojo; si sale verde, la prueba no sirve.
Añade otra para el punto 2: dos eventos seguidos con el guardián activo y el estado final
conteniendo **los dos**.

Es la lección de esta entrega, y no es tuya sola: `lint`, `typecheck`, `build` y `format` estaban
los cuatro en verde sobre una funcionalidad que no hacía absolutamente nada. Compilar no es
funcionar. Lo único que lo distingue es una aserción que se pone roja cuando el comportamiento
desaparece.

Después, la tarea 4 de `COLA.md`: los casos borde de la bandeja —ventana de 24 h cerrada, mensaje
fallido, adjunto sin descargar.
