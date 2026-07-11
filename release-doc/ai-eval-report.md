# AI eval report

- **Generated:** 2026-07-11T04:27:55.663Z
- **Model:** `apac.amazon.nova-micro-v1:0`
- **Prompt version:** 2
- **Runs per fixture:** 3
- **Fixtures:** 16 (48 generations)
- **Tokens:** 35319 in / 6489 out · **est. cost this run:** $0.0021 (≈₹0.18)

> Heuristic scores, not ground truth. **valid-1st** = passed zod on the first attempt (no corrective re-prompt). **retry** = one re-prompt fired. **AC-test** = fraction of acceptance criteria that look testable (verb-led or measurable). **invent** = fraction of output content-words absent from the input (a hallucination smell — high is bad on thin inputs). Prices in PRICES[] are approximate; refresh before quoting.

> ⚠️ The harness overwrites this file on every run. The change log below is re-appended by hand after each kept change — if a run has just regenerated the tables, re-add it from PROGRESS.md.

## Change log (Nova Micro, 3 runs/fixture)

**Baseline v1 (A1):** 30.7k in / 5.2k out. 100% schema-valid first-try, zero retries. AC-testability low, invention high on thin inputs — the two levers.

**A2 — prompt tightening (v2):**
- Tried & **DROPPED** one few-shot exemplar per endpoint: **+23% input tokens (→37.8k) for no scorecard gain + two regressions** (an added expand retry; empty-project summary lost bullets). Confirms small models degrade with long prompts.
- **Kept** (≈token-neutral 33.2k in): summary `temperature 0.1` (vs draft/expand 0.2); `maxTokens` caps 400/500/350; don't-echo / anti-thin-input / verb-led-measurable-AC directives. Win: empty-project summary risks 3 → 1.3.

**A3 — context enrichment (biggest lever, current tables above):** draft gets project name + up to 10 recent titles (style anchor) + org labels; expand gets parent + up to 5 sibling titles; summary gets the active sprint goal.
- **100% valid-first-try across ALL 16 fixtures, zero retries** — enrichment removed the v2 flaky-retry noise entirely.
- **Invention fell** on thin inputs (terse 93→77, rambling 79→69, bug 53→41). Partly a metric artifact (more input words) but also real grounding.
- Cost: 35.3k in (+~2k vs v2) — enrichment is capped < ~1.5k chars/call. Net: clearly worth it.

## draft

| fixture | kind | valid-1st | retry | AC | AC-test | invent | title-words | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|---|
| terse-oneliner | terse | 100% | 0% | 5.3 | 0% | 77% | 5 | 1002 | 728 | 121 |
| rambling-paragraph | rambling | 100% | 0% | 5.3 | 0% | 69% | 7 | 1267 | 807 | 141 |
| typod-input | typod | 100% | 0% | 4 | 58% | 88% | 5.7 | 1498 | 752 | 105 |
| bug-report | bug | 100% | 0% | 5 | 13% | 41% | 8 | 997 | 753 | 143 |
| feature-request | feature | 100% | 0% | 5.3 | 0% | 72% | 6.7 | 907 | 746 | 134 |
| chore-maintenance | chore | 100% | 0% | 4.3 | 47% | 71% | 7.3 | 1108 | 741 | 139 |
| urgency-implying | urgent | 100% | 0% | 4.3 | 68% | 71% | 5 | 1458 | 754 | 116 |
| vague-thin | thin | 100% | 0% | 5 | 13% | 85% | 4 | 932 | 726 | 122 |

## expand

| fixture | kind | valid-1st | retry | AC | AC-test | invent | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|
| title-only-ratelimit | title-only | 100% | 0% | 5.3 | 50% | 94% | 1252 | 711 | 177 |
| title-only-darkmode | title-only | 100% | 0% | 5.3 | 12% | 93% | 1091 | 710 | 190 |
| thin-desc-search | thin-desc | 100% | 0% | 5 | 53% | 86% | 1020 | 714 | 135 |
| bug-title-webhook | bug-title | 100% | 0% | 5.7 | 11% | 81% | 1369 | 729 | 173 |
| vague-title-onboarding | vague-title | 100% | 0% | 5.7 | 66% | 93% | 1389 | 710 | 171 |

## summary

| fixture | kind | valid-1st | retry | bullets | risks | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|
| empty-project | empty | 100% | 0% | 3 | 2.3 | 697 | 647 | 73 |
| healthy-project | healthy | 100% | 0% | 4 | 0.7 | 1083 | 725 | 91 |
| blocker-heavy-project | blocker-heavy | 100% | 0% | 4.3 | 4.3 | 892 | 820 | 132 |
