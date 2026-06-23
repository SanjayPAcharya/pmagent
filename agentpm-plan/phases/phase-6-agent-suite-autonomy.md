# Phase 6 — Full Agent Suite & Autonomy Dial

> **Goal:** Complete the agent lifecycle from idea to deployed feature. Add the Spec, QA, Deploy, and Observability agents, introduce per-run container isolation, and build the graduated autonomy dial that governs which phase transitions need a human.

**Depends on:** Phase 4 (Code Agent, queue, worker, approval gate), Phase 5 (notifications), Phase 2 (infra to extend for isolation + deploys).

> This maps to the original plan's **Phase 2 — Full Agent Suite** (Weeks 7–18).

**References:**
- [03-data-models.md](../references/03-data-models.md) — `AutonomySettings`, `Approval`, `AgentPhase`, `AgentType`
- [04-api-reference.md](../references/04-api-reference.md) — autonomy endpoints
- [06-security-checklist.md](../references/06-security-checklist.md) — prod always requires human; agent isolation
- [08-monitoring.md](../references/08-monitoring.md) — SLO monitoring for auto-rollback

---

## Deliverables

### Spec Agent
- [ ] Spec agent container + ECS task def
- [ ] Natural language → structured ticket (title, goal, acceptance criteria, subtasks)
- [ ] OpenAPI 3.1 contract generation from spec
- [ ] Spec review UI (human approves/edits before build starts)
- [ ] "Draft spec from idea" flow in frontend

### QA Agent (introduces per-run container isolation)
- [ ] QA agent container
- [ ] Test generation (unit + integration) from PR diff
- [ ] Run tests in isolated Docker environment
- [ ] Accessibility check plugin (axe-core)
- [ ] Test report UI on ticket
- [ ] QA → human review gate

### Deploy Agent
- [ ] Deploy agent container
- [ ] AWS CodeDeploy integration (or direct ECS update)
- [ ] Environment promotion: dev → staging → canary → production
- [ ] SLO monitoring (CloudWatch metrics) — auto-rollback on threshold breach
- [ ] Feature flag integration (LaunchDarkly or home-built simple toggle)
- [ ] Deploy status UI on ticket + board

### Observability Agent
- [ ] CloudWatch + Sentry integration
- [ ] Post-deploy metric monitoring
- [ ] Anomaly detection → auto-create rollback ticket
- [ ] Observability dashboard on project page

### Autonomy Dial
- [ ] Autonomy settings UI per project per phase
- [ ] Server-side enforcement of all levels
- [ ] Auto-approval logic after N confirmed examples
- [ ] Audit log of all autonomy decisions

---

## Agent isolation (graduates from in-process)

The QA Agent executes generated code, so it needs hard sandboxing. This is where the worker's in-process dispatch (Phase 4) is replaced with an **ECS `runTask` per run** — each agent run gets its own Fargate task with no shared filesystem. Because every agent is a pure function decoupled from invocation, the agent code itself does not change; only the worker's dispatch does. Update the network/compute stacks ([phase-2](phase-2-dev-deployment-cicd.md)) to grant agent tasks their own security group (already reserved as `AgentSG`) and minimal IAM.

## Autonomy dial semantics

`AutonomySettings` (per project) stores a level per phase: `0` = human approves, `1` = auto after N confirmed examples, `2` = fully auto. **`prodDeployLevel` is hard-capped at 1 — production always requires a human, enforced server-side and not configurable** (see [06-security-checklist.md](../references/06-security-checklist.md)).

- Every phase transition checks the project's autonomy level **server-side**. Frontend cannot bypass; agents cannot self-promote past a gate.
- When a gate requires a human, an `Approval` record is created and a notification fires ([phase-5](phase-5-notifications-channels.md)).
- Auto-approval at level 1 kicks in only after N confirmed human approvals of the same phase/agent, and every autonomy decision is written to an audit log.

`AgentPhase` order: `SPEC → BUILD → REVIEW → TEST → STAGING → CANARY → PRODUCTION`. Each agent advances the ticket through these phases, gated by the dial.

---

## Definition of Done

- An idea can flow: Spec Agent drafts a ticket → human approves → Code Agent builds → QA Agent tests in isolation → Deploy Agent promotes through environments with gates → Observability Agent watches and can auto-create a rollback ticket.
- Production deploys always stop for a human, regardless of dial setting.
- Autonomy levels are enforced server-side and every decision is audited.
- The approve-gate test cases (incl. "prod always requires human") in [07-testing-strategy.md](../references/07-testing-strategy.md) pass.
