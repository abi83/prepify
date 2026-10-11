import type { ExecutionConfig, Job } from "@/core/job"
import type { ListUnfinishedJobs, Ports, ProgressSink } from "@/core/ports"
import type { JobDefinition } from "@/core/runJob"
import { DEFAULT_AGENT_TIMEOUT_MS } from "@/lib/config"
import { nextJobs, type PlanTarget } from "@/lib/planner"
import { ocrResultSchema, type Page } from "@/types/prep"

import { createConceptsJobDefinition } from "./conceptsJob"
import { createJobs, executePrep, runJobs, type ExecutionDeps, type ExecutionParams } from "./execution"
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
const DEFAULT_JOB_CONFIG = { timeoutMs: DEFAULT_AGENT_TIMEOUT_MS, maxRetries: 1 }

const CONCURRENCY = 5

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

/** Pages up to `maxChars` of text in total; later pages are dropped. */
function truncatePages(pages: Page[], maxChars: number): Page[] {
  let charCount = 0
  return pages.filter(page => {
    if (charCount >= maxChars) return false
    charCount += page.text.length
    return true
  })
}

interface DefinitionOptions {
  prepId: string
  language: string
  maxChars: number
}

type DefinitionPorts = Pick<Ports, "llm" | "logger" | "sampler" | "data">

/** Builds each job type's definition, fetching the inputs its `run` needs. */
function createDefinitionFor({ prepId, language, maxChars }: DefinitionOptions, { data, ...deps }: DefinitionPorts): ExecutionDeps["definitionFor"] {
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
      const pages: Page[] = job.inputIds.map((id, i) => {
        const image = images.find(img => img.id === id)
        if (!image) throw new Error(`PrepImage ${id} not found for job ${job.id}`)
        return { page: i + 1, gcsKey: image.gcsKey, ...ocrResultSchema.parse(image.ocrResult) }
      })
      return createConceptsJobDefinition(truncatePages(pages, maxChars), language, deps)
    }
    case PREP_META_JOB_TYPE:
      return createPrepMetaJobDefinition(await conceptsFor(job), language, deps)
    case QUESTION_JOB_TYPE:
      return createQuestionJobDefinition(await conceptsFor(job), language, deps)
    default:
      throw new Error(`Unknown job type "${job.type}"`)
    }
  }
}

/** What a runtime root supplies: every port except `progress`, which the runner owns. */
export interface RunnerPorts extends Omit<Ports, "progress"> {
  listUnfinishedJobs: ListUnfinishedJobs
}

export interface GenerationParams extends DefinitionOptions {
  actorId: string
  apiKey: string
  model: string
  tier: string
  target: PlanTarget
  signal: AbortSignal
  onProgress: (progress: GenerationProgress) => void
}

interface Runner {
  deps: ExecutionDeps
  params: ExecutionParams
  startStage(stage: GenerationStage, total: number): void
  listUnfinishedJobs: ListUnfinishedJobs
}

/** Wires the planner/runner to `ports`, with stage progress emitted through a `ProgressSink`. */
function createRunner(ports: RunnerPorts, options: GenerationParams): Runner {
  const config: ExecutionConfig = { model: options.model, tier: options.tier, ...DEFAULT_JOB_CONFIG }
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

  const { store, llm, data } = ports
  const definitionFor = createDefinitionFor(options, ports)
  const deps: ExecutionDeps = {
    store,
    llm,
    progress,
    loadState: async prepId => {
      const state = await data.loadState(prepId)
      const specs = nextJobs(state, options.target)
      if (specs.length > 0) startStage(stageOf(specs[0].type), specs.length)
      return state
    },
    definitionFor: async job => {
      const definition = await definitionFor(job)
      return {
        type: definition.type,
        async run(ctx) {
          const result = await definition.run(ctx)
          progress.report({ done: done + 1, total })
          return result
        },
      }
    },
  }
  const params: ExecutionParams = {
    actorId: options.actorId,
    prepId: options.prepId,
    apiKey: options.apiKey,
    signal: options.signal,
    config,
    target: options.target,
    concurrency: CONCURRENCY,
  }
  return { deps, params, startStage, listUnfinishedJobs: ports.listUnfinishedJobs }
}

/** Re-executes the prep's `created`/`failed` jobs matching `include`, stage by stage; returns them. */
async function rerunUnfinished(runner: Runner, include: (job: Job) => boolean): Promise<Job[]> {
  const { actorId, prepId } = runner.params
  const unfinished = (await runner.listUnfinishedJobs(actorId, prepId)).filter(include)
  for (const stage of STAGES) {
    const jobs = unfinished.filter(job => stageOf(job.type) === stage)
    if (jobs.length === 0) continue
    runner.startStage(stage, jobs.length)
    await runJobs(runner.deps, runner.params, jobs)
  }
  return unfinished
}

/**
 * Runs OCR for the prep's images that lack it (re-executing unfinished OCR jobs first);
 * returns the language detected on the first job run, or null if there was nothing to do.
 */
export async function runOcr(ports: RunnerPorts, options: Omit<GenerationParams, "language" | "maxChars">): Promise<string | null> {
  // Only OCR jobs run here, and they need neither the (not yet detected) language nor a text cap.
  const runner = createRunner(ports, { ...options, language: "", maxChars: 0 })
  const { deps, params } = runner

  const rerun = await rerunUnfinished(runner, job => job.type === OCR_JOB_TYPE)
  const specs = nextJobs(await deps.loadState(params.prepId), options.target).filter(spec => spec.type === OCR_JOB_TYPE)
  const created = await createJobs(deps.store, params.actorId, params.config, specs)
  await runJobs(deps, params, created)

  const [ first ] = [ ...rerun, ...created ]
  if (!first) return null
  const executed = await deps.store.getJob<{ language: string }>(params.actorId, first.id)
  if (executed?.status !== "executed") throw new Error(`OCR job ${first.id} did not execute`)
  return executed.output.language
}

/**
 * Re-executes the prep's `created`/`failed` jobs, then plans and runs whatever is still
 * missing to reach `target`.
 */
export async function runGeneration(ports: RunnerPorts, options: GenerationParams): Promise<void> {
  const runner = createRunner(ports, options)
  await rerunUnfinished(runner, () => true)
  await executePrep(runner.deps, runner.params)
  options.onProgress({ stage: "done" })
}
