import type { AgentMeta, AgentResult } from "./agent"
import { recordGenerationMeta } from "../actions/generationMeta"
import {
  loadOrCreateRun,
  saveConcepts,
  saveQuestionTasksAndInitSlots,
  saveQuestionSlot,
} from "../actions/pipeline"
import { incrementPrepTokens } from "../actions/preps"
import type { Concept, QuestionTask, PipelineProgressEvent } from "../types/pipeline"
import type { Page } from "../types/prep"
import type { GeneratedQuestion, QuestionType } from "../types/questions"
import { runFillTheGapBuilder } from "./agents/builders/FillTheGapBuilder"
import { runFlashcardBuilder } from "./agents/builders/FlashcardBuilder"
import { runMultipleChoiceBuilder } from "./agents/builders/MultipleChoiceBuilder"
import { runSingleChoiceBuilder } from "./agents/builders/SingleChoiceBuilder"
import { runSortingBuilder } from "./agents/builders/SortingBuilder"
import { runConceptExtractor } from "./agents/ConceptExtractor"
import { runConceptMerger } from "./agents/ConceptMerger"
import { runPrepNamer } from "./agents/PrepNamer"
import { runQuestionReviewer } from "./agents/QuestionReviewer"
import { BYOK_TEXT_HARD_LIMIT } from "./config"
import { DEFAULT_GEN_CONFIG } from "./generationConfig"
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
  signal?: AbortSignal
  onProgress: (event: PipelineProgressEvent) => void
  /** Called as soon as title+description are ready — fires even if the pipeline is later cancelled. */
  onMetaReady?: (title: string, description: string) => void
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { prepId, pages, apiKey, model, language = "en", questionCount, enabledTypes, signal, onProgress, onMetaReady } = config
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
    })
    await saveQuestionTasksAndInitSlots(runId, tasks)
    for (let i = 0; i < tasks.length; i++) state.questionSlots.set(i, null)
  }

  // Populate already-built questions from stored slots
  const builtQuestions = new Map<number, GeneratedQuestion>(
    [ ...state.questionSlots.entries() ]
      .filter((entry): entry is [number, GeneratedQuestion] => entry[1] !== null)
  )

  // Meta for slots resumed from a prior run, keyed the same way as slotMeta below —
  // persisted by saveQuestionSlot at build time so a crash mid-run doesn't lose it.
  const slotMeta = new Map<number, AgentMeta[]>(state.slotMeta)

  const resumedCount = builtQuestions.size
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

  // Build/review meta isn't a GenerationMeta row yet — the Question this slot becomes
  // doesn't exist until the caller inserts it (see questionRepository.insertMany), so
  // it's returned alongside `questions`, same order, for the caller to persist once
  // real Question ids exist. Resumed slots (seeded above from `state.slotMeta`) carry
  // their meta from the run that originally built them, read back via saveQuestionSlot.

  onProgress({ stage: "crafting", done: craftDone, total: tasks.length })

  const settled = await withConcurrency(
    missingIndices.map((taskIdx) => async () => {
      const task = tasks[taskIdx]
      const metas: AgentMeta[] = []

      // Build
      const buildResult = await BUILDERS[task.type](task, apiKey, model, language, signal)
      totalTokens += buildResult.meta.totalTokens
      void incrementPrepTokens(prepId, buildResult.meta.totalTokens)
      metas.push(buildResult.meta)
      craftDone++
      onProgress({ stage: "crafting", done: craftDone, total: tasks.length })

      // Review immediately — no waiting for other slots to finish building
      const reviewed = await runQuestionReviewer(buildResult.output, task.concepts, apiKey, model, language, signal)
      totalTokens += reviewed.meta.totalTokens
      void incrementPrepTokens(prepId, reviewed.meta.totalTokens)
      metas.push(reviewed.meta)

      let question: GeneratedQuestion
      if (reviewed.output.question === null) {
        // Retry build once on reviewer rejection
        const retry = await BUILDERS[task.type](task, apiKey, model, language, signal)
        totalTokens += retry.meta.totalTokens
        void incrementPrepTokens(prepId, retry.meta.totalTokens)
        metas.push(retry.meta)
        question = retry.output
      } else {
        question = reviewed.output.question
      }

      // Persist before marking in-memory — if save throws the slot stays null in DB
      await saveQuestionSlot(runId, taskIdx, question, metas)
      builtQuestions.set(taskIdx, question)
      slotMeta.set(taskIdx, metas)
      reviewDone++
      onProgress({ stage: "reviewing", done: reviewDone, total: tasks.length })
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
  const doneIndices = tasks.map((_, i) => i).filter(i => builtQuestions.has(i))
  const questions = doneIndices.map(i => builtQuestions.get(i)!)
  const questionMeta = doneIndices.map(i => slotMeta.get(i) ?? [])

  return { questions, prepTitle, prepDescription, totalTokens, questionMeta }
}
