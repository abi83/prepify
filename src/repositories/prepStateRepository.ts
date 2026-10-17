import type { JobStatus } from "@prisma/client"

import { activeAssetHint } from "@/core/lib/assetHint"
import { indexMerges, indexPageConcepts } from "@/core/lib/jobs/pageConcepts"
import { countConceptUsage } from "@/core/lib/planner"
import { prisma } from "@/lib/prisma"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/types/jobTypes"
import type { PrepState } from "@/types/prepState"

import { interruptStaleJobs, RESUMABLE, TERMINAL } from "./jobRepository"

/** One LLM call of the job that produced a concept. A `wasted` call was billed but discarded. */
export interface GenerationCall {
  promptTokens: number
  cachedTokens: number
  completionTokens: number
  costUsd: number
  executionMs: number
  wasted: boolean
}

/** A job with all its LLM calls. */
export interface JobGeneration {
  jobId: string
  model: string
  tier: string
  calls: GenerationCall[]
}

export type StatedConcept = PrepState["concepts"][number] & { createdAt: Date; generation: JobGeneration }

/** `PrepState` with each concept's generation meta, for the prep page. */
export type GeneratedPrepState = PrepState & { concepts: StatedConcept[] }

/** The planner's view of a prep: completed outputs only. No ownership check — callers resolve the prep first. */
export async function loadPrepState(prepId: string): Promise<GeneratedPrepState> {
  const [ images, concepts, extractJobs, mergeJobs, prepMetaJobs, questions, questionJobCount, unfinishedJobCount, questionConceptInputs, assets, assetJobInputs ] = await Promise.all([
    prisma.prepImage.findMany({ where: { prepId }, select: { id: true, ocrResult: true }, orderBy: { createdAt: "asc" } }),
    prisma.concept.findMany({ where: { producedByJob: { prepId } }, include: { producedByJob: { include: { generationMetas: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.job.findMany({
      where: { prepId, type: CONCEPTS_EXTRACT_JOB_TYPE, status: "executed" },
      select: { output: true, inputs: { select: { entityId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.job.findMany({ where: { prepId, type: CONCEPTS_JOB_TYPE }, select: { status: true, inputs: { select: { entityId: true } } } }),
    prisma.job.count({ where: { prepId, type: PREP_META_JOB_TYPE, status: "executed" } }),
    prisma.question.findMany({ where: { prepId }, select: { id: true, content: true }, orderBy: { createdAt: "asc" } }),
    prisma.job.count({ where: { prepId, type: QUESTION_JOB_TYPE } }),
    prisma.job.count({ where: { prepId, ...RESUMABLE } }),
    prisma.jobInput.findMany({ where: { entityType: "concept", job: { prepId, type: QUESTION_JOB_TYPE, status: "executed" } }, select: { entityId: true } }),
    prisma.asset.findMany({ where: { question: { prepId } }, select: { questionId: true } }),
    prisma.jobInput.findMany({ where: { entityType: "question", job: { prepId, type: ASSET_JOB_TYPE } }, select: { entityId: true } }),
  ])

  const assetHandled = new Set([ ...assets.map(asset => asset.questionId), ...assetJobInputs.map(input => input.entityId) ])
  const assetQuestionIds = questions.filter(question => activeAssetHint(question.content) && !assetHandled.has(question.id)).map(question => question.id)

  const pageConcepts = indexPageConcepts(extractJobs.map(job => ({ inputIds: job.inputs.map(input => input.entityId), output: job.output })))
  const merges = indexMerges(mergeJobs.map(job => ({ status: job.status, inputIds: job.inputs.map(input => input.entityId) })))
  return {
    images: images.map(image => ({ id: image.id, ocrDone: image.ocrResult !== null, concepts: pageConcepts.get(image.id) ?? { status: "pending" }, merge: merges.get(image.id) ?? "none" })),
    concepts: concepts.map(({ id, name, description, importance, misconceptions, language, createdAt, producedByJob: job }) => {
      const calls = job.generationMetas.map(({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }) => ({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }))
      return { id, name, description, importance, misconceptions, language, createdAt, generation: { jobId: job.id, model: job.model, tier: job.tier, calls } }
    }),
    prepMetaDone: prepMetaJobs > 0,
    questionCount: questions.length,
    questionJobCount,
    unfinishedJobCount,
    conceptUsage: countConceptUsage(questionConceptInputs.map(input => input.entityId)),
    assetQuestionIds,
  }
}

/** Every job of the prep that made LLM calls, keyed by job id. No ownership check — callers resolve the prep first. */
export async function loadJobGenerations(prepId: string): Promise<Record<string, JobGeneration>> {
  const jobs = await prisma.job.findMany({ where: { prepId, generationMetas: { some: {} } }, include: { generationMetas: true } })
  return Object.fromEntries(jobs.map(job => {
    const calls = job.generationMetas.map(({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }) => ({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }))
    return [ job.id, { jobId: job.id, model: job.model, tier: job.tier, calls } ]
  }))
}

/** Wasted OCR calls of pages the prep rejected, keyed by image id. A rejected page has no `producedByJobId`, so its job is found by input; retries accumulate metas on that one job. Pages without wasted calls are absent. */
export async function loadRejectedPageGenerations(prepId: string): Promise<Record<string, JobGeneration>> {
  const jobs = await prisma.job.findMany({
    where: { prepId, type: OCR_JOB_TYPE, generationMetas: { some: { wasted: true } } },
    include: { generationMetas: { where: { wasted: true } }, inputs: { select: { entityId: true } } },
  })
  return Object.fromEntries(jobs.map(job => {
    const calls = job.generationMetas.map(({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }) => ({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }))
    return [ job.inputs[0].entityId, { jobId: job.id, model: job.model, tier: job.tier, calls } ]
  }))
}

export type RunState ="idle" | "running" | "interrupted"

export interface PrepProgress {
  runState: RunState // any job running, else any interrupted (needs the key to resume)
  totalPages: number
  ocrPages: number // pages with an OCR result
  rejectedPages: number // pages OCR rejected
  hasConcepts: boolean
  totalQuestions: number // quiz question jobs created so far, any status
  completedQuestions: number // executed
  failedQuestions: number // failed with attempts left, until resume re-executes them
  terminalQuestions: number // failed past the attempt cap; only an explicit retry re-runs them
  totalFlashcards: number // same four counts, for flashcard jobs
  completedFlashcards: number
  failedFlashcards: number
  terminalFlashcards: number
}

interface JobCounts { total: number; executed: number; failed: number; terminal: number }

/** What generation has done so far, for the UI. Null until the first job past OCR exists or a run is live — uploading alone isn't "generation started". No ownership check — callers resolve the prep first. */
export async function getPrepProgress(prepId: string): Promise<PrepProgress | null> {
  await interruptStaleJobs({ prepId })
  const [ images, conceptCount, questionJobs, otherJobs, runningJobs, interruptedJobs, terminalJobs ] = await Promise.all([
    prisma.prepImage.findMany({ where: { prepId }, select: { ocrResult: true, status: true } }),
    prisma.concept.count({ where: { producedByJob: { prepId } } }),
    prisma.job.groupBy({ by: [ "status", "questionType" ], where: { prepId, type: QUESTION_JOB_TYPE }, _count: true }),
    prisma.job.count({ where: { prepId, type: { notIn: [ OCR_JOB_TYPE, QUESTION_JOB_TYPE ] } } }),
    prisma.job.count({ where: { prepId, status: "running" } }),
    prisma.job.count({ where: { prepId, status: "interrupted" } }),
    prisma.job.groupBy({ by: [ "questionType" ], where: { prepId, type: QUESTION_JOB_TYPE, ...TERMINAL }, _count: true }),
  ])
  const runState: RunState = runningJobs > 0 ? "running" : interruptedJobs > 0 ? "interrupted" : "idle"
  if (otherJobs === 0 && questionJobs.length === 0 && runState === "idle") return null

  const countsFor = (isFlashcard: boolean): JobCounts => {
    const groups = questionJobs.filter(group => (group.questionType === "flashcard") === isFlashcard)
    const sumOf = (status: JobStatus) => groups.filter(group => group.status === status).reduce((sum, group) => sum + group._count, 0)
    const terminal = terminalJobs.filter(group => (group.questionType === "flashcard") === isFlashcard).reduce((sum, group) => sum + group._count, 0)
    return { total: groups.reduce((sum, group) => sum + group._count, 0), executed: sumOf("executed"), failed: sumOf("failed") - terminal, terminal }
  }
  const quiz = countsFor(false)
  const flashcards = countsFor(true)
  return {
    runState,
    totalPages: images.length,
    ocrPages: images.filter(image => image.ocrResult !== null).length,
    rejectedPages: images.filter(image => image.status === "failed").length,
    hasConcepts: conceptCount > 0,
    totalQuestions: quiz.total,
    completedQuestions: quiz.executed,
    failedQuestions: quiz.failed,
    terminalQuestions: quiz.terminal,
    totalFlashcards: flashcards.total,
    completedFlashcards: flashcards.executed,
    failedFlashcards: flashcards.failed,
    terminalFlashcards: flashcards.terminal,
  }
}
