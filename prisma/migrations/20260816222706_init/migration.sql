-- CreateEnum
CREATE TYPE "PrepVisibility" AS ENUM ('private', 'link', 'public');

-- CreateEnum
CREATE TYPE "PrepDiscipline" AS ENUM ('History', 'Geography', 'Literature', 'Languages', 'Social Studies', 'Economics', 'Philosophy/Ethics', 'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Computer Science');

-- CreateTable
CREATE TABLE "Prep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "visibility" "PrepVisibility" NOT NULL DEFAULT 'private',
    "grade" INTEGER,
    "discipline" "PrepDiscipline",
    "language" TEXT,

    CONSTRAINT "Prep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "concepts" JSONB,
    "questionTasks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineQuestion" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "taskIndex" INTEGER NOT NULL,
    "task" JSONB NOT NULL,
    "question" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "blob" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_prepId_key" ON "PipelineRun"("prepId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineQuestion_runId_taskIndex_key" ON "PipelineQuestion"("runId", "taskIndex");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "Prep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "Prep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "Prep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineQuestion" ADD CONSTRAINT "PipelineQuestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
