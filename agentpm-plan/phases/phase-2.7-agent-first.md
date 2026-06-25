# Phase 2.7 — Agent-First Surfaces (parked for discussion)

> **Status: PARKED — to discuss.** Split out of [Phase 2.6](phase-2.6-ux-delight.md) on 2026-06-25. These are the "agent-first" delight items: their **UI** can ship before the Code/Spec agent exists, but their **action** only lights up once **[Phase 4](phase-4-github-code-agent.md)** lands. Parked here so 2.6 stays pure UX-on-existing-primitives, and so we can decide the agent UX deliberately rather than stubbing it piecemeal.
>
> Note: **A1 (ticket readiness meter)** already shipped in Phase 2.6 Slice 1 — it's pure derived UI over `goal`/`acceptanceCriteria`/`constraints` with no agent dependency, so it stayed in 2.6. The items below are the ones that imply an actual agent.

## Items

### A2. `@agent` as a first-class mention / assignee — M, Phase 4-dep
Add CODE/SPEC agents to the existing `@mention` picker (comment box) and the assignee picker. Mentioning `@code` or assigning an agent is wired in the UI now; the trigger fires once Phase 4 lands. Reuses `assignedAgentType` (already on the schema) + the mention flow.
**Open questions:** how do agents appear in member lists (synthetic members vs a separate group)? One agent per type per project, or per org? What does assigning to an agent *mean* before Phase 4 — disabled with a "coming soon" affordance, or hidden?

### A3. "Draft with agent" skeleton — M, Phase 4-dep
A subtle button in the drawer that asks an agent to expand a one-line title into `goal` + `acceptanceCriteria` + `constraints`, streamed in as editable placeholder text. Pairs naturally with the readiness meter (A1) — "draft" fills the ring.
**Open questions:** streaming UX (placeholder vs inline diff), where the call goes (API proxy to the model), cost/billing guard, undo/accept model.

### A4. Agent swimlane / badge on the board — S–M, Phase 4-dep
A faint "🤖 in progress by agent" treatment (badge first, optional swimlane later) so human vs. agent work reads at a glance. Fed by the same `ticket.updated` WS event + the agent scalar columns.
**Open questions:** badge vs full swimlane; how it interacts with the existing presence avatars; whether a human + agent can both be "on" a ticket.

## Why parked (not dropped)
- Each item's *value* is the agent doing something; a UI-only stub risks teaching a flow we'll redesign once the agent's real shape (run model, streaming, approval gate, cost) is known in Phase 4.
- The schema already anticipates them (`assignedAgentType` scalar), so there's no migration debt in waiting.

**Decision needed:** build the UI now as Phase-4-ready affordances, or fold these into Phase 4 itself so UI + behaviour land together. Revisit alongside the [Phase 4 plan](phase-4-github-code-agent.md).
