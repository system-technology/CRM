#!/usr/bin/env bash
# Se ejecuta una vez al crear el contenedor. No toca la base: eso lo hace `pnpm dev:nube`.
set -euo pipefail

corepack enable
pnpm install --frozen-lockfile
pnpm --filter @viajapro/database generate
pnpm --filter @viajapro/domain build
pnpm --filter @viajapro/contracts build
pnpm --filter @viajapro/database build

echo
echo "Listo. Siguiente paso: pnpm dev:nube"
