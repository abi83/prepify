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
import {
  loadOrCreateRun,
  saveConcepts,
  saveQuestionTasksAndInitSlots,
  saveQuestionSlot,
  deleteRun,
} from './pipelineStore'

const BATCH_SIZE = 5

// Fixed distribution: 2 of each type, shuffled each run
const QUESTION_TYPE_POOL: QuestionType[] = [
  'flashcard', 'flashcard',
  'single_choice', 'single_choice',
  'multiple_choice', 'multiple_choice',
  'fill_the_gap', 'fill_the_gap',
  'sorting', 'sorting',
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function weightedPick(concepts: Concept[], exclude?: Set<string>): Concept {
  const pool = exclude && exclude.size > 0
    ? concepts.filter(c => !exclude.has(c.name))
    : concepts
  const source = pool.length > 0 ? pool : concepts

  const total = source.reduce((sum, c) => sum + Math.max(c.importance, 0.05), 0)
  let r = Math.random() * total
  for (const c of source) {
    r -= Math.max(c.importance, 0.05)
    if (r <= 0) return c
  }
  return source[source.length - 1]
}

function buildQuestionTasks(concepts: Concept[]): QuestionTask[] {
  if (concepts.length === 0) throw new Error('No concepts to build tasks from')

  const sorted = [...concepts].sort((a, b) => b.importance - a.importance)
  const types = shuffle([...QUESTION_TYPE_POOL])

  const tasks: QuestionTask[] = []
  const conceptCounts = new Map<string, number>()
  const MAX_PER_CONCEPT = Math.max(2, Math.ceil(types.length / Math.min(sorted.length, 5)))

  for (const type of types) {
    const capped = new Set(
      [...conceptCounts.entries()]
        .filter(([, count]) => count >= MAX_PER_CONCEPT)
        .map(([name]) => name)
    )
    const concept = weightedPick(sorted, capped)
    conceptCounts.set(concept.name, (conceptCounts.get(concept.name) ?? 0) + 1)
    tasks.push({ concept, type })
  }

  // Coverage pass: ensure top-5 concepts each appear at least once
  const topN = Math.min(sorted.length, 5)
  for (let i = 0; i < topN; i++) {
    const top = sorted[i]
    if (tasks.some(t => t.concept.name === top.name)) continue

    const counts = new Map<string, number>()
    tasks.forEach(t => counts.set(t.concept.name, (counts.get(t.concept.name) ?? 0) + 1))

    let replaceIdx = -1
    let maxCount = 0
    tasks.forEach((t, idx) => {
      const c = counts.get(t.concept.name) ?? 0
      if (c > maxCount || (c === maxCount && t.concept.importance < (tasks[replaceIdx]?.concept.importance ?? 1))) {
        maxCount = c
        replaceIdx = idx
      }
    })

    if (replaceIdx >= 0) {
      tasks[replaceIdx] = { concept: top, type: tasks[replaceIdx].type }
    }
  }

  return tasks
}

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
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { prepId, rawText, apiKey, model, signal, onProgress } = config
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

  // Start naming in parallel — non-critical, failure is silently ignored
  let prepTitle: string | null = null
  const namingPromise = runPrepNamer(concepts, apiKey, model, signal)
    .then(r => { prepTitle = r.output.title; totalTokens += r.metrics.total_tokens })
    .catch(() => null)

  // Stage 3: Build + review missing question slots in batches
  const missingIndices = tasks.map((_, i) => i).filter(i => !builtQuestions.has(i))

  let craftDone = resumedCount
  let reviewDone = resumedCount

  onProgress({ stage: 'crafting', done: craftDone, total: tasks.length })

  for (let b = 0; b < missingIndices.length; b += BATCH_SIZE) {
    if (signal?.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' })

    const batchIndices = missingIndices.slice(b, b + BATCH_SIZE)
    const batchTasks = batchIndices.map(i => tasks[i])

    // Build batch in parallel
    const buildResults = await Promise.all(
      batchTasks.map(task => BUILDERS[task.type](task, rawText, apiKey, model, signal))
    )
    craftDone += batchTasks.length
    buildResults.forEach(r => { totalTokens += r.metrics.total_tokens })
    onProgress({ stage: 'crafting', done: craftDone, total: tasks.length })

    // Review batch in parallel, persist each result
    const reviewedResults = await Promise.all(
      buildResults.map(async (buildResult, j) => {
        const taskIdx = batchIndices[j]
        const reviewed = await runQuestionReviewer(
          buildResult.output, batchTasks[j].concept, apiKey, model, signal
        )
        totalTokens += reviewed.metrics.total_tokens

        let question: GeneratedQuestion
        if (reviewed.output.question === null) {
          // Retry build once on rejection
          const retry = await BUILDERS[batchTasks[j].type](batchTasks[j], rawText, apiKey, model, signal)
          totalTokens += retry.metrics.total_tokens
          question = retry.output
        } else {
          question = reviewed.output.question
        }

        await saveQuestionSlot(runId, taskIdx, question)
        return question
      })
    )
    reviewDone += batchTasks.length
    onProgress({ stage: 'reviewing', done: reviewDone, total: tasks.length })

    reviewedResults.forEach((q, j) => builtQuestions.set(batchIndices[j], q))
  }

  await namingPromise
  onProgress({ stage: 'done' })

  // Assemble questions in original task order
  const questions = tasks.map((_, i) => builtQuestions.get(i)!)

  // Clean up pipeline state now that questions will be persisted to the questions table
  await deleteRun(prepId)

  addTokenUsage(totalTokens)
  return { questions, prepTitle, totalTokens }
}
