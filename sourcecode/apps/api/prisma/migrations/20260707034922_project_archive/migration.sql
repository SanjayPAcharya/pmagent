-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Project_orgId_archivedAt_idx" ON "Project"("orgId", "archivedAt");
