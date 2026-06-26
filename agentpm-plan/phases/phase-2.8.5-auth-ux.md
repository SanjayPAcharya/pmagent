# Phase 2.8.5 — Auth UX: in-app OAuth (no Keycloak login page)

> **Status: 🟢 IMPLEMENTED — frontend + IdP plumbing (2026-06-26); social login pending OAuth credentials.** Sign-in / sign-up live on the app's own screen — **Google, Microsoft, GitHub** buttons (via `idpHint`, **no Keycloak page**) + email/password (**2.8.5b hybrid** → the branded Keycloak page). Keycloak stays the token issuer / broker (invisible 302 hop). The three OAuth apps still need registering (see Prerequisites) before the social round-trip works end-to-end. Numbered **2.8.5** because it's part of the Keycloak line (sits with branding, before deploy), not a separate 2.9.

## Goal
From the PMAgent Landing, a user signs in or signs up with **Google / Microsoft / GitHub** (one click → provider consent → into the app, account auto-created on first use) or with **email/password** — without ever seeing the Keycloak login screen for the social path.

## Depends on
- Phase 1 (Keycloak OIDC + the `agentpm-web` public PKCE client) and Phase 2.8 (PMAgent branding + the `pmagent` login theme).
- **External prerequisite (user action):** OAuth apps registered with Google, Microsoft (Azure AD), and GitHub — see Prerequisites.
- **Sequencing:** the code can be built before Phase 3, but full *production* social verification needs real redirect URIs (the domain provisioned in Phase 3). Dev verification uses `localhost` (Google/MS/GitHub all allow localhost redirect URIs).

## Decisions (settled)
- **Approach: Option A** — social buttons on our page via `kc_idp_hint`; Keycloak brokers Google/MS/GitHub and its login page is skipped. Keeps the whole backend auth model (JWKS verification, JIT provisioning) **unchanged**. _Rejected:_ provider-SDK popups (drop Keycloak, re-architect token trust) and ROPC-only auth.
- **Providers:** Google + Microsoft + GitHub.
- **Email/password:** kept — mechanism is the one open sub-decision (below).

## Scope / implementation

### 1. Realm — identity providers (Google, Microsoft, GitHub)
- Add three `identityProviders` to the realm. Keycloak ships built-in providers: `google`, `microsoft` (or generic `oidc` for Azure), and `github`.
- **Seamless signup:** set each IdP `trustEmail=true` and **disable the "Review Profile" execution** in the *first broker login* flow, so a first-time social login auto-creates the user and lands in the app — no Keycloak "update account information" page.
- **Account linking only on provider-verified email** (Google + Microsoft verify; GitHub email can be unverified → treat as unverified unless confirmed, to avoid account-takeover via email collision).
- **Secrets stay out of the repo.** The IdP *definitions* can live in `realm-agentpm.json`, but the **client secrets are injected at runtime** by extending the existing `keycloak-init` one-shot: read `GOOGLE_CLIENT_SECRET` / `MICROSOFT_CLIENT_SECRET` / `GITHUB_CLIENT_SECRET` from env and `kcadm update` the IdPs. Never commit secrets; `.env.example` documents the keys with empty values.

### 2. Frontend — Landing + auth client
- `lib/auth.ts`: `loginWith(idp: 'google' | 'microsoft' | 'github')` → `keycloak.login({ idpHint: idp })`. (Signup and sign-in are the **same** buttons — first-broker auto-create handles new users.)
- `Landing.tsx`: three "Continue with …" buttons (provider icons) sharing the PMAgent logo, plus the email/password area. i18n strings for each.
- `logout` / token refresh unchanged.

### 3. Email/password — DECIDED: 2.8.5b hybrid (2026-06-26)
- **2.8.5b — hybrid (✅ chosen & built).** Social = fully seamless on-page; the email/password option opens the **PMAgent-branded** Keycloak page (one redirect, but you inherit email verification, captcha/brute-force protection, password policy, and MFA-readiness for free). Minimal code, lowest risk.
- **2.8.5a — fully custom form (no redirect even for passwords).** Login via Keycloak **Direct Access Grant (ROPC)**; signup via a backend endpoint that uses a Keycloak **service-account (admin REST)** to create the user, then auto-logs in. _Trade-offs:_ ROPC is deprecated in OAuth 2.1; no built-in MFA / bot-protection on that path; the SPA handles raw credentials; the API must hold a Keycloak service credential. Requires a `06-security-checklist` note + review.

## Prerequisites (your action — external accounts)
**Step-by-step runbook: [references/13-social-login-setup.md](../references/13-social-login-setup.md).** In short — register an OAuth app with each provider, set the **Authorized redirect URI** to the Keycloak broker endpoint, and put the client id + secret in `sourcecode/.env`:

| Provider | Where | Redirect URI (dev) |
|---|---|---|
| Google | Google Cloud Console → Credentials → OAuth client ID (Web) | `http://localhost:8080/realms/agentpm/broker/google/endpoint` |
| Microsoft | Azure Portal → App registrations | `http://localhost:8080/realms/agentpm/broker/microsoft/endpoint` |
| GitHub | GitHub → Settings → Developer settings → OAuth Apps | `http://localhost:8080/realms/agentpm/broker/github/endpoint` |

> Production swaps `localhost:8080` for `https://auth.<domain>` — added when the domain is provisioned in Phase 3. The realm id stays `agentpm` (branding ≠ identifiers, per Phase 2.8).

## Security
- No client secrets in the repo or images — injected at runtime into Keycloak via `kcadm`, sourced from env with locked-down permissions.
- Link accounts only on provider-verified email; treat GitHub email as unverified unless confirmed.
- If **2.8.5a** is chosen, document the ROPC + admin-API exposure in [06-security-checklist.md](../references/06-security-checklist.md) and gate it behind a review before merge.

## Definition of Done
- The Landing shows **Google / Microsoft / GitHub** buttons; clicking one goes straight to the provider (no Keycloak page) and returns authenticated; a first-time login **auto-creates** the account and lands in the app.
- Email/password works per the chosen mechanism (2.8.5a or 2.8.5b).
- No secrets committed; IdP client secrets injected at runtime.
- Web typecheck + build green; API tests still green (no backend change for the social path; +tests if 2.8.5a adds endpoints).
- Verified in-browser on `localhost` with at least one real provider end-to-end.
