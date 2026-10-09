/*
  Warnings:

  - You are about to drop the column `pages` on the `Prep` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PrepImageStatus" AS ENUM ('pending', 'processing', 'done', 'failed');

-- AlterTable
ALTER TABLE "Prep" DROP COLUMN "pages";

-- CreateTable
CREATE TABLE "PrepImage" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "gcsKey" TEXT NOT NULL,
    "status" "PrepImageStatus" NOT NULL DEFAULT 'pending',
    "ocrResult" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepImage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PrepImage" ADD CONSTRAINT "PrepImage_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "Prep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
