import type { ExecutionConfig, Job } from "@/core/job"
import type { ListUnfinishedJobs, Ports, ProgressSink } from "@/core/ports"
import type { JobDefinition } from "@/core/runJob"
import { DEFAULT_TIMEOUT_MS } from "@/lib/config"
import { nextJobs, type PlanTarget } from "@/lib/planner"
import { ocrResultSchema } from "@/types/prep"

import { createConceptsJobDefinition, type OcrPage } from "./conceptsJob"
import { createJobs, executePrep, runJobs, type ExecutionDeps, type RunDeps, type RunParams } from "./execution"
import { CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "./jobTypes"
import { createOcrJobDefinition } from "./ocrJob"
import { createPrepMetaJobDefinition } from "./prepMetaJob"
import { createQuestionJobDefinition } from "./questionJob"

/** A stage's progress: the planner's stages in order. */
export type GenerationStage = "ocr" | "concepts" | "meta" | "questions"
export type GenerationProgress =
  | { stage: GenerationStage; done: number; total: number }
  | { stage: "done" }

/** Legacy parity: one build, plus one reviewed rewrite on rejection. */
export const DEFAULT_JOB_SETTINGS = { timeoutMs: DEFAULT_TIMEOUT_MS, maxRetries: 1 }

export const DEFAULT_CONCURRENCY = 5

const STAGE_BY_JOB_TYPE: Record<string, GenerationStage> = {
  [OCR_JOB_TYPE]: "ocr",
  [CONCEPTS_JOB_TYPE]: "concepts",
  [PREP_META_JOB_TYPE]: "meta",
  [QUESTION_JOB_TYPE]: "questions",
}
const STAGES: GenerationStage[] = [ "ocr", "concepts", "meta", "questions" ]

function stageOf(jobType: string): GenerationStage {
  const stage = STAGE_BY_JOB_TYPE[jobType]
  if (!stage) throw new Error(`Unknown job type "${jobType}"`)
  return stage
}

interface DefinitionOptions {
  prepId: string
  maxChars: number
}

type DefinitionPorts = Pick<Ports, "llm" | "logger" | "sampler" | "data">

/** Builds each job type's definition, fetching the inputs its `run` needs. */
function createDefinitionFor({ prepId, maxChars }: DefinitionOptions, { data, ...deps }: DefinitionPorts): RunDeps["definitionFor"] {
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
    case CONCEPTS_JOB_TYPE: {
      const images = await data.listImages(prepId)
      const pages: OcrPage[] = job.inputIds.map((id, i) => {
        const image = images.find(img => img.id === id)
        if (!image) throw new Error(`PrepImage ${id} not found for job ${job.id}`)
        if (!image.language) throw new Error(`PrepImage ${id} has no language for job ${job.id}`)
        return { page: i + 1, gcsKey: image.gcsKey, language: image.language, ...ocrResultSchema.parse(image.ocrResult) }
      })
      return createConceptsJobDefinition(pages, maxChars, deps)
    }
    case PREP_META_JOB_TYPE:
      return createPrepMetaJobDefinition(await conceptsFor(job), deps)
    case QUESTION_JOB_TYPE:
      return createQuestionJobDefinition(await conceptsFor(job), deps)
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
  deps: RunDeps
  params: RunParams
  startStage(stage: GenerationStage, total: number): void
}

/** Wires the runner to `ports`, with stage progress emitted through a `ProgressSink`. */
function createRunner(ports: RunnerPorts, options: RunnerOptions): Runner {
  let stage: GenerationStage = "ocr"
  let done = 0
  let total = 0

  const progress: ProgressSink = {
    report(update) {
      done = update.done
      total = update.total
      options.onProgress({ stage, done, total })
    },
  }
  const startStage = (next: GenerationStage, nextTotal: number) => {
    stage = next
    progress.report({ done: 0, total: nextTotal })
  }

  const definitionFor = createDefinitionFor(options, ports)
  const deps: RunDeps = {
    store: ports.store,
    llm: ports.llm,
    progress,
    definitionFor: async job => {
      const definition = await definitionFor(job)
      return {
        type: definition.type,
        async run(ctx) {
          const result = await ports.trackRun(job, () => definition.run(ctx))
          progress.report({ done: done + 1, total })
          return result
        },
      }
    },
  }
  const { actorId, apiKey, signal, concurrency } = options
  return { deps, params: { actorId, apiKey, signal, concurrency }, startStage }
}

/** Executes `jobs` stage by stage, so later stages see earlier outputs. */
async function runStaged(runner: Runner, jobs: Job[]): Promise<void> {
  for (const stage of STAGES) {
    const stageJobs = jobs.filter(job => stageOf(job.type) === stage)
    if (stageJobs.length === 0) continue
    runner.startStage(stage, stageJobs.length)
    await runJobs(runner.deps, runner.params, stageJobs)
  }
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
  await runStaged(createRunner(ports, options), jobs)
  options.onProgress({ stage: "done" })
  return jobs
}

/** Runs OCR for the prep's images that lack it, re-executing unfinished OCR jobs first. */
export async function runOcr(ports: RunnerPorts, options: Omit<GenerationParams, "maxChars">): Promise<void> {
  const { config, target, ...rest } = options
  const runner = createRunner(ports, { ...rest, maxChars: 0 })
  const { actorId, prepId } = options

  const rerun = (await ports.listUnfinishedJobs(actorId, prepId)).filter(job => job.type === OCR_JOB_TYPE)
  await runStaged(runner, rerun)
  const specs = nextJobs(await ports.data.loadState(prepId), target).filter(spec => spec.type === OCR_JOB_TYPE)
  const created = await createJobs(ports.store, actorId, config, specs)
  await runStaged(runner, created)
}

/**
 * Re-executes the prep's `created`/`failed` jobs, then plans and runs whatever is still
 * missing to reach `target`.
 */
export async function runGeneration(ports: RunnerPorts, options: GenerationParams): Promise<void> {
  const { config, target, ...rest } = options
  const runner = createRunner(ports, rest)
  await runStaged(runner, await ports.listUnfinishedJobs(options.actorId, options.prepId))

  const deps: ExecutionDeps = {
    ...runner.deps,
    loadState: async prepId => {
      const state = await ports.data.loadState(prepId)
      const specs = nextJobs(state, target)
      if (specs.length > 0) runner.startStage(stageOf(specs[0].type), specs.length)
      return state
    },
  }
  await executePrep(deps, { ...runner.params, prepId: options.prepId, config, target })
  options.onProgress({ stage: "done" })
}
