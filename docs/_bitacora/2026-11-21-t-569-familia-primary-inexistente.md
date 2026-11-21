# 2026-11-21 — T-569: la familia `primary` que no existía

**Medición.** Barrido de `apps/web` y `packages/ui` por clases de color cuya familia no está ni en
`@theme` ni en Tailwind. Resultado: una sola familia, `primary`, con **41 usos** (el número de la tarea
era exacto) en tres archivos: `bloque-etapas-pipeline.tsx` (4 clases), `modal-reasignar.tsx` (33) y
`bandeja/[id]/page.tsx` (4). Ninguna otra familia inexistente.

**Decisión.** `primary` → `acento`, tono por tono, sin inventar colores ni añadir una familia nueva:
`acento` ya declara la escala completa (50–950) y es el color de acción del resto de la web. Los usos
(icono en tinte, botón principal, opción seleccionada, punto de selección, anillo de foco) son todos
«acento de marca».

**Qué cambia a la vista.** Antes esos elementos no tenían color propio y heredaban el del contenedor:
el botón principal del modal de reasignar y el de «agregar etapa» salían sin fondo azul, la opción
elegida sin borde ni tinte, el anillo de foco sin color. Ahora se pintan en el azul de acento, con su
variante oscura (`dark:`) que antes tampoco aplicaba.

**Compuerta.** `contraste-de-tokens.spec.ts` gana una prueba: toda familia usada debe ser de Tailwind
o estar en `@theme`. Cierra el segundo criterio de T-569 (familias inexistentes, no solo tonos ausentes).

**Pendiente.** Sin Postgres ni dependencias instaladas en esta sesión no se corrió vitest ni se
tomaron capturas; la lógica de la prueba se verificó con un script equivalente (0 familias
desconocidas tras el cambio).
