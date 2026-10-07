# ADR-0005 — Rama principal protegida con compuerta de integración

- **Estado:** Aceptado
- **Fecha:** 2026-10-06
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `devops`, `integrador`

---

## Contexto

El proyecto se desarrolla con agentes de IA que producen código mucho más rápido de lo que un
humano puede revisarlo. Eso desplaza el cuello de botella de *escribir* a *verificar*, y crea una
fuerza concreta: **sin una compuerta explícita, entra a la rama principal código que nadie revisó.**

Tres riesgos propios de este proyecto agravan el problema:

1. **Una tabla sin política RLS es una fuga entre agencias.** Es el fallo que mata el producto, y
   es invisible en una revisión apresurada.
2. **Un secreto en el historial no se borra, se rota.** Custodiamos tokens de WhatsApp de terceros.
3. **Las fronteras entre módulos se erosionan por acumulación.** La primera importación cruzada
   «solo esta vez» se convierte en veinte, y entonces [ADR-0004](0004-monolito-modular.md) degenera
   en un monolito sin más.

La versión anterior de las convenciones decía *«trunk-based, `main` siempre desplegable»*. Era una
buena intención **sin ningún mecanismo que la hiciera cumplir**, y por tanto no era una decisión.

## Opciones consideradas

### A — `main` protegida + ramas cortas + agente integrador (elegida)

Una sola rama permanente. El trabajo sale de `main` en ramas de 1-3 días y vuelve exclusivamente
por el agente `integrador`, que ejecuta siete compuertas antes de fusionar con `--no-ff` y etiquetar.

- **Gana:** un único punto de integración; una sola verdad sobre qué hay en producción; compuerta
  con responsable identificable; ceremonia mínima para un equipo de 3-4.
- **Cuesta:** toda integración depende de que el integrador la procese; ramas largas se castigan
  (lo cual es deseable, pero incomoda).
- **Cierra:** agrupar varios cambios en un release estabilizado. Se recupera añadiendo `release/*`
  cuando haga falta.

### B — GitFlow completo: `main` + `develop` + `release/*` + `hotfix/*`

El trabajo integra en `develop`, se estabiliza en `release/x.y.z` y se promueve a `main`.

- **Gana:** control fino sobre qué entra en cada versión; estabilización explícita.
- **Cuesta:** **dos puntos de integración** donde resolver conflictos; la pregunta crónica de qué
  está en *staging* frente a producción; ceremonia diaria desproporcionada para este equipo.
- **Cierra:** la simplicidad. `develop` nació para software que se empaqueta y publica por
  versiones (escritorio, librerías). **Un SaaS multi-tenant tiene una sola versión viva, siempre.**

### C — `main` + `release/*` sin `develop`

Punto medio: el trabajo integra en una `release` viva que se promueve completa.

- **Gana:** agrupa releases sin mantener una rama eterna.
- **Cuesta:** sigue siendo un punto de integración extra que hoy no resuelve ningún problema real.
- **Cierra:** poco. Es la evolución natural de A cuando haga falta.

## Decisión

**Opción A.** Y el elemento que la hace real no es el modelo de ramas, sino **la compuerta con
dueño**: el agente `integrador`.

El modelo de ramas de la opción A y el de un *trunk-based* convencional son casi idénticos. La
diferencia con lo que había antes es que ahora existe un responsable, un procedimiento de siete
etapas, y mecanismos que lo hacen cumplir.

### Mecanismos

| Capa | Qué impide | Fuerza |
|---|---|---|
| `.claude/hooks/guard-rama.mjs` | Commit en `main`; merge o push a `main` sin autorización; reescritura del historial | Barandilla local. **No es seguridad** |
| `.claude/hooks/autorizar-integracion.mjs` | Autorización de un solo uso, 30 minutos, registrada | Deja rastro auditable |
| `.claude/settings.json` (`deny`) | `push --force`, `reset --hard`, `rebase`, `filter-branch` | Permisos de la herramienta |
| Agente `integrador` | Las siete compuertas | Procedimiento |
| CI en GitHub Actions | Las mismas compuertas, en servidor | **Real** |
| Branch protection de GitHub | PR obligatorio, CI en verde, sin force push, incluidos administradores | **Real** |

**Las cuatro primeras capas son disciplina asistida; las dos últimas son la protección de verdad.**
Está dicho así a propósito: una barandilla que se presenta como muro genera falsa confianza.

## Consecuencias

### Positivas
- Ningún cambio llega a `main` sin pasar por tipos, lint, pruebas, build y las verificaciones
  propias del proyecto.
- El historial de `main` es una secuencia de releases etiquetados y revertibles de un golpe
  (gracias a `--no-ff`).
- Hay un responsable identificable de cada integración, y queda registro de por qué se autorizó.
- Las ramas cortas se vuelven la norma porque las largas duelen.

### Negativas
- **El integrador es un cuello de botella.** Con un equipo pequeño es asumible; con más gente hay
  que paralelizarlo o automatizar más compuertas en CI.
- **Hay fricción real.** Es el precio, y es consciente: la alternativa es descubrir en producción
  que una tabla no tenía RLS.
- **La protección local se puede saltar.** No es seguridad hasta que exista la protección de
  servidor. Mientras no haya remoto, esto depende de disciplina.
- Un cambio grande e inevitable (una migración estructural) choca con el límite de tamaño y exige
  negociación explícita con el integrador.

### Qué habría que cambiar para revertir
Nada estructural: es proceso y configuración, no arquitectura. Se desactiva el hook y se cambia el
documento. Precisamente por ser barato de revertir, conviene **no** revertirlo en un momento de prisa.

## Cuándo revisar esta decisión

- **Cuando haya repositorio remoto:** configurar la branch protection de GitHub de inmediato.
  Hasta entonces, esto es media decisión.
- **Cuando haya clientes en producción** y una integración necesite estabilizarse más de un día:
  añadir `release/*` (opción C). Previsiblemente en la Fase 2.
- **Cuando el integrador sea el cuello de botella medible**: automatizar más compuertas en CI en
  lugar de relajar el procedimiento.
- **Si aparece un segundo equipo** que se bloquee con el primero: reconsiderar el modelo completo.
