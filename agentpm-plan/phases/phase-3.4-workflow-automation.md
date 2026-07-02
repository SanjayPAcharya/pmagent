# Phase 3.4 — Workflow & Automation (simple rules, templates, import)

> **Status: 📋 PLANNED**. Deliberately *simple* automation — a handful of hardcoded triggers and quality-of-life creation tools. The full rule-builder / agent autonomy belongs to Phases 6–7; this phase must not grow into it.

## Why 3.4 exists
Repetitive ticket work (retyping bug templates, manually unblocking, re-creating chores) is busywork the product tagline promises to remove — even before agents land.

## Items
### W1. Ticket templates — **M**
`TicketTemplate { orgId, name, type, title, description, acceptanceCriteria, labelIds }` (small migration). "New from template" in the create flow + ⌘K. Seed two defaults (Bug, Feature).

### W2. Unblock nudge — **S–M**, builds on 3.1
When the last incomplete dependency of a ticket goes DONE/CANCELLED (check in the status-change path using `blockedByCounts`), notify the assignee ("AGP-12 is unblocked"). Reuses the notification pipeline.

### W3. Fixed automation rules — **M**
Three toggles per project (a JSON column on `Project`, no rules engine):
- moved to IN_REVIEW → notify watchers
- moved to DONE → close linked subtasks' "blocked" state (recount)
- assigned → auto-move BACKLOG → TODO

### W4. CSV import / export — **M–L**
Export: current list-view filter → CSV. Import: CSV → tickets (title, description, priority, labels), preview-then-commit. Jira-compatible column aliases. Adoption lever for the testing team.

### W5. Recurring tickets — **M**, defer-able
`recurrence` (RRULE-lite: weekly/sprintly) on a template; materialize on sprint start. Only if W1–W4 land fast.

## Guardrail
No user-defined trigger/condition/action builder here. If a rule needs configuration beyond on/off, it's Phase 6.
