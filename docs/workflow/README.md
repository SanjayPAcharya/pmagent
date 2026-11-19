# How we work — the six-role pipeline

PmAgent is built by one owner running **six Claude Code sessions in sequence**. Each session plays one role: it does that role's job on one work item, writes a handoff note and stops. The next session picks up from the note.

Nothing important lives only in a chat. The shared memory is:
- **[BOARD.md](../../BOARD.md):** every work item, its stage and who has it next.
- **The work-item file** in `docs/phases/<group>/`: spec, review, test report and handoff log, all in one file.
- **Git:** one branch per item while it's being built.

## The six roles

| # | Role | Job | Moves items | Start the session with |
|---|---|---|---|---|
| 1 | [Product Planning](roles/1-product-planning.md) | roadmap, backlog, priorities, phase drafts (why + scope) | idea → `draft` → `pm-review` | `/pmagent-planning` |
| 2 | [Product Manager](roles/2-product-manager.md) | makes a draft build-ready: checks it against the code, writes acceptance criteria, build steps, test plan | `pm-review` → `ready` | `/pmagent-pm` |
| 3 | [Product Developer](roles/3-product-developer.md) | builds it one step per commit, with tests; updates the user guide | `ready` → `dev` → `review` | `/pmagent-dev` |
| 4 | [Product / Code Reviewer](roles/4-code-reviewer.md) | approves or sends it back; never edits product code | `review` → `test` (or `changes-requested`) | `/pmagent-review` |
| 5 | [Product Tester](roles/5-product-tester.md) | proves every acceptance criterion on the local stack | `test` → `release` (or `changes-requested`) | `/pmagent-test` |
| 6 | [Product DevOps (local)](roles/6-devops-local.md) | owns the local Docker stack; merges and closes items | `release` → `done` | `/pmagent-devops` |

The `/pmagent-…` commands live in `.claude/commands/`. Each one loads its role guide, and the role guide says exactly what to read, do and hand off.

## Groups (folders) and stages

A work item is **one markdown file**. It moves between four folders under [`docs/phases/`](../phases/) as it advances (use `git mv` so history follows it).

| Folder | Stages inside | Comes in when | Leaves when |
|---|---|---|---|
| [`1-pending/`](../phases/1-pending/) | `idea` (in BACKLOG.md only) · `draft` · `pm-review` · `blocked` · `parked` | Planning drafts it | the PM verifies it → `2-ready/` |
| [`2-ready/`](../phases/2-ready/) | `ready` | the PM signs it off | the Developer starts it → `3-building/` |
| [`3-building/`](../phases/3-building/) | `dev` · `review` · `changes-requested` · `test` · `release` | the Developer starts it | DevOps merges it → `4-completed/` |
| [`4-completed/`](../phases/4-completed/) | `done` | DevOps merges it and the smoke run is green | — |

```
 Planning ──► Product Manager ──► Developer ──► Reviewer ──► Tester ──► DevOps
  draft        pm-review→ready      dev            review       test      release→done
 └──────── 1-pending ─────────┘└ 2-ready ┘└─────────────── 3-building ──────────────┘ 4-completed
                                              ▲                │            │
                                              └─ changes-requested ◄────────┘
```

- **`blocked`** means an owner decision (⛔) is needed. It's listed on BOARD.md under "Owner decisions".
- **`parked`** means deliberately on hold, e.g. everything prod/AWS.
- **WIP limit:** one item in `3-building/` at a time.
- **One agent at a time.** All six sessions share this folder and the Docker stack, so only the role named on BOARD.md's ▶ line works; the others wait.
- **Unit of flow:** one file = one pass through the pipeline, ideally 1–5 build steps. The PM splits anything bigger into lettered items (`3.8.3-t1`, `3.8.3-x1`).

## Every session, every role

**Start**
1. Run your role command. CLAUDE.md loads automatically; then read this file, your role guide and BOARD.md.
2. Find the item whose **Next role** is you. Read the whole item, especially its Handoff log. If nothing is waiting for you, say so and ask the owner what they'd like. Don't invent work.

**Finish (the handoff)**
1. Update the item's header line: Stage, Next role, Branch.
2. Append a handoff note to the item's **Handoff log** (template below).
3. Update the item's row on BOARD.md. If its group changed, `git mv` the file and move the row to the matching table. Then update the **▶ Next session** line at the top of BOARD.md:
   - normally it's the next role in order;
   - if you sent the item back, it's the role you sent it to;
   - after DevOps closes an item: `/pmagent-dev` if `2-ready/` has an item, else `/pmagent-pm` if a pending item is at `pm-review`, else `/pmagent-planning` (the owner's turn).
4. Commit those changes (see Git flow). **Never push.**
5. End your turn with two or three plain lines: what you did and what's next. **Don't message or wake other sessions.** The Overview session does that (see Autopilot).

**Handoff note template** (newest at the bottom of the log):

```markdown
### YYYY-MM-DD · <From role> → <To role>
- **Did:** what this session changed or decided (link commits).
- **State:** branch + head commit; what you ran and the results (test counts, typecheck/build).
- **Next role should:** the first concrete thing to do.
- **Watch out for:** risks, open questions, anything half-done.
```

## Rules for all roles

- **Stay in your lane.** Planning and the PM don't write product code. The Reviewer and Tester never edit product code; they write findings and send the item back. (The Tester may add test code.) The Developer doesn't change scope: gaps go back to the PM.
- **Backwards is normal.** `changes-requested` from the Reviewer or Tester goes back to the Developer, and the PM can send a draft back to Planning. Say why in the note.
- **Every code change gets reviewed.** After `changes-requested`, the fix goes Developer → Reviewer → Tester again. The Reviewer can keep a re-review short when the fix is small.
- **What goes to the owner.** The owner does Planning: what to build and what it should do. Ask the owner only when a requirement is unclear or contradicts the plan; mark it ⛔ in the item and on BOARD.md. Technical choices (how to build, test or run it) are yours: decide, and write one line on why in the item.
- **Out-of-scope ideas** go into [`1-pending/BACKLOG.md`](../phases/1-pending/BACKLOG.md) as one line (date, source). Don't build them.
- **Verify, don't assume.** A claim in a handoff note ("tests green", "browser-verified") must come from something you ran in this session, and you say what you ran.
- **Local only.** Everything runs on the local Docker stack ([runbook](../reference/00-local-runbook.md)). Prod and AWS are parked until the owner says otherwise.
- **Small steps.** One item at a time, one build step per commit.
- **Restore test data** you change in the dev database.

## Autopilot (the Overview session)

The owner plans; the rest runs by itself. A separate **Overview session** is the only dispatcher:

1. When a role session ends its turn, the Overview session reads the ▶ line on BOARD.md and wakes the session it names.
2. That repeats through PM → Developer → Reviewer → Tester → DevOps, including the fix loops, until the item is merged into `dev` and running on the local Docker stack. Then it moves on to the next item.
3. The Overview session stops and asks the owner only when:
   - the ▶ line names `/pmagent-planning` (nothing left that the owner has planned);
   - an item is `blocked` (⛔);
   - an agent asks the owner something;
   - an item has been sent back three times;
   - a step would be destructive;
   - finished work is waiting to be pushed (asked as one batch).

Agents never wake each other. They finish their handoff, update the ▶ line and end their turn.

## Git flow

| Branch | Purpose | Who writes to it |
|---|---|---|
| `main` | Stable. **Frozen while prod is parked**: a push or merge to `main` runs the AWS deploy workflow. | nobody, until the owner unfreezes it |
| `dev` | Integration branch; must always be green. | Planning / PM (docs-only commits); DevOps (merges) |
| `feat/<phase>-<slug>` | One per building item, e.g. `feat/3.8.3-t1-ai-subtasks`. Cut from `dev`. | Developer (code), Reviewer / Tester (their sections), until DevOps merges it |

- **Commit messages:** `<type>(<phase> <step>): <what>`, for example `feat(3.8.3-t1 S2): suggest-subtasks checklist`. Types: `feat`, `fix`, `test`, `docs`, `chore`. Docs-only handoffs use `docs(plan|pm|review|test|board): …`.
- **One build step = one commit**, and the item file update goes in the same commit as the code.
- **While an item is building**, its file and its BOARD row change only on its feature branch. Planning and the PM edit other rows on `dev`. BOARD.md has only one shared line (▶ Next session) and no "last updated" line, so those edits rarely conflict. If the ▶ line conflicts at merge time, keep the newer one.
- **Merging:** only DevOps merges, and only after the Tester passes: `git merge --no-ff feat/…` into `dev`, then delete the branch.
- **Pushing:** never without the owner's explicit "yes" in chat, for any branch.
- **Destructive git** (`reset --hard`, force-push, deleting unmerged branches) needs the owner's OK every time.

## Where things live

See [docs/README.md](../README.md) for the full map. The files each role needs most are linked from its guide.
