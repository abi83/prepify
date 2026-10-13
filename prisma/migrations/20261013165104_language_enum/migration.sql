/*
  Warnings:

  - The `language` column on the `Prep` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `language` to the `Concept` table without a default value. This is not possible if the table is not empty.
  - Added the required column `language` to the `Question` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'de', 'fr', 'it', 'es', 'pl', 'nl', 'pt', 'ru', 'uk');

-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "language" "Language" NOT NULL;

-- AlterTable
ALTER TABLE "Prep" DROP COLUMN "language",
ADD COLUMN     "language" "Language";

-- AlterTable
ALTER TABLE "PrepImage" ADD COLUMN     "language" "Language";

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "language" "Language" NOT NULL;
