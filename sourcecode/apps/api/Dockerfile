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

# runner: production runtime. pnpm keeps app deps + the generated Prisma client in
# the per-package node_modules (a symlink farm into the root .pnpm store), NOT
# hoisted to the root node_modules — so copy the whole resolved tree from `build`
# to keep every symlink valid at runtime. (Can be slimmed later with `pnpm deploy`.)
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=build --chown=nodejs:nodejs /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages ./packages
COPY --from=build --chown=nodejs:nodejs /app/apps/api ./apps/api
WORKDIR /app/apps/api
USER nodejs
EXPOSE 3001
CMD ["node", "dist/index.js"]
