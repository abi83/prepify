import { describe, expect, it } from "vitest"

import { computeCost } from "@/lib/pricing"

describe("computeCost", () => {
  it("prices prompt tokens at the input rate, completion tokens at the output rate", () => {
    const cost = computeCost({ promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 0 }, "gpt-5-nano", "flex")
    expect(cost).toBeCloseTo(0.025)
  })

  it("bills cached tokens at the cached rate, the rest of promptTokens at the input rate", () => {
    const cost = computeCost({ promptTokens: 1_000_000, cachedTokens: 400_000, completionTokens: 0 }, "gpt-5-nano", "default")
    expect(cost).toBeCloseTo(0.6 * 0.05 + 0.4 * 0.005)
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

  it("prices gpt-6-luna at $0.10/$0.50 per 1M tokens on the default tier", () => {
    const cost = computeCost({ promptTokens: 2_000_000, cachedTokens: 0, completionTokens: 1_000_000 }, "gpt-6-luna", "default")
    expect(cost).toBeCloseTo(0.70)
  })

  it("prices gpt-6-luna at $0.05/$0.25 per 1M tokens on the flex tier", () => {
    const cost = computeCost({ promptTokens: 2_000_000, cachedTokens: 0, completionTokens: 1_000_000 }, "gpt-6-luna", "flex")
    expect(cost).toBeCloseTo(0.35)
  })

  it("prices gpt-5-mini default-tier usage at $0.0343", () => {
    const cost = computeCost({ promptTokens: 24174, cachedTokens: 0, completionTokens: 14112 }, "gpt-5-mini", "default")
    expect(cost).toBeCloseTo(34267.5 / 1e6, 10)
  })

  it.each([
    [ "gpt-5-nano", 0.05, 0.40 ],
    [ "gpt-5-mini", 0.25, 2.00 ],
    [ "gpt-6-luna", 0.10, 0.50 ],
    [ "gpt-6.1-sol", 2.00, 10.00 ],
    [ "gpt-6-astra", 10.00, 50.00 ],
  ])("prices %s at standard $%d/$%d per 1M on default, half on flex, double on priority", (model, input, output) => {
    const usage = { promptTokens: 1_000_000, cachedTokens: 0, completionTokens: 1_000_000 }
    expect(computeCost(usage, model, "default")).toBeCloseTo(input + output, 10)
    expect(computeCost(usage, model, "flex")).toBeCloseTo((input + output) / 2, 10)
    expect(computeCost(usage, model, "priority")).toBeCloseTo((input + output) * 2, 10)
  })

  it("keeps gpt-5 default-tier pricing at $30/$120 per 1M", () => {
    const cost = computeCost({ promptTokens: 1_000_000, cachedTokens: 500_000, completionTokens: 1_000_000 }, "gpt-5", "default")
    expect(cost).toBeCloseTo(150)
  })
})
