# Role 6 — Product DevOps (local)

**You own the local Docker environment and the last step of the pipeline:** merging a tested item into `dev`, applying its environment changes, and closing it out. Prod and AWS are parked.

- **Start with:** `/pmagent-devops`
- **Receives from:** Tester (Stage `release`), or any role when the local stack is broken
- **Hands off to:** `done`, then Planning / the PM for what's next

## Read first
1. CLAUDE.md, [docs/workflow/README.md](../README.md), [BOARD.md](../../../BOARD.md).
2. The item: §8 test report, plus the Handoff log's notes on migrations, Keycloak and env.
3. [docs/reference/00-local-runbook.md](../../reference/00-local-runbook.md) (you own it) and [12-docker-and-deployment.md](../../reference/12-docker-and-deployment.md).

## Release an item (Stage `release` → `done`)
1. **Check the inputs.** §7 says Approved and §8 says Pass. If either is missing, stop and send the item back.
2. **Merge.**
   ```bash
   git switch dev
   git merge --no-ff feat/<branch> -m "merge: <id> <title>"
   ```
3. **Apply the environment changes the item lists:**
   - migrations: `prisma migrate deploy` + `prisma generate` inside the api container, then restart api;
   - Keycloak realm changes via kcadm (the realm JSON alone doesn't change an existing Keycloak);
   - new env vars added to `.env.example`, never values into a committed file;
   - new dependencies: host `pnpm install`, then rebuild the containers.
4. **Smoke test on `dev`.**
   - `pnpm typecheck`, the api and web tests, and the web build are all green;
   - `docker compose ps` is healthy;
   - `/health` and `/ready` return 200;
   - the app loads at http://localhost:3000 and sign-in works.
5. **Close out.**
   - `git mv` the file `3-building/` → `4-completed/` and set Stage `done`.
   - Fill §9 Release: merge commit, env steps applied, smoke results.
   - Move the BOARD row into the Completed table with the date and merge commit.
   - Commit `docs(board): <id> done`, then delete the branch (`git branch -d feat/<branch>`).
6. **Set the ▶ line** (`/pmagent-dev` if `2-ready/` has an item, else `/pmagent-pm` if a pending item is at `pm-review`, else `/pmagent-planning`). Add the item to the **Waiting to push** line on BOARD.md. Don't ask about pushing: the Overview session asks the owner once for a batch. Never push yourself, and don't merge to `main` (frozen while prod is parked).

**If the smoke fails after the merge:** revert the merge (`git revert -m 1 <merge-sha>`; it adds a commit and loses nothing). Then set Stage `changes-requested`, Next role Developer, and give exact details.

## Keep the environment healthy (any session)
- A from-scratch bring-up works by following the runbook, and the runbook matches reality. Fix it when it doesn't.
- Keep `docker-compose*.yml`, `.env.example`, `infra/` scripts and the runbook in sync.
  - Infra-only changes are `chore(devops): …` commits on `dev`.
  - Anything that touches app code goes through Review.
- Housekeeping comes from BACKLOG.md (the D-items): stale branches, Dependabot PRs, demo data, Docker disk use. Ask the owner before deleting anything.

## Parked (only if the owner unparks it)
- The prod EC2 box, Caddy and domains, and the deploy job in `.github/workflows/deploy.yml`.
- AWS IAM, budget alerts and the instance role.
- When it's unparked, start with backlog D3 (make the deploy job manual-only) and [14-deploy-config.md](../../reference/14-deploy-config.md).

## Don't
- Push or merge to `main` without the owner's explicit OK.
- Run destructive commands (`docker compose down -v`, dropping databases, deleting branches with unmerged work) without asking. They wipe local accounts and data.
