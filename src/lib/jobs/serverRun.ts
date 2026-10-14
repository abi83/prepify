import { z } from "zod"

import { AVAILABLE_MODELS, AVAILABLE_TIERS } from "@/lib/apiKey"
import { BYOK_TEXT_HARD_LIMIT } from "@/lib/config"
import { DEFAULT_GEN_CONFIG } from "@/lib/generationConfig"
import { serializeError } from "@/lib/logger"
import { serverLogger } from "@/lib/logger/server"
import * as jobRepository from "@/repositories/jobRepository"
import { difficultySchema, questionTypeSchema } from "@/types/questions"

import { DEFAULT_CONCURRENCY, DEFAULT_JOB_SETTINGS, runGeneration } from "./generation"
import { serverPorts } from "./serverExecution"
import { serverPrepData } from "./serverPrepData"

/** Settings for jobs this run creates; unfinished jobs keep the config they were created with. */
export const serverRunRequestSchema = z.object({
  apiKey: z.string().min(1),
  prepId: z.string().min(1),
  model: z.string().refine(id => AVAILABLE_MODELS.some(m => m.id === id)).default("gpt-5-nano"),
  tier: z.string().refine(id => AVAILABLE_TIERS.some(t => t.id === id)).default("flex"),
  target: z.object({
    questionCount: z.number().int().min(5).max(20),
    enabledTypes: z.array(questionTypeSchema).min(1),
    difficultyMix: z.record(difficultySchema, z.number().min(0)).refine(mix => Object.values(mix).some(w => w > 0)),
  }).default(DEFAULT_GEN_CONFIG),
})
export type ServerRunRequest = z.infer<typeof serverRunRequestSchema>

export class RunInProgressError extends Error {
  constructor(prepId: string) {
    super(`Prep ${prepId} already has a run in progress`)
    this.name = "RunInProgressError"
  }
}

/** Preps with a run in this process; the DB heartbeat check covers other instances. */
const activePrepIds = new Set<string>()

export function releasePrepRun(prepId: string): void {
  activePrepIds.delete(prepId)
}

/** Takes the prep's single run slot, or throws `RunInProgressError`. */
export async function acquirePrepRun(prepId: string): Promise<void> {
  if (activePrepIds.has(prepId)) throw new RunInProgressError(prepId)
  activePrepIds.add(prepId)
  if (!await jobRepository.hasActiveRun(prepId)) return
  releasePrepRun(prepId)
  throw new RunInProgressError(prepId)
}

/** Runs the prep's job graph with the caller's key, then frees its run slot. The key lives only in this call's closure. */
export async function runServerGeneration(userId: string, { apiKey, prepId, model, tier, target }: ServerRunRequest): Promise<void> {
  try {
    await runGeneration(serverPorts(apiKey, serverPrepData(userId)), {
      actorId: userId,
      prepId,
      apiKey,
      config: { model, tier, ...DEFAULT_JOB_SETTINGS },
      target,
      maxChars: BYOK_TEXT_HARD_LIMIT,
      concurrency: DEFAULT_CONCURRENCY,
      signal: new AbortController().signal,
      onProgress: () => {},
    })
  } catch (error) {
    // Nobody awaits this background task; progress and failures are already in the job rows.
    serverLogger.error("Server generation failed", { prepId, error: serializeError(error) })
  } finally {
    releasePrepRun(prepId)
  }
}
