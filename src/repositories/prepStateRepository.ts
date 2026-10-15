import type { JobStatus, Prep } from "@prisma/client"

import { activeAssetHint } from "@/lib/assetHint"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/lib/jobs/jobTypes"
import { indexPageConcepts } from "@/lib/jobs/pageConcepts"
import { nextJobs, type PlanTarget, type PrepState } from "@/lib/planner"
import { prisma } from "@/lib/prisma"

import { interruptStaleJobs } from "./jobRepository"

/** One LLM call of the job that produced a concept. A `wasted` call was billed but discarded. */
export interface GenerationCall {
  promptTokens: number
  cachedTokens: number
  completionTokens: number
  costUsd: number
  executionMs: number
  wasted: boolean
}

/** The job that produced a concept, with all its LLM calls. */
export interface ConceptGeneration {
  jobId: string
  model: string
  tier: string
  calls: GenerationCall[]
}

export type StatedConcept = PrepState["concepts"][number] & { createdAt: Date; generation: ConceptGeneration }

/** `PrepState` with each concept's generation meta, for the prep page. */
export type GeneratedPrepState = PrepState & { concepts: StatedConcept[] }

/** The planner's view of a prep: completed outputs only. No ownership check — callers resolve the prep first. */
export async function loadPrepState(prepId: string): Promise<GeneratedPrepState> {
  const [ images, concepts, extractJobs, prepMetaJobs, questions, questionJobCount, assets, assetJobInputs ] = await Promise.all([
    prisma.prepImage.findMany({ where: { prepId }, select: { id: true, ocrResult: true }, orderBy: { createdAt: "asc" } }),
    prisma.concept.findMany({ where: { producedByJob: { prepId } }, include: { producedByJob: { include: { generationMetas: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.job.findMany({
      where: { prepId, type: CONCEPTS_EXTRACT_JOB_TYPE, status: "executed" },
      select: { output: true, inputs: { select: { entityId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.job.count({ where: { prepId, type: PREP_META_JOB_TYPE, status: "executed" } }),
    prisma.question.findMany({ where: { prepId }, select: { id: true, content: true }, orderBy: { createdAt: "asc" } }),
    prisma.job.count({ where: { prepId, type: QUESTION_JOB_TYPE } }),
    prisma.asset.findMany({ where: { question: { prepId } }, select: { questionId: true } }),
    prisma.jobInput.findMany({ where: { entityType: "question", job: { prepId, type: ASSET_JOB_TYPE } }, select: { entityId: true } }),
  ])

  const assetHandled = new Set([ ...assets.map(asset => asset.questionId), ...assetJobInputs.map(input => input.entityId) ])
  const assetQuestionIds = questions.filter(question => activeAssetHint(question.content) && !assetHandled.has(question.id)).map(question => question.id)

  const pageConcepts = indexPageConcepts(extractJobs.map(job => ({ inputIds: job.inputs.map(input => input.entityId), output: job.output })))
  return {
    images: images.map(image => ({ id: image.id, ocrDone: image.ocrResult !== null, concepts: pageConcepts.get(image.id) ?? { status: "pending" } })),
    concepts: concepts.map(({ id, name, description, importance, misconceptions, language, createdAt, producedByJob: job }) => {
      if (job.generationMetas.length === 0) throw new Error(`Concept ${id} has no GenerationMeta on its job ${job.id}`)
      const calls = job.generationMetas.map(({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }) => ({ promptTokens, cachedTokens, completionTokens, costUsd, executionMs, wasted }))
      return { id, name, description, importance, misconceptions, language, createdAt, generation: { jobId: job.id, model: job.model, tier: job.tier, calls } }
    }),
    prepMetaDone: prepMetaJobs > 0,
    questionCount: questions.length,
    questionJobCount,
    assetQuestionIds,
  }
}

export type RunState = "idle" | "running" | "interrupted"

export interface PrepProgress {
  runState: RunState // any job running, else any interrupted (needs the key to resume)
  totalPages: number
  ocrPages: number // pages with an OCR result
  hasConcepts: boolean
  totalQuestions: number // question jobs created so far, any status
  completedQuestions: number // executed
  failedQuestions: number // failed, until resume re-executes them
}

/** What generation has done so far, for the UI. Null until the first job past OCR exists or a run is live — uploading alone isn't "generation started". No ownership check — callers resolve the prep first. */
export async function getPrepProgress(prepId: string): Promise<PrepProgress | null> {
  await interruptStaleJobs({ prepId })
  const [ images, conceptCount, questionJobs, otherJobs, runningJobs, interruptedJobs ] = await Promise.all([
    prisma.prepImage.findMany({ where: { prepId }, select: { ocrResult: true } }),
    prisma.concept.count({ where: { producedByJob: { prepId } } }),
    prisma.job.groupBy({ by: [ "status" ], where: { prepId, type: QUESTION_JOB_TYPE }, _count: true }),
    prisma.job.count({ where: { prepId, type: { notIn: [ OCR_JOB_TYPE, QUESTION_JOB_TYPE ] } } }),
    prisma.job.count({ where: { prepId, status: "running" } }),
    prisma.job.count({ where: { prepId, status: "interrupted" } }),
  ])
  const runState: RunState = runningJobs > 0 ? "running" : interruptedJobs > 0 ? "interrupted" : "idle"
  if (otherJobs === 0 && questionJobs.length === 0 && runState === "idle") return null

  const countOf = (status: JobStatus) => questionJobs.find(group => group.status === status)?._count ?? 0
  return {
    runState,
    totalPages: images.length,
    ocrPages: images.filter(image => image.ocrResult !== null).length,
    hasConcepts: conceptCount > 0,
    totalQuestions: questionJobs.reduce((sum, group) => sum + group._count, 0),
    completedQuestions: countOf("executed"),
    failedQuestions: countOf("failed"),
  }
}

/** Preps owned by `userId` that still need jobs to reach `target`. Unlike `listOwnedPreps`, includes inactive preps — those are the unfinished ones. */
export async function listUnfinishedPreps(userId: string, target: PlanTarget): Promise<Prep[]> {
  const preps = await prisma.prep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
  const states = await Promise.all(preps.map(prep => loadPrepState(prep.id)))
  return preps.filter((_, i) => nextJobs(states[i], target).length > 0)
}
