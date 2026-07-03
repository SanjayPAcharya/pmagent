-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TICKET_UNBLOCKED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBTASKS_DONE';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "automation" JSONB;

-- CreateTable
CREATE TABLE "TicketTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'FEATURE',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT,
    "description" TEXT,
    "acceptanceCriteria" TEXT,
    "goal" TEXT,
    "constraints" TEXT,
    "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketTemplate_orgId_idx" ON "TicketTemplate"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTemplate_orgId_name_key" ON "TicketTemplate"("orgId", "name");

-- AddForeignKey
ALTER TABLE "TicketTemplate" ADD CONSTRAINT "TicketTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
