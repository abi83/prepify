import { MAX_JOB_ATTEMPTS, type ExecutionConfig, type Job, type JobOutcome, type JobStatus, type QuestionSpec } from "./job"
import type { Store } from "./ports"

export function supersede(job: Job): Job {
  if (job.status !== "failed") throw new Error(`Job ${job.id} is ${job.status}, not failed`)
  return { id: job.id, type: job.type, status: "superseded", inputIds: job.inputIds, config: job.config, question: job.question, output: null, failureReason: job.failureReason }
}

/** `failedAttempts` counts the failed commits so far, this one included. */
export function applyOutcome<TOutput>(job: Job, outcome: JobOutcome<TOutput>, failedAttempts: number): Job<TOutput> {
  return outcome.status === "executed"
    ? { ...job, status: "executed", output: outcome.output, failureReason: null }
    : { ...job, status: "failed", output: null, failureReason: outcome.failureReason, terminal: failedAttempts >= MAX_JOB_ATTEMPTS }
}

/** The failed commits so far, plus this outcome if it is one. */
export function countFailedAttempts(previous: number, outcome: JobOutcome<unknown>): number {
  return outcome.status === "failed" ? previous + 1 : previous
}

/**
 * In-memory `Store` for tests — no actor scoping beyond the interface's signature (every
 * actor sees every job), since core has no notion of ownership to enforce; that's a
 * concern for a real `Store` implementation (e.g. `PrismaStore`, #270) to add.
 */
export function createInMemoryStore(): Store {
  const jobs = new Map<string, Job>()
  const failedAttempts = new Map<string, number>()
  let nextId = 0

  return {
    async createJob<TOutput>(_actorId: string, type: string, inputIds: string[], config: ExecutionConfig, question?: QuestionSpec): Promise<Job<TOutput>> {
      const job: Job<TOutput> = {
        id: `job-${++nextId}`,
        type,
        status: "created",
        inputIds,
        config,
        question: question ?? null,
        output: null,
        failureReason: null,
      }
      jobs.set(job.id, job)
      return job
    },

    async getJob<TOutput>(_actorId: string, jobId: string): Promise<Job<TOutput> | null> {
      return (jobs.get(jobId) as Job<TOutput> | undefined) ?? null
    },

    async existingIds(_actorId: string, ids: string[]): Promise<Set<string>> {
      return new Set(ids.filter(id => jobs.has(id)))
    },

    async commitJob<TOutput>(
      _actorId: string,
      jobId: string,
      fromStatus: JobStatus,
      outcome: JobOutcome<TOutput>,
    ): Promise<boolean> {
      const job = jobs.get(jobId)
      if (!job || job.status !== fromStatus) return false
      const attempts = countFailedAttempts(failedAttempts.get(jobId) ?? 0, outcome)
      failedAttempts.set(jobId, attempts)
      jobs.set(jobId, applyOutcome(job, outcome, attempts))
      return true
    },

    async supersedeJob(_actorId: string, jobId: string): Promise<void> {
      const job = jobs.get(jobId)
      if (!job) throw new Error(`Unknown job "${jobId}"`)
      jobs.set(jobId, supersede(job))
    },
  }
}
