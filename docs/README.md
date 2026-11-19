# PmAgent docs

Everything about the product except the code. **Live status is [BOARD.md](../BOARD.md)**; how the work flows is [workflow/](workflow/README.md).

| Folder | What's in it | Owned by |
|---|---|---|
| [workflow/](workflow/README.md) | The six-role pipeline: [role guides](workflow/roles/), the [work-item template](workflow/templates/work-item.md), the handoff and git rules | the owner |
| [product/](product/) | [overview.md](product/overview.md) (what and for whom), [roadmap.md](product/roadmap.md) (order and why), [features.md](product/features.md) (the plain-language user guide) | Planning. The Developer writes features.md and the PM checks it. |
| [phases/1-pending/](phases/1-pending/) | Phase drafts and the [backlog](phases/1-pending/BACKLOG.md) | Planning → PM |
| [phases/2-ready/](phases/2-ready/) | Build-ready specs | PM → Developer |
| [phases/3-building/](phases/3-building/) | The one item in progress | Developer → Reviewer → Tester → DevOps |
| [phases/4-completed/](phases/4-completed/) | Shipped phase specs (history) | DevOps files them |
| [reference/](reference/) | Stable technical specs: tech stack, data models, API, env, security, testing, Docker. Start with [00-local-runbook.md](reference/00-local-runbook.md) to run everything locally. | PM and DevOps keep them current |
| [reports/](reports/) | The architecture & compliance audit, the AI eval report, the Word user guide | — |
| [history/](history/README.md) | The frozen pre-restructure PROGRESS log and an old → new path map | — |

Several reference files still describe the original plan in places (old name, AWS services). Backlog T1 tracks refreshing them, so check them against the code before relying on them.
