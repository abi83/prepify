import path from "path"

import type { Job } from "@/core/job"
import type { Llm } from "@/core/ports"
import { createNextJobs, runCreatedJobs, runGeneration, runOcr, type GenerationProgress, type RunnerPorts } from "@/lib/jobs/generation"
import { OpenAiLlm } from "@/lib/llm/openAiLlm"
import { createLogger } from "@/lib/logger/core"
import { createFileTransport } from "@/lib/logger/fileTransport"
import { createDiskSampler } from "@/lib/sampler/diskSampler"

import type { CliConfig } from "./config"
import { createFilePrep } from "./filePrep"

const ACTOR_ID = "cli"
const PREP_ID = "cli-prep"
const SAMPLE_RATE = 1

export interface CliOptions {
  /** Prep directory: `images/` in; `jobs/`, `logs/` and `samples/` out. */
  prepDir: string
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

/** CLI composition root: files for jobs, logs and samples; any OpenAI-compatible endpoint for the model. */
function createCliRoot(options: CliOptions) {
  const { prepDir, apiKey, config } = options
  const prep = createFilePrep(prepDir)
  const ports: RunnerPorts = {
    store: prep.store,
    llm: options.llm ?? new OpenAiLlm({ apiKey, baseUrl: config.llm.baseUrl }),
    logger: createLogger({ transport: createFileTransport(path.join(prepDir, "logs", "run.log")), minLevel: config.log.level }),
    sampler: createDiskSampler(path.join(prepDir, "samples"), SAMPLE_RATE),
    data: prep.data,
    listUnfinishedJobs: prep.listUnfinishedJobs,
  }
  const params = {
    actorId: ACTOR_ID,
    prepId: PREP_ID,
    apiKey,
    concurrency: config.run.concurrency,
    signal: new AbortController().signal,
    onProgress: options.onProgress ?? (() => {}),
  }
  async function language(): Promise<string> {
    const detected = await prep.detectedLanguage()
    if (!detected) throw new Error(`No executed OCR job in ${prepDir} — run OCR first (is ${path.join(prepDir, "images")} empty?)`)
    return detected
  }
  return { ports, params, language }
}

/** Executes the given `created`/`failed` jobs, or every unfinished job when `jobIds` is empty. */
export async function runCliJobs(options: CliOptions & { jobIds: string[] }): Promise<Job[]> {
  const { ports, params, language } = createCliRoot(options)
  return runCreatedJobs(ports, { ...params, jobIds: options.jobIds, language, maxChars: options.config.run.maxChars })
}

/** Runs the whole pipeline: OCR, then everything else the target needs. */
export async function runCli(options: CliOptions): Promise<void> {
  const { config } = options
  const { ports, params, language } = createCliRoot(options)
  const generation = { ...params, config: executionConfig(config), target: config.target }

  await runOcr(ports, generation)
  await runGeneration(ports, { ...generation, language: await language(), maxChars: config.run.maxChars })
}
