export interface AppConfig {
  NODE_ENV: string
  PORT: number
  LOG_LEVEL: string
  ALLOWED_ORIGINS: string[]
  DATABASE_URL: string
  REDIS_URL: string
  KEYCLOAK_ISSUER_URL: string   // what tokens carry as `iss` (browser-facing); validated as allowedIss
  KEYCLOAK_INTERNAL_URL: string // API-reachable realm base for JWKS discovery (same keys, any host)
  KEYCLOAK_API_AUDIENCE: string
  RETENTION_NOTIFICATION_DAYS: number // 3.7.4 E2 — read notifications older than this are purged daily
  // ── AI (optional, 3.8) — absent OLLAMA_BASE_URL = AI disabled (buttons show disabled-with-reason) ──
  OLLAMA_BASE_URL: string // '' = disabled; e.g. http://ollama:11434 (compose) or http://localhost:11434 (host)
  OLLAMA_MODEL: string
  AI_TIMEOUT_MS: number
}

/**
 * Dev / Docker Compose: values come from the environment (.env).
 * In production this is where a secrets-manager loader hydrates process.env
 * before reading — see agentpm-plan/references/05-environment-secrets.md.
 */
export function loadConfig(): AppConfig {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: Number(process.env.PORT ?? 3001),
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    REDIS_URL: process.env.REDIS_URL ?? '',
    KEYCLOAK_ISSUER_URL: process.env.KEYCLOAK_ISSUER_URL ?? '',
    KEYCLOAK_INTERNAL_URL:
      process.env.KEYCLOAK_INTERNAL_URL ?? process.env.KEYCLOAK_ISSUER_URL ?? '',
    KEYCLOAK_API_AUDIENCE: process.env.KEYCLOAK_API_AUDIENCE ?? 'agentpm-api',
    RETENTION_NOTIFICATION_DAYS: Number(process.env.RETENTION_NOTIFICATION_DAYS ?? 90),
    OLLAMA_BASE_URL: (process.env.OLLAMA_BASE_URL ?? '').replace(/\/$/, ''),
    OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? 'qwen2.5:7b',
    AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS ?? 120000),
  }
}
