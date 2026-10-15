-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "producedByJobId" TEXT;

-- Keep the newest asset per question, so the unique index below can be created.
DELETE FROM "Asset" a USING "Asset" newer
WHERE a."questionId" = newer."questionId"
  AND (a."createdAt", a."id") < (newer."createdAt", newer."id");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_questionId_key" ON "Asset"("questionId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_producedByJobId_fkey" FOREIGN KEY ("producedByJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
