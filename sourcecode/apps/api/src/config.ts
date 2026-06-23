export interface AppConfig {
  NODE_ENV: string
  PORT: number
  LOG_LEVEL: string
  ALLOWED_ORIGINS: string[]
  DATABASE_URL: string
  REDIS_URL: string
  KEYCLOAK_ISSUER_URL: string
  KEYCLOAK_API_AUDIENCE: string
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
    KEYCLOAK_API_AUDIENCE: process.env.KEYCLOAK_API_AUDIENCE ?? 'agentpm-api',
  }
}
