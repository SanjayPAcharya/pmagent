# Phase 3.8 — AI ticket drafting via Amazon Bedrock (Nova Micro first)

> **Status: 🔨 IN PROGRESS — strategy pivoted 2026-07-09 (owner decision).** v1 inference runs on **Amazon Bedrock from ap-south-1** with **Amazon Nova Micro** (cheapest viable model, ~₹10–40/mo at expected volume). If Nova Micro's output quality disappoints, switching to **Claude Haiku 4.5 / Sonnet** is an **env-var change** — same seam, same endpoints, same buttons. The original self-hosted local-model tier (Ollama + qwen2.5:7b) is **dropped**: no EC2 resize, no model ops, and the owner accepts ticket text leaving the product for the MVP ("will figure out later"). Cost/availability research (2026-07-09): Claude from Mumbai = `global.*` cross-region profiles (worldwide routing, source-region pricing); Nova = `apac.*` profiles (routing stays in APAC).
>
> **Provider strategy (owner, updated 2026-07-09):** all AI flows through the **`AIProvider` seam** built in A1 — `resolveProvider(orgId)` remains the single switch point. Tier 1 (v1) = Bedrock Nova Micro. Tier 2 = better Bedrock model (Claude Haiku 4.5 ≈ ₹320/mo, Sonnet ≈ ₹950/mo at moderate volume) when quality demands it. Tier 3 = **BYOK** (org's own key; Phase 3.8.1, needs encrypted key storage + settings UI). Phases 5/6 dev agents on large LLMs are a separate track.
>
> **Legend:** 🤖 = Claude Opus 4.8 can implement this step end-to-end (code + tests + docs). 🧑 `[MANUAL — owner]` = requires the owner (AWS console/billing/credentials).

## Already built (permanent — do not redo)

- ✅ **A1–A4 (api):** `AIProvider` seam in `services/ai.service.ts` (`generate<T>` with JSON-schema + zod validation, one corrective re-prompt, typed `ApiError` failures 503/504/502), `resolveProvider(orgId)`, `GET /api/ai/health`, and the three endpoints `POST /api/ai/draft-ticket` (10/min), `/expand-ticket` (10/min), `/project-summary` (5/min) — all `requireAuth` + org-role-gated, hermetic tests (api 104). Prompts, schemas, auth, and rate limits are provider-agnostic and stay as-is.
- ✅ **B1–B4 (web):** live `AIButton` gated on `useAIHealth`; board **Draft with AI** (preview → Create/Discard through existing `createTicket`); drawer **Auto-fill** (fills editable spec fields, confirm-overwrite, normal Save); Overview **Generate summary** (ephemeral react-query cache). `ai.*` i18n; web 37. Frontend never knows the provider — nothing changes here except copy (D4).
- ⚠️ **Ollama remnants to remove in D3:** `OllamaProvider` in `ai.service.ts`, `OLLAMA_*` config + `.env.example` block, the `ollama` compose service + `ollama_models` volume (old C1), api-service `OLLAMA_*` env passthrough, and the "self-hosted" wording in FEATURES.md. The old C2/C3 (EC2 resize + Ollama runbook) are **cancelled — never executed, no teardown needed**.

## Design decisions (read once)

- **Model:** `Amazon Nova Micro` via the APAC cross-region inference profile from `ap-south-1` — expected profile ID `apac.amazon.nova-micro-v1:0` (**verify at dev time**: `aws bedrock list-inference-profiles --region ap-south-1`). Text-only, very fast, supports the Converse API with tool use — good enough for schema-constrained drafting; prompts must be short and directive (it's a small model).
- **Structured JSON:** Bedrock **Converse API** with `toolConfig` — define one tool (`emit_result`) whose `inputSchema` is the endpoint's JSON schema, force it with `toolChoice: {tool: {name: "emit_result"}}`, read the draft from the returned `toolUse.input`. Keep the existing one-corrective-retry + zod validation exactly as the seam already does. (If Nova Micro rejects forced `toolChoice`, fall back to `{any: {}}` — confirm against the SDK during D1.)
- **Config (replaces `OLLAMA_*`):** `AI_PROVIDER` (`''` = AI disabled → 503 `AI_UNAVAILABLE`, buttons disabled-with-reason | `'bedrock'`), `BEDROCK_MODEL_ID` (default `apac.amazon.nova-micro-v1:0`), `AWS_REGION` (default `ap-south-1`), `AI_TIMEOUT_MS` (default `30000` — Bedrock is fast; down from 120000). Switching to Claude later = set `BEDROCK_MODEL_ID=global.anthropic.claude-haiku-4-5-...` (exact profile ID from `list-inference-profiles`), restart api. No image rebuild for any toggle.
- **Credentials:** default AWS credential chain — **prod = EC2 instance role** (no keys anywhere), **dev = `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in `.env`** (gitignored; owner supplies a scoped IAM user, see checklist). Never in code, images, or compose files.
- **Deps:** `@aws-sdk/client-bedrock-runtime` (Converse) + `@aws-sdk/client-bedrock` (health via `GetInferenceProfile`, a free control-plane call). Dep change ⇒ **rebuild the api container** (known gotcha).
- **Health:** `BedrockProvider.health()` → `GetInferenceProfileCommand` on the configured profile, result cached ~60s in-process → `{enabled, reachable, modelReady, provider: 'bedrock'}`. Same response shape; the frontend needs zero changes.
- **Tests stay hermetic:** mock the AWS SDK (`vi.mock('@aws-sdk/client-bedrock-runtime')` or constructor-injected `send`) — CI has no AWS credentials and must never call AWS.
- **Prompt hygiene unchanged:** user text is data; output is a draft the same user reviews; render through existing components.

---

## Part D — Bedrock provider swap (all 🤖 Claude Opus 4.8 dev)

### - [x] D1 — 🤖 `BedrockProvider` + config swap (M)
- `config.ts`: add `AI_PROVIDER`, `BEDROCK_MODEL_ID`, `AWS_REGION`; keep `AI_TIMEOUT_MS` (new default 30000); delete `OLLAMA_BASE_URL`/`OLLAMA_MODEL`.
- `ai.service.ts`: `class BedrockProvider implements AIProvider` — Converse call per the design above, request timeout via the SDK's `requestTimeout`, map failures to the existing `ApiError` codes (`ThrottlingException`/connection → 503 `AI_UNAVAILABLE`; timeout → 504 `AI_TIMEOUT`; unparseable-after-retry → 502 `AI_BAD_OUTPUT`). `resolveProvider(orgId)` returns it iff `AI_PROVIDER === 'bedrock'`, else `null`.
- Add the two `@aws-sdk` deps to `apps/api` (rebuild container). `.env.example`: replace the AI block (see checklist item 4 for the dev-credentials lines).

### - [x] D2 — 🤖 Hermetic test swap (M)
- Rework `src/test/ai.test.ts`: replace the fetch-stubbed Ollama mocks with mocked Converse responses (happy path per endpoint, malformed-once → retry → success, malformed-twice → 502, throttle → 503, disabled → health `{enabled:false}` + endpoints 503, auth/role cases unchanged). Test count stays ≈15; **api suite stays green with zero AWS access**.

### - [x] D3 — 🤖 Remove the local-model surface (S)
- Delete `OllamaProvider`; remove the `ollama` service + `ollama_models` volume from `docker-compose.yml`; remove `OLLAMA_*` passthrough from the api service (add `AI_PROVIDER`/`BEDROCK_MODEL_ID`/`AWS_REGION` instead); scrub `OLLAMA_*` from `.env.example`; drop the stale `OLLAMA_*` lines from local `.env`. FEATURES.md: rewrite the "AI drafting (self-hosted)" section — remove "your text never leaves the server" claims, describe cloud AI plainly (drafts still user-reviewed, nothing auto-saved). i18n: no key changes needed (copy is provider-neutral); double-check hint strings.

### - [x] D4 — 🤖 Copy + docs touch-up (S)
- `ai.generatingHint` ("10–20 s") → Bedrock reality (~1–3 s; consider dropping the hint). PROGRESS/FEATURES dates. Typecheck + build + full `turbo test` green (api ≈104 · web 37).

### - [~] D5 — 🤖 Live verify + prompt-tune (M) — **AWS checklist done; live-verified 2026-07-10; owner quality judgment pending**
- ✅ Dev credentials in `sourcecode/.env` (IAM user `pmagent-dev-bedrock`); profile `apac.amazon.nova-micro-v1:0` **ACTIVE**. `GET /api/ai/health` green through the running api. Drove all three flows end-to-end against real Nova Micro (samples + latency in the PROGRESS D5 row): draft-ticket 1.25s, project-summary 1.05s, expand-ticket 1.67s. Forced-tool Converse confirmed working.
- ⛔ **Owner quality judgment outstanding.** Observed nit: expand-ticket returns `acceptanceCriteria: []` (prompt asks 2–6). Options: (a) accept Nova Micro as-is, (b) 1 prompt-tuning pass on the expand prompt (then re-run hermetic tests), (c) flip `BEDROCK_MODEL_ID` to Claude Haiku 4.5's global profile + re-verify (record cost delta ≈₹320/mo). Sanjay decides before D is called done.

## Part E — Deploy (no EC2 resize — t3.medium stays; baseline bill unchanged)

### - [ ] E1 — 🧑 `[MANUAL — owner]` prod IAM + env (S)
- Attach the Bedrock IAM policy to the pmagent EC2 **instance role** (create role + instance profile and attach to the instance if the box has none — checklist item 4; no downtime).
- `.env.prod`: `AI_PROVIDER=bedrock`, `BEDROCK_MODEL_ID=...`, `AWS_REGION=ap-south-1` (no keys — the role provides credentials).

### - [ ] E2 — 🤖 Ship + verify on prod (S)
- Merge → images → deploy via the normal pipeline; restart. Verify health green on prod, one generation per feature, latency + first real cost numbers recorded in PROGRESS. Kill-switch check: unset `AI_PROVIDER` + restart api → buttons degrade to disabled-with-reason, no redeploy.
- Ops notes live at the bottom of this file (no separate runbook — there's no infra): model switch = env var; disable = unset `AI_PROVIDER`; costs = Cost Explorer filtered to Bedrock + the budget alert (checklist 5).

---

## 🧑 AWS checklist — owner actions (do before D5)

1. **Model access — mostly automatic now.** AWS retired the Model access page (confirmed in-console 2026-07-10): serverless foundation models auto-enable on first invocation, gated by IAM only. **Nova Micro: nothing to do.** **Escape-hatch order (owner has no company details for the Anthropic use-case form, 2026-07-10 — deferred, not required):** quality upgrades go **Nova 2 Lite → Nova Pro** first (Amazon 1P, no form, pure `BEDROCK_MODEL_ID` flip); **Claude Haiku** stays available later via the one-time *self-declaration* form (no company registration required — individual-developer details are accepted; pre-clear as the **admin** user via Model catalog → playground when wanted) or via BYOK (3.8.1) with a direct Anthropic key, which involves no AWS form at all.
2. **Verify the profile ID** — `aws bedrock list-inference-profiles --region ap-south-1` → confirm the exact Nova Micro APAC profile ID (expected `apac.amazon.nova-micro-v1:0`); note the Claude `global.*` IDs while you're there. *(Becomes 🤖 once dev credentials exist — I can run it.)*
3. **IAM policy** — create policy `pmagent-bedrock-invoke`: actions `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `bedrock:GetInferenceProfile`, `bedrock:ListInferenceProfiles`. Resource `*` is acceptable for MVP; tighten later to the inference-profile ARN **plus** the foundation-model ARNs in the profile's destination regions (cross-region profiles need both — known gotcha).
4. **Attach credentials:**
   - **Prod:** attach the policy to the EC2 instance role of the pmagent box (create + attach if none exists — no downtime). **IMDS gotcha:** the api runs in a Docker container, which adds a network hop — with the IMDSv2 default hop limit of **1**, containers **cannot** reach instance-role credentials. Fix once: `aws ec2 modify-instance-metadata-options --instance-id <id> --http-put-response-hop-limit 2 --http-tokens required`.
   - **Dev:** create IAM user `pmagent-dev-bedrock` with only that policy → access key → put the pair in `sourcecode/.env` (gitignored) as `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`. Rotate/delete the key when 3.8 ships.
5. **Billing guardrail** — AWS Budgets: monthly cost budget (e.g. **$5**) with email alert at 80%; glance at Bedrock in Cost Explorer after week 1. At Nova Micro prices normal usage is ~$0.1–0.5/mo — the alert is purely a runaway-loop tripwire.
6. **Nothing else changes** — no EC2 resize, no new security-group rules, no new ports; Bedrock is an outbound HTTPS call from the api.

## Sequencing & scope notes

- Order: **D1→D4** (pure dev, hermetic — no AWS needed) can start immediately → **AWS checklist** → **D5** live verify + owner quality judgment → **E1→E2** deploy. No money checkpoint anymore: the only recurring cost is per-token (~₹10–40/mo) and the budget alert guards it.
- **Out of scope:** BYOK (3.8.1 — encrypted org keys, settings UI, per-org `resolveProvider`); streaming responses; persisting summaries; auto-creating tickets; email generation (Phase 4). **Claude-model switch is in scope as configuration, not code** — no separate phase needed.
- Expected exit: api ≈104 · web 37, three live AI features on prod via Nova Micro, EC2 bill unchanged at baseline (~₹850/mo), AI spend visible in Cost Explorer.
