import { z } from "zod"

import type { CatalogModel, CatalogTier, ModelCatalog, ModelRate } from "@/types/modelCatalog"

const price = z.number().nonnegative()

const modelSchema = z.strictObject({ label: z.string().min(1), input: price, cachedInput: price, output: price })
const tierSchema = z.strictObject({ label: z.string().min(1), multiplier: z.number().positive() })

const providerSchema = z.strictObject({
  tiers: z.record(z.string().min(1), tierSchema).refine(tiers => Object.keys(tiers).length > 0, "tiers must not be empty").optional(),
  models: z.record(z.string().min(1), modelSchema).refine(models => Object.keys(models).length > 0, "models must not be empty"),
})

const catalogFileSchema = z.record(z.string().min(1), providerSchema).refine(file => Object.keys(file).length > 0, "no providers")

export const TIERLESS_TIERS: Record<string, CatalogTier> = { default: { label: "Standard", multiplier: 1 } }

/** Validates the raw catalog file; throws on unknown keys, bad values or a model id listed under two providers. */
export function parseModelCatalog(raw: unknown): ModelCatalog {
  const file = catalogFileSchema.parse(raw)
  const models: Record<string, CatalogModel> = {}
  for (const [ provider, { tiers = TIERLESS_TIERS, models: providerModels } ] of Object.entries(file)) {
    for (const [ id, model ] of Object.entries(providerModels)) {
      if (id in models) throw new Error(`Model "${id}" is listed under both "${models[id].provider}" and "${provider}"`)
      models[id] = { id, provider, tiers, ...model }
    }
  }
  return { models }
}

export function requireModel(catalog: ModelCatalog, model: string): CatalogModel {
  const entry = catalog.models[model]
  if (!entry) throw new Error(`Model "${model}" is not in the model catalog`)
  return entry
}

/** Per-1M-token rate for the model on the tier; throws for an unlisted model or a tier its provider lacks. */
export function rateFor(catalog: ModelCatalog, model: string, tier: string): ModelRate {
  const entry = requireModel(catalog, model)
  const tierEntry = entry.tiers[tier]
  if (!tierEntry) throw new Error(`Tier "${tier}" is not available for model "${model}" (${entry.provider}: ${Object.keys(entry.tiers).join(", ")})`)
  const { multiplier } = tierEntry
  return { input: entry.input * multiplier, cachedInput: entry.cachedInput * multiplier, output: entry.output * multiplier }
}

/** Models of one provider, in catalog order. */
export function providerModels(catalog: ModelCatalog, provider: string): CatalogModel[] {
  return Object.values(catalog.models).filter(model => model.provider === provider)
}

/** Throws unless the model belongs to the provider and its provider has the tier. */
export function assertModelAndTier(catalog: ModelCatalog, provider: string, model: string, tier: string): void {
  const entry = requireModel(catalog, model)
  if (entry.provider !== provider) throw new Error(`Model "${model}" belongs to "${entry.provider}", not "${provider}"`)
  rateFor(catalog, model, tier)
}
