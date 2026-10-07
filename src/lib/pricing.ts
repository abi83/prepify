export type ServiceTier = "flex" | "default" | "priority"

interface ModelRate {
  input: number
  output: number
}

/**
 * OpenAI Flex-tier pricing (USD per 1 million tokens).
 * Source: https://developers.openai.com/api/docs/pricing?latest-pricing=flex
 */
const FLEX_PRICING: Record<string, ModelRate> = {
  "gpt-5-nano":  { input: 1.10, output: 4.40 },
  "gpt-5-mini":  { input: 1.10, output: 4.40 },
  "gpt-5":       { input: 15.00, output: 60.00 },
}

function scale(rates: Record<string, ModelRate>, factor: number): Record<string, ModelRate> {
  return Object.fromEntries(
    Object.entries(rates).map(([ model, rate ]) => [ model, { input: rate.input * factor, output: rate.output * factor } ])
  )
}

/**
 * Per-tier pricing, derived from OpenAI's published flex/priority discount relative to
 * standard ("default") pricing: flex is ~50% of default, priority is ~200% of default.
 */
export const MODEL_PRICING: Record<ServiceTier, Record<string, ModelRate>> = {
  flex: FLEX_PRICING,
  default: scale(FLEX_PRICING, 2),
  priority: scale(FLEX_PRICING, 4),
}

/** Returns estimated USD cost for the given token counts, model, and service tier. */
export function estimateCost(inputTokens: number, outputTokens: number, model: string, tier: string): number {
  const tierPricing = MODEL_PRICING[tier as ServiceTier] ?? MODEL_PRICING.flex
  const pricing = tierPricing[model] ?? tierPricing["gpt-5-nano"]
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
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
 * `promptTokens` is OpenAI's cache-inclusive input total — `cachedTokens` is a subset of
 * it, not additional to it. There's no separate (cheaper) cached rate available per model
 * yet, so cached tokens are billed at the standard input rate, already covered by promptTokens.
 */
export function computeCost(usage: TokenUsage, model: string, tier: string): number {
  return estimateCost(usage.promptTokens, usage.completionTokens, model, tier)
}
