import path from "path"

import { beforeAll, describe, expect, it } from "vitest"

import { readModelCatalog } from "@/lib/modelCatalogFile"
import { computeCost } from "@/lib/pricing"
import type { ModelCatalog } from "@/types/modelCatalog"

let catalog: ModelCatalog

beforeAll(async () => {
  catalog = await readModelCatalog(path.join(process.cwd(), "config", "models.yml"))
})

const usage = (promptTokens: number, completionTokens: number, cachedTokens = 0) => ({ promptTokens, cachedTokens, completionTokens })

describe("computeCost", () => {
  it("prices prompt tokens at the input rate, completion tokens at the output rate", () => {
    expect(computeCost(catalog, usage(1_000_000, 0), "gpt-5-nano", "flex")).toBeCloseTo(0.025)
  })

  it("bills cached tokens at the cached rate, the rest of promptTokens at the input rate", () => {
    expect(computeCost(catalog, usage(1_000_000, 0, 400_000), "gpt-5-nano", "default")).toBeCloseTo(0.6 * 0.05 + 0.4 * 0.005)
  })

  it("throws for a model that is not in the catalog", () => {
    expect(() => computeCost(catalog, usage(1000, 1000), "not-a-real-model", "flex")).toThrow(/not-a-real-model.*not in the model catalog/)
  })

  it("throws for a tier the model's provider does not have", () => {
    expect(() => computeCost(catalog, usage(1000, 1000), "gpt-5-nano", "not-a-real-tier")).toThrow(/not-a-real-tier.*not available/)
  })

  it("costs 0 for a local model priced at 0", () => {
    expect(computeCost(catalog, usage(1_000_000, 1_000_000, 500_000), "google/gemma-4-26b-a4b", "default")).toBe(0)
  })

  it("prices the default tier higher than flex, and priority higher than default", () => {
    const [ flex, standard, priority ] = [ "flex", "default", "priority" ].map(tier => computeCost(catalog, usage(1_000_000, 1_000_000), "gpt-5-nano", tier))
    expect(standard).toBeGreaterThan(flex)
    expect(priority).toBeGreaterThan(standard)
  })

  it("prices gpt-6-luna at $0.10/$0.50 per 1M tokens on the default tier", () => {
    expect(computeCost(catalog, usage(2_000_000, 1_000_000), "gpt-6-luna", "default")).toBeCloseTo(0.70)
  })

  it("prices gpt-6-luna at $0.05/$0.25 per 1M tokens on the flex tier", () => {
    expect(computeCost(catalog, usage(2_000_000, 1_000_000), "gpt-6-luna", "flex")).toBeCloseTo(0.35)
  })

  it("prices gpt-5-mini default-tier usage at $0.0343", () => {
    expect(computeCost(catalog, usage(24174, 14112), "gpt-5-mini", "default")).toBeCloseTo(34267.5 / 1e6, 10)
  })

  it.each([
    [ "gpt-5-nano", 0.05, 0.40 ],
    [ "gpt-5-mini", 0.25, 2.00 ],
    [ "gpt-6-luna", 0.10, 0.50 ],
    [ "gpt-6.1-sol", 2.00, 10.00 ],
    [ "gpt-5.4-nano", 0.20, 1.25 ],
    [ "gpt-5.4-mini", 0.75, 4.50 ],
  ])("prices %s at standard $%d/$%d per 1M on default, half on flex, double on priority", (model, input, output) => {
    const tokens = usage(1_000_000, 1_000_000)
    expect(computeCost(catalog, tokens, model, "default")).toBeCloseTo(input + output, 10)
    expect(computeCost(catalog, tokens, model, "flex")).toBeCloseTo((input + output) / 2, 10)
    expect(computeCost(catalog, tokens, model, "priority")).toBeCloseTo((input + output) * 2, 10)
  })
})
