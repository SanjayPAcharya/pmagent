import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// 3.7.4 E1 — accessibility regression gate (WCAG 2.1 A/AA via axe-core). Fails
// the build on any `critical` or `serious` violation on the core pages; lesser
// (moderate/minor) findings are logged, not failed, so the gate stays actionable.
// Reuses the storageState session from global-setup. This is the evidence trail
// EN 301 549 / the European Accessibility Act build from.

const SERIOUS = new Set(['critical', 'serious'])

async function auditPage(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = results.violations.filter((v) => SERIOUS.has(v.impact ?? ''))
  const lesser = results.violations.filter((v) => !SERIOUS.has(v.impact ?? ''))
  if (lesser.length) {
    // eslint-disable-next-line no-console
    console.log(`[a11y] ${label}: ${lesser.length} moderate/minor (not failing):`, lesser.map((v) => v.id).join(', '))
  }
  expect(serious, `${label}: ${serious.map((v) => `${v.id} (${v.impact})`).join('; ')}`).toEqual([])
}

const stamp = process.env.E2E_STAMP ?? String(Date.now())

test('a11y: Dashboard, Board, List, Account have no serious axe violations', async ({ page }) => {
  // Dashboard (static landing).
  await page.goto('/')
  await expect(page.getByText(/PMAgent/i).first()).toBeVisible()
  await auditPage(page, 'Dashboard')

  // Account settings (static).
  await page.goto('/account')
  await expect(page.getByText(/Account/i).first()).toBeVisible()
  await auditPage(page, 'Account')

  // Create a throwaway org + project so Board and List have a real target.
  await page.goto('/')
  await page.getByPlaceholder(/new organization name/i).fill(`A11y Org ${stamp}`)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.getByRole('link', { name: new RegExp(`A11y Org ${stamp}`) }).click()
  await page.getByPlaceholder(/new project name/i).fill('A11y Project')
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.getByRole('link', { name: /A11y Project/ }).click()
  // Landed on the project overview: /orgs/:slug/projects/:projectSlug. Derive the
  // base so Board/List navigation doesn't depend on overview copy or link labels.
  await page.waitForURL(/\/orgs\/[^/]+\/projects\/[^/]+$/)
  const projectBase = new URL(page.url()).pathname

  // Board.
  await page.goto(`${projectBase}/board`)
  await expect(page).toHaveURL(/\/board$/)
  await page.waitForLoadState('networkidle')
  await auditPage(page, 'Board')

  // List.
  await page.goto(`${projectBase}/list`)
  await expect(page).toHaveURL(/\/list$/)
  await page.waitForLoadState('networkidle')
  await auditPage(page, 'List')
})
