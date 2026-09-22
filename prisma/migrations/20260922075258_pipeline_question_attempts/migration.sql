-- CreateEnum
CREATE TYPE "PipelineQuestionStatus" AS ENUM ('pending', 'finished', 'failed');

-- AlterTable
ALTER TABLE "PipelineQuestion" ADD COLUMN     "attempts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "status" "PipelineQuestionStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
