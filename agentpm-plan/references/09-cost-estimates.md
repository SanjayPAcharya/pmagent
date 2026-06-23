# Reference: Cost Estimates

> Stable reference. Source: §17 of the original plan, updated for the containerized (Docker Compose on a VM) primary deployment.

## Primary: app containers on a VM + managed data (cheapest production-ready, full parity)

Stateless app containers (web, api, worker, keycloak, caddy) run on one right-sized VM; **state lives on managed cloud services** (RDS + ElastiCache), not on the box. No load-balancer fee (Caddy on the VM does TLS + routing).

| Item | Config | Est. Monthly |
|---|---|---|
| Compute VM | 1× EC2 `t3.large` (2 vCPU, 8GB), 24/7 — runs all app containers | $30–60 |
| Managed PostgreSQL | RDS `t3.micro`, 20GB, single-AZ (hosts agentpm + keycloak DBs) | $15 |
| Managed Redis | ElastiCache `t3.micro`, single node | $15 |
| Block storage (VM) | ~20GB gp3 (OS + images + Caddy certs; no app data) | $2 |
| Domain / DNS | Route53 hosted zone (or registrar DNS) | $1 |
| TLS | Let's Encrypt via Caddy | $0 |
| Email (SES) | first 62k emails/month free | $0 |
| **Total (infra)** | | **~$65–95/month** |

Managed data is the deliberate trade for durability: automated backups, PITR, and encryption come for free, and losing the VM never loses data — you just redeploy the stateless containers and reconnect. Trade-off vs. the app tier: it's still a single VM, so app-tier HA is manual (bigger box, or graduate to ECS/k8s). Bump the VM to `t3.xlarge` (~$120/mo) and RDS/ElastiCache instance sizes as load grows; flip RDS to multi-AZ for DB HA.

### Cheaper variant: self-hosted data on the VM (`selfhost-data` profile)

For a low-cost **dev/staging** box, flip the `selfhost-data` Compose profile ([12-docker-and-deployment.md](12-docker-and-deployment.md)) and Postgres + Redis run as containers on the same VM instead of managed services — **dropping the RDS ($15) + ElastiCache ($15) lines (~$30/mo)** for a **~$35–65/month** total. The trade: you own backups (`pg_dump` cron + offsite), no PITR, and the data shares the VM's fate. Recommended for dev/staging only; keep **managed data for production**. Same images and deploy flow either way — it's one CLI flag (`--profile selfhost-data` / `make up-selfhost`).

---

## Scale-up alternative: AWS ECS Fargate (managed)

This reflects the cost-trimmed AWS architecture (containers everywhere, web as an nginx ECS service): zero NAT gateways, a single ALB, single-task services, and a t3.micro database. Scale up to HA (NAT, 2 ALBs, multi-task auto-scaling, multi-AZ DB) once paying users justify it.

| Service | Config | Est. Monthly |
|---|---|---|
| RDS PostgreSQL | t3.micro, 20GB, single-AZ | $15 |
| ElastiCache Redis | t3.micro, single node | $15 |
| ECS Fargate — API | 1 task × 0.5 vCPU × 1GB, 24/7 | $18 |
| ECS Fargate — Agent Worker | 1 task × 1 vCPU × 2GB, 24/7 (in-process agents) | $36 |
| ECS Fargate — Keycloak | 1 task × 0.5 vCPU × 1GB, 24/7 (identity provider) | $18 |
| NAT Gateway | removed (tasks in public subnets) | $0 |
| ALB | 1 shared load balancer (host routing: web/api/keycloak) | $18 |
| ECS Fargate — Web (nginx) | 1 task × 0.25 vCPU × 0.5GB, 24/7 (containerized SPA) | $9 |
| ECR | api + web images | $2 |
| Route53 | 1 hosted zone | $1 |
| SES | First 62k emails/month free | $0 |
| Secrets Manager | ~11 secrets | $1 |
| CloudWatch | Logs (30-day retention) + metrics | $10 |
| **Total estimate** | | **~$145–160/month** |

This is roughly half the fixed AWS floor of the full HA architecture (~$250–290/mo). The always-on agent worker (~$36) is the largest single line — to trim further for the earliest MVP you can fold the worker into the API container (one task running both the server and the queue consumer), bringing this under ~$100/mo until agent volume justifies a dedicated worker. The ~$200 AWS sign-up credits cover roughly your first 6 weeks of infrastructure.

**Path back to HA (when you have customers):** set `natGateways: 1` and move app tasks to private subnets (or add VPC interface endpoints ~$7.30/mo each), raise API `desiredCount` to 2 with auto-scaling, scale the worker (or move agents to per-run Fargate tasks), add a second ALB if you split web/API origins, and flip RDS to `multiAz: true` on a larger instance.

## Anthropic API (Code Agent)

Assuming 50 agent runs/day, avg 120k tokens/run:
- Input: ~80k tokens × 50 = 4M tokens/day → $12/day → **~$360/month** (at $3/MTok input)
- Output: ~40k tokens × 50 = 2M tokens/day → $30/day → **~$900/month** (at $15/MTok output)
- **Total Anthropic: ~$1,260/month at 50 runs/day**

Note: the Anthropic API is the real cost center — it dwarfs the trimmed AWS bill and scales with usage, not fixed. Offset with user pricing ($49/seat → 3 team seats covers the agent cost).

> Model/pricing figures should be re-verified against current Anthropic pricing before committing — see the `claude-api` skill for current model IDs and rates.
