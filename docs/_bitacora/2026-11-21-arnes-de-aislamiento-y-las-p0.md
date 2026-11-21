# 2026-11-21 — Lote del arnés de aislamiento y la cola que mentía en P0

Sesión madre `…64ppDELKxYC1Tkdsu`. Arranca con `main` en `36bd12f2` y cero PR abiertos; tres
sesiones cortas en paralelo, una por carril, todas en Sonnet.

## Lo que entró

| PR | Tarea | Qué |
|---|---|---|
| #472 | T-574 | De 14 tareas P0 abiertas quedan **4 reales** |
| #473 | T-569 | 41 clases de una familia de color inexistente, mapeadas a la paleta real |
| #471 | T-377 | El arnés de mutaciones de aislamiento corre en el CI, en todo PR |
| #474 | — | Tablero, tres seguimientos nuevos y dos correcciones de la cola |

## 1. La cola mentía también en P0 (T-574)

La reconciliación de las P1 (PR #463) había dejado las P0 sin tocar. Nunca se habían contrastado
contra el código. De las 14 abiertas: **5 ya estaban hechas**, 5 estaban mal priorizadas y **4 son
reales** (T-079, T-080, T-093 y T-126 — las cuatro esperan despliegue, al propietario o un recorrido
manual, no código).

**La hipótesis de la madre era correcta pero parcial**, y eso es lo que había que aprender: se
repartió sospechando de T-131 y T-132, y la sesión confirmó esas dos **y encontró tres más**
(T-120, T-121, T-123). Es la cuarta vez seguida que la orquestadora diagnostica de menos. El
encargo se escribió como síntoma —«mide, no confirmes», y la sospecha marcada como hipótesis a
desmentir— y por eso funcionó. **Quien mide es quien diagnostica.**

Antes de integrar se comprobaron a mano tres de las cinco citas de `done` contra el código: las
tres exactas.

## 2. El arnés de aislamiento corría a medias y nadie lo sabía (T-377)

`mutaciones-aislamiento.mjs` existía desde hacía tiempo y **no corría en ningún sitio**. Al ponerlo
en el CI, su primera ejecución en la vida destapó que **tampoco corría entero**: moría en M22 y
M23 y M24 nunca llegaban a ejecutarse.

La causa: M22 hace `GRANT <dueño de perfiles_de_agencia> TO viajapro_app`, y en el entorno de
integración el dueño ya es miembro de ese rol, así que el GRANT cerraría un ciclo y PostgreSQL lo
rechaza. **M22 asumía una topología de roles que no es la del CI**, justo donde la compuerta iba a
vivir.

**Lo que vale para cualquier arnés: una mutación rota esconde a todas las posteriores.** El bucle
dejaba que la excepción tumbara el proceso, a propósito, para no contar una mutación como verde —
pero eso convierte un fallo en una venda. Ahora hay cuatro estados (rojo / verde / **error** /
**no aplicable**), se sigue con la siguiente y se sale distinto de cero al final.

**Y la medición desmintió al diseño.** El workflow nació con filtro de rutas y sin ser obligatorio
porque se suponía que el arnés tardaba «minutos». Medido: **43 segundos**, 1 min 45 s el job entero.
Se le quitó el filtro y corre en **todo PR**; con eso **ya puede ser check obligatorio** en cuanto el
propietario lo añada a la lista del servidor (T-577). La moraleja va al tablero: *un comentario que
justifica una decisión con una medición que nadie tomó congela esa decisión durante meses.*

**Resultado final:** 17 controles verdes, M1–M21 rojas, M22 no aplicable, M23 roja y **M24 roja —
el entregable está demostrado**: la fijación de `creado_en` y `actualizado_en` ya tiene quien la
vigile. 23 detectadas, 1 no aplicable.

Se auditó el código y no el informe: **M24 se comparó línea a línea con la definición viva** de
`proteger_verificacion_del_perfil` antes de aceptarla. Difiere solo en las cuatro asignaciones de
fecha y deja intacta la lógica de verificación. Una mutación mal acotada habría puesto la prueba en
rojo por el motivo equivocado y dado cobertura falsa.

## 3. Dos cosas que la cola y el proceso daban por ciertas y no lo eran

- **`Carril y tarea` NO rechaza una bitácora de `docs/` dentro de un PR de carril `a` o `b`.**
  T-576 afirmaba lo contrario y la madre repitió la falsedad en los prompts de las tres hijas, que
  por eso preguntaron si borrar su rastro. Verificado en verde en los tres PR. Corregido.
- **El cierre automático de tareas no cerró nada.** Integrados #472 y #473 por squash, con ramas que
  nombraban su tarea, las dos seguían en `ready` y `backlog` en `main`, y no apareció ningún PR de
  cierre. Se marcaron a mano. Regla barata que queda escrita: **comprobar el `status` en `main`
  después de cada integración**, en vez de confiar en que algo lo cierra o en que estorba.

## 4. Lo que se encoló y no bloquea (§3.1)

- **T-577** — el rojo del arnés todavía no impide integrar; falta que el propietario lo añada a la
  lista de checks obligatorios del servidor.
- **T-578** — un fallo del nocturno no avisa a nadie.
- **T-579** — en el CI el dueño de `perfiles_de_agencia` ya pertenece al rol de la aplicación, así
  que M22 nunca se ejecuta allí; y la pregunta de fondo, **si la topología de roles del CI es la de
  producción**, que afecta a las 23 mutaciones, no solo a M22.

## 5. Para quien siga

El cuello de botella del producto **no es código**: es el despliegue y la lista de chats a excluir
de JD Tours, las dos del propietario (`docs/_contexto/PENDIENTES-DEL-PROPIETARIO.md`). Ninguna
agencia ha visto nada todavía: ese sigue siendo el único número que importa.
