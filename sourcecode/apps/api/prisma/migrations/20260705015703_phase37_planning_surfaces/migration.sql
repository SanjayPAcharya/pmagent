-- CreateEnum
CREATE TYPE "Workstream" AS ENUM ('SPRINT', 'ADHOC');

-- AlterEnum
ALTER TYPE "TicketActivityType" ADD VALUE 'WORKSTREAM_CHANGED';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "workstream" "Workstream" NOT NULL DEFAULT 'SPRINT';

-- CreateTable
CREATE TABLE "Milestone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Milestone_projectId_date_idx" ON "Milestone"("projectId", "date");

-- CreateIndex
CREATE INDEX "Ticket_projectId_workstream_idx" ON "Ticket"("projectId", "workstream");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
