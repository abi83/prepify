export type ServiceTier = "flex" | "default" | "priority"

interface ModelRate {
  input: number
  cachedInput: number
  output: number
}

/**
 * OpenAI Standard ("default" tier) short-context pricing, USD per 1 million tokens.
 * Source: https://developers.openai.com/api/docs/pricing
 * Long-context and cache-write prices are not modelled.
 */
const STANDARD_PRICING: Record<string, ModelRate> = {
  "gpt-5-nano":   { input: 0.05, cachedInput: 0.005, output: 0.40 },
  "gpt-5-mini":   { input: 0.25, cachedInput: 0.025, output: 2.00 },
  // unverified; cachedInput = input, i.e. no cache discount
  "gpt-5":        { input: 30.00, cachedInput: 30.00, output: 120.00 },
  "gpt-6-luna":   { input: 0.10, cachedInput: 0.01, output: 0.50 },
  "gpt-6.1-sol":  { input: 2.00, cachedInput: 0.10, output: 10.00 },
  "gpt-6-astra":  { input: 10.00, cachedInput: 1.00, output: 50.00 },
}

function scale(rates: Record<string, ModelRate>, factor: number): Record<string, ModelRate> {
  return Object.fromEntries(
    Object.entries(rates).map(([ model, rate ]) => [
      model,
      { input: rate.input * factor, cachedInput: rate.cachedInput * factor, output: rate.output * factor },
    ])
  )
}

/** Per-tier pricing relative to standard ("default"): flex is 50%, priority is 200%. */
export const MODEL_PRICING: Record<ServiceTier, Record<string, ModelRate>> = {
  flex: scale(STANDARD_PRICING, 0.5),
  default: STANDARD_PRICING,
  priority: scale(STANDARD_PRICING, 2),
}

function rateFor(model: string, tier: string): ModelRate {
  const tierPricing = MODEL_PRICING[tier as ServiceTier] ?? MODEL_PRICING.flex
  return tierPricing[model] ?? tierPricing["gpt-5-nano"]
}

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
 */
export function computeCost(usage: TokenUsage, model: string, tier: string): number {
  const rate = rateFor(model, tier)
  const uncachedTokens = usage.promptTokens - usage.cachedTokens
  return (uncachedTokens * rate.input + usage.cachedTokens * rate.cachedInput + usage.completionTokens * rate.output) / 1_000_000
}
