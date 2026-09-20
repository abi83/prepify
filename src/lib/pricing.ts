/**
 * OpenAI Flex-tier pricing (USD per 1 million tokens).
 * Source: https://developers.openai.com/api/docs/pricing?latest-pricing=flex
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5-nano":  { input: 1.10, output: 4.40 },
  "gpt-5-mini":  { input: 1.10, output: 4.40 },
  "gpt-5":       { input: 15.00, output: 60.00 },
}

/** Returns estimated USD cost for the given token counts and model. */
export function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["gpt-5-nano"]
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
export function computeCost(usage: TokenUsage, model: string): number {
  return estimateCost(usage.promptTokens, usage.completionTokens, model)
}
