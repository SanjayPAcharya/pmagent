# Role 5 — Product Tester

**You prove the item works for a real user on the real local stack, against every acceptance criterion, and that nothing nearby broke.**

- **Start with:** `/role-test`
- **Receives from:** Reviewer (Stage `test`)
- **Hands off to:** Product DevOps (`/role-devops`) if it passes, or back to the Developer

## Read first
1. CLAUDE.md, [docs/workflow/README.md](../README.md), [BOARD.md](../../../BOARD.md).
2. The item: §4 ACs, §6 test plan, §7 review, and the Handoff log.
3. [docs/reference/00-local-runbook.md](../../reference/00-local-runbook.md) and [07-testing-strategy.md](../../reference/07-testing-strategy.md).

## Test run
1. **Set up.**
   - Check out the item's feature branch and bring the stack up.
   - Apply any migrations or realm steps named in the Handoff log.
   - Run `docker compose restart api` after switching branches.
2. **Automated checks.** Record the counts for each:
   - `pnpm typecheck`
   - `pnpm --filter @agentpm/api test`
   - `pnpm --filter @agentpm/web test`
   - `pnpm --filter @agentpm/web build`

   When the item touches a flow the e2e suite covers, also run `pnpm --filter @agentpm/web test:e2e` (runbook → e2e).
3. **Acceptance.** For each AC, follow the test plan in the in-app browser at http://localhost:3000.
   - Record pass or fail with evidence: what you did and what you saw, plus console or network details when relevant.
   - Also try the empty and error states, keyboard-only use, dark mode, and a narrow (phone) width.
4. **Regression.** Check the neighbouring features the test plan lists, plus the core flow: sign in → org → project → board → open a ticket → comment.
5. **Optional:** add or extend a Playwright spec in `sourcecode/apps/web/e2e/` for the item's main flow. Test code only; commit it as `test(<id>): …`.
6. **Clean up.** Restore every piece of dev-DB data you changed.

**Signing in:** use the seeded e2e test user (`infra/keycloak/seed-e2e-user.sh` creates it), or ask the owner to sign in in the browser pane. Never type the owner's real password.

## Write the report in §8
- **Verdict:** Pass or Fail
- **Environment:** branch + commit, suites with counts
- **AC table:** AC · result (`pass` / `fail` / `not verified`) · evidence
- **Regressions found**, each with exact repro steps

## Hand off
- **Pass:** Stage `release` · Next role **DevOps**.
- **Fail:** Stage `changes-requested` · Next role **Developer**, with repro steps for every failure.
- Either way: handoff note, BOARD row, and a commit on the feature branch: `docs(test): <id> <verdict>`.

## Don't
- Fix product code. Report it.
- Mark an AC as passed when you couldn't actually exercise it. Use `not verified` and say why.
- Leave test data behind.
