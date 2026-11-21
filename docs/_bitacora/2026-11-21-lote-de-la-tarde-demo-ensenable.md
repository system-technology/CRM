# 2026-11-21 · El lote que deja la demostración en condiciones de enseñarse

> Madre: `session_01R81Xh4XshqoadVSoT7orGV` (Opus). Turno de las 16:55 a las ~17:30 UTC.
> `main` de `7a0ac374` a `910c04f0`. **Siete PR integrados, cero abiertos al cerrar.**

## Por qué este lote y no otro

El propietario escribió por la mañana: «veo poco avance y debemos tener el CRM funcional al 100%
para poder mostrarlo y que lleguen agencias». Tenía razón en el hecho —**ninguna agencia ha visto
nada**— y no en el remedio: con 321 tareas abiertas, esperar al 100% garantiza no enseñarlo nunca.

Así que el lote se ordenó por una sola pregunta: **¿qué impide hoy enseñar el producto?** La lista
resultó corta, y está entera en `main`.

## Lo que entró

| PR | Qué | Nota |
|---|---|---|
| #461 | cierre del lote anterior | diario y tablero del relevo |
| #460 | cierre automático de T-562 | el manual queda `done` |
| #463 | **reconciliación de las 74 P1** | ver abajo; es lo más importante del lote |
| #466 | seguimientos de la reconciliación | T-574, T-575, T-576 y T-377 a P1 |
| #462 | **T-565** | el ingreso deja de afirmar una conexión que no comprueba |
| #464 | **T-566** | la demostración se puede ver como un asesor puro |
| #465 | **T-563** | se puede aceptar una cotización desde la pantalla |

## La reconciliación: la cola mentía, y en los dos sentidos

De **74 tareas P1 abiertas quedan 17**. Ocho ya estaban hechas en el código —cada una con el
símbolo, archivo o prueba que lo demuestra— y 49 estaban mal priorizadas.

**Lo que conviene aprender de aquí, porque se repitió:** la madre repartió la tarea sospechando que
T-137, T-139 y T-140 estaban hechas, porque `ventasPorDestino`, `cotizacionesAbiertas`,
`medianaMinutos` y `p90Minutos` existen en `packages/contracts`. La sesión midió y **desmintió la
mitad**: los contratos existían, pero a las tareas les faltaba lo que de verdad pedían (el % dentro
del SLA, `muestraInsuficiente` con n<5, las vencidas por vigencia, ventas por paquete). Las reescribió
a **lo que falta** y las bajó a P2.

Es el mismo error que ya costó T-560 y T-561 en el turno anterior: **quien mide es quien diagnostica.**

## Lo que la reconciliación destapó, ya encolado

- **T-574 (P1)** — las **14 tareas P0 abiertas nunca se contrastaron contra el código**, y T-131 y
  T-132 parecen estar ya hechas. P0 es la lista que todo el mundo mira primero.
- **T-377 sube de P3 a P1** — el arnés de mutaciones de aislamiento **no corre en el CI**. §3.1 dice
  que el aislamiento entre agencias es el único sitio donde no se recorta: una compuerta de
  aislamiento que no se ejecuta no es una compuerta.
- **T-575 (P2)** — ADR-0035 sigue «Propuesto» con T-341 y T-342 ya en `main`. Incumple R7.
- **T-576 (P2)** — el manual describe dos pantallas que T-565 y T-566 acaban de cambiar.
- **Punto 13 de la bandeja del propietario** — `.github/proteccion-main.json` difiere del servidor
  en tres campos y **reaplicarlo apagaría los code owners**. No se toca: es configuración de GitHub.

## T-566 no deshace T-343, aunque lo parezca

El diario del 2026-11-21 dice que **T-343 retiró a propósito el conmutador Vista Dueño/Asesor**,
porque la vista la decide la respuesta de la API y **no se filtran listas de agencia en el cliente
para fingir «lo tuyo»**. T-566 añade un conmutador con ese mismo nombre, y hay que leerlo bien:

- vive **solo dentro del modo demostración** (`vistaDemo()` devuelve `dueno` fuera de él);
- **no toca** la sesión, ni la API, ni `tienePermiso`;
- solo decide **qué se pinta** y qué alcance simulan los datos de muestra;
- la sustitución del predicado de permisos **solo quita** entradas del menú, nunca añade.

Dicho de otro modo: T-343 prohibió fingir el alcance **con datos reales**; T-566 enseña la forma de
la pantalla **con datos de ejemplo**. La decisión de T-343 sigue en pie.

## Auditorías del lote (R13: el código, no el informe)

- **T-563** — verificado contra el servidor: `POST /cotizaciones/:id/estado` exige
  `cotizacion.escribir` (`@RequierePermiso`), y el dominio solo admite `ENVIADA → ACEPTADA`. La web
  **repite** el invariante en vez de inventarse el suyo, y deshabilita por comodidad, nunca por
  seguridad (ADR-0011). El archivo de viaje no viene en la respuesta —lo abre el consumidor de
  `cotizacion.aceptada`— así que la pantalla lo busca y distingue «sigo mirando» de «ya miré
  bastante»; nunca inventa el enlace.
- **T-566** — doble compuerta, descrita arriba.
- **#463** — se validó el YAML de forma independiente del informe: 545 tareas, ningún id duplicado,
  ninguna sin título ni sin cuerpo.

## Trampas de este turno

- **El cierre automático de tareas compite con todo el carril `i`.** #460 reescribió `tasks.yaml`
  mientras #463 trabajaba sobre él (conflicto), y después tumbó un merge de #464 con «Base branch
  was modified» y dejó #465 detrás dos veces. **La ventana segura para tocar `tasks.yaml` es cuando
  no hay ningún otro PR de carril `i` abierto.**
- **Un conflicto de `tasks.yaml` se devuelve a quien hizo el trabajo**, con instrucciones de tomar
  `origin/main` como base y reaplicar **tarea por tarea**. Nunca concatenar: ya entremezcló entradas
  una vez, y el YAML parseaba igual.
- **Hay criterios de aceptación que cruzan carriles por su cuenta.** T-565 y T-566 pedían tocar
  `docs/06-manual/` dentro de una tarea de `apps/web`; el check «Carril y tarea» lo habría
  rechazado. Se avisó a las dos sesiones y el rastro se encoló aparte (T-576).
- **El sha truncado vuelve a morder.** La madre usó el `${sha:0:8}` que imprimía su propio monitor
  en un `update-branch` y se llevó un 422. Leerlo entero con `--jq '.head.sha'`.
- **Un monitor que imprime el estado cada vuelta inunda de notificaciones.** Guardar el estado
  anterior y emitir **solo al cambiar**.

## Coste

La madre anterior gastó **457.098 tokens y 52,26 USD**. Las cuatro hijas de este lote, en Sonnet:
**3,35 + 0,66 + 1,05 USD** y la de T-563. El trabajo de carril barato debe seguir en sesiones cortas.

## Lo que sigue bloqueado, y no está en este repositorio

El código de la demostración está en `main`. **Enseñarla depende del propietario:** el despliegue
(claves y paneles) y la lista de chats a excluir de JD Tours, sin la cual T-533 no arranca y el
número real no se conecta. Bandeja: `docs/_contexto/PENDIENTES-DEL-PROPIETARIO.md`.
