# Phase 2.8 — Branding (PMAgent)

> **Status: ✅ IMPLEMENTED (2026-06-26).** Wordmark **PMAgent** (camel-case); Keycloak **Tier 2** custom login theme. Renames the product's *public face* from "AgentPM" to **PMAgent** everywhere a human reads it: the web app (browser title, header wordmark, landing, invite copy), the **Keycloak sign-in page**, and the API docs. **Display/branding only** — internal identifiers (workspace package names, the Keycloak realm id + client ids, DB names, the `agentpm.io` domain) are explicitly out of scope (see Non-goals): they're plumbing, not branding, and renaming them is a separate, riskier effort.

## Goal
Every user-visible surface says **PMAgent** (camel-case wordmark) — no remaining "AgentPM" text in the UI or on the login screen.

## Depends on
- Phase 2 + 2.1 + 2.5 + 2.6 — the surfaces being rebranded already exist and are stable.
- **No** new backend, migration, or dependency. Pure text/config.
- **Sequencing:** runs **before Phase 3 (deploy)** so the first deployed build ships already-branded. Independent of the parked Phase 5.5 agent work.

## References
- [01-tech-stack.md](../references/01-tech-stack.md) — Keycloak is the IdP; the API only verifies tokens, so branding the login page is realm config/theme, not app code.
- [12-docker-and-deployment.md](../references/12-docker-and-deployment.md) — the web image bakes assets at build; Keycloak imports the committed realm JSON, so realm branding ships in that file and stays identical across dev/staging/prod.

## Scope — where "AgentPM" lives today (grounded in the code)

| # | Surface | File | Current | → pmagent |
|---|---|---|---|---|
| 1 | Browser tab title | `apps/web/index.html` | `<title>AgentPM</title>` | `<title>pmagent</title>` |
| 2 | App wordmark / name (central) | `apps/web/src/locales/en.json` → `app.appName` | `"AgentPM"` | `"pmagent"` |
| 3 | Invite page copy | `en.json` → `invite.title` | `"You've been invited to AgentPM"` | `"…invited to pmagent"` |
| 4 | API docs (Swagger) | `apps/api/src/index.ts` | `title: 'AgentPM API'` | `'pmagent API'` |
| 5 | E2E brand assertion | `apps/web/e2e/global-setup.ts` | waits for `/AgentPM/i` | `/pmagent/i` |
| 6 | **Keycloak sign-in** | `infra/keycloak/realm-agentpm.json` | no `displayName` (page shows realm id `agentpm`) | add `displayName` / `displayNameHtml` = `pmagent` |

> `app.appName` is the single i18n key the UI reads for the header/landing wordmark, so most of the web surface flips with that one string. Items 1–5 are literal text swaps; item 6 is the only one needing a moment's thought (below).

## Implementation detail

### Web (items 1–5)
- `index.html` → `<title>pmagent</title>`.
- `en.json` → `app.appName: "pmagent"`; `invite.title: "You've been invited to pmagent"`. (When more locales are added, each locale file gets the same wordmark.)
- `apps/api/src/index.ts` → Swagger `info.title: 'pmagent API'`.
- `e2e/global-setup.ts` → assertion regex `/pmagent/i`, so the E2E login gate still matches the rebranded landing (update, don't delete the check).
- **Favicon / logo (optional):** none exists today (`apps/web/public` has only `silent-check-sso.html`). If a wordmark/logo is wanted, add `apps/web/public/favicon.svg` + a `<link rel="icon">` in `index.html`. Text-only branding is complete without it.

### Keycloak sign-in (item 6) — two tiers
The realm JSON sets no display name today, so the stock login theme shows the bare realm id. Pick a tier:

- **Tier 1 — minimal (recommended for this phase):** in `infra/keycloak/realm-agentpm.json` add
  - `"displayName": "pmagent"`
  - `"displayNameHtml": "<span>pmagent</span>"` (or a lightly styled wordmark)

  The default `keycloak` login theme renders `displayNameHtml` as the page heading, so the sign-in page reads **pmagent** with zero theme files. Ships in the committed realm import → identical in dev and prod.
- **Tier 2 — full custom theme (optional, later):** add `infra/keycloak/themes/pmagent/login/` (logo, colors, `theme.properties` extending `keycloak`), set `"loginTheme": "pmagent"`, mount the theme dir into the Keycloak container (compose volume) and bake it into the prod image. More work — do only when a logo / visual identity is needed.

> **Apply path (important):** the realm is import-only on a *fresh* boot, so an already-running Keycloak won't pick up the new `displayName` automatically. Either set it via the admin console / `kcadm` (`kcadm.sh update realms/agentpm -s displayName=pmagent -s 'displayNameHtml=<span>pmagent</span>'`), or recreate the KC container against the updated JSON (`docker compose up -d --force-recreate keycloak`). Commit the JSON change so future boots are branded by default.

## Non-goals (explicitly NOT in 2.8 — identifiers, not branding)
Leaving these as `agentpm` avoids an invasive, auth-breaking rename. Revisit only as a separate, deliberate phase if a true package/infra rename is wanted:
- Workspace package names `@agentpm/{api,web,shared-types}` (ripples through every import + tsconfig path).
- Keycloak **realm id** `agentpm`, **client ids** `agentpm-web` / `agentpm-api`, and the API **audience** `agentpm-api` (changing these forces token re-issue + reconfiguring every client and `VITE_KEYCLOAK_REALM`/`KEYCLOAK_*`).
- Database names `agentpm` / `agentpm_test`, env-var values, the `agentpm-plan/` folder.
- The `agentpm.io` domain + `api.` / `auth.` subdomains (a domain decision owned in Phase 3).

## Decisions (settled 2026-06-26)
- **Wordmark: `PMAgent`** (camel-case) — set in `common.appName`, `index.html` title, the Swagger title, the favicon, and the Keycloak realm `displayName`/`displayNameHtml`.
- **Keycloak: Tier 2** — shipped a custom `pmagent` login theme (`infra/keycloak/themes/pmagent/login`: `theme.properties` inheriting the stock `keycloak` theme + `pmagent.css` brand styling + a wordmark `logo.svg`), mounted into the KC container; realm `loginTheme=pmagent`.
- **Identifiers unchanged** — `@agentpm/*` packages, the realm/client ids, DB names, and `agentpm.io` stay as-is (revisit as a separate phase only if a true rename is ever wanted).

## Definition of Done
- No "AgentPM" string remains in any user-facing surface — browser title, app header/landing wordmark, invite copy, Swagger title. (`grep -rI 'AgentPM' apps` surfaces nothing user-facing; the E2E assertion is **updated**, not removed.)
- The Keycloak sign-in page shows **pmagent** (realm Display name set), verified by loading the login page.
- Web typecheck + build green; the 35 API tests still green (no behavioural change); E2E brand gate matches the new wordmark.
- The realm change is committed in `realm-agentpm.json` so dev/staging/prod import it identically; the "apply to a running KC" step is documented.
