---
name: modelo-y-esfuerzo
description: Matriz para elegir el modelo de IA y el nivel de esfuerzo de una sesión o subagente de ViajaPro según el tipo de tarea, sin gastar de más ni quedarse corto donde hay dinero, autenticación o aislamiento entre agencias. Úsalo al crear una sesión, al lanzar un subagente o al relanzar una sesión.
---

# Modelo y esfuerzo por tarea

La regla: **modelo y esfuerzo proporcionales al daño de equivocarse**, no al tamaño de la tarea. Los IDs vigentes
están en el contexto del sistema (familia Claude 5: Fable, Opus, Sonnet, Haiku). El esfuerzo solo se fija
cuando el propietario lo ha pedido o lo delega (así ocurrió el 2026-11-21).

| Tarea | Modelo | Esfuerzo | Por qué |
|---|---|---|---|
| Auditoría de seguridad de dinero, autenticación, aislamiento entre agencias, migraciones con RLS | Opus | alto | Aquí se encontraron los hallazgos que importan (carrera del tope de fallos, penalidad sin pagar). No se recorta |
| Escribir lógica de dinero o de permisos (dominio de cobros, guardias) | Opus | medio-alto | El coste de un error es dinero real o una fuga |
| Implementar con especificación clara (API, pantalla, migración ya diseñada) | Sonnet | medio | Código acotado con pruebas |
| Diseño visual y de experiencia (layout, jerarquía, accesibilidad) | Sonnet | alto | Criterio estético; se itera con capturas |
| Docs, cierres de lote, bitácora, reconciliar `tasks.yaml` | Sonnet | bajo-medio | Transcribir y verificar con `gh`/`git` |
| Comprobaciones mecánicas (enlaces, ids repetidos, estado de CI, formato) | Haiku o un script | bajo | No requiere criterio |
| ADR de arquitectura nueva | Opus | alto | Decisión estructural (R7) |
| Investigación externa con fuente | Sonnet | medio | Buscar y citar |

## Reglas
- Un modelo mayor **no** sustituye a una sesión corta: el ahorro viene primero de `ahorro-de-tokens`.
- Empieza en el escalón más bajo que la tabla permita; sube si la primera pasada falla por razonamiento, no
  por falta de contexto (eso se arregla con un brief mejor).
- Una sesión de dinero o autenticación no baja de Opus para la lógica y la auditoría, aunque se relance.
- Anota el modelo y el esfuerzo de cada sesión en el tablero (sección 7) cuando se cree o relance.
- Una sesión en marcha no cambia de modelo desde fuera: solo `/model` dentro de ella, o archivar y relanzar con
  `relevo-de-sesion`.
