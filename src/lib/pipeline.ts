import { runConceptExtractor } from './agents/ConceptExtractor'
import { runConceptMerger } from './agents/ConceptMerger'
import { deduplicateExact } from './mergeConceptLists'
import { BYOK_TEXT_HARD_LIMIT } from './config'
import { runPrepNamer } from './agents/PrepNamer'
import { runFlashcardBuilder } from './agents/builders/FlashcardBuilder'
import { runSingleChoiceBuilder } from './agents/builders/SingleChoiceBuilder'
import { runMultipleChoiceBuilder } from './agents/builders/MultipleChoiceBuilder'
import { runFillTheGapBuilder } from './agents/builders/FillTheGapBuilder'
import { runSortingBuilder } from './agents/builders/SortingBuilder'
import { runQuestionReviewer } from './agents/QuestionReviewer'
import type { Concept, QuestionTask, PipelineProgressEvent } from '../types/pipeline'
import type { GeneratedQuestion, QuestionType } from '../types/questions'
import type { AgentResult } from './agent'
import { incrementPrepTokensInDb } from './tokenUsage'
import { buildQuestionTasks } from './taskBuilder'
import { DEFAULT_GEN_CONFIG } from './generationConfig'
import {
  loadOrCreateRun,
  saveConcepts,
  saveQuestionTasksAndInitSlots,
  saveQuestionSlot,
} from './pipelineStore'

/** Thrown when rawText exceeds BYOK_TEXT_HARD_LIMIT. The UI catches this and shows a confirmation modal. */
export class TextTooLongError extends Error {
  constructor(public readonly length: number) {
    super(`Text too long: ${length} characters`)
    this.name = 'TextTooLongError'
  }
}

/** Maximum number of concurrent build→review→save chains. */
const CONCURRENCY = 5

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
        results[idx] = { status: 'fulfilled', value: await tasks[idx]() }
      } catch (e) {
        results[idx] = { status: 'rejected', reason: e }
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
) => Promise<AgentResult<GeneratedQuestion>>

const BUILDERS: Record<QuestionType, BuilderFn> = {
  flashcard: runFlashcardBuilder as BuilderFn,
  single_choice: runSingleChoiceBuilder as BuilderFn,
  multiple_choice: runMultipleChoiceBuilder as BuilderFn,
  fill_the_gap: runFillTheGapBuilder as BuilderFn,
  sorting: runSortingBuilder as BuilderFn,
}

export interface PipelineResult {
  questions: GeneratedQuestion[]
  prepTitle: string | null
  totalTokens: number
}

export interface PipelineConfig {
  prepId: string
  rawText: string
  apiKey: string
  model: string
  /** ISO 639-1 language code detected from the source image (e.g. 'de', 'fr'). Defaults to 'en'. */
  language?: string
  /** Target number of questions to generate (default 10, range 5–20). */
  questionCount?: number
  /** Which question types to include (default: all five types). */
  enabledTypes?: QuestionType[]
  signal?: AbortSignal
  onProgress: (event: PipelineProgressEvent) => void
  /** Called as soon as the prep title is ready — fires even if the pipeline is later cancelled. */
  onTitleReady?: (title: string) => void
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { prepId, rawText, apiKey, model, language = 'en', questionCount, enabledTypes, signal, onProgress, onTitleReady } = config
  let totalTokens = 0

  if (rawText.length > BYOK_TEXT_HARD_LIMIT) {
    throw new TextTooLongError(rawText.length)
  }

  // Load or create a persistent run record for crash recovery
  const state = await loadOrCreateRun(prepId)
  const { runId } = state

  // Stage 1: Extract concepts (skip if already stored)
  let concepts: Concept[]
  if (state.concepts) {
    concepts = state.concepts
  } else {
    onProgress({ stage: 'concepts' })
    const { output, metrics, chunkCount } = await runConceptExtractor(rawText, apiKey, model, language, signal)
    totalTokens += metrics.total_tokens
    void incrementPrepTokensInDb(prepId, metrics.total_tokens)

    // Deduplicate across chunks: exact-match pass (free) then LLM merger (one call).
    // Skip merger on single-chunk runs — there's nothing to merge across.
    const deduped = deduplicateExact(output)
    const merged = chunkCount > 1
      ? await runConceptMerger(deduped, apiKey, model, language, signal).then(r => {
          totalTokens += r.metrics.total_tokens
          void incrementPrepTokensInDb(prepId, r.metrics.total_tokens)
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
    })
    await saveQuestionTasksAndInitSlots(runId, tasks)
    for (let i = 0; i < tasks.length; i++) state.questionSlots.set(i, null)
  }

  // Populate already-built questions from stored slots
  const builtQuestions = new Map<number, GeneratedQuestion>(
    [...state.questionSlots.entries()]
      .filter((entry): entry is [number, GeneratedQuestion] => entry[1] !== null)
  )

  const resumedCount = builtQuestions.size
  if (resumedCount > 0) {
    onProgress({ stage: 'resuming', done: resumedCount, total: tasks.length })
  }

  // Start naming in parallel — non-critical, failure is silently ignored.
  // onTitleReady fires immediately when naming finishes so the title is saved
  // even if the pipeline is cancelled later.
  let prepTitle: string | null = null
  const namingPromise = runPrepNamer(concepts, apiKey, model, language, signal)
    .then(r => {
      prepTitle = r.output.title
      totalTokens += r.metrics.total_tokens
      void incrementPrepTokensInDb(prepId, r.metrics.total_tokens)
      onTitleReady?.(r.output.title)
    })
    .catch(() => null)

  // Stage 3: Build + review all missing slots in parallel.
  //
  // Each slot is a self-contained async pipeline: build → review → persist.
  // allSettled isolates failures per slot — a bad LLM response only kills
  // that one question; the others save normally and are skipped on retry.
  //
  // Counters increment per-question (not per-batch) so crafting and reviewing
  // progress advance concurrently as soon as each individual step finishes.
  // JS is single-threaded so shared-counter increments between awaits are safe.
  const missingIndices = tasks.map((_, i) => i).filter(i => !builtQuestions.has(i))

  let craftDone = resumedCount
  let reviewDone = resumedCount

  onProgress({ stage: 'crafting', done: craftDone, total: tasks.length })

  const settled = await withConcurrency(
    missingIndices.map((taskIdx) => async () => {
      const task = tasks[taskIdx]

      // Build
      const buildResult = await BUILDERS[task.type](task, apiKey, model, language, signal)
      totalTokens += buildResult.metrics.total_tokens
      void incrementPrepTokensInDb(prepId, buildResult.metrics.total_tokens)
      craftDone++
      onProgress({ stage: 'crafting', done: craftDone, total: tasks.length })

      // Review immediately — no waiting for other slots to finish building
      const reviewed = await runQuestionReviewer(buildResult.output, task.concepts, apiKey, model, language, signal)
      totalTokens += reviewed.metrics.total_tokens
      void incrementPrepTokensInDb(prepId, reviewed.metrics.total_tokens)

      let question: GeneratedQuestion
      if (reviewed.output.question === null) {
        // Retry build once on reviewer rejection
        const retry = await BUILDERS[task.type](task, apiKey, model, language, signal)
        totalTokens += retry.metrics.total_tokens
        void incrementPrepTokensInDb(prepId, retry.metrics.total_tokens)
        question = retry.output
      } else {
        question = reviewed.output.question
      }

      // Persist before marking in-memory — if save throws the slot stays null in DB
      await saveQuestionSlot(runId, taskIdx, question)
      builtQuestions.set(taskIdx, question)
      reviewDone++
      onProgress({ stage: 'reviewing', done: reviewDone, total: tasks.length })
    }),
    CONCURRENCY,
  )

  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[pipeline] slot ${missingIndices[i]} failed, will retry next run:`, r.reason)
    }
  })

  await namingPromise
  onProgress({ stage: 'done' })

  // Assemble in task order — only slots that completed successfully
  const questions = tasks
    .map((_, i) => builtQuestions.get(i))
    .filter((q): q is GeneratedQuestion => q != null)

  return { questions, prepTitle, totalTokens }
}
