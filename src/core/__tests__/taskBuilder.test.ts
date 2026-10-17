import { describe, expect, it } from "vitest"

import { buildDifficultyPool, buildFlashcardTasks, buildQuestionTasks, buildTypePool } from "@/core/lib/taskBuilder"
import type { Concept } from "@/types/pipeline"
import type { Difficulty, QuizType } from "@/types/questions"

const MIX = { easy: 3, medium: 4, hard: 3 }

function concepts(n: number): Concept[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Concept ${i}`,
    description: "x".repeat(40),
    importance: 1 - i / (n + 1),
    misconceptions: [],
  }))
}

function tally(pool: Difficulty[]): Record<Difficulty, number> {
  return { easy: pool.filter(d => d === "easy").length, medium: pool.filter(d => d === "medium").length, hard: pool.filter(d => d === "hard").length }
}

describe("buildDifficultyPool", () => {
  it("splits by weight", () => {
    expect(tally(buildDifficultyPool(10, MIX))).toEqual({ easy: 3, medium: 4, hard: 3 })
  })

  it("always returns exactly `count` items, even when weights don't divide evenly", () => {
    for (const count of [ 5, 7, 11, 13, 20 ]) {
      expect(buildDifficultyPool(count, MIX)).toHaveLength(count)
    }
  })

  it("omits a tier with zero weight", () => {
    expect(tally(buildDifficultyPool(8, { easy: 1, medium: 1, hard: 0 })).hard).toBe(0)
  })

  it("throws on negative, non-finite, or all-zero weights", () => {
    expect(() => buildDifficultyPool(10, { easy: -1, medium: 1, hard: 1 })).toThrow()
    expect(() => buildDifficultyPool(10, { easy: NaN, medium: 1, hard: 1 })).toThrow()
    expect(() => buildDifficultyPool(10, { easy: 0, medium: 0, hard: 0 })).toThrow()
  })
})

const occurrences = <T extends string>(pool: T[]) => pool.reduce((acc, item) => ({ ...acc, [item]: (acc[item] ?? 0) + 1 }), {} as Partial<Record<T, number>>)

describe("buildTypePool", () => {
  const TYPES: QuizType[] = [ "single_choice", "multiple_choice", "fill_the_gap", "sorting" ]

  it("gives every type its exact floor share", () => {
    expect(occurrences(buildTypePool(8, TYPES))).toEqual({ single_choice: 2, multiple_choice: 2, fill_the_gap: 2, sorting: 2 })
  })

  it("returns exactly `count` items, with each extra on a distinct type", () => {
    for (const count of [ 1, 2, 3, 5, 6, 7 ]) {
      const pool = buildTypePool(count, TYPES)
      expect(pool).toHaveLength(count)
      const floor = Math.floor(count / TYPES.length)
      for (const type of TYPES) expect([ floor, floor + 1 ]).toContain(occurrences(pool)[type] ?? 0)
    }
  })

  it("is unbiased for count = 1: every enabled type gets drawn", () => {
    const draws = 4000
    const seen = occurrences(Array.from({ length: draws }, () => buildTypePool(1, TYPES)[0]))
    for (const type of TYPES) expect((seen[type] ?? 0) / draws).toBeGreaterThan(0.2)
  })

  it("throws without enabled types", () => {
    expect(() => buildTypePool(3, [])).toThrow()
  })
})

describe("buildDifficultyPool remainders", () => {
  it("draws the leftover slot with probability proportional to its remainder", () => {
    // Exact shares for count 1: easy .3, medium .4, hard .3.
    expect(buildDifficultyPool(1, MIX, () => 0)).toEqual([ "easy" ])
    expect(buildDifficultyPool(1, MIX, () => 0.35)).toEqual([ "medium" ])
    expect(buildDifficultyPool(1, MIX, () => 0.99)).toEqual([ "hard" ])
  })

  it("does not always pick the highest-weight tier for count = 1", () => {
    const draws = 4000
    const seen = tally(Array.from({ length: draws }, () => buildDifficultyPool(1, MIX)[0]))
    expect(seen.easy / draws).toBeCloseTo(0.3, 1)
    expect(seen.medium / draws).toBeCloseTo(0.4, 1)
    expect(seen.hard / draws).toBeCloseTo(0.3, 1)
  })

  it("keeps floors exact and adds at most one extra per tier", () => {
    for (let run = 0; run < 100; run++) {
      const counts = tally(buildDifficultyPool(7, { easy: 1, medium: 1, hard: 1 }))
      expect(counts.easy + counts.medium + counts.hard).toBe(7)
      for (const n of [ counts.easy, counts.medium, counts.hard ]) expect([ 2, 3 ]).toContain(n)
    }
  })

  it("never draws a zero-weight tier", () => {
    for (let run = 0; run < 100; run++) {
      expect(tally(buildDifficultyPool(3, { easy: 1, medium: 1, hard: 0 })).hard).toBe(0)
    }
  })
})

describe("buildQuestionTasks difficulty", () => {
  const config = { questionCount: 10, enabledTypes: [ "sorting" as const, "single_choice" as const ], difficultyMix: MIX }

  it("assigns the requested difficulty distribution", () => {
    const tasks = buildQuestionTasks(concepts(8), config)
    expect(tally(tasks.map(t => t.difficulty))).toEqual({ easy: 3, medium: 4, hard: 3 })
  })

  it("keeps each tier's concept count within its range, across the coverage pass", () => {
    const ranges = { easy: [ 1, 2 ], medium: [ 2, 2 ], hard: [ 2, 3 ] }
    for (let run = 0; run < 50; run++) {
      for (const t of buildQuestionTasks(concepts(8), config)) {
        const [ min, max ] = ranges[t.difficulty]
        expect(t.concepts.length).toBeGreaterThanOrEqual(min)
        expect(t.concepts.length).toBeLessThanOrEqual(max)
      }
    }
  })

  it("caps concept count at the number of available concepts", () => {
    for (const t of buildQuestionTasks(concepts(2), config)) expect(t.concepts.length).toBeLessThanOrEqual(2)
  })

  it("falls back to a single concept when only one exists", () => {
    for (const t of buildQuestionTasks(concepts(1), config)) expect(t.concepts).toHaveLength(1)
  })
})

describe("buildFlashcardTasks", () => {
  it("builds exactly flashcardCount flashcard tasks", () => {
    const tasks = buildFlashcardTasks(concepts(8), { flashcardCount: 7, difficultyMix: MIX })
    expect(tasks).toHaveLength(7)
    expect(tasks.every(t => t.type === "flashcard")).toBe(true)
  })

  it("builds none for a count of 0", () => {
    expect(buildFlashcardTasks(concepts(8), { flashcardCount: 0, difficultyMix: MIX })).toEqual([])
  })
})
