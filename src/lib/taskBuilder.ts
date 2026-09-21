/**
 * Pure functions for building the question task list from extracted concepts.
 * No external dependencies — safe to unit-test in isolation.
 */
import type { DifficultyMix } from "./generationConfig"
import type { Concept, QuestionTask } from "../types/pipeline"
import type { Difficulty, QuestionType } from "../types/questions"

const DIFFICULTIES: Difficulty[] = [ "easy", "medium", "hard" ]

/** How many concepts a task of each tier may cover. */
const CONCEPTS_PER_TIER: Record<Difficulty, number[]> = {
  easy: [ 1, 2 ],
  medium: [ 2 ],
  hard: [ 2, 3 ],
}

/** Builds a type pool of exactly `count` items from `enabledTypes`, distributed round-robin. */
export function buildTypePool(count: number, enabledTypes: QuestionType[]): QuestionType[] {
  if (enabledTypes.length === 0) throw new Error("At least one question type must be enabled")
  const base = Math.floor(count / enabledTypes.length)
  const extra = count % enabledTypes.length
  const pool: QuestionType[] = []
  for (let i = 0; i < enabledTypes.length; i++) {
    const n = base + (i < extra ? 1 : 0)
    for (let j = 0; j < n; j++) pool.push(enabledTypes[i])
  }
  return pool
}

/**
 * Builds a difficulty pool of exactly `count` items, split by `mix` weights
 * (largest-remainder rounding, so the total is always `count`).
 */
export function buildDifficultyPool(count: number, mix: DifficultyMix): Difficulty[] {
  const weights = DIFFICULTIES.map(d => mix[d])
  if (weights.some(w => !Number.isFinite(w) || w < 0)) throw new Error("Difficulty weights must be non-negative numbers")
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total === 0) throw new Error("At least one difficulty weight must be positive")

  const exact = weights.map(w => (w / total) * count)
  const counts = exact.map(Math.floor)
  const byRemainder = exact
    .map((x, i) => ({ i, rem: x - counts[i] }))
    .sort((a, b) => b.rem - a.rem)
  const leftover = count - counts.reduce((sum, n) => sum + n, 0)
  for (let k = 0; k < leftover; k++) counts[byRemainder[k].i]++

  return DIFFICULTIES.flatMap((d, i) => Array<Difficulty>(counts[i]).fill(d))
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [ ...arr ]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ a[i], a[j] ] = [ a[j], a[i] ]
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
 * Assigns one question type, one difficulty and 1–3 concepts to each task slot:
 * - builds a type pool and a difficulty pool from config
 * - concept count comes from the difficulty tier (easy 1–2, medium 2, hard 2–3),
 *   capped by the number of available concepts
 * - spreads load across concepts weighted by importance
 * - guarantees each of the top-5 concepts appears at least once
 */
export function buildQuestionTasks(
  concepts: Concept[],
  config: { questionCount: number; enabledTypes: QuestionType[]; difficultyMix: DifficultyMix },
): QuestionTask[] {
  if (concepts.length === 0) throw new Error("No concepts to build tasks from")

  const { questionCount: count, enabledTypes, difficultyMix } = config

  const sorted = [ ...concepts ].sort((a, b) => b.importance - a.importance)
  const types = shuffle(buildTypePool(count, enabledTypes))

  const difficulties = shuffle(buildDifficultyPool(count, difficultyMix))

  const tasks: QuestionTask[] = []
  const conceptCounts = new Map<string, number>()
  const MAX_PER_CONCEPT = Math.max(2, Math.ceil(count / Math.min(sorted.length, 5)))

  for (let i = 0; i < types.length; i++) {
    const type = types[i]
    const difficulty = difficulties[i]
    const sizes = CONCEPTS_PER_TIER[difficulty].filter(n => n <= sorted.length)
    const size = sizes.length > 0 ? sizes[Math.floor(Math.random() * sizes.length)] : 1

    const slotConcepts: Concept[] = []
    const slotExclude = new Set<string>()

    for (let s = 0; s < size; s++) {
      const capped = new Set(
        [ ...conceptCounts.entries() ]
          .filter(([ , n ]) => n >= MAX_PER_CONCEPT)
          .map(([ name ]) => name)
      )
      const exclude = new Set([ ...capped, ...slotExclude ])
      const concept = weightedPick(sorted, exclude)
      slotConcepts.push(concept)
      slotExclude.add(concept.name)
      conceptCounts.set(concept.name, (conceptCounts.get(concept.name) ?? 0) + 1)
    }

    tasks.push({ concepts: slotConcepts, type, difficulty })
  }

  // Coverage pass: ensure top-5 concepts each appear at least once
  const topN = Math.min(sorted.length, 5)
  for (let i = 0; i < topN; i++) {
    const top = sorted[i]
    if (tasks.some(t => t.concepts.some(c => c.name === top.name))) continue

    const counts = new Map<string, number>()
    tasks.forEach(t => t.concepts.forEach(c => counts.set(c.name, (counts.get(c.name) ?? 0) + 1)))

    let replaceIdx = -1
    let maxCount = 0
    tasks.forEach((t, idx) => {
      const c = counts.get(t.concepts[0].name) ?? 0
      if (c > maxCount || (c === maxCount && t.concepts[0].importance < (tasks[replaceIdx]?.concepts[0].importance ?? 1))) {
        maxCount = c
        replaceIdx = idx
      }
    })

    if (replaceIdx >= 0) {
      // Swap only the lead concept so the tier's concept count is preserved
      const replaced = tasks[replaceIdx]
      tasks[replaceIdx] = { ...replaced, concepts: [ top, ...replaced.concepts.slice(1) ] }
    }
  }

  return tasks
}
