import { describe, expect, it } from "vitest"

import { computeCost } from "@/lib/pricing"

describe("computeCost", () => {
  it("prices prompt tokens at the input rate, completion tokens at the output rate", () => {
    const cost = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 0 }, "gpt-5-nano", "flex")
    expect(cost).toBeCloseTo(1.10)
  })

  it("doesn't double-count cached tokens — they're already part of promptTokens", () => {
    const withoutCacheInfo = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 0 }, "gpt-5-nano", "flex")
    const withCacheInfo = computeCost({ promptTokens: 1_000_000, cachedTokens: 400_000, completionTokens: 0 }, "gpt-5-nano", "flex")
    expect(withCacheInfo).toBeCloseTo(withoutCacheInfo)
  })

  it("falls back to gpt-5-nano pricing for an unknown model", () => {
    const known = computeCost({ promptTokens: 1000, cachedTokens: 0, completionTokens: 1000 }, "gpt-5-nano", "flex")
    const unknown = computeCost({ promptTokens: 1000, cachedTokens: 0, completionTokens: 1000 }, "not-a-real-model", "flex")
    expect(unknown).toBe(known)
  })

  it("falls back to flex pricing for an unknown tier", () => {
    const known = computeCost({ promptTokens: 1000, cachedTokens: 0, completionTokens: 1000 }, "gpt-5-nano", "flex")
    const unknown = computeCost({ promptTokens: 1000, cachedTokens: 0, completionTokens: 1000 }, "gpt-5-nano", "not-a-real-tier")
    expect(unknown).toBe(known)
  })

  it("prices the default tier higher than flex for the same model and usage", () => {
    const flex = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 1_000_000 }, "gpt-5-nano", "flex")
    const standard = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 1_000_000 }, "gpt-5-nano", "default")
    expect(standard).toBeGreaterThan(flex)
  })

  it("prices the priority tier higher than the default tier for the same model and usage", () => {
    const standard = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 1_000_000 }, "gpt-5-nano", "default")
    const priority = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 1_000_000 }, "gpt-5-nano", "priority")
    expect(priority).toBeGreaterThan(standard)
  })
})
