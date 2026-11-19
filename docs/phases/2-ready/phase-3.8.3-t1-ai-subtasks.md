# Phase 3.8.3-t1 — AI suggests subtasks

> **Stage:** `ready` · **Next role:** Product Developer · **Branch:** — (cut `feat/3.8.3-t1-ai-subtasks` from `dev` once 3.8.8 has merged) · **Size:** M (3 build steps)
> Checked against the code on 2026-11-19. Waits in Ready until 3.8.8 leaves Building. The sister item X1 (natural-language quick-add) is in [`1-pending/`](../1-pending/phase-3.8.3-x1-nl-quick-add.md); S1 (sprint goal) shipped on 2026-07-13 (record at the bottom).

## 1. Why — *Product Planning*
- **Problem:** to break a ticket into smaller pieces today, you type each subtask by hand, one title at a time. You get no acceptance criteria, and you have to think up the split yourself.
- **Goal:** from any ticket, ask the AI for 3–7 suggested subtasks. Review them, edit or untick any, and create the ones you keep in one click. Nothing is created until you say so.
- **Success signal:** on a real parent ticket, the Tester goes from "Suggest subtasks" to the new children showing under the parent in under a minute, with the right parent, the edited titles and only the ticked rows.

*(Owner triage 3.8.1 ⛔C0, 2026-07-12: build T1 · S1 · X1. Same posture as 3.8 / 3.8.1: through the `AIProvider` seam, logged by `generateLogged`, a draft the user reviews, no auto-save, no tool use.)*

## 2. Scope — *Product Planning*
- **In:**
  - API: `POST /api/ai/subtasks` returns suggestions only and never creates tickets.
  - A new `subtasks` entry in the prompt registry.
  - In the ticket drawer's Subtasks area: a "Suggest subtasks" button, the thinking loader, then a review list where you tick, edit and create.
  - Fix the wrong comment in `ai.prompts.ts` (backlog B3).
  - Update the user guide, and fix its three leftover "PMAgent" spellings while it's open (backlog T2).
- **Out (non-goals):**
  - Setting sprint, assignee, priority or labels on the new subtasks. They get the parent's workstream only (owner, 2026-11-19).
  - Editing each suggestion's acceptance criteria in the review list (you can edit them on the ticket afterwards).
  - A "Regenerate" button. Discard and suggest again does the same job.
  - A bulk-create API endpoint.
  - Eval-harness fixtures for the new prompt (backlog T5).
  - X1 and BYOK (backlog F4).
- **Owner decisions (asked in chat, 2026-11-19):**
  1. **What subtasks copy from the parent:** the workstream only, the same as typing a subtask by hand today. They land in the backlog, not in the parent's sprint.
  2. **How acceptance criteria are saved:** as plain `- ` bullets, the same as "Draft with AI" and "Auto-fill".
- **Risks:**
  - Nova Micro may return too many items, or empty criteria lists. The zod shape plus the seam's one corrective re-prompt handle it, and the route trims the list to 7.
  - Creating N tickets means N separate POSTs, so one can fail halfway (AC7 covers it).
  - The Subtasks area sits in the drawer's Relationships panel, which starts collapsed. The button is only seen once the panel is open (see §3).

## 3. Ground truth — *Product Manager* (verified against the code on 2026-11-19, `dev` @ 9bf26c2)

**API**
- `apps/api/src/routes/ai.ts` (261 lines):
  - `requireAuth` is a plugin-wide preHandler (line 80).
  - Body validators sit at the top (27–36).
  - Four generation routes: `/draft-ticket` (86), `/expand-ticket` (125), `/project-summary` (183), `/sprint-goal` (232).
  - Every route follows one pattern:
    1. a rate limit (`10 / minute`, or 5 for summary);
    2. load the entity, or throw `ApiError(404)`;
    3. `assertOrgRole(userId, orgId, 'MEMBER')`;
    4. enrichment reads (titles only);
    5. `requireProvider(orgId)`;
    6. `generateLogged(request.log, '<endpoint>', provider, { ...PROMPTS.x, user: buildXUser(…) })`.
  - `/expand-ticket` (133–146) is the closest model: it loads a ticket with `project.orgId`.
- **The draft was wrong here:** `generateLogged` (48–74) already takes `endpoint: PromptEndpoint`. S1 widened it, so nothing is left to do.
- `apps/api/src/services/ai.prompts.ts` (221 lines):
  - `PROMPT_VERSION = 3` (line 24).
  - The comment at 21–23 says v3 added the sprint-goal, subtasks and quick-parse entries. Only sprint-goal exists (backlog B3).
  - The registry `PROMPTS` (214–219) has `draft`, `expand`, `summary`, `sprintGoal`. `PromptEndpoint = keyof typeof PROMPTS` (221).
  - Builders cap each field with `cap()` (132). Enrichment is titles, labels and goal only; other tickets' descriptions never go in.
- `apps/api/src/services/ai.service.ts`:
  - `generateDetailed` (110–137) tries once. If zod rejects the tool input, it re-prompts once with the error, then throws `502 AI_BAD_OUTPUT`.
  - Timeouts map to `504 AI_TIMEOUT`; throttling and other failures to `503 AI_UNAVAILABLE` (176–188).
  - The JSON schema becomes the Bedrock tool `inputSchema` (164). A nested array-of-objects schema hasn't been used before, so it's untested on live Nova Micro.
- **Tests:** `apps/api/src/test/ai.test.ts` is hermetic.
  - It mocks `@aws-sdk/client-bedrock-runtime` (`runtimeSend`, 8–31).
  - Helpers: `toolResponse(input)` (84), `lastUserText()` (78), `makeOrg` / `makeProject` / `makeTicket` (57–68).
  - S1's tests are at 570–611.
  - The telemetry test asserts `promptVersion: 3` (~563). It must change when the version is bumped.
- **Data:** `Ticket` (`prisma/schema.prisma` 140–195):
  - `title String`; `description String?`; `acceptanceCriteria String?` (free markdown text, not a list).
  - `parentId String?`, the self-relation "Subtasks" (178–179, `onDelete: SetNull`).
  - `workstream` (default `SPRINT`) and `archivedAt`.
  - Org roles are only `OWNER` / `ADMIN` / `MEMBER` (369–373). There's no viewer role, so "who may not" means non-members (403) and signed-out users (401).
- **Create:** `POST /api/tickets` (`routes/tickets.ts` 173).
  - Its `createTicketSchema` (29–50) accepts `parentId`, `acceptanceCriteria` (a string) and `workstream`, and it's MEMBER-gated.
  - `createTicket` checks that the parent is in the same project (`tickets.service.ts` 157).
  - There's no bulk-create endpoint.
- **Eval harness** (`apps/api/scripts/ai-eval.ts`):
  - It defaults to `['draft','expand','summary']` (line ~316) and has fixtures for those three only.
  - `--endpoint sprintGoal` would already crash on `fixtures[ep].length`. That's out of scope here; logged as backlog T5.
  - Adding a registry entry doesn't break its typecheck.

**Web**
- **The draft was wrong here:** the subtasks UI is in `apps/web/src/components/RelationsSection.tsx` (191 lines), not in `TicketDrawer.tsx` itself.
  - The Subtasks block is at 146–172: a label with a done/total count (147–154), the subtask badges plus the "Link existing" picker (155–158), and the inline "New subtask title — Enter to create" input (159–171).
  - `createSubtask` (51–63) calls `api.createTicket({ projectId, title, parentId: ticketId, workstream: parentWorkstream })`.
  - Then `refresh()` (43–47) invalidates `['relations']`, `['tickets', projectId]` and `['ticket', ticketId]`, and a `relations.subtaskCreated` toast shows.
- `TicketDrawer.tsx:869` renders `<RelationsSection ticketId projectId parentWorkstream={ticket.workstream} />` inside the **Relationships** panel (854–872). **That panel starts collapsed** (`sectionOpen('relations', false)`).
- **The pattern to copy is the drawer's Auto-fill** (`TicketDrawer.tsx` 117–151 and 890–957):
  - an `AbortController` ref;
  - `aiErrorKey(e)` returns null on cancel, which means no error is shown;
  - on `ai.error.unavailable`, invalidate `['ai-health']`;
  - an inline error with a **Retry** link;
  - Esc cancels, or discards the review;
  - an sr-only `aria-live="polite"` "Generating…", then `<AIThinkingIndicator active onCancel>`;
  - the review resets when `ticketId` changes (line 121).
- **The closest review-list pattern** is the board's AI draft preview (`components/board/Column.tsx` ~345–430):
  - a `checks` array, default all true;
  - `useListReveal(count, start)` staggers the rows.
  - It saves AC as `draft.acceptanceCriteria.map((ac) => \`- ${ac}\`).join('\n')` (`pages/Board.tsx` 339–341; also `lib/aiExpandReview.ts:41`).
- **Shared pieces to reuse:**
  - `AIButton` (`components/BetaBadge.tsx` 44–90): health gating plus `Loader2` while busy.
  - `useListReveal` (`lib/aiReveal.ts` 51–66), which honours reduced motion.
  - `aiErrorKey` (`lib/useAIHealth.ts` 31–47).
  - `FieldError` (`components/ui/field-error.tsx`) and `EmptyState` (`components/EmptyState.tsx`).
  - `lib/aiDraftEdit.ts` is the model for a small, pure, unit-tested logic file.
- **`lib/api.ts`:**
  - The `api.ai*` calls take an `AbortSignal` (HEAD lines 669–677).
  - `CreateTicketInput` already has `parentId`, `workstream` and `acceptanceCriteria`.
- **`locales/en.json`:**
  - The `relations.*` and `ai.*` blocks exist.
  - Reuse `ai.generating`, `ai.retry`, `ai.discard`, `ai.readyAnnounce`, `ai.error.*` and `ai.failed`.
  - New copy goes under a new `ai.subtasks.*` group.
- **Heads-up:** 3.8.8 (Building) has uncommitted edits to `lib/api.ts` and `locales/en.json`. Start T1 only after 3.8.8 has merged into `dev`, so the two never overlap.

**Baseline** (run by the PM, 2026-11-19, working tree including the uncommitted 3.8.8 edits): `pnpm --filter @agentpm/api test` → 22 files, **123 passed**; `pnpm --filter @agentpm/web test` → 15 files, **75 passed**.

## 4. Acceptance criteria — *Product Manager*
- [ ] **AC1 — The button.**
  - Open a ticket → expand **Relationships** → the Subtasks area shows a **Suggest subtasks** AI button, next to "Link existing".
  - When AI is off, unreachable, or the model isn't ready, the button is disabled, with the same reason tooltip as the other AI buttons.
- [ ] **AC2 — While generating.**
  - Clicking the button shows the thinking loader (Thinking → Cooking → Finishing) with **Cancel**.
  - Cancel, or Esc, stops the request and returns to idle with **no error**.
  - A screen reader hears "Generating…" once, not every stage word.
- [ ] **AC3 — The review list.**
  - 1–7 suggestions appear inline in the Subtasks area (never in a dialog). They stagger in unless the system prefers reduced motion.
  - Each row has:
    - a checkbox, ticked by default;
    - an editable title;
    - a toggle ("N criteria") that shows or hides that suggestion's acceptance criteria.
  - **Nothing is created** at this point: the parent's subtask count is unchanged.
- [ ] **AC4 — Create.**
  - The button reads **Create N subtasks**, where N counts only the ticked rows.
  - Clicking it creates exactly those rows, in list order. Each one has:
    - the edited title;
    - parent = this ticket;
    - the parent's workstream (owner decision 1);
    - its criteria saved as plain `- ` bullets (owner decision 2). A row with no criteria saves none.
  - The button shows a spinner and is disabled while it works.
  - Then a success toast shows, the list closes, and the new subtasks appear as badges in the Subtasks row, with the done/total count updated.
  - The board card shows the subtask counter.
- [ ] **AC5 — Validation.**
  - A ticked row with an empty title shows an inline error under that field (`aria-invalid` + `FieldError`), and Create is disabled.
  - Unticking every row also disables Create.
  - An unticked row with an empty title doesn't block Create.
- [ ] **AC6 — Discard.**
  - **Discard**, or Esc inside the list, drops every suggestion. Nothing is created, and the Suggest button is back.
  - Opening a different ticket while a list or a request is open drops it too. An in-flight request is cancelled, and no suggestions carry across.
- [ ] **AC7 — Errors.**
  - A failed generation shows the right message inline with **Retry**. The messages are: AI unavailable, timed out, unusable output, too many requests, or the generic one.
  - If one create fails partway:
    - the subtasks already created stay;
    - they leave the list, and the unfinished rows stay ticked;
    - an error toast shows the reason, and pressing Create again finishes the rest.
- [ ] **AC8 — API.** `POST /api/ai/subtasks` with body `{ ticketId }`:
  - 401 without a token; 403 for a user who isn't in the ticket's org; 404 for an unknown ticket; 400 for a bad body; 503 `AI_UNAVAILABLE` when AI is off.
  - 200 `{ subtasks: [{ title, acceptanceCriteria: string[] }] }`, with 1–7 items. It **never creates a ticket**.
  - What the model receives:
    - the parent's title, description and acceptance criteria;
    - the titles of its existing, non-archived subtasks, so it doesn't repeat them;
    - no other ticket's description.
  - An empty list triggers one corrective re-prompt.
  - Exactly one `ai.generate` telemetry line is logged, with `endpoint: 'subtasks'` and `promptVersion: 4`.
  - The rate limit is 10 a minute, like the other generation routes.
- [ ] **AC9 — Copy and accessibility.**
  - All new copy is in `en.json` through `t()`, with no hard-coded strings.
  - Every checkbox and title input has an accessible name that includes the suggestion.
  - The whole list works by keyboard: Tab moves between controls, Space toggles a checkbox, and Enter in a title field doesn't create anything.
  - The focus ring is visible.
  - After Create or Discard, focus returns to the Suggest subtasks button.
  - Colours come from tokens, and errors use `--destructive`.
- [ ] **AC10 — User guide.**
  - `docs/product/features.md` describes the helper in the "AI drafting" section ("Three optional AI helpers" becomes four).
  - Its "last updated" date is refreshed.
  - The three leftover "PMAgent" spellings in its body become "PmAgent" (backlog T2).
- [ ] **AC11 — No regression.** These still work as before:
  - inline subtask create (type a title, press Enter);
  - Link existing; Set parent; Blocked by / Blocks;
  - the drawer's Auto-fill review;
  - the board's Draft with AI;
  - Sprints' Draft goal with AI.
  - The api and web suites, and both typechecks, are green.

## 5. Build steps — *PM writes · Developer ticks* (one step = one commit)
- [ ] **S1 — API: suggestions endpoint + prompt.** `feat(3.8.3-t1 S1): subtasks suggestion endpoint`
  - `services/ai.prompts.ts`:
    - add `subtasksSchema` (an object `{ subtasks: array of { title: string, acceptanceCriteria: string[] } }`, with `minItems 1`, `maxItems 7` on the list and `maxItems 5` on each criteria list) and `subtasksZod` (`subtasks: z.array(z.object({ title: z.string().trim().min(1).max(200), acceptanceCriteria: z.array(z.string().min(1)).max(5) })).min(1)`);
    - add `SUBTASKS_SYSTEM`: "break the parent into 3–7 independent child tickets; each a short imperative title plus 1–3 testable acceptance criteria; no overlap with each other or with the existing subtasks; don't restate the parent; if the parent is thin, suggest fewer, honest ones; return ONLY JSON";
    - add `SubtasksContext` and `buildSubtasksUser({ title, description, acceptanceCriteria, existingChildTitles })`, with the same `cap()` limits as expand (title 200, description 2000, AC 1500, up to 20 child titles at 200 each);
    - add `PROMPTS.subtasks` (temperature 0.2, `maxTokens` ≈ 900);
    - bump `PROMPT_VERSION` to **4**, and rewrite the 21–23 comment truthfully ("v3 (3.8.3 S1): added sprint-goal. v4 (3.8.3-t1): added subtasks.") to close B3.
  - `routes/ai.ts`:
    - add `subtasksBody = z.object({ ticketId: z.string().uuid() })` and `POST /subtasks`, using the `/expand-ticket` pattern and `rateLimit 10 / minute`;
    - load the parent (`title, description, acceptanceCriteria, project.orgId`) plus `subtasks where archivedAt: null` (titles only, up to 20);
    - call `generateLogged(…, 'subtasks', …)` and return `{ subtasks: subtasks.slice(0, 7) }`.
  - `test/ai.test.ts` (about 5 new tests):
    - the happy path returns suggestions, and the parent's subtask count is still 0 afterwards;
    - the user text holds the parent's description and an existing child's title, but not an archived child's title;
    - an empty list triggers one re-prompt, and then succeeds;
    - 403 for a non-member; 404 for an unknown ticket;
    - and change the telemetry assertion to `promptVersion: 4`.
  - Run `docker compose restart api` before any live check.
- [ ] **S2 — Web: API client + pure review logic.** `feat(3.8.3-t1 S2): subtask suggestion review logic`
  - `lib/api.ts`: add the `AISubtaskSuggestion` type and `api.aiSubtasks(ticketId, signal)`.
  - New file `lib/aiSubtasks.ts` (pure, no React):
    - `toReviewRows(suggestions)` gives each row `{ id, title, acceptanceCriteria, checked: true }`;
    - `checkedCount(rows)`;
    - `rowError(row)` returns a blank-title error only for ticked rows;
    - `canCreate(rows)`;
    - `buildSubtaskPayloads(rows, { projectId, parentId, workstream })` takes the ticked rows only, in order, with trimmed titles, and AC as `- a\n- b` (or `undefined` when there are none).
  - New file `lib/aiSubtasks.test.ts` (about 5 tests): unticked rows are skipped; an edited title is carried; AC joins as bullets, or is absent when empty; workstream and parent are set; a blank ticked title blocks Create.
- [ ] **S3 — Web: the Suggest subtasks UI + guide.** `feat(3.8.3-t1 S3): suggest subtasks in the ticket drawer`
  - New file `components/AISubtasksReview.tsx`. It holds the review list, so `RelationsSection.tsx` stays small.
  - `RelationsSection.tsx`:
    - put an `AIButton` "Suggest subtasks" in the Subtasks row;
    - generate with the Auto-fill pattern (`AbortController`, `aiErrorKey`, inline error + Retry, Esc, sr-only announce, `AIThinkingIndicator`);
    - reset and abort when `ticketId` changes;
    - reveal rows with `useListReveal`;
    - on Create, run the payloads through `api.createTicket` **one after another**. A row that succeeds leaves the list; on the first failure, stop and toast the error. Then call `refresh()`, show a success toast, and return focus to the button;
    - a defensive empty result shows `EmptyState` in its bare variant.
  - `locales/en.json`: add the `ai.subtasks.*` keys (suggest, reviewTitle, criteriaToggle with a count, titleLabel, titleRequired, create with a count, created with a count, empty).
  - `docs/product/features.md`:
    - add the helper to "AI drafting", and mention it under the drawer's Relationships bullet;
    - refresh the date;
    - fix the three "PMAgent" spellings (T2).
  - Tests: about 2 component tests in `components/AISubtasksReview.test.tsx` (unticking a row lowers the count on Create; a blank ticked title shows the error and disables Create), using the same Testing Library setup as `EmptyState.test.tsx` / `CsvTools.test.tsx`.
  - Browser smoke on the live stack before handing to review.

**DevOps impact: none.**
- No migration and no Prisma change.
- No Keycloak realm change.
- No new env vars: it uses the existing `AI_PROVIDER` / `BEDROCK_MODEL_ID` / AWS keys in `sourcecode/.env`.
- No new dependencies and no new containers.
- After S1, run `docker compose restart api` (the tsx-watch gotcha).

## 6. Test plan — *PM writes · Tester runs*
- **Automated:**
  - Suites: `pnpm --filter @agentpm/api test` (expect about 123 → 128, all green), `pnpm --filter @agentpm/web test` (about 75 → 82, all green), and `pnpm --filter @agentpm/api typecheck` + `pnpm --filter @agentpm/web typecheck`.
  - New tests: the about 5 API tests in `ai.test.ts`, about 5 in `lib/aiSubtasks.test.ts`, and about 2 in `AISubtasksReview.test.tsx`.
- **Test data:**
  - Sign in as the e2e test user (`infra/keycloak/seed-e2e-user.sh`).
  - Use a project you own, and create a throwaway parent ticket: title "Let users reset their password by email", description "Users who forget their password can request a reset link by email; the link expires after an hour."
  - Give it one hand-typed subtask, "Design the reset email".
  - **Restore:** when you're done, delete (archive) the parent and every subtask you created.
- **Live AI:** Bedrock Nova Micro runs with the dev key in `.env` (decision 3).
  - If `/api/ai/health` says it's unreachable, check AC2–AC4 and AC7 against the hermetic tests only, and mark the live browser checks "not verified".
- **Browser, per AC:**
  - **AC1:**
    - open the parent → expand Relationships → see "Suggest subtasks";
    - hover over it when AI is off: the reason tooltip should show. This is optional live. The shared `AIButton` is already proven, and S1's 503 test covers the API. To check it live, blank `AI_PROVIDER` in `.env`, run `docker compose up -d api`, look, then restore it and run `docker compose up -d api` again.
  - **AC2:** click Suggest → the loader shows → press Esc → back to idle with no error. Click again and let it finish.
  - **AC3:** 3–7 rows, all ticked; expand one "N criteria" toggle. None of them repeats "Design the reset email". The Subtasks count still reads 0/1.
  - **AC4:** edit row 1's title, untick row 2 → the button reads "Create N subtasks" with N = ticked rows → click it:
    - a toast shows, and the badges appear;
    - the count reads 0/(1 + N);
    - open one child: its parent is right, the edited title is there, its criteria are `- ` bullets, and its workstream matches the parent;
    - the board card shows the counter.
  - **AC5:** suggest again → clear a ticked title → inline error, and Create is disabled → untick that row → Create is enabled.
  - **AC6:** Discard → nothing is created. Suggest, then switch to another ticket mid-generation → no list there, and no error.
  - **AC7:** in the browser pane, block or fail one `POST /api/tickets` (for example, a devtools request block after the first create). Check that the created rows leave the list, the rest stay, the toast shows, and Create again finishes the rest. Error messages are also covered by `aiErrorKey`'s existing tests.
  - **AC8:** covered by the hermetic tests; also check the api log shows one `ai.generate` line with `endpoint: "subtasks"` (`docker compose logs api | grep ai.generate`).
  - **AC9:**
    - keyboard only: Tab through the rows, Space toggles, Enter in a title does nothing;
    - after Create or Discard, focus is back on the button;
    - VoiceOver or the accessibility tree names each checkbox;
    - grep the new component for hard-coded strings.
  - **AC10:** read the `features.md` diff.
  - **AC11:**
    - type a subtask and press Enter;
    - link an existing ticket and remove it;
    - set and clear a parent;
    - add and remove a blocker;
    - run the drawer's Auto-fill (and discard it);
    - run the board's Draft with AI (and discard it);
    - run Sprints' Draft goal (and don't save it).

## 7. Review — *Reviewer*
_Not started._

## 8. Test report — *Tester*
_Not started._

## 9. Release — *DevOps*
_Not started._

---

## Background: S1 (sprint goal), shipped 2026-07-13
*This file began as the combined 3.8.3 spec (T1 · S1 · X1). S1 shipped before the six-role pipeline existed: api 114 → 116, browser-verified live (the thinking loader → the goal streams into the field, read-only while streaming → Save).*
- **API:** `POST /api/ai/sprint-goal` with body `{ sprintId }` (`routes/ai.ts` 232–258), the registry entry `sprintGoal`, and `buildSprintGoalUser`.
- **Web:** an `AIButton` "Draft goal with AI" by the sprint goal field; the goal streams in through `useTextReveal`; the user saves it normally.
- **Tests:** "AI sprint-goal (3.8.3 S1)" in `ai.test.ts`.

## Handoff log

### 2026-11-19 · Docs restructure (Claude) → Product Manager
- **Did:** moved this file to `1-pending/` (S1 done, T1 and X1 not started) and added the header line.
- **State (code check, 2026-11-19):**
  - `POST /api/ai/sprint-goal` and `PROMPTS.sprintGoal` exist.
  - There is no subtasks or quick-parse endpoint, prompt or UI. Line 21 of `apps/api/src/services/ai.prompts.ts` wrongly says there is (backlog B3).
  - Since 2026-07-13, `components/TicketDrawer.tsx` and `components/board/Column.tsx` have each changed once. `RelationsSection.tsx`, `lib/parseQuickCreate.ts`, `routes/ai.ts` and `ai.prompts.ts` haven't changed.
- **Next role should:**
  1. Re-verify the ground truth above against today's code.
  2. Split T1 and X1 into separate items (`phase-3.8.3-t1-….md`, `phase-3.8.3-x1-….md`) using the work-item template.
  3. Write the ACs, build steps and test plan for T1 first.
- **Watch out for:** AI runs on Bedrock locally (decision 3 on BOARD.md; the dev key is set in `.env`). If the key stops working, build and test against the mock provider and mark live checks "not verified". The DoD lines above still say "PROGRESS"; use BOARD.md + `docs/product/features.md` instead.

### 2026-11-19 · Product Manager → Product Developer
- **Did:**
  - Re-checked the 2026-07-12 ground truth against today's code. Three things had moved:
    - `generateLogged` is already widened;
    - `PROMPT_VERSION` is already 3, with a wrong comment (B3);
    - the subtasks UI lives in `RelationsSection.tsx`, inside a Relationships panel that starts collapsed.
  - Split the old combined spec:
    - this file (`git mv` from `1-pending/phase-3.8.3-ai-autopopulate.md`) is now T1, with S1 kept as background;
    - X1 has its own file, [`1-pending/phase-3.8.3-x1-nl-quick-add.md`](../1-pending/phase-3.8.3-x1-nl-quick-add.md).
  - Wrote §3–§6 for T1.
  - Asked the owner two questions and recorded the answers in §2: workstream only; plain `- ` bullets.
  - Put B3 into S1 and T2 into S3, and logged backlog T5 (the eval harness has no fixtures for `sprintGoal` / `subtasks`).
- **State:**
  - `dev` @ 9bf26c2 plus this docs commit. No product code changed.
  - Ran `pnpm --filter @agentpm/api test` → 123 / 123 and `pnpm --filter @agentpm/web test` → 75 / 75 (working tree, including the uncommitted 3.8.8 edits).
  - Live Bedrock not checked by the PM.
- **Next role should:**
  - Finish 3.8.8 first: it's still in Building, and the WIP limit is one.
  - Once 3.8.8 has merged into `dev`: `git mv` this file to `3-building/`, cut `feat/3.8.3-t1-ai-subtasks` from `dev`, and start S1.
- **Watch out for:**
  - The nested array-of-objects tool schema hasn't run on live Nova Micro yet. Check it early in S1, with one manual call after `docker compose restart api`.
  - 3.8.8 touches `lib/api.ts` and `locales/en.json`, the same files as S2 and S3. Branch after its merge, not before.
