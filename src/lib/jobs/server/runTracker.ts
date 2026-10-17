import type { TrackRun } from "@/lib/jobs/generation"
import { serializeError } from "@/lib/logger"
import { serverLogger } from "@/lib/logger/server"
import * as jobRepository from "@/repositories/jobRepository"

export const HEARTBEAT_INTERVAL_MS = 30_000

/** Jobs and preps this process is running — what its SIGTERM handler marks `interrupted` and releases. */
const activeJobIds = new Set<string>()
const leasedPrepIds = new Set<string>()
let sigtermHandlerInstalled = false

/** Marks this process's still-`running` jobs `interrupted` and frees its run leases, so Resume isn't blocked until they expire. */
export async function interruptActiveJobs(): Promise<void> {
  if (activeJobIds.size > 0) await jobRepository.markInterrupted([ ...activeJobIds ])
  await Promise.all([ ...leasedPrepIds ].map(jobRepository.releaseRunLease))
}

function installSigtermHandler(): void {
  if (sigtermHandlerInstalled) return
  sigtermHandlerInstalled = true
  process.on("SIGTERM", () => {
    interruptActiveJobs().catch(error => serverLogger.error("Marking jobs interrupted on SIGTERM failed", { error: serializeError(error) }))
  })
}

/** Aborts like a cancelled run, so `runJob` rethrows instead of committing a failure over the other runner's job. */
function claimLost(jobId: string): Error {
  const error = new Error(`Job ${jobId} is held by another runner`)
  error.name = "AbortError"
  return error
}

/** Claims the job (`running`), beats its heartbeat while `run` executes, and registers it for SIGTERM. */
export const trackServerRun: TrackRun = async (job, run) => {
  installSigtermHandler()
  activeJobIds.add(job.id)
  const heartbeat = setInterval(() => {
    jobRepository.touchHeartbeat(job.id).catch(error => serverLogger.error("Job heartbeat failed", { jobId: job.id, error: serializeError(error) }))
  }, HEARTBEAT_INTERVAL_MS).unref()
  try {
    if (!await jobRepository.claimJob(job.id)) throw claimLost(job.id)
    return await run()
  } finally {
    clearInterval(heartbeat)
    activeJobIds.delete(job.id)
  }
}

/** Renews the prep's run lease (taken by `acquirePrepRun`) while `run` executes, then releases it. */
export async function holdRunLease<T>(prepId: string, run: () => Promise<T>): Promise<T> {
  installSigtermHandler()
  leasedPrepIds.add(prepId)
  const heartbeat = setInterval(() => {
    jobRepository.renewRunLease(prepId).catch(error => serverLogger.error("Run lease heartbeat failed", { prepId, error: serializeError(error) }))
  }, HEARTBEAT_INTERVAL_MS).unref()
  try {
    return await run()
  } finally {
    clearInterval(heartbeat)
    leasedPrepIds.delete(prepId)
    await jobRepository.releaseRunLease(prepId)
  }
}
