import { describe, expect, it } from "vitest"

import { computeCost } from "../pricing"

describe("computeCost", () => {
  it("prices prompt tokens at the input rate, completion tokens at the output rate", () => {
    const cost = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 0 }, "gpt-5-nano")
    expect(cost).toBeCloseTo(1.10)
  })

  it("doesn't double-count cached tokens — they're already part of promptTokens", () => {
    const withoutCacheInfo = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 0 }, "gpt-5-nano")
    const withCacheInfo = computeCost({ promptTokens: 1_000_000, cachedTokens: 400_000, completionTokens: 0 }, "gpt-5-nano")
    expect(withCacheInfo).toBeCloseTo(withoutCacheInfo)
  })

  it("falls back to gpt-5-nano pricing for an unknown model", () => {
    const known = computeCost({ promptTokens: 1000, cachedTokens: 0, completionTokens: 1000 }, "gpt-5-nano")
    const unknown = computeCost({ promptTokens: 1000, cachedTokens: 0, completionTokens: 1000 }, "not-a-real-model")
    expect(unknown).toBe(known)
  })
})
