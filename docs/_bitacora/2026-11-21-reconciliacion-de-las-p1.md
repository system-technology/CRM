# 2026-11-21 — Reconciliación de las 74 tareas P1 abiertas contra el código

**Por qué.** `roadmap/tasks.yaml` tenía 74 tareas P1 abiertas y varias mentían (T-137, T-139 y T-140
pedían cosas que ya existen en `packages/contracts/src/reportes.ts`). Una cola donde todo es P1 no sirve
para decidir. Esta sesión (carril `i`) leyó el código de `main` (`7a0ac37`) tarea por tarea y no tocó
`apps/` ni `packages/`.

**Resultado.** De 74 P1 abiertas: **8 hechas** (`done`, con la línea de evidencia en `acceptance`),
**21 a medias** (título y criterios reescritos a lo que falta), **9 intactas con P1 confirmado**, **36
intactas bajadas a P2** y **0 canceladas**. **Quedan 17 P1 abiertas.** No se borró nada: 545 tareas antes
y después, sin ids repetidos. `status` solo admite `dropped`, no `cancelled`.

| Grupo | Tareas |
|---|---|
| Hechas | T-122, T-124, T-141, T-330, T-342, T-373, T-374, T-543 |
| A medias, siguen P1 | T-083, T-090, T-245, T-332, T-340, T-346, T-372, T-378 |
| A medias, bajadas a P2 | T-085, T-086, T-125, T-137, T-139, T-140, T-151, T-226, T-440, T-441, T-443, T-444, T-448 |
| Intactas, P1 confirmado | T-078, T-097, T-098, T-239, T-334, T-335, T-336, T-533, T-563 |
| Intactas, bajadas a P2 | T-084, T-138, T-143, T-144, T-152 a T-166, T-267, T-270, T-271, T-272, T-276, T-279, T-280, T-361, T-442, T-445, T-446, T-449 a T-454 |

**P1 que quedan (17):** T-078, T-083, T-090, T-097, T-098, T-239, T-245, T-332, T-334, T-335, T-336,
T-340, T-346, T-372, T-378, T-533 y T-563.

**Criterio de la bajada.** P1 = bloquea algo hoy o es una afirmación falsa sobre aislamiento o seguridad.
El multiidioma está congelado hasta cerrar la Ola 1 (`docs/08-roadmap/09-…`), el registro autoservicio es
de la Ola 4, y el diseño de olas 2 a 4 no lo espera nadie. T-270 y T-280 estaban `blocked` por «espera
T-268», que ya está hecha: pasan a `backlog`. T-332 y T-346 pasan a `ready` por la misma razón.

**Hallazgos fuera de las P1 (no se tocaron: no son P1 abiertas).**
- T-131 y T-132 (P0, `backlog`) ya están en el código: migraciones `20261104150000` y `20261104160000` y
  reportes anclados al cambio a ACEPTADA. Hay que cerrarlas con evidencia.
- El arnés `mutaciones-aislamiento.mjs` no corre en ningún job del CI y T-377 (decidir si debe) es P3,
  mientras T-245, T-372 y T-407 dependen de que corra.
- `.github/proteccion-main.json` difiere del servidor en tres campos (T-083): reaplicarlo apagaría la
  revisión de code owners.

**Sin verificar.** Los SHA de las acciones de `.github/workflows/` contra sus etiquetas oficiales (T-086:
sin acceso a esos repositorios); nada se miró en un navegador; las e2e de la API no se corrieron en local.
