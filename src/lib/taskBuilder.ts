/**
 * Pure functions for building the question task list from extracted concepts.
 * No external dependencies — safe to unit-test in isolation.
 */
import type { Concept, QuestionTask } from '../types/pipeline'
import type { QuestionType } from '../types/questions'
import { ALL_QUESTION_TYPES } from './generationConfig'

/** Builds a type pool of exactly `count` items from `enabledTypes`, distributed round-robin. */
export function buildTypePool(count: number, enabledTypes: QuestionType[]): QuestionType[] {
  if (enabledTypes.length === 0) throw new Error('At least one question type must be enabled')
  const base = Math.floor(count / enabledTypes.length)
  const extra = count % enabledTypes.length
  const pool: QuestionType[] = []
  for (let i = 0; i < enabledTypes.length; i++) {
    const n = base + (i < extra ? 1 : 0)
    for (let j = 0; j < n; j++) pool.push(enabledTypes[i])
  }
  return pool
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function weightedPick(concepts: Concept[], exclude?: Set<string>): Concept {
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

/**
 * Assigns one question type to each concept slot:
 * - builds a type pool from config (or defaults: 10 questions, all types)
 * - spreads load across concepts weighted by importance
 * - guarantees each of the top-5 concepts appears at least once
 */
export function buildQuestionTasks(
  concepts: Concept[],
  config?: { questionCount: number; enabledTypes: QuestionType[] },
): QuestionTask[] {
  if (concepts.length === 0) throw new Error('No concepts to build tasks from')

  const count = config?.questionCount ?? 10
  const enabledTypes = config?.enabledTypes ?? ALL_QUESTION_TYPES

  const sorted = [...concepts].sort((a, b) => b.importance - a.importance)
  const types = shuffle(buildTypePool(count, enabledTypes))

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
