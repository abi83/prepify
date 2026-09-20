-- CreateEnum
CREATE TYPE "GenerationEntityType" AS ENUM ('prep', 'question');

-- CreateTable
CREATE TABLE "GenerationMeta" (
    "id" TEXT NOT NULL,
    "entityType" "GenerationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "cachedTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "toolCalls" INTEGER NOT NULL,
    "executionMs" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationMeta_entityType_entityId_idx" ON "GenerationMeta"("entityType", "entityId");
