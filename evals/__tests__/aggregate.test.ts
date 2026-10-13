import { describe, expect, it } from "vitest"

import { computeStats, summarizeCell } from "@evals/aggregate"

import { makeSample } from "./fixtures"

describe("computeStats", () => {
  it("handles a single value", () => {
    expect(computeStats([ 5 ])).toEqual({ mean: 5, median: 5, p95: 5 })
  })

  it("median of an odd count is the middle value, of an even count the mean of the middle two", () => {
    expect(computeStats([ 3, 1, 2 ]).median).toBe(2)
    expect(computeStats([ 4, 1, 3, 2 ]).median).toBe(2.5)
  })

  it("p95 is nearest-rank: ceil(0.95·n)-th smallest", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1)
    expect(computeStats(twenty).p95).toBe(19)
    expect(computeStats([ ...twenty, 21 ]).p95).toBe(20)
    expect(computeStats([ 1, 2 ]).p95).toBe(2)
  })

  it("does not mutate its input", () => {
    const values = [ 3, 1, 2 ]
    computeStats(values)
    expect(values).toEqual([ 3, 1, 2 ])
  })

  it("throws on zero values", () => {
    expect(() => computeStats([])).toThrow(/zero values/)
  })
})

describe("summarizeCell", () => {
  it("aggregates the score and every meta metric", () => {
    const rows = [ 1, 2, 3 ].map(n => ({ score: n / 4, meta: makeSample(n).meta }))
    const summary = summarizeCell(rows)
    expect(summary.sampleCount).toBe(3)
    expect(summary.score).toEqual({ mean: 0.5, median: 0.5, p95: 0.75 })
    expect(summary.latencyMs.median).toBe(2000)
    expect(summary.promptTokens.mean).toBe(200)
    expect(summary.completionTokens.p95).toBe(30)
    expect(summary.totalTokens.median).toBe(220)
    expect(summary.costUsd.p95).toBeCloseTo(0.003)
  })

  it("throws on zero samples", () => {
    expect(() => summarizeCell([])).toThrow(/zero samples/)
  })
})
