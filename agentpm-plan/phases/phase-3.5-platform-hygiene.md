# Phase 3.5 — Platform Hygiene: settings UI, monitoring, plan limits, API access

> **Status: 📋 PLANNED**. Pre-launch checklist material (pairs with `references/06-security-checklist.md`, `08-monitoring.md`, `11-launch-checklist.md`). Mostly UI over existing endpoints + wiring documented-but-unshipped ops.

## Why 3.5 exists
Endpoints exist without UI (org rename/accent/delete, project rename/branch/delete), monitoring is documented but not wired, `PlanType` is decorative, and "agent-first" needs programmatic access eventually. Closing these makes the product self-serve for a testing team.

## Items
### H1. Org settings page — **M**, no backend
`/orgs/:slug/settings`: rename, accent color (move the picker from Members), plan display, danger zone (delete org, OWNER-gated, type-to-confirm). All endpoints exist.

### H2. Project settings page — **M**, no backend
Rename, description, default branch, danger zone (delete/archive). Entry from the tree context menu's stubbed "Settings".

### H3. Error monitoring — **M**
Sentry (or GlitchTip self-hosted to stay in the Docker ethos) in api + web; release tagging from the CI SHA; alert on new issues. Follows `references/08-monitoring.md`.

### H4. Soft plan limits — **S–M**
Enforce FREE limits server-side (e.g., 3 projects, 10 members per org) with friendly 402-style errors + an upgrade hint in the UI. No billing yet — just the seam so Phase 4+ can add Stripe without schema churn.

### H5. Personal access tokens + webhooks — **L**, prerequisite for Phase 5
`ApiToken { userId, hash, scopes, lastUsedAt }` + `Webhook { orgId, url, secret, events }`. Token auth path alongside Keycloak JWT; webhook delivery on `ticket.*` events (reuse the event bus). This is the bridge the GitHub agent (Phase 5) will stand on.

## Suggested order
H1/H2 (quick UI wins) → H3 (before more testers arrive) → H4 → H5 (schedule right before Phase 5).
