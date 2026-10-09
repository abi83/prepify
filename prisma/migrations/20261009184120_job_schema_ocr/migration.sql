-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('created', 'executed', 'failed');

-- AlterTable
ALTER TABLE "GenerationMeta" ADD COLUMN     "jobId" TEXT;

-- AlterTable
ALTER TABLE "PrepImage" ADD COLUMN     "producedByJobId" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "producedByJobId" TEXT;

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'created',
    "model" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "timeoutMs" INTEGER NOT NULL,
    "maxRetries" INTEGER NOT NULL,
    "output" JSONB,
    "failureReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "executedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInput" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "JobInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "importance" DOUBLE PRECISION NOT NULL,
    "misconceptions" TEXT[],
    "producedByJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobInput_entityType_entityId_idx" ON "JobInput"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "PrepImage" ADD CONSTRAINT "PrepImage_producedByJobId_fkey" FOREIGN KEY ("producedByJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_producedByJobId_fkey" FOREIGN KEY ("producedByJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationMeta" ADD CONSTRAINT "GenerationMeta_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "Prep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInput" ADD CONSTRAINT "JobInput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_producedByJobId_fkey" FOREIGN KEY ("producedByJobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
