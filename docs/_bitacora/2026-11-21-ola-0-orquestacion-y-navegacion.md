# 2026-11-21 — Ola 0: orquestación desatendida, navegación móvil, etiquetas y base de pagos

**Quién:** sesión madre (orquestadora). **Resumen:** un día entero de integración serializada por «ventanas»; el hilo vivo queda en [`ESTADO.md`](../../ESTADO.md) y [`DIARIO.md`](../_contexto/DIARIO.md).

## Qué pasó

- Se publicó el [roadmap maestro](../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) y la [bandeja del propietario](../_contexto/PENDIENTES-DEL-PROPIETARIO.md); una tarea programada despierta a la sesión madre cada dos horas.
- Entraron en `main`, uno por uno: guarda de segunda agencia (#363), barra móvil (#368), cotizar desde el celular (#369), la URL como estado (#371), paleta (#374), etiquetas por agencia (#372, #379, #381), ADR-0034 de pagos (#378), libro de cobro (#382) y etiquetas de los permisos de cobro (#383).
- Cada PR de aislamiento o dinero pasó por `auditor-seguridad` en la sesión de trabajo **y** por una auditoría independiente del orquestador. Ninguna encontró bloqueantes; las dos de migraciones fueron por lectura y las confirmó el job `aislamiento-tenants`.
- Se abrieron sesiones de trabajo para cobros y para diseño y experiencia de usuario; el propietario aclaró que el CRM se usa desde celular, tablet y escritorio.

## Problemas y cómo se resolvieron

- `test` rojo intermitente en #363 por la prueba AP14 (vacía `tenants` mientras corren los e2e): se omite cuando el script es `test` (commit `1aceb01`). Sin verificar que no reaparezca.
- «Carril y tarea» rojo en #382 por tocar `apps/web/src/lib/permisos.ts`: se partió en un PR web previo (#383) con una unión temporal de tipos, sin pedir `override-lane`, que solo pone el propietario.
- Los PR de docs con auto-merge atrasaban a los PR web de su ventana: se les quitó el auto-merge mientras duraba.
- Choques de ids de tarea y de rama entre sesiones: se renumeró tras `git fetch` y se comprobó que `main` no tuviera ids repetidos.

## Decisiones que quedaron

Ver la entrada del 2026-11-21 del diario: autonomía del orquestador, menú y barra móvil, ADR-0031 y ADR-0032 aceptados, ADR-0034 tratado como aceptado, y el uso desde celular, tablet y escritorio.

## Qué queda

- Abiertos: #358 y #362 (esperan `override-lane`), #385, #387 y PR de docs.
- Siguiente: T-330 (API de pagos), reportes por nivel (T-339 a T-346), informe de la sesión de diseño y la ampliación del criterio de salida 9 del roadmap de JD Tours a las tres familias de dispositivo.
- **Sin verificar:** `AP14` en `test`; pantallas nuevas contra la API real fuera del CI; todo sigue sin desplegar.
