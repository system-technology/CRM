#!/usr/bin/env bash
# Prepara la base del modo `unico` en local. Corre dentro de la imagen `build` de apps/api/Dockerfile
# (tiene pnpm, tsx y todo el monorepo). Idempotente: se ejecuta en cada `up`.
#
# Secuencia real (docs/_bitacora/2026-11-04-auditoria-de-veracidad.md, scripts/dev-nube.mjs):
#   db:migrate:deploy -> roles:dev -> db:seed -> identidad:sembrar-dev
#
#   bash /preparar.sh          la secuencia completa
#   bash /preparar.sh canal    ademas liga el numero de prueba de Meta a la agencia demo
set -euo pipefail
cd /app

# Los scripts de pnpm cargan ../../.env con dotenv; las variables del compose mandan, pero el
# archivo debe existir. Vacio: nada que filtrar (R6).
: > /app/.env

echo "== 1/4 migraciones"
pnpm db:migrate:deploy
echo "== 2/4 roles de aplicacion (contrasenas de desarrollo)"
pnpm --filter @viajapro/database run roles:dev > /dev/null
echo "== 3/4 semilla (agencia demo)"
pnpm db:seed
echo "== 4/4 identidades de la semilla"
pnpm --filter @viajapro/api identidad:sembrar-dev

if [ "${1:-}" = "canal" ]; then
  echo "== canal de prueba de WhatsApp"
  pnpm --filter @viajapro/api canal:registrar-prueba
fi

echo "== base lista"
