-- CreateEnum
CREATE TYPE "prep_visibility" AS ENUM ('private', 'link', 'public');

-- CreateEnum
CREATE TYPE "prep_discipline" AS ENUM ('History', 'Geography', 'Literature', 'Languages', 'Social Studies', 'Economics', 'Philosophy/Ethics', 'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Computer Science');

-- CreateTable
CREATE TABLE "preps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Prep #1',
    "pages" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "visibility" "prep_visibility" NOT NULL DEFAULT 'private',
    "grade" INTEGER,
    "discipline" "prep_discipline",
    "language" TEXT,

    CONSTRAINT "preps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "prep_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "prep_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "prep_id" TEXT NOT NULL,
    "concepts" JSONB,
    "question_tasks" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_questions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "task_index" INTEGER NOT NULL,
    "task" JSONB NOT NULL,
    "question" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "blob" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_runs_prep_id_key" ON "pipeline_runs"("prep_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_questions_run_id_task_index_key" ON "pipeline_questions"("run_id", "task_index");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_prep_id_fkey" FOREIGN KEY ("prep_id") REFERENCES "preps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_prep_id_fkey" FOREIGN KEY ("prep_id") REFERENCES "preps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_prep_id_fkey" FOREIGN KEY ("prep_id") REFERENCES "preps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_questions" ADD CONSTRAINT "pipeline_questions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pipeline_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
