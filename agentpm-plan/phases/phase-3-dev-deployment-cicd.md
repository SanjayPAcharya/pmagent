# Phase 3 — Containerized Deployment for Dev/Prod with CI/CD

> **Goal:** Get the Phase 1 skeleton deploying automatically. **The app runs in Docker — the same images in dev and prod.** Primary target: **Docker Compose on a VM** (cheapest, full parity). **Where data lives is a one-flag toggle (`selfhost-data` profile): production defaults to managed cloud Postgres + Redis (RDS + ElastiCache); local dev and cost-sensitive staging run them as containers on the box.** AWS ECS Fargate is a documented scale-up alternative at the end of this file. Wire a GitHub Actions pipeline that lint/test → builds images → runs migrations → redeploys.

**Depends on:** Phase 1 — which already produced a working **local** container stack: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml` (base), `docker-compose.override.yml` (dev), the Postgres init script, and the local Keycloak + committed realm. Phase 3 does **not** recreate these — it adds the **prod/deploy layer** on top (prod compose overlay, Caddy/TLS, managed data, the VM, registry images, CI/CD). So the moment Phase 1 is green (`docker compose up` runs end-to-end locally), Phase 3 has everything it needs to start.

**References:**
- **[12-docker-and-deployment.md](../references/12-docker-and-deployment.md) — the canonical container topology, Dockerfiles, Compose files, Caddy. Read this first; this phase is the *process* around it.**
- [01-tech-stack.md](../references/01-tech-stack.md) — Principle 6 (containerized, lean, scale up deliberately)
- [02-repository-structure.md](../references/02-repository-structure.md) — `infra/` and `.github/workflows/` layout
- [05-environment-secrets.md](../references/05-environment-secrets.md) — runtime config + secrets handling
- [08-monitoring.md](../references/08-monitoring.md) — alarms/metrics (CloudWatch on the ECS path; container logs + uptime checks on the VM path)
- [09-cost-estimates.md](../references/09-cost-estimates.md) — Compose-on-VM vs ECS cost

---

## Deliverables (primary path — Docker Compose on a VM)

> **Already exist from Phase 1 (verify, don't recreate):** `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml` (base), `docker-compose.override.yml` (dev), Postgres init script, local Keycloak realm. Confirm the prod **target** of each Dockerfile builds cleanly (see the build-correctness note under the Dockerfile below).

New in Phase 3:
- [ ] `docker-compose.prod.yml` (built images by `${IMAGE_TAG}` + Caddy/TLS + restart policies)
- [ ] Caddy reverse proxy config (auto-HTTPS, routes web/api/keycloak)
- [ ] `Makefile` with `up-managed` / `up-selfhost` targets (see [12-docker-and-deployment.md](../references/12-docker-and-deployment.md))
- [ ] **Provision managed data (prod): RDS PostgreSQL (enable `pgvector`) + ElastiCache Redis**; create the `agentpm` + `keycloak` databases; lock security groups to the VM only
- [ ] Production Keycloak: deploy the committed realm with Google/Microsoft/GitHub IdPs wired to **production** OAuth credentials + redirect URIs (the realm JSON itself was committed in Phase 1)
- [ ] Provision the VM (Docker + Compose installed); DNS for `agentpm.io` / `api.` / `auth.`
- [ ] Prod `.env` on the VM with managed `DATABASE_URL` / `REDIS_URL` / `KC_DB_URL` (locked-down perms, never committed)
- [ ] Containerized migration step (`docker compose run --rm api pnpm prisma migrate deploy` → runs against managed RDS; requires the Prisma CLI in the runtime image — see note)
- [ ] GitHub Actions CI (lint, typecheck, test against Postgres+Redis service containers; mocked token verification — see note)
- [ ] GitHub Actions CD (build + push images to a registry → SSH/pull on the VM → migrate → `compose up -d`)
- [ ] Deploy to a staging environment end-to-end
- [ ] Production hardening checklist (pinned tags, healthchecks, backups, log rotation — see [12](../references/12-docker-and-deployment.md))

> The AWS-specific deliverables (CDK stacks, Secrets Manager, CloudWatch alarms, ECR/ECS) apply only to the **scale-up alternative** at the bottom of this file — skip them on the Compose path.

---

## Primary deploy: Docker Compose on a VM

The full topology, every Dockerfile, the three Compose files, the Caddyfile, the migration command, and the prod hardening checklist live in **[12-docker-and-deployment.md](../references/12-docker-and-deployment.md)**. This phase adds the *process* around them:

**Dev (parity + hot reload):**
```bash
cp .env.example .env          # local/dummy values
docker compose up             # postgres+redis+keycloak as containers; api+web hot-reload via bind mounts
```

**Prod (on the VM):**
```bash
# CI has already built + pushed pinned images (api, web). On the host:
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose run --rm api pnpm prisma migrate deploy      # migrate first
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d   # Caddy + all services
```

**Data placement is a one-flag toggle** (`selfhost-data` Compose profile, see [12-docker-and-deployment.md](../references/12-docker-and-deployment.md)): production deploys with managed RDS/ElastiCache (`make up-managed`), while a cost-sensitive dev/staging VM can run Postgres+Redis as containers (`make up-selfhost`, ~$30/mo cheaper). Same images and deploy flow — only the flag + env file change.

**CI/CD (GitHub Actions):** lint/test (below) → build the `api` and `web` images (the web image takes the env's `VITE_*` as build args) → push to a registry (GHCR or ECR) → connect to the VM (SSH or an agent) → `pull`, run the migration container, `compose up -d`. Use pinned image tags (commit SHA), not `:latest`.

---

## CI/CD pipeline — primary (Compose on VM)

File: `.github/workflows/ci.yml`

```yaml
name: CI/CD
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  lint-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env: { POSTGRES_DB: agentpm_test, POSTGRES_PASSWORD: test }
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/agentpm_test
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck
      - run: pnpm turbo db:migrate:test --filter=api
      - run: pnpm turbo test

  deploy:
    runs-on: ubuntu-latest
    needs: [lint-test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    env:
      REGISTRY: ghcr.io/${{ github.repository_owner }}   # MUST match ${REGISTRY} in the compose files
      IMAGE_TAG: ${{ github.sha }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3      # GHCR (or ECR)
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build + push API image
        run: |
          docker build -t $REGISTRY/agentpm-api:$IMAGE_TAG -f apps/api/Dockerfile .
          docker push $REGISTRY/agentpm-api:$IMAGE_TAG

      - name: Build + push Web image (VITE_* baked in at build time)
        run: |
          docker build -t $REGISTRY/agentpm-web:$IMAGE_TAG -f apps/web/Dockerfile \
            --build-arg VITE_API_URL=https://api.agentpm.io \
            --build-arg VITE_WS_URL=wss://api.agentpm.io \
            --build-arg VITE_KEYCLOAK_URL=https://auth.agentpm.io \
            --build-arg VITE_KEYCLOAK_REALM=agentpm \
            --build-arg VITE_KEYCLOAK_CLIENT=agentpm-web .
          docker push $REGISTRY/agentpm-web:$IMAGE_TAG

      - name: Deploy to the VM over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          envs: REGISTRY,IMAGE_TAG          # pass the exact registry + SHA to the VM
          script: |
            cd /opt/agentpm
            export REGISTRY IMAGE_TAG
            docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
            docker compose run --rm api pnpm prisma migrate deploy   # migrate first
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> The image names (`$REGISTRY/agentpm-api`, `$REGISTRY/agentpm-web`) and `IMAGE_TAG` here **must match** the `image:` keys in the base compose (`${REGISTRY}/agentpm-api:${IMAGE_TAG}`), so the VM's `pull` fetches exactly the SHA CI built. Keep the prod `.env` (with real secrets) on the VM with locked-down permissions — never in the repo or the image.

> **Auth in tests (no Keycloak in CI):** the CI `services` are only Postgres + Redis — there is no Keycloak to mint tokens. Don't stand one up. Instead, in the test setup generate a throwaway **RSA keypair**, sign test JWTs with the expected `iss`/`aud`/`sub`, and point the API's JWKS verifier at a **static local JWKS** (e.g. set `KEYCLOAK_ISSUER_URL` to a local fixture server, or inject a test `getJwks`). This keeps the real verification path under test while staying hermetic. The auth-middleware cases in [07-testing-strategy.md](../references/07-testing-strategy.md) (expired/tampered/wrong-aud/wrong-iss + JIT provisioning) are written against exactly this setup.

## API Dockerfile (used by both paths — API image + agent worker)

File: `apps/api/Dockerfile`

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── build: FULL deps (incl. dev) — needed to compile TS, run turbo + prisma generate ──
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter api exec prisma generate     # generate the client into node_modules/.prisma
RUN pnpm turbo build --filter=api

# ── prod-deps: production-only modules for the runtime image ──
# NOTE: keep `prisma` (the CLI) in "dependencies" (not devDependencies) so the
# runtime image can run `prisma migrate deploy` on deploy. `@prisma/client` is
# already a runtime dep. Without this the migration step fails (CLI missing).
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile --prod

# ── runner: slim runtime ──
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build     --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma  # generated client
COPY --from=build     --chown=nodejs:nodejs /app/apps/api/dist ./dist
COPY --from=build     --chown=nodejs:nodejs /app/apps/api/prisma ./prisma   # schema + migrations
USER nodejs
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

Why the split: the **build** stage installs *all* deps (TypeScript/turbo/prisma CLI) to compile and generate the client; the **runner** ships only production deps + the build output. Two things the slim image must still contain for `docker compose run --rm api pnpm prisma migrate deploy` to work: the **Prisma CLI** (kept in `dependencies`, not dev) and the **`prisma/` migrations folder** (copied above).

The **web** Dockerfile (nginx) and all three Compose files live in [12-docker-and-deployment.md](../references/12-docker-and-deployment.md). The **agent worker** (Phase 4) reuses this same API image with `command: ["node", "dist/worker.js"]`.

## Definition of Done (primary path)

- `docker compose up` brings up the whole stack locally (postgres, redis, keycloak as containers; api + web hot-reloading) — full dev/prod parity, only Docker required.
- In prod (managed mode, the default — `make up-managed`), **no Postgres/Redis container runs** — the app connects to managed RDS + ElastiCache; killing/recreating the VM loses no data. The `selfhost-data` profile (`make up-selfhost`) is available for cheap dev/staging.
- A push to `main` runs CI, builds + pushes pinned `api`/`web` images, and deploys to the VM: pull → migrate (against managed RDS) → `compose up -d` — no manual steps.
- The app is reachable over HTTPS via Caddy at the staging domain; `auth.` serves Keycloak, `api.` serves the API.
- The production hardening checklist in [12-docker-and-deployment.md](../references/12-docker-and-deployment.md) is satisfied (incl. managed-DB encryption/backups/locked SGs).

---

# Alternative (scale-up): AWS ECS Fargate

> Everything below is **optional** — the managed, horizontally-scalable path for when Compose-on-VM is outgrown. The **same Docker images** run here; only the orchestration changes. Skip this entire section on the Compose path. The original cost-trimmed AWS footprint (region `ap-south-1`, zero NAT gateways, single ALB, single-task services) is preserved here for reference.

## Network stack

File: `infra/lib/network-stack.ts`

```typescript
import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly dbSecurityGroup: ec2.SecurityGroup
  public readonly appSecurityGroup: ec2.SecurityGroup
  public readonly agentSecurityGroup: ec2.SecurityGroup

  constructor(scope: cdk.App, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    // ── MVP: zero NAT gateways to eliminate the ~$33/mo fixed cost ──
    // App + agent tasks run in PUBLIC subnets with assignPublicIp so they can
    // reach ECR, Anthropic, GitHub, etc. directly (no NAT). DB stays isolated.
    // S3 traffic uses the free S3 Gateway Endpoint (added below).
    // For HA later: set natGateways: 1, move app tier to PRIVATE_WITH_EGRESS,
    // or add VPC interface endpoints (~$7.30/mo each).
    this.vpc = new ec2.Vpc(this, 'AgentPMVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { cidrMask: 24, name: 'Public', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 28, name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED }
      ]
    })

    // Free S3 Gateway Endpoint — keeps S3 traffic off the public path at no cost
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3
    })

    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSG', {
      vpc: this.vpc, description: 'Allow PostgreSQL from app only'
    })

    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSG', {
      vpc: this.vpc, description: 'App tier'
    })
    this.appSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80))
    this.appSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443))

    this.dbSecurityGroup.addIngressRule(this.appSecurityGroup, ec2.Port.tcp(5432))

    this.agentSecurityGroup = new ec2.SecurityGroup(this, 'AgentSG', {
      vpc: this.vpc, description: 'Agent Fargate tasks'
    })
    this.dbSecurityGroup.addIngressRule(this.agentSecurityGroup, ec2.Port.tcp(5432))
  }
}
```

## Database stack

File: `infra/lib/database-stack.ts`

```typescript
import * as rds from 'aws-cdk-lib/aws-rds'
import * as elasticache from 'aws-cdk-lib/aws-elasticache'

export class DatabaseStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance
  public readonly redisCluster: elasticache.CfnReplicationGroup

  constructor(scope, id, props: { vpc, dbSG, appSG }) {
    super(scope, id)

    this.dbInstance = new rds.DatabaseInstance(this, 'AgentPMDb', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15_4 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), // MVP micro ~$15/mo
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.dbSG],
      databaseName: 'agentpm',
      credentials: rds.Credentials.fromGeneratedSecret('agentpm-db'),
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      enablePerformanceInsights: true,
      storageEncrypted: true,
      allocatedStorage: 20,
      maxAllocatedStorage: 200,
      multiAz: false,             // set true for prod HA
      parameterGroup: new rds.ParameterGroup(this, 'DbParams', {
        engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15_4 }),
        parameters: {
          'shared_preload_libraries': 'pg_stat_statements,vector',
          'log_min_duration_statement': '1000',
          'max_connections': '200'
        }
      })
    })

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Redis subnet group',
      subnetIds: props.vpc.isolatedSubnets.map(s => s.subnetId)
    })

    this.redisCluster = new elasticache.CfnReplicationGroup(this, 'AgentPMRedis', {
      replicationGroupDescription: 'AgentPM Redis',
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      engineVersion: '7.0',
      numCacheClusters: 1,          // 2 for HA
      automaticFailoverEnabled: false,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [props.appSG.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true
    })
  }
}
```

## Compute stack (ECS + Fargate)

Same containers as the Compose path — `agentpm-api`, `agentpm-web` (nginx), and `keycloak` — each as a Fargate service behind **one shared ALB** that does host-based routing (`agentpm.io` → web, `api.` → api, `auth.` → keycloak). This mirrors the Caddy routing on the VM path exactly; only the orchestrator changes. **No S3/CloudFront for the SPA** — the web nginx container is the origin. Data stays managed (RDS + ElastiCache from the Database stack).

File: `infra/lib/compute-stack.ts`

```typescript
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as logs from 'aws-cdk-lib/aws-logs'

export class ComputeStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id)

    const cluster = new ecs.Cluster(this, 'AgentPMCluster', {
      vpc: props.vpc, containerInsights: true, clusterName: 'agentpm'
    })

    // Same images as the Compose path, pushed to ECR by CI (see AWS CI/CD below).
    const apiRepo = new ecr.Repository(this, 'ApiRepo', { repositoryName: 'agentpm-api' })
    const webRepo = new ecr.Repository(this, 'WebRepo', { repositoryName: 'agentpm-web' })

    const sm = (id: string, name: string) =>
      ecs.Secret.fromSecretsManager(secretsmanager.Secret.fromSecretNameV2(this, id, name))

    // ── One shared ALB (HTTPS) with host-based routing — mirrors the Caddyfile ──
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc, internetFacing: true, securityGroup: props.appSG
    })
    alb.addListener('Http', {           // redirect 80 → 443
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({ protocol: 'HTTPS', port: '443', permanent: true })
    })
    const https = alb.addListener('Https', {
      port: 443,
      certificates: [elbv2.ListenerCertificate.fromArn(process.env.ACM_CERT_ARN!)],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, { messageBody: 'Not found' })
    })

    // Helper: a Fargate service + target group + host rule on the shared listener.
    const tag = process.env.IMAGE_TAG || 'latest'
    const makeService = (
      name: string, repo: ecr.IRepository, port: number, host: string, priority: number,
      opts: { cpu: number; mem: number; environment?: Record<string,string>; secrets?: Record<string, ecs.Secret>; health?: string }
    ) => {
      const taskDef = new ecs.FargateTaskDefinition(this, `${name}Task`, { cpu: opts.cpu, memoryLimitMiB: opts.mem })
      taskDef.addContainer(name, {
        image: ecs.ContainerImage.fromEcrRepository(repo, tag),
        portMappings: [{ containerPort: port }],
        environment: opts.environment,
        secrets: opts.secrets,
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: name, logRetention: logs.RetentionDays.ONE_MONTH })
      })
      const svc = new ecs.FargateService(this, `${name}Svc`, {
        cluster, taskDefinition: taskDef, desiredCount: 1,
        assignPublicIp: true, vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        securityGroups: [props.appSG]
      })
      https.addTargets(`${name}Tg`, {
        port, targets: [svc], priority,
        conditions: [elbv2.ListenerCondition.hostHeaders([host])],
        healthCheck: { path: opts.health ?? '/', healthyHttpCodes: '200-399' }
      })
      return svc
    }

    // ── web (nginx serving the SPA) — the SPA origin, no S3/CloudFront ──
    makeService('web', webRepo, 80, 'agentpm.io', 10, { cpu: 256, mem: 512, health: '/healthz' })

    // ── api (Fastify) ──
    makeService('api', apiRepo, 3001, 'api.agentpm.io', 20, {
      cpu: 512, mem: 1024, health: '/health',
      environment: {
        NODE_ENV: 'production', PORT: '3001',
        // Keycloak verification config is non-secret (plain env, not Secrets Manager)
        KEYCLOAK_ISSUER_URL: 'https://auth.agentpm.io/realms/agentpm',
        KEYCLOAK_API_AUDIENCE: 'agentpm-api',
      },
      secrets: {
        DATABASE_URL: sm('DbUrl', 'agentpm/DATABASE_URL'),       // managed RDS
        REDIS_URL: sm('RedisUrl', 'agentpm/REDIS_URL'),          // managed ElastiCache
        ANTHROPIC_API_KEY: sm('AnthropicKey', 'agentpm/ANTHROPIC_API_KEY'),
      }
    })

    // ── keycloak (same container image as the Compose path) ──
    makeService('keycloak', /* keycloakRepo or quay image via ECR pull-through */ apiRepo, 8080, 'auth.agentpm.io', 30, {
      cpu: 512, mem: 1024, health: '/realms/agentpm',
      environment: {
        KC_DB: 'postgres', KC_HOSTNAME: 'auth.agentpm.io',
        KC_PROXY_HEADERS: 'xforwarded', KC_HTTP_ENABLED: 'true',
      },
      secrets: {
        KC_DB_URL: sm('KcDbUrl', 'agentpm/KC_DB_URL'),           // managed RDS (keycloak DB)
        KC_DB_USERNAME: sm('KcDbUser', 'agentpm/KC_DB_USERNAME'),
        KC_DB_PASSWORD: sm('KcDbPass', 'agentpm/KC_DB_PASSWORD'),
      }
    })

    this.albDnsName = alb.loadBalancerDnsName   // consumed by the DNS/TLS stack below

    // MVP: no auto-scaling. Re-enable per service with paying users:
    //   const s = api.autoScaleTaskCount({ maxCapacity: 10 })
    //   s.scaleOnCpuUtilization('CpuScale', { targetUtilizationPercent: 70 })

    // ── Agent Worker (Phase 4) ────────────────────────────
    // A separate Fargate service (no ALB target — it only consumes the BullMQ
    // queue), reusing the agentpm-api image with `command: ["node","dist/worker.js"]`
    // and the same DATABASE_URL/REDIS_URL/ANTHROPIC/GITHUB secrets. Defined in phase-4.
  }
}
```

> The Keycloak image isn't built by this repo — either mirror `quay.io/keycloak/keycloak` into ECR (or use an ECR pull-through cache), or point that service at the public image if your task networking allows. The `apiRepo` placeholder above is just to keep the helper uniform — swap in the real Keycloak image source.

## Keycloak (identity provider)

Keycloak is a stateful service that needs its own Postgres database and persistent identity. Two reasonable options for the MVP:

- **Self-host on Fargate (in-ecosystem):** run the `quay.io/keycloak/keycloak` image as its own ECS Fargate service behind the ALB on `auth.agentpm.io`, backed by a dedicated database/schema on the existing RDS instance (or a small separate RDS). Start with `start --optimized` and a single task; this is the cheapest path and keeps everything in your VPC. Add a second task for HA when it matters.
- **Managed alternative:** a hosted Keycloak/IdP service if you'd rather not operate it. Costs more but removes ops burden.

Either way:
- Realm `agentpm`, clients `agentpm-web` (public, PKCE) + `agentpm-api` (audience).
- Enable user self-registration; add **Google, Microsoft (Azure AD), and GitHub** identity providers (credentials configured *in Keycloak*, see [05-environment-secrets.md](../references/05-environment-secrets.md)).
- Valid redirect URIs = your SPA origins (`https://agentpm.io/*`, `http://localhost:3000/*`).
- Export the configured realm to JSON and commit it so staging/prod/local come up identically.

> The API and SPA only need `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_API_AUDIENCE`, and the `VITE_KEYCLOAK_*` values — no client secrets. Add Keycloak's URL to the cost model (~one small Fargate task + DB) in [09-cost-estimates.md](../references/09-cost-estimates.md).

## DNS & TLS (Route53 + ACM → the ALB)

No S3, no CloudFront-over-S3 — the **web nginx container behind the ALB is the SPA origin** (SPA deep-link fallback to `index.html` is handled by nginx inside the container; see [12-docker-and-deployment.md](../references/12-docker-and-deployment.md)). DNS just points the three hostnames at the shared ALB, and ACM provides the cert the HTTPS listener uses.

```typescript
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'

// hostnames all resolve to the shared ALB; the listener's host rules route them
for (const host of ['agentpm.io', 'www.agentpm.io', 'api.agentpm.io', 'auth.agentpm.io']) {
  new route53.ARecord(this, `Alias-${host}`, {
    zone: hostedZone,
    recordName: host,
    target: route53.RecordTarget.fromAlias(
      new route53Targets.LoadBalancerTarget(alb)   // the ALB from the Compute stack
    )
  })
}
// ACM cert (covering the apex + the subdomains, e.g. a wildcard) is referenced by
// the HTTPS listener via process.env.ACM_CERT_ARN in the Compute stack above.
```

> **Optional CDN/WAF:** if you want edge caching or AWS WAF later, put a CloudFront distribution **in front of the ALB** (origin = the ALB, *not* an S3 bucket) and point Route53 at CloudFront instead. Not needed for the MVP — the ALB serves the nginx container directly.

---

## AWS CI/CD (ECS path)

> Lint/test is identical to the primary pipeline above. The deploy job builds the **same two images** (`agentpm-api`, `agentpm-web`) to ECR, runs migrations as a one-off ECS task, then forces new deployments on the `web` and `api` services. No S3 sync — the web nginx container is the SPA origin.

File: `.github/workflows/deploy-ecs.yml`

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env: { POSTGRES_DB: agentpm_test, POSTGRES_PASSWORD: test }
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/agentpm_test
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo db:migrate:test --filter=api
      - run: pnpm turbo test

  build:
    runs-on: ubuntu-latest
    needs: [lint-typecheck, test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build + push API image to ECR
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/agentpm-api:$IMAGE_TAG -f apps/api/Dockerfile .
          docker push $ECR_REGISTRY/agentpm-api:$IMAGE_TAG

      - name: Build + push Web image to ECR (VITE_* baked in)
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/agentpm-web:$IMAGE_TAG -f apps/web/Dockerfile \
            --build-arg VITE_API_URL=https://api.agentpm.io \
            --build-arg VITE_WS_URL=wss://api.agentpm.io \
            --build-arg VITE_KEYCLOAK_URL=https://auth.agentpm.io \
            --build-arg VITE_KEYCLOAK_REALM=agentpm \
            --build-arg VITE_KEYCLOAK_CLIENT=agentpm-web .
          docker push $ECR_REGISTRY/agentpm-web:$IMAGE_TAG

      - name: Run DB migrations (one-off ECS task against managed RDS)
        run: |
          aws ecs run-task --cluster agentpm --launch-type FARGATE \
            --task-definition agentpm-migrate \
            --overrides '{"containerOverrides":[{"name":"api","command":["pnpm","prisma","migrate","deploy"]}]}' \
            --region ap-south-1
          # (or run migrate as a container init step; gate the rollout on its success)

      - name: Roll web + api services
        run: |
          for svc in webSvc apiSvc; do
            aws ecs update-service --cluster agentpm --service $svc \
              --force-new-deployment --region ap-south-1
          done
```

> **Same images, two registries:** the ECS path uses the **same** `apps/api/Dockerfile` (above) and `apps/web/Dockerfile` (in [12-docker-and-deployment.md](../references/12-docker-and-deployment.md)) — just pushed to **ECR** instead of GHCR, under the same `agentpm-api` / `agentpm-web` names the Compute stack pulls. Don't maintain a second set of Dockerfiles.

---

## Definition of Done (ECS alternative)

- `cdk deploy` brings up VPC, RDS, Redis, ECS cluster, API service, web (nginx) service, ALB, Route53, ACM in `ap-south-1`.
- A push to `main` runs CI (lint/typecheck/test) and, on success, builds+pushes the API and web images and forces new ECS deployments — no manual steps.
- The app is reachable over HTTPS at the staging domain; `prisma migrate deploy` runs (as a one-off task) before new containers start.
- CloudWatch alarms from [08-monitoring.md](../references/08-monitoring.md) exist and route to an SNS topic.
