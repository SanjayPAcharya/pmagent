# Phase 3.5 — Platform Hygiene: settings UI, monitoring, plan limits, API access

> **Status: ⏸ PAUSED — H1+H2 done, H3–H5 carried to [Phase 3.6](phase-3.6-polish-hardening.md)** (2026-07-03, on `dev`). Settings pages (H1/H2) shipped & browser-verified. The remaining hygiene items (monitoring, plan limits, API tokens/webhooks) were deferred into the 3.6 polish/hardening phase. Pre-launch checklist material (pairs with `references/06-security-checklist.md`, `08-monitoring.md`, `11-launch-checklist.md`).

## Why 3.5 exists
Endpoints exist without UI (org rename/accent/delete, project rename/branch/delete), monitoring is documented but not wired, `PlanType` is decorative, and "agent-first" needs programmatic access eventually. Closing these makes the product self-serve for a testing team.

## Items
### H1. ✅ Org settings page
`/orgs/:slug/settings`: rename, accent color (move the picker from Members), plan display, danger zone (delete org, OWNER-gated, type-to-confirm). All endpoints exist.

### H2. ✅ Project settings page
Rename, description, default branch, danger zone (delete/archive). Entry from the tree context menu's stubbed "Settings".

### H3. Error monitoring — **→ moved to [3.6 A1](phase-3.6-polish-hardening.md)**
### H4. Soft plan limits — **→ moved to [3.6 A2](phase-3.6-polish-hardening.md)**
### H5. Personal access tokens + webhooks — **→ moved to [3.6 A3](phase-3.6-polish-hardening.md)**

## Outcome
H1/H2 (settings pages) shipped. H3–H5 carried into Phase 3.6, which also opens a polish/hardening pass over the whole 3.x arc.
