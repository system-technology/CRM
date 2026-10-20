# 2026-10-19 — Decisiones del propietario: ADR-0010, ADR-0011 y R2

El propietario respondió en su propia sesión de trabajo, el 2026-10-19, a tres preguntas
cerradas. Sus respuestas, literales:

| Pregunta | Respuesta |
|---|---|
| ¿Aceptas el ADR-0011 de autenticación (Better Auth en la API, identidad en nuestra base, sesión por cookie, roles por agencia en tabla)? | «Acepto» |
| ¿Autorizas cambiar R2 de `CLAUDE.md` para incluir `viajapro_identidad` y `viajapro_accesos`? | «Sí, actualiza R2» |
| ¿Ratificas el ADR-0010 y la línea del mapa de `CLAUDE.md` §5 sobre `apps/worker`? | «Ratifico los dos» |

## Qué cambió por esto

- **ADR-0010:** pasa de «aceptado en modo desatendido, pendiente de ratificar» a ratificado.
- **ADR-0011:** pasa a Aceptado. Antes de llegar al propietario, `auditor-seguridad` lo revisó
  dos veces y en la segunda cerró los dos bloqueantes: la baja que sobrevivía en el socket y la
  superficie sin definir de `viajapro_identidad`.
- **`CLAUDE.md` R2:** de tres a cuatro roles de aplicación, más `viajapro_accesos` (`NOLOGIN`).
  Cada proceso sigue abortando al arrancar si su rol no es el esperado.
- **`CLAUDE.md` §5:** `apps/worker` aparece vacío, porque el consumidor del inbox vive en
  `apps/api` (ADR-0010).

## Qué sigue

Las rebanadas del ADR-0011, en orden:

1. Esquema, roles y aserciones, a cargo de `datos`. Incluye `pg_auth_members` y el par `OLD` del
   disparador.
2. Módulo `identity`, guardias, 403 de margen y revalidación del socket con los pasos 3 y 4, a
   cargo de `backend`.
3. Pantalla de ingreso y selector de agencia, a cargo de Antigravity.
4. Invitaciones y código por correo.
