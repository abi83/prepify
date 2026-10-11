-- Rows built before jobs are dropped, not migrated: there's no production data (#275).
DELETE FROM "GenerationMeta" WHERE "jobId" IS NULL;
DELETE FROM "Question" WHERE "producedByJobId" IS NULL;

-- DropForeignKey
ALTER TABLE "PipelineQuestion" DROP CONSTRAINT "PipelineQuestion_runId_fkey";

-- DropForeignKey
ALTER TABLE "PipelineRun" DROP CONSTRAINT "PipelineRun_prepId_fkey";

-- DropIndex
DROP INDEX "GenerationMeta_entityType_entityId_idx";

-- AlterTable
ALTER TABLE "GenerationMeta" DROP COLUMN "entityId",
DROP COLUMN "entityType",
ALTER COLUMN "jobId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Prep" DROP COLUMN "tokensUsed";

-- DropTable
DROP TABLE "PipelineQuestion";

-- DropTable
DROP TABLE "PipelineRun";

-- DropEnum
DROP TYPE "GenerationEntityType";

-- DropEnum
DROP TYPE "PipelineQuestionStatus";

-- CreateIndex
CREATE INDEX "GenerationMeta_jobId_idx" ON "GenerationMeta"("jobId");
