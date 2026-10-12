import path from "path"

import type { Llm } from "@/core/ports"
import { runGeneration, runOcr, type GenerationProgress, type RunnerPorts } from "@/lib/jobs/generation"
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

/** CLI composition root: files for jobs, logs and samples; any OpenAI-compatible endpoint for the model. */
export async function runCli(options: CliOptions): Promise<void> {
  const { prepDir, apiKey, config } = options
  const prep = createFilePrep(prepDir)
  const ports: RunnerPorts = {
    store: prep.store,
    llm: options.llm ?? new OpenAiLlm({ apiKey, baseUrl: config.llm.baseUrl }),
    logger: createLogger({ transport: createFileTransport(path.join(prepDir, "logs", "run.log")) }),
    sampler: createDiskSampler(path.join(prepDir, "samples"), SAMPLE_RATE),
    data: prep.data,
    listUnfinishedJobs: prep.listUnfinishedJobs,
  }
  const params = {
    actorId: ACTOR_ID,
    prepId: PREP_ID,
    apiKey,
    config: { model: config.llm.model, tier: config.llm.tier, ...config.job },
    concurrency: config.run.concurrency,
    target: config.target,
    signal: new AbortController().signal,
    onProgress: options.onProgress ?? (() => {}),
  }

  await runOcr(ports, params)
  const language = await prep.detectedLanguage()
  if (!language) throw new Error(`No OCR result in ${prepDir} — does ${path.join(prepDir, "images")} contain images?`)
  await runGeneration(ports, { ...params, language, maxChars: config.run.maxChars })
}
