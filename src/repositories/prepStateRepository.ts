import type { JobStatus } from "@prisma/client"

import { activeAssetHint } from "@/core/lib/assetHint"
import { indexMerges, indexPageConcepts } from "@/core/lib/jobs/pageConcepts"
import { countConceptUsage } from "@/core/lib/planner"
import { prisma } from "@/lib/prisma"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/types/jobTypes"
import type { PrepState } from "@/types/prepState"

import { MAX_JOB_ATTEMPTS, RESUMABLE } from "./jobRepository"
import { getPrep } from "./prepRepository"

/** One LLM call of the job that produced a concept. A `wasted` call was billed but discarded. */
export interface GenerationCall {
  promptTokens: number
  cachedTokens: number
  completionTokens: number
  costUsd: number
  executionMs: number
  wasted: boolean
  generatedAt: Date
}

/** A job with all its LLM calls. `subject` says what the job worked on, e.g. "Page 2" or "single_choice · easy". */
export interface JobGeneration {
  jobId: string
  type: string
  status: JobStatus
  subject: string
  model: string
  tier: string
  calls: GenerationCall[]
}

export type StatedConcept = PrepState["concepts"][number] & { createdAt: Date; generation: JobGeneration }

/** `PrepState` with each concept's generation meta, for the prep page. */
export type GeneratedPrepState = PrepState & { concepts: StatedConcept[] }

/** A prep's concepts with the generation meta of the job that produced each. No ownership check. */
async function loadConcepts(prepId: string): Promise<StatedConcept[]> {
  const [ concepts, conceptJobs ] = await Promise.all([
    prisma.concept.findMany({ where: { producedByJob: { prepId } }, include: { producedByJob: true }, orderBy: { createdAt: "asc" } }),
    // Metas loaded once per job: a job shared by several concepts would otherwise repeat them per concept.
    prisma.job.findMany({ where: { prepId, concepts: { some: {} } }, select: { id: true, generationMetas: true } }),
  ])
  const metasByJob = new Map(conceptJobs.map(job => [ job.id, job.generationMetas ]))
  return concepts.map(({ id, name, description, importance, misconceptions, language, createdAt, producedByJob: job }) => {
    const subject = concepts.filter(concept => concept.producedByJob.id === job.id).map(concept => concept.name).join(", ")
    return { id, name, description, importance, misconceptions, language, createdAt, generation: toJobGeneration(job, subject, metasByJob.get(job.id) ?? []) }
  })
}

/** Concepts of a prep readable by `userId` (null: anonymous visitor). Throws NotFoundError/ForbiddenError otherwise. */
export async function listConcepts(userId: string | null, prepId: string): Promise<StatedConcept[]> {
  await getPrep(userId, prepId)
  return loadConcepts(prepId)
}

/** Job generations of a prep readable by `userId` (null: anonymous visitor). Throws NotFoundError/ForbiddenError otherwise. */
export async function listJobGenerations(userId: string | null, prepId: string): Promise<Record<string, JobGeneration>> {
  await getPrep(userId, prepId)
  return loadJobGenerations(prepId)
}

/** The planner's view of a prep: completed outputs only. No ownership check — callers resolve the prep first. */
export async function loadPrepState(prepId: string): Promise<GeneratedPrepState> {
  const [ images, concepts, extractJobs, mergeJobs, prepMetaJobs, questionCount, assetHintQuestions, questionJobCount, unfinishedJobCount, questionConceptInputs, assets, assetJobInputs ] = await Promise.all([
    prisma.prepImage.findMany({ where: { prepId }, select: { id: true, ocrResult: true }, orderBy: { createdAt: "asc" } }),
    loadConcepts(prepId),
    prisma.job.findMany({
      where: { prepId, type: CONCEPTS_EXTRACT_JOB_TYPE, status: "executed" },
      select: { output: true, inputs: { select: { entityId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.job.findMany({ where: { prepId, type: CONCEPTS_JOB_TYPE }, select: { status: true, inputs: { select: { entityId: true } } } }),
    prisma.job.count({ where: { prepId, type: PREP_META_JOB_TYPE, status: "executed" } }),
    prisma.question.count({ where: { prepId } }),
    prisma.question.findMany({ where: { prepId, content: { path: [ "asset_hint", "needed" ], equals: true } }, select: { id: true, content: true } }),
    prisma.job.count({ where: { prepId, type: QUESTION_JOB_TYPE } }),
    prisma.job.count({ where: { prepId, ...RESUMABLE } }),
    prisma.jobInput.findMany({ where: { entityType: "concept", job: { prepId, type: QUESTION_JOB_TYPE, status: "executed" } }, select: { entityId: true } }),
    prisma.asset.findMany({ where: { question: { prepId } }, select: { questionId: true } }),
    prisma.jobInput.findMany({ where: { entityType: "question", job: { prepId, type: ASSET_JOB_TYPE } }, select: { entityId: true } }),
  ])

  const assetHandled = new Set([ ...assets.map(asset => asset.questionId), ...assetJobInputs.map(input => input.entityId) ])
  const assetQuestionIds = assetHintQuestions.filter(question => activeAssetHint(question.content) && !assetHandled.has(question.id)).map(question => question.id)

  const pageConcepts = indexPageConcepts(extractJobs.map(job => ({ inputIds: job.inputs.map(input => input.entityId), output: job.output })))
  const merges = indexMerges(mergeJobs.map(job => ({ status: job.status, inputIds: job.inputs.map(input => input.entityId) })))
  return {
    images: images.map(image => ({ id: image.id, ocrDone: image.ocrResult !== null, concepts: pageConcepts.get(image.id) ?? { status: "pending" }, merge: merges.get(image.id) ?? "none" })),
    concepts,
    prepMetaDone: prepMetaJobs > 0,
    questionCount,
    questionJobCount,
    unfinishedJobCount,
    conceptUsage: countConceptUsage(questionConceptInputs.map(input => input.entityId)),
    assetQuestionIds,
  }
}

function toJobGeneration(job: { id: string; type: string; status: JobStatus; model: string; tier: string }, subject: string, metas: GenerationCall[]): JobGeneration {
  const calls = metas.map(({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted, generatedAt }) => ({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted, generatedAt }))
  return { jobId: job.id, type: job.type, status: job.status, subject, model: job.model, tier: job.tier, calls }
}

/** 1-based page number of each of the prep's images, in upload order. */
async function loadPageNumbers(prepId: string): Promise<Map<string, number>> {
  const images = await prisma.prepImage.findMany({ where: { prepId }, select: { id: true }, orderBy: { createdAt: "asc" } })
  return new Map(images.map((image, i) => [ image.id, i + 1 ]))
}

function pageSubject(job: { type: string; inputs: { entityId: string }[] }, pageNumbers: Map<string, number>): string {
  const pageId = job.inputs[0]?.entityId
  const number = pageId === undefined ? undefined : pageNumbers.get(pageId)
  if (number === undefined) throw new Error(`${job.type} job has no page input`)
  return `Page ${number}`
}

interface SubjectJob {
  type: string
  questionType: string | null
  difficulty: string | null
  inputs: { entityId: string }[]
  concepts: { name: string }[]
}

function subjectOf(job: SubjectJob, pageNumbers: Map<string, number>): string {
  switch (job.type) {
  case OCR_JOB_TYPE:
  case CONCEPTS_EXTRACT_JOB_TYPE:
    return pageSubject(job, pageNumbers)
  case CONCEPTS_JOB_TYPE:
    return job.concepts.map(concept => concept.name).join(", ")
  case QUESTION_JOB_TYPE:
    if (!job.questionType || !job.difficulty) throw new Error("question job has no questionType or difficulty")
    return `${job.questionType} · ${job.difficulty}`
  case PREP_META_JOB_TYPE:
    return "Title and description"
  case ASSET_JOB_TYPE:
    return "Illustration"
  default:
    throw new Error(`Unknown job type "${job.type}"`)
  }
}

/** Every job of the prep that made LLM calls, keyed by job id. No ownership check — callers resolve the prep first. */
export async function loadJobGenerations(prepId: string): Promise<Record<string, JobGeneration>> {
  const [ jobs, pageNumbers ] = await Promise.all([
    prisma.job.findMany({
      where: { prepId, generationMetas: { some: {} } },
      include: { generationMetas: true, inputs: { select: { entityId: true } }, concepts: { select: { name: true } } },
    }),
    loadPageNumbers(prepId),
  ])
  return Object.fromEntries(jobs.map(job => [ job.id, toJobGeneration(job, subjectOf(job, pageNumbers), job.generationMetas) ]))
}

/** Wasted OCR calls of pages the prep rejected, keyed by image id. A rejected page has no `producedByJobId`, so its job is found by input; retries accumulate metas on that one job. Pages without wasted calls are absent. */
export async function loadRejectedPageGenerations(prepId: string): Promise<Record<string, JobGeneration>> {
  const [ jobs, pageNumbers ] = await Promise.all([
    prisma.job.findMany({
      where: { prepId, type: OCR_JOB_TYPE, generationMetas: { some: { wasted: true } } },
      include: { generationMetas: { where: { wasted: true } }, inputs: { select: { entityId: true } } },
    }),
    loadPageNumbers(prepId),
  ])
  return Object.fromEntries(jobs.map(job => [ job.inputs[0].entityId, toJobGeneration(job, pageSubject(job, pageNumbers), job.generationMetas) ]))
}

export type RunState ="idle" | "running" | "interrupted"

export interface PrepProgress {
  runState: RunState // any job running, else any interrupted (needs the key to resume)
  totalPages: number
  ocrPages: number // pages with an OCR result
  rejectedPages: number // pages OCR rejected
  hasConcepts: boolean
  totalQuestions: number // question jobs created so far, any status
  completedQuestions: number // executed
  failedQuestions: number // failed with attempts left, until resume re-executes them
  terminalQuestions: number // failed past the attempt cap; only an explicit retry re-runs them
  totalFlashcards: number // same four counts, for flashcard jobs
  completedFlashcards: number
  failedFlashcards: number
  terminalFlashcards: number
}

/** What generation has done so far, for the UI. Null until the first job past OCR exists or a run is live — uploading alone isn't "generation started". Read-only: stale `running` jobs are swept separately (`interruptStaleJobs`). No ownership check — callers resolve the prep first. */
export async function getPrepProgress(prepId: string): Promise<PrepProgress | null> {
  const [ images, conceptCount, jobGroups ] = await Promise.all([
    prisma.prepImage.findMany({ where: { prepId }, select: { ocrResult: true, status: true } }),
    prisma.concept.count({ where: { producedByJob: { prepId } } }),
    // `attempts` is bounded by the cap, so grouping on it tells terminal from retryable failures.
    prisma.job.groupBy({ by: [ "type", "status", "attempts", "questionType" ], where: { prepId }, _count: true }),
  ])
  const countJobs = (matches: (group: (typeof jobGroups)[number]) => boolean) => jobGroups.filter(matches).reduce((sum, group) => sum + group._count, 0)
  const questionJobs = (isFlashcard: boolean, status?: JobStatus) =>
    countJobs(group => group.type === QUESTION_JOB_TYPE && (group.questionType === "flashcard") === isFlashcard && (status === undefined || group.status === status))
  const terminalJobs = (isFlashcard: boolean) =>
    countJobs(group => group.type === QUESTION_JOB_TYPE && (group.questionType === "flashcard") === isFlashcard && group.status === "failed" && group.attempts >= MAX_JOB_ATTEMPTS)

  const runningJobs = countJobs(group => group.status === "running")
  const interruptedJobs = countJobs(group => group.status === "interrupted")
  const otherJobs = countJobs(group => group.type !== OCR_JOB_TYPE && group.type !== QUESTION_JOB_TYPE)
  const totalQuestions = questionJobs(false)
  const totalFlashcards = questionJobs(true)
  const runState: RunState = runningJobs > 0 ? "running" : interruptedJobs > 0 ? "interrupted" : "idle"
  if (otherJobs === 0 && totalQuestions + totalFlashcards === 0 && runState === "idle") return null

  const terminalQuestions = terminalJobs(false)
  const terminalFlashcards = terminalJobs(true)
  return {
    runState,
    totalPages: images.length,
    ocrPages: images.filter(image => image.ocrResult !== null).length,
    rejectedPages: images.filter(image => image.status === "failed").length,
    hasConcepts: conceptCount > 0,
    totalQuestions,
    completedQuestions: questionJobs(false, "executed"),
    failedQuestions: questionJobs(false, "failed") - terminalQuestions,
    terminalQuestions,
    totalFlashcards,
    completedFlashcards: questionJobs(true, "executed"),
    failedFlashcards: questionJobs(true, "failed") - terminalFlashcards,
    terminalFlashcards,
  }
}
