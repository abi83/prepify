-- CreateEnum
CREATE TYPE "PrepStatus" AS ENUM ('draft', 'processing', 'ready', 'failed');

-- AlterTable
ALTER TABLE "Prep" ADD COLUMN     "status" "PrepStatus" NOT NULL DEFAULT 'draft';


-- Backfill from jobs; mirrors derivePrepStatus (src/core/lib/prepStatus.ts), MAX_JOB_ATTEMPTS = 3.
UPDATE "Prep" p SET "status" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "Job" j WHERE j."prepId" = p."id" AND j."status" = 'failed' AND j."attempts" >= 3
      AND j."type" IN ('ocr', 'prep.meta', 'concepts.extract', 'concepts')
  ) THEN 'failed'::"PrepStatus"
  WHEN EXISTS (
    SELECT 1 FROM "Job" j WHERE j."prepId" = p."id" AND j."status" <> 'executed'
      AND NOT (j."status" = 'failed' AND j."attempts" >= 3)
  ) THEN 'processing'::"PrepStatus"
  WHEN EXISTS (SELECT 1 FROM "Job" j WHERE j."prepId" = p."id") THEN 'ready'::"PrepStatus"
  ELSE 'draft'::"PrepStatus"
END;
