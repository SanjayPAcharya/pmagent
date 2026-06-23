# Phase 7 — Autonomous Sprints

> **Goal:** The end state. Drop a milestone in, and the system plans an entire sprint with a dependency graph, then executes it across coordinated agents — shipping features with gates where the autonomy dial requires them.

**Depends on:** Phase 6 (full agent suite + autonomy dial), and everything before it.

> This maps to the original plan's **Phase 3 — Autonomous Sprints** (Months 5–9).

**References:**
- [03-data-models.md](../references/03-data-models.md) — `Sprint`, `Ticket` dependencies, `AutonomySettings`
- [01-tech-stack.md](../references/01-tech-stack.md) — Principle 1 (agents decoupled via queue) underpins multi-agent coordination

---

## Deliverables

- [ ] Sprint Planner Agent (milestone → full sprint with dependency graph)
- [ ] Multi-agent coordination layer (shared context, merge conflict prediction)
- [ ] Sprint auto-execution with gates
- [ ] Parallel agent workstreams
- [ ] Product analytics + velocity tracking
- [ ] Team-level autonomy reports

---

## Notes for builders

- **Sprint Planner Agent** decomposes a milestone into tickets with `goal` / `acceptanceCriteria` / `constraints` (the same structured fields humans fill in Phase 3) and wires `TicketDependency` edges into a dependency graph.
- **Coordination is still queue-mediated** (Principle 1): the coordination layer schedules work and shares context, but agents never call each other directly. Merge-conflict prediction looks at the files each in-flight Code Agent run touches before parallelizing.
- **Gates still apply:** auto-execution runs only as far as each phase's autonomy level allows; production always stops for a human ([phase-6](phase-6-agent-suite-autonomy.md)).
- **Analytics:** velocity tracking and team-level autonomy reports build on the `AgentAction` audit log and `Sprint.velocity`.

---

## Definition of Done

- A user drops in a milestone; the system produces a planned sprint (tickets + dependency graph) for review.
- Approved, the sprint executes across parallel agent workstreams with the configured gates, and velocity/autonomy reporting reflects the run.
