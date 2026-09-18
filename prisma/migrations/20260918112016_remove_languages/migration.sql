/*
  Warnings:

  - The values [Languages] on the enum `PrepDiscipline` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PrepDiscipline_new" AS ENUM ('History', 'Geography', 'Literature', 'Social Studies', 'Economics', 'Philosophy/Ethics', 'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Computer Science', 'English', 'French', 'German', 'Spanish', 'Italian', 'Latin', 'Russian');
ALTER TABLE "Prep" ALTER COLUMN "discipline" TYPE "PrepDiscipline_new" USING ("discipline"::text::"PrepDiscipline_new");
ALTER TYPE "PrepDiscipline" RENAME TO "PrepDiscipline_old";
ALTER TYPE "PrepDiscipline_new" RENAME TO "PrepDiscipline";
DROP TYPE "public"."PrepDiscipline_old";
COMMIT;
