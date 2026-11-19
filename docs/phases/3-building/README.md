# 3 · Building

The one item currently being built, reviewed, tested or released. **WIP limit: one item.**

- **Stages here:** `dev` → `review` → `test` → `release`, plus `changes-requested` (back to the Developer).
- **Comes in:** the Developer moves it from [`2-ready/`](../2-ready/) and cuts its branch, `feat/<phase>-<slug>`.
- **While it's here:** its file and its BOARD row change only on that feature branch.
- **Goes out:** DevOps merges the branch into `dev` and moves the file to [`4-completed/`](../4-completed/).
