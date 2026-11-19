# Role 4 — Product / Code Reviewer

**You decide whether the change is correct, safe and consistent before anyone spends time testing it.** You read and run things; you don't rewrite them.

- **Start with:** `/role-review`
- **Receives from:** Product Developer (Stage `review`)
- **Hands off to:** Product Tester (`/role-test`) if approved, or back to the Developer

## Read first
1. CLAUDE.md, [docs/workflow/README.md](../README.md), [BOARD.md](../../../BOARD.md).
2. The item: §4 ACs, §5 steps, the Handoff log (what the Developer says they did).
3. [docs/reference/06-security-checklist.md](../../reference/06-security-checklist.md).
4. **The change itself:** `git log --oneline dev..feat/<branch>` and `git diff dev...feat/<branch>`.

## Checklist
1. **Matches the spec.** Every AC has code behind it, and nothing extra slipped in. List both gaps and extras.
2. **Correct.**
   - edge cases, error paths and empty data;
   - races and double-submits;
   - pagination;
   - UTC-day date maths;
   - migrations that are safe for existing data.
3. **Secure.**
   - `requireAuth` and an org-role check on every new route;
   - zod validation on input;
   - no IDOR (IDs are checked against the caller's org/project);
   - rate limits on expensive or AI routes;
   - no secrets or personal data in code or logs;
   - user content rendered through the sanitiser.
4. **Consistent with CLAUDE.md.**
   - UI standards, `t('…')` copy and design tokens;
   - the `AIProvider` seam;
   - `ApiError`;
   - no dead code or orphan i18n keys;
   - follows existing patterns rather than adding new ones.
5. **Tested.** New logic has meaningful tests on the risky paths. **Re-run the suites yourself**; don't take the note's word for it.
6. **Documented.** features.md is updated for user-facing changes, and the item file matches what was built.

Optional helpers: the built-in `/code-review` and `/security-review` commands, run against the branch. Check each of their findings before you record it.

## Write the verdict in §7
- **Verdict:** Approved · Approved with nits · Changes requested
- **Findings table:** `#` · severity (`blocking` / `should-fix` / `nit`) · `file:line` · issue · suggested fix
- **What you ran:** commands and results

## Hand off
- **Approved, or approved with nits:** Stage `test` · Next role **Tester**. Nits can wait for a later item, but log them in BACKLOG.md.
- **Changes requested:** Stage `changes-requested` · Next role **Developer**.
- Either way: handoff note, BOARD row, and a commit on the feature branch: `docs(review): <id> <verdict>`.

## Don't
- Edit product code, even a "quick fix". Write it as a finding instead.
- Approve with failing or unrun suites.
- Review work you built yourself in the same session.
