# Plan de cierre de brechas — marco v2

> **Qué es.** La ejecución de [ADR-0038](../03-adr/0038-marco-de-trabajo-v2-una-via-dos-velocidades.md).
> El ADR decide **qué** y **por qué**; esto dice **en qué orden**, **con qué criterio de aceptación**
> y **quién lo desbloquea**.
>
> **Estado: en espera de que el propietario acepte el ADR.** Nada de aquí se implementa antes.
>
> **Congelamiento vigente (decisión del propietario, 2026-11-23):** *congelar todo hasta cerrar
> brechas.* No entra a `main` nada que no sea de este plan. **Se levanta al terminar la Ola 2**,
> verificada.

---

## Regla de verificación de este plan

Cada tarea lleva un criterio **ejecutable**, y la evidencia se pega en el PR. No vale «se implementó
la compuerta»: vale «abrí el PR de prueba y falló así: `…`».

**Y la regla que más cuesta:** una compuerta **se prueba rechazando**. Si no se ha visto rechazar,
no está hecha. Es el fallo H1 del ADR, y se cometió dos veces.

---

## Ola 0 — Desatascar · **bloqueada por el propietario**

Seis PR esperan aprobación. **Ningún agente puede desbloquearlos: ese es el diseño, y ahora por fin
funciona.** Todos están abiertos por `app/altardiario-integradora`, con la rama al día.

| PR | Qué | ¿Es del plan de corrección? |
|---|---|---|
| **#537** | El hook bloquea `gh pr create\|merge` fuera de la app. 75/75 pruebas | **Sí** — es el Pilar 4 ya implementado |
| **#536** | La app Integradora abre los PR desde el CI (T-624) | **Sí** — automatiza lo de #537 |
| **#533** | Verifica afirmación por afirmación `CLAUDE.md` y `ESTADO.md` (T-625) | **Sí** — Pilar 3, limpia la memoria antes de consolidarla |
| **#538** | El marco en versión portable para otro proyecto | No, pero solo añade un fichero en `docs/` |
| **#534** | Borrador de ADR-0037, supresión y retención (T-090) | No. **Entra igual:** es un ADR en Propuesto, no implementa nada |
| **#535** | Partir el sembrado de la demo de la rotación de credencial (T-646) | No. **Entra igual:** hoy sembrar la demo **le cambia la contraseña al cliente del piloto** |

> **Criterio de salida:** cero PR abiertos. Y de paso, confirma que el camino nuevo funciona: si tu
> aprobación pone `rutas-protegidas` en verde, el Pilar 4 está cerrado en la práctica.

**Mientras tanto, lo único que puede avanzar en paralelo es tuyo:** T-080 (verificación en Meta) y
T-598 (secretos de Render). No los toca el congelamiento porque no pasan por `main`.

---

## Ola 1 — Que las compuertas no mientan · *seguridad primero*

| Tarea | Qué | Criterio de aceptación (ejecutable) |
|---|---|---|
| **T-648** | **Paridad declarado ↔ requerido.** Manifiesto versionado de checks requeridos + job que lo compara contra la API de GitHub | Quita un check del manifiesto → **el CI debe ponerse rojo**. Añade uno que el servidor no exige → **rojo**. Pega las dos salidas |
| **T-649** | **Volver requerida `rutas-protegidas`** (cierra T-619 de verdad) | `gh api .../branches/main/protection` la lista. **Y** un PR de prueba que toque ruta protegida **no se puede integrar** sin aprobación. **Autorizado ya por el propietario** el 2026-11-23, condicionado a que #536 funcione |
| **T-650** | **Prueba negativa de cada compuerta.** Inventario de las 15 y, por cada una, una prueba que demuestre que rechaza | Tabla con las 15 filas y, en cada una, el enlace a la corrida donde **falló a propósito**. Las que no se puedan probar así, declaradas como tales |
| **T-651** | **Cuarentena de compuertas inestables.** Procedimiento + sacar `navegador` de requeridos y medir su tasa de fallo | 20 corridas medidas. Si falla > 2 %, se queda fuera con fecha de revisión |
| **T-652** | **El validador de la cola aísla el fallo al registro** (`cerrar-tarea.mjs`, H6). **Sube a P0 sobre la marcha:** al escribir este plan la cola de `main` estaba **inválida** por `T-599` truncada, así que el cierre automático no cerraba nada. Reparada ya; la causa no | Mete a propósito una fila corrupta **ajena** y cierra otra tarea: **debe cerrarse**, avisando de la fila mala |

> **Criterio de salida de la ola:** las filas 1 y 2 de la tabla de medición del ADR, en verde.

---

## Ola 2 — Que no se pierda nada · *el único fallo de datos real*

| Tarea | Qué | Criterio de aceptación (ejecutable) |
|---|---|---|
| **T-653** | **Matar `CHECKPOINT.local.md`.** Su contenido pasa a `ESTADO.md`, versionado. El hook `parada` pasa a exigir `ESTADO.md` al día | `git check-ignore docs/_contexto/CHECKPOINT.local.md` deja de importar porque el fichero no existe. Clona el repositorio en limpio: **el estado vivo tiene que estar ahí** |
| **T-654** | **Fundir `MARCO.md` y `CONTEXTO.md` en `CLAUDE.md`**, recortando de verdad | `CLAUDE.md` por debajo de 400 líneas (regla de su propia cabecera) y los dos ficheros borrados. **Si no cabe sin recortar, el Pilar 3 ha fallado**: decirlo, no maquillarlo |
| **T-655** | **Eje de entrega** `integrado → desplegado → usado por alguien real` en `tasks.yaml` | Las 267 tareas `done` clasificadas. **Se espera que casi todas queden en «integrado»**: ese es el punto |
| **T-656** | **La métrica semanal**: *¿qué puede hacer hoy un usuario real que no podía la semana pasada?* | Una línea en `ESTADO.md`, actualizada semanalmente. «Nada» es una respuesta válida y **la más valiosa** si es verdad |

> **Criterio de salida:** filas 4 y 5 del ADR en verde. **Aquí se levanta el congelamiento.**

---

## Ola 3 — Velocidad · *solo después de 1 y 2*

| Tarea | Qué | Criterio de aceptación (ejecutable) |
|---|---|---|
| **T-657** | **Clasificador de vía** (verde / ámbar / roja) sobre los ficheros del PR, con la lista roja leída de `ownership.json` | Un PR de cada clase, y la vía asignada es la esperada. **Y un PR mixto docs + migración → roja.** Ante la duda, roja |
| **T-658** | **Vías verde y ámbar en el CI**, con su juego reducido de compuertas | Un PR solo de `docs/` se integra en **menos de 3 minutos**. Medido, no estimado |

> **Criterio de salida, y es una apuesta que se mide:** el tiempo medio de un PR de documentación
> baja de forma clara. **Si no baja, el Pilar 1 no cumplió y se revierte** (§«Riesgo que se asume a
> sabiendas» del ADR).

---

## Ola 4 — Flujo

| Tarea | Qué | Criterio de aceptación (ejecutable) |
|---|---|---|
| **T-659** | **Tope de 6 PR abiertos** + «entra una, sale una» + **P0 solo si bloquea hoy a alguien** | Las 6 P0 actuales reclasificadas: las que esperan a un tercero pasan a `blocked` con dueño externo y fecha. Abrir el séptimo PR **avisa** |

> **Criterio de salida:** fila 6 del ADR (≤ 300 abiertas y bajando).

---

## Lo que este plan NO hace

- **No toca el producto.** Ni una línea de `apps/`. Es plano de control entero.
- **No acerca una agencia.** Lo dice el ADR y conviene repetirlo: si al terminar la Ola 4 la fila 7
  de la tabla de medición sigue en cero, **el marco no era el problema**.
- **No arregla las 6 P0 abiertas.** Ninguna es de código: esperan a Meta, a un abogado, a un
  despliegue o al propietario. La Ola 4 las reclasifica; no las resuelve.
- **No está probado.** Todo criterio de aceptación de aquí está **por ejecutar**. Al escribirlo, lo
  único verificado es el diagnóstico (H1–H8 del ADR), no la cura.

---

## Dependencias con el propietario

Sin esto, el plan **no arranca**:

1. **Aceptar ADR-0038.** Nada se implementa antes (R7).
2. **Aprobar los 6 PR de la Ola 0.** Ningún agente puede.
3. **T-649 necesita tu cuenta:** las apps tienen **prohibido** tocar la protección de rama
   (`gh-app.mjs` lo bloquea explícitamente). Ya autorizaste esto el 2026-11-23, condicionado a #536.
