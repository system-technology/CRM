# Revisión — `52865d5` — 2026-10-10

Entrega: *Pruebas automáticas de la bandeja*.

## Veredicto: **NO PASA**

Y no principalmente porque dos pruebas estén en rojo —que lo están—, sino porque **cuatro de
las seis no prueban el producto**. Prueban una copia del código escrita dentro del propio
archivo de pruebas.

---

## 1. La entrega llega con la compuerta en rojo

```
Test Files  1 failed | 1 passed (2)
     Tests  2 failed | 6 passed (8)
```

- **Prueba 2** — `actual is not defined`. No es una aserción que falla: es un `ReferenceError`.
  En la línea 90 hay `...actual` donde debía ir `...listaActualizada[idx]`. Un archivo de
  pruebas que revienta no es una prueba.
- **Prueba 6** — espera que `EnviarTexto.safeParse` devuelva éxito con
  `conversacionId: 'conv-closed-24h'`. `Id` es `z.string().uuid()`. No lo es.

`lint`, `typecheck` y `build` pueden estar verdes con esto. `test` no lo estaba, y el informe
no lo dice.

## 2. Lo de fondo: cuatro pruebas no importan el código que dicen proteger

El archivo importa exactamente dos cosas: los contratos y `realtimeMockBus`. **No importa nada
de `bandeja/page.tsx` ni de `bandeja/[id]/page.tsx`**, que es donde vive todo lo que las seis
pruebas afirman cubrir.

Lo que hacen en su lugar es **reescribir la lógica dentro del `it`**:

**Prueba 3, la de idempotencia R5.** Esta es la más clara, así que la cito entera:

```ts
const idempotenciaKeys: Record<string, string> = {};
let claveOriginal = idempotenciaKeys[mensajeId];
if (!claveOriginal) { claveOriginal = '0000…999'; idempotenciaKeys[mensajeId] = claveOriginal; }
let claveReintento = idempotenciaKeys[mensajeId];
if (!claveReintento) { claveReintento = '1111…111'; idempotenciaKeys[mensajeId] = claveReintento; }
expect(claveReintento).toBe(claveOriginal);
```

Escribe en un diccionario, lo lee dos veces y afirma que las dos lecturas coinciden. **Eso es
una propiedad de JavaScript, no de nuestra bandeja.**

La prueba de que no sirve no necesita ejecutarse: **borra entera la idempotencia del producto
—quita el botón, quita la clave, manda dos mensajes— y esta prueba sigue verde.** Una
protección que no se pone roja cuando desaparece lo que protege no existe. Es la frase que
llevamos toda la semana repitiendo, y esta vez la escribió una prueba.

**Prueba 2** copia el algoritmo del búfer (`const base = bufferConversaciones ?? estadoInicial`)
dentro del `it` y lo ejecuta ahí. Falla por una errata en **la copia**, no en el producto: el
código real está bien. **Prueba 5** y **prueba 6**, lo mismo: construyen un objeto literal y
afirman que tiene los valores que acaban de escribirle.

**Las dos que sí valen son la 1 y la 4**, y valen porque importan `realtimeMockBus` de verdad.
La 1 ya la verifiqué por mutación: reintroduje el UUID roto y se puso roja. Ésa protege.

## 3. Y la causa no es tuya: no había nada que importar

Esto es lo importante, y es responsabilidad compartida. **La lógica vive dentro de los
componentes**: 1 678 líneas entre dos archivos, con el guardián del ratón, el cálculo del
scroll y la reutilización de la clave escritos en medio del JSX. Desde un archivo de pruebas no
hay nada que llamar. Ante eso, copiar la lógica es una salida comprensible — pero produce
pruebas que acompañan en vez de morder.

La salida real es extraer. Va como tarea, abajo.

---

## Siguiente bloque, y esta vez en un solo orden

**0b, la corrección de diseño, sigue sin hacer.** Está marcada como bloqueante desde hace horas:
el asesor sigue leyendo «Mock Simulador», «Guard R5/UI» y «v0.1.0» en pantalla, elegir plantilla
fuera de la ventana de 24 h sigue siendo un `alert()` del navegador, y no existe
`app/bandeja/layout.tsx`. **Nada nuevo hasta que eso esté.** Es lo que el propietario mira
cuando abre la aplicación.

Después, y solo después, se rehacen las pruebas. En este orden:

1. **Extraer la lógica a funciones puras** en `apps/web/src/lib/`, importables y sin React:
   `reordenarConGuardia(prev, buffer, evento, ratonEncima)`, `debeBajarElScroll(distanciaAlFondo)`,
   `claveDeReintento(estadoPrevio, mensajeId)`. El componente las llama; la prueba las llama.
   **Una sola implementación, no dos.**
2. **Reescribir las cuatro pruebas** contra esas funciones.
3. **Verificar cada una por mutación**, y contarlo en `ENTREGA.md`: qué rompiste, qué prueba se
   puso roja. Si rompes algo y todo sigue verde, esa prueba no existe todavía.

Y arregla las dos rojas antes de nada: `...actual` → `...listaActualizada[idx]`, y un UUID de
verdad en la prueba 6.

**Una petición sobre el informe, que no es menor:** `ENTREGA.md` dice que las compuertas pasan y
`test` estaba en rojo al hacer `git push`. Eso me cuesta más que el defecto, porque si no puedo
fiarme del informe tengo que ejecutarlo todo yo, y entonces el informe no sirve para nada.
Ejecuta `pnpm test` antes de escribirlo, y si algo está rojo dilo: una entrega que avisa de su
propio rojo es útil. Una que lo oculta, no.
