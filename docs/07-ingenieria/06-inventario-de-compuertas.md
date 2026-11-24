# Inventario de compuertas y medición de su inestabilidad

> **Qué es.** El punto de partida de T-650 y T-651 del plan de cierre de brechas
> (`docs/08-roadmap/12-plan-de-cierre-de-brechas.md`, en el PR #539, aún sin integrar). Antes de
> exigir a cada compuerta una prueba negativa hay que saber **cuáles hay**, **cuáles bloquean de
> verdad** y **cuáles mienten**.
>
> **Este documento entra solo.** No toca ninguna ruta protegida, así que no necesita la firma del
> propietario: es medición, no decisión. Las tareas que corrige viven en el PR #539, que sí la
> necesita.
>
> **Todo lo de aquí está medido el 2026-11-23** con `gh api` contra el repositorio real. Lo no
> comprobado va marcado.

---

## 1. Las compuertas, y cuáles bloquean

`ci.yml` declara **11 jobs**. A ellos se suman los flujos aparte (`rutas-protegidas`,
`mutaciones-aislamiento`, `carril-y-tarea`, `politica-de-rama`). Pero **solo 8 bloquean**, y la
diferencia es el hallazgo principal.

Fuente de la columna «¿bloquea?»: `gh api repos/system-technology/CRM/branches/main/protection`.

| Compuerta | Declarada en | ¿Bloquea la integración? |
|---|---|---|
| `secretos` | `ci.yml` | **Sí** |
| `typecheck` | `ci.yml` (job `calidad`) | **Sí** |
| `lint` | `ci.yml` (job `calidad`) | **Sí** |
| `build` | `ci.yml` (job `calidad`) | **Sí** |
| `test` | `ci.yml` | **Sí** |
| `aislamiento-tenants` | `ci.yml` | **Sí** |
| `fronteras-entre-modulos` | `ci.yml` | **Sí** |
| `convencion-de-commits` | `ci.yml` | **Sí** |
| `navegador` | `ci.yml` | **NO** |
| `imagenes-de-despliegue` | `ci.yml` | **NO** |
| `auditoria-dependencias` | `ci.yml` | **NO** |
| `enlaces-de-documentacion` | `ci.yml` | **NO** |
| `politica-de-rama` | `ci.yml` (job `hooks`) | **NO** |
| `rutas-protegidas` | flujo propio | **NO** ← el fallo H4 del ADR-0038 |
| `mutaciones-aislamiento` | flujo propio | **NO** |
| `carril-y-tarea` | flujo propio | **NO** |

**Ocho de dieciséis bloquean. Las otras ocho pintan color y no impiden nada** — y entre ellas están
`rutas-protegidas` (la compuerta de R11) y `mutaciones-aislamiento` (la que mide el aislamiento entre
agencias). Es exactamente la clase de fallo que motivó el Pilar 2.

> **El «8 checks» que repite `CLAUDE.md` R11 es literalmente cierto y engañoso a la vez:** hay 8
> requeridos, sí, pero se han ido añadiendo compuertas al CI sin añadirlas a la protección, y nadie
> comparaba las dos listas. Eso es lo que automatiza **T-648**.

---

## 2. `navegador`: medido, no opinado

### El dato

De las **12 corridas fallidas más recientes** de `ci.yml` (`gh api .../runs?status=failure`):

| Medida | Valor |
|---|---|
| Corridas fallidas inspeccionadas | **12** |
| De ellas, que fallaron **en `navegador`** | **12 (100 %)** |
| De ellas, que fallaron en **algún otro job** | **0** |

En las **100 corridas más recientes** (2026-11-22 a 2026-11-23): 68 `success`, 24 `cancelled`
—por `cancel-in-progress`, no son fallos— y 7 `failure`. **Un solo relanzamiento** (`run_attempt > 1`)
en las 100.

### Las dos «pruebas» de que es inestable — y por qué no prueban eso (corregido el 2026-11-24)

1. **Falló en una rama que solo toca `roadmap/tasks.yaml`** (`i/T-000-confirmar-sin-leer`,
   run `45186672007`). **Un fichero de cola no puede romper una prueba de navegador.**
2. **Falló en `main`** (run `45185995329`). Y a `main` solo entra lo que ya pasó sus checks, así que
   un fallo ahí **solo puede ser no determinismo**.

A eso se suma lo ya anotado en el diario el 2026-11-21: falló en dos PR sin nada en común y **pasó al
relanzarlo sin cambiar una línea**.

**Corrección del 2026-11-24.** Los puntos 1 y 2 **no prueban no determinismo**. Prueban que el fallo
es **independiente del cambio**, y eso lo cumple igual un fallo **determinista** que falla en todas
las corridas. El único dato de esta lista que sí prueba variabilidad es el tercero —el relanzamiento
que pasó sin tocar nada—, y ese venía del diario, no de esta medición.

Lo anoto porque el vicio es el que persigue este mismo documento: **de «falla siempre» se concluyó
«falla al azar», que no se sigue.**

### La causa, hallada el 2026-11-24 (T-651, intento acotado)

**Dónde falla.** Corrida `45284335410` (`main`, `4e05ef8f`), job `navegador`:

```
1) [flujo] › 07-cobros.e2e-spec.ts:136 › el archivo de viaje muestra total, pagado, saldo e historial vacio
   Test timeout of 90000ms exceeded.
   waiting for getByTestId('panel-de-cobro').locator('dt').filter({ hasText: /^Total del viaje$/ })
1 failed, 3 did not run, 61 passed (2.7m)
```

**Por qué nadie pudo clasificarlo en dos días.** No es la infraestructura: **es que la prueba
descarta el diagnóstico que la pantalla ya muestra.**

`panel-de-cobro` (`apps/web/src/components/reservas/panel-de-cobro.tsx`) pinta el **mismo**
`data-testid` en sus **tres** estados —`cargando`, `error` y `listo`— y el `<dl>` de las cifras solo
existe en `listo`. Así que `expect(panel).toBeVisible()` **pasa en los tres**, y al quedar en `error`
la prueba se queda esperando un `dt` que no va a aparecer **hasta agotar los 90 s** del test. El
fallo que se reporta es «Test timeout exceeded»: no dice nada.

Y mientras tanto el panel tiene en pantalla, en un `role="alert"`, la causa exacta: «No se pudo
cargar el cobro de este archivo» y su mensaje. El `api.log` de esa corrida apunta a la sesión
(`[Better Auth] User not found` y `CREDENCIALES_INVALIDAS`, segundos antes del fallo).

**Hay más de un modo de fallo.** La corrida `45280673804` (rama solo de documentación) falló el paso
en **71 s**, por debajo del timeout de 90 s: no es el mismo fallo. Con `retries: 0` el CI **no podía
distinguir roto de inestable**, que es precisamente la pregunta abierta.

**Lo hecho** (rama `b/T-000-navegador-diagnosticable`, carril `b`):

| Cambio | Para qué |
|---|---|
| `panelDeCobroListo()` en `e2e/auxiliares.ts` | Espera cifras **o** error; si es error **falla al instante citando la pantalla**. Es la disciplina que `registrarPago` ya aplicaba en ese mismo fichero |
| Lo usan las 5 llamadas de `07-cobros` y la de `07b-cobros-tabla` | `07b` tenía el mismo fallo latente: comprobaba visibilidad y luego pulsaba `abrir-registrar-pago`, botón que solo existe en `listo` |
| `cifra()` con tiempo propio (15 s) | Sin él heredaba el del test entero: el primer dato que faltara se comía los 90 s sin nombrarse |
| `retries: 1` **solo en CI** | No esconde el rojo: lo **clasifica**. Playwright marca `flaky` lo que falla y luego pasa, y `failed` lo que falla dos veces. En local sigue en 0 |

**Lo que esto NO hace, y conviene decirlo:** no arregla la causa de fondo de que el cobro falle a
veces. La hace **nombrarse**. La siguiente corrida roja dirá si es sesión, carrera o datos.

**Lo que no se pudo verificar:** la suite entera no corre en una sesión de nube —exige Postgres—, así
que lo comprobado es `playwright test --list` (65 pruebas en 10 ficheros, las mismas que el CI),
typecheck del proyecto `e2e` y lint. **La prueba de que el rojo se fue está por ejecutar**, y por eso
T-651 **sigue abierta** y la rama va como `T-000`.

### Por qué esto es peor de lo que parecía, y corrige la tarea

T-651 se escribió como «**sacar** `navegador` de requeridos y medir su tasa de fallo». **La medición
dice que ya no es requerido**, así que esa parte de la tarea no tiene sentido.

El problema real es el contrario, y es más grave:

> **`navegador` concentra el 100 % de los fallos de CI y no bloquea nada.** Un job
> permanentemente rojo sin consecuencia **no es una compuerta en cuarentena: es ruido que enseña que
> el rojo no significa nada.** Y esa lección se aplica después a los rojos que sí importan.

**Decisión del arquitecto (2026-11-23):** T-651 deja de ser «cuarentena» y pasa a **arreglarlo o
retirarlo**, con fecha. Un job que no bloquea y siempre falla no puede quedarse indefinidamente:
degrada la señal de las quince compuertas restantes. Si la causa del no determinismo no se encuentra
en un intento acotado, **se retira del CI** y su cobertura se recupera donde sí pueda ser
determinista.

---

## 3. Qué queda por hacer, y qué no se midió

**Hecho aquí:** el inventario (16 compuertas), cuáles bloquean (8) y la medición de `navegador`.

**No hecho, y es el grueso de T-650:** la **prueba negativa** de cada compuerta — verla rechazar a
propósito. Este documento dice *cuáles hay*, no *cuáles funcionan*. **De ninguna de las 16 consta hoy
una corrida donde haya rechazado algo deliberadamente**, salvo `rutas-protegidas`, que se vio
rechazar siete PR el 2026-11-23 por el motivo equivocado.

**No medido:** la tasa de fallo de `navegador` sobre una ventana larga. Las 100 corridas analizadas
cubren **dos días**. Es mucho volumen y poca historia; suficiente para concluir que es inestable, no
para dar un porcentaje estable.

**No medido:** cuánto tarda hoy un PR en integrarse por tipo de cambio. Es la línea base que
necesita T-658 para saber si la vía verde sirvió de algo.
