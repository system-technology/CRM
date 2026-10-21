# Imagen de la web (Next.js, salida `standalone`). Contexto de build: la RAIZ del monorepo.
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://... -t viajapro-web .

# ---- 1. construir -------------------------------------------------------------------------
FROM node:22.20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Las variables NEXT_PUBLIC_* se incrustan en el JavaScript al CONSTRUIR, no al arrancar:
# cambiarla exige reconstruir la imagen. Sin ella la web apuntaria a localhost, asi que
# el build se niega a seguir.
# Render pasa las variables del servicio como build-arg; hay que declararlas aqui.
ARG NEXT_PUBLIC_API_URL
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "Falta el argumento NEXT_PUBLIC_API_URL" && exit 1)
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "@viajapro/web..." run build

# ---- 2. ejecutar --------------------------------------------------------------------------
FROM node:22.20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
