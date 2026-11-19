# Reference: Security Checklist

> Stable reference. Apply continuously; verify before each launch. Source: §16 of the original plan.

## API security

- [ ] All routes except `/webhooks/*` require a valid Keycloak-issued bearer token (verified by signature/JWKS + `iss` + `aud`) — there is no in-app `/api/auth/*` login surface
- [ ] Rate limiting: 100 req/min per IP, 1000 req/min per authenticated user
- [ ] Webhook endpoints verify HMAC signatures (GitHub: X-Hub-Signature-256)
- [ ] Input validation on all request bodies (Zod schemas on every route)
- [ ] SQL injection impossible (Prisma parameterized queries only — never raw SQL with user input)
- [ ] XSS prevention: all user content rendered with React (auto-escaping), markdown sanitized with DOMPurify
- [ ] CORS: only allow `agentpm.io` and `localhost:3000`

## Secrets & credentials

- [ ] No secrets in code, environment variables in Docker images, or git history
- [ ] All secrets in AWS Secrets Manager — loaded at runtime
- [ ] GitHub App private key stored as base64-encoded secret, never as file
- [ ] Credentials, password hashing, and refresh tokens are owned by **Keycloak** — the app stores none of them
- [ ] Keycloak served over HTTPS only; admin console not publicly exposed; social-login client secrets kept in Keycloak config, not app env
- [ ] Open self-signup is paired with a trial/billing guard so agent runs (Anthropic spend) can't be abused

## PM-core security (Phase 2)

- [ ] Notification endpoints are **caller-scoped** (`where:{ userId: request.userId }`); marking/reading another user's notification → 404 (no IDOR)
- [ ] `@mention` autocomplete + server-side resolution restricted to **org members**; recipient set intersected with current membership (no cross-org content/existence leak)
- [ ] Markdown sanitized **client (marked+DOMPurify, raw-HTML off) and server** (notification bodies via isomorphic-dompurify or plain text) — no stored-XSS surface
- [ ] Invite tokens: CSPRNG ≥128-bit (`crypto.randomBytes(32).toString('base64url')`), single-use (`acceptedAt`), expiry-checked, email-bound if set, **role capped at creator's role**, uniform 404 on miss, stricter rate-limit on accept
- [ ] `sort` is a server-side whitelist (Zod enum); all filter ids `uuid`/enums — no client string reaches `orderBy`
- [ ] Ticket sub-resources cross-scope-validated: assignee + watchers are org members; labels belong to the org; sprint/parent/deps belong to the project
- [ ] Per-authenticated-user rate limit (1000/min) alongside per-IP (100/min); Fastify `trustProxy` set behind Caddy/ALB
- [ ] Presence/board events scoped to project room (join gated by `assertOrgRole`); WS handshake verifies token (jose JWKS + iss/aud) + membership

## Agent security

- [ ] Agents run in isolated ECS Fargate tasks — no shared filesystem (once isolation lands; until then, in-process worker)
- [ ] Agents have IAM role with minimum permissions (read Secrets Manager, write logs — nothing else)
- [ ] Agents cannot call each other directly — only via queue
- [ ] Agent output (code) is committed to a branch and reviewed by human before merge
- [ ] Agent cannot approve its own PRs
- [ ] Production deployments always require explicit human approval (hard-coded, not configurable)

## Data security

- [ ] RDS storage encryption enabled (AES-256)
- [ ] RDS in isolated subnet — no public access
- [ ] ElastiCache in-transit encryption enabled
- [ ] S3 buckets: public access blocked, server-side encryption enabled
- [ ] DB and Redis never publicly accessible (isolated subnets); app tier in public subnets for MVP is acceptable behind security groups + ALB (move to private subnets + NAT/endpoints for hardened production)
- [ ] HTTPS enforced everywhere, HTTP→HTTPS redirect (Caddy on the VM path; the ALB HTTPS listener on the ECS path)
