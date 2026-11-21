# 2026-11-21 — T-542: la compuerta que cierra tareas llevaba rota y nadie lo vio

Sesión corta, carril `i`, sobre `main` en `98b303e2`.

## Qué pasaba

El job «Marcar la tarea como hecha» (`cerrar-tarea.yml` → `scripts/cerrar-tarea.mjs`) fallaba tras cada
merge. No bloquea ningún PR (corre después del merge y no está entre los 14 checks), así que nadie lo veía.
Nada en el CI valida `roadmap/tasks.yaml` antes del merge: por eso se colaron los valores inválidos.

Dos causas distintas:

1. **Mecánica — corregida en este PR.** 18 tareas con `type` o `effort` fuera del enum del validador
   (19 campos). Se corrigieron con un script acotado por tarea (no regex sobre el fichero entero) y se
   comprobó contra `main` que solo cambian esos 19 campos y que no cambia ni un id, título, prioridad o
   estado. Equivalencias elegidas: `fix`→`bug`; `chore`→`refactor` (T-508, T-513, T-514, T-515, T-524,
   T-527, T-530, T-534); `chore`→`infra` en T-526 (es una variable del job de CI); `devops`→`infra`
   (T-383); `perf`→`refactor` (T-507); `XS`→`S` (T-499, T-526, T-536; el enum no tiene `XS`).
2. **De criterio — propuesta, NO aplicada.** 20 tareas `in_progress` frente a una permitida. Ver
   [`docs/_contexto/TRIAJE-IN-PROGRESS.md`](../_contexto/TRIAJE-IN-PROGRESS.md): 13 `done`, 5 `backlog`,
   1 `blocked`, 1 `dropped`, cada una con su evidencia.

## Resultado medido

- Solo con la causa 1: `validate` pasa de 20 errores a **1** (las `in_progress`). `cerrar-tarea.mjs` **sigue
  saliendo 1** al cerrar una tarea abierta (probado con T-536); sale 0 si la tarea ya estaba `done`
  (idempotente), así que el rojo solo desaparece cuando se apliquen las 20.
- Con la propuesta del triaje aplicada sobre una copia: `validate` da 0 errores y un cierre simulado también.

## Hallazgos que no son de este PR

- **Nada valida `tasks.yaml` en el CI antes del merge.** Anotado como T-553 (`.github/` es del propietario).
- `tasks.yaml` tiene **claves duplicadas** en T-424 (`source`, `created_at`, mismo valor). `load()` las
  tolera (`parseDocument` sin mirar `doc.errors`); un parser estricto rechaza el fichero. No se tocó: no es
  una de las 18. Incluido en T-553.
- `ESTADO.md:174` pone el historial de T-250 en «Lo que NO existe» y ya está en `main`.

## Pendiente

Aprobación del propietario de las 20 propuestas y su aplicación; T-542 sigue abierta hasta que una corrida
de `cerrar-tarea.yml` salga en verde.
