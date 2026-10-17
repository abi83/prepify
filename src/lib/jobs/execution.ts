import type { ExecutionConfig, Job } from "@/core/job"
import { assertConceptsFound, nextJobs, planQuestionJobs, type JobSpec, type PlanTarget, type QuestionClassCounts } from "@/core/lib/planner"
import type { Llm, ProgressSink, Store } from "@/core/ports"
import { runJob, type JobDefinition } from "@/core/runJob"
import { ASSET_JOB_TYPE, CONCEPTS_JOB_TYPE, JOB_STAGES, stageOf, type JobStage } from "@/types/jobTypes"
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

/** What the engine plans from: the prep, the target to reach, and the config baked into new jobs. */
export interface PlanParams {
  prepId: string
  config: ExecutionConfig
  target: PlanTarget
}

export interface ExecutionParams extends RunParams, PlanParams {}

export interface EngineOptions {
  /** Run these first, before planning anything (resumed or caller-chosen jobs). */
  jobs?: Job[]
  /** Plan only jobs of these stages, in a single wave; the planner's "no concepts found" check is skipped. */
  stages?: JobStage[]
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

/** Progress derived from the jobs a run has seen: replacements join the set, so totals never lag. */
class JobSetProgress {
  private readonly jobs: Job[] = []
  private readonly settled = new Set<string>()

  constructor(private readonly sink: ProgressSink) {}

  add(jobs: Job[]): void {
    this.jobs.push(...jobs)
  }

  settle(job: Job): void {
    this.settled.add(job.id)
    this.report(stageOf(job.type))
  }

  report(stage: JobStage): void {
    const inStage = this.jobs.filter(job => stageOf(job.type) === stage)
    this.sink.report({ stage, done: inStage.filter(job => this.settled.has(job.id)).length, total: inStage.length })
  }
}

interface Run {
  deps: RunDeps
  params: RunParams
  progress: JobSetProgress
}

interface SettledJob {
  job: Job
  /** The job threw or lost its commit race: nothing was committed for it. */
  problem: string | null
  /** The job ran and was committed as `failed`. */
  failureReason: string | null
}

async function settleJobs({ deps, params, progress }: Run, jobs: Job[]): Promise<SettledJob[]> {
  const { store, llm } = deps
  const { actorId, apiKey, signal, concurrency } = params

  const settled = await withConcurrency(
    jobs.map(job => async () => {
      try {
        const definition = await deps.definitionFor(job)
        return await runJob(definition, { store, llm, progress: deps.progress }, { actorId, jobId: job.id, apiKey, signal })
      } finally {
        progress.settle(job)
      }
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
async function runJobs(run: Run, jobs: Job[]): Promise<void> {
  const settled = await settleJobs(run, jobs)
  assertNoneFailed(
    settled.flatMap(({ job, problem, failureReason }) => {
      const reason = problem ?? (job.type === ASSET_JOB_TYPE ? null : failureReason)
      return reason === null ? [] : [ { id: job.id, reason } ]
    }),
    jobs.length,
  )
}

/** Plans and persists `counts` fresh question jobs to stand in for failed ones. */
type PlanReplacements = (counts: QuestionClassCounts) => Promise<Job[]>

/** Replacements drawn from `target`'s types and difficulty mix, created with `config` from the prep's current state. */
function replacementPlanner(deps: ExecutionDeps, actorId: string, { prepId, config, target }: PlanParams): PlanReplacements {
  return async counts => createJobs(deps.store, actorId, config, planQuestionJobs(await deps.loadState(prepId), target, counts))
}

const isFlashcard = (job: Job) => job.question?.questionType === "flashcard"

/**
 * Runs question `jobs`, then replaces failures in rounds: each class (quiz / flashcard) plans one fresh task per
 * failure and supersedes the failed job. A class may create at most as many replacements as it had jobs
 * (2x in total); beyond that, failures stay `failed` and the run finishes short. Throws on jobs that threw or lost their commit race.
 */
async function runQuestionJobs(run: Run, jobs: Job[], planReplacements: PlanReplacements): Promise<void> {
  const remaining: QuestionClassCounts = { quiz: jobs.filter(job => !isFlashcard(job)).length, flashcard: jobs.filter(isFlashcard).length }
  let batch = jobs
  while (batch.length > 0) {
    const settled = await settleJobs(run, batch)
    assertNoneFailed(settled.flatMap(({ job, problem }) => problem === null ? [] : [ { id: job.id, reason: problem } ]), batch.length)

    const failed = settled.filter(entry => entry.failureReason !== null).map(entry => entry.job)
    const quiz = failed.filter(job => !isFlashcard(job)).slice(0, remaining.quiz)
    const flashcard = failed.filter(isFlashcard).slice(0, remaining.flashcard)
    if (quiz.length + flashcard.length === 0) return

    batch = await planReplacements({ quiz: quiz.length, flashcard: flashcard.length })
    run.progress.add(batch)
    for (const job of [ ...quiz, ...flashcard ]) await run.deps.store.supersedeJob(run.params.actorId, job.id)
    remaining.quiz -= quiz.length
    remaining.flashcard -= flashcard.length
  }
}

/**
 * The one place that orders stages and applies the failure policy. Runs `jobs` stage by stage, so later stages see earlier outputs.
 * Within a stage jobs run concurrently, except concepts merges: each reads the concepts the previous one stored,
 * so they run one at a time after the rest and stop at the first failure. With `planReplacements`, failed question jobs are replaced instead of throwing.
 */
async function runJobSet(run: Run, jobs: Job[], planReplacements: PlanReplacements | null): Promise<void> {
  run.progress.add(jobs)
  for (const stage of JOB_STAGES) {
    const stageJobs = jobs.filter(job => stageOf(job.type) === stage)
    if (stageJobs.length === 0) continue
    run.progress.report(stage)
    const merges = stageJobs.filter(job => job.type === CONCEPTS_JOB_TYPE)
    const rest = stageJobs.filter(job => !merges.includes(job))
    if (stage === "questions" && planReplacements) await runQuestionJobs(run, rest, planReplacements)
    else await runJobs(run, rest)
    for (const merge of merges) await runJobs(run, [ merge ])
  }
}

/**
 * Drives a prep to `target`: runs `options.jobs`, then plans the next stage, creates and runs its jobs, and repeats
 * (OCR → concept extraction → concepts → prep.meta → N question jobs → assets) until the planner has nothing left,
 * throwing if no page yielded concepts. A failed stage throws rather than re-planning, since the unmet stage would plan the same jobs again.
 * Failed question jobs are the exception: they are replaced (see `runQuestionJobs`), and what can't be replaced stays `failed` without throwing.
 */
export async function executePrep(deps: ExecutionDeps, params: ExecutionParams, options: EngineOptions = {}): Promise<void> {
  const run: Run = { deps, params, progress: new JobSetProgress(deps.progress) }
  const planReplacements = replacementPlanner(deps, params.actorId, params)
  await runJobSet(run, options.jobs ?? [], planReplacements)
  const { stages } = options
  for (;;) {
    const state = await deps.loadState(params.prepId)
    const specs = nextJobs(state, params.target).filter(spec => !stages || stages.includes(stageOf(spec.type)))
    if (specs.length === 0) {
      if (!stages) assertConceptsFound(state)
      return
    }
    await runJobSet(run, await createJobs(deps.store, params.actorId, params.config, specs), planReplacements)
    if (stages) return
  }
}

/** Runs exactly `jobs` through the engine's stage ordering and failure policy, planning and replacing nothing. */
export async function executeJobs(deps: RunDeps, params: RunParams, jobs: Job[]): Promise<void> {
  await runJobSet({ deps, params, progress: new JobSetProgress(deps.progress) }, jobs, null)
}
