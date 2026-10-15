import { describe, expect, it } from "vitest"

import { assertModelAndTier, parseModelCatalog, providerModels, rateFor } from "@/lib/modelCatalog"

const model = { label: "M", input: 1, cachedInput: 0.1, output: 4 }

const catalog = parseModelCatalog({
  tiered: { tiers: { flex: { label: "Flex", multiplier: 0.5 }, default: { label: "Standard", multiplier: 1 } }, models: { a: model } },
  tierless: { models: { b: model } },
})

describe("parseModelCatalog", () => {
  it("gives a provider without tiers the single tier `default`", () => {
    expect(Object.keys(catalog.models.b.tiers)).toEqual([ "default" ])
    expect(rateFor(catalog, "b", "default")).toEqual({ input: 1, cachedInput: 0.1, output: 4 })
  })

  it("rejects a model id listed under two providers", () => {
    expect(() => parseModelCatalog({ p1: { models: { a: model } }, p2: { models: { a: model } } })).toThrow(/"a" is listed under both/)
  })

  it.each([
    [ "an unknown key", { p: { models: { a: { ...model, free: true } } } } ],
    [ "a negative price", { p: { models: { a: { ...model, input: -1 } } } } ],
    [ "a provider without models", { p: { models: {} } } ],
    [ "an empty tiers map", { p: { tiers: {}, models: { a: model } } } ],
    [ "a zero multiplier", { p: { tiers: { default: { label: "S", multiplier: 0 } }, models: { a: model } } } ],
    [ "no providers", {} ],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseModelCatalog(raw)).toThrow()
  })
})

describe("rateFor", () => {
  it("scales the base prices by the tier multiplier", () => {
    expect(rateFor(catalog, "a", "flex")).toEqual({ input: 0.5, cachedInput: 0.05, output: 2 })
  })

  it("throws for an unlisted model and for a tier the provider lacks", () => {
    expect(() => rateFor(catalog, "missing", "default")).toThrow(/not in the model catalog/)
    expect(() => rateFor(catalog, "b", "flex")).toThrow(/Tier "flex" is not available for model "b"/)
  })
})

describe("providerModels / assertModelAndTier", () => {
  it("lists one provider's models", () => {
    expect(providerModels(catalog, "tiered").map(m => m.id)).toEqual([ "a" ])
  })

  it("accepts a listed model and tier of the provider", () => {
    expect(() => assertModelAndTier(catalog, "tiered", "a", "flex")).not.toThrow()
  })

  it("throws for another provider's model, an unlisted model or a missing tier", () => {
    expect(() => assertModelAndTier(catalog, "tiered", "b", "default")).toThrow(/belongs to "tierless"/)
    expect(() => assertModelAndTier(catalog, "tiered", "missing", "default")).toThrow(/not in the model catalog/)
    expect(() => assertModelAndTier(catalog, "tiered", "a", "priority")).toThrow(/not available/)
  })
})
