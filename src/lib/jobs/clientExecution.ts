import * as jobActions from "@/actions/jobs"
import type { ExecutionConfig, Job, QuestionSpec } from "@/core/job"
import type { Logger } from "@/core/logger"
import type { Store } from "@/core/ports"
import type { Sampler } from "@/core/sampler"
import type { SupportedLanguage } from "@/lib/config"
import { OpenAiLlm } from "@/lib/llm/openAiLlm"

import { browserPrepData } from "./browserPrepData"
import * as generation from "./generation"

export type { GenerationProgress, GenerationStage } from "./generation"

/** `Store` over server actions — the actions derive the actor from the session, so `actorId` is ignored. */
const actionStore: Store = {
  createJob: async <TOutput>(_actorId: string, type: string, inputIds: string[], config: ExecutionConfig, question?: QuestionSpec) =>
    await jobActions.createJob(type, inputIds, config, question) as Job<TOutput>,
  getJob: async <TOutput>(_actorId: string, jobId: string) => await jobActions.getJob(jobId) as Job<TOutput> | null,
  existingIds: async (_actorId, ids) => new Set(await jobActions.existingIds(ids)),
  commitJob: (_actorId, jobId, fromStatus, outcome) => jobActions.commitJob(jobId, fromStatus, outcome),
}

export interface GenerationParams extends Omit<generation.GenerationParams, "config" | "concurrency"> {
  model: string
  tier: string
  logger: Logger
  sampler: Sampler
}

function runnerOptions<T extends Pick<GenerationParams, "model" | "tier">>(options: T) {
  return { ...options, config: { model: options.model, tier: options.tier, ...generation.DEFAULT_JOB_SETTINGS }, concurrency: generation.DEFAULT_CONCURRENCY }
}

/** Browser composition root: server-action persistence and data, the BYOK key for the model. */
function browserPorts({ apiKey, logger, sampler }: Pick<GenerationParams, "apiKey" | "logger" | "sampler">): generation.RunnerPorts {
  return {
    store: actionStore,
    llm: new OpenAiLlm({ apiKey }),
    logger,
    sampler,
    data: browserPrepData,
    listUnfinishedJobs: (_actorId, prepId) => jobActions.listUnfinishedJobs(prepId),
  }
}

export function runOcr(options: Omit<GenerationParams, "language" | "maxChars">): Promise<SupportedLanguage | null> {
  return generation.runOcr(browserPorts(options), runnerOptions(options))
}

export function runGeneration(options: GenerationParams): Promise<void> {
  return generation.runGeneration(browserPorts(options), runnerOptions(options))
}
