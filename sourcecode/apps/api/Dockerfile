FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# deps: full install (incl. dev) + generated Prisma client.
# Used as the dev target (hot reload) and as the base for the prod build.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm --filter @agentpm/api exec prisma generate

# build: compile TypeScript → apps/api/dist
FROM deps AS build
COPY . .
RUN pnpm --filter @agentpm/api build

# prod-deps: production-only node_modules (keeps `prisma` CLI — it's a dependency)
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile --prod

# runner: slim runtime
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build     --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build     --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build     --chown=nodejs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=build     --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
USER nodejs
EXPOSE 3001
CMD ["node", "dist/index.js"]
