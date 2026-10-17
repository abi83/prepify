import { z } from "zod"

import { DEFAULT_GEN_CONFIG, MAX_FLASHCARDS } from "@/core/lib/generationConfig"
import { DEFAULT_CONCURRENCY, DEFAULT_JOB_SETTINGS, runGeneration } from "@/lib/jobs/generation"
import { serializeError } from "@/lib/logger"
import { serverLogger } from "@/lib/logger/server"
import * as jobRepository from "@/repositories/jobRepository"
import { difficultySchema, quizTypeSchema } from "@/types/questions"

import { serverPorts } from "./serverExecution"
import { serverPrepData } from "./serverPrepData"

/** Settings for jobs this run creates; unfinished jobs keep the config they were created with. */
export const serverRunRequestSchema = z.object({
  apiKey: z.string().min(1),
  prepId: z.string().min(1),
  model: z.string().min(1).default("gpt-5-nano"),
  tier: z.string().min(1).default("flex"),
  target: z.object({
    questionCount: z.number().int().min(5).max(20),
    flashcardCount: z.number().int().min(0).max(MAX_FLASHCARDS),
    enabledTypes: z.array(quizTypeSchema).min(1),
    difficultyMix: z.record(difficultySchema, z.number().min(0)).refine(mix => Object.values(mix).some(w => w > 0)),
    additionalQuestions: z.number().int().min(1).max(20).optional(),
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
    await runGeneration(await serverPorts(apiKey, serverPrepData(userId)), {
      actorId: userId,
      prepId,
      apiKey,
      config: { model, tier, ...DEFAULT_JOB_SETTINGS },
      target,
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
