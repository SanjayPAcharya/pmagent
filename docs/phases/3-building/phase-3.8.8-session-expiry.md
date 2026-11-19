# Phase 3.8.8 — Session expiry & "Remember me"

> **Stage:** `dev` · **Next role:** Product Developer · **Branch:** `feat/3.8.8-session-expiry` · **Size:** S
> Built on 2026-08-06 outside the pipeline and never reviewed. The Developer puts the work on a branch, closes the known gaps (§3), then hands it to the Reviewer.

## 1. Why — *Product Planning*
- **Problem:** when a Keycloak session ran out, the app sent the user straight to the login page mid-task with no explanation (`main.tsx` called `keycloak.login()` when a refresh failed). There was also no way to stay signed in across days.
- **Goal:** say plainly that the session expired and offer one clear way back in. Offer "Remember me" so someone on their own machine stays signed in for up to 30 days.
- **Success signal:** no silent redirects mid-task, and a remembered session survives a browser restart within 30 days.

## 2. Scope — *Product Planning*
- **In:** a session-expired prompt in the web app; a "Remember me" checkbox on the Keycloak login page; 30-day remember-me session lifetimes in the realm.
- **Out (non-goals):** changing normal (not remembered) session lengths; refresh-token rotation; syncing the expired state across tabs.
- **Decided (2026-11-19, decision 2 on BOARD.md):** keep the full-screen prompt, as a deliberate exception to the no-modal rule: once you're signed out, nothing on the page can be saved.
- **Risks:** realm settings that silently don't apply (gap 1 below).

## 3. Ground truth — what was built (working tree from 2026-08-06; read on 2026-11-19)

| File (under `sourcecode/`) | Change |
|---|---|
| `apps/web/src/lib/auth.ts` | Event bus: `onSessionExpired`, `notifySessionExpired` (fires only if the user was authenticated), `isSessionExpired`, `resetSessionExpiredState` |
| `apps/web/src/lib/api.ts` | `authedFetch`: on a 401, if `keycloak.updateToken(-1)` fails → `notifySessionExpired()` |
| `apps/web/src/main.tsx` | `keycloak.onTokenExpired`: if the refresh fails → `notifySessionExpired()` (was `keycloak.login()`) |
| `apps/web/src/components/SessionExpiredModal.tsx` | **New.** Full-screen overlay (`role="dialog"`, `aria-modal`) with a title, body and a "Log in again" button that calls `login()` |
| `apps/web/src/pages/Layout.tsx` | Mounts `<SessionExpiredModal />` |
| `apps/web/src/locales/en.json` | `auth.sessionExpiredTitle`, `auth.sessionExpiredBody`, `auth.reloginButton`, `auth.rememberMe` |
| `infra/keycloak/realm-agentpm.json` | `rememberMe: true`; `ssoSessionIdleTimeoutRememberMe` and `ssoSessionMaxLifespanRememberMe` = 2592000 (30 days); also **removed** `"verifyEmail": false` |
| `infra/keycloak/themes/pmagent/login/resources/css/pmagent.css` | Styles the `#kc-form-options` row and checkbox |

**Known gaps** found while filing this item. Fix or justify each one:
1. `--import-realm` skips an existing realm, so the realm settings above never reach the running dev Keycloak (or prod). This needs a kcadm step: dev → `keycloak-init` in `docker-compose.override.yml`; prod → `infra/keycloak/prod-bootstrap.sh`.
2. `isSessionExpired` and `resetSessionExpiredState` are exported but unused.
3. `auth.rememberMe` in `en.json` is unused: the checkbox is rendered by Keycloak's theme, not by the app.
4. `lib/websocket.ts` handles `auth.error` but doesn't raise the session-expired prompt. Decide whether it should.
5. Dropping `"verifyEmail": false` from the realm JSON is harmless (Keycloak defaults to false) but unrelated to this change. Restore it to keep the diff focused.
6. The overlay doesn't move focus to "Log in again", and its copy is Title Case ("Session Expired") where the app uses sentence case.
7. `docs/product/features.md` doesn't mention either feature.
8. "Typecheck + build + 123 API tests green" was reported on 2026-08-06 and hasn't been re-run since.

## 4. Acceptance criteria — *Product Manager* (set 2026-11-19)
- [ ] **AC1** — When the session can't be refreshed, the app shows the session-expired prompt instead of redirecting, and nothing behind it can be used until the user acts.
- [ ] **AC2** — An API call that gets a 401 and can't refresh shows the same prompt, once (prompts don't stack).
- [ ] **AC3** — "Log in again" opens the Keycloak login. After signing in, the user is back in the app.
- [ ] **AC4** — A signed-out visitor (the landing page) never sees the prompt.
- [ ] **AC5** — The Keycloak login page shows a styled "Remember me" checkbox, in light and dark.
- [ ] **AC6** — With "Remember me" ticked, the session survives a browser restart and lasts up to 30 days idle. Unticked, the realm's normal session lengths apply.
- [ ] **AC7** — The init scripts apply the realm settings to an *existing* Keycloak, verified by reading `realms/agentpm` back with kcadm.
- [ ] **AC8** — Keyboard and screen reader: focus moves into the prompt, the button is reachable and labelled, and the copy comes from `en.json` in sentence case.
- [ ] **AC9 (no regression)** — Signing in, signing out, a token refresh while active, the ⌘K palette and the `?` help overlay all still work.

## 5. Build steps — *PM writes · Developer ticks* (one step = one commit)
- [x] **S0** — Package the existing work. Run `git switch -c feat/3.8.8-session-expiry` (it carries the uncommitted changes), then commit only the eight files in §3, as built: `feat(3.8.8 S0): session-expired prompt + Remember me (as built 2026-08-06)`.
- [x] **S1** — Close gaps 1–6: apply the realm settings via `keycloak-init` and `prod-bootstrap.sh`; remove the dead exports and the unused key; make the websocket decision; restore `verifyEmail`; fix focus and copy. Keep the full-screen prompt (decision 2).
  - **Gap 1:** the same `kcadm update realms/agentpm` (rememberMe + both 30-day lifetimes) is now in `keycloak-init` and as step 4 of `prod-bootstrap.sh`. Applied to the running dev Keycloak by re-running `keycloak-init`; kcadm read-back went from `rememberMe:false`, `0`/`0` to `true`, `2592000`/`2592000`.
  - **Gap 2:** removed `isSessionExpired` and `resetSessionExpiredState`. A fresh login reloads the page, so nothing needs a reset.
  - **Gap 3:** removed `auth.rememberMe`. Keycloak's own message bundle labels the checkbox.
  - **Gap 4 (decision):** yes, but only when it's really the session. On `auth.error` the websocket forces a token refresh and raises the prompt only if that fails. Why: the API also sends `auth.error` for "not a member of this project", which must not look like a sign-out.
  - **Gap 5:** restored `"verifyEmail": false`.
  - **Gap 6:** focus moves to "Log in again" on open and Tab stays on it. Copy is sentence case: "Session expired" / "You've been signed out, so changes can't be saved right now. Log in again to keep working." The button shows `Loader2` + `disabled` while it redirects (async-button standard).
  - **Bug found and fixed (AC1/AC2):** the as-built check `keycloak.authenticated || keycloak.token` never passed in the real case, because keycloak-js clears both as soon as Keycloak refuses a refresh (`clearToken()` on a 400). The bus now remembers that the page started signed in (`watchSession()`, called from `main.tsx`) and also listens to `keycloak.onAuthLogout`. It fires once; later calls are no-ops.
  - **AC1 "nothing behind it can be used":** the prompt is portalled to `<body>`, `#root` gets `inert` while it's up, and a capture-phase key guard mutes the app's shortcuts (⌘K, `?`, board keys). Why: `aria-modal` alone doesn't stop Tab or document-level shortcuts.
- [ ] **S2** — Add unit tests for the event bus (fires once, only when authenticated). Describe both features in `docs/product/features.md` in plain language and refresh its date.

DevOps impact: Keycloak realm settings on the running dev Keycloak (via kcadm/init), plus the prod bootstrap script (prod itself is parked). No migrations, env vars or new dependencies.

## 6. Test plan — *PM writes · Tester runs*
- **Automated:** `pnpm typecheck`, the api and web unit tests (including the new event-bus tests), and the web build.
- **Browser, per AC:**
  - **AC1–AC3:** sign in as the e2e user. In the Keycloak admin console (http://localhost:8080 → realm `agentpm` → Users → the user → Sessions) sign the session out. Then use the app.
  - **AC4:** visit the landing page signed out.
  - **AC5:** check the login page in light and dark.
  - **AC6:** sign in with the box ticked, restart the browser, and check you're still signed in. If a full restart isn't possible in the pane, inspect the persistent Keycloak cookies.
  - **AC7:** `kcadm.sh get realms/agentpm --fields rememberMe,ssoSessionIdleTimeoutRememberMe`.
  - **AC8:** keyboard-only pass plus a VoiceOver spot check.
  - **AC9:** smoke the core flow.
- **Restore:** any realm timeout you shortened for testing.

## 7. Review — *Reviewer*
_Not started._

## 8. Test report — *Tester*
_Not started._

## 9. Release — *DevOps*
_Not started._ The realm settings must be applied to the running dev Keycloak (kcadm or a re-run of `keycloak-init`), not just written into the JSON.

## Handoff log

### 2026-11-19 · Docs restructure (Claude) → Product Developer
- **Did:** filed this item from the uncommitted 2026-08-06 work during the docs restructure. Recorded the files, the known gaps and the proposed ACs.
- **State:** the code is uncommitted in the `dev` working tree.
- **Environment check (2026-11-19, later that day):**
  - The local stack is up and healthy: api `/health` and `/ready` 200, Keycloak realm 200, web 200, `keycloak-init` clean.
  - With this work in the tree, `pnpm typecheck` is green, api tests pass 123/123 and web tests pass 75/75 (so gap 8 is answered).
  - Decision 2 (keep the full-screen prompt) is made.
- **Next role should:** do S0 so the work is on `feat/3.8.8-session-expiry`, then S1–S2, then hand to the Reviewer.
- **Watch out for:** the eight files in §3 are the only ones S0 should commit; don't stage anything else.
