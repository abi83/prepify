import type { ServerRunRequest } from "@/core/lib/serverRunRequest"
import { DEFAULT_CONCURRENCY, DEFAULT_JOB_SETTINGS, runGeneration } from "@/lib/jobs/generation"
import { serializeError } from "@/lib/logger"
import { serverLogger } from "@/lib/logger/server"
import * as jobRepository from "@/repositories/jobRepository"

import { holdRunLease } from "./runTracker"
import { serverPorts } from "./serverExecution"
import { serverPrepData } from "./serverPrepData"

/** Settings for jobs this run creates; unfinished jobs keep the config they were created with. */
export class RunInProgressError extends Error {
  constructor(prepId: string) {
    super(`Prep ${prepId} already has a run in progress`)
    this.name = "RunInProgressError"
  }
}

export const releasePrepRun = jobRepository.releaseRunLease

/** Takes the prep's run lease, or throws `RunInProgressError`. */
export async function acquirePrepRun(prepId: string): Promise<void> {
  if (!await jobRepository.acquireRunLease(prepId)) throw new RunInProgressError(prepId)
}

/** Runs the prep's job graph with the caller's key, then frees its run lease. The key lives only in this call's closure. */
export async function runServerGeneration(userId: string, { apiKey, prepId, model, tier, target }: ServerRunRequest): Promise<void> {
  try {
    await holdRunLease(prepId, async () => runGeneration(await serverPorts(apiKey, serverPrepData(userId)), {
      actorId: userId,
      prepId,
      apiKey,
      config: { model, tier, ...DEFAULT_JOB_SETTINGS },
      target,
      concurrency: DEFAULT_CONCURRENCY,
      signal: new AbortController().signal,
      onProgress: () => {},
    }))
  } catch (error) {
    // Nobody awaits this background task; progress and failures are already in the job rows.
    serverLogger.error("Server generation failed", { prepId, error: serializeError(error) })
  }
}
