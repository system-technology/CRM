# Plan de corrección — auditoría integral 2026-11-15

Fuente: [`docs/_auditorias/2026-11-15-auditoria-integral.md`](../_auditorias/2026-11-15-auditoria-integral.md).
Las tareas viven en `roadmap/tasks.yaml` (T-175 a T-215). Este documento solo fija el **orden** y el
**criterio de salida** de cada ola. Si contradice a `tasks.yaml`, manda `tasks.yaml`.

Encaja con la prioridad vigente (`docs/_contexto/MARCO.md` §6): cerrar H1–H6 y llegar a la demo de
JD Tours. Lo que no sirve a eso va en las olas 5 y 6, antes del piloto, y no bloquea la demo.

| Ola | Objetivo | Tareas | Criterio de salida |
|---|---|---|---|
| 0 | El hilo dice la verdad | T-215 | `ESTADO.md` y `CLAUDE.md` coinciden con `main` |
| 1 | Seguridad inmediata | T-175, T-176 | Ninguna cabecera de desarrollo atiende internet |
| 2 | Demo a JD Tours sin datos falsos | T-177, T-178, T-179, T-180, T-181, T-182, T-183, T-184, T-185, T-186, T-187 | Una familia con niños se cotiza; toda cifra enseñada es real o lleva su salvedad |
| 3 | Cotizador de hotel | T-188, T-189, T-190, T-191, T-192 | Un tarifario de hotel importado cotiza bien por acomodación |
| 4 | Red de pruebas y entorno | T-193 a T-202 | Clon nuevo arranca; e2e de navegador del flujo H1–H6 en CI |
| 5 | Operación antes del piloto | T-203 a T-211 | Alertas, respaldo probado, despliegue que no miente |
| 6 | Cumplimiento y producto antes del piloto | T-212, T-213, T-214 y T-097 (ya existía) | PII cifrada y auditada; derechos del titular; camino a reserva definido |

## Cómo se ejecuta

- Un PR por carril y lote (R11, MARCO §5). Las rutas protegidas (`scripts/`, `.github/`,
  migraciones, `CLAUDE.md`, ADR) van aparte y esperan la aprobación del propietario.
- Una vuelta de revisión por PR (R13); lo que salga de la columna «cola» vuelve a `tasks.yaml`.
- Al cerrar cada ola: relanzar solo las dimensiones de la auditoría que tocó (skill
  `auditoria-integral`, paso 6).

## Primer lote (en curso, 2026-11-15)

PR #256 (carril web): H-3, H-4, la redirección abierta, este plan y la auditoría.
Siguiente: T-177 y T-178 (web), luego T-175 (API y `scripts/`, ruta protegida).
