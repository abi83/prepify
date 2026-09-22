import type { AgentMeta, AgentResult } from "./agent"
import { recordGenerationMeta, recordGenerationMetaMany } from "../actions/generationMeta"
import {
  loadOrCreateRun,
  saveConcepts,
  saveQuestionTasksAndInitSlots,
  saveQuestionSlot,
} from "../actions/pipeline"
import { incrementPrepTokens } from "../actions/preps"
import type { Concept, QuestionTask, PipelineProgressEvent } from "../types/pipeline"
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
  signal?: AbortSignal,
  rewrite?: RewriteInput,
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
  onProgress: (event: PipelineProgressEvent) => void
  /** Called as soon as title+description are ready — fires even if the pipeline is later cancelled. */
  onMetaReady?: (title: string, description: string) => void
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { prepId, pages, apiKey, model, language = "en", questionCount, enabledTypes, difficultyMix, signal, onProgress, onMetaReady } = config
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
    const { output, meta, chunkCount } = await runConceptExtractor(pages, apiKey, model, language, signal)
    totalTokens += meta.totalTokens
    void incrementPrepTokens(prepId, meta.totalTokens)
    void recordGenerationMeta("prep", prepId, meta).catch(e => console.warn("[pipeline] failed to record GenerationMeta:", e))

    // Deduplicate across chunks: exact-match pass (free) then LLM merger (one call).
    // Skip merger on single-chunk runs — there's nothing to merge across.
    const deduped = deduplicateExact(output)
    const merged = chunkCount > 1
      ? await runConceptMerger(deduped, apiKey, model, language, signal).then(r => {
        totalTokens += r.meta.totalTokens
        void incrementPrepTokens(prepId, r.meta.totalTokens)
        void recordGenerationMeta("prep", prepId, r.meta).catch(e => console.warn("[pipeline] failed to record GenerationMeta:", e))
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
    if (state.questionSlots.size === 0) {
      await saveQuestionTasksAndInitSlots(runId, tasks)
      for (let i = 0; i < tasks.length; i++) state.questionSlots.set(i, null)
    }
  } else {
    tasks = buildQuestionTasks(concepts, {
      questionCount: questionCount ?? DEFAULT_GEN_CONFIG.questionCount,
      enabledTypes: enabledTypes ?? DEFAULT_GEN_CONFIG.enabledTypes,
      difficultyMix: difficultyMix ?? DEFAULT_GEN_CONFIG.difficultyMix,
    })
    await saveQuestionTasksAndInitSlots(runId, tasks)
    for (let i = 0; i < tasks.length; i++) state.questionSlots.set(i, null)
  }

  // Populate already-built slots (question + its build/review meta) from storage.
  // Kept as one map, not two in lockstep, so a slot's question and meta can't desync.
  const slots = new Map<number, { question: GeneratedQuestion; meta: AgentMeta[] }>(
    [ ...state.questionSlots.entries() ]
      .filter((entry): entry is [number, GeneratedQuestion] => entry[1] !== null)
      .map(([ i, question ]) => [ i, { question, meta: state.slotMeta.get(i) ?? [] } ])
  )

  const resumedCount = slots.size
  if (resumedCount > 0) {
    onProgress({ stage: "resuming", done: resumedCount, total: tasks.length })
  }

  // Non-critical; fires callbacks so title+description are saved even if pipeline is cancelled.
  let prepTitle: string | null = null
  let prepDescription: string | null = null

  const namingPromise = runPrepNamer(concepts, apiKey, model, language, signal)
    .then(r => {
      prepTitle = r.output.title
      prepDescription = r.output.description
      totalTokens += r.meta.totalTokens
      void incrementPrepTokens(prepId, r.meta.totalTokens)
      void recordGenerationMeta("prep", prepId, r.meta).catch(e => console.warn("[pipeline] failed to record GenerationMeta:", e))
      onMetaReady?.(r.output.title, r.output.description)
    })
    .catch(() => null)

  // Stage 3: Build + review all missing slots in parallel.
  //
  // Each slot is a self-contained async pipeline: build → review, then at most one
  // reviewed rewrite → persist. A slot whose calls fail or whose rewrite is rejected
  // is dropped; the others save normally and are skipped on retry.
  //
  // Counters increment per-question (not per-batch) so crafting and reviewing
  // progress advance concurrently as soon as each individual step finishes.
  // JS is single-threaded so shared-counter increments between awaits are safe.
  const missingIndices = tasks.map((_, i) => i).filter(i => !slots.has(i))

  let craftDone = resumedCount
  let reviewDone = resumedCount

  // Build/review meta isn't a GenerationMeta row yet — the Question this slot becomes
  // doesn't exist until the caller inserts it (see questionRepository.insertMany), so
  // it's returned alongside `questions`, same order, for the caller to persist once
  // real Question ids exist. Resumed slots (seeded above from `state.slotMeta`) carry
  // their meta from the run that originally built them, read back via saveQuestionSlot.

  onProgress({ stage: "crafting", done: craftDone, total: tasks.length })

  const settled = await withConcurrency(
    missingIndices.map((taskIdx) => async () => {
      const task = tasks[taskIdx]
      const trackTokens = (meta: AgentMeta) => {
        totalTokens += meta.totalTokens
        void incrementPrepTokens(prepId, meta.totalTokens)
      }

      // Every call whose output isn't the final Question is billed-but-discarded — recorded
      // as soon as an attempt is superseded or fails, not diffed at the end, so a cancellation
      // or a future extra attempt can't leave calls unaccounted for.
      const recordWasted = (metas: AgentMeta[]) => {
        void recordGenerationMetaMany("prep", prepId, metas, true).catch(e => console.warn("[pipeline] failed to record wasted GenerationMeta:", e))
      }

      let final: { question: GeneratedQuestion; meta: AgentMeta[] } | null = null
      let rewrite: RewriteInput | undefined

      for (let attemptNum = 1; attemptNum <= MAX_SLOT_ATTEMPTS && !final; attemptNum++) {
        const attemptMeta: AgentMeta[] = []
        try {
          const built = await BUILDERS[task.type](task, apiKey, model, language, signal, rewrite)
          attemptMeta.push(built.meta)
          trackTokens(built.meta)
          if (attemptNum === 1) {
            craftDone++
            onProgress({ stage: "crafting", done: craftDone, total: tasks.length })
          }

          const reviewed = await runQuestionReviewer(built.output, task, apiKey, model, language, signal)
          attemptMeta.push(reviewed.meta)
          trackTokens(reviewed.meta)

          if (reviewed.output.passed) {
            final = { question: built.output, meta: attemptMeta }
          } else {
            recordWasted(attemptMeta)
            rewrite = { question: built.output, feedback: reviewFeedback(reviewed.output.review) }
          }
        } catch (e) {
          recordWasted(attemptMeta)
          // A cancelled pipeline isn't a failed slot; runAgent has already exhausted its own retries otherwise.
          if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw e
          console.warn(`[pipeline] slot ${taskIdx} attempt ${attemptNum} failed:`, e)
          break
        }
      }

      reviewDone++
      onProgress({ stage: "reviewing", done: reviewDone, total: tasks.length })

      if (!final) {
        // TODO(#212): failed slots aren't persisted or shown yet; they rerun on resume.
        return
      }

      // Persist before marking in-memory — if save throws the slot stays null in DB
      await saveQuestionSlot(runId, taskIdx, final.question, final.meta)
      slots.set(taskIdx, { question: final.question, meta: final.meta })
    }),
    CONCURRENCY,
  )

  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(`[pipeline] slot ${missingIndices[i]} failed, will retry next run:`, r.reason)
    }
  })

  await namingPromise
  onProgress({ stage: "done" })

  // Assemble in task order — only slots that completed successfully
  const doneIndices = tasks.map((_, i) => i).filter(i => slots.has(i))
  const questions = doneIndices.map(i => ({ ...slots.get(i)!.question, difficulty: tasks[i].difficulty }))
  const questionMeta = doneIndices.map(i => slots.get(i)!.meta)

  return { questions, prepTitle, prepDescription, totalTokens, questionMeta }
}
