# Phase 3.4 — Workflow & Automation (simple rules, templates, import)

> **Status: ✅ W1–W4 COMPLETE** (2026-07-03, on `dev`, browser-verified) · W5 recurring tickets deferred. Deliberately *simple* automation — a handful of hardcoded triggers and quality-of-life creation tools. The full rule-builder / agent autonomy belongs to Phases 6–7; this phase must not grow into it.

## Why 3.4 exists
Repetitive ticket work (retyping bug templates, manually unblocking, re-creating chores) is busywork the product tagline promises to remove — even before agents land.

## Items
### W1. ✅ Ticket templates
`TicketTemplate { orgId, name, type, title, description, acceptanceCriteria, labelIds }` (small migration). "New from template" in the create flow + ⌘K. Seed two defaults (Bug, Feature).

### W2. ✅ Unblock nudge (default ON, per-project toggle)
When the last incomplete dependency of a ticket goes DONE/CANCELLED (check in the status-change path using `blockedByCounts`), notify the assignee ("AGP-12 is unblocked"). Reuses the notification pipeline.

### W3. ✅ Fixed automation rules (unblockNudge / autoTodoOnAssign / subtasksDoneNudge)
Three toggles per project (a JSON column on `Project`, no rules engine). **Shipped trio** (reconciled 2026-07-04 — this list is what's live):
- `unblockNudge` (default ON) — last open blocker closes → notify the blocked ticket's audience (this is W2's pipeline)
- `autoTodoOnAssign` — assigned → auto-move BACKLOG → TODO
- `subtasksDoneNudge` — all subtasks of a parent DONE → nudge the parent's audience

*Plan drift note:* the draft also listed "moved to IN_REVIEW → notify watchers" — dropped as redundant: watchers already receive `ticket.updated` status-change notifications for every transition, IN_REVIEW included.

### W4. ✅ CSV import / export
Export: current list-view filter → CSV. Import: CSV → tickets (title, description, priority, labels), preview-then-commit. Jira-compatible column aliases. Adoption lever for the testing team.

### W5. ⏸ Recurring tickets — DEFERRED
`recurrence` (RRULE-lite: weekly/sprintly) on a template; materialize on sprint start. Only if W1–W4 land fast.

## Guardrail
No user-defined trigger/condition/action builder here. If a rule needs configuration beyond on/off, it's Phase 6.
