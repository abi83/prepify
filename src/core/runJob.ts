import type { ExecutionConfig, JobOutcome } from "./job"
import type { Llm, ProgressSink, Store } from "./ports"

export class JobNotFoundError extends Error {
  constructor(public readonly jobId: string) {
    super(`Job ${jobId} not found`)
    this.name = "JobNotFoundError"
  }
}

/** Thrown when a job's declared `inputIds` don't all resolve in the `Store` — the job is
 *  left untouched (still re-executable) so it can run once the dependency shows up. */
export class MissingDependencyError extends Error {
  constructor(public readonly jobId: string, public readonly missingIds: string[]) {
    super(`Job ${jobId} is missing dependencies: ${missingIds.join(", ")}`)
    this.name = "MissingDependencyError"
  }
}

/** The parts of a job a `run` implementation needs — never its persistence bookkeeping
 *  (`status`/`output`/`failureReason`), which is `runJob`'s concern alone. */
export interface JobContext {
  id: string
  type: string
  inputIds: string[]
  config: ExecutionConfig
}

export interface JobRunContext {
  job: JobContext
  actorId: string
  /** Supplied only at execution, never stored on the job or its config. */
  apiKey: string
  store: Store
  llm: Llm
  progress: ProgressSink
  signal: AbortSignal
}

/** A job type declares its own output shape and how to produce it; `inputIds` existence and
 *  status bookkeeping are handled generically by `runJob`, the same for every type. */
export interface JobDefinition<TOutput> {
  type: string
  run(ctx: JobRunContext): Promise<TOutput>
}

export type RunJobResult<TOutput> =
  | { committed: true; status: "executed"; output: TOutput }
  | { committed: true; status: "failed"; failureReason: string }
  /** Lost the commit race to a concurrent `runJob` call on the same job — this call's
   *  output/failure was discarded; the winner's outcome is what's stored. */
  | { committed: false }

export interface RunJobParams {
  actorId: string
  jobId: string
  apiKey: string
  signal: AbortSignal
}

function isAbort(signal: AbortSignal, err: unknown): boolean {
  return signal.aborted || (err instanceof Error && err.name === "AbortError")
}

/**
 * Loads the job, verifies its declared `inputIds` all exist, runs it, then commits the
 * outcome and flips status in one conditional transaction. A `created` or `failed` job is
 * runnable — `failed` is how retry works, there's no separate retry path. `executed` is
 * terminal. Cancellation via `signal` propagates without committing anything, leaving the
 * job exactly as runnable as it was before this call.
 */
export async function runJob<TOutput>(
  definition: JobDefinition<TOutput>,
  ports: { store: Store; llm: Llm; progress: ProgressSink },
  params: RunJobParams,
): Promise<RunJobResult<TOutput>> {
  const { store, llm, progress } = ports
  const { actorId, jobId, apiKey, signal } = params

  const job = await store.getJob<TOutput>(actorId, jobId)
  if (!job) throw new JobNotFoundError(jobId)
  if (job.type !== definition.type) {
    throw new Error(`Job ${jobId} has type "${job.type}", expected "${definition.type}"`)
  }
  if (job.status === "executed") {
    throw new Error(`Job ${jobId} has already executed`)
  }

  const existing = await store.existingIds(actorId, job.inputIds)
  const missingIds = job.inputIds.filter(id => !existing.has(id))
  if (missingIds.length > 0) throw new MissingDependencyError(jobId, missingIds)

  const context: JobRunContext = {
    job: { id: job.id, type: job.type, inputIds: job.inputIds, config: job.config },
    actorId,
    apiKey,
    store,
    llm,
    progress,
    signal,
  }

  let outcome: JobOutcome<TOutput>
  try {
    outcome = { status: "executed", output: await definition.run(context) }
  } catch (e) {
    if (isAbort(signal, e)) throw e
    outcome = { status: "failed", failureReason: e instanceof Error ? e.message : String(e) }
  }

  const committed = await store.commitJob(actorId, jobId, job.status, outcome)
  if (!committed) return { committed: false }

  return outcome.status === "executed"
    ? { committed: true, status: "executed", output: outcome.output }
    : { committed: true, status: "failed", failureReason: outcome.failureReason }
}
