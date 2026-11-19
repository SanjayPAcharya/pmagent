# Phase <id> — <title>

> **Stage:** `draft` · **Next role:** Product Manager · **Branch:** — · **Size:** S / M / L
> One line on where this stands right now.

<!--
How to use this template
- Copy it to docs/phases/1-pending/phase-<id>-<slug>.md (Product Planning does this).
- Each section names the role that owns it. Fill your own sections; leave the others alone.
- Keep the header line current: it's the first thing the next role reads.
- Stages: draft · pm-review · ready · dev · review · changes-requested · test · release · done (· blocked · parked).
- Delete this comment once the item is drafted.
-->

## 1. Why — *Product Planning*
- **Problem:** what hurts today, and for whom.
- **Goal:** what's true for the user once this ships.
- **Success signal:** how we'll know it worked.

## 2. Scope — *Product Planning*
- **In:**
- **Out (non-goals):**
- **Open questions for the owner (⛔):**
- **Risks:**

## 3. Ground truth — *Product Manager* (verified against the code on YYYY-MM-DD)
What exists today and what this change touches: files, functions or components, data model, API routes. Note where the draft's assumptions were wrong.

## 4. Acceptance criteria — *Product Manager*
- [ ] **AC1** — observable behaviour a tester can prove.
- [ ] **AC2** — …
- [ ] **AC-n (no regression)** — the neighbouring flows that must still work.

## 5. Build steps — *PM writes · Developer ticks* (one step = one commit)
- [ ] **S1** — files · approach · tests to add.
- [ ] **S2** — …

DevOps impact: migrations / Keycloak realm / env vars / new dependencies or containers. Write "none" if there isn't any.

## 6. Test plan — *PM writes · Tester runs*
- **Automated:** suites to run; new tests expected.
- **Browser, per AC:** steps; which test data; how to restore it.

## 7. Review — *Reviewer*
_Not started._
<!-- Verdict: Approved / Approved with nits / Changes requested
| # | Severity | file:line | Issue | Suggested fix | Developer reply |
What I ran: … -->

## 8. Test report — *Tester*
_Not started._
<!-- Verdict: Pass / Fail · Branch + commit · Suites (counts)
| AC | Result | Evidence |
Regressions: … -->

## 9. Release — *DevOps*
_Not started._
<!-- Merge commit · env steps applied · smoke results · date -->

## Handoff log
<!-- Every role appends one note per handoff, newest at the bottom:
### YYYY-MM-DD · <From role> → <To role>
- **Did:** …
- **State:** branch + head commit; what was run and the results.
- **Next role should:** …
- **Watch out for:** …
-->
