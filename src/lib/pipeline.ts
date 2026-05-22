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
    // Prefer concepts that haven't hit the per-concept cap yet
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

    // Replace a task whose concept appears most often (least coverage-critical)
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
  rawText: string
  apiKey: string
  model: string
  signal?: AbortSignal
  onProgress: (event: PipelineProgressEvent) => void
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { rawText, apiKey, model, signal, onProgress } = config
  let totalTokens = 0

  // Stage 1: Extract concepts
  onProgress({ stage: 'concepts' })
  const { output: concepts, metrics: conceptMetrics } = await runConceptExtractor(
    rawText, apiKey, model, signal
  )
  totalTokens += conceptMetrics.total_tokens

  // Build question tasks (deterministic mixer)
  const tasks = buildQuestionTasks(concepts)

  // Start naming in parallel — non-critical, failure is silently ignored
  let prepTitle: string | null = null
  const namingPromise = runPrepNamer(concepts, apiKey, model, signal)
    .then(r => { prepTitle = r.output.title; totalTokens += r.metrics.total_tokens })
    .catch(() => null)

  // Stage 2: Build + review questions in batches
  const questions: GeneratedQuestion[] = []
  let craftDone = 0
  let reviewDone = 0

  onProgress({ stage: 'crafting', done: 0, total: tasks.length })

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' })

    const batch = tasks.slice(i, i + BATCH_SIZE)

    // Build batch in parallel
    const buildResults = await Promise.all(
      batch.map(task => BUILDERS[task.type](task, rawText, apiKey, model, signal))
    )
    craftDone += batch.length
    buildResults.forEach(r => { totalTokens += r.metrics.total_tokens })
    onProgress({ stage: 'crafting', done: craftDone, total: tasks.length })

    // Review batch in parallel
    const reviewedResults = await Promise.all(
      buildResults.map(async (buildResult, j) => {
        const reviewed = await runQuestionReviewer(
          buildResult.output, batch[j].concept, apiKey, model, signal
        )
        totalTokens += reviewed.metrics.total_tokens

        if (reviewed.output.question === null) {
          // Retry build once on rejection
          const retry = await BUILDERS[batch[j].type](batch[j], rawText, apiKey, model, signal)
          totalTokens += retry.metrics.total_tokens
          return retry.output
        }
        return reviewed.output.question
      })
    )
    reviewDone += batch.length
    onProgress({ stage: 'reviewing', done: reviewDone, total: tasks.length })

    questions.push(...reviewedResults)
  }

  await namingPromise
  onProgress({ stage: 'done' })

  addTokenUsage(totalTokens)
  return { questions, prepTitle, totalTokens }
}
