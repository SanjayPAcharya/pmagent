# Phase 3.8.1 — AI polish: output quality + UX (plan only, not started)

> **Status: 📋 PLANNED (2026-07-11, owner-directed).** Phase 3.8 shipped the three AI features to prod (Bedrock Nova Micro). This phase polishes them on two axes the owner picked: **(A) output quality** and **(B) generation UX**. It also carries **(C)** the researched catalog of every further "AI auto-populate" surface in the product — a brainstorm backlog the owner triages; nothing in C is committed scope.
>
> **Renumbering note:** BYOK (org's own key) was previously earmarked "3.8.1"; it is now **Phase 3.8.2**. The `AIProvider` seam and `resolveProvider(orgId)` remain its single switch point — nothing in this phase touches that design.
>
> **Legend:** 🤖 = Claude implements end-to-end. 🧑 `[MANUAL — owner]` = owner judgment/console. ⛔ = checkpoint, stop for owner decision.

## Ground truth (verified in code, 2026-07-11)

- Three endpoints (`draft-ticket`, `expand-ticket`, `project-summary`) behind the `AIProvider` seam; `BedrockProvider` uses Converse **forced-tool JSON** + zod + one corrective retry; `.min(1)` AC guard added in D5. Prod = Nova Micro, ~1–2.6s per generation.
- **Error UX gap (B1's target):** `ApiError` already carries the typed `code` to the frontend (`lib/api.ts:44`), but all three call sites swallow it — `catch {}` → generic `t('ai.failed')` (`Column.tsx:93`, `TicketDrawer.tsx:119`, `ProjectOverview.tsx:468`). 503/504/502 are indistinguishable to the user today.
- **Loading UX today:** boolean `generating` state → spinner + static hint. A `ui/skeleton.tsx` primitive + `BoardSkeleton` precedent exist to build on. No cancel, no staged progress, no aria-live announcement.
- **Preview flows today:** draft preview card is read-only (Create/Discard only — no edit, no regenerate, no per-bullet control); auto-fill overwrite is all-or-nothing behind a single `window.confirm`-style gate.
- Prompts: one directive system prompt per endpoint, one tuning pass done (the `.min(1)` fix). No few-shot examples, no eval fixtures, temperature fixed 0.2 everywhere.

---

## Part A — Output quality (eval first, then tune, then A/B)

*Principle: no blind prompt fiddling. Build a tiny repeatable eval, measure, tune, then let the owner judge a model A/B with real costs. Everything stays behind the seam; a model switch remains a pure `BEDROCK_MODEL_ID` flip.*

### - [ ] A1 — 🤖 Eval fixtures + harness script (S/M)
- New `apps/api/scripts/ai-eval.ts` (run manually via `pnpm --filter @agentpm/api ai:eval` — **never in CI**, it spends real tokens; guarded on `AI_PROVIDER` being set).
- Fixture set in `apps/api/scripts/ai-eval-fixtures.json`: ~8 draft-ticket note samples (terse one-liner, rambling paragraph, bilingual/typo'd, bug vs feature vs chore, urgency-implying), ~5 expand-ticket tickets (thin title-only → rich), ~3 project-summary contexts (empty, healthy, blocked-heavy) — synthetic, no real org data.
- Harness: runs each fixture N=3 times against the live provider, prints a scorecard per run — schema-valid on first attempt? retry fired? AC count / AC testability heuristic (starts with verb, contains measurable outcome), title word count, invented-requirement smell (output nouns absent from input), latency, token usage. Writes `ai-eval-report.md` for the owner.
- Exit: baseline Nova Micro scorecard checked into `release-doc/` (report only, not fixtures-as-tests).

### - [ ] A2 — 🤖 Prompt tightening per endpoint (M)
- Informed by A1's failure patterns. Techniques on the table for a small model (all short + directive — Nova Micro degrades with long prompts):
  - **One few-shot exemplar** per endpoint inside the system prompt (a single perfect in/out pair; measure token-cost vs quality delta in A1 before keeping).
  - Tighter field directives: description = context→scope→out-of-scope; AC = Given/When/Then-ish testable outcomes; explicit "do not echo the notes back".
  - **Anti-thin-input rule**: when notes are one vague line, instruct the model to stay minimal instead of hallucinating scope (A1's invented-requirement metric verifies).
  - Per-endpoint `temperature`/`maxTokens` in `inferenceConfig` (summary lower temp than draft; cap tokens to stop rambling descriptions).
- Each change re-run through A1; keep only what moves the scorecard. Hermetic tests updated only if the request shape changes (temperature/maxTokens per endpoint).

### - [ ] A3 — 🤖 Context enrichment (M) — *biggest quality lever, endpoint-by-endpoint*
- **draft-ticket:** pass project name + up to ~10 existing ticket titles (style anchor: the model mimics the project's naming register) + org's label names so drafts use the team's vocabulary. Caps: keep total context < ~1.5k chars.
- **expand-ticket:** already passes the ticket's own fields; add parent title (for subtasks) + up to 5 sibling/related ticket titles.
- **project-summary:** already rich (overview service). Add sprint goal text if an active sprint exists.
- All additions are read-only queries the caller is already authorized for (same org-role gate); PII posture unchanged (titles only, never descriptions of other tickets). Hermetic tests: assert the enriched context lands in the Converse payload.

### - [ ] A4 — 🤖 Model A/B harness + cost table (S)
- A1's harness gains `--model <id>` override. Run the full fixture set against: `apac.amazon.nova-micro-v1:0` (baseline) → `apac.amazon.nova-lite-v1:0` / Nova 2 Lite (verify exact APAC profile IDs via `list-inference-profiles` at run time) → `global.anthropic.claude-haiku-*` (needs the one-time self-declaration form first — owner said individual-developer details are accepted; **skip if the form isn't done**, Nova Pro is the no-form fallback).
- Produce a side-by-side report: per-fixture outputs + scorecard + **₹/month projection at expected volume** for each model. (Nova Micro ≈ ₹10–40 · Haiku ≈ ₹320 — refresh prices at run time.)

### - [ ] A5 — ⛔ 🧑 `[MANUAL — owner]` quality judgment + model decision
- Owner reads the A4 report, eyeballs the side-by-sides, picks the prod model. Switch = GitHub secret / `.env.prod` `BEDROCK_MODEL_ID` flip + redeploy — **no code**. Record the decision + cost delta in PROGRESS.

## Part B — Generation UX

*Principle: at 1–2.6s real latency, honest fast feedback beats fake streaming. Fix the error truthfulness first (cheapest, highest trust win), then perceived latency, then the two review flows.*

### - [ ] B1 — 🤖 Error copy per failure code + retry semantics (S)
- All three call sites stop swallowing the error: `catch (e)` → map `e instanceof ApiError` by `code`:
  - `AI_UNAVAILABLE` (503) → "AI is temporarily unavailable — your work is untouched. Try again in a minute." (+ auto-refetch health so buttons re-gate).
  - `AI_TIMEOUT` (504) → "The AI took too long. Usually transient — try again."
  - `AI_BAD_OUTPUT` (502) → "The AI returned something unusable. Regenerate, or write it manually."
  - 429 (rate limit) → "Too many AI requests — wait a moment." (limits: 10/min draft & expand, 5/min summary).
  - anything else → keep generic `ai.failed`.
- Shared `aiErrorKey(err): string` helper in `lib/useAIHealth.ts` (pure, unit-tested — one test per code) so the three sites stay identical. New `ai.error.*` i18n keys. Retry button stays on every error.

### - [ ] B2 — 🤖 Perceived latency: skeleton preview + staged hint + cancel (M)
- **Skeleton, not spinner:** while generating, render a shimmer shaped like the coming result (draft card: title bar + 3 bullet lines + priority chip; summary: headline + bullets; auto-fill: shimmer over the target fields). Reuses `ui/skeleton.tsx`.
- **Staged hint:** one `ai.generating` line that advances on a timer ("Reading your notes…" → ~1.5s → "Drafting…" → ~4s → "Almost there…") — honest theater, no fake tokens; screen-reader-safe (`aria-live="polite"`, announce start + done only, not each stage).
- **Cancel:** `AbortController` on the fetch; Esc or a Cancel button aborts, UI returns to idle, no error toast. (Server work isn't cancelled — Bedrock finishes and the response is dropped; acceptable at these token sizes, note in code.)
- **Decision — no real token streaming in this phase:** forced-tool JSON arrives as one block; `ConverseStream` + partial-JSON assembly is high effort for ~1–2s of raw latency, and the draft must be zod-validated *complete* before it's shown anyway. Re-visit only if a model switch pushes latency > ~5s.

### - [ ] B3 — 🤖 Draft-preview upgrade: editable + regenerate + per-bullet AC (M)
- Preview card fields become **editable in place** (title input, description textarea, priority select) — what you edit is what Create submits.
- **Per-AC-bullet checkboxes** (all checked by default) — unchecked bullets are dropped on Create.
- **Regenerate** button on the card (keeps the notes; re-runs; replaces the draft — edits are lost, so confirm-if-edited via the existing destructive-confirm pattern).
- Notes survive Discard (composer text is not cleared — already true, lock with a test).
- Tests: edit-then-create composes edited values; unchecked AC dropped; regenerate confirm fires only when dirty.

### - [ ] B4 — 🤖 Auto-fill: per-field diff/accept instead of all-or-nothing (M)
- Replace the single overwrite-confirm with a **field-level review**: for each of description/goal/AC/constraints show current vs proposed (proposed pre-selected only where current is empty; conflict fields default to *keep current*), Accept-per-field toggles + "accept all".
- Accepted values land in the edit-mode fields; the normal Save persists (server contract unchanged — still zero AI auto-save).
- Follows the 3.7.2 patterns (inline validation, destructive token for overwrites, focus ring); keyboard accessible; `aria-live` announcement when proposals arrive.
- Tests: empty-field default-accept, conflict default-keep, mixed accept composes correctly.

### - [ ] B5 — 🤖 Polish sweep + browser verify (S)
- `ai.*` i18n audit (new keys from B1–B4, drop dead ones); focus management (focus the preview card / first diff on arrival); disabled-with-reason tooltips still correct; dark + light pass; axe pass on the three surfaces.
- Full-suite green + live browser verification of all three flows on dev stack; screenshots in the PROGRESS row. Expected test delta: web +8–12, api +2–4.

## Part C — Catalog: every further "AI auto-populate" surface (brainstorm, owner triages)

*Researched against the real schema (18 models) and all 20 pages/45 components. Nothing here is committed. Effort: S < half-day equiv · M ~ a day · L multi-day. Value = owner's product judgment, pre-scored by likely PM usefulness.*

### C-1 Ticket-level (fits the existing seam pattern almost 1:1)

| # | Surface | What auto-populates | Where it lives | Effort | Notes |
|---|---|---|---|---|---|
| T1 | **Break into subtasks** | 3–7 child tickets (title+AC each) as a reviewable checklist → bulk-create | TicketDrawer (subtasks section); `parentId` + done/total chips already exist | M | Highest-value candidate; natural next endpoint `POST /api/ai/subtasks` |
| T2 | **AC-only regenerate** | Just the AC list, appended or replaced | Drawer AC field, small ✨ affordance | S | Cheap reuse of expand-ticket with a narrower schema |
| T3 | **Title sharpen** | Concise imperative title from description | Drawer title field | S | One-field generation; trivially reviewable |
| T4 | **Story-point suggestion** | `storyPoints` guess + one-line rationale | Drawer estimate field | M | Context = org's recently pointed tickets (title+points pairs); suggestion-only chip, never auto-set |
| T5 | **Label suggestion** | 1–3 labels from the org's existing label set | Drawer labels section | S/M | Closed-set classification — small-model-friendly; only suggests *existing* labels |
| T6 | **Priority/type sanity chip** | "This reads like a HIGH bug" hint when text and current value disagree | Drawer | S | Passive hint, zero write path |
| T7 | **Duplicate detection** | "3 similar tickets exist" on create/draft | Board composer + drawer | L | Needs embeddings or title-similarity service — pgvector is already in the image (`pgvector/pg15`!); bigger arch step, pairs with Phase 5 |
| T8 | **Comment thread TL;DR** | Collapsible summary above a 10+-comment thread | Drawer comments | M | Read-only digest; ephemeral like project-summary |

### C-2 Sprint & planning

| # | Surface | What auto-populates | Where | Effort | Notes |
|---|---|---|---|---|---|
| S1 | **Sprint goal draft** | Goal sentence from the sprint's committed tickets | Sprints page (goal edit exists, R12) | S/M | Clean fit; context = ticket titles in sprint |
| S2 | **Sprint retro digest** | Shipped / spilled / notable, on completion | Sprints page, completed sprint card | M | Same shape as project-summary |
| S3 | **Sprint planning assist** | Suggested next-sprint ticket set (priority × points × velocity) | Sprints/backlog | L | Real planning logic + AI rationale; defer until points usage matures |

### C-3 Project & reporting

| # | Surface | What auto-populates | Where | Effort | Notes |
|---|---|---|---|---|---|
| P1 | **Reports narrative** | Written digest under the velocity/cycle/readiness charts ("velocity dipped 20%…") | ProjectReports | M | Overview-service reuse + chart datapoints as context |
| P2 | **Release notes generator** | User-facing notes from DONE tickets since a milestone/date | Reports or milestone view | M | Copy-out (clipboard/markdown), never stored |
| P3 | **Milestone risk commentary** | Per-milestone "at risk because…" one-liner | Overview readiness / Gantt | M | Readiness data exists; needs careful hedged wording |
| P4 | **Project brief draft** | Project description on create | OrgProjects create flow | S | Smallest possible win |

### C-4 Cross-cutting / input surfaces

| # | Surface | What auto-populates | Where | Effort | Notes |
|---|---|---|---|---|---|
| X1 | **NL quick-add** | "fix login on Safari, urgent, next sprint" → parsed quick-add tokens (R9 token system exists) → prefilled composer | CommandPalette + board composer | M | Very demo-able; structured-output classification, small-model-friendly |
| X2 | **CSV import mapping** | Arbitrary CSV headers → ticket-field mapping suggestion | CsvTools import | M | One-shot classification per import; big onboarding win |
| X3 | **NL search → filters** | "unassigned urgent bugs in sprint 3" → existing multi-select filter state | Search / list filters | M/L | Maps to a closed filter vocabulary; no new search engine |
| X4 | **My-work standup draft** | Yesterday/today/blockers from the user's tickets + activity | MyWork page | M | Personal digest, ephemeral, copy-out |
| X5 | **Template generator** | New `TicketTemplate` (title+description skeleton) from "make a template for security reviews" | TemplatesCard (org settings) | S/M | Templates are just title+description — trivial schema |
| X6 | **Notification digest** | "While you were away" rollup of unread notifications | NotificationBell | M | Volume is low today; park until notification volume justifies it |

### - [ ] C0 — ⛔ 🧑 `[MANUAL — owner]` triage
- Owner picks **up to 3** from the catalog to become 3.8.1 stretch (or a 3.8.3 batch). Suggested shortlist by value÷effort: **T1 subtasks · S1 sprint goal · X1 NL quick-add** (with T2/T5/X5 as cheap fillers). Everything else stays parked here.

## Sequencing & scope

- **Order:** B1 (error truth, ~an hour, ships alone) → A1 (eval baseline) → A2+A3 (tune with measurement) → B2 → B3 → B4 → B5 → A4 (A/B once prompts are stable, so the comparison is fair) → ⛔ A5 (model decision) → ⛔ C0 (surface triage).
- **Out of scope:** real token streaming (B2 decision); BYOK (→ 3.8.2); embeddings/duplicate detection (T7 → Phase-5 track); persisting any AI output server-side; instance-role/budget-alert hardening (tracked in 3.8 Part E deferred list — do alongside, not inside, this phase).
- **Exit criteria:** measurably better drafts (A1 scorecard delta recorded), truthful per-code error copy, skeleton+cancel generation feel, editable draft preview, per-field auto-fill review, full suite green (est. api ≈110 · web ≈47), owner has made the model call and the surface triage.
