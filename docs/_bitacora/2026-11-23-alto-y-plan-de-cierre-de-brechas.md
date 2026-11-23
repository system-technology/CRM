# 2026-11-23 — Un alto para cerrar brechas, y una cola que no validaba

**Decisión del propietario:** *«prefiero hacer un alto en este punto y corregir todo que seguir
así»*. Con dos elecciones suyas: **consolidar la memoria a tres artefactos** y **congelar todo**
hasta cerrar las brechas.

---

## Lo que pasó antes del alto

Seis PR detenidos y `main` 32 h sin recibir nada. El diagnóstico no encontró un fallo de producto
sino **tres del plano de control**, y una causa común detrás de los ocho hechos (H1–H8 de
[ADR-0038](../03-adr/0038-marco-de-trabajo-v2-una-via-dos-velocidades.md)):

1. **Una regla sin mecanismo es decoración.** El mecanismo correcto —abrir los PR con la app del
   carril— **existía desde el 2026-10-26** y `MARCO.md` §5 ya lo exigía. Nadie lo usaba.
2. **Una compuerta que no bloquea es peor que ninguna.** `rutas-protegidas` no estaba en los checks
   requeridos: pintaba rojo y dejaba integrar. Durante días se creyó que R11 se cumplía.
3. **El plano de control no tiene camino de arranque.** Las compuertas viven en rutas que ellas
   mismas protegen. El PR que arreglaba el candado estaba dentro del candado.

Destrabado así: los cuatro PR muertos se cerraron y **se reabrieron con la app** (#533, #534, #535,
#536), con lo que el propietario **ya puede aprobarlos**; y el hook pasó a **bloquear**
`gh pr create|merge` fuera de la app (#537, 75/75 pruebas). **El arranque de emergencia que el
propietario había autorizado dejó de hacer falta**: cero excepciones a R11.

---

## El hallazgo del día, y llegó por accidente

Al añadir las tareas del plan con la propia librería del roadmap, el validador se negó:

```
T-599: status inválido undefined
T-599: priority inválida
T-599: sin criterios de aceptación
```

**`T-599` llevaba en `main` truncada a `id` y `title`** (`roadmap/tasks.yaml:12488`). Como
`cerrar-tarea.mjs` valida **la cola entera** antes de tocar nada, **el cierre automático no podía
cerrar ninguna tarea.** Otra vez.

Lo que convierte esto en una lección y no en una anécdota: **es exactamente el fallo que se dio por
arreglado el 2026-11-21.** Aquel día se corrigieron tres filas `blocked` sin motivo y se declaró
resuelto. Se corrigieron **los datos**; la **arquitectura** —un validador que aborta el lote entero
por una fila ajena— no se tocó. **Volvió en 48 horas.**

> **Corregir el dato de un fallo estructural garantiza su vuelta.**

Y una corrección a mí mismo, que toca hacer según las reglas del diario: hace unas horas escribí en
el ADR que «hoy el dato está limpio (39 `blocked`, 0 sin motivo), la arquitectura no». **Era falso.**
Conté una forma de corrupción y di por limpio el resto sin comprobarlo. La fila rota estaba ahí
mientras lo escribía. Queda corregido en el ADR, sin borrar el error: **comprobar una variante y
concluir sobre el conjunto es el mismo vicio que este marco lleva semanas persiguiendo.**

Por eso **T-652 sube a P0**.

---

## Lo entregado

| Qué | Dónde |
|---|---|
| **ADR-0038** — marco v2, «una vía, dos velocidades». Principio rector y cinco pilares | `docs/03-adr/0038-…` |
| **Plan de cierre de brechas** — 5 olas, criterio ejecutable por tarea | `docs/08-roadmap/12-…` |
| **13 tareas** T-647 a T-659 en la cola | `roadmap/tasks.yaml` |
| **T-599 reparada** | `roadmap/tasks.yaml` |

**El principio rector, que es lo único que hay que recordar:** *la vía segura tiene que ser la vía
rápida. Si cumplir cuesta más que rodear, se rodea — y eso no es indisciplina, es diseño
defectuoso.*

**Orden deliberado: seguridad antes que velocidad.** Acelerar con las compuertas aún abiertas sería
acelerar hacia el precipicio. El congelamiento se levanta al terminar la **Ola 2**.

---

## Verificado vs. supuesto

**Verificado hoy:** `origin/main` en `52459b50`; staging vivo por navegador (web 200 en `/ingresar`,
API `/salud/listo` con `rol: viajapro_app` y `aislamiento: forzado`, **tras ~60 s de arranque en
frío**); los checks requeridos son 8 y `rutas-protegidas` no está entre ellos; `T-599` inválida en
`main`; la app Integradora funciona desde esta máquina; el hook bloquea y permite lo que debe.

**Supuesto, sin comprobar:** que el Pilar 1 (tres vías) **reduzca** ceremonia en vez de añadirla. El
propio ADR lo declara una **apuesta** y fija cómo se mide y cuándo se revierte.

**No hecho:** nada de T-648 a T-659. Esperan a que el propietario acepte el ADR (R7).

---

## Lo que depende del propietario

1. **Aceptar ADR-0038.** Sin esto el plan no arranca.
2. **Aprobar los 7 PR abiertos** (#533 a #539). Ningún agente puede: ese es el diseño, y ahora
   funciona.
3. **T-649 exige su cuenta:** `gh-app.mjs` prohíbe a las apps tocar la protección de rama.
