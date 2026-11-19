# Roadmap

> Owned by **Product Planning**: the order of the work and why. The live status of every item is on [BOARD.md](../../BOARD.md); this page is the big picture.

## The vision
PmAgent by Buildenics is project management for software teams, built so AI agents can eventually pick up tickets and work alongside people. A ticket goes from spec → pull request → review → release, with a human approving each step. See [overview.md](overview.md).

## Where we are (2026-11-19)
- **Built (Phases 1 → 3.8.7):** a complete, polished PM tool. That covers organizations and projects, tickets and the board, sprints, real-time collaboration, the List and Timeline (Gantt) views, milestones, reports, archive and restore, compliance basics (audit log, GDPR export and erasure), and AI ticket drafting.
- **Not started:** the agent half of the vision (Phases 5–7) and outbound notifications (Phase 4).
- **Mode:** local-first since 2026-11-19. Everything runs on the Docker stack on the owner's machine, and prod/AWS is parked.

## Local-first stand-ins (proposed; Planning to confirm with the owner)
Plans written before 2026-11-19 assume AWS services. Until prod is unparked:

| The plan assumes | Local stand-in |
|---|---|
| AWS SES email (Phase 4) | a dev mail-catcher container (e.g. Mailpit) |
| S3 file storage (attachments, backlog F1) | a MinIO container |
| A Sentry DSN for error monitoring (3.6-a1) | **confirmed 2026-11-19 (decision 7):** a code hook only, off unless a DSN is set. Sentry or a self-hosted GlitchTip can plug in later. |
| Amazon Bedrock for AI | keep using the dev key (decision 3 on BOARD.md, 2026-11-19) |
| GitHub webhooks to a public URL (Phase 5) | a tunnel to localhost (e.g. smee.io) |

## Sequence (set 2026-11-19: decision 1 on BOARD.md, with the 3.6 part revised by decisions 6–8)
1. **3.8.8 Session expiry & Remember me.** Already built; take it through review and test.
2. **3.8.3 AI auto-populate.** T1 suggest subtasks, then X1 natural-language quick-add.
3. **3.6 Polish & hardening, split into small items:** 3.6-b loose ends (delete cleanup, blocked-state bugs, phone + accessibility check), then 3.6-a2 soft plan limits, then 3.6-a1 the error-reporting hook. Loose ends go first because users notice them today; plan limits only matter once there are paying customers.
4. **Phase 4 Notifications & channels.** Email first (local mail catcher), then Slack and WhatsApp.
5. **3.6-a3a API tokens, then 3.6-a3b webhooks.** Moved here from 3.6 because only Phase 5 needs them.
6. **Phase 5 + 5.5 GitHub integration + Code Agent**, with the agent-first UI.
7. **Phase 6 Full agent suite + autonomy dial.**
8. **Phase 7 Autonomous sprints.**

Backlog items slot in between when Planning promotes them.

## How the phase numbers grew
- **1–7** come from the original plan: skeleton → PM core → deploy → notifications → GitHub/Code Agent → agent suite → autonomous sprints.
- **2.x** was hardening and branding before the first deploy: 2.1 gap closure, 2.5 UX hardening, 2.6 delight, 2.8/2.8.5 branding and sign-in, 2.9.1 deploy config (now a reference doc).
- **3.x** became the "feature-rich but simple" track after the first deploy: 3.1–3.6 were PM depth, collaboration, reports, automation, settings and polish. **3.7.x** came from the first real-user review. **3.8.x** is AI drafting plus the beta-feedback batches (3.8.4–3.8.7). 3.8.2 (BYOK) is still only an idea: backlog F4.
- **New items** take the next free number in the track they belong to, and Planning decides which. Big phases get split into lettered items, e.g. `3.8.3-t1`.

## Original build flow (June 2026, for reference)
```
Phase 1  Skeleton + Auth + Platform
Phase 2  PM Core
Phase 3  Dev Deployment + CI/CD
Phase 4  Notifications + Channels
Phase 5  GitHub Integration + Code Agent   (+ 5.5 agent-first surfaces)
Phase 6  Full Agent Suite + Autonomy
Phase 7  Autonomous Sprints
```
The original single-file spec grouped this as Foundation (including the Code Agent) → Full Agent Suite → Autonomous Sprints. Splitting it as above shipped sign-in and the platform before the agents.
