import { mkdir, readFile, readdir, writeFile } from "fs/promises"
import path from "path"

import { applyOutcome, countFailedAttempts, supersede } from "./inMemoryStore"
import type { ExecutionConfig, Job, JobOutcome, JobStatus, QuestionSpec } from "./job"
import type { Store } from "./ports"

/** On disk, a job file is the `Job` itself plus its failed-commit count — the CLI reads the file as a `Job`. */
type StoredJob = Job & { failedAttempts: number }

/**
 * JSON-on-disk `Store`, one file per job under `dir`. Same semantics as `createInMemoryStore`
 * (no actor scoping). Writes are serialized within a process, so concurrent commits to one
 * job have exactly one winner; it is not safe across processes.
 */
export function createFileStore(dir: string): Store {
  const fileOf = (jobId: string) => path.join(dir, `${jobId}.json`)
  let queue: Promise<unknown> = Promise.resolve()

  // A failed step must not poison the queue for later callers.
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn)
    queue = run.catch(() => {})
    return run
  }

  async function readStored(jobId: string): Promise<{ job: Job; failedAttempts: number } | null> {
    try {
      const { failedAttempts, ...job } = JSON.parse(await readFile(fileOf(jobId), "utf-8")) as StoredJob
      return { job: job as Job, failedAttempts }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
      throw err
    }
  }

  async function read(jobId: string): Promise<Job | null> {
    return (await readStored(jobId))?.job ?? null
  }

  async function write(job: Job, failedAttempts: number): Promise<void> {
    await mkdir(dir, { recursive: true })
    await writeFile(fileOf(job.id), JSON.stringify({ ...job, failedAttempts } satisfies StoredJob))
  }

  async function nextId(): Promise<string> {
    await mkdir(dir, { recursive: true })
    const numbers = (await readdir(dir))
      .map(name => /^job-(\d+)\.json$/.exec(name))
      .filter(match => match !== null)
      .map(match => Number(match[1]))
    return `job-${Math.max(0, ...numbers) + 1}`
  }

  return {
    createJob<TOutput>(_actorId: string, type: string, inputIds: string[], config: ExecutionConfig, question?: QuestionSpec): Promise<Job<TOutput>> {
      return exclusive(async () => {
        const job: Job<TOutput> = {
          id: await nextId(),
          type,
          status: "created",
          inputIds,
          config,
          question: question ?? null,
          output: null,
          failureReason: null,
        }
        await write(job, 0)
        return job
      })
    },

    async getJob<TOutput>(_actorId: string, jobId: string): Promise<Job<TOutput> | null> {
      return (await read(jobId)) as Job<TOutput> | null
    },

    async existingIds(_actorId: string, ids: string[]): Promise<Set<string>> {
      const found = await Promise.all(ids.map(async id => ((await read(id)) ? id : null)))
      return new Set(found.filter(id => id !== null))
    },

    commitJob<TOutput>(_actorId: string, jobId: string, fromStatus: JobStatus, outcome: JobOutcome<TOutput>): Promise<boolean> {
      return exclusive(async () => {
        const stored = await readStored(jobId)
        if (!stored || stored.job.status !== fromStatus) return false
        const failedAttempts = countFailedAttempts(stored.failedAttempts, outcome)
        await write(applyOutcome(stored.job, outcome, failedAttempts), failedAttempts)
        return true
      })
    },

    supersedeJob(_actorId: string, jobId: string): Promise<void> {
      return exclusive(async () => {
        const stored = await readStored(jobId)
        if (!stored) throw new Error(`Unknown job "${jobId}"`)
        await write(supersede(stored.job), stored.failedAttempts)
      })
    },
  }
}
