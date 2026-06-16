# Stage 1: Build the React client assets
FROM node:20-alpine AS builder
RUN npm install -g pnpm@8.15.7
RUN pnpm config set manage-package-manager-versions false
WORKDIR /app

# Copy root configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy package manifests for workspace installation caching
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source code (cache-busted to ensure changes are copied)
RUN echo "builder-cb-v3"
COPY packages/ ./packages/
COPY apps/ ./apps/

# Build React client static assets
RUN pnpm --filter @fortest/web build

# Stage 2: Runner image
FROM node:20-alpine AS runner
RUN npm install -g pnpm@8.15.7
RUN pnpm config set manage-package-manager-versions false
WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy shared packages
COPY packages/types ./packages/types
COPY packages/utils ./packages/utils

# Copy API backend (cache-busted to ensure package.json dependencies update)
RUN echo "runner-cb-v3"
COPY apps/api ./apps/api

# Copy web manifest and built dist assets
COPY apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Install production dependencies and wire workspace symlinks
RUN pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npx", "tsx", "apps/api/src/server.ts"]
