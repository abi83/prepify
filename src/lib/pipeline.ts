import { runConceptExtractor } from './agents/ConceptExtractor'
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
import { addTokenUsage } from './tokenUsage'
import { buildQuestionTasks } from './taskBuilder'
import {
  loadOrCreateRun,
  saveConcepts,
  saveQuestionTasksAndInitSlots,
  saveQuestionSlot,
  deleteRun,
} from './pipelineStore'

const BATCH_SIZE = 5

type BuilderFn = (
  task: QuestionTask,
  rawText: string,
  apiKey: string,
  model: string,
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
  signal?: AbortSignal
  onProgress: (event: PipelineProgressEvent) => void
  /** Called as soon as the prep title is ready — fires even if the pipeline is later cancelled. */
  onTitleReady?: (title: string) => void
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { prepId, rawText, apiKey, model, signal, onProgress, onTitleReady } = config
  let totalTokens = 0

  // Load or create a persistent run record for crash recovery
  const state = await loadOrCreateRun(prepId)
  const { runId } = state

  // Stage 1: Extract concepts (skip if already stored)
  let concepts: Concept[]
  if (state.concepts) {
    concepts = state.concepts
  } else {
    onProgress({ stage: 'concepts' })
    const { output, metrics } = await runConceptExtractor(rawText, apiKey, model, signal)
    totalTokens += metrics.total_tokens
    concepts = output
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
    tasks = buildQuestionTasks(concepts)
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
  const namingPromise = runPrepNamer(concepts, apiKey, model, signal)
    .then(r => {
      prepTitle = r.output.title
      totalTokens += r.metrics.total_tokens
      onTitleReady?.(r.output.title)
    })
    .catch(() => null)

  // Stage 3: Build + review missing question slots in batches.
  // allSettled is used at each phase so a single bad LLM response (schema validation
  // failure, network blip) only kills that slot — the rest of the batch still saves
  // and is skipped on the next run.
  const missingIndices = tasks.map((_, i) => i).filter(i => !builtQuestions.has(i))

  let craftDone = resumedCount
  let reviewDone = resumedCount

  onProgress({ stage: 'crafting', done: craftDone, total: tasks.length })

  for (let b = 0; b < missingIndices.length; b += BATCH_SIZE) {
    if (signal?.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' })

    const batchIndices = missingIndices.slice(b, b + BATCH_SIZE)
    const batchTasks = batchIndices.map(i => tasks[i])

    // Build batch — failures are isolated per slot
    const buildSettled = await Promise.allSettled(
      batchTasks.map(task => BUILDERS[task.type](task, rawText, apiKey, model, signal))
    )
    craftDone += batchTasks.length
    buildSettled.forEach(r => { if (r.status === 'fulfilled') totalTokens += r.value.metrics.total_tokens })
    onProgress({ stage: 'crafting', done: craftDone, total: tasks.length })

    // Review + persist each slot — failures are isolated per slot
    const reviewSettled = await Promise.allSettled(
      buildSettled.map(async (build, j) => {
        if (build.status === 'rejected') throw build.reason

        const taskIdx = batchIndices[j]
        const reviewed = await runQuestionReviewer(
          build.value.output, batchTasks[j].concept, apiKey, model, signal
        )
        totalTokens += reviewed.metrics.total_tokens

        let question: GeneratedQuestion
        if (reviewed.output.question === null) {
          // Retry build once on reviewer rejection
          const retry = await BUILDERS[batchTasks[j].type](batchTasks[j], rawText, apiKey, model, signal)
          totalTokens += retry.metrics.total_tokens
          question = retry.output
        } else {
          question = reviewed.output.question
        }

        // Persist before marking in-memory — if save throws the slot stays null in DB
        await saveQuestionSlot(runId, taskIdx, question)
        builtQuestions.set(taskIdx, question)
        return question
      })
    )
    reviewDone += batchTasks.length
    onProgress({ stage: 'reviewing', done: reviewDone, total: tasks.length })

    reviewSettled.forEach((r, j) => {
      if (r.status === 'rejected') {
        console.warn(`[pipeline] slot ${batchIndices[j]} failed, will retry next run:`, r.reason)
      }
    })
  }

  await namingPromise
  onProgress({ stage: 'done' })

  // Assemble in task order — only slots that completed successfully
  const questions = tasks
    .map((_, i) => builtQuestions.get(i))
    .filter((q): q is GeneratedQuestion => q != null)

  // Only clean up the run record once every slot is filled; partial runs persist
  // so the next generate call can resume from where it left off.
  if (builtQuestions.size === tasks.length) {
    await deleteRun(prepId)
  }

  addTokenUsage(totalTokens)
  return { questions, prepTitle, totalTokens }
}
