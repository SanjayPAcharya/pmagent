# Phase 3.8.1 — AI polish: output quality + UX (plan only, not started)

> **Status: 📋 PLANNED (2026-07-11) · VERIFIED against code (2026-07-11 audit — every anchor below checked).** Phase 3.8 shipped the three AI features to prod (Bedrock Nova Micro). This phase polishes them on two axes the owner picked: **(A) output quality** and **(B) generation UX**. **(C)** is the researched catalog of every further "AI auto-populate" surface — a brainstorm backlog the owner triages; nothing in C is committed scope.
>
> **Renumbering note:** BYOK was previously earmarked "3.8.1"; it is now **Phase 3.8.2**. The `AIProvider` seam and `resolveProvider(orgId)` remain its single switch point — nothing here touches that design.
>
> **Legend:** 🤖 = Claude implements end-to-end. 🧑 `[MANUAL — owner]` = owner judgment/console. ⛔ = checkpoint, stop for owner decision.

## Ground truth (audited 2026-07-11 — trust these anchors, they were read, not assumed)

**Server (`apps/api`):**
- `src/services/ai.service.ts` — the seam. `GenerateOptions<T>` = `{system, user, schema, zod}` (**no temperature/maxTokens fields yet** — A2 extends it). `class BedrockProvider` is **NOT exported** (line 60; A1 must export it or add a factory). `inferenceConfig: { temperature: 0.2 }` hardcoded at line 120. One corrective retry loop in `generate()` (line 81). Health = `GetInferenceProfile`, no cache beyond the frontend's.
- `src/routes/ai.ts` — prompts/schemas/zod are **module-local consts, not exported** (`DRAFT_SYSTEM` :42, `EXPAND_SYSTEM` :75, `SUMMARY_SYSTEM` :104, plus the 3 schema/zod pairs). Rate limits per route: draft **10/min** (:127), expand **10/min** (:151), summary **5/min** (:194). Draft context = notes only (:138). Expand context = own fields only, char-capped (:169–176) — **no parent/sibling titles**. Summary context = `projectOverview()` metrics (:208–220) — **no sprint goal** (`Sprint.goal String?` exists in schema; `OverviewActiveSprint` doesn't carry it).
- Error contract: `setErrorHandler` (`src/index.ts:123`) sends `{error, code}` for `ApiError` — codes `AI_UNAVAILABLE`(503) / `AI_TIMEOUT`(504) / `AI_BAD_OUTPUT`(502). **429 comes from `@fastify/rate-limit`, NOT `ApiError` — its body has NO `code` field.**
- `Label` = org-scoped `{name, color, orgId}` (unique per org name). `Sprint.goal String?` exists.
- Tests: `src/test/ai.test.ts` = 18 of **api 107**; AWS SDK mocked via `vi.hoisted`+`vi.mock` at module level — **no test may ever touch AWS (CI has no creds)**.
- No `scripts/` dir yet; `tsx` is a devDep; precedent for tsx scripts: `"db:seed": "tsx prisma/seed.ts"`.

**Web (`apps/web`):**
- `src/lib/api.ts` — `ApiError{status, message, code?}` populated from `{error, code}` (:44). **`request()`/`authedFetch()` accept NO AbortSignal** — B2 must thread one through (backward-compatible optional arg).
- The three call sites **swallow the typed error** — bare `catch {}` → generic `t('ai.failed')`: `board/Column.tsx:92` (draft), `TicketDrawer.tsx:118` (expand; summary variant `ProjectOverview.tsx:468` uses react-query `summary.isError`).
- Draft flow (`Column.tsx:79–110` + preview card :211–245): preview is **read-only** (title/desc/AC/priority rendered, Create/Discard only). Create → `onCreateDraft(status, draft)` → `Board.tsx:297` composes AC as `draft.acceptanceCriteria.map(ac => '- '+ac).join('\n')` into the normal `createTicket`.
- Auto-fill flow (`TicketDrawer.tsx:104–123`): **`window.confirm` fires BEFORE the generation call** (:106) when any target field has content, then the response **blind-overwrites all four fields** (desc/AC/goal/constraints; AC joined `- `-bulleted) and enters edit mode. B4 inverts this: generate first, review per-field after.
- Summary (`ProjectOverview.tsx:432–489`): react-query `refetch()`-driven, `enabled:false` cache `['ai-summary', projectId]`; error → generic; loading = `Loader2` + hint (:479–487).
- `AIButton` (`BetaBadge.tsx`) gates on `useAIHealth` (staleTime 60s) + pure `aiButtonState()` (`lib/useAIHealth.ts`, 5 tests). `ui/skeleton.tsx` exists (`animate-pulse` div). i18n `ai.*` block in `src/locales/en.json` (~21 keys today).
- e2e: `apps/web/e2e/` (playwright + axe) exists; runs locally only, not CI.
- Tests: **web 37** across 8 files.

**House rules that bind this phase (from memory/CLAUDE.md):** update `PROGRESS.md` + tick boxes here in the same commit as each step; `FEATURES.md` when user-facing behavior ships; the six 3.7.2 UI patterns are product-wide (inline validation, EmptyState, destructive token, spinner-on-async, confirm, focus ring); **restart the api container after any api source edit** (tsx watch misses bind-mount edits); rebuild container on dep change; **never `git push` without the owner's go**.

---

## Part A — Output quality (eval first, then tune, then A/B)

*Principle: no blind prompt fiddling. Build a tiny repeatable eval, measure, tune, then the owner judges a model A/B with real costs. Everything stays behind the seam; a model switch remains a pure `BEDROCK_MODEL_ID` flip.*

### - [x] A1 — 🤖 Prompt extraction + eval fixtures + harness (M) ✅ DONE 2026-07-11 (baseline in release-doc/ai-eval-report.md; api still 107)
- **A1a — mechanical extraction (no wording changes):** move the 3 system prompts + 3 JSON schemas + 3 zod shapes from `routes/ai.ts` into a new **`src/services/ai.prompts.ts`**, exported, with a `PROMPT_VERSION = 1` const; route imports from there. Also **export `BedrockProvider`** (or add `createBedrockProvider(modelId?: string)`) so the harness can construct one directly. *Why first: the harness must import prompts without loading the Fastify plugin; this also unlocks A2/A4 cleanly.* Hermetic tests untouched (import paths only). Restart api container after.
- **A1b — fixtures:** `scripts/ai-eval-fixtures.json` — ~8 draft-ticket note samples (terse one-liner, rambling paragraph, typo'd, bug vs feature vs chore, urgency-implying, vague-thin), ~5 expand tickets (title-only → rich), ~3 summary metric sets (empty, healthy, blocker-heavy). Synthetic only — no real org data.
- **A1c — harness:** `scripts/ai-eval.ts`, run via new pkg script `"ai:eval": "tsx scripts/ai-eval.ts"`. **Env loading (decided):** the script itself reads `../../.env` (tiny ~10-line KEY=VALUE parser, no new dep) when `AI_PROVIDER`/`AWS_*` are absent from `process.env`; hard-exit with a clear message if still unset. Calls `BedrockProvider.generate()` **directly** (no HTTP, no Keycloak). Flags: `--model <id>` (default from env), `--endpoint draft|expand|summary`, `--runs N` (default 3). Scores per run: schema-valid-first-try, retry-fired, AC count + testability heuristic (starts-with-verb, has measurable outcome), title word count, invented-requirement smell (output nouns absent from input), latency ms, token usage (from Converse response `usage`). Prints a table + writes `release-doc/ai-eval-report.md`. Prints an estimated run cost up front. **Never wired into CI or vitest** (spends real tokens).
- **DoD:** baseline Nova Micro scorecard committed to `release-doc/`; full suite still green (api 107 — extraction is import-shuffling only).

### - [ ] A2 — 🤖 Prompt tightening per endpoint (M)
- Informed by A1's failure patterns; every change re-measured through A1, kept only if the scorecard moves. Bump `PROMPT_VERSION` on any wording change. Techniques (small-model rules: short + directive; Nova Micro degrades with long prompts):
  - **One few-shot exemplar** per endpoint (a single perfect in/out pair inside the system prompt; measure its token cost vs quality delta before keeping).
  - Tighter field directives: description = context→scope→out-of-scope; AC = testable outcomes; explicit "do not echo the notes back verbatim".
  - **Anti-thin-input rule:** on one vague line, stay minimal instead of hallucinating scope (A1's invented-requirement metric verifies).
  - **Per-endpoint `temperature`/`maxTokens`:** extend `GenerateOptions` with optional `temperature?`/`maxTokens?` (defaults preserve today's 0.2/unset), pass through to `inferenceConfig` in `BedrockProvider.converse()` (line ~120). Summary lower temp than draft; cap tokens to stop rambling.
- Hermetic test delta: assert `inferenceConfig` passthrough lands in the Converse command (+1–2 tests).
- **DoD:** scorecard delta vs A1 baseline recorded in the eval report; suite green.

### - [ ] A3 — 🤖 Context enrichment (M) — *biggest quality lever*
- **draft-ticket:** add project name + up to 10 recent ticket titles (style anchor — the model mimics the project's naming register) + the org's label names (team vocabulary). Queries: `ticket.findMany({where:{projectId, archivedAt:null}, orderBy:{updatedAt:'desc'}, take:10, select:{title:true}})`, `label.findMany({where:{orgId}, select:{name:true}})`. Total added context capped < ~1.5k chars.
- **expand-ticket:** add parent title (when `parentId` set) + up to 5 sibling/nearest ticket titles.
- **project-summary:** add the active sprint's `goal` (one extra select — `OverviewActiveSprint` doesn't carry it; query the sprint directly in the route rather than widening the overview type).
- Same org-role gate covers every added read; PII posture unchanged (titles only, never other tickets' descriptions).
- Hermetic tests (+~3): seed titles/labels/goal, assert they appear in the Converse payload; assert the char cap.
- **DoD:** A1 re-run shows the enrichment effect; suite green (api ≈111–112).

### - [ ] A4 — 🤖 Model A/B + cost table (S)
- Run the full fixture set via A1's `--model` against: `apac.amazon.nova-micro-v1:0` (baseline) → Nova Lite/Nova 2 Lite (**verify exact APAC profile IDs at run time**; note: `list-inference-profiles` returned empty for the dev IAM user on 2026-07-10 — likely missing from the policy; use `get-inference-profile` per candidate ID, or the owner adds `ListInferenceProfiles` to `pmagent-bedrock-invoke`) → `global.anthropic.claude-haiku-*` **only if** the one-time Anthropic self-declaration form is done (owner said individual-developer details are accepted; **skip silently if not** — Nova Pro is the no-form fallback).
- Output: side-by-side per-fixture outputs + scorecards + **₹/month projection at expected volume** per model (refresh per-token prices at run time; 2026-07 ballpark: Nova Micro ≈ ₹10–40 · Haiku ≈ ₹320).
- **DoD:** `release-doc/ai-eval-report.md` gains the A/B section; no code changes.

### - [ ] A5 — ⛔ 🧑 `[MANUAL — owner]` quality judgment + model decision
- Owner reads A4, picks the prod model. Switch = edit `BEDROCK_MODEL_ID` in `.github/workflows/deploy.yml` env (or the box's `.env.prod`) + redeploy — **no code**. Record decision + cost delta in PROGRESS.

### - [ ] A6 — 🤖 Generation telemetry line (S) — *new in the verified plan*
- One structured log per generation through the seam: `{endpoint, model, promptVersion, attempts, ms, outcome: ok|retry_ok|bad_output|timeout|throttle|error, inputTokens?, outputTokens?}` via the existing Fastify/pino logger (no new infra, no request-body logging). Gives A5 prod evidence and makes Cost Explorer anomalies attributable.
- Hermetic test: happy path emits exactly one line with `outcome:'ok'` (+1).
- **DoD:** visible in `docker compose logs api` during a dev generation; suite green.

## Part B — Generation UX

*Principle: at 1–2.6s real latency, honest fast feedback beats fake streaming. Fix error truthfulness first (cheapest trust win), then perceived latency, then the two review flows.*

### - [x] B1 — 🤖 Error copy per failure code + retry semantics (S) — *ships alone, first* ✅ DONE 2026-07-11 (web 37→43)
- New pure helper in `lib/useAIHealth.ts`: `aiErrorKey(err: unknown): string`. **Keying rule (verified shape):** check `err instanceof ApiError`, then **`status === 429` FIRST** (rate-limit body has no `code` — comes from `@fastify/rate-limit`, not `ApiError`), then `code`: `AI_UNAVAILABLE`→`ai.error.unavailable`, `AI_TIMEOUT`→`ai.error.timeout`, `AI_BAD_OUTPUT`→`ai.error.badOutput`, else→`ai.failed`.
- Copy (new `ai.error.*` i18n keys): unavailable → "AI is temporarily unavailable — your work is untouched. Try again in a minute." · timeout → "The AI took too long. Usually transient — try again." · badOutput → "The AI returned something unusable. Regenerate, or write it manually." · rateLimit → "Too many AI requests — give it a moment." (limits: 10/min draft & expand, 5/min summary).
- Wire all three sites: `Column.tsx:92` and `TicketDrawer.tsx:118` replace `catch {}` with `catch (e) { set…Error(t(aiErrorKey(e))) }`; `ProjectOverview.tsx:468` maps `summary.error` through it. **On `AI_UNAVAILABLE` also `qc.invalidateQueries({queryKey:['ai-health']})`** so buttons re-gate without waiting out the 60s staleTime.
- Tests: one per branch of `aiErrorKey` (+~5 web). Retry affordance stays on every error.
- **DoD:** force each failure locally (unset `AI_PROVIDER` → 503; `AI_TIMEOUT_MS=1` → 504; 11 rapid drafts → 429) and see distinct copy; suite green.

### - [ ] B2 — 🤖 Perceived latency: skeleton + staged hint + cancel (M)
- **Signal plumbing (verified missing):** `lib/api.ts` — add optional `signal?: AbortSignal` through `request()` → `authedFetch()` → `fetch()` (backward-compatible trailing param); expose it from `aiDraftTicket`/`aiExpandTicket`/`aiProjectSummary` only.
- **Skeleton, not spinner:** while generating, render a shimmer shaped like the coming result via `ui/skeleton.tsx` — draft: title bar + 3 bullet lines + priority chip in the preview slot; summary: headline + 3 bullets in the card; auto-fill: shimmer over the 4 target fields. `aria-busy` on the container; respect `prefers-reduced-motion` (`motion-safe:` variants, house pattern).
- **Staged hint:** one line advancing on a timer ("Reading your notes…" → 1.5s → "Drafting…" → 4s → "Almost there…"); `aria-live="polite"` announces start + done only (not each stage).
- **Cancel:** Cancel button (and Esc) aborts via `AbortController`; UI returns to idle, no error toast (`aiErrorKey` must not classify `AbortError`/`DOMException` as failure — return a sentinel the caller drops silently). Server side finishes and is discarded — acceptable at these token sizes; note in code.
- **Decision — no real token streaming:** forced-tool JSON arrives as one block and must zod-validate complete before display; `ConverseStream` + partial-JSON assembly is high effort for ~1–2s. Revisit only if a model switch pushes latency > ~5s.
- Tests: abort → state resets, no error shown (+1–2 web).
- **DoD:** all three flows show skeletons; Esc cancels cleanly; axe pass on the three surfaces.

### - [ ] B3 — 🤖 Draft-preview upgrade: editable + regenerate + per-bullet AC (M)
- In the `Column.tsx` preview card (:211–245): title → `Input`, description → `Textarea`, priority → select over the existing `PRIORITIES`; **per-AC-bullet checkboxes** (all checked by default). Local editable copy of the draft; what you edit is what Create submits.
- Create passes the **edited** draft (unchecked AC dropped) to `onCreateDraft`; `Board.tsx:297`'s `- `-join contract is unchanged.
- **Regenerate** button on the card: re-runs with the same notes, replaces the draft; **confirm first only when dirty** (house destructive-confirm pattern). Notes survive Discard (already true — lock with a test).
- Tokens note: composer text may contain R9 quick-add tokens (`!high` etc.) — they simply ride along as notes text; no interaction change.
- Tests (+~3): edit-then-create composes edited values; unchecked AC dropped; regenerate confirms only when dirty.
- **DoD:** browser-verified on dev stack; suite green.

### - [ ] B4 — 🤖 Auto-fill: per-field diff/accept, confirm AFTER generation (M)
- **Behavior inversion (verified current flow):** today `TicketDrawer.tsx:106` `window.confirm`s BEFORE calling the API, then blind-overwrites all four fields. New flow: generate immediately (no upfront confirm) → show a **field-level review** for description/AC/goal/constraints: current vs proposed stacked per field, plain styling, **no diff library, no new deps**; proposed pre-selected only where current is empty; conflict fields default to **keep current**; per-field Accept toggles + "Accept all".
- Accepted values land in the edit-mode fields; the normal Save persists (server contract unchanged — zero AI auto-save). AC keeps the `- `-bulleted textarea format on accept.
- Keyboard accessible; focus moves to the review block on arrival; `aria-live` announcement; destructive token on overwrite-accepting toggles (house patterns).
- `ai.overwriteConfirm` i18n key becomes obsolete → remove in B5's audit.
- Tests (+~3): empty-field default-accept, conflict default-keep, mixed accept composes correctly.
- **DoD:** browser-verified (thin ticket + rich ticket); suite green.

### - [ ] B5 — 🤖 Polish sweep + browser verify (S)
- `ai.*` i18n audit: add `ai.error.*`/B2–B4 keys, delete dead ones (`ai.overwriteConfirm`, `ai.modelLoading` if unreferenced after B1 — check `aiButtonState`'s `ai.modelLoading` branch first, it IS still used by health gating). Focus management; disabled-with-reason tooltips still correct; dark + light pass; axe pass on board/drawer/overview.
- Optional (cheap, no AWS): one e2e spec asserting the disabled-with-reason state when `AI_PROVIDER=''` — extends the existing local-only playwright suite, not CI.
- **DoD:** full suite green (est. **api ≈111–112 · web ≈47–48**, from 107/37); PROGRESS row with screenshots; FEATURES.md refresh ("clearer AI errors, editable previews, cancellable generation") + date bump.

## Part C — Catalog: every further "AI auto-populate" surface (brainstorm, owner triages)

*Researched against the real schema (18 models) and all 20 pages/45 components. Nothing here is committed. Effort: S < half-day · M ~ a day · L multi-day.*

### C-1 Ticket-level

| # | Surface | What auto-populates | Where it lives | Effort | Notes |
|---|---|---|---|---|---|
| T1 | **Break into subtasks** | 3–7 child tickets (title+AC) as a reviewable checklist → bulk-create | TicketDrawer subtasks section; `parentId` + done/total chips exist | M | Highest-value candidate; natural next endpoint `POST /api/ai/subtasks` |
| T2 | **AC-only regenerate** | Just the AC list | Drawer AC field, small ✨ affordance | S | Narrow reuse of expand-ticket |
| T3 | **Title sharpen** | Concise imperative title from description | Drawer title field | S | One-field generation |
| T4 | **Story-point suggestion** | `storyPoints` guess + one-line rationale | Drawer estimate field | M | Context = org's recently pointed tickets; suggestion chip, never auto-set |
| T5 | **Label suggestion** | 1–3 labels from the org's existing set | Drawer labels section | S/M | Closed-set classification — small-model-friendly |
| T6 | **Priority/type sanity chip** | "Reads like a HIGH bug" hint on mismatch | Drawer | S | Passive, zero write path |
| T7 | **Duplicate detection** | "3 similar tickets exist" on create/draft | Composer + drawer | L | Needs embeddings — **pgvector is already in the Postgres image**; pairs with Phase 5 |
| T8 | **Comment thread TL;DR** | Collapsible digest above 10+-comment threads | Drawer comments | M | Ephemeral like project-summary |

### C-2 Sprint & planning

| # | Surface | What auto-populates | Where | Effort | Notes |
|---|---|---|---|---|---|
| S1 | **Sprint goal draft** | Goal sentence from committed tickets | Sprints page (goal edit exists, R12; `Sprint.goal` field exists) | S/M | Clean fit |
| S2 | **Sprint retro digest** | Shipped / spilled / notable on completion | Completed sprint card | M | Same shape as project-summary |
| S3 | **Sprint planning assist** | Suggested next-sprint set (priority × points × velocity) | Sprints/backlog | L | Defer until points usage matures |

### C-3 Project & reporting

| # | Surface | What auto-populates | Where | Effort | Notes |
|---|---|---|---|---|---|
| P1 | **Reports narrative** | Written digest under velocity/cycle/readiness charts | ProjectReports | M | Overview-service reuse |
| P2 | **Release notes generator** | User-facing notes from DONE tickets since a milestone | Reports/milestone view | M | Copy-out, never stored |
| P3 | **Milestone risk commentary** | Per-milestone "at risk because…" | Overview readiness / Gantt | M | Readiness data exists |
| P4 | **Project brief draft** | Project description on create | OrgProjects create flow | S | Smallest win |

### C-4 Cross-cutting / input surfaces

| # | Surface | What auto-populates | Where | Effort | Notes |
|---|---|---|---|---|---|
| X1 | **NL quick-add** | "fix login on Safari, urgent, next sprint" → R9 quick-add tokens → prefilled composer | CommandPalette + composer | M | Very demo-able; structured classification |
| X2 | **CSV import mapping** | Arbitrary CSV headers → field mapping | CsvTools import | M | Onboarding win |
| X3 | **NL search → filters** | "unassigned urgent bugs in sprint 3" → existing multi-select filter state | Search/list filters | M/L | Closed filter vocabulary |
| X4 | **My-work standup draft** | Yesterday/today/blockers from own tickets + activity | MyWork page | M | Personal, ephemeral, copy-out |
| X5 | **Template generator** | New `TicketTemplate` from a one-line ask | TemplatesCard (org settings) | S/M | Templates = title+description only |
| X6 | **Notification digest** | "While you were away" rollup | NotificationBell | M | Park until volume justifies |

### - [ ] C0 — ⛔ 🧑 `[MANUAL — owner]` triage
- Owner picks **up to 3** to become 3.8.1 stretch (or a 3.8.3 batch). Suggested shortlist by value÷effort: **T1 subtasks · S1 sprint goal · X1 NL quick-add** (T2/T5/X5 as cheap fillers).

## Sequencing & scope

- **Order:** **B1** (error truth — ~an hour, independent, ships alone) → **A1** (extraction + baseline) → **A2+A3** (tune with measurement) → **A6** (telemetry, pairs naturally with A2's seam touch) → **B2 → B3 → B4 → B5** → **A4** (A/B once prompts are stable, so the comparison is fair) → **⛔ A5** (model decision) → **⛔ C0** (surface triage).
- **Out of scope:** real token streaming (B2 decision recorded); BYOK (→ 3.8.2); embeddings/duplicates (T7 → Phase-5 track); persisting AI output server-side; instance-role/budget-alert/key-rotation hardening (tracked in 3.8 Part E deferred list — do alongside, not inside, this phase).
- **Exit criteria:** measurable scorecard improvement over the A1 baseline; truthful per-code error copy; skeleton + cancellable generation; editable draft preview; per-field auto-fill review; full suite green (**api ≈111–112 · web ≈47–48** from 107/37); owner model decision + C0 triage recorded in PROGRESS.

## Handoff notes for the implementing session (read before starting)

1. **Environment:** dev stack = `docker compose up` from `sourcecode/` (api on :3001, web on :3000). Bedrock dev creds already in `sourcecode/.env` (`AI_PROVIDER=bedrock`, IAM user `pmagent-dev-bedrock`) — live generations work from the dev stack today.
2. **Container gotchas (memory-backed, they bite):** after ANY api source edit → `docker compose restart api` before verifying (tsx watch misses bind-mount changes). After adding a dep → rebuild the api container. No schema changes are planned in this phase (no prisma steps needed).
3. **Tests:** api suite must stay hermetic — AWS SDK is `vi.mock`ed in `src/test/ai.test.ts`; never add a test that reaches AWS (CI has no creds). Baselines: **api 107 · web 37**. Run `pnpm turbo lint typecheck test` from `sourcecode/` for the CI-equivalent gate.
4. **The eval harness is NOT a test** — it spends real tokens; keep it out of vitest/CI; it self-loads `../../.env`.
5. **Live-endpoint curl testing needs a token:** the `agentpm-web` KC client has direct-access-grants OFF — temporarily enable via the KC admin API, then revert (never edit the committed `realm-agentpm.json`). Browser verification through the real UI is usually easier.
6. **House rules:** PROGRESS.md row + checkbox tick in the same commit as each step; FEATURES.md on user-facing ship (B5); the six 3.7.2 UI patterns apply to every new component (B3/B4 especially); commit locally on `dev`, **never push without the owner's explicit go**.
7. **Deploy reality (if a step reaches prod):** merging to `main` triggers CI/CD; `deploy.yml` scp-syncs compose files and writes the AI env (incl. secrets) into the box's `.env.prod` every deploy. Model flips for A5 happen in `deploy.yml`'s env block (`BEDROCK_MODEL_ID`), not in code.
