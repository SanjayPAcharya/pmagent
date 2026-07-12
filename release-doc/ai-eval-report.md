# AI eval report

- **Generated:** 2026-07-12T15:24:50.609Z
- **Model:** `apac.amazon.nova-micro-v1:0`
- **Prompt version:** 2
- **Runs per fixture:** 3
- **Fixtures:** 16 (48 generations)
- **Tokens:** 35319 in / 6291 out · **est. cost this run:** $0.0021 (≈₹0.18)

> Heuristic scores, not ground truth. **valid-1st** = passed zod on the first attempt (no corrective re-prompt). **retry** = one re-prompt fired. **AC-test** = fraction of acceptance criteria that look testable (verb-led or measurable). **invent** = fraction of output content-words absent from the input (a hallucination smell — high is bad on thin inputs). Prices in PRICES[] are approximate; refresh before quoting.


> ⚠️ The harness overwrites this file on every run (last: Nova Micro, the production model). The A/B section and change log below are re-appended by hand — if a run has just regenerated the tables above, re-add them from PROGRESS.md / git.

## draft

| fixture | kind | valid-1st | retry | AC | AC-test | invent | title-words | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|---|
| terse-oneliner | terse | 100% | 0% | 5 | 0% | 77% | 5 | 992 | 728 | 127 |
| rambling-paragraph | rambling | 100% | 0% | 5.7 | 36% | 77% | 7 | 1008 | 807 | 149 |
| typod-input | typod | 100% | 0% | 4.3 | 68% | 88% | 5.3 | 894 | 752 | 104 |
| bug-report | bug | 100% | 0% | 3.7 | 0% | 34% | 8 | 989 | 753 | 122 |
| feature-request | feature | 100% | 0% | 5.7 | 6% | 68% | 6.7 | 1433 | 746 | 141 |
| chore-maintenance | chore | 100% | 0% | 5 | 40% | 72% | 7.3 | 1401 | 741 | 147 |
| urgency-implying | urgent | 100% | 0% | 5.3 | 30% | 70% | 5 | 900 | 754 | 128 |
| vague-thin | thin | 100% | 0% | 5 | 0% | 85% | 4 | 1128 | 726 | 112 |

## expand

| fixture | kind | valid-1st | retry | AC | AC-test | invent | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|
| title-only-ratelimit | title-only | 100% | 0% | 5 | 47% | 94% | 1201 | 711 | 153 |
| title-only-darkmode | title-only | 100% | 0% | 5.3 | 7% | 93% | 1034 | 710 | 171 |
| thin-desc-search | thin-desc | 100% | 0% | 5 | 60% | 81% | 897 | 714 | 133 |
| bug-title-webhook | bug-title | 100% | 0% | 5.7 | 0% | 81% | 1444 | 729 | 176 |
| vague-title-onboarding | vague-title | 100% | 0% | 6 | 61% | 96% | 1123 | 710 | 160 |

## summary

| fixture | kind | valid-1st | retry | bullets | risks | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|
| empty-project | empty | 100% | 0% | 3.3 | 1.3 | 964 | 647 | 68 |
| healthy-project | healthy | 100% | 0% | 4 | 0.3 | 780 | 725 | 95 |
| blocker-heavy-project | blocker-heavy | 100% | 0% | 4 | 2.7 | 1152 | 820 | 109 |

## A4 — Model A/B comparison (2026-07-12)

Same 16 synthetic fixtures, prompt v2, runs 3 (48 generations/model), through the exact production prompts + enrichment. **Anthropic Claude models (incl. Claude Haiku 4.5 `global.anthropic.claude-haiku-4-5-*`) were skipped** — every Claude id returns `ResourceNotFoundException: Model use case details have not been submitted for this account` (the one-time Anthropic use-case form isn't done). Per the plan, **Nova Pro is the no-form high-tier fallback**, so the A/B is the four Nova models.

### Headline (all endpoints)

| model | valid-1st | draft AC-test | draft invent | expand AC-test | expand invent | avg latency | tok in/out (48 gen) | est ₹/mo* |
|---|---|---|---|---|---|---|---|---|
| `apac.amazon.nova-micro-v1:0` | 100% | 22% | 71% | 35% | 89% | 1066ms | 35319/6291 | ₹26 |
| `apac.amazon.nova-lite-v1:0` | 100% | 31% | 74% | 77% | 88% | 1257ms | 35319/6116 | ₹43 |
| `global.amazon.nova-2-lite-v1:0` | 100% | 33% | 81% | 71% | 92% | 2420ms | 59619/8984 | ₹69† |
| `apac.amazon.nova-pro-v1:0` | 100% | 75% | 78% | 64% | 89% | 1411ms | 35319/5442 | ₹553 |

### Summary endpoint

| model | valid-1st | avg bullets | avg risks | latency |
|---|---|---|---|---|
| `apac.amazon.nova-micro-v1:0` | 100% | 3.8 | 1.4 | 965ms |
| `apac.amazon.nova-lite-v1:0` | 100% | 3.0 | 2.3 | 1606ms |
| `global.amazon.nova-2-lite-v1:0` | 100% | 3.0 | 1.4 | 3234ms |
| `apac.amazon.nova-pro-v1:0` | 100% | 3.0 | 1.6 | 1340ms |

\* **₹/mo assumption:** 7,000 generations/month (small active team across draft/expand/summary), Bedrock on-demand prices as of 2026-07 (USD/1M in/out — micro 0.035/0.14, lite 0.06/0.24, pro 0.8/3.2), ₹83/USD. Micro lands ≈₹26/mo, consistent with the memo's ₹10–40 band. **† Nova 2 Lite price is unconfirmed** (not in the harness `PRICES[]`; projected at Nova-Lite rates) **and it measured ~1.7× the input tokens** (59.6k vs 35.3k) — so its real cost is likely higher than shown.

### Findings (decision-support for ⛔A5 — the owner makes the call)

- **Schema reliability is a non-differentiator** — all four Nova models hit 100% valid-on-first-try, 0 retries. The forced-tool JSON + zod seam holds across the board.
- **Nova Micro (live):** cheapest (~₹26/mo) and fastest (1066ms), but weakest acceptance-criteria testability (draft 22% / expand 35%).
- **Nova Lite:** the best value upgrade — expand AC-testability jumps **35%→77%** and draft 22%→31% for ~1.7× cost (~₹43/mo), latency still ~1.3s. Clear quality lift on the spec-writing that matters most, at trivial absolute cost.
- **Nova Pro:** best **draft** AC-testability (75%) but middling on expand (64%), and **~21× Micro's cost (~₹553/mo)** — the draft gain doesn't justify the price for these short tasks.
- **Nova 2 Lite:** worst value — slowest (2.4s), ~1.7× the tokens, and no quality edge over Nova Lite. Skip.
- **Invention smell stays high (71–92%) on every model** — that's the thin synthetic fixtures, not a model choice; enrichment (A3) already pulled the real-input runs down and prod inputs are richer.
- **Suggested shortlist for A5:** stay on **Nova Micro** if cost is paramount, else move to **Nova Lite** for the expand-AC lift at ~₹43/mo (pure `BEDROCK_MODEL_ID` flip). Claude Haiku 4.5 remains a one-form-away option if the owner submits the Anthropic use-case form.

