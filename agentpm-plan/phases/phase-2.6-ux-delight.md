# Phase 2.6 — UX Delight & Agent-First Polish

> **Status: ✅ COMPLETE** — all non-agent items (6 slices) shipped & browser-verified; the agent-implying items A2–A4 were split to [Phase 2.7](phase-2.7-agent-first.md) (parked → land with Phase 5). A creative pass that turns the working PM core (Phase 2 + 2.1 + 2.5) into something with a distinct point of view: **agent-first** project management. Most items build on primitives we already have — the Redis event bus + WS rooms, presence, the structured ticket schema (`goal`/`acceptanceCriteria`/`constraints`), the command palette, optimistic-update rollback state, completion counts — so they're high-impact for low effort.
>
> Effort: **S** ≈ <1h · **M** ≈ 1–3h · **L** ≈ half-day+. "Backend" = needs new/changed API; otherwise pure web. "Phase 5-dep" = the *action* lights up when the Code/Spec agent lands, but the UI ships now.

## Why 2.6 exists
Phase 2.5 hardened the UX (theme, i18n, mobile, ⌘K, a11y). 2.6 gives it personality and leans into the differentiator from the landing tagline — *AI-agent-first project management* — while the surrounding work (board/drawer/realtime) is fresh. Ship selectively; this is a delight backlog, not a gate.

---

## Group A — Agent-first signatures (the differentiator)

> **A2–A4 moved to [Phase 2.7](phase-2.7-agent-first.md)** (2026-06-25) — they imply an actual Code/Spec agent, so they're parked for discussion alongside Phase 5. **A1 stayed here** and shipped in Slice 1 (pure derived UI, no agent dependency).

### A1. Ticket "readiness meter" — **S**, no backend
A small ring/badge on each card + drawer showing how agent-ready a ticket is, derived from how much of `goal` / `acceptanceCriteria` / `constraints` is filled. Empty AC → amber, all present → green. Nudges authors toward tickets an agent can actually pick up. Pure derived UI over existing fields.

### A2. `@agent` as a first-class mention — **M**, Phase 5-dep
Add CODE/SPEC agents to the existing @mention picker (and assignee picker). Mentioning `@code` / assigning an agent is wired in the UI now; the trigger fires once Phase 5 lands. Reuses `assignedAgentType` (already on the schema) + the mention flow.

### A3. "Draft with agent" skeleton — **M**, Phase 5-dep
A subtle button in the drawer that asks an agent to expand a one-line title into `goal` + `acceptanceCriteria` + `constraints`, streamed in as editable placeholder text. Stub the action until Phase 5; design the affordance now.

### A4. Agent swimlane / badge on the board — **S–M**, Phase 5-dep
A faint "🤖 in progress by agent" treatment (badge now, optional swimlane later) so human vs. agent work reads at a glance. Fed by the same `ticket.updated` WS event + the agent scalar columns.

---

## Group B — Board

### B1. Live "ghost drag" via presence — **M**, no backend (uses WS)
When another viewer drags a card, broadcast its in-flight position over WS and render a phantom with their avatar. Multiplayer-cursor energy. Builds on presence + the event bus; add a lightweight `ticket.dragging` ephemeral event.

### B2. Column WIP pulse — **S**, no backend
Soft per-column WIP limit; header pulses amber when exceeded. Flow discipline with zero config beyond a number.

### B3. Swipe-to-advance (mobile) — **S**, no backend
Swipe a card right = next status. Faster than long-press-drag on a phone; reuses `updateTicketStatus`.

### B4. Focus mode (`f`) — **S**, no backend
Collapse/dim all columns except those with the current user's assigned tickets. "What's mine right now."

### B5. Time-decay coloring — **S**, no backend
Cards subtly desaturate the longer since `updatedAt`. Calm staleness signal instead of a nagging badge. Respect reduced-motion / keep it subtle.

---

## Group C — Ticket drawer

### C1. Unified "story" timeline — **M**, no backend
Optional merged view interleaving activity events + comments (GitHub-style). Both data sources already exist.

### C2. Acceptance-criteria checklist — **M**, small backend
Parse `Given/When/Then` AC into checkable items; card completion bar can reflect AC progress. Bridges to a QA agent later. Needs a place to persist checitem state (or derive from a convention).

### C3. In-editor slash commands — **M**, no backend
`/assign`, `/sprint`, `/due tomorrow`, `/label bug` inside description/comment — reuses palette muscle memory at the point of writing.

### C4. Relative time w/ exact on hover — **S**, no backend
"2h ago" everywhere, hover reveals the timestamp.

---

## Group D — Command palette (push the strength)

### D1. Full action surface — **M**, no backend
Beyond navigate + create: change status, assign, move to sprint, add label, toggle theme — all by typing. Mouse-free operation.

### D2. Recent / frecency — **S**, no backend
Surface last-visited tickets + most-used projects before the user types (localStorage frecency).

### D3. Natural quick-create — **M**, no backend
Parse `Fix login bug !high @sanjay #sprint2` into priority/assignee/sprint on create (Linear-style). The create API already accepts those fields.

---

## Group E — Notifications / presence / realtime

### E1. Ticket-level presence — **M**, no backend (uses WS)
Show which open ticket each viewer is on (avatar on the card / in the drawer). Extends project-room presence to ticket granularity.

### E2. Toast → Undo — **S**, no backend
Every optimistic action's toast carries a 5s **Undo** that re-applies the previous value. We already snapshot prev state for rollback (C11) — just surface it.

### E3. Notification grouping + "catch me up" — **M**, small backend
Collapse "3 changes on AGP-42" into one row; a since-last-seen digest in the bell.

---

## Group F — Sprints / planning

### F1. Burndown sparkline — **M**, backend (daily snapshot)
Tiny inline chart per sprint from completion counts over time. Cheap daily snapshot job/table.

### F2. Drag tickets into a sprint — **M**, no backend
A "Sprint" drop target or a board-grouped-by-sprint view; reuses dnd + `addToSprint`.

### F3. Velocity-aware capacity bar — **S**, no backend
While planning, show "added 34 pts vs. last velocity 28" overcommit hint. Velocity already stored on completed sprints.

---

## Group G — Delight / craft

### G1. "Done" confetti — **S**, no backend
A burst when a card hits DONE; gate on `prefers-reduced-motion`.

### G2. Accent color per org + theme tristate — **M**, small backend
Per-org accent drives the `--primary` token so workspaces feel distinct; theme light/dark/system tristate + `t` shortcut. Accent needs a field on Organization.

### G3. Layout-matched skeletons — **S**, no backend
Column/card-shaped shimmer instead of generic blocks.

### G4. Keyboard help overlay (`?`) — **S**, no backend
Cheatsheet of shortcuts; signals a keyboard-first tool.

---

## Group H — Onboarding / empty states

### H1. Guided first ticket — **S**, no backend
Replace "No tickets" with a 3-step starter (name → goal → drop in a column) that teaches the agent-ready pattern.

### H2. Invite nudge on empty members — **S**, no backend
Empty members list leads with the copyable invite link (Members page already built).

---

## Suggested order (ship selectively)
1. **Quick wins, no backend:** E2 Undo · A1 readiness meter · G1 confetti · G3 skeletons · G4 `?` overlay · C4 relative time · B4 focus mode.
2. **Palette power:** D1 action surface · D2 frecency · D3 natural create.
3. **Realtime flair:** E1 ticket presence · B1 ghost drag.
4. **Agent-first (design now, wire in Phase 5):** A1→A2→A3→A4.
5. **Bigger / backend:** C2 AC checklist · F1 burndown · G2 org accent · E3 grouping.

## Done-when (per shipped item)
- Builds on existing primitives without regressing the verified Phase-2 flows.
- `prefers-reduced-motion` respected for any motion (confetti, decay, pulse).
- Keyboard-accessible and i18n'd (strings in `en.json`).
- Each shipped item: typecheck + build green; user-verified in-browser.
