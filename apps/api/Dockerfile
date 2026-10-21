# Imagen de la API y del trabajador (ADR-0013). Es UNA imagen: comparten codigo y solo difiere
# el comando de arranque, que fija render.yaml:
#   API:         node apps/api/dist/main.js      (CMD por omision)
#   Trabajador:  node dist/worker.js
# Contexto de build: la RAIZ del monorepo.
#   docker build -f apps/api/Dockerfile -t viajapro-api .

# ---- 1. construir -------------------------------------------------------------------------
FROM node:22.20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# `generate` solo lee el esquema, pero Prisma exige que la variable exista (P1012). Sin
# credenciales: nada que filtrar, y no se usa en tiempo de ejecucion.
RUN DATABASE_URL=postgresql://localhost/build DIRECT_URL=postgresql://localhost/build \
    pnpm db:generate
RUN pnpm --filter "@viajapro/api..." run build
# Solo lo de produccion: la API, sus paquetes del monorepo ya construidos y sus dependencias.
RUN pnpm --filter @viajapro/api deploy --prod /out
# `deploy` instala de cero y no trae el cliente de Prisma generado: se copia el del build.
RUN set -e; \
    origen=$(ls -d /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma | head -n1); \
    destino=$(ls -d /out/node_modules/.pnpm/@prisma+client@*/node_modules | head -n1); \
    cp -r "$origen" "$destino/.prisma"

# ---- 2. ejecutar --------------------------------------------------------------------------
FROM node:22.20-bookworm-slim AS runtime
# Prisma necesita openssl en tiempo de ejecucion.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 10000
CMD ["node", "dist/main.js"]
