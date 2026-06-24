import { defineConfig, devices } from '@playwright/test'

// Local E2E against the running docker stack (`docker compose up`). CI wiring
// (Postgres + Redis + Keycloak + browsers) lands in Phase 3. globalSetup logs
// into Keycloak once and saves storageState, reused by every spec.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    storageState: 'e2e/.auth/user.json',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
