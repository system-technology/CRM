# Hallazgos funcionales T-126 (2026-11-05) — recorrido NO ejecutado

Pasada de solo observacion, datos sinteticos de la agencia demo. **No se pudo levantar el sistema**:
no hay un camino que respete las restricciones (no leer/escribir `.env`, no `psql`, no tocar Neon). Nada
de lo de abajo se probo; la columna «resultado» es «no ejecutado», no «ok».

## Por que no se levanto

| Requisito | Estado verificado | Falta |
|---|---|---|
| Docker + Compose v2 (`pnpm infra:unico:up`, runbook §1) | `docker` no existe en el PATH de esta maquina | Instalar Docker Desktop, o aprobar una via sin Docker (abajo) |
| Postgres 16 | Solo hay Postgres **18** (`C:\Program Files\PostgreSQL\18`), escuchando en `0.0.0.0:5432` (PID 7012). El runbook y el compose suponen 16 y puerto 5433 | Confirmar que 18 sirve para ADR-0003/RLS, y credenciales de su superusuario |
| Credenciales de esa Postgres | Solo estan, si acaso, en `.env` del propietario (no se lee) | El propietario debe dar usuario/clave de un superusuario local, **o** autorizar un cluster nuevo con `initdb` en otro puerto |
| Variables del proceso `unico` | `.env` existe en la raiz. Los scripts de siembra (`db:seed`, `roles:dev`, `identidad:sembrar-dev`) cargan `.env` con dotenv: lo que no se defina a mano caeria a lo que haya en `.env`, que **puede apuntar a Neon** | Definir por entorno, en la sesion: `MODO_DESPLIEGUE=unico`, `APP_ENV=local`, `DATABASE_URL`, `DATABASE_APP_URL`, `DATABASE_ALTAS_URL`, `DATABASE_WEBHOOK_URL` (con `connection_limit>=2`), `DATABASE_IDENTIDAD_URL`, `META_APP_SECRET`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, claves de cifrado/sesion; sin `REDIS_URL`. Y una garantia de que ningun script lea el `.env` real (p. ej. un `.env` aislado) |
| Herramientas `mcp__navegador__*` | No estan disponibles en esta sesion de agente (solo Read/Grep/Glob/Write/Edit/Bash) | Que el recorrido en navegador lo haga un agente/sesion que si las tenga |
| Web con sesion real | El runbook (§1) ya avisa que `apps/web/Dockerfile` no declara `ARG NEXT_PUBLIC_USE_REAL_AUTH`: la web arranca en maqueta hasta el PR `b/T-000-web-dockerfile-auth-real` | Integrar ese PR; sin el, el paso «login» solo podra darse como «maqueta» |

Riesgo a vigilar (no es una prueba, es lectura del runbook): ejecutar scripts de siembra con variables
a medias es la forma mas facil de sembrar datos demo en Neon.

## Tabla de pasos

| Paso | Resultado | Evidencia | Severidad |
|---|---|---|---|
| 0. Levantar stack en modo `unico` | no ejecutado | `docker: command not found`; Postgres 18 sin credenciales disponibles | bloqueante (para T-126) |
| 1. Login `dueno@agenciademo.test` | no ejecutado; **maqueta esperada** hasta que entre `web-dockerfile-auth-real` (runbook §1) | Runbook §1, no observado | bloqueante (para T-126) |
| 2. Mensaje WhatsApp firmado (`firmar-webhook-whatsapp.mjs`) | no ejecutado | Requiere API viva y `preparar.sh canal` | bloqueante (para T-126) |
| 3. Verlo en la bandeja | no ejecutado | — | — |
| 4. Responder | no ejecutado; sin Graph falso el saliente queda `FALLIDO` (esperado, runbook §4) | — | — |
| 5. Crear contacto/oportunidad | no ejecutado | — | — |
| 6. Cotizar desde catalogo | no ejecutado | — | — |
| 7. Enviar cotizacion | no ejecutado | — | — |
| 8. Reportes | no ejecutado | — | — |

Ningun hallazgo funcional del producto: no se observo el producto.

## Para desbloquear (decision del propietario, una de dos)

1. Instalar Docker Desktop y correr `pnpm infra:unico:up` (camino documentado; genera `.env.unico`, no
   toca `.env`). Es lo que el runbook §8 dice que nadie ha ejecutado aun: la primera corrida es tambien
   la prueba del propio compose.
2. Autorizar un cluster Postgres local nuevo (`initdb` con `trust` en un puerto libre, p. ej. 5434) con
   variables definidas por entorno y un `.env` aislado, y que el agente que lo corra tenga las
   herramientas de navegador.
