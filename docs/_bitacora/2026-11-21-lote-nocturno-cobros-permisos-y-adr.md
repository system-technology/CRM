# 2026-11-21 — Lote nocturno: cobros, permisos de reportes y la aceptación del ADR-0035

> Madre del lote: sesión orquestadora `…5mmenvvqrBAdaBUW1`. Arranque con `main` en `580dd67f`,
> cero PR abiertos y ninguna sesión hija viva.

## 1. Por qué este lote y no otro

El propietario dijo: «Veo poco avance y debemos tener el CRM funcional al 100% para poder mostrarlo
y que lleguen agencias.»

El turno anterior mejoró la compuerta de aislamiento y la veracidad de la cola, y fue honesto al
reconocer que **eso no acercó ni una agencia**. Este lote se eligió con ese criterio: se fue al
**criterio de salida del piloto JD Tours** (`docs/08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md` §3),
que es la lista de lo que JD Tours necesita para «dejar su hoja y sus etiquetas».

En concreto, su punto 4 —«en *Archivos de viaje* se ve la tabla con total, pagado y saldo por
archivo, se filtra *Saldo pendiente* y se exporta a CSV»— **no se podía hacer en un navegador**.

## 2. Un bloqueo que la cola escondía: T-334 no estaba lista

`T-334` («tabla de archivos de viaje con las columnas de la hoja del piloto») figuraba como
**`ready`**, y es **falso**.

Su primer criterio de aceptación exige que «las columnas y filtros salgan de la **hoja real del
piloto** (muestra sin datos personales)». Esa muestra **no existe en el repositorio** (no hay ningún
`.csv`), y el propio roadmap, en su §4, encabeza las preguntas abiertas con
«**antes de T-327, T-323 y T-334**», siendo la última: «Su hoja: cuántas reservas y qué columnas.
Pedir una muestra **sin nombres ni teléfonos** (R10)».

Es el **punto 12 de `PENDIENTES-DEL-PROPIETARIO.md`**, que ya estaba registrado. Lo que fallaba no
era el registro del pendiente, sino que **la cola marcaba como lista una tarea que depende de él**.

Correcciones aplicadas:

| Tarea | Antes | Ahora | Por qué |
|---|---|---|---|
| `T-334` | `ready` | **`blocked`** | La desbloquea el propietario con su hoja, no una sesión de código |
| `T-336` | `backlog` | **`blocked`** | Importar la hoja del piloto exige la hoja del piloto |
| `T-335` | `backlog`, depende de `T-334` | **`ready`**, depende de **`T-332`** | Lo que hay que exportar es la tabla del criterio de salida, que entrega T-332; no hacen falta las columnas del propietario |

Tras el cambio, **ninguna tarea `ready` de la cola depende de una `blocked`** (comprobado sobre las
551 tareas).

## 3. T-372: medida y cerrada

`T-372` pedía **ejecutar el arnés de mutaciones de aislamiento y dejar el rastro de que M17 y M21
salen en rojo**. El turno anterior la dejó en la cola advirtiendo, con razón, que **no lo había
verificado** y que lo midiera quien la tomara.

Se midió. Desde `T-377` el arnés **ya corre en todo PR**. En la corrida **`44934621499`** (rama
`i/tablero-y-seguimientos-del-arnes`, ya integrada en `main`, 18:18 UTC):

```
ROJO   M17 — el disparador NO borra el par OLD al cambiar identidad_id o tenant_id
ROJO   M21 — el disparador sin la rama del apodo: un cambio de apodo no llega al índice
...
23 mutaciones detectadas, 1 no aplicables en esta topologia de roles.
```

Las dos salen **ROJAS**, que es exactamente el criterio que faltaba. `T-372` pasa a **`done`** con
esta evidencia.

**Lo que esto confirma:** la sospecha del turno anterior era correcta, y **tenía razón en no darla
por buena sin medirla**. Quien mide es quien diagnostica.
