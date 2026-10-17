import type { ExecutionConfig, Job } from "@/core/job"
import { assertConceptsFound, nextJobs, planQuestionJobs, type JobSpec, type PlanTarget, type QuestionClassCounts } from "@/core/lib/planner"
import type { Llm, ProgressSink, Store } from "@/core/ports"
import { runJob, type JobDefinition } from "@/core/runJob"
import { ASSET_JOB_TYPE, QUESTION_JOB_TYPE } from "@/types/jobTypes"
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

interface SettledJob {
  job: Job
  /** The job threw or lost its commit race: nothing was committed for it. */
  problem: string | null
  /** The job ran and was committed as `failed`. */
  failureReason: string | null
}

async function settleJobs(deps: RunDeps, params: RunParams, jobs: Job[]): Promise<SettledJob[]> {
  const { store, llm, progress } = deps
  const { actorId, apiKey, signal, concurrency } = params

  const settled = await withConcurrency(
    jobs.map(job => async () => {
      const definition = await deps.definitionFor(job)
      return runJob(definition, { store, llm, progress }, { actorId, jobId: job.id, apiKey, signal })
    }),
    concurrency,
  )

  return settled.map((result, i) => {
    const job = jobs[i]
    if (result.status === "rejected") return { job, problem: result.reason instanceof Error ? result.reason.message : String(result.reason), failureReason: null }
    if (!result.value.committed) return { job, problem: "lost the commit race", failureReason: null }
    return { job, problem: null, failureReason: result.value.status === "failed" ? result.value.failureReason : null }
  })
}

function assertNoneFailed(entries: Array<{ id: string; reason: string }>, total: number): void {
  if (entries.length > 0) throw new Error(`${entries.length} of ${total} job(s) failed:\n${entries.map(e => `${e.id}: ${e.reason}`).join("\n")}`)
}

/** Runs `jobs` through `runJob`; throws once all have settled if any failed, lost its commit race, or threw.
 *  A failed `asset` job doesn't count: it stays `failed` for resume, and the prep completes without that asset. */
export async function runJobs(deps: RunDeps, params: RunParams, jobs: Job[]): Promise<void> {
  const settled = await settleJobs(deps, params, jobs)
  assertNoneFailed(
    settled.flatMap(({ job, problem, failureReason }) => {
      const reason = problem ?? (job.type === ASSET_JOB_TYPE ? null : failureReason)
      return reason === null ? [] : [ { id: job.id, reason } ]
    }),
    jobs.length,
  )
}

/** Plans and persists `counts` fresh question jobs to stand in for failed ones. */
export type PlanReplacements = (counts: QuestionClassCounts) => Promise<Job[]>

/** Replacements drawn from `target`'s types and difficulty mix, created with `config` from the prep's current state. */
export function replacementPlanner(
  deps: { store: Store; loadState(prepId: string): Promise<PrepState> },
  { actorId, prepId, config, target }: { actorId: string; prepId: string; config: ExecutionConfig; target: PlanTarget },
): PlanReplacements {
  return async counts => createJobs(deps.store, actorId, config, planQuestionJobs(await deps.loadState(prepId), target, counts))
}

const isFlashcard = (job: Job) => job.question?.questionType === "flashcard"

/**
 * Runs question `jobs`, then replaces failures in rounds: each class (quiz / flashcard) plans one fresh task per
 * failure and supersedes the failed job. A class may create at most as many replacements as it had jobs
 * (2x in total); beyond that, failures stay `failed` and the run finishes short. Throws on jobs that threw or lost their commit race.
 */
export async function runQuestionJobs(deps: RunDeps, params: RunParams, jobs: Job[], planReplacements: PlanReplacements): Promise<void> {
  const remaining: QuestionClassCounts = { quiz: jobs.filter(job => !isFlashcard(job)).length, flashcard: jobs.filter(isFlashcard).length }
  let batch = jobs
  while (batch.length > 0) {
    const settled = await settleJobs(deps, params, batch)
    assertNoneFailed(settled.flatMap(({ job, problem }) => problem === null ? [] : [ { id: job.id, reason: problem } ]), batch.length)

    const failed = settled.filter(entry => entry.failureReason !== null).map(entry => entry.job)
    const quiz = failed.filter(job => !isFlashcard(job)).slice(0, remaining.quiz)
    const flashcard = failed.filter(isFlashcard).slice(0, remaining.flashcard)
    if (quiz.length + flashcard.length === 0) return

    batch = await planReplacements({ quiz: quiz.length, flashcard: flashcard.length })
    for (const job of [ ...quiz, ...flashcard ]) await deps.store.supersedeJob(params.actorId, job.id)
    remaining.quiz -= quiz.length
    remaining.flashcard -= flashcard.length
  }
}

/**
 * Drives a prep to `target`: plans the next stage, creates and runs its jobs, and repeats
 * (OCR → concept extraction → concepts → prep.meta → N question jobs) until the planner has nothing left,
 * throwing if no page yielded concepts. A failed stage throws rather than re-planning, since the unmet stage would plan the same jobs again.
 * Failed question jobs are the exception: they are replaced (see `runQuestionJobs`), and what can't be replaced stays `failed` without throwing.
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
    await runJobs(deps, params, jobs.filter(job => job.type !== QUESTION_JOB_TYPE))
    await runQuestionJobs(deps, params, jobs.filter(job => job.type === QUESTION_JOB_TYPE), replacementPlanner(deps, params))
  }
}
