# Phase 3.8.8 — Session expiry & "Remember me"

> **Stage:** `review` · **Next role:** Product / Code Reviewer · **Branch:** `feat/3.8.8-session-expiry` · **Size:** S
> Built on 2026-08-06 outside the pipeline. On 2026-11-19 the Developer put it on its branch, closed the known gaps (§3) and handed it to the Reviewer.

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
- [x] **S2** — Add unit tests for the event bus (fires once, only when authenticated). Describe both features in `docs/product/features.md` in plain language and refresh its date.
  - `lib/auth.test.ts` (7 tests): never fires for a signed-out page; fires once however often it's reported; still fires after keycloak-js has cleared the token (the S1 bug); late listeners hear it; unsubscribe works; a refused refresh fires it and a good one doesn't; `onAuthLogout` fires it.
  - `components/SessionExpiredModal.test.tsx` (5 tests): hidden until expiry; sentence-case title, focus on "Log in again", `#root` inert, prompt outside `#root`; ⌘K and `?` muted; the button starts login and shows busy; unmount releases `#root`. Why the extra file: it pins down AC1 and AC8, which the bus tests can't reach.
  - `features.md`: "Remember me" in Step 1, plus a new "Signing in & staying signed in" section in Part 2. Date refreshed to 2026-11-19.

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

### 2026-11-19 · Product Developer → Product / Code Reviewer
- **Did:** built S0–S2, one commit each.
  - S0 [`9889365`]: the eight 2026-08-06 files, committed as built.
  - S1 [`378fce5`]: closed gaps 1–6 (how and why for each is under S1 in §5). Also fixed a bug: the prompt never showed in the real case, because keycloak-js clears the token before the old check ran.
  - S2 [`087a3dc`]: 12 new web tests and the `features.md` update. Gap 7 is done in S2, and gap 8 is re-run below.
- **State:** branch `feat/3.8.8-session-expiry`, head `087a3dc` before this handoff commit. Ran in this session:
  - `pnpm typecheck`: 4/4 green.
  - web tests: 87/87 (75 + 12 new).
  - api tests: 123/123.
  - `pnpm --filter @agentpm/web build`: OK.
- **How to see it:**
  1. Open http://localhost:3000 signed out: the landing page shows and there's no prompt.
  2. Click **Sign in with email**: the login page shows the styled "Remember me" checkbox.
  3. Sign in as the e2e user, then end the session from Keycloak (admin console → Users → the user → Sessions → Sign out, or `kcadm create users/<id>/logout -r agentpm`).
  4. The prompt appears at the next token refresh. Then: focus is on "Log in again", ⌘K and `?` do nothing, Enter opens the Keycloak login, and signing in returns you to the app.
  5. A normal **Sign out** goes to the landing page with no prompt.
  - I checked all of the above in the browser pane in this session. I forced the refresh with `keycloak.updateToken(-1)` instead of waiting it out.
- **Migrations / realm / env:**
  - No migrations, env vars or dependencies.
  - Realm: `keycloak-init` and `prod-bootstrap.sh` now set `rememberMe=true` and both RememberMe lifetimes to 2592000. Already applied to the running dev Keycloak (re-ran `keycloak-init`; kcadm read-back shows `true`/`2592000`/`2592000`). Prod is parked and untouched.
  - `docker-compose.override.yml` changed (the `keycloak-init` script). It's the one file outside §3's list, and S1 names it.
- **Next role should:** review the three commits, starting with `lib/auth.ts` (`watchSession` + the once-only gate) and `SessionExpiredModal.tsx` (portal, `inert` on `#root`, capture-phase key guard).
- **Watch out for:**
  - **Timing for the Tester (AC1–AC3):** after an admin sign-out the prompt doesn't appear right away. The API checks tokens locally (JWKS), so calls keep working until the 5-minute access token (`accessTokenLifespan` 300) needs a refresh. Wait up to 5 minutes, or force a refresh. Signing out in *another tab* shows it within about 5 seconds, through keycloak-js's login-status iframe. That's a side effect, not the "sync across tabs" non-goal.
  - **Edge case, not handled:** if the ⌘K palette or `?` help is open at the moment the session ends, Radix's own focus trap may keep focus in it. The prompt still sits on top (`z-[60]`, `pointer-events-auto`) and can be clicked. Rare, so I left it.
  - **AC6** (survives a browser restart) isn't verified yet; it needs a real restart or a cookie check.
  - My browser checks signed the e2e user in and out (and signed its sessions out once via kcadm). No app data was changed.
