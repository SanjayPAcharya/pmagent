# Reference: Data Models & Database Schema

> Stable reference. The single source of truth for all DB entities. Source: §4 of the original plan.
> **Phasing note:** not every model is needed on day one. Phase 1 needs `User`, `Organization`, `OrgMember`, `Project`. Phase 2 adds `Ticket`, `TicketDependency`, `Label`, `TicketLabel`, `Comment`, `Sprint`, `TicketWatcher`, `TicketActivity`, `OrgInvite`, and `Notification` (used for the **in-app** bell now; email/Slack/WhatsApp fan-out + `Integration` come in Phase 5). Phase 4 adds `AgentAction`, `AutonomySettings`, `Approval`, `Integration`. Migrate incrementally — but keep this file as the complete target schema.
>
> **Auth note (Keycloak):** identity is delegated to Keycloak (see [phase-1](../phases/phase-1-skeleton-auth-platform.md)). `User.idpSub` links to the Keycloak subject; `User.passwordHash` and the entire `Session` model are **unused** (Keycloak owns credentials + refresh tokens). They are kept in the schema for reference / possible fallback but are not written to in the Keycloak flow.

## Prisma schema

File: `apps/api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector"), pgcrypto]
}

// ─── Users & Auth ───────────────────────────────────────────

model User {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  idpSub        String?  @unique // Keycloak subject (`sub`) — JIT-provisioned on first login. See phase-1.
  email         String   @unique
  name          String
  avatarUrl     String?
  githubId      String?  @unique // set from the GitHub APP connection in Phase 4, NOT from login
  githubLogin   String?
  passwordHash  String?  // legacy/unused — credentials live in Keycloak
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships   OrgMember[]
  tickets       Ticket[]     @relation("CreatedBy")
  assignedTickets Ticket[]   @relation("AssignedTo")
  watching      TicketWatcher[]
  ticketActivity TicketActivity[]
  sentInvites   OrgInvite[]  @relation("InvitesSent")
  sessions      Session[]
  notifications Notification[]

  @@index([email])
}

model Session {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String   @db.Uuid
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshToken String   @unique
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  userAgent    String?
  ipAddress    String?

  @@index([userId])
  @@index([refreshToken])
}

// ─── Organizations & Projects ────────────────────────────────

model Organization {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  slug      String    @unique
  plan      PlanType  @default(FREE)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  members   OrgMember[]
  projects  Project[]
  invites   OrgInvite[]

  @@index([slug])
}

model OrgInvite {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId        String   @db.Uuid
  email        String?  // optional target; link works for whoever opens it if null
  role         OrgRole  @default(MEMBER)
  token        String   @unique // random; the /invite/:token link
  invitedById  String   @db.Uuid
  expiresAt    DateTime
  acceptedAt   DateTime?
  createdAt    DateTime @default(now())

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  invitedBy    User         @relation("InvitesSent", fields: [invitedById], references: [id])

  @@index([orgId])
  @@index([token])
}

model OrgMember {
  id             String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId          String       @db.Uuid
  userId         String       @db.Uuid
  role           OrgRole      @default(MEMBER)
  joinedAt       DateTime     @default(now())

  organization   Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId])
  @@index([orgId])
  @@index([userId])
}

model Project {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId         String    @db.Uuid
  name          String
  slug          String
  description   String?
  githubRepoUrl String?
  githubRepoOwner String?
  githubRepoName  String?
  githubInstallationId String?  // GitHub App installation ID for this repo's org (set on connect)
  defaultBranch   String  @default("main")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  tickets       Ticket[]
  sprints       Sprint[]
  integrations  Integration[]
  autonomySettings AutonomySettings?

  @@unique([orgId, slug])
  @@index([orgId])
}

// ─── Tickets ─────────────────────────────────────────────────

model Ticket {
  id                String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId         String        @db.Uuid
  sprintId          String?       @db.Uuid
  number            Int           // auto-increment per project, e.g. AGP-42
  title             String
  description       String?
  acceptanceCriteria String?      // Structured: "Given...When...Then..."
  goal              String?       // One-sentence goal
  constraints       String?       // Technical constraints for agent
  status            TicketStatus  @default(BACKLOG)
  priority          Priority      @default(MEDIUM)
  type              TicketType    @default(FEATURE)
  storyPoints       Int?
  dueDate           DateTime?     // optional ticket due date
  archivedAt        DateTime?     // soft delete — lists exclude archived by default
  assignedToId      String?       @db.Uuid
  createdById       String        @db.Uuid
  assignedAgentType AgentType?    // null = human assigned; set atomically on agent claim
  agentRunId        String?       @db.Uuid  // rotated per agent run; dedupes the BullMQ job
  prUrl             String?
  prNumber          Int?
  branchName        String?
  agentPhase        AgentPhase?
  parentId          String?       @db.Uuid  // for subtasks
  position          Float         @default(0) // for ordering in board
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  project           Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sprint            Sprint?       @relation(fields: [sprintId], references: [id])
  assignedTo        User?         @relation("AssignedTo", fields: [assignedToId], references: [id])
  createdBy         User          @relation("CreatedBy", fields: [createdById], references: [id])
  parent            Ticket?       @relation("Subtasks", fields: [parentId], references: [id])
  subtasks          Ticket[]      @relation("Subtasks")
  agentActions      AgentAction[]
  dependencies      TicketDependency[] @relation("DependsOn")
  dependents        TicketDependency[] @relation("BlockedBy")
  labels            TicketLabel[]
  comments          Comment[]
  watchers          TicketWatcher[]
  activity          TicketActivity[]
  notifications     Notification[]

  @@unique([projectId, number])
  @@index([projectId, status])
  @@index([sprintId])
  @@index([assignedToId])
}

model TicketDependency {
  id          String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId    String @db.Uuid  // this ticket depends on...
  dependsOnId String @db.Uuid  // ...this ticket

  ticket      Ticket @relation("DependsOn", fields: [ticketId], references: [id], onDelete: Cascade)
  dependsOn   Ticket @relation("BlockedBy", fields: [dependsOnId], references: [id], onDelete: Cascade)

  @@unique([ticketId, dependsOnId])
}

model Label {
  id      String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name    String
  color   String
  orgId   String        @db.Uuid
  tickets TicketLabel[]

  @@unique([orgId, name])
}

model TicketLabel {
  ticketId String @db.Uuid
  labelId  String @db.Uuid
  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  label    Label  @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([ticketId, labelId])
}

model Comment {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId    String   @db.Uuid
  authorId    String?  @db.Uuid  // null = agent comment
  agentType   AgentType?
  body        String
  isInternal  Boolean  @default(false)
  createdAt   DateTime @default(now())

  ticket      Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
}

// ─── Watchers (CC) ───────────────────────────────────────────

model TicketWatcher {
  ticketId String @db.Uuid
  userId   String @db.Uuid
  addedAt  DateTime @default(now())

  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([ticketId, userId])
  @@index([userId])
}

// ─── Ticket Activity (timeline / audit) ──────────────────────

model TicketActivity {
  id        String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId  String           @db.Uuid
  actorId   String?          @db.Uuid  // null = system/agent
  type      TicketActivityType
  fromValue String?          // e.g. previous status / assignee
  toValue   String?          // e.g. new status / assignee
  createdAt DateTime         @default(now())

  ticket    Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  actor     User?  @relation(fields: [actorId], references: [id])

  @@index([ticketId, createdAt])
}

enum TicketActivityType {
  CREATED
  STATUS_CHANGED
  ASSIGNED
  WATCHER_ADDED
  WATCHER_REMOVED
  SPRINT_CHANGED
  PRIORITY_CHANGED
}

// ─── Sprints ─────────────────────────────────────────────────

model Sprint {
  id          String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId   String       @db.Uuid
  name        String
  goal        String?
  status      SprintStatus @default(PLANNING)
  startDate   DateTime?
  endDate     DateTime?
  velocity    Int?         // story points completed
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tickets     Ticket[]

  @@index([projectId, status])
}

// ─── Agent Actions (Audit Log) ───────────────────────────────

model AgentAction {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId      String          @db.Uuid
  agentType     AgentType
  actionType    AgentActionType
  status        ActionStatus    @default(RUNNING)
  reasoning     String?         // agent's explanation of what it's doing
  input         Json?           // what the agent received
  output        Json?           // what the agent produced
  error         String?
  durationMs    Int?
  tokenCost     Int?            // total tokens used
  startedAt     DateTime        @default(now())
  completedAt   DateTime?

  ticket        Ticket          @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@index([agentType, status])
}

// ─── Autonomy Settings ───────────────────────────────────────

model AutonomySettings {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId           String   @unique @db.Uuid
  // 0 = human approves, 1 = auto after N examples, 2 = fully auto
  specPhaseLevel      Int      @default(0)
  buildPhaseLevel     Int      @default(0)
  qaPhaseLevel        Int      @default(0)
  stagingDeployLevel  Int      @default(0)
  prodDeployLevel     Int      @default(0) // hard cap at 1 — prod always needs human
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

// ─── Approvals (Gate Records) ────────────────────────────────

model Approval {
  id           String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId     String         @db.Uuid
  phase        AgentPhase
  requestedAt  DateTime       @default(now())
  resolvedAt   DateTime?
  resolvedById String?        @db.Uuid
  decision     ApprovalDecision?
  comment      String?

  @@index([ticketId, phase])
}

// ─── Integrations ────────────────────────────────────────────

model Integration {
  id          String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId   String          @db.Uuid
  type        IntegrationType
  config      Json            // channel-specific config (encrypted at rest)
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())

  project     Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, type])
}

// ─── Notifications ───────────────────────────────────────────

model Notification {
  id          String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String             @db.Uuid
  ticketId    String?            @db.Uuid
  type        NotificationType
  channel     NotificationChannel
  subject     String?
  body        String
  sentAt      DateTime?
  readAt      DateTime?
  metadata    Json?

  user        User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  ticket      Ticket?            @relation(fields: [ticketId], references: [id])

  @@index([userId, readAt])
}

// ─── Enums ───────────────────────────────────────────────────

enum PlanType { FREE PRO TEAM }

enum OrgRole { OWNER ADMIN MEMBER }

enum TicketStatus { BACKLOG TODO IN_PROGRESS IN_REVIEW BLOCKED DONE CANCELLED }

enum Priority { URGENT HIGH MEDIUM LOW }

enum TicketType { FEATURE BUG CHORE SPIKE }

enum AgentType { SPEC CODE QA DEPLOY OBSERVABILITY }

enum AgentPhase { SPEC BUILD REVIEW TEST STAGING CANARY PRODUCTION }

enum AgentActionType {
  READ_REPO GENERATE_SPEC WRITE_CODE CREATE_PR RUN_TESTS
  DEPLOY_STAGING DEPLOY_CANARY DEPLOY_PRODUCTION ROLLBACK POST_COMMENT
}

enum ActionStatus { RUNNING COMPLETED FAILED ROLLED_BACK }

enum SprintStatus { PLANNING ACTIVE COMPLETED CANCELLED }

enum ApprovalDecision { APPROVED REJECTED REQUEST_CHANGES }

enum IntegrationType { GITHUB WHATSAPP SLACK EMAIL }

enum NotificationType {
  TICKET_ASSIGNED TICKET_STATUS_CHANGED AGENT_COMPLETED AGENT_NEEDS_INPUT
  APPROVAL_REQUIRED PR_OPENED PR_MERGED DEPLOY_COMPLETED DEPLOY_FAILED
  SPRINT_STARTED SPRINT_COMPLETED MENTION
}

enum NotificationChannel { IN_APP EMAIL WHATSAPP SLACK }
```

## Additional database indexes

**How these are applied (decision):** do **not** run these by hand against the database — they would drift from the schema and could be dropped by a later `prisma migrate`. Simple ones (e.g. `(projectId, status, position)`) go in `schema.prisma` as `@@index`. The two **partial** indexes below use a `WHERE` clause that Prisma's `@@index` cannot express, so add them via an empty migration: run `prisma migrate dev --create-only`, paste the `CREATE INDEX` SQL into the generated migration file, then apply it. This keeps every index inside the migration history and reproducible across environments.

```sql
-- Board queries (status-based sorting) — prefer @@index([projectId, status, position]) in schema
CREATE INDEX idx_tickets_project_status_position
  ON "Ticket" ("projectId", status, position);

-- Sprint board (partial — add via --create-only migration)
CREATE INDEX idx_tickets_sprint_status
  ON "Ticket" ("sprintId", status)
  WHERE "sprintId" IS NOT NULL;

-- Agent action queries — prefer @@index([startedAt]) in schema
CREATE INDEX idx_agent_actions_started
  ON "AgentAction" ("startedAt" DESC);

-- Pending approvals (partial — add via --create-only migration)
CREATE INDEX idx_approvals_pending
  ON "Approval" ("ticketId")
  WHERE "resolvedAt" IS NULL;
```
