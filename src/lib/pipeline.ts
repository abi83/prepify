import type { AgentMeta, AgentResult } from "./agent"
import { serializeError } from "./logger"
import type { Logger } from "./logger"
import { recordGenerationMeta, recordGenerationMetaMany } from "../actions/generationMeta"
import {
  loadOrCreateRun,
  saveConcepts,
  saveQuestionTasksAndInitSlots,
  saveAttemptBuild,
  saveAttemptReview,
  finishSlot,
  failSlot,
} from "../actions/pipeline"
import { incrementPrepTokens } from "../actions/preps"
import type { PipelineSlotState } from "../repositories/pipelineRepository"
import type { Concept, PipelineAttempt, QuestionTask, PipelineProgressEvent } from "../types/pipeline"
import type { Page } from "../types/prep"
import type { Difficulty, GeneratedQuestion, QuestionType } from "../types/questions"
import { runFillTheGapBuilder } from "./agents/builders/FillTheGapBuilder"
import { runFlashcardBuilder } from "./agents/builders/FlashcardBuilder"
import { runMultipleChoiceBuilder } from "./agents/builders/MultipleChoiceBuilder"
import type { RewriteInput } from "./agents/builders/rewrite"
import { runSingleChoiceBuilder } from "./agents/builders/SingleChoiceBuilder"
import { runSortingBuilder } from "./agents/builders/SortingBuilder"
import { runConceptExtractor } from "./agents/ConceptExtractor"
import { runConceptMerger } from "./agents/ConceptMerger"
import { runPrepNamer } from "./agents/PrepNamer"
import { reviewFeedback, runQuestionReviewer } from "./agents/QuestionReviewer"
import { BYOK_TEXT_HARD_LIMIT } from "./config"
import { DEFAULT_GEN_CONFIG, type DifficultyMix } from "./generationConfig"
import { deduplicateExact } from "./mergeConceptLists"
import { buildQuestionTasks } from "./taskBuilder"

/** Thrown when total page text exceeds BYOK_TEXT_HARD_LIMIT. The UI catches this and shows a confirmation modal. */
export class TextTooLongError extends Error {
  constructor(public readonly length: number) {
    super(`Text too long: ${length} characters`)
    this.name = "TextTooLongError"
  }
}

/** Maximum number of concurrent build→review→save chains. */
const CONCURRENCY = 5

/** Bounded build→review chain per slot: an initial attempt, plus one reviewed rewrite on rejection. */
const MAX_SLOT_ATTEMPTS = 2

/**
 * Runs `tasks` with at most `limit` concurrent executions.
 * Unlike batching, a new task starts as soon as any running one finishes —
 * there is no synchronization barrier at the end of each batch.
 */
async function withConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const idx = next++
      try {
        results[idx] = { status: "fulfilled", value: await tasks[idx]() }
      } catch (e) {
        results[idx] = { status: "rejected", reason: e }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  )
  return results
}

type BuilderFn = (
  task: QuestionTask,
  apiKey: string,
  model: string,
  language: string,
  signal: AbortSignal,
  rewrite: RewriteInput | undefined,
  logger: Logger,
) => Promise<AgentResult<GeneratedQuestion>>

const BUILDERS: Record<QuestionType, BuilderFn> = {
  flashcard: runFlashcardBuilder as BuilderFn,
  single_choice: runSingleChoiceBuilder as BuilderFn,
  multiple_choice: runMultipleChoiceBuilder as BuilderFn,
  fill_the_gap: runFillTheGapBuilder as BuilderFn,
  sorting: runSortingBuilder as BuilderFn,
}

export type BuiltQuestion = GeneratedQuestion & { difficulty: Difficulty }

export interface PipelineResult {
  questions: BuiltQuestion[]
  prepTitle: string | null
  prepDescription: string | null
  totalTokens: number
  /** Build/review/asset-agent meta for each question in `questions`, same order — not yet
   *  persisted as GenerationMeta because the Question doesn't exist until the caller
   *  inserts it (see questionRepository.insertMany). */
  questionMeta: AgentMeta[][]
  /** Slots that exhausted MAX_SLOT_ATTEMPTS without a passing review — terminal, not retried
   *  on the next run. Count only: task-level detail isn't meaningful to the UI. */
  failedCount: number
}

export interface PipelineConfig {
  prepId: string
  pages: Page[]
  apiKey: string
  model: string
  /** ISO 639-1 language code detected from the source image (e.g. 'de', 'fr'). Defaults to 'en'. */
  language?: string
  /** Target number of questions to generate (default 10, range 5–20). */
  questionCount?: number
  /** Which question types to include (default: all five types). */
  enabledTypes?: QuestionType[]
  /** Relative weights per difficulty tier (default 30/40/30). */
  difficultyMix?: DifficultyMix
  signal?: AbortSignal
  logger: Logger
  onProgress: (event: PipelineProgressEvent) => void
  /** Called as soon as title+description are ready — fires even if the pipeline is later cancelled. */
  onMetaReady?: (title: string, description: string) => void
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { prepId, pages, apiKey, model, language = "en", questionCount, enabledTypes, difficultyMix, logger, onProgress, onMetaReady } = config
  const signal = config.signal ?? new AbortController().signal
  let totalTokens = 0

  const totalTextLength = pages.reduce((sum, p) => sum + p.text.length, 0)
  if (totalTextLength > BYOK_TEXT_HARD_LIMIT) {
    throw new TextTooLongError(totalTextLength)
  }

  // Load or create a persistent run record for crash recovery
  const state = await loadOrCreateRun(prepId)
  const { runId } = state

  // Stage 1: Extract concepts (skip if already stored)
  let concepts: Concept[]
  if (state.concepts) {
    concepts = state.concepts
  } else {
    onProgress({ stage: "concepts" })
    const { output, meta, chunkCount } = await runConceptExtractor(pages, apiKey, model, language, signal, logger)
    totalTokens += meta.totalTokens
    void incrementPrepTokens(prepId, meta.totalTokens)
    void recordGenerationMeta("prep", prepId, meta).catch(e => logger.warn("pipeline: failed to record GenerationMeta", { error: serializeError(e) }))

    // Deduplicate across chunks: exact-match pass (free) then LLM merger (one call).
    // Skip merger on single-chunk runs — there's nothing to merge across.
    const deduped = deduplicateExact(output)
    const merged = chunkCount > 1
      ? await runConceptMerger(deduped, apiKey, model, language, signal, logger).then(r => {
        totalTokens += r.meta.totalTokens
        void incrementPrepTokens(prepId, r.meta.totalTokens)
        void recordGenerationMeta("prep", prepId, r.meta).catch(e => logger.warn("pipeline: failed to record GenerationMeta", { error: serializeError(e) }))
        return r.output
      })
      : deduped

    concepts = merged
    await saveConcepts(runId, concepts)
  }

  // Stage 2: Build question tasks (skip if already stored)
  let tasks: QuestionTask[]
  if (state.questionTasks) {
    tasks = state.questionTasks
    // Re-init slots if they were lost (edge case: crashed between saving tasks and inserting slots)
    if (state.slots.size === 0) {
      await saveQuestionTasksAndInitSlots(runId, tasks)
      for (let i = 0; i < tasks.length; i++) state.slots.set(i, { status: "pending", attempts: [], question: null, meta: null })
    }
  } else {
    tasks = buildQuestionTasks(concepts, {
      questionCount: questionCount ?? DEFAULT_GEN_CONFIG.questionCount,
      enabledTypes: enabledTypes ?? DEFAULT_GEN_CONFIG.enabledTypes,
      difficultyMix: difficultyMix ?? DEFAULT_GEN_CONFIG.difficultyMix,
    })
    await saveQuestionTasksAndInitSlots(runId, tasks)
    for (let i = 0; i < tasks.length; i++) state.slots.set(i, { status: "pending", attempts: [], question: null, meta: null })
  }

  // Finished slots (question + its build/review meta) from storage, kept as one map — not two
  // in lockstep — so a slot's question and meta can't desync.
  const slots = new Map<number, { question: GeneratedQuestion; meta: AgentMeta[] }>(
    [ ...state.slots.entries() ]
      .filter((entry): entry is [number, PipelineSlotState & { question: GeneratedQuestion; meta: AgentMeta[] }] => entry[1].status === "finished")
      .map(([ i, slot ]) => [ i, { question: slot.question, meta: slot.meta } ])
  )

  // Failed slots are terminal — never retried, surfaced to the caller as a count.
  const failedIndices = new Set<number>(
    [ ...state.slots.entries() ].filter(([ , slot ]) => slot.status === "failed").map(([ i ]) => i)
  )

  const resumedCount = slots.size
  if (resumedCount > 0 || failedIndices.size > 0) {
    onProgress({ stage: "resuming", done: resumedCount, total: tasks.length })
  }

  // Non-critical; fires callbacks so title+description are saved even if pipeline is cancelled.
  let prepTitle: string | null = null
  let prepDescription: string | null = null

  const namingPromise = runPrepNamer(concepts, apiKey, model, language, signal, logger)
    .then(r => {
      prepTitle = r.output.title
      prepDescription = r.output.description
      totalTokens += r.meta.totalTokens
      void incrementPrepTokens(prepId, r.meta.totalTokens)
      void recordGenerationMeta("prep", prepId, r.meta).catch(e => logger.warn("pipeline: failed to record GenerationMeta", { error: serializeError(e) }))
      onMetaReady?.(r.output.title, r.output.description)
    })
    .catch(() => null)

  // Stage 3: Build + review all pending slots in parallel.
  //
  // Each slot is a self-contained async state machine: build → review, then at most one
  // reviewed rewrite → review again → finish or fail. Every step persists as soon as it
  // completes (saveAttemptBuild/saveAttemptReview/finishSlot/failSlot), so a crash mid-slot
  // resumes at the first step the last persisted attempt is missing, instead of redoing the
  // whole slot. A slot whose calls fail or whose rewrite is rejected is marked failed —
  // terminal, never retried — and doesn't hold up the others.
  //
  // Counters increment per-question (not per-batch) so crafting/rewriting/reviewing
  // progress advance concurrently as soon as each individual step finishes.
  // JS is single-threaded so shared-counter increments between awaits are safe.
  const pendingIndices = tasks.map((_, i) => i).filter(i => !slots.has(i) && !failedIndices.has(i))

  let craftDone = resumedCount
  let rewriteDone = 0
  let reviewDone = resumedCount

  // Rewrite total: pending slots whose persisted last attempt is already a rejection (known
  // upfront, so the "Revise rejected questions" row's denominator doesn't grow mid-run), plus
  // one for each first-attempt rejection discovered fresh below.
  let rewriteTotal = pendingIndices.filter(i => {
    const attempts = state.slots.get(i)?.attempts ?? []
    const last = attempts[attempts.length - 1]
    return last !== undefined && last.review !== null && !last.review.passed
  }).length

  // Build/review meta isn't a GenerationMeta row yet — the Question this slot becomes
  // doesn't exist until the caller inserts it (see questionRepository.insertMany), so
  // it's returned alongside `questions`, same order, for the caller to persist once
  // real Question ids exist. Resumed slots (seeded above from `state.slots`) carry
  // their meta from the run that originally built them, read back via finishSlot.

  onProgress({ stage: "crafting", done: craftDone, total: tasks.length })

  const settled = await withConcurrency(
    pendingIndices.map((taskIdx) => async () => {
      const task = tasks[taskIdx]
      const resumeAttempts = state.slots.get(taskIdx)?.attempts ?? []

      const trackTokens = (meta: AgentMeta) => {
        totalTokens += meta.totalTokens
        void incrementPrepTokens(prepId, meta.totalTokens)
      }

      // Every call whose output isn't the final Question is billed-but-discarded — recorded
      // as soon as an attempt is superseded or fails, not diffed at the end, so a cancellation
      // or a future extra attempt can't leave calls unaccounted for.
      const recordWasted = (metas: AgentMeta[]) => {
        void recordGenerationMetaMany("prep", prepId, metas, true).catch(e => logger.warn("pipeline: failed to record wasted GenerationMeta", { error: serializeError(e) }))
      }

      let final: { question: GeneratedQuestion; meta: AgentMeta[] } | null = null
      let rewrite: RewriteInput | undefined
      let startAttemptNum = 1
      let resumeBuild: PipelineAttempt["build"] | null = null

      // Resume point: the last persisted attempt tells us exactly which step is missing.
      if (resumeAttempts.length > 0) {
        const last = resumeAttempts[resumeAttempts.length - 1]
        if (last.review === null) {
          // Build was persisted but never reviewed — reuse it, no rebuild/re-bill.
          startAttemptNum = last.attemptNum
          resumeBuild = last.build
        } else if (last.review.passed) {
          // Reviewed and passed, but the crash happened before finishSlot persisted —
          // no further calls needed, just finish it.
          final = { question: last.build.question, meta: [ last.build.meta, last.review.meta ] }
        } else {
          startAttemptNum = last.attemptNum + 1
          rewrite = { question: last.build.question, feedback: reviewFeedback(last.review.review) }
        }
      }

      // Progress credit for build steps already persisted from a previous run — each step
      // (attempt 1, attempt 2) is counted exactly once, whether it happened before this run
      // or during it. The loop below only performs a fresh build for an attempt number NOT
      // already in `resumeAttempts`, so there's no double-counting between this and it.
      if (resumeAttempts.some(a => a.attemptNum === 1)) {
        craftDone++
        onProgress({ stage: "crafting", done: craftDone, total: tasks.length })
      }
      if (resumeAttempts.some(a => a.attemptNum === 2)) {
        rewriteDone++
        onProgress({ stage: "rewriting", done: rewriteDone, total: rewriteTotal })
      }

      for (let attemptNum = startAttemptNum; attemptNum <= MAX_SLOT_ATTEMPTS && !final; attemptNum++) {
        const attemptMeta: AgentMeta[] = []
        try {
          let built: { output: GeneratedQuestion; meta: AgentMeta }
          if (resumeBuild && attemptNum === startAttemptNum) {
            built = { output: resumeBuild.question, meta: resumeBuild.meta }
          } else {
            built = await BUILDERS[task.type](task, apiKey, model, language, signal, rewrite, logger)
            attemptMeta.push(built.meta)
            trackTokens(built.meta)
            await saveAttemptBuild(runId, taskIdx, attemptNum, built.output, built.meta)
            if (attemptNum === 1) {
              craftDone++
              onProgress({ stage: "crafting", done: craftDone, total: tasks.length })
            } else {
              rewriteDone++
              onProgress({ stage: "rewriting", done: rewriteDone, total: rewriteTotal })
            }
          }

          const reviewed = await runQuestionReviewer(built.output, task, apiKey, model, language, signal, logger)
          attemptMeta.push(reviewed.meta)
          trackTokens(reviewed.meta)
          await saveAttemptReview(runId, taskIdx, attemptNum, reviewed.output.review, reviewed.output.passed, reviewed.meta)

          if (reviewed.output.passed) {
            final = { question: built.output, meta: [ built.meta, reviewed.meta ] }
          } else {
            recordWasted([ built.meta, reviewed.meta ])
            rewrite = { question: built.output, feedback: reviewFeedback(reviewed.output.review) }
            // A rejection discovered fresh this run (not already reflected in the upfront scan
            // above) means one more slot is about to need a rewrite — only when there's an
            // attempt left to spend on it.
            if (attemptNum < MAX_SLOT_ATTEMPTS) {
              rewriteTotal++
              onProgress({ stage: "rewriting", done: rewriteDone, total: rewriteTotal })
            }
          }
        } catch (e) {
          recordWasted(attemptMeta)
          // A cancelled pipeline isn't a failed slot; runAgent has already exhausted its own retries otherwise.
          if (signal.aborted || (e instanceof Error && e.name === "AbortError")) throw e
          logger.warn("pipeline: slot attempt failed", { taskIdx, attemptNum, error: serializeError(e) })
          break
        }
      }

      reviewDone++
      onProgress({ stage: "reviewing", done: reviewDone, total: tasks.length })

      if (!final) {
        // Update in-memory state before persisting: a transient DB error on failSlot shouldn't
        // also drop this slot from this run's failedCount — the DB row stays "pending" and
        // self-heals into "failed" on the next resume (exhausted attempts re-derive the same
        // outcome with no further LLM calls).
        failedIndices.add(taskIdx)
        try {
          await failSlot(runId, taskIdx)
        } catch (e) {
          logger.warn("pipeline: could not persist slot failed status", { taskIdx, error: serializeError(e) })
        }
        return
      }

      await finishSlot(runId, taskIdx, final.question, final.meta)
      slots.set(taskIdx, { question: final.question, meta: final.meta })
    }),
    CONCURRENCY,
  )

  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.warn("pipeline: slot left pending, will resume next run", { taskIdx: pendingIndices[i], error: serializeError(r.reason) })
    }
  })

  await namingPromise
  onProgress({ stage: "done", failed: failedIndices.size })

  // Assemble in task order — only slots that completed successfully
  const doneIndices = tasks.map((_, i) => i).filter(i => slots.has(i))
  const questions = doneIndices.map(i => ({ ...slots.get(i)!.question, difficulty: tasks[i].difficulty }))
  const questionMeta = doneIndices.map(i => slots.get(i)!.meta)

  return { questions, prepTitle, prepDescription, totalTokens, questionMeta, failedCount: failedIndices.size }
}
