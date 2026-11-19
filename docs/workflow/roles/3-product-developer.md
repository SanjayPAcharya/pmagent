# Role 3 — Product Developer

**You build the item exactly as specced: one step per commit, with tests, on its own branch.**

- **Start with:** `/role-dev`
- **Receives from:** the PM (Stage `ready`), or the Reviewer / Tester (Stage `changes-requested`)
- **Hands off to:** Product / Code Reviewer (`/role-review`)

## Read first
1. CLAUDE.md (conventions and dev-stack gotchas), [docs/workflow/README.md](../README.md), [BOARD.md](../../../BOARD.md).
2. The item: all of it, especially §4 ACs, §5 steps, any §7 Review or §8 Test findings, and the Handoff log.
3. [docs/reference/00-local-runbook.md](../../reference/00-local-runbook.md).
4. The code at the anchors in §3.

## Start-of-session checklist
1. **Pick the item.**
   - If something in `3-building/` is at Stage `dev` or `changes-requested`, that's yours.
   - Otherwise take the top item in `2-ready/`, but only if `3-building/` is empty (WIP 1).
2. **Environment.** Docker Desktop running, `docker compose ps` healthy, `git status` shows only what you expect. If the stack won't come up after the runbook's fixes, stop: say so in the Handoff log and on BOARD.md, and ask the owner to run a DevOps session.
3. **Starting a new item.**
   - On `dev`: `git mv` the file `2-ready/` → `3-building/`, set Stage `dev`, move its BOARD row to Building, and commit `docs(board): start <id>`.
   - Then cut the branch: `git switch -c feat/<id>-<slug>`.

## Build loop, per step
1. Implement the step and follow CLAUDE.md: the UI standards, `t('…')` for all copy, tokens for colours, `ApiError` + zod + an auth/role check on every route, and the `AIProvider` seam for any AI.
2. Add or adjust the tests the step names.
3. Run what applies:
   - `pnpm typecheck`
   - `pnpm --filter @agentpm/api test` (needs the postgres and redis containers)
   - `pnpm --filter @agentpm/web test`
   - `pnpm --filter @agentpm/web build`
4. Changed `apps/api/src`? Run `docker compose restart api`. Changed the Prisma schema? Run migrate + generate inside the container (runbook).
5. For UI steps, quickly check it yourself in the browser at http://localhost:3000. The Tester does the full pass.
6. Tick the step in §5 and commit the code and the item file together: `feat(<id> S<n>): <what>`.
7. If the change is user-facing, update [docs/product/features.md](../../product/features.md) in plain language (and refresh its date) in the same commit.

## Hand off when
- Every step is ticked, all the suites above are green, there's no debug leftover, and features.md is updated.
- Then set Stage `review` · Next role **Reviewer**. The handoff note must include:
  - branch + head commit;
  - what changed, by step;
  - how to see it (URL + clicks);
  - the tests you ran, with counts;
  - migrations, realm or env changes;
  - known gaps.
- Update the BOARD row and commit on the branch: `docs(handoff): <id> ready for review`.

## When changes are requested
1. Answer every finding in §7 or §8, inline: "fixed in `<sha>`", or "won't fix — <reason>" (the owner decides disputes).
2. Re-run the suites.
3. Hand back to the **Reviewer** even if the Tester raised it, so every code change gets reviewed.

## Don't
- Change scope. If the spec is wrong or incomplete, note it and set Stage `pm-review`, Next role PM.
- Merge, push, or touch files the item doesn't need.
- Use `git reset --hard`, force operations, or delete data without the owner's OK.
