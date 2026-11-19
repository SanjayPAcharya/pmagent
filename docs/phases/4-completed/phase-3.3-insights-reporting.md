# Phase 3.3 — Insights & Reporting

> **Status: ✅ DONE (R1/R2/R4/R5 — R3 deferred)** (2026-07-04). Backend: `services/reports.service.ts` + `GET /api/projects/:projectId/reports` (velocity per completed sprint · lead/cycle medians + p85 over a 90-day window with a weekly trend · open-per-member workload incl. an unassigned bucket). Frontend: `/orgs/:slug/projects/:projectSlug/reports` (`ProjectReports.tsx`) with hand-rolled SVG charts per the burndown precedent — velocity bars, weekly cycle/lead trend polylines, proportional workload bars — plus stat tiles and per-card empty states. Nav: tree leaf (chart icon) + board-header link beside Sprints. R3 (cumulative flow) deferred — revisit alongside the Phase-4 digest.

## Why 3.3 exists
The burndown (2.6) proved the pattern: reconstruct metrics from activity, no snapshot tables. A project "Reports" tab generalizes it and gives leads a reason to open PMAgent every Monday.

## Items
### R1. Velocity trend — **S–M**
Bar chart of `velocity` across completed sprints (data already set on sprint complete). Endpoint: reuse sprint list.

### R2. Cycle time / lead time — **M**
From `TicketActivity` STATUS_CHANGED rows: created→DONE (lead), first IN_PROGRESS→DONE (cycle). Median + p85 per sprint or rolling 30 days.

### R3. Cumulative flow diagram — **M**
Status counts per day reconstructed from activity (same technique as burndown reconstruction in `sprints.ts`).

### R4. Workload view — **S**
Open tickets per member (grouped count, mirrors `stats.service.ts` patterns) with over-WIP highlighting.

### R5. Reports tab — **M**
`/orgs/:slug/projects/:projectSlug/reports` housing R1–R4. Chart lib: extend whatever the burndown already uses — no new heavy dependency.

## Later hook
These aggregates become the payload of the Phase 4 weekly email digest — build the queries as reusable service functions, not route-inline.
