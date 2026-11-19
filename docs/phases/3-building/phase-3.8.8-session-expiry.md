# Phase 3.8.8 — Session expiry & "Remember me"

> **Stage:** `changes-requested` · **Next role:** Product Developer · **Branch:** `feat/3.8.8-session-expiry` · **Size:** S
> Built on 2026-08-06 outside the pipeline. On 2026-11-19 the Developer put it on its branch, closed the known gaps (§3) and handed it to the Reviewer, who sent it back for one blocking fix (§7).

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
**Verdict: Changes requested** (2026-11-19, reviewed at `3284e32`). One blocking finding; the rest are nits.

The core is sound. The once-only bus gated on `watchSession()` fixes the real bug (keycloak-js clears the token before the old check ran). The websocket decision is right. The realm settings now reach an existing Keycloak. Copy, tokens, lucide icons and `Loader2` + `disabled` all follow CLAUDE.md, and there are no orphan i18n keys. Every AC has code behind it. The only extras are `docker-compose.override.yml` (named in S1) and the websocket change (gap 4), both in scope. No new routes, secrets or migrations.

| # | Severity | File:line (under `sourcecode/`) | Issue | Suggested fix |
|---|---|---|---|---|
| 1 | blocking | `apps/web/src/components/SessionExpiredModal.tsx:22` | Only `#root` is made inert, but Radix overlays portal to `<body>`, outside `#root`: the ticket drawer (`Sheet`), the ⌘K palette, `?` help. They stay live, and a modal one's focus trap pulls focus back from the prompt. **Checked:** a throwaway jsdom test (outside the repo) with an open `Sheet` and an input inside it. The prompt shows, but focus stays on the drawer's input, and is still there after Tab. So a keyboard or screen-reader user can't reach "Log in again", and can keep typing into a form that can't save (Enter passes the key guard). That fails **AC8**, and **AC1** for the keyboard. It's a common state, not a rare one: a ticket left open in an idle tab is the main case this feature is for. The Developer's note only weighed ⌘K / `?`. | Either build the prompt on `@radix-ui/react-dialog`, as `KeyboardHelp` does (its focus-scope stack pauses the drawer's trap and hides the rest from screen readers; block Escape and outside clicks), or set `inert` on every `<body>` child except the prompt. Add a test with an open `Sheet` behind the prompt. |
| 2 | nit | `apps/web/src/pages/Layout.tsx:20` | A stray blank line splits the import block. | Drop it. |
| 3 | nit | `apps/web/src/pages/Layout.tsx:136` | The prompt is mounted only in `Layout`. `/invite/:token` is a signed-in page outside `Layout`, so a session that ends there now gets neither the prompt nor the old redirect. The page is short-lived (it auto-accepts and moves on), so this is rare. | Mount `<SessionExpiredModal />` in `App` instead. The `watchSession()` gate already keeps it off the landing page. |
| 4 | nit | `apps/web/src/lib/auth.ts:50` | A network blip during a refresh (Keycloak briefly unreachable) also shows "Session expired". In that case keycloak-js rejects but keeps the token, so the session may still be fine. It recovers, because "Log in again" signs straight back in, and it's no worse than the old redirect. | Later: retry once while `keycloak.token` is still set. Fine for the backlog. |
| 5 | nit | `apps/web/src/lib/api.ts:39` | The new 401 → `notifySessionExpired()` branch has no unit test, and `api.test.ts` doesn't cover 401s. The Tester covers AC2 in the browser. | A small `authedFetch` test: a 401 plus a refused refresh fires the bus once. |

**For the Developer:** fix #1. #2, #3 and #5 are small and in scope, so fold them in if you can. Whatever is still open at re-review gets logged in BACKLOG.md.

**Developer response** (2026-11-19, all in one commit, `R1_SHA`):
- **#1 — fixed in `R1_SHA`.** I used both of your suggestions together.
  - The prompt is now a Radix Dialog, like `?` help. Radix's focus-scope stack pauses the drawer's or palette's trap, `aria-hidden`s it, blocks clicks on it, and loops Tab inside the prompt. Esc and outside clicks are blocked.
  - Every `<body>` child except the prompt's own two nodes (overlay + content, marked `data-session-expired`) goes inert, so the drawer can't take focus even from code. Why both: in the browser pane, a forced `focus()` into the open ⌘K input still slipped text in with Radix alone; with the inert sweep it can't.
  - The capture-phase key guard stays, so ⌘K / `?` can't open a fresh, non-inert layer.
  - New, found while checking: a click on the backdrop or card text dropped focus to `<body>`, where Enter did nothing. A capture-phase `mousedown` guard now keeps focus on "Log in again".
  - Tests: `SessionExpiredModal.test.tsx` gained an "open ticket drawer" suite (a real `Sheet` with an input). It checks focus moves to the button, stays there after Tab, Shift+Tab and a forced `focus()` into the drawer, and that the drawer is inert, `aria-hidden` and not closed by Esc. Both drawer tests fail against the old prompt (I ran them against `087a3dc`'s file) and pass now. There's also a test for the click case.
  - Browser (this session, e2e user): opened ⌘K (the same Radix Dialog as the drawer), typed into it, then ended the session with kcadm and forced a refresh. Focus went to "Log in again" and stayed there after Tab, Shift+Tab, typing, Esc and clicks on the backdrop and card. The palette text was unchanged, and Enter opened the Keycloak login. The e2e user's projects have no tickets, so I used ⌘K rather than create test data.
- **#2 — fixed in `R1_SHA`.** The import is gone from `Layout.tsx` along with the mount (#3), so `Layout.tsx` now matches `dev` exactly.
- **#3 — fixed in `R1_SHA`.** `<SessionExpiredModal />` is mounted once in `App`, inside `BrowserRouter` after `<Routes>`, so `/invite/:token` is covered. `watchSession()` still keeps it off signed-out pages.
- **#4 — won't fix in this item.** Agreed it's backlog material: retry once while `keycloak.token` is still set. Left for you to log in BACKLOG.md at re-review, as §7 says.
- **#5 — fixed in `R1_SHA`.** `api.test.ts` has two new tests. Two parallel 401s plus a refused refresh fire the bus once, and both calls reject. A 401 plus a good refresh retries quietly with no prompt.

**What I ran** (this session, on `feat/3.8.8-session-expiry` at `3284e32`, clean tree):
- `pnpm typecheck --force`: 4/4 tasks green, none cached.
- `pnpm --filter @agentpm/web test`: 17 files, **87/87**.
- `pnpm --filter @agentpm/api test`: 22 files, **123/123**.
- `pnpm --filter @agentpm/web build`: OK (only the usual chunk-size warning).
- Lint: the web `lint` script is a no-op (`echo no-lint`).
- A throwaway vitest file and config in my scratchpad (not committed) for finding #1, as described above.
- Read-only kcadm against the running dev Keycloak: `rememberMe` true, both RememberMe lifetimes 2592000, `verifyEmail` false. Normal lengths are 1800 s idle and 36000 s max, which matches features.md's "30 minutes … 10 hours".
- Read the full `dev...feat/3.8.8-session-expiry` diff (16 files) and the security checklist. Also checked the app's other keydown handlers: none act on Enter or Space, so the guard letting those through is safe.

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

### 2026-11-19 · Product / Code Reviewer → Product Developer
- **Did:** reviewed S0–S2 (`9889365`, `378fce5`, `087a3dc`) against §4, CLAUDE.md and the security checklist. Verdict: **changes requested**, with one blocking finding and four nits (§7).
- **State:** branch `feat/3.8.8-session-expiry`, reviewed at `3284e32`, with no product code changed. Ran: typecheck 4/4 (uncached), web 87/87, api 123/123, web build OK. Read-only kcadm shows the dev realm already has remember-me on with 30-day lifetimes.
- **Next role should:** fix §7 #1, so an open ticket drawer, ⌘K or `?` can't keep focus or input away from the prompt. Add a test with an open `Sheet` behind it. Fold in #2, #3 and #5 if cheap. Then hand back to the Reviewer.
- **Watch out for:** jsdom doesn't implement `inert`. If you take the `inert` route, test that the attribute is set on the `<body>` children, and check the focus behaviour in the browser pane. The Radix Dialog route can be tested in jsdom directly: check that focus lands on "Log in again" with a `Sheet` open.
