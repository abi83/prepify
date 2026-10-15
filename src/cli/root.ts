import path from "path"

import type { Job } from "@/core/job"
import type { Llm } from "@/core/ports"
import { createNextJobs, runCreatedJobs, runGeneration, untracked, type GenerationProgress, type RunnerPorts } from "@/lib/jobs/generation"
import { OpenAiLlm } from "@/lib/llm/openAiLlm"
import { createLogger } from "@/lib/logger/core"
import { createFileTransport } from "@/lib/logger/fileTransport"
import { createDiskSampler } from "@/lib/sampler/diskSampler"

import type { CliConfig } from "./config"
import { createFilePrep } from "./filePrep"

const ACTOR_ID = "cli"
const PREP_ID = "cli-prep"
const SAMPLE_RATE = 1
const SAMPLE_MAX_PER_CELL = 100

export interface CliOptions {
  /** Prep directory: `images/` in; `jobs/` and `logs/` out. */
  prepDir: string
  /** Samples are prep-independent: written to `<samplesRoot>/samples/{agent}/{promptHash}/{model}/{id}.json`. */
  samplesRoot: string
  apiKey: string
  config: CliConfig
  /** Replaces the OpenAI adapter, e.g. with a fake in tests. */
  llm?: Llm
  onProgress?: (progress: GenerationProgress) => void
}

const executionConfig = ({ llm, job }: CliConfig) => ({ model: llm.model, tier: llm.tier, ...job })

/** Plans the prep's next stage and persists it as `created` jobs carrying the config's llm/job settings; runs nothing. */
export async function createCliJobs({ prepDir, config }: Pick<CliOptions, "prepDir" | "config">): Promise<Job[]> {
  const prep = createFilePrep(prepDir)
  return createNextJobs(
    { store: prep.store, data: prep.data, listUnfinishedJobs: prep.listUnfinishedJobs },
    { actorId: ACTOR_ID, prepId: PREP_ID, config: executionConfig(config), target: config.target },
  )
}

/** CLI composition root: files for jobs and logs, a shared root for samples; any OpenAI-compatible endpoint for the model. */
function createCliRoot(options: CliOptions) {
  const { prepDir, samplesRoot, apiKey, config } = options
  const prep = createFilePrep(prepDir)
  const ports: RunnerPorts = {
    store: prep.store,
    llm: options.llm ?? new OpenAiLlm({ apiKey, baseUrl: config.llm.baseUrl, temperature: config.llm.temperature, maxTokens: config.llm.maxTokens }),
    logger: createLogger({ transport: createFileTransport(path.join(prepDir, "logs", "run.log")), minLevel: config.log.level }),
    sampler: createDiskSampler(samplesRoot, SAMPLE_RATE, SAMPLE_MAX_PER_CELL),
    data: prep.data,
    listUnfinishedJobs: prep.listUnfinishedJobs,
    trackRun: untracked,
  }
  const params = {
    actorId: ACTOR_ID,
    prepId: PREP_ID,
    apiKey,
    concurrency: config.run.concurrency,
    signal: new AbortController().signal,
    onProgress: options.onProgress ?? (() => {}),
  }
  return { ports, params }
}

/** Executes the given `created`/`failed` jobs, or every unfinished job when `jobIds` is empty. */
export async function runCliJobs(options: CliOptions & { jobIds: string[] }): Promise<Job[]> {
  const { ports, params } = createCliRoot(options)
  return runCreatedJobs(ports, { ...params, jobIds: options.jobIds })
}

/** Runs the whole pipeline: OCR, then everything else the target needs. */
export async function runCli(options: CliOptions): Promise<void> {
  const { config } = options
  const { ports, params } = createCliRoot(options)
  await runGeneration(ports, { ...params, config: executionConfig(config), target: config.target })
}
