# Phase 3.8 — Local AI ticket drafting (Ollama on the existing EC2)

> **Status: 📋 OPEN** (specced 2026-07-08; provider-tier strategy confirmed by owner same day). Source: owner-supplied external plan (`~/Downloads/ai-tickets-implementation-plan.md`), adapted to this repo's conventions. Goal: bring the **3.7 R10 inert Beta AI buttons to life** using a self-hosted LLM — **Ollama + `qwen2.5:7b`** as a container on the existing EC2 (Mumbai) — no cloud LLM APIs in this phase, data never leaves the box.
>
> **Product strategy (owner, 2026-07-08) — this is NOT a throwaway experiment.** The AI stack has three permanent tiers: **(1) self-hosted small models = the always-available baseline** for in-product text generation (every user gets AI, no key needed); **(2) BYOK** — an org/user who brings their own Claude/other-LLM key gets the *same features* routed through that provider (follow-up phase; needs encrypted key storage + settings UI); **(3) Phases 5/6 dev agents** run on large LLMs as originally planned — unaffected here. Consequence for this phase: `ai.service.ts` is built as an **`AIProvider` seam from day one** — routes and UI depend only on the interface; `OllamaProvider` is merely the first implementation, and the BYOK provider drops in later without touching endpoints or buttons. Only the *infra sizing* (EC2 resize, model choice) stays reversible-by-design.

## Conflicts with the external plan (surfaced per its own instruction — resolved as follows)

1. **"Email generation" has no home.** The product sends no email anywhere (notifications are IN_APP; the EMAIL channel enum is a Phase 4 stub). The third stubbed button is actually a **project status summary** (`ProjectOverview.tsx` "Generate summary"). → Use case (c) becomes **project summary digest**; email generation is **deferred to Phase 4** when email exists.
2. **`IMPLEMENTATION.md` at repo root** conflicts with house logging (PROGRESS.md + phase checkboxes, same commit as the code). → Keep house convention; the "outlives-the-session" ops content (runbook, pricing, teardown) goes to **`release-doc/AI-EXPERIMENT.md`** (C3).
3. **Schema field names** align to the repo, not the plan: `{title, description, acceptanceCriteria[], priority}` (camelCase; `title` not `summary`; priority enum `URGENT|HIGH|MEDIUM|LOW`; `acceptanceCriteria` is a **string** field on Ticket — the model returns an array, the client joins with `- ` bullets).
4. **Checkpoint style:** the external plan's step-1 "approve before code" is satisfied by this spec's owner review; the only remaining hard checkpoint is **before Part C** (real money: EC2 resize).

## Current state (what already exists — do not rebuild)

- **The three inert affordances (3.7 R10):** board quick-add "Draft with AI" (`apps/web/src/components/board/Column.tsx:171`), drawer "Auto-fill from prompt" (`components/TicketDrawer.tsx:782`), Overview "Project summary" card with disabled "Generate summary" (`pages/ProjectOverview.tsx:~420-433`). All render `BetaAIButton`/`BetaBadge` from `components/BetaBadge.tsx` — designed as a single seam to flip live.
- **Auth/limits to reuse:** every AI endpoint sits behind `requireAuth` + org-role resolution exactly like existing routes (`loadTicketAuthorized`, `assertOrgRole`); per-route rate-limit config exists since 3.7.4 D2 (`config: { rateLimit: {...} }`, Redis-backed).
- **Config pattern:** `config.ts` env loader; optional-infra precedent is `REDIS_URL` (absent → feature off, tests hermetic). AI follows it: **no `OLLAMA_BASE_URL` → AI disabled**, buttons show disabled-with-reason. This is also the plan's "disable without redeploy" flag (edit `.env.prod`, `docker compose restart api` — no image rebuild).
- **Compose:** base `docker-compose.yml` (+ dev override, prod override); `selfhost-data` profile precedent for optional services. Ollama gets an **`ai` profile** so dev machines don't pay the 5 GB model unless opted in.
- **Quality bar:** 3.7.2 UI standards apply (Loader2 busy states — generations take **5–20 s on CPU**, so the loading UX matters more than usual; inline errors; i18n via `t()`; focus ring). Test baselines entering: **api 89 · web 32**.

## Conventions (read once)

- Same as 3.7.4: workspace root `sourcecode/`; restart api container after new files; rebuild after dep changes; one step = one commit + PROGRESS row (+ FEATURES.md for user-facing B-steps). **Never `git push`** unless the owner says so.
- **Local dev for A/B:** either run Ollama natively (`ollama pull qwen2.5:7b`, default `http://localhost:11434`) or `docker compose --profile ai up` after C1. All api tests **mock the client** — no test ever needs a live model.
- **Prompt hygiene:** user text goes into the prompt as data; the output is only ever a **draft the same user reviews** (no tool use, no auto-save, no other-user visibility), so prompt-injection blast radius is nil-by-design. Render through existing components (the markdown pipeline already DOMPurifies); never `dangerouslySetInnerHTML` raw model output.

---

## Part A — API: Ollama client + three endpoints (local, hermetic)

### - [ ] A1 — `ai.service.ts`: `AIProvider` seam + Ollama impl + config + health (M)
- `config.ts`: `OLLAMA_BASE_URL` (default `''` = disabled), `OLLAMA_MODEL` (default `qwen2.5:7b`), `AI_TIMEOUT_MS` (default `120000`). Add to `.env.example` under a new `# ── AI (optional, 3.8) ──` block.
- New `services/ai.service.ts`, structured as the **permanent provider seam** (owner strategy above):
  - `interface AIProvider { generate<T>(opts: { system: string; user: string; schema: JSONSchema; zod: ZodType<T> }): Promise<T>; health(): Promise<{ reachable: boolean; modelReady: boolean }> }`.
  - `class OllamaProvider implements AIProvider` → POST `{OLLAMA_BASE_URL}/api/chat` with `{ model, stream: false, format: schema, options: { temperature: 0.2, num_ctx: 4096 }, messages }`, `AbortSignal.timeout(AI_TIMEOUT_MS)`. Parse `message.content` as JSON → validate with the zod schema. On parse/validation failure: **one corrective re-prompt** (append the error + "return ONLY valid JSON matching the schema"), then throw.
  - `resolveProvider(/* orgId */): AIProvider | null` — v1 returns the Ollama provider iff `OLLAMA_BASE_URL` is set, else `null` (= AI disabled). The signature takes the org context **now** so the BYOK phase only changes this one function (org key present → cloud provider; else → local). Routes/UI never know which provider ran.
  - Typed failures via `ApiError`: 503 `AI_UNAVAILABLE` (no provider / fetch failed), 504 `AI_TIMEOUT`, 502 `AI_BAD_OUTPUT` (invalid after retry). The global error handler already maps these.
  - `aiHealth()` → provider's `health()` (Ollama: GET `/api/tags`, model present?) → `{ enabled, reachable, modelReady, provider: 'ollama' }` (the `provider` field future-proofs the UI's "powered by" hint for BYOK).
- `GET /api/ai/health` (new `routes/ai.ts`, `requireAuth`) returning that shape — drives the frontend's disabled-with-reason.
- Tests (`src/test/ai.test.ts`, mock `fetch` via `vi.stubGlobal`): schema-valid pass-through; malformed → corrective retry → success; malformed twice → 502; timeout → 504; disabled → health `{enabled:false}` and endpoints 503. **api 89 → ~94.**

### - [ ] A2 — `POST /api/ai/draft-ticket` (M)
- Body (zod): `{ projectId: uuid, notes: string 1..4000 }`. Auth: resolve project → `assertOrgRole(MEMBER)` (same pattern as `routes/tickets.ts` create). Rate limit `10/min` per route (AI is expensive — D2 pattern).
- Prompt (system): senior PM writing a work ticket; be concrete, no invented requirements; priority only from `URGENT|HIGH|MEDIUM|LOW`. Output schema `{ title: string, description: string, acceptanceCriteria: string[], priority: enum }` (JSON-schema for Ollama `format` + mirrored zod).
- Response: `{ draft: {...} }` — **never creates the ticket**; the client composes it into the existing create flow.
- Test: mocked happy path + notes-too-long 400 + non-member 403. **~api +2.**

### - [ ] A3 — `POST /api/ai/expand-ticket` (S)
- Body: `{ ticketId: uuid, prompt?: string ≤2000 }`. Auth via the `loadTicketAuthorized(request,'MEMBER')` helper pattern. Context fed to the model: ticket title + existing description/AC/goal/constraints (truncate to fit `num_ctx`), plus the user's optional steer.
- Output schema `{ description, acceptanceCriteria: string[], goal, constraints }`. Returns a draft; the drawer fills editable fields, user saves normally (existing PATCH). Rate limit `10/min`. Test: happy + 404. **~api +1–2.**

### - [ ] A4 — `POST /api/ai/project-summary` (M)
- Body: `{ projectId: uuid }`, MEMBER. Context: reuse `overview.service.ts` data (counts by status, sprint state, blocked tickets, recent activity titles — cap the payload, no full descriptions). Output `{ headline: string, bullets: string[], risks: string[] }`. Rate limit `5/min` (heaviest context). Test: happy + non-member 403. **~api +1–2. Exit Part A: api ~94–97.**

## Part B — Web: bring the three buttons to life

### - [ ] B1 — api client + health hook + live `AIButton` (S)
- `lib/api.ts`: `aiHealth()`, `aiDraftTicket(projectId, notes)`, `aiExpandTicket(ticketId, prompt?)`, `aiProjectSummary(projectId)`.
- `useAIHealth` react-query hook (staleTime ~60 s). Extend `components/BetaBadge.tsx` with a live `AIButton` (Sparkles + label + spinner) that renders **enabled** when health is green, **disabled with reason tooltip** (`ai.unavailable` / `ai.modelLoading`) otherwise — the Beta badge drops once wired. Keep `BetaAIButton` for anything still inert.

### - [ ] B2 — Board quick-add "Draft with AI" (M)
- In `Column.tsx` quick-add: the composer's current text = the rough notes. Click → `aiDraftTicket` with a **visible progress state** (Loader2 + `ai.generating` hint "~10–20 s"). Result renders as a **draft preview card** (title, description excerpt, AC bullets, priority chip) with **Create** / **Discard** — create goes through the existing `createTicket` mutation (`acceptanceCriteria` array joined as `- ` lines). Errors inline (`ai.failed` + retry), never a silent toast-swallow.
- i18n `ai.*` namespace; FEATURES.md "AI drafting (beta, self-hosted)" section.

### - [ ] B3 — Drawer "Auto-fill from prompt" (M)
- `TicketDrawer.tsx:782` → live: small inline prompt input (optional steer) + generate; on success **fill the editable fields** (description/AC/goal/constraints) marked dirty for review — user saves with the normal Save. Confirm-overwrite if a field already has content. Same loading/error patterns.

### - [ ] B4 — Overview "Generate summary" (S)
- `ProjectOverview.tsx` card: button live → renders `{headline, bullets, risks}` in the card (typography, not raw JSON), "Regenerate" after. Cache in react-query keyed `['ai-summary', projectId]` (no persistence — a digest is ephemeral by design). Update the card's hint copy.
- **Exit Part B: web 32 → ~34** (AIButton + one flow test with mocked api), typecheck + build + browser-verify all three flows against local Ollama.

## Part C — Infra, deploy & runbook

> **C1 is free (a local container) and may be done any time — do it *before* Part B's browser verification** so the app can talk to a real local model via `docker compose --profile ai up`. (Alternative: host-installed Ollama at `http://localhost:11434`; on Apple Silicon that's actually faster than the EC2 CPU.) The **⛔ owner checkpoint gates C2 + C3 only** — those cost real money.

### - [ ] C1 — Compose: `ollama` service under an `ai` profile (S)
```yaml
  ollama:
    image: ollama/ollama:latest   # needs ≥0.5 — JSON-schema `format` (structured outputs) landed in 0.5.0
    profiles: ["ai"]
    volumes: [ollama-models:/root/.ollama]
    environment: { OLLAMA_KEEP_ALIVE: 30m }
    # NO ports: — reachable only on the compose network (api → http://ollama:11434)
    deploy: { resources: { limits: { memory: 10g } } }
```
- Named volume `ollama-models`; `.env.example` gains `OLLAMA_BASE_URL=http://ollama:11434` (commented out = disabled). Verify dev: `docker compose --profile ai up -d ollama && docker compose exec ollama ollama pull qwen2.5:7b`, then api health goes green.

### - [ ] C2 — `[MANUAL — owner]` EC2 resize + model pull ⛔ **owner go-ahead required from here (costs real money)** (record numbers in the PROGRESS row)
1. Stop `pmagent` instance → change type `t3.medium` → **`t3.xlarge`** (4 vCPU/16 GB) → start (~2 min downtime; Elastic IP retained).
2. `df -h` — need ~6 GB free for the model (resize EBS/gp3 if tight).
3. On the box: add `--profile ai` to the compose invocation, `docker compose up -d ollama`, `ollama pull qwen2.5:7b`.
4. **Security:** no new security-group rules; from outside, `curl -m5 http://<host>:11434` must fail. Record `free -h` with model loaded + stack running; if Keycloak's JVM is greedy, cap its heap.

### - [ ] C3 — Deploy, verify, runbook + pricing (M)
- `.env.prod`: `OLLAMA_BASE_URL=http://ollama:11434`; ship api+web via the normal pipeline (merge → images → SSH deploy); restart.
- **E2E verify on prod:** health green; one sample output per feature pasted into the PROGRESS row; latency measured; `docker stop ollama` → buttons degrade to disabled-with-reason, `start` → recovery **without redeploy**; RAM headroom recorded.
- New **`release-doc/AI-EXPERIMENT.md`**: architecture sketch; start/stop routine + **recommend an EC2 auto-stop schedule**; model update/swap; log locations; slow-generation triage (model unloaded? burst credits? swapping?); **pricing with live-verified numbers** (t3.xlarge ap-south-1 ≈ $0.1792/hr on-demand → at ~60 h/mo + gp3 + EIP + Route 53 + 18% GST ≈ **₹1,900–2,100/mo**, vs ~₹850 baseline; watch t3 **burst-credit surplus billing** in CloudWatch after week 1; upgrade path t3.2xlarge ≈ ₹3,100/mo); **full teardown**: remove `ai` profile + `ollama-models` volume, unset env, revert deploy, resize back to t3.medium → bill returns to baseline.

---

## Sequencing & scope notes
- Order **A1→A4 → C1 (free, enables local model) → B1→B4** browser-verified against local Ollama, then **⛔ checkpoint → C2→C3**. Expect 1–2 prompt-tuning iterations during B: a 7B model needs shorter, more directive prompts than a frontier model — judge output samples with the owner before calling B done.
- **Out of scope (this phase):** **BYOK** — org-scoped provider keys (encrypted at rest, masked in UI, org-settings card, `ClaudeProvider` adapter, per-org `resolveProvider` lookup) is its own follow-up phase (**3.8.1**, spec when 3.8 lands); email generation (no email in product — Phase 4); streaming responses (`stream:false` keeps v1 simple); persisting summaries; auto-creating tickets without review; GPU instances; any second local model. **Phases 5/6 dev agents (large LLMs) are a separate track — nothing here constrains them.**
- **Tear-down guarantee (infra only):** the *sizing experiment* is reversible — env var, one profiled compose service, resize back — per C3's list. The provider seam, endpoints, and wired buttons are **permanent product surface** (the baseline tier).
- Expected exit: **api ~94–97 · web ~34**, three live AI features on prod, `release-doc/AI-EXPERIMENT.md` as the standing runbook.
