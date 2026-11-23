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
| **T-650** | **Prueba negativa de cada compuerta.** **Inventario ya hecho** (PR #540): son **16 compuertas y solo 8 bloquean** — entre las que **no** bloquean están `rutas-protegidas` y **`mutaciones-aislamiento`**, la del aislamiento entre agencias | Tabla con las 16 filas y, en cada una, el enlace a la corrida donde **falló a propósito**. Las que no se puedan probar así, declaradas como tales |
| **T-651** | **Arreglar o retirar `navegador`.** *Corregida el 2026-11-23: la tarea pedía «sacarlo de requeridos» y la medición demuestra que **ya no es requerido**.* Concentra el **100 % de los fallos de CI** (12 de 12) **sin bloquear nada** | Intento acotado de hallar la causa del no determinismo; si no se halla, **se retira con fecha**. Probado inestable: falló en una rama que solo toca `roadmap/tasks.yaml` **y falló en `main`**. Un job siempre rojo sin consecuencia **enseña que el rojo no significa nada** |
| **T-652** | **El validador de la cola aísla el fallo al registro** (`cerrar-tarea.mjs`, H6). **Sube a P0 sobre la marcha:** al escribir este plan la cola de `main` estaba **inválida** por `T-599` truncada, así que el cierre automático no cerraba nada. Reparada ya; la causa no | Mete a propósito una fila corrupta **ajena** y cierra otra tarea: **debe cerrarse**, avisando de la fila mala |

> **Criterio de salida de la ola:** las filas 1 y 2 de la tabla de medición del ADR, en verde.

---

## Ola 1.5 — Que el propietario deje de ser el cuello de botella

**Añadida el 2026-11-23**, después de que el propietario señalara el defecto antes de firmar: *«lo
único que me preocupa es que este marco de trabajo depende mucho de mí»*. **Tenía razón y el plan lo
empeoraba:** las olas 2 a 4 son **100 % plano de control**, así que sin esta ola él aprueba cada paso
de su propio plan de corrección.

**Medido, no supuesto:** de los 60 PR integrados más recientes, **10 (17 %)** habrían exigido su
firma. El 7 de 7 de hoy es el **pico**, no el régimen. Los globs que más la disparan: `.github/**`,
`scripts/**`, `.claude/**` y `CLAUDE.md` — todos, plano de control.

| Tarea | Qué | Criterio de aceptación (ejecutable) |
|---|---|---|
| **T-660** | **Aprobar la decisión, no el borrador.** Un ADR en `Propuesto` pasa a vía ámbar; la firma se exige en la transición `Propuesto → Aceptado` | Un PR que **añade** un ADR en `Propuesto` se integra sin firma. Un PR que **cambia su estado a Aceptado** la exige. **Las dos pruebas, o no está hecho** |
| **T-661** | **Protección de rama como código.** El manifiesto de T-648 pasa a fuente de verdad; una credencial estrecha lo aplica | El propietario aprueba un **diff del manifiesto** y la protección real cambia sola. Verificado con `gh api .../protection` antes y después. Convierte T-649 en un PR normal |
| **T-662** | **Globs por riesgo, no por carpeta.** Afinar `scripts/**`, `.claude/**`, `**/package.json` | **Fichero a fichero, nunca por lotes.** Por cada glob que se estrecha, se nombra qué daño concreto podía hacer lo que sale de la lista. «Ante la duda, roja» intacta. **Esta es la única tarea del plan que reduce de verdad la supervisión: va despacio** |
| **T-663** | **Lote de aprobación con resumen.** Un digest diario ordenado por riesgo | El propietario recibe **una** lista con qué mirar y en qué orden, en vez de reconstruir el contexto una vez por PR |

> **Criterio de salida:** fila 7 de la tabla del ADR — PR que exigen su firma **≤ 10 %** en régimen
> normal. **Si no baja del 17 %, el Pilar 6 no cumplió.**

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

## Ola 3 — Flujo · *aquí está el 83 % del tiempo*

**Reordenada el 2026-11-23 tras medir.** Era la Ola 4; sube porque la medición demostró que es aquí
—y no en las compuertas— donde se pierde el tiempo.

| Tarea | Qué | Criterio de aceptación (ejecutable) |
|---|---|---|
| **T-664** | **Auto-merge activado al abrir el PR, siempre.** `abrir-pr.yml` lo activa en el mismo paso en que crea el PR | Abre un PR, integra otra cosa en `main` para dejarlo `BEHIND`, y comprueba que `mantener-ramas.yml` lo actualiza y **entra solo**. **No cuesta nada en seguridad:** el auto-merge sigue esperando a todas las compuertas requeridas |
| **T-659** | **Tope de 6 PR abiertos** + «entra una, sale una» + **P0 solo si bloquea hoy a alguien** | Las P0 reclasificadas: lo que espera a un tercero pasa a `blocked` con dueño externo y fecha. Abrir el séptimo PR **avisa** |

### Por qué T-664 es la tarea más rentable del plan

`mantener-ramas.yml` actualiza los PR que quedan atrás, **pero solo los que ya tienen auto-merge
activado**. **#530 y #531 no lo tenían**: quedaron `BEHIND`, nadie los actualizó nunca y acumularon
**32,6 h y 32,0 h muertos** — y **los dos eran de vía verde**, documentación y cola. No los frenó
ninguna compuerta: los frenó que nadie los tocara.

**Una línea en un workflow ataca el 83 % del tiempo perdido.**

> **Criterio de salida:** ningún PR abierto sin auto-merge, y fila 6 del ADR (≤ 300 abiertas).

---

## Ola 4 — Velocidad · **degradada por medición**

| Tarea | Qué | Estado |
|---|---|---|
| **T-657** | Clasificador de vía (verde / ámbar / roja) | **P3** |
| **T-658** | Vías verde y ámbar en el CI | **P3** |

**Medido el 2026-11-23, y desmiente el Pilar 1 que yo mismo escribí:** su techo de mejora es de
**1,3 h sobre 104,8 h = 1,2 %**. Las medianas ya son rápidas —verde **7 min**, ámbar 16, roja 24— y
el CI tarda **5 min de mediana**. Es cierto que el CI es el 74 % de la vida de un PR verde, pero esa
vida son siete minutos.

**Se hace si sobra tiempo, o no se hace.** La idea sigue siendo correcta; lo que no es correcto es el
tamaño que le atribuí.

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
