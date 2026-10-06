# Stage 1: Build the React client assets
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

# Copy root configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy package manifests for workspace installation caching
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/engine/package.json ./packages/engine/
COPY packages/cli/package.json ./packages/cli/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY apps/ ./apps/

# Build React client static assets
RUN pnpm --filter @fortest/web build

# Stage 2: Runner image
FROM node:20-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/kodegrenade/fortest" \
      org.opencontainers.image.description="Fortest: API flow testing app and CLI" \
      org.opencontainers.image.licenses="MIT"
RUN corepack enable
WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy shared packages (types, utils, the engine and the CLI)
COPY packages ./packages

# Copy API backend
COPY apps/api ./apps/api

# Copy web manifest and built dist assets
COPY apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Install production dependencies and wire workspace symlinks
RUN pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=3001
# Listen on the container's own interfaces; who can reach it is decided by the port mapping
# (publish it on 127.0.0.1 only: `-p 127.0.0.1:3001:3001`).
ENV HOST=0.0.0.0

EXPOSE 3001

# `docker run fortest` serves the app; `docker run fortest run /work/bucket.yaml` runs the CLI.
ENTRYPOINT ["apps/api/node_modules/.bin/tsx", "apps/api/src/cli.ts"]
CMD ["serve"]
