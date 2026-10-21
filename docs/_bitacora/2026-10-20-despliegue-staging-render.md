# 2026-10-20 — Preparación del despliegue de staging en Render (ADR-0013)

Rama `ci/despliegue-staging-render`. Sin cuentas: ninguna llamada a Render, Neon ni Postmark.

Hecho: `render.yaml` (staging, Ohio, matriz de variables por servicio), `apps/api/Dockerfile`
(una imagen para API y trabajador, que solo difieren en el comando), `apps/web/Dockerfile`
(Next `standalone`, activado por `NEXT_OUTPUT_STANDALONE=1`), `.dockerignore`, ruta `/salud` de la
web, job `imagenes-de-despliegue` en `ci.yml`, workflow `deploy-staging.yml` y la guía
`docs/07-ingenieria/despliegue-staging.md`.

Verificado contra la documentación de Render (investigador). Verificar al sincronizar: `dockerCommand` en un worker (inferido) e `ipAllowList: []` en el Key Value. Imágenes no probadas
localmente (sin Docker): las valida el CI.

Cola: `API_INTERNAL_URL` retirada del blueprint: se añade con la reescritura ADR-0011 §2;
el trabajador sigue sin sonda de salud propia; la sonda del workflow no distingue SHA nuevo de viejo.
