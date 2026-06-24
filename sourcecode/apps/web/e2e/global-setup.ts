import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Drive the real Keycloak hosted login ONCE and persist the session (cookies) so
// every spec starts authenticated. Our SPA uses keycloak-js check-sso, which
// silently restores the session from the KC cookie saved here — no per-spec login.
//
// Requires a seeded test user in the realm. Configure via env:
//   E2E_BASE_URL (default http://localhost:3000)
//   E2E_USER / E2E_PASS — the primary test user's credentials
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const USER = process.env.E2E_USER ?? 'e2e-a@example.com'
const PASS = process.env.E2E_PASS ?? 'password'

export default async function globalSetup(_config: FullConfig) {
  mkdirSync('e2e/.auth', { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(BASE_URL)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Keycloak login form
  await page.fill('#username', USER)
  await page.fill('#password', PASS)
  await page.click('#kc-login')
  await page.waitForURL(`${BASE_URL}/**`)
  // Landed back in the app (header shows the user) → session cookie is set.
  await page.getByText(/AgentPM/i).first().waitFor()
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
  await browser.close()
}
