import type { ExecutionConfig, Job } from "@/core/job"
import { ASSET_JOB_TYPE } from "@/core/lib/jobs/jobTypes"
import { assertConceptsFound, nextJobs, type JobSpec, type PlanTarget } from "@/core/lib/planner"
import type { Llm, ProgressSink, Store } from "@/core/ports"
import { runJob, type JobDefinition } from "@/core/runJob"
import type { PrepState } from "@/types/prepState"

export interface RunDeps {
  store: Store
  llm: Llm
  progress: ProgressSink
  /** Builds the definition for a job, fetching whatever inputs its `run` needs (images, pages, concepts). */
  definitionFor(job: Job): Promise<JobDefinition<unknown>>
}

export interface ExecutionDeps extends RunDeps {
  loadState(prepId: string): Promise<PrepState>
}

export interface RunParams {
  actorId: string
  apiKey: string
  signal: AbortSignal
  concurrency: number
}

export interface ExecutionParams extends RunParams {
  prepId: string
  config: ExecutionConfig
  target: PlanTarget
}

/** Persists `specs` as `created` jobs without executing them. */
export function createJobs(store: Store, actorId: string, config: ExecutionConfig, specs: JobSpec[]): Promise<Job[]> {
  return Promise.all(specs.map(spec => store.createJob(actorId, spec.type, spec.inputIds, config, spec.question ?? undefined)))
}

/** Runs `tasks` with at most `limit` in flight; a new one starts as soon as any finishes. */
export async function withConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const idx = next++
      results[idx] = await tasks[idx]().then(
        value => ({ status: "fulfilled", value }) as const,
        reason => ({ status: "rejected", reason }) as const,
      )
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

/** Runs `jobs` through `runJob`; throws once all have settled if any failed, lost its commit race, or threw.
 *  A failed `asset` job doesn't count: it stays `failed` for resume, and the prep completes without that asset. */
export async function runJobs(deps: RunDeps, params: RunParams, jobs: Job[]): Promise<void> {
  const { store, llm, progress } = deps
  const { actorId, apiKey, signal, concurrency } = params

  const settled = await withConcurrency(
    jobs.map(job => async () => {
      const definition = await deps.definitionFor(job)
      return runJob(definition, { store, llm, progress }, { actorId, jobId: job.id, apiKey, signal })
    }),
    concurrency,
  )

  const failures = settled.flatMap((result, i) => {
    if (result.status === "rejected") return [ `${jobs[i].id}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}` ]
    if (!result.value.committed) return [ `${jobs[i].id}: lost the commit race` ]
    if (result.value.status === "failed" && jobs[i].type !== ASSET_JOB_TYPE) return [ `${jobs[i].id}: ${result.value.failureReason}` ]
    return []
  })
  if (failures.length > 0) throw new Error(`${failures.length} of ${jobs.length} job(s) failed:\n${failures.join("\n")}`)
}

/**
 * Drives a prep to `target`: plans the next stage, creates and runs its jobs, and repeats
 * (OCR → concept extraction → concepts → prep.meta → N question jobs) until the planner has nothing left,
 * throwing if no page yielded concepts. A failed stage throws rather than re-planning, since the unmet stage would plan the same jobs again.
 */
export async function executePrep(deps: ExecutionDeps, params: ExecutionParams): Promise<void> {
  for (;;) {
    const state = await deps.loadState(params.prepId)
    const specs = nextJobs(state, params.target)
    if (specs.length === 0) {
      assertConceptsFound(state)
      return
    }

    const jobs = await createJobs(deps.store, params.actorId, params.config, specs)
    await runJobs(deps, params, jobs)
  }
}
