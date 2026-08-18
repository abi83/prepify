import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { Concept, QuestionTask } from '../types/pipeline'
import type { GeneratedQuestion } from '../types/questions'
import { ForbiddenError, NotFoundError } from './errors'

async function assertOwnsPrep(userId: string, prepId: string): Promise<void> {
  const prep = await prisma.prep.findUnique({ where: { id: prepId } })
  if (!prep) throw new NotFoundError(`Prep ${prepId} not found`)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)
}

async function assertOwnsRun(userId: string, runId: string): Promise<string> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, include: { prep: true } })
  if (!run) throw new NotFoundError(`Pipeline run ${runId} not found`)
  if (run.prep.userId !== userId) throw new ForbiddenError(`Pipeline run ${runId}'s prep is not owned by ${userId}`)
  return run.prepId
}

export interface PipelineRunState {
  runId: string
  concepts: Concept[] | null
  questionTasks: QuestionTask[] | null
  // Map from task index → built question (null means not yet built)
  questionSlots: Map<number, GeneratedQuestion | null>
}

export async function loadOrCreateRun(userId: string, prepId: string): Promise<PipelineRunState> {
  await assertOwnsPrep(userId, prepId)

  const existing = await prisma.pipelineRun.findUnique({
    where: { prepId },
    include: { questions: { orderBy: { taskIndex: 'asc' } } },
  })

  if (existing) {
    const questionSlots = new Map<number, GeneratedQuestion | null>(
      existing.questions.map(q => [q.taskIndex, q.question as GeneratedQuestion | null])
    )
    return {
      runId: existing.id,
      concepts: existing.concepts as Concept[] | null,
      questionTasks: existing.questionTasks as QuestionTask[] | null,
      questionSlots,
    }
  }

  const created = await prisma.pipelineRun.create({ data: { prepId } })
  return { runId: created.id, concepts: null, questionTasks: null, questionSlots: new Map() }
}

export async function saveConcepts(userId: string, runId: string, concepts: Concept[]): Promise<void> {
  await assertOwnsRun(userId, runId)
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { concepts: concepts as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  })
}

export async function saveQuestionTasksAndInitSlots(userId: string, runId: string, tasks: QuestionTask[]): Promise<void> {
  await assertOwnsRun(userId, runId)
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { questionTasks: tasks as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  })
  await prisma.pipelineQuestion.createMany({
    data: tasks.map((task, i) => ({
      runId,
      taskIndex: i,
      task: task as unknown as Prisma.InputJsonValue,
      question: Prisma.JsonNull,
    })),
  })
}

export async function saveQuestionSlot(userId: string, runId: string, taskIndex: number, question: GeneratedQuestion): Promise<void> {
  await assertOwnsRun(userId, runId)
  await prisma.pipelineQuestion.update({
    where: { runId_taskIndex: { runId, taskIndex } },
    data: { question: question as unknown as Prisma.InputJsonValue },
  })
}

export async function deleteRun(userId: string, prepId: string): Promise<void> {
  await assertOwnsPrep(userId, prepId)
  // pipeline_questions cascade-delete via FK on delete cascade
  await prisma.pipelineRun.deleteMany({ where: { prepId } })
}

// ── Read-only summary for the UI (no side effects) ──────────────────────────

export interface PartialRunSummary {
  hasConcepts: boolean
  totalTasks: number      // 0 until task list is built
  completedSlots: number  // non-null question slots (craft+review both done)
}

export async function getConcepts(userId: string, prepId: string): Promise<Concept[] | null> {
  await assertOwnsPrep(userId, prepId)
  const run = await prisma.pipelineRun.findUnique({ where: { prepId } })
  return (run?.concepts as Concept[] | null) ?? null
}

export async function getExistingRunSummary(userId: string, prepId: string): Promise<PartialRunSummary | null> {
  await assertOwnsPrep(userId, prepId)

  const run = await prisma.pipelineRun.findUnique({ where: { prepId } })
  if (!run) return null

  const completedSlots = await prisma.pipelineQuestion.count({
    where: { runId: run.id, NOT: { question: { equals: Prisma.JsonNull } } },
  })

  return {
    hasConcepts: run.concepts !== null,
    totalTasks: Array.isArray(run.questionTasks) ? run.questionTasks.length : 0,
    completedSlots,
  }
}
