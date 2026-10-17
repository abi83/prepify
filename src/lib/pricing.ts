import type { ModelCatalog } from "@/types/modelCatalog"

import { rateFor } from "./modelCatalog"

/** Formats a USD cost value for display, e.g. "$0.0023" or "< $0.01". */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00"
  if (usd < 0.001) return "< $0.001"
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

export interface TokenUsage {
  promptTokens: number
  cachedTokens: number
  completionTokens: number
}

/**
 * Cost for a single agent call, from real per-type token counts.
 * `promptTokens` is OpenAI's cache-inclusive input total — `cachedTokens` is a subset of it,
 * billed at the cached rate; the rest at the input rate. Cache-write prices are not modelled.
 * Throws for a model or tier the catalog does not list.
 */
export function computeCost(catalog: ModelCatalog, usage: TokenUsage, model: string, tier: string): number {
  const rate = rateFor(catalog, model, tier)
  const uncachedTokens = usage.promptTokens - usage.cachedTokens
  return (uncachedTokens * rate.input + usage.cachedTokens * rate.cachedInput + usage.completionTokens * rate.output) / 1_000_000
}
