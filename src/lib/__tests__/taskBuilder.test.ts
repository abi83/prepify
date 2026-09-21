import { describe, expect, it } from "vitest"

import type { Concept } from "../../types/pipeline"
import type { Difficulty } from "../../types/questions"
import { buildDifficultyPool, buildQuestionTasks } from "../taskBuilder"

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

describe("buildQuestionTasks difficulty", () => {
  const config = { questionCount: 10, enabledTypes: [ "flashcard" as const, "single_choice" as const ], difficultyMix: MIX }

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
