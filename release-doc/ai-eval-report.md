# AI eval report

- **Generated:** 2026-07-11T04:18:27.146Z
- **Model:** `apac.amazon.nova-micro-v1:0`
- **Prompt version:** 2
- **Runs per fixture:** 3
- **Fixtures:** 16 (48 generations)
- **Tokens:** 33209 in / 6348 out · **est. cost this run:** $0.0021 (≈₹0.17)

> Heuristic scores, not ground truth. **valid-1st** = passed zod on the first attempt (no corrective re-prompt). **retry** = one re-prompt fired. **AC-test** = fraction of acceptance criteria that look testable (verb-led or measurable). **invent** = fraction of output content-words absent from the input (a hallucination smell — high is bad on thin inputs). Prices in PRICES[] are approximate; refresh before quoting.

## Prompt change log (A2, vs v1 baseline)

**Tried & DROPPED — one few-shot exemplar per endpoint.** Measured on Nova Micro: **+23% input tokens** (30.7k → 37.8k) for **no scorecard gain**, plus two regressions (an added expand retry; empty-project summary lost its bullets). Consistent with "small models degrade with long prompts" — removed.

**Tried & KEPT (v2, ~token-neutral at 33.2k in):**
- Per-endpoint sampling — draft/expand `temperature 0.2`, **summary `temperature 0.1`** (more deterministic digests); `maxTokens` caps 400/500/350 as anti-rambling rails (well above observed output sizes, never truncating). Structural; asserted by hermetic tests.
- Directive tightening — "write in your own words / don't echo verbatim", explicit anti-thin-input rule (stay minimal on vague input rather than invent scope), AC phrased as verb-led observable/measurable outcomes.
- Clearest measured win: **empty-project summary risks 3 → 1.3** (v1 over-flagged risks on a project with no data); bullets restored to ≥3.

**Signal quality note:** the AC-testability heuristic is noisy at 3 runs/fixture — treat it as directional, not a gate. Schema compliance stayed ~100% first-try across both versions.

## draft

| fixture | kind | valid-1st | retry | AC | AC-test | invent | title-words | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|---|
| terse-oneliner | terse | 100% | 0% | 5.3 | 7% | 93% | 5 | 929 | 638 | 118 |
| rambling-paragraph | rambling | 100% | 0% | 5 | 47% | 79% | 7.7 | 1125 | 717 | 124 |
| typod-input | typod | 100% | 0% | 5 | 20% | 90% | 5 | 990 | 662 | 119 |
| bug-report | bug | 100% | 0% | 4.7 | 0% | 53% | 7 | 921 | 664 | 125 |
| feature-request | feature | 100% | 0% | 5.7 | 0% | 78% | 7 | 910 | 656 | 131 |
| chore-maintenance | chore | 100% | 0% | 5.3 | 50% | 71% | 4.3 | 954 | 651 | 136 |
| urgency-implying | urgent | 100% | 0% | 4.3 | 62% | 73% | 5.3 | 777 | 664 | 104 |
| vague-thin | thin | 100% | 0% | 4.3 | 72% | 93% | 3 | 812 | 636 | 107 |

## expand

| fixture | kind | valid-1st | retry | AC | AC-test | invent | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|
| title-only-ratelimit | title-only | 67% | 33% | 6 | 50% | 96% | 1529 | 930 | 230 |
| title-only-darkmode | title-only | 100% | 0% | 5.7 | 6% | 93% | 1093 | 667 | 175 |
| thin-desc-search | thin-desc | 100% | 0% | 5 | 40% | 79% | 1001 | 671 | 147 |
| bug-title-webhook | bug-title | 100% | 0% | 5 | 7% | 84% | 940 | 685 | 149 |
| vague-title-onboarding | vague-title | 100% | 0% | 5 | 93% | 97% | 1906 | 667 | 144 |

## summary

| fixture | kind | valid-1st | retry | bullets | risks | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|
| empty-project | empty | 100% | 0% | 3.3 | 1.3 | 837 | 647 | 72 |
| healthy-project | healthy | 100% | 0% | 3.7 | 1.3 | 834 | 708 | 109 |
| blocker-heavy-project | blocker-heavy | 100% | 0% | 4.3 | 3.7 | 1240 | 807 | 127 |
