# Reference: Environment Variables & Secrets

> Stable reference. How config and secrets are loaded everywhere. Source: §12 of the original plan.

## `.env.example` (commit this, never `.env` itself)

```bash
# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/agentpm

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://HOST:6379

# ── Auth (Keycloak OIDC — the API only VERIFIES tokens) ───
KEYCLOAK_ISSUER_URL=https://auth.agentpm.io/realms/agentpm  # OIDC issuer; JWKS discovered from here
KEYCLOAK_API_AUDIENCE=agentpm-api                           # expected `aud` claim on access tokens
# Frontend (Vite) Keycloak config — build-time, VITE_ prefixed:
VITE_KEYCLOAK_URL=https://auth.agentpm.io
VITE_KEYCLOAK_REALM=agentpm
VITE_KEYCLOAK_CLIENT=agentpm-web
# NOTE: Google / Microsoft / GitHub social-login client id+secrets are configured
# INSIDE Keycloak (Realm → Identity Providers), NOT as app env vars. The API and
# SPA never see them. Keycloak's own DB/admin credentials are managed where Keycloak runs.

# ── GitHub App (repo access for the Code Agent — Phase 5) ──
# Distinct from GitHub *login*. Login-as-GitHub is a Keycloak identity provider;
# this App grants the agent read/write to connected repos.
GITHUB_APP_ID=<your GitHub App ID>
GITHUB_APP_PRIVATE_KEY=<PEM content, base64 encoded>
GITHUB_WEBHOOK_SECRET=<random string, set in GitHub App settings>

# ── Anthropic ─────────────────────────────────────────────
ANTHROPIC_API_KEY=<sk-ant-...>

# ── AWS ───────────────────────────────────────────────────
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<CI/CD only — never in app containers>
AWS_SECRET_ACCESS_KEY=<CI/CD only — use IAM roles in production>

# ── Email (AWS SES) ───────────────────────────────────────
SES_FROM_ADDRESS=notifications@agentpm.io
SES_REGION=ap-south-1

# ── Frontend (Vite — must be VITE_ prefixed, read at build time) ──
VITE_API_URL=https://api.agentpm.io
VITE_WS_URL=wss://api.agentpm.io

# ── Monitoring ────────────────────────────────────────────
SENTRY_DSN=<your sentry DSN>
LOG_LEVEL=info
```

## AWS Secrets Manager keys

Store each secret under these paths in AWS Secrets Manager (`ap-south-1`):

```
agentpm/DATABASE_URL
agentpm/REDIS_URL
agentpm/ANTHROPIC_API_KEY
agentpm/GITHUB_APP_ID
agentpm/GITHUB_APP_PRIVATE_KEY
agentpm/GITHUB_WEBHOOK_SECRET
agentpm/SENTRY_DSN
```

`KEYCLOAK_ISSUER_URL`, `KEYCLOAK_API_AUDIENCE`, and the `VITE_KEYCLOAK_*` values are non-secret config (safe as plain env vars). Social-login (Google/Microsoft/GitHub) client secrets live inside Keycloak's own config store, and Keycloak's DB/admin credentials are managed wherever Keycloak is deployed — none of them belong in `agentpm/*`.

## Secret loader

File: `apps/api/src/config.ts`

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const client = new SecretsManagerClient({ region: 'ap-south-1' })

const SECRET_NAMES = [
  'DATABASE_URL', 'REDIS_URL', 'ANTHROPIC_API_KEY',
  'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET',
  'SENTRY_DSN'
] as const

type SecretKey = typeof SECRET_NAMES[number]
type Secrets = Record<SecretKey, string>

let cachedSecrets: Secrets | null = null

export async function loadSecrets(): Promise<Secrets> {
  if (cachedSecrets) return cachedSecrets

  // In development, secrets already come from .env (loaded into process.env).
  if (process.env.NODE_ENV !== 'production') {
    cachedSecrets = SECRET_NAMES.reduce((acc, key) => {
      acc[key] = process.env[key] || ''
      return acc
    }, {} as Secrets)
    return cachedSecrets
  }

  const secrets = {} as Secrets

  await Promise.all(SECRET_NAMES.map(async (key) => {
    const command = new GetSecretValueCommand({ SecretId: `agentpm/${key}` })
    const response = await client.send(command)
    secrets[key] = response.SecretString || ''
    // Hydrate process.env so SDKs and agent code that read process.env directly
    // (e.g. the Anthropic SDK's `new Anthropic()`, the GitHub App client's
    // process.env.GITHUB_APP_*) work uniformly in the API and the worker,
    // without each call site needing the Secrets object passed in.
    process.env[key] = secrets[key]
  }))

  cachedSecrets = secrets
  return secrets
}
```

**Why this matters for the agent worker:** the worker calls `loadSecrets()` once at startup. Because the loader writes the values into `process.env`, everything downstream — `new Anthropic()` reading `ANTHROPIC_API_KEY`, `getInstallationClient()` reading `GITHUB_APP_*`, and Prisma reading `DATABASE_URL` — picks them up with no extra wiring. The same loader serves the API and the worker; the only difference is which process calls it. In production the worker's IAM role must allow `secretsmanager:GetSecretValue` on `agentpm/*` (see [security checklist](06-security-checklist.md)).
