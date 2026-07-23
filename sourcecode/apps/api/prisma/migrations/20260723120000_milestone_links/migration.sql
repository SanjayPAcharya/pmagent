-- 3.8.5 Milestones v2 — link tickets to a milestone (at most one per ticket).
-- Deleting a milestone unlinks its tickets (SET NULL), never deletes them.
ALTER TABLE "Ticket" ADD COLUMN "milestoneId" UUID;

CREATE INDEX "Ticket_milestoneId_idx" ON "Ticket"("milestoneId");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_milestoneId_fkey"
  FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
