import type { ExecutionConfig, Job, JobOutcome, JobStatus } from "./job"
import type { Store } from "./ports"

function applyOutcome<TOutput>(job: Job, outcome: JobOutcome<TOutput>): Job<TOutput> {
  return outcome.status === "executed"
    ? { ...job, status: "executed", output: outcome.output, failureReason: null }
    : { ...job, status: "failed", output: null, failureReason: outcome.failureReason }
}

/**
 * In-memory `Store` for tests — no actor scoping beyond the interface's signature (every
 * actor sees every job), since core has no notion of ownership to enforce; that's a
 * concern for a real `Store` implementation (e.g. `PrismaStore`, #270) to add.
 */
export function createInMemoryStore(): Store {
  const jobs = new Map<string, Job>()
  let nextId = 0

  return {
    async createJob<TOutput>(_actorId: string, type: string, inputIds: string[], config: ExecutionConfig): Promise<Job<TOutput>> {
      const job: Job<TOutput> = {
        id: `job-${++nextId}`,
        type,
        status: "created",
        inputIds,
        config,
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
      jobs.set(jobId, applyOutcome(job, outcome))
      return true
    },
  }
}
