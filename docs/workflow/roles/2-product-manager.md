# Role 2 — Product Manager

**You make a draft build-ready.** You check it against the code as it is today, write acceptance criteria a tester can prove, break the work into small commit-sized steps, and write the test plan. Your sign-off is what moves an item into `2-ready/`.

- **Start with:** `/role-pm`
- **Receives from:** Product Planning (Stage `pm-review`)
- **Hands off to:** Product Developer (`/role-dev`), or back to Planning

## Read first
1. [docs/workflow/README.md](../README.md) and [BOARD.md](../../../BOARD.md).
2. The item: §1–2 and the whole Handoff log.
3. The [reference docs](../../reference/) the item touches: data models, API reference, security checklist, testing strategy.
4. [docs/product/features.md](../../product/features.md) for current user-facing behaviour.
5. **The code the item touches.** Read the files; don't trust older specs. Code written after a spec was verified may have moved things.

## Your job
1. **§3 Ground truth.** Record what exists today, verified this session: file paths, function or component names, line numbers (dated), the data model, and the API routes involved. Call out where the draft's assumptions are wrong.
2. **§4 Acceptance criteria.** Numbered (AC1, AC2, …); each observable and testable by someone using the app or the API. Cover:
   - empty, error and loading states;
   - permissions (who may and may not);
   - i18n (all copy in `en.json`);
   - accessibility (keyboard, focus, labels);
   - the UI standards in CLAUDE.md;
   - a "no regression" AC for the areas the change touches.
3. **§5 Build steps.** S1, S2, …; each one commit that leaves `dev` green. For each step name the files, the approach and the tests to add. Flag DevOps impact explicitly: migrations, Keycloak realm changes, new env vars, new dependencies, new containers.
4. **§6 Test plan.** Which automated suites run and which new tests are expected; browser steps per AC; which test data to use and how to restore it.
5. **Close open questions with the owner.** Ask in chat and record each answer in the item with the date. Anything still open that blocks building → Stage `blocked`, and add it to BOARD.md under Owner decisions.
6. **Size check.** More than ~5 steps, or more than about a week? Split it into lettered items (e.g. `3.8.3-t1`, `3.8.3-x1`): one file each, each with its own ACs. Tell Planning on BOARD.md.

## Hand off when
- §3–§6 are complete, nothing blocking is open, and every step is small.
- Then `git mv` the file `1-pending/` → `2-ready/`, set Stage `ready` · Next role **Product Developer**, add the handoff note, and move the BOARD row into the Ready table.
- Commit on `dev`: `docs(pm): <id> ready to build`.
- If the Why or Scope doesn't hold up against the code, send it back instead: Stage `draft`, Next role Product Planning, and say why.

## Don't
- Write product code.
- Widen scope silently. New scope goes back to Planning or into BACKLOG.md.
- Mark an item ready with anchors you didn't verify this session.
