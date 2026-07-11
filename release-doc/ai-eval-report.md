# AI eval report

- **Generated:** 2026-07-11T04:07:03.866Z
- **Model:** `apac.amazon.nova-micro-v1:0`
- **Prompt version:** 1
- **Runs per fixture:** 3
- **Fixtures:** 16 (48 generations)
- **Tokens:** 30663 in / 5169 out · **est. cost this run:** $0.0018 (≈₹0.15)

> Heuristic scores, not ground truth. **valid-1st** = passed zod on the first attempt (no corrective re-prompt). **retry** = one re-prompt fired. **AC-test** = fraction of acceptance criteria that look testable (verb-led or measurable). **invent** = fraction of output content-words absent from the input (a hallucination smell — high is bad on thin inputs). Prices in PRICES[] are approximate; refresh before quoting.

## draft

| fixture | kind | valid-1st | retry | AC | AC-test | invent | title-words | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|---|
| terse-oneliner | terse | 100% | 0% | 5.3 | 0% | 89% | 5 | 1114 | 600 | 84 |
| rambling-paragraph | rambling | 100% | 0% | 6 | 28% | 76% | 7 | 862 | 679 | 112 |
| typod-input | typod | 100% | 0% | 4.3 | 30% | 80% | 5 | 828 | 624 | 88 |
| bug-report | bug | 100% | 0% | 3.3 | 0% | 37% | 6.7 | 802 | 626 | 95 |
| feature-request | feature | 100% | 0% | 6 | 0% | 70% | 5 | 839 | 618 | 99 |
| chore-maintenance | chore | 100% | 0% | 5 | 53% | 64% | 3 | 1024 | 613 | 101 |
| urgency-implying | urgent | 100% | 0% | 4.3 | 62% | 68% | 5 | 1282 | 626 | 108 |
| vague-thin | thin | 100% | 0% | 4.3 | 100% | 92% | 3 | 814 | 598 | 92 |

## expand

| fixture | kind | valid-1st | retry | AC | AC-test | invent | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|---|
| title-only-ratelimit | title-only | 100% | 0% | 5 | 40% | 94% | 1249 | 624 | 140 |
| title-only-darkmode | title-only | 100% | 0% | 5 | 0% | 93% | 1139 | 623 | 130 |
| thin-desc-search | thin-desc | 100% | 0% | 5.3 | 38% | 81% | 908 | 627 | 129 |
| bug-title-webhook | bug-title | 100% | 0% | 5.3 | 0% | 83% | 1161 | 641 | 141 |
| vague-title-onboarding | vague-title | 100% | 0% | 5.3 | 32% | 96% | 1332 | 623 | 132 |

## summary

| fixture | kind | valid-1st | retry | bullets | risks | ms | in-tok | out-tok |
|---|---|---|---|---|---|---|---|---|
| empty-project | empty | 100% | 0% | 3 | 2.3 | 955 | 626 | 68 |
| healthy-project | healthy | 100% | 0% | 3.7 | 1.3 | 785 | 687 | 94 |
| blocker-heavy-project | blocker-heavy | 100% | 0% | 4 | 3.7 | 805 | 786 | 109 |
