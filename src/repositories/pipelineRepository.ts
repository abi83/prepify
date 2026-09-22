import { Prisma } from "@prisma/client"
import { z } from "zod"

import { ForbiddenError, NotFoundError } from "./errors"
import { agentMetaSchema, type AgentMeta } from "../lib/agent"
import type { Review } from "../lib/agents/QuestionReviewer"
import { prisma } from "../lib/prisma"
import {
  pipelineAttemptsSchema,
  pipelineQuestionStatusSchema,
  type Concept,
  type PipelineAttempt,
  type PipelineQuestionStatus,
  type QuestionTask,
} from "../types/pipeline"
import { generatedQuestionSchema, type GeneratedQuestion } from "../types/questions"

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

/** One slot's full state: which attempts ran, and — once `status` is terminal — the outcome. */
export interface PipelineSlotState {
  status: PipelineQuestionStatus
  attempts: PipelineAttempt[]
  question: GeneratedQuestion | null // set once status = finished
  meta: AgentMeta[] | null // set once status = finished
}

export interface PipelineRunState {
  runId: string
  concepts: Concept[] | null
  questionTasks: QuestionTask[] | null
  // Map from task index → that slot's state (absent means slots haven't been initialized yet)
  slots: Map<number, PipelineSlotState>
}

/** Parses a `PipelineQuestion` row's JSON columns, failing fast on anything a writer here didn't produce. */
function toSlotState(q: { id: string; status: string; attempts: unknown; question: unknown; meta: unknown }): PipelineSlotState {
  const status = pipelineQuestionStatusSchema.parse(q.status)
  const attempts = pipelineAttemptsSchema.parse(q.attempts)

  if (q.question === null) {
    if (q.meta !== null) throw new Error(`PipelineQuestion ${q.id} has meta without a question`)
    return { status, attempts, question: null, meta: null }
  }
  return {
    status,
    attempts,
    question: generatedQuestionSchema.parse(q.question),
    meta: z.array(agentMetaSchema).parse(q.meta),
  }
}

export async function loadOrCreateRun(userId: string, prepId: string): Promise<PipelineRunState> {
  await assertOwnsPrep(userId, prepId)

  const existing = await prisma.pipelineRun.findUnique({
    where: { prepId },
    include: { questions: { orderBy: { taskIndex: "asc" } } },
  })

  if (existing) {
    const slots = new Map<number, PipelineSlotState>(
      existing.questions.map(q => [ q.taskIndex, toSlotState(q) ])
    )
    return {
      runId: existing.id,
      concepts: existing.concepts as Concept[] | null,
      questionTasks: existing.questionTasks as QuestionTask[] | null,
      slots,
    }
  }

  const created = await prisma.pipelineRun.create({ data: { prepId } })
  return { runId: created.id, concepts: null, questionTasks: null, slots: new Map() }
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

async function getAttempts(runId: string, taskIndex: number): Promise<{ id: string; attempts: PipelineAttempt[] }> {
  const row = await prisma.pipelineQuestion.findUnique({ where: { runId_taskIndex: { runId, taskIndex } } })
  if (!row) throw new NotFoundError(`PipelineQuestion not found for run ${runId}, task ${taskIndex}`)
  return { id: row.id, attempts: pipelineAttemptsSchema.parse(row.attempts) }
}

/** Persists a fresh attempt's build. Must be called before `saveAttemptReview` for the same `attemptNum`. */
export async function saveAttemptBuild(
  userId: string,
  runId: string,
  taskIndex: number,
  attemptNum: number,
  question: GeneratedQuestion,
  meta: AgentMeta,
): Promise<void> {
  await assertOwnsRun(userId, runId)
  const { attempts } = await getAttempts(runId, taskIndex)
  if (attempts.some(a => a.attemptNum === attemptNum)) {
    throw new Error(`PipelineQuestion run ${runId} task ${taskIndex} already has a build for attempt ${attemptNum}`)
  }
  const updated: PipelineAttempt[] = [ ...attempts, { attemptNum, build: { question, meta }, review: null } ]
  await prisma.pipelineQuestion.update({
    where: { runId_taskIndex: { runId, taskIndex } },
    data: { attempts: updated as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  })
}

/** Attaches a review outcome to an attempt whose build was already persisted via `saveAttemptBuild`. */
export async function saveAttemptReview(
  userId: string,
  runId: string,
  taskIndex: number,
  attemptNum: number,
  review: Review,
  passed: boolean,
  meta: AgentMeta,
): Promise<void> {
  await assertOwnsRun(userId, runId)
  const { attempts } = await getAttempts(runId, taskIndex)
  const target = attempts.find(a => a.attemptNum === attemptNum)
  if (!target) throw new Error(`PipelineQuestion run ${runId} task ${taskIndex} has no build for attempt ${attemptNum} to review`)
  const updated = attempts.map(a => a.attemptNum === attemptNum ? { ...a, review: { review, passed, meta } } : a)
  await prisma.pipelineQuestion.update({
    where: { runId_taskIndex: { runId, taskIndex } },
    data: { attempts: updated as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  })
}

/** Marks a slot finished — its final, shipped question and the meta behind it. Terminal: not retried on resume. */
export async function finishSlot(
  userId: string,
  runId: string,
  taskIndex: number,
  question: GeneratedQuestion,
  meta: AgentMeta[],
): Promise<void> {
  await assertOwnsRun(userId, runId)
  await prisma.pipelineQuestion.update({
    where: { runId_taskIndex: { runId, taskIndex } },
    data: {
      status: "finished",
      question: question as unknown as Prisma.InputJsonValue,
      meta: meta as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  })
}

/** Marks a slot failed — max attempts exhausted, or an unrecoverable agent error. Terminal: not retried on resume. */
export async function failSlot(userId: string, runId: string, taskIndex: number): Promise<void> {
  await assertOwnsRun(userId, runId)
  await prisma.pipelineQuestion.update({
    where: { runId_taskIndex: { runId, taskIndex } },
    data: { status: "failed", updatedAt: new Date() },
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
  totalTasks: number // 0 until task list is built
  completedSlots: number // status = finished
  failedSlots: number // status = failed (terminal, not retried)
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

  const completedSlots = await prisma.pipelineQuestion.count({ where: { runId: run.id, status: "finished" } })
  const failedSlots = await prisma.pipelineQuestion.count({ where: { runId: run.id, status: "failed" } })

  return {
    hasConcepts: run.concepts !== null,
    totalTasks: Array.isArray(run.questionTasks) ? run.questionTasks.length : 0,
    completedSlots,
    failedSlots,
  }
}
