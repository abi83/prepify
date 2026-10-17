import type { ExecutionConfig, Job } from "@/core/job"
import { DEFAULT_TIMEOUT_MS } from "@/core/lib/config"
import { nextJobs, type PlanTarget } from "@/core/lib/planner"
import type { ListUnfinishedJobs, Ports } from "@/core/ports"
import type { JobDefinition } from "@/core/runJob"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE, type JobStage } from "@/types/jobTypes"
import { ocrResultSchema, type Page } from "@/types/prep"

import { createAssetJobDefinition } from "./assetJob"
import { createConceptsExtractJobDefinition } from "./conceptsExtractJob"
import { createConceptsJobDefinition } from "./conceptsJob"
import { createJobs, executeJobs, executePrep, type ExecutionDeps, type RunDeps, type RunParams } from "./execution"
import { createOcrJobDefinition } from "./ocrJob"
import { createPrepMetaJobDefinition } from "./prepMetaJob"
import { createQuestionJobDefinition } from "./questionJob"

/** A stage's progress: the planner's stages in order. */
export type GenerationStage = JobStage
export type GenerationProgress =
  | { stage: GenerationStage; done: number; total: number }
  | { stage: "done" }

/** Legacy parity: one build, plus one reviewed rewrite on rejection. */
export const DEFAULT_JOB_SETTINGS = { timeoutMs: DEFAULT_TIMEOUT_MS, maxRetries: 1 }

export const DEFAULT_CONCURRENCY = 5

interface DefinitionOptions {
  prepId: string
}

type DefinitionPorts = Pick<Ports, "llm" | "logger" | "sampler" | "catalog" | "data">

/** Builds each job type's definition, fetching the inputs its `run` needs. */
function createDefinitionFor({ prepId }: DefinitionOptions, { data, ...deps }: DefinitionPorts): RunDeps["definitionFor"] {
  async function conceptsFor(job: Job) {
    const { concepts } = await data.loadState(prepId)
    return job.inputIds.map(id => {
      const concept = concepts.find(c => c.id === id)
      if (!concept) throw new Error(`Concept ${id} not found for job ${job.id}`)
      return concept
    })
  }

  return async (job): Promise<JobDefinition<unknown>> => {
    switch (job.type) {
    case OCR_JOB_TYPE: {
      const image = (await data.listImages(prepId)).find(i => i.id === job.inputIds[0])
      if (!image) throw new Error(`PrepImage ${job.inputIds[0]} not found for job ${job.id}`)
      return createOcrJobDefinition([ await data.downloadImage(prepId, image.gcsKey) ], deps)
    }
    case CONCEPTS_EXTRACT_JOB_TYPE: {
      const image = (await data.listImages(prepId)).find(i => i.id === job.inputIds[0])
      if (!image) throw new Error(`PrepImage ${job.inputIds[0]} not found for job ${job.id}`)
      if (!image.language) throw new Error(`PrepImage ${image.id} has no language for job ${job.id}`)
      const page: Page = { page: 1, gcsKey: image.gcsKey, language: image.language, ...ocrResultSchema.parse(image.ocrResult) }
      return createConceptsExtractJobDefinition(page, deps)
    }
    case CONCEPTS_JOB_TYPE: {
      const { images, concepts } = await data.loadState(prepId)
      const extraction = images.find(image => image.id === job.inputIds[0])?.concepts
      if (extraction?.status !== "found") throw new Error(`PrepImage ${job.inputIds[0]} has no extracted concepts for job ${job.id}`)
      return createConceptsJobDefinition(extraction.concepts, concepts, deps)
    }
    case PREP_META_JOB_TYPE: {
      const images = await data.listImages(prepId)
      const pages = job.inputIds.map(id => {
        const image = images.find(i => i.id === id)
        if (!image) throw new Error(`PrepImage ${id} not found for job ${job.id}`)
        if (!image.language) throw new Error(`PrepImage ${id} has no language for job ${job.id}`)
        return { language: image.language, text: ocrResultSchema.parse(image.ocrResult).text }
      })
      return createPrepMetaJobDefinition(pages, deps)
    }
    case QUESTION_JOB_TYPE:
      return createQuestionJobDefinition(await conceptsFor(job), deps)
    case ASSET_JOB_TYPE:
      return createAssetJobDefinition(await data.loadQuestion(prepId, job.inputIds[0]), deps)
    default:
      throw new Error(`Unknown job type "${job.type}"`)
    }
  }
}

/** Wraps a job's `run`, so a runtime can track the job while it executes (claim, heartbeat). */
export type TrackRun = <T>(job: Job, run: () => Promise<T>) => Promise<T>

export const untracked: TrackRun = (_job, run) => run()

/** What a runtime root supplies: every port except `progress`, which the runner owns. */
export interface RunnerPorts extends Omit<Ports, "progress"> {
  listUnfinishedJobs: ListUnfinishedJobs
  trackRun: TrackRun
}

interface RunnerOptions extends DefinitionOptions, RunParams {
  onProgress: (progress: GenerationProgress) => void
}

export interface GenerationParams extends RunnerOptions {
  /** Stored on every job this run creates; unfinished jobs keep the config they were created with. */
  config: ExecutionConfig
  target: PlanTarget
}

interface Runner {
  deps: ExecutionDeps
  params: RunParams
}

/** Wires the engine to `ports`, forwarding its per-stage progress to `onProgress`. */
function createRunner(ports: RunnerPorts, options: RunnerOptions): Runner {
  const definitionFor = createDefinitionFor(options, ports)
  const deps: ExecutionDeps = {
    store: ports.store,
    llm: ports.llm,
    progress: { report: update => options.onProgress(update) },
    loadState: prepId => ports.data.loadState(prepId),
    definitionFor: async job => {
      const definition = await definitionFor(job)
      return { type: definition.type, run: ctx => ports.trackRun(job, () => definition.run(ctx)) }
    },
  }
  const { actorId, apiKey, signal, concurrency } = options
  return { deps, params: { actorId, apiKey, signal, concurrency } }
}

export interface CreateJobsParams {
  actorId: string
  prepId: string
  /** Baked into each created job. */
  config: ExecutionConfig
  target: PlanTarget
}

/**
 * Plans the prep's next stage and persists it as `created` jobs without executing them.
 * Throws while unfinished jobs exist, since the planner would plan the same stage again.
 */
export async function createNextJobs(
  ports: Pick<RunnerPorts, "store" | "data" | "listUnfinishedJobs">,
  { actorId, prepId, config, target }: CreateJobsParams,
): Promise<Job[]> {
  const unfinished = await ports.listUnfinishedJobs(actorId, prepId)
  if (unfinished.length > 0) throw new Error(`${unfinished.length} unfinished job(s) exist (${unfinished.map(job => job.id).join(", ")}); run them first`)
  const specs = nextJobs(await ports.data.loadState(prepId), target)
  return createJobs(ports.store, actorId, config, specs)
}

export interface RunCreatedParams extends RunnerOptions {
  /** Jobs to run; empty runs every unfinished job. */
  jobIds: string[]
}

async function requireUnfinished(store: RunnerPorts["store"], actorId: string, jobId: string): Promise<Job> {
  const job = await store.getJob(actorId, jobId)
  if (!job) throw new Error(`Unknown job "${jobId}"`)
  if (job.status === "executed") throw new Error(`Job "${jobId}" is already executed`)
  if (job.status === "running") throw new Error(`Job "${jobId}" is already running`)
  return job
}

/** Executes the given `created`/`failed`/`interrupted` jobs (all unfinished when none given), stage by stage; returns them. */
export async function runCreatedJobs(ports: RunnerPorts, options: RunCreatedParams): Promise<Job[]> {
  const { actorId, prepId, jobIds } = options
  const jobs = jobIds.length === 0
    ? await ports.listUnfinishedJobs(actorId, prepId)
    : await Promise.all([ ...new Set(jobIds) ].map(id => requireUnfinished(ports.store, actorId, id)))
  const { deps, params } = createRunner(ports, options)
  await executeJobs(deps, params, jobs)
  options.onProgress({ stage: "done" })
  return jobs
}

/** Runs OCR for the prep's images that lack it, re-executing unfinished OCR jobs first. */
export async function runOcr(ports: RunnerPorts, options: GenerationParams): Promise<void> {
  const { config, target, ...rest } = options
  const { actorId, prepId } = options
  const { deps, params } = createRunner(ports, rest)
  const rerun = (await ports.listUnfinishedJobs(actorId, prepId)).filter(job => job.type === OCR_JOB_TYPE)
  await executePrep(deps, { ...params, prepId, config, target }, { jobs: rerun, stages: [ "ocr" ] })
}

/** Plans and creates the `additionalQuestions` new question jobs; their assets follow from the normal flow. */
async function createAdditionalQuestionJobs(ports: RunnerPorts, { actorId, prepId, config, target }: GenerationParams): Promise<Job[]> {
  const unfinished = await ports.listUnfinishedJobs(actorId, prepId)
  if (unfinished.length > 0) throw new Error(`${unfinished.length} unfinished job(s) exist (${unfinished.map(job => job.id).join(", ")}); resume them first`)
  return createJobs(ports.store, actorId, config, nextJobs(await ports.data.loadState(prepId), target))
}

/**
 * Re-executes the prep's `created`/`failed` jobs, then plans and runs whatever is still
 * missing to reach `target`. Failed question jobs are replaced with fresh tasks, up to 2x the requested jobs per class. With `target.additionalQuestions`, resumes nothing: it adds that
 * many questions (throwing while jobs are unfinished) and finishes their assets.
 */
export async function runGeneration(ports: RunnerPorts, options: GenerationParams): Promise<void> {
  const { config, target: requested, ...rest } = options
  const { additionalQuestions, ...target } = requested
  const { actorId, prepId } = options
  const { deps, params } = createRunner(ports, rest)
  const jobs = additionalQuestions === undefined ? await ports.listUnfinishedJobs(actorId, prepId) : await createAdditionalQuestionJobs(ports, options)
  await executePrep(deps, { ...params, prepId, config, target }, { jobs })
  options.onProgress({ stage: "done" })
}
